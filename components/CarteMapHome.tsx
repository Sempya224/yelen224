'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet'

export type Institution = {
  id: string
  name: string
  ville?: string | null
  quartier?: string | null
  adresse?: string | null
  latitude?: number | null
  longitude?: number | null
  phone?: string | null
  logo?: string | null
  moyenne_avis?: number | null
  nb_avis?: number | null
  badge_verifie?: boolean | null
  category?: string | null
  disponibilites?: unknown
}

// Format horaires attendu par ce composant — objets {jour, ouvert, debut,
// fin} par jour de semaine. ⚠️ Différent du format réellement écrit par
// l'écran Disponibilités institution (lib/disponibilites.ts::generateSlots,
// tableau de créneaux "Lun 09:00") : ce composant ne matchera donc jamais
// de vraies données tant que cet écart n'est pas résolu (hors périmètre de
// ce lot — typage fidèle au comportement actuel, pas de correction
// silencieuse d'un désaccord de format entre écrans).
type HoraireJour = { jour?: string; ouvert?: boolean; debut?: string; fin?: string; heures?: string };

// ── Catégories ────────────────────────────────────────────────────────────────
const CAT: Record<string, { color: string; label: string; svgPath: string }> = {
  "Hopital / Clinique":      { color: "#ef4444", label: "Santé",     svgPath: "M12 5v14M5 12h14" },
  "Ecole / Universite":      { color: "#3b82f6", label: "Éducation", svgPath: "M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6" },
  "Mairie / Administration": { color: "#F5A623", label: "Admin",     svgPath: "M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6" },
  "Banque / Microfinance":   { color: "#22c55e", label: "Banque",    svgPath: "M3 21h18M3 7h18M3 3h18v4H3zM9 11v10M15 11v10" },
  "Pharmacie":               { color: "#a855f7", label: "Pharmacie", svgPath: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" },
  "Cabinet medical":         { color: "#f97316", label: "Médecin",   svgPath: "M22 12h-4l-3 9L9 3l-3 9H2" },
  "Tribunal / Justice":      { color: "#f43f5e", label: "Justice",   svgPath: "M12 3v18M3 9h18M3 15h18" },
  "Transport / Logistique":  { color: "#06b6d4", label: "Transport", svgPath: "M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3" },
  "ONG / Association":       { color: "#14b8a6", label: "ONG",       svgPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
}
const DEFAULT_CAT = { color: "#8b5cf6", label: "Autre", svgPath: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }
function getCat(cat?: string | null) { return CAT[cat || ""] || DEFAULT_CAT }

// ── Ouvert / Fermé ────────────────────────────────────────────────────────────
function getStatus(disponibilites: unknown): { ouvert: boolean | null; horaire: string; prochaine: string } {
  try {
    const dispo: unknown = typeof disponibilites === "string" ? JSON.parse(disponibilites) : disponibilites
    if (!Array.isArray(dispo)) return { ouvert: null, horaire: "", prochaine: "" }
    const jours = dispo as HoraireJour[]
    const JOURS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"]
    const now = new Date()
    const jourNom = JOURS[now.getDay()]
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const h = jours.find((d) => d.jour?.toLowerCase() === jourNom.toLowerCase())
    if (!h) return { ouvert: null, horaire: "", prochaine: "" }
    if (h.ouvert === false) {
      for (let i = 1; i <= 7; i++) {
        const next = jours.find((d) => d.jour?.toLowerCase() === JOURS[(now.getDay() + i) % 7].toLowerCase())
        if (next && next.ouvert !== false && next.debut) {
          return { ouvert: false, horaire: "Fermé", prochaine: `Ouvre ${JOURS[(now.getDay() + i) % 7]} ${next.debut}` }
        }
      }
      return { ouvert: false, horaire: "Fermé", prochaine: "" }
    }
    if (h.debut && h.fin) {
      const [dh, dm] = h.debut.split(":").map(Number)
      const [fh, fm] = h.fin.split(":").map(Number)
      const isOpen = nowMin >= dh * 60 + dm && nowMin <= fh * 60 + fm
      const fermeIn = isOpen ? fh * 60 + fm - nowMin : 0
      const fermeLabel = isOpen && fermeIn <= 60 ? ` · Ferme dans ${fermeIn}min` : ""
      return { ouvert: isOpen, horaire: `${h.debut} – ${h.fin}${fermeLabel}`, prochaine: isOpen ? "" : `Ouvre à ${h.debut}` }
    }
    if (h.heures) return { ouvert: true, horaire: h.heures, prochaine: "" }
  } catch {}
  return { ouvert: null, horaire: "", prochaine: "" }
}

// ── Marker SVG pin ────────────────────────────────────────────────────────────
function markerSVG(color: string, svgPath: string, ouvert: boolean | null, selected: boolean): string {
  const statusDot = ouvert === true
    ? `<circle cx="30" cy="6" r="5.5" fill="#22c55e" stroke="white" stroke-width="2"/>`
    : ouvert === false
    ? `<circle cx="30" cy="6" r="5.5" fill="#ef4444" stroke="white" stroke-width="2"/>`
    : ""
  return `<svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="sh${selected ? "s" : "n"}" x="-40%" y="-20%" width="180%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="${selected ? 5 : 3}" flood-color="rgba(0,0,0,${selected ? 0.45 : 0.3})"/>
      </filter>
    </defs>
    <path d="M18 1C9.163 1 2 8.163 2 17c0 11 16 30 16 30S34 28 34 17C34 8.163 26.837 1 18 1z"
      fill="${color}" filter="url(#sh${selected ? "s" : "n"})" stroke="white" stroke-width="${selected ? 2.5 : 1.5}"/>
    <circle cx="18" cy="17" r="10" fill="white"/>
    <svg x="10" y="9" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="${svgPath}"/>
    </svg>
    ${statusDot}
  </svg>`
}

// ── Label nom visible sur la carte ────────────────────────────────────────────
function labelHTML(name: string, color: string, ouvert: boolean | null, selected: boolean): string {
  const short = name.length > 20 ? name.slice(0, 19) + "…" : name
  const statusColor = ouvert === true ? "#22c55e" : ouvert === false ? "#ef4444" : "#94a3b8"
  const statusText  = ouvert === true ? "Ouvert" : ouvert === false ? "Fermé" : ""
  return `<div style="
    background:white;
    border:2px solid ${color};
    border-radius:10px;
    padding:5px 9px 4px;
    box-shadow:0 3px 14px rgba(0,0,0,${selected ? 0.28 : 0.18});
    white-space:nowrap;
    font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;
    ${selected ? `outline:3px solid ${color}33;` : ""}
  ">
    <div style="font-size:11.5px;font-weight:800;color:#0d0d1a;letter-spacing:-0.2px;line-height:1.2">${short}</div>
    ${statusText ? `<div style="font-size:9px;font-weight:700;color:${statusColor};margin-top:2px;display:flex;align-items:center;gap:3px">
      <span style="width:5px;height:5px;border-radius:50%;background:${statusColor};display:inline-block"></span>
      ${statusText}
    </div>` : ""}
  </div>`
}

// ── Étoiles ───────────────────────────────────────────────────────────────────
function Stars({ note, size = 12 }: { note: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1,2,3,4,5].map(n => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24"
          fill={n <= Math.round(note) ? "#F5A623" : "#e5e7eb"} stroke="none">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  )
}

// ── Logo institution ──────────────────────────────────────────────────────────
function InstLogo({ inst, size = 58 }: { inst: Institution; size?: number }) {
  const [err, setErr] = useState(false)
  const cm = getCat(inst.category)
  const initials = (inst.name || "?").split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase() || "").join("")
  if (inst.logo && !err) {
    return (
      <div style={{ width: size, height: size, position: "relative", borderRadius: "14px", overflow: "hidden", flexShrink: 0, border: `2px solid ${cm.color}30` }}>
        <Image src={inst.logo} alt={inst.name} fill sizes={`${size}px`} onError={() => setErr(true)} style={{ objectFit: "cover" }}/>
      </div>
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "14px", flexShrink: 0, background: `linear-gradient(135deg,${cm.color}22,${cm.color}0d)`, border: `2px solid ${cm.color}35`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px" }}>
      <svg width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24" fill="none" stroke={cm.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={cm.svgPath}/>
      </svg>
      <span style={{ color: cm.color, fontSize: size * 0.18 + "px", fontWeight: "900" }}>{initials || "?"}</span>
    </div>
  )
}

// ── Popup bottom sheet ────────────────────────────────────────────────────────
function InstPopup({ inst, onClose, userPos }: {
  inst: Institution
  onClose: () => void
  userPos: [number, number] | null
}) {
  const cm = getCat(inst.category)
  const { ouvert, horaire, prochaine } = getStatus(inst.disponibilites)
  const [showHoraires, setShowHoraires] = useState(false)

  // Distance
  let distLabel = ""
  if (userPos && inst.latitude && inst.longitude) {
    const R = 6371
    const dLat = ((inst.latitude - userPos[0]) * Math.PI) / 180
    const dLon = ((inst.longitude - userPos[1]) * Math.PI) / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((userPos[0] * Math.PI) / 180) * Math.cos((inst.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    distLabel = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`
  }

  // Itinéraire
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${inst.latitude},${inst.longitude}&travelmode=driving`

  // Horaires semaine
  const JOURS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"]
  const today = JOURS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
  let horairesComplets: { jour: string; label: string; isToday: boolean }[] = []
  try {
    const dispo: unknown = typeof inst.disponibilites === "string" ? JSON.parse(inst.disponibilites) : inst.disponibilites
    if (Array.isArray(dispo)) {
      const jours = dispo as HoraireJour[]
      horairesComplets = JOURS.map(j => {
        const h = jours.find((d) => d.jour?.toLowerCase() === j.toLowerCase())
        if (!h) return { jour: j, label: "—", isToday: j === today }
        if (h.ouvert === false) return { jour: j, label: "Fermé", isToday: j === today }
        if (h.debut && h.fin) return { jour: j, label: `${h.debut} – ${h.fin}`, isToday: j === today }
        if (h.heures) return { jour: j, label: h.heures, isToday: j === today }
        return { jour: j, label: "—", isToday: j === today }
      })
    }
  } catch {}

  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "flex-end",
      background: "rgba(0,0,0,0.42)", backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: "520px", margin: "0 auto",
        background: "#fff", borderRadius: "24px 24px 0 0",
        boxShadow: "0 -12px 50px rgba(0,0,0,0.22)",
        maxHeight: "88vh", overflowY: "auto",
        animation: "panelUp 0.28s cubic-bezier(0.34,1.2,0.64,1)",
      }}>
        <style>{`
          @keyframes panelUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
          .pbtn:active{opacity:0.7;transform:scale(0.97)}
          .pbtn{transition:opacity .1s,transform .1s;-webkit-tap-highlight-color:transparent;cursor:pointer}
          .hrow:hover{background:rgba(245,166,35,0.04)}
        `}</style>

        {/* Barre catégorie */}
        <div style={{ height: "4px", background: `linear-gradient(90deg,${cm.color},${cm.color}44)` }}/>
        {/* Handle */}
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "rgba(0,0,0,0.1)", margin: "10px auto 0" }}/>

        <div style={{ padding: "16px 20px 28px" }}>

          {/* ── Header ── */}
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "16px" }}>
            <InstLogo inst={inst} size={60}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Badges */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "7px" }}>
                <span style={{ background: `${cm.color}15`, color: cm.color, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d={cm.svgPath}/></svg>
                  {cm.label.toUpperCase()}
                </span>
                {inst.badge_verifie && (
                  <span style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    YELEN VÉRIFIÉ
                  </span>
                )}
                {ouvert !== null && (
                  <span style={{ background: ouvert ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: ouvert ? "#22c55e" : "#ef4444", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: ouvert ? "#22c55e" : "#ef4444", display: "inline-block" }}/>
                    {ouvert ? "OUVERT" : "FERMÉ"}
                  </span>
                )}
              </div>
              {/* Nom */}
              <h2 style={{ color: "#0d0d1a", fontSize: "18px", fontWeight: "900", letterSpacing: "-0.4px", lineHeight: 1.15, margin: "0 0 5px" }}>{inst.name}</h2>
              {/* Adresse */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "5px", color: "#6b7280", fontSize: "12px" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{[inst.adresse, inst.quartier, inst.ville].filter(Boolean).join(" · ") || inst.ville || "Guinée"}</span>
              </div>
            </div>
            {/* Fermer */}
            <button onClick={onClose} className="pbtn" style={{ width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#6b7280" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* ── Note + Distance ── */}
          {((inst.moyenne_avis || 0) > 0 || distLabel) && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: "#f9fafb", borderRadius: "12px", marginBottom: "14px" }}>
              {(inst.moyenne_avis || 0) > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <span style={{ color: "#F5A623", fontSize: "18px", fontWeight: "900", lineHeight: 1 }}>{(inst.moyenne_avis || 0).toFixed(1)}</span>
                  <div>
                    <Stars note={inst.moyenne_avis || 0} size={12}/>
                    <div style={{ color: "#9ca3af", fontSize: "10px", marginTop: "1px" }}>{inst.nb_avis || 0} avis</div>
                  </div>
                </div>
              )}
              {(inst.moyenne_avis || 0) > 0 && distLabel && <div style={{ width: "1px", height: "32px", background: "#e5e7eb" }}/>}
              {distLabel && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <div>
                    <div style={{ color: "#0d0d1a", fontSize: "14px", fontWeight: "800" }}>{distLabel}</div>
                    <div style={{ color: "#9ca3af", fontSize: "10px" }}>de vous</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Horaire du jour (cliquable) ── */}
          {horaire && (
            <button onClick={() => setShowHoraires(h => !h)} className="pbtn" style={{
              width: "100%", textAlign: "left", padding: "11px 14px",
              background: ouvert ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
              border: `1px solid ${ouvert ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
              borderRadius: "12px", marginBottom: "12px",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ouvert ? "#22c55e" : "#ef4444"} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <div style={{ flex: 1 }}>
                <div style={{ color: ouvert ? "#22c55e" : "#ef4444", fontSize: "12px", fontWeight: "800" }}>
                  {ouvert ? "Ouvert" : "Fermé"}
                  <span style={{ color: "#6b7280", fontWeight: "600" }}> · {horaire}</span>
                </div>
                {prochaine && <div style={{ color: "#9ca3af", fontSize: "10px", marginTop: "1px" }}>{prochaine}</div>}
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" style={{ transform: showHoraires ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><path d="m6 9 6 6 6-6"/></svg>
            </button>
          )}

          {/* ── Horaires semaine ── */}
          {showHoraires && horairesComplets.length > 0 && (
            <div style={{ background: "#f9fafb", borderRadius: "12px", overflow: "hidden", marginBottom: "12px", border: "1px solid #f1f5f9" }}>
              {horairesComplets.map((h, i) => (
                <div key={h.jour} className="hrow" style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 14px",
                  borderBottom: i < horairesComplets.length - 1 ? "1px solid #f1f5f9" : "none",
                  background: h.isToday ? "rgba(245,166,35,0.05)" : "transparent",
                }}>
                  <span style={{ fontSize: "12px", fontWeight: h.isToday ? "800" : "600", color: h.isToday ? "#F5A623" : "#374151" }}>
                    {h.jour}
                    {h.isToday && <span style={{ fontSize: "9px", background: "#F5A623", color: "#fff", padding: "1px 5px", borderRadius: "6px", marginLeft: "5px" }}>Auj.</span>}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: h.label === "Fermé" ? "#ef4444" : "#374151" }}>{h.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Téléphone ── */}
          {inst.phone && (
            <a href={`tel:${inst.phone}`} className="pbtn" style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px",
              background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: "12px", textDecoration: "none", marginBottom: "12px",
            }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17v-.08z"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#22c55e", fontSize: "14px", fontWeight: "800" }}>{inst.phone}</div>
                <div style={{ color: "#9ca3af", fontSize: "10px" }}>Appeler maintenant</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </a>
          )}

          {/* ── Itinéraire + Partager ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="pbtn" style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "7px",
              padding: "14px 10px", background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.2)", borderRadius: "14px", textDecoration: "none",
            }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              </div>
              <span style={{ color: "#3b82f6", fontSize: "12px", fontWeight: "700" }}>Itinéraire</span>
            </a>
            <button onClick={() => { try { navigator.share({ title: inst.name, url: `/institution/${inst.id}` }) } catch { window.open(`/institution/${inst.id}`, "_blank") } }} className="pbtn" style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "7px",
              padding: "14px 10px", background: "rgba(139,92,246,0.06)",
              border: "1px solid rgba(139,92,246,0.2)", borderRadius: "14px",
            }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(139,92,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </div>
              <span style={{ color: "#8b5cf6", fontSize: "12px", fontWeight: "700" }}>Partager</span>
            </button>
          </div>

          {/* ── BOUTON RDV ── */}
          <a href={`/rdv/${inst.id}`} className="pbtn" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            width: "100%", padding: "16px",
            background: "linear-gradient(135deg,#F5A623,#D97706)",
            color: "#080812", fontWeight: "900", fontSize: "15px",
            borderRadius: "16px", textDecoration: "none",
            boxShadow: "0 8px 24px rgba(245,166,35,0.35)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Prendre un rendez-vous
          </a>

          {/* Fiche complète */}
          <a href={`/institution/${inst.id}`} className="pbtn" style={{
            display: "block", textAlign: "center", marginTop: "10px", padding: "12px",
            border: "1px solid #e5e7eb", color: "#374151", fontWeight: "600",
            fontSize: "13px", borderRadius: "12px", textDecoration: "none",
          }}>
            Voir la fiche complète
          </a>
        </div>
      </div>
    </div>
  )
}

// ── COMPOSANT PRINCIPAL ───────────────────────────────────────────────────────
export default function CarteMapHome({ institutions = [] }: { institutions?: Institution[] }) {
  const divRef   = useRef<HTMLDivElement>(null)
  const mapRef   = useRef<LeafletMap | null>(null)
  const layerRef = useRef<{ pin: LeafletMarker; label: LeafletMarker; inst: Institution }[]>([])
  const initRef  = useRef(false)

  const [selected, setSelected] = useState<Institution | null>(null)
  const [userPos,  setUserPos]  = useState<[number, number] | null>(null)
  const [filter,   setFilter]   = useState<string | null>(null)
  const [ready,    setReady]    = useState(false)

  // ── Données sécurisées ──────────────────────────────────────────────────────
  const safeInsts = Array.isArray(institutions) ? institutions : []

  // ── Géolocalisation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setUserPos([p.coords.latitude, p.coords.longitude]),
        () => {},
        { timeout: 5000, maximumAge: 60000 }
      )
    }
  }, [])

  const selectInst = useCallback((inst: Institution) => {
    setSelected(inst)
    if (mapRef.current && inst.latitude && inst.longitude) {
      mapRef.current.flyTo([inst.latitude, inst.longitude], Math.max(mapRef.current.getZoom(), 15), { duration: 0.6 })
    }
  }, [])

  // ── Initialisation Leaflet — CSS AVANT tout ─────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !divRef.current || initRef.current) return
    initRef.current = true

    ;(async () => {
      // 1. CSS EN PREMIER — obligatoire avant toute création de marker
      await import("leaflet/dist/leaflet.css")

      // 2. Attendre que le DOM soit prêt
      await new Promise(res => setTimeout(res, 50))

      // 3. Leaflet
      const L = (await import("leaflet")).default

      if (mapRef.current || !divRef.current) return

      const map = L.map(divRef.current, {
        center: [9.537, -13.677],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      })

      // Fond gris neutre SANS aucune couleur sur les routes
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)

      // Noms des rues/lieux par-dessus (labels uniquement)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)

      L.control.zoom({ position: "bottomright" }).addTo(map)
      L.control.attribution({ position: "bottomleft", prefix: "© Yelen224" }).addTo(map)

      mapRef.current = map
      setReady(true)

      // Fit bounds
      const valid = safeInsts.filter(i => i.latitude && i.longitude)
      if (valid.length > 0) {
        const bounds = L.latLngBounds(valid.map(i => [i.latitude as number, i.longitude as number]))
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: false })
      }

      // Créer les markers
      valid.forEach(inst => {
        const cm = getCat(inst.category)
        const { ouvert } = getStatus(inst.disponibilites)

        const pinIcon = L.divIcon({
          html: markerSVG(cm.color, cm.svgPath, ouvert, false),
          className: "",
          iconSize: [36, 48],
          iconAnchor: [18, 48],
        })

        const labelIcon = L.divIcon({
          html: labelHTML(inst.name, cm.color, ouvert, false),
          className: "",
          iconSize: [1, 1],
          iconAnchor: [-20, -4],
        })

        const pin = L.marker([inst.latitude as number, inst.longitude as number], { icon: pinIcon, zIndexOffset: 100 })
          .addTo(map)
          .on("click", () => selectInst(inst))

        const label = L.marker([inst.latitude as number, inst.longitude as number], { icon: labelIcon, interactive: true })
          .addTo(map)
          .on("click", () => selectInst(inst))

        layerRef.current.push({ pin, label, inst })
      })
    })()

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerRef.current = []
        initRef.current = false
        setReady(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Mettre à jour markers quand sélection ou filtre change ──────────────────
  useEffect(() => {
    if (!ready || !mapRef.current || typeof window === "undefined") return
    ;(async () => {
      const L = (await import("leaflet")).default
      layerRef.current.forEach(({ pin, label, inst }) => {
        const cm = getCat(inst.category)
        const { ouvert } = getStatus(inst.disponibilites)
        const isSel = selected?.id === inst.id
        const isFiltered = filter !== null && inst.category !== filter

        pin.setIcon(L.divIcon({
          html: markerSVG(cm.color, cm.svgPath, ouvert, isSel),
          className: "", iconSize: [36, 48], iconAnchor: [18, 48],
        }))
        label.setIcon(L.divIcon({
          html: labelHTML(inst.name, cm.color, ouvert, isSel),
          className: "", iconSize: [1, 1], iconAnchor: [-20, -4],
        }))
        pin.setOpacity(isFiltered ? 0.15 : 1)
        label.setOpacity(isFiltered ? 0.1 : 1)
        if (isSel) pin.setZIndexOffset(1000)
        else pin.setZIndexOffset(100)
      })
    })()
  }, [selected, filter, ready])

  // ── Marker position utilisateur ─────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !userPos || !mapRef.current || typeof window === "undefined") return
    const map = mapRef.current
    ;(async () => {
      const L = (await import("leaflet")).default
      const userIcon = L.divIcon({
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 6px rgba(59,130,246,0.2)"></div>`,
        className: "", iconSize: [18, 18], iconAnchor: [9, 9],
      })
      L.marker(userPos, { icon: userIcon, zIndexOffset: 2000 }).addTo(map)
    })()
  }, [userPos, ready])

  const visibleInsts = filter ? safeInsts.filter(i => i.category === filter) : safeInsts
  const cats = [...new Set(safeInsts.map(i => i.category).filter(Boolean))] as string[]

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>

      {/* Carte Leaflet */}
      <div ref={divRef} style={{ height: "100%", width: "100%" }}/>

      {/* ── Chips filtres ── */}
      <div style={{
        position: "absolute", top: "10px", left: 0, right: 0, zIndex: 500,
        display: "flex", gap: "7px", overflowX: "auto", padding: "0 10px",
        msOverflowStyle: "none", scrollbarWidth: "none",
      }}>
        <button onClick={() => setFilter(null)} style={{
          flexShrink: 0, padding: "7px 14px", borderRadius: "20px", border: "none", cursor: "pointer",
          background: filter === null ? "#F5A623" : "rgba(255,255,255,0.95)",
          color: filter === null ? "#080812" : "#374151",
          fontSize: "12px", fontWeight: "800",
          boxShadow: "0 2px 10px rgba(0,0,0,0.15)", backdropFilter: "blur(8px)",
        }}>
          Tous ({safeInsts.filter(i => i.latitude && i.longitude).length})
        </button>
        {cats.map(cat => {
          const cm = getCat(cat)
          const isActive = filter === cat
          const count = safeInsts.filter(i => i.category === cat && i.latitude && i.longitude).length
          return (
            <button key={cat} onClick={() => setFilter(isActive ? null : cat)} style={{
              flexShrink: 0, padding: "7px 14px", borderRadius: "20px", border: "none", cursor: "pointer",
              background: isActive ? cm.color : "rgba(255,255,255,0.95)",
              color: isActive ? "#fff" : "#374151",
              fontSize: "12px", fontWeight: "700",
              boxShadow: isActive ? `0 4px 14px ${cm.color}50` : "0 2px 10px rgba(0,0,0,0.12)",
              backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isActive ? "#fff" : cm.color} strokeWidth="2.5" strokeLinecap="round"><path d={cm.svgPath}/></svg>
              {cm.label} ({count})
            </button>
          )
        })}
      </div>

      {/* ── Bouton Ma position ── */}
      <button onClick={() => { if (userPos && mapRef.current) mapRef.current.flyTo(userPos, 16, { duration: 0.8 }) }} style={{
        position: "absolute", bottom: "80px", right: "10px", zIndex: 500,
        width: "42px", height: "42px", borderRadius: "50%",
        background: "white", border: "none", cursor: "pointer",
        boxShadow: "0 3px 14px rgba(0,0,0,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={userPos ? "#3b82f6" : "#9ca3af"} strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
      </button>

      {/* ── Compteur ouverts/fermés ── */}
      <div style={{
        position: "absolute", bottom: "80px", left: "10px", zIndex: 500,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)",
        borderRadius: "12px", padding: "8px 12px",
        boxShadow: "0 3px 14px rgba(0,0,0,0.15)",
      }}>
        <div style={{ fontSize: "12px", fontWeight: "800", color: "#0d0d1a", marginBottom: "4px" }}>
          {visibleInsts.filter(i => i.latitude && i.longitude).length} prestataire{visibleInsts.filter(i => i.latitude && i.longitude).length > 1 ? "s" : ""}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "#22c55e", fontWeight: "700" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }}/>
            {visibleInsts.filter(i => getStatus(i.disponibilites).ouvert === true).length} ouverts
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "#ef4444", fontWeight: "700" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }}/>
            {visibleInsts.filter(i => getStatus(i.disponibilites).ouvert === false).length} fermés
          </span>
        </div>
      </div>

      {/* ── Popup institution ── */}
      {selected && (
        <InstPopup inst={selected} onClose={() => setSelected(null)} userPos={userPos}/>
      )}
    </div>
  )
}