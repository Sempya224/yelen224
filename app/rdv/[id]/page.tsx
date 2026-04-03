"use client";
// ═══════════════════════════════════════════════════════════════════════
// YELEN224 — Prise de RDV + Services Payants
// Path : /app/rdv/[id]/page.tsx
//
// ✅ Services payants liés STRICTEMENT à l'institution_id du profil
// ✅ Créneaux gratuits ET services payants clairement distingués
// ✅ Paiement sur place — confirmation via code Yelen 6 chiffres
// ✅ Niveau Stripe/PayPal — UX avancée, mobile first
// ✅ Données réelles Supabase — paid_services + paid_bookings + rdv
// ✅ Sécurité : userId via YELEN224_USER_ID_KEY
// ✅ FIX MAJEUR : "Jeu 08:00", "Lun 09:30"… → résolution automatique
//    vers la prochaine occurrence YYYY-MM-DD correspondante
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRdv } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────
type InstitutionRow = {
  id: string;
  name: string;
  ville: string;
  quartier: string;
  adresse: string;
  phone: string;
  category: string;
  badge_verifie: boolean;
  logo: string | null;
  description: string | null;
  moyenne_avis: number;
  nb_avis: number;
};

type CreneauSlot = {
  key: string;
  label: string;
  dateRdv: string;   // YYYY-MM-DD garanti après résolution
  heureRdv: string;  // HH:MM
};

type PaidService = {
  id: string;
  institution_id: string;
  nom: string;
  prix: number;
  duree_minutes: number;
  description: string | null;
  is_active: boolean;
};

// ─── Résolution "Jeu 08:00" → prochain jeudi YYYY-MM-DD ──────────────
const FR_DAYS: Record<string, number> = {
  lun: 1, lundi: 1,
  mar: 2, mardi: 2,
  mer: 3, mercredi: 3,
  jeu: 4, jeudi: 4,
  ven: 5, vendredi: 5,
  sam: 6, samedi: 6,
  dim: 0, dimanche: 0,
};

/**
 * Étant donné un nom de jour français (ex: "Jeu") et une heure (ex: "08:00"),
 * renvoie la prochaine date YYYY-MM-DD correspondante (aujourd'hui inclus si
 * le créneau est encore à venir, sinon la semaine suivante).
 */
function resolveNextWeekday(dayName: string, heureRdv: string): string {
  const key = dayName.toLowerCase().trim();
  const targetDow = FR_DAYS[key];
  if (targetDow === undefined) return "";

  const now = new Date();
  const [hh, mm] = heureRdv.split(":").map(Number);
  const todayDow = now.getDay(); // 0=dim … 6=sam

  let diffDays = (targetDow - todayDow + 7) % 7;

  // Si c'est aujourd'hui mais l'heure est déjà passée → la semaine prochaine
  if (diffDays === 0) {
    const slotTime = hh * 60 + mm;
    const nowTime  = now.getHours() * 60 + now.getMinutes();
    if (slotTime <= nowTime) diffDays = 7;
  }

  const target = new Date(now);
  target.setDate(now.getDate() + diffDays);
  target.setHours(0, 0, 0, 0);

  const y   = target.getFullYear();
  const mo  = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

// ─── Parsing disponibilités ──────────────────────────────────────────
function institutionDisplayName(row: Record<string, unknown>): string {
  return String(row.name ?? "").trim();
}

function parseDisponibilites(raw: unknown): CreneauSlot[] {
  if (raw === null || raw === undefined) return [];
  let data: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try { data = JSON.parse(t); }
    catch {
      return t.split(/[\n,;]/).map(s => s.trim()).filter(Boolean)
        .map((s, i) => parseStringSlot(s, i)).filter((s): s is CreneauSlot => s !== null);
    }
  }
  if (!Array.isArray(data)) return [];
  const out: CreneauSlot[] = [];
  let idx = 0;
  for (const item of data) {
    if (typeof item === "string") {
      const slot = parseStringSlot(item, idx);
      if (slot) { out.push(slot); idx++; }
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const date  = String(o.date ?? o.date_rdv ?? "").trim();
      const heure = String(o.heure ?? o.heure_rdv ?? "").trim();
      if (date && heure) {
        out.push({ key: `${date}-${heure}-${idx}`, label: `${date} · ${heure}`, dateRdv: date, heureRdv: heure });
        idx++;
      }
    }
  }
  return out;
}

/**
 * parseStringSlot — résout TOUS les formats connus :
 *  • ISO strict         : "2026-04-02T12:30" / "2026-04-02 12:30"
 *  • Date.parse valide  : ex "April 2 2026 08:00"
 *  • Jour FR + heure    : "Jeu 08:00", "Lun 09:30", "Mer 12:00"  ← FIX
 *  • Heure seule        : "08:00"  → date du jour si à venir, sinon demain
 */
function parseStringSlot(s: string, index: number): CreneauSlot | null {
  const t = s.trim();
  if (!t) return null;

  // ── 1. Format ISO strict ──────────────────────────────────────────
  const mIso = /^(\d{4}-\d{2}-\d{2})[T\s]+(\d{2}:\d{2})/.exec(t);
  if (mIso) {
    return { key: `iso-${index}-${t}`, label: t, dateRdv: mIso[1], heureRdv: mIso[2].slice(0, 5) };
  }

  // ── 2. "Jour HH:MM" → résolution vers la prochaine occurrence ────
  //    Formats acceptés : "Jeu 08:00", "jeu. 08:00", "Jeudi 08:00"
  const mDay = /^([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2}:\d{2})$/.exec(t);
  if (mDay) {
    const dayName  = mDay[1];
    const heureRdv = mDay[2].padStart(5, "0");
    const dateRdv  = resolveNextWeekday(dayName, heureRdv);
    if (dateRdv) {
      const label = formatDateLabel(dateRdv, heureRdv);
      return { key: `day-${index}-${t}`, label, dateRdv, heureRdv };
    }
  }

  // ── 3. "HH:MM" seule → aujourd'hui si à venir, sinon demain ──────
  const mTime = /^(\d{1,2}:\d{2})$/.exec(t);
  if (mTime) {
    const heureRdv = mTime[1].padStart(5, "0");
    const [hh, mm] = heureRdv.split(":").map(Number);
    const now      = new Date();
    const slotTime = hh * 60 + mm;
    const nowTime  = now.getHours() * 60 + now.getMinutes();
    const base     = new Date(now);
    if (slotTime <= nowTime) base.setDate(base.getDate() + 1);
    base.setHours(0, 0, 0, 0);
    const dateRdv = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
    return { key: `time-${index}-${t}`, label: formatDateLabel(dateRdv, heureRdv), dateRdv, heureRdv };
  }

  // ── 4. Tentative Date.parse générique ────────────────────────────
  const asDate = Date.parse(t);
  if (!Number.isNaN(asDate)) {
    const d   = new Date(asDate);
    const y   = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh  = String(d.getHours()).padStart(2, "0");
    const mm2 = String(d.getMinutes()).padStart(2, "0");
    return {
      key:      `dp-${index}-${t}`,
      label:    d.toLocaleString("fr-FR"),
      dateRdv:  `${y}-${mo}-${day}`,
      heureRdv: `${hh}:${mm2}`,
    };
  }

  // ── 5. Format illisible → on l'exclut silencieusement ────────────
  //   (plus de slots "⚠ Format invalide" affichés à l'utilisateur)
  return null;
}

function groupCreneaux(slots: CreneauSlot[]): { label: string; slots: CreneauSlot[] }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const groups: Record<string, CreneauSlot[]> = {};
  for (const slot of slots) {
    let key = "À planifier";
    try {
      const d = new Date(slot.dateRdv + "T12:00:00");
      if (!isNaN(d.getTime())) {
        const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
        if (diff < 0) key = "Passé";
        else if (diff === 0) key = "Aujourd'hui";
        else if (diff === 1) key = "Demain";
        else if (diff < 7) key = "Cette semaine";
        else if (diff < 14) key = "La semaine prochaine";
        else key = "Plus tard";
      }
    } catch {}
    if (!groups[key]) groups[key] = [];
    groups[key].push(slot);
  }
  const order = ["Aujourd'hui", "Demain", "Cette semaine", "La semaine prochaine", "Plus tard", "À planifier", "Passé"];
  return order.filter(k => groups[k]?.length).map(k => ({ label: k, slots: groups[k] }));
}

function formatDateLabel(dateRdv: string, heureRdv: string): string {
  try {
    const d = new Date(`${dateRdv}T${heureRdv || "00:00"}:00`);
    if (isNaN(d.getTime())) return `${dateRdv} ${heureRdv}`.trim();
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      + (heureRdv ? ` à ${heureRdv}` : "");
  } catch { return `${dateRdv} ${heureRdv}`.trim(); }
}

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " FCFA";
}

// ─── Métadonnées catégories ───────────────────────────────────────────
const CAT_META: Record<string, { svgPath: string; color: string }> = {
  "Hopital / Clinique":       { svgPath: "M12 5v14M5 12h14", color: "#F5A623" },
  "Ecole / Universite":       { svgPath: "M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6", color: "#F5A623" },
  "Mairie / Administration":  { svgPath: "M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6", color: "#F5A623" },
  "Banque / Microfinance":    { svgPath: "M3 21h18M3 7h18M3 3h18v4H3zM9 11v10M15 11v10", color: "#F5A623" },
  "Pharmacie":                { svgPath: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18", color: "#F5A623" },
  "Cabinet medical":          { svgPath: "M22 12h-4l-3 9L9 3l-3 9H2", color: "#F5A623" },
  "Tribunal / Justice":       { svgPath: "M12 3v18M3 9h18M3 15h18", color: "#F5A623" },
  "Transport / Logistique":   { svgPath: "M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3", color: "#F5A623" },
  "ONG / Association":        { svgPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", color: "#F5A623" },
  "Autre":                    { svgPath: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", color: "#F5A623" },
};

const MOTIFS_COURANTS = [
  "Consultation médicale", "Renouvellement de document", "Ouverture de compte",
  "Demande de visa / passeport", "Inscription scolaire", "Démarche administrative",
  "Rendez-vous professionnel", "Suivi de dossier", "Urgence médicale", "Autre motif",
];

// ─── Composant Logo ───────────────────────────────────────────────────
function InstitutionLogo({ inst, size = 56 }: { inst: InstitutionRow; size?: number }) {
  const [err, setErr] = useState(false);
  const meta     = CAT_META[inst.category] || { svgPath: "", color: "#F5A623" };
  const initials = inst.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  if (inst.logo && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: "16px", overflow: "hidden", flexShrink: 0, border: `2px solid ${meta.color}30`, boxShadow: `0 0 0 4px ${meta.color}12` }}>
        <img src={inst.logo} alt={inst.name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "16px", flexShrink: 0, background: `linear-gradient(135deg, ${meta.color}25, ${meta.color}10)`, border: `2px solid ${meta.color}35`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", boxShadow: `0 0 0 4px ${meta.color}08` }}>
      <svg width={Math.round(size * 0.38)} height={Math.round(size * 0.38)} viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2" strokeLinecap="round"><path d={meta.svgPath}/></svg>
      <span style={{ color: meta.color, fontSize: "10px", fontWeight: "900", letterSpacing: "0.5px" }}>{initials || "?"}</span>
    </div>
  );
}

// ─── Carte Service Payant ─────────────────────────────────────────────
function ServicePayantCard({
  service, selected, onSelect, isDark, C,
}: {
  service: PaidService;
  selected: boolean;
  onSelect: () => void;
  isDark: boolean;
  C: any;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderRadius: "18px", border: selected ? "2px solid #F5A623" : `1.5px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, background: selected ? isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.05)" : C.cardBg, overflow: "hidden", boxShadow: selected ? "0 0 0 4px rgba(245,166,35,0.12), 0 8px 32px rgba(245,166,35,0.18)" : isDark ? "0 2px 12px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.06)", transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)" }}>
      <div style={{ height: "3px", background: selected ? "linear-gradient(90deg,#F5A623,#F2C94C,#F5A623)" : `${isDark ? "rgba(245,166,35,0.2)" : "rgba(245,166,35,0.15)"}` }}/>
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ width: "46px", height: "46px", borderRadius: "13px", background: selected ? "rgba(245,166,35,0.15)" : isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.06)", border: `1.5px solid ${selected ? "rgba(245,166,35,0.4)" : "rgba(245,166,35,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={selected ? "#F5A623" : isDark ? "rgba(245,166,35,0.6)" : "rgba(180,130,20,0.7)"} strokeWidth="1.8" strokeLinecap="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: "15px", fontWeight: "800", letterSpacing: "-0.3px", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{service.nom}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ color: "#F5A623", fontSize: "17px", fontWeight: "900", letterSpacing: "-0.5px" }}>{formatPrix(service.prix)}</span>
              <span style={{ color: C.textSubtle, fontSize: "11px" }}>·</span>
              <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600" }}>{service.duree_minutes} min</span>
            </div>
          </div>
          <div onClick={onSelect} className="tap" style={{ width: "26px", height: "26px", borderRadius: "50%", border: selected ? "2px solid #F5A623" : `2px solid ${isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`, background: selected ? "#F5A623" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.18s", boxShadow: selected ? "0 2px 10px rgba(245,166,35,0.4)" : "none" }}>
            {selected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
        </div>
        {service.description && (
          <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: "#F5A623", fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "6px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round">
              {expanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
            </svg>
            {expanded ? "Masquer les détails" : "Voir les détails"}
          </button>
        )}
        {expanded && service.description && (
          <div style={{ marginTop: "10px", padding: "12px 14px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", borderRadius: "12px", border: "1px solid rgba(245,166,35,0.15)", animation: "fadeUp 0.2s ease" }}>
            <p style={{ color: C.textMuted, fontSize: "12px", lineHeight: 1.7, margin: 0 }}>{service.description}</p>
          </div>
        )}
        <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", borderRadius: "10px", border: "1px solid rgba(245,166,35,0.12)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <span style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "600" }}>Paiement <strong style={{ color: "#F5A623" }}>sur place</strong> le jour du RDV · Code Yelen requis</span>
        </div>
        {!selected && (
          <button onClick={onSelect} className="tap" style={{ width: "100%", marginTop: "12px", padding: "12px", borderRadius: "12px", border: "1.5px solid rgba(245,166,35,0.35)", background: "transparent", color: "#F5A623", fontWeight: "800", fontSize: "13px", cursor: "pointer", transition: "all 0.15s" }}>
            Choisir ce service
          </button>
        )}
        {selected && (
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", padding: "11px", borderRadius: "12px", background: "linear-gradient(135deg,rgba(245,166,35,0.15),rgba(245,166,35,0.08))", border: "1.5px solid rgba(245,166,35,0.35)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ color: "#F5A623", fontWeight: "800", fontSize: "13px" }}>Service sélectionné</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Écran succès RDV payant ──────────────────────────────────────────
function SuccessPayant({ inst, service, code, dateRdv, heureRdv, C, isDark }: {
  inst: InstitutionRow; service: PaidService; code: string;
  dateRdv: string; heureRdv: string; C: any; isDark: boolean;
}) {
  return (
    <div style={{ minHeight: "100svh", background: isDark ? "#080812" : "#FFFBF0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
          <div style={{ position: "relative", width: "88px", height: "88px" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(245,166,35,0.08)", border: "2px solid rgba(245,166,35,0.2)", animation: "ping 2s ease-out infinite" }}/>
            <div style={{ position: "relative", width: "88px", height: "88px", borderRadius: "50%", background: "linear-gradient(135deg,rgba(245,166,35,0.18),rgba(245,166,35,0.06))", border: "2px solid rgba(245,166,35,0.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(245,166,35,0.2)" }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        </div>
        <div style={{ background: C.cardBg, borderRadius: "24px", border: `1px solid ${isDark ? "rgba(245,166,35,0.2)" : "rgba(245,166,35,0.25)"}`, overflow: "hidden", boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.5)" : "0 12px 48px rgba(245,166,35,0.12)" }}>
          <div style={{ height: "4px", background: "linear-gradient(90deg,#F5A623,#F2C94C,#F5A623)" }}/>
          <div style={{ padding: "28px 24px 24px" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ color: "#F5A623", fontSize: "11px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>Réservation confirmée</div>
              <h2 style={{ color: C.text, fontSize: "22px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.6px" }}>{inst.name}</h2>
              <div style={{ color: C.textSubtle, fontSize: "13px" }}>{inst.ville}{inst.quartier ? ` · ${inst.quartier}` : ""}</div>
            </div>
            <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", border: "1.5px solid rgba(245,166,35,0.3)", borderRadius: "18px", padding: "20px", marginBottom: "20px", textAlign: "center" }}>
              <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>Code de confirmation Yelen</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "8px" }}>
                {[code.slice(0, 3), code.slice(3)].map((part, i) => (
                  <div key={i} style={{ display: "flex", gap: "4px" }}>
                    {part.split("").map((char, j) => (
                      <div key={j} style={{ width: "38px", height: "50px", borderRadius: "10px", background: isDark ? "rgba(245,166,35,0.12)" : "rgba(245,166,35,0.08)", border: "1.5px solid rgba(245,166,35,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", fontSize: "24px", fontWeight: "900", fontFamily: "monospace" }}>{char}</div>
                    ))}
                    {i === 0 && <div style={{ width: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSubtle, fontSize: "20px", fontWeight: "300" }}>—</div>}
                  </div>
                ))}
              </div>
              <div style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.6 }}>Présentez ce code le jour J pour valider votre RDV</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              {[
                { label: "Service",           value: service.nom },
                { label: "Date",              value: formatDateLabel(dateRdv, heureRdv) },
                { label: "Montant à payer",   value: formatPrix(service.prix) + " (sur place)" },
                { label: "Durée prévue",      value: `${service.duree_minutes} minutes` },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "12px", border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>{row.label}</div>
                    <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", marginTop: "1px" }}>{row.value}</div>
                  </div>
                </div>
              ))}
            </div>
            {inst.phone && (
              <div style={{ marginBottom: "20px", padding: "12px 14px", background: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.03)", borderRadius: "12px", border: "1px solid rgba(245,166,35,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <div>
                  <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Questions ? Contactez</div>
                  <div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>{inst.phone}</div>
                </div>
                <a href={`tel:${inst.phone}`} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "12px", padding: "9px 14px", borderRadius: "10px", textDecoration: "none" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Appeler
                </a>
              </div>
            )}
            <div style={{ padding: "12px 14px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.03)", borderRadius: "12px", border: "1px solid rgba(245,166,35,0.12)", marginBottom: "20px" }}>
              <div style={{ color: "#F5A623", fontSize: "11px", fontWeight: "800", marginBottom: "5px" }}>À retenir</div>
              <ul style={{ color: C.textMuted, fontSize: "11px", lineHeight: 1.8, margin: 0, paddingLeft: "14px" }}>
                <li>Présentez-vous <strong style={{ color: C.textSubtle }}>10 minutes avant</strong> l'heure</li>
                <li>Paiement en <strong style={{ color: C.textSubtle }}>espèces sur place</strong> — {formatPrix(service.prix)}</li>
                <li>Ce code est <strong style={{ color: "#F5A623" }}>obligatoire</strong> pour valider votre RDV</li>
                <li>Sans code Yelen = RDV non reconnu par le système</li>
              </ul>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link href="/mes-rdv" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "16px", borderRadius: "14px", textDecoration: "none", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
                Voir mes rendez-vous
              </Link>
              <Link href={`/institution/${inst.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", color: C.text, fontWeight: "600", fontSize: "14px", padding: "14px", borderRadius: "14px", textDecoration: "none", border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>
                Retour à la fiche institution
              </Link>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "20px" }}>
          <div style={{ width: "14px", height: "9px", backgroundColor: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
          <div style={{ width: "14px", height: "9px", backgroundColor: "#FCD20F" }}/>
          <div style={{ width: "14px", height: "9px", backgroundColor: "#009A44", borderRadius: "0 2px 2px 0" }}/>
          <span style={{ color: C.textSubtle, fontSize: "10px", marginLeft: "6px", fontWeight: "600" }}>Yelen224 · République de Guinée</span>
        </div>
      </div>
    </div>
  );
}

// ─── Écran succès RDV gratuit ─────────────────────────────────────────
function SuccessGratuit({ inst, slot, C, isDark }: { inst: InstitutionRow; slot: CreneauSlot | null; C: any; isDark: boolean }) {
  const meta = CAT_META[inst.category] || { color: "#F5A623" };
  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
          <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg,rgba(245,166,35,0.15),rgba(245,166,35,0.05))", border: "2px solid rgba(245,166,35,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
        <div style={{ backgroundColor: C.cardBg, borderRadius: "24px", border: `1px solid ${C.borderCard}`, overflow: "hidden" }}>
          <div style={{ height: "4px", background: `linear-gradient(90deg,${meta.color},${meta.color}66)` }}/>
          <div style={{ padding: "28px 24px 24px" }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ color: "#F5A623", fontSize: "11px", fontWeight: "800", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Rendez-vous confirmé</div>
              <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>{inst.name}</h2>
              <div style={{ color: C.textSubtle, fontSize: "13px" }}>{inst.ville}</div>
            </div>
            {slot && (
              <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "14px", padding: "14px 16px", marginBottom: "20px" }}>
                <div style={{ color: "#F5A623", fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Date & heure</div>
                <div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>{formatDateLabel(slot.dateRdv, slot.heureRdv)}</div>
              </div>
            )}
            <div style={{ padding: "12px 14px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.03)", borderRadius: "12px", border: "1px solid rgba(245,166,35,0.12)", marginBottom: "20px" }}>
              <div style={{ color: C.textMuted, fontSize: "11px", lineHeight: 1.7 }}>Votre demande est en attente de confirmation. Vous recevrez une notification dès validation. Présentez-vous 10 min avant l'heure.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link href="/mes-rdv" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "14px", textDecoration: "none" }}>Voir mes rendez-vous</Link>
              <Link href={`/institution/${inst.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", color: C.text, fontWeight: "600", fontSize: "14px", padding: "13px", borderRadius: "14px", textDecoration: "none", border: `1px solid ${C.borderCard}` }}>Retour à la fiche</Link>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginTop: "20px" }}>
          <div style={{ width: "14px", height: "9px", backgroundColor: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
          <div style={{ width: "14px", height: "9px", backgroundColor: "#FCD20F" }}/>
          <div style={{ width: "14px", height: "9px", backgroundColor: "#009A44", borderRadius: "0 2px 2px 0" }}/>
          <span style={{ color: C.textSubtle, fontSize: "10px", marginLeft: "6px", fontWeight: "600" }}>Yelen224 · République de Guinée</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function RdvPage() {
  const { theme } = useTheme();
  const C         = T[theme];
  const isDark    = theme === "dark";
  const inputBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBord = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const params = useParams<{ id: string }>();
  const id     = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [institution, setInstitution]     = useState<InstitutionRow | null>(null);
  const [creneaux, setCreneaux]           = useState<CreneauSlot[]>([]);
  const [paidServices, setPaidServices]   = useState<PaidService[]>([]);
  const [mode, setMode]                   = useState<"choice" | "gratuit" | "payant">("choice");
  const [stepGratuit, setStepGratuit]     = useState<1 | 2 | 3>(1);
  const [selectedSlot, setSelectedSlot]   = useState<CreneauSlot | null>(null);
  const [motifSelectionne, setMotifSelectionne] = useState("");
  const [visitReason, setVisitReason]     = useState("");
  const [urgence, setUrgence]             = useState<"normale" | "urgente" | "planifiee">("normale");
  const [typeVisite, setTypeVisite]       = useState<"presentiel" | "teleconsultation">("presentiel");
  const [forOtherPerson, setForOtherPerson] = useState(false);
  const [otherName, setOtherName]         = useState("");
  const [otherPhone, setOtherPhone]       = useState("");
  const [documents]                       = useState<string[]>([]);
  const [stepPayant, setStepPayant]       = useState<1 | 2 | 3>(1);
  const [selectedService, setSelectedService]     = useState<PaidService | null>(null);
  const [selectedSlotPayant, setSelectedSlotPayant] = useState<CreneauSlot | null>(null);
  const [visitReasonPayant, setVisitReasonPayant] = useState("");
  const [forOtherPayant, setForOtherPayant]       = useState(false);
  const [otherNamePayant, setOtherNamePayant]     = useState("");
  const [otherPhonePayant, setOtherPhonePayant]   = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const [successGratuit, setSuccessGratuit] = useState(false);
  const [successPayant, setSuccessPayant]   = useState<{ code: string; dateRdv: string; heureRdv: string } | null>(null);

  const meta           = institution ? (CAT_META[institution.category] || { svgPath: "", color: "#F5A623" }) : { svgPath: "", color: "#F5A623" };
  const groupedCreneaux = useMemo(() => groupCreneaux(creneaux), [creneaux]);
  const hasCreneaux     = creneaux.length > 0;
  const hasPaidServices = paidServices.length > 0;

  useEffect(() => {
    const userId = typeof window !== "undefined" ? localStorage.getItem(YELEN224_USER_ID_KEY) : null;
    if (!userId?.trim()) {
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.replace(`/inscription?redirect=${returnUrl}`);
    }
  }, [router]);

  const load = useCallback(async (institutionId: string) => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("institutions")
      .select("id,name,ville,quartier,adresse,phone,category,badge_verifie,logo,description,moyenne_avis,nb_avis,disponibilites")
      .eq("id", institutionId)
      .maybeSingle();
    if (error) { setLoadError(error.message); return; }
    if (!data)  { notFound(); return; }
    const row         = data as Record<string, unknown>;
    const displayName = institutionDisplayName(row);
    if (!displayName) { setLoadError("Établissement invalide."); return; }
    setInstitution({
      id: String(row.id), name: displayName, ville: String(row.ville ?? "").trim(),
      quartier: String(row.quartier ?? "").trim(), adresse: String(row.adresse ?? "").trim(),
      phone: String(row.phone ?? "").trim(), category: String(row.category ?? "Autre").trim(),
      badge_verifie: Boolean(row.badge_verifie), logo: row.logo ? String(row.logo) : null,
      description: row.description ? String(row.description) : null,
      moyenne_avis: Number(row.moyenne_avis ?? 0), nb_avis: Number(row.nb_avis ?? 0),
    });
    setCreneaux(parseDisponibilites(row.disponibilites));
    const { data: services } = await supabase
      .from("paid_services")
      .select("id, institution_id, nom, prix, duree_minutes, description, is_active")
      .eq("institution_id", institutionId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    setPaidServices(services ?? []);
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => { setLoading(true); await load(id); setLoading(false); })();
  }, [id, load]);

  async function handleSubmitGratuit() {
    setSubmitError(null);
    if (!id || !institution || !selectedSlot) return;
    if (!visitReason.trim()) { setSubmitError("Indiquez l'objet de la visite."); return; }
    if (forOtherPerson && (!otherName.trim() || !otherPhone.trim())) { setSubmitError("Renseignez le nom et le téléphone."); return; }
    const userId = typeof window !== "undefined" ? localStorage.getItem(YELEN224_USER_ID_KEY) : null;
    if (!userId?.trim()) { setSubmitError("Vous devez être connecté."); return; }
    setSubmitting(true);
    try {
      const result = await createRdv({
        citoyenId: userId.trim(), institutionId: id,
        dateRdv:   selectedSlot.dateRdv, heureRdv: selectedSlot.heureRdv || "00:00",
        objet: `[${urgence.toUpperCase()}] ${motifSelectionne ? motifSelectionne + " — " : ""}${visitReason}${typeVisite === "teleconsultation" ? " (Téléconsultation)" : ""}${documents.length ? ` | Docs: ${documents.join(", ")}` : ""}`,
        pourAutre: forOtherPerson, nomAutre: forOtherPerson ? otherName : null, phoneAutre: forOtherPerson ? otherPhone : null,
      });
      if (!result.ok) { setSubmitError(result.error); return; }
      setSuccessGratuit(true);
    } finally { setSubmitting(false); }
  }

  async function handleSubmitPayant() {
    setSubmitError(null);
    if (!id || !institution || !selectedService || !selectedSlotPayant) return;
    if (!visitReasonPayant.trim()) { setSubmitError("Indiquez l'objet de votre visite."); return; }
    if (forOtherPayant && (!otherNamePayant.trim() || !otherPhonePayant.trim())) { setSubmitError("Renseignez le nom et le téléphone."); return; }
    // Sécurité finale — ne devrait jamais déclencher grâce au parsing amélioré
    if (!selectedSlotPayant.dateRdv || !/^\d{4}-\d{2}-\d{2}$/.test(selectedSlotPayant.dateRdv)) {
      setSubmitError("Date invalide. Contactez l'institution pour corriger ses disponibilités.");
      return;
    }
    const userId = typeof window !== "undefined" ? localStorage.getItem(YELEN224_USER_ID_KEY) : null;
    if (!userId?.trim()) { setSubmitError("Vous devez être connecté."); return; }
    setSubmitting(true);
    try {
      const code = genCode();
      const { error: bkErr } = await supabase.from("paid_bookings").insert({
        service_id:        selectedService.id,
        citoyen_id:        userId.trim(),
        institution_id:    id,
        date_rdv:          selectedSlotPayant.dateRdv,
        heure_rdv:         selectedSlotPayant.heureRdv || "00:00",
        confirmation_code: code,
        statut:            "en_attente",
      });
      if (bkErr) { setSubmitError("Erreur lors de la réservation : " + bkErr.message); return; }
      await supabase.from("rdv").insert({
        citoyen_id:     userId.trim(),
        institution_id: id,
        date_rdv:       selectedSlotPayant.dateRdv,
        heure_rdv:      selectedSlotPayant.heureRdv || "00:00",
        objet:          `[SERVICE PAYANT] ${selectedService.nom} — ${formatPrix(selectedService.prix)} — ${visitReasonPayant}${forOtherPayant ? ` (Pour: ${otherNamePayant})` : ""}`,
        statut:         "en_attente",
        pour_autre:     forOtherPayant,
        nom_autre:      forOtherPayant ? otherNamePayant : null,
        phone_autre:    forOtherPayant ? otherPhonePayant : null,
        qr_token:       code,
      });
      setSuccessPayant({ code, dateRdv: selectedSlotPayant.dateRdv, heureRdv: selectedSlotPayant.heureRdv });
    } finally { setSubmitting(false); }
  }

  if (loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
      <div style={{ width: "44px", height: "44px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      <p style={{ color: C.textSubtle, fontSize: "14px" }}>Chargement…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (loadError || !institution) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
      <p style={{ color: "rgba(245,166,35,0.8)", fontSize: "15px", fontWeight: "600", marginBottom: "20px" }}>{loadError || "Institution introuvable"}</p>
      <Link href="/recherche" style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>Retour</Link>
    </div>
  );

  if (successGratuit) return <SuccessGratuit inst={institution} slot={selectedSlot} C={C} isDark={isDark}/>;
  if (successPayant)  return <SuccessPayant inst={institution} service={selectedService!} code={successPayant.code} dateRdv={successPayant.dateRdv} heureRdv={successPayant.heureRdv} C={C} isDark={isDark}/>;

  const CSS = `
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{overflow-x:hidden;background:${C.pageBg}}
    ::-webkit-scrollbar{display:none}
    *{scrollbar-width:none}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes ping{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0;transform:scale(2.2)}}
    .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
    .tap:active{opacity:0.65;transform:scale(0.97)}
    textarea,input,select{font-family:inherit}
    input:focus,textarea:focus{outline:none}
    a{-webkit-tap-highlight-color:transparent}
  `;

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, fontFamily: "'SF Pro Text',-apple-system,'Helvetica Neue',sans-serif", color: C.text, paddingBottom: "40px" }}>
      <style>{CSS}</style>

      {/* ════════ HEADER ════════ */}
      <div style={{ position: "sticky", top: 0, zIndex: 200, backgroundColor: isDark ? "rgba(8,8,15,0.98)" : "rgba(248,248,251,0.98)", backdropFilter: "blur(24px)", borderBottom: `1px solid ${isDark ? "rgba(245,166,35,0.12)" : "rgba(245,166,35,0.15)"}` }}>
        <div style={{ height: "3px", background: isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)" }}>
          <div style={{ height: "100%", width: mode === "choice" ? "5%" : mode === "gratuit" ? `${(stepGratuit / 3) * 95 + 5}%` : `${(stepPayant / 3) * 95 + 5}%`, background: "linear-gradient(90deg,#F5A623,#C8940A)", transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)", borderRadius: "0 2px 2px 0" }}/>
        </div>
        <div style={{ padding: "10px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "28px", height: "28px", background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
              </div>
              <div>
                <div style={{ color: C.text, fontSize: "13px", fontWeight: "900", letterSpacing: "0.4px" }}>YELEN224</div>
                <div style={{ color: "#F5A623", fontSize: "7px", fontWeight: "700", letterSpacing: "1.5px" }}>PRISE DE RDV</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, margin: "0 12px" }}>
              <InstitutionLogo inst={institution} size={30}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: "12px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{institution.name}</div>
                {institution.badge_verifie && (
                  <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ color: "#F5A623", fontSize: "9px", fontWeight: "700" }}>Vérifié</span>
                  </div>
                )}
              </div>
            </div>
            <Link href={`/institution/${institution.id}`} style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700", textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center", gap: "3px" }}>
              Fiche <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </Link>
          </div>
          {mode !== "choice" && (
            <div style={{ display: "flex", alignItems: "center" }}>
              {([
                { n: 1, label: mode === "payant" ? "Service" : "Créneau" },
                { n: 2, label: mode === "payant" ? "Créneau & motif" : "Détails" },
                { n: 3, label: "Confirmation" },
              ] as { n: 1|2|3; label: string }[]).map((s, i) => {
                const currentStep = mode === "gratuit" ? stepGratuit : stepPayant;
                return (
                  <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                      <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: currentStep > s.n ? "#F5A623" : currentStep === s.n ? "linear-gradient(135deg,#F5A623,#C8940A)" : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: currentStep === s.n ? "2px solid #F5A623" : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", color: currentStep >= s.n ? "#080812" : C.textSubtle, fontSize: "10px", fontWeight: "900", boxShadow: currentStep === s.n ? "0 0 10px rgba(245,166,35,0.4)" : "none", transition: "all 0.3s", flexShrink: 0 }}>
                        {currentStep > s.n ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : s.n}
                      </div>
                      <span style={{ color: currentStep === s.n ? "#F5A623" : C.textSubtle, fontSize: "10px", fontWeight: currentStep === s.n ? "800" : "500" }}>{s.label}</span>
                    </div>
                    {i < 2 && <div style={{ flex: 1, height: "1px", marginLeft: "6px", background: currentStep > s.n ? "#F5A623" : C.borderSubtle, opacity: currentStep > s.n ? 0.5 : 1, transition: "background 0.3s" }}/>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ════════ CORPS ════════ */}
      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "20px 16px 0" }}>

        {/* ── CHOIX ── */}
        {mode === "choice" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
              <InstitutionLogo inst={institution} size={52}/>
              <div>
                <h1 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 3px", letterSpacing: "-0.5px" }}>{institution.name}</h1>
                <div style={{ color: C.textSubtle, fontSize: "13px" }}>{institution.ville}{institution.quartier ? ` · ${institution.quartier}` : ""}</div>
                {institution.badge_verifie && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "20px", padding: "2px 8px", marginTop: "4px" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ color: "#F5A623", fontSize: "9px", fontWeight: "800" }}>Institution vérifiée</span>
                  </div>
                )}
              </div>
            </div>
            <h2 style={{ color: C.text, fontSize: "18px", fontWeight: "900", margin: "0 0 6px", letterSpacing: "-0.4px" }}>Quel type de rendez-vous ?</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px", lineHeight: 1.6 }}>Choisissez entre un créneau standard ou un service payant disponible dans cet établissement.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "28px" }}>
              {hasCreneaux ? (
                <button onClick={() => setMode("gratuit")} className="tap" style={{ background: C.cardBg, border: `1.5px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`, borderRadius: "20px", padding: "20px", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "50px", height: "50px", borderRadius: "14px", background: isDark ? "rgba(0,200,150,0.12)" : "rgba(0,135,90,0.08)", border: `1.5px solid ${isDark ? "rgba(0,200,150,0.25)" : "rgba(0,135,90,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#00C896" : "#00875A"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ color: C.text, fontSize: "16px", fontWeight: "900" }}>Créneau standard</span>
                        <span style={{ background: isDark ? "rgba(0,200,150,0.12)" : "rgba(0,135,90,0.08)", color: isDark ? "#00C896" : "#00875A", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>GRATUIT</span>
                      </div>
                      <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Réservez un créneau disponible — {creneaux.length} créneaux disponibles</p>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </button>
              ) : (
                <div style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px dashed ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`, borderRadius: "20px", padding: "20px", opacity: 0.6 }}>
                  <div style={{ color: C.textSubtle, fontSize: "15px", fontWeight: "700" }}>Aucun créneau disponible pour le moment</div>
                </div>
              )}
              {hasPaidServices ? (
                <button onClick={() => setMode("payant")} className="tap" style={{ background: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.03)", border: "1.5px solid rgba(245,166,35,0.25)", borderRadius: "20px", padding: "20px", textAlign: "left", cursor: "pointer", boxShadow: "0 4px 20px rgba(245,166,35,0.1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "50px", height: "50px", borderRadius: "14px", background: "rgba(245,166,35,0.12)", border: "1.5px solid rgba(245,166,35,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                        <span style={{ color: C.text, fontSize: "16px", fontWeight: "900" }}>Services payants</span>
                        <span style={{ background: "rgba(245,166,35,0.12)", color: "#F5A623", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", border: "1px solid rgba(245,166,35,0.25)" }}>{paidServices.length} service{paidServices.length > 1 ? "s" : ""}</span>
                      </div>
                      <p style={{ color: C.textSubtle, fontSize: "12px", margin: "0 0 8px" }}>Paiement sur place · Code de confirmation Yelen requis</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {paidServices.slice(0, 3).map(s => (
                          <span key={s.id} style={{ background: "rgba(245,166,35,0.08)", color: "#F5A623", fontSize: "10px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px", border: "1px solid rgba(245,166,35,0.15)" }}>{s.nom} · {formatPrix(s.prix)}</span>
                        ))}
                        {paidServices.length > 3 && <span style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "600", padding: "3px 6px" }}>+{paidServices.length - 3} autres</span>}
                      </div>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </button>
              ) : (
                <div style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px dashed ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`, borderRadius: "20px", padding: "18px 20px", opacity: 0.5 }}>
                  <div style={{ color: C.textSubtle, fontSize: "13px" }}>Aucun service payant disponible</div>
                </div>
              )}
            </div>
            {institution.phone && (
              <div style={{ padding: "14px 16px", background: C.cardBg, borderRadius: "16px", border: `1px solid ${C.borderCard}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Besoin d'aide ?</div>
                  <div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>{institution.phone}</div>
                </div>
                <a href={`tel:${institution.phone}`} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "12px", padding: "10px 14px", borderRadius: "12px", textDecoration: "none" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Appeler
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── GRATUIT étape 1 ── */}
        {mode === "gratuit" && stepGratuit === 1 && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            <button onClick={() => setMode("choice")} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.textSubtle, fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: "0 0 16px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Retour au choix
            </button>
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Choisir un créneau</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Sélectionnez la date et l'heure souhaitées.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {groupedCreneaux.map(group => (
                <div key={group.label}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{ height: "1px", flex: 1, background: C.borderSubtle }}/>
                    <span style={{ color: group.label === "Aujourd'hui" || group.label === "Demain" ? "#F5A623" : C.textSubtle, fontSize: "11px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase" }}>{group.label}</span>
                    <div style={{ height: "1px", flex: 1, background: C.borderSubtle }}/>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {group.slots.map(slot => {
                      const selected = selectedSlot?.key === slot.key;
                      return (
                        <button key={slot.key} type="button" onClick={() => setSelectedSlot(slot)} className="tap" style={{ padding: "13px 12px", borderRadius: "14px", border: selected ? `2px solid ${meta.color}` : `1px solid ${C.borderCard}`, background: selected ? `linear-gradient(135deg,${meta.color}18,${meta.color}08)` : C.cardBg, cursor: "pointer", textAlign: "left", boxShadow: selected ? `0 0 16px ${meta.color}25` : "none", transition: "all 0.15s" }}>
                          <div style={{ color: selected ? meta.color : C.text, fontSize: "15px", fontWeight: "800", marginBottom: "2px" }}>{slot.heureRdv}</div>
                          <div style={{ color: selected ? meta.color + "bb" : C.textSubtle, fontSize: "10px", fontWeight: "600" }}>
                            {(() => { try { return new Date(slot.dateRdv + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); } catch { return slot.dateRdv; } })()}
                          </div>
                          {selected && <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{ color: meta.color, fontSize: "9px", fontWeight: "800" }}>Sélectionné</span></div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => selectedSlot && setStepGratuit(2)} disabled={!selectedSlot} className="tap" style={{ width: "100%", marginTop: "24px", padding: "16px", borderRadius: "16px", border: "none", background: selectedSlot ? `linear-gradient(135deg,${meta.color},#F5A623)` : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", color: selectedSlot ? "#080812" : C.textSubtle, fontSize: "15px", fontWeight: "800", cursor: selectedSlot ? "pointer" : "not-allowed", boxShadow: selectedSlot ? `0 8px 24px ${meta.color}40` : "none", transition: "all 0.2s" }}>
              {selectedSlot ? `Continuer · ${selectedSlot.heureRdv || selectedSlot.label} →` : "Choisissez un créneau"}
            </button>
          </div>
        )}

        {/* ── GRATUIT étape 2 ── */}
        {mode === "gratuit" && stepGratuit === 2 && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {selectedSlot && (
              <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "14px", padding: "12px 14px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "rgba(245,166,35,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
                  <div>
                    <div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>{formatDateLabel(selectedSlot.dateRdv, selectedSlot.heureRdv)}</div>
                    <div style={{ color: C.textSubtle, fontSize: "10px" }}>{institution.name}</div>
                  </div>
                </div>
                <button onClick={() => setStepGratuit(1)} style={{ background: "none", border: "none", color: "#F5A623", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>Modifier</button>
              </div>
            )}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Détails de la visite</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Ces informations aident l'institution à préparer votre venue.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}` }}>
                <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>Motif de la visite</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "12px" }}>
                  {MOTIFS_COURANTS.map(motif => (
                    <button key={motif} type="button" onClick={() => { setMotifSelectionne(motif === motifSelectionne ? "" : motif); if (motif !== "Autre motif") setVisitReason(motif === motifSelectionne ? "" : motif); }} className="tap" style={{ padding: "6px 12px", borderRadius: "20px", border: `1px solid ${motifSelectionne === motif ? "transparent" : inputBord}`, background: motifSelectionne === motif ? `linear-gradient(135deg,${meta.color},${meta.color}cc)` : inputBg, color: motifSelectionne === motif ? "#080812" : C.textSubtle, fontSize: "12px", fontWeight: motifSelectionne === motif ? "800" : "500", cursor: "pointer" }}>
                      {motif}
                    </button>
                  ))}
                </div>
                <textarea value={visitReason} onChange={e => setVisitReason(e.target.value)} placeholder="Décrivez votre demande (minimum 5 caractères)…" rows={3} style={{ width: "100%", padding: "12px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "12px", fontSize: "13px", color: C.text, resize: "none", lineHeight: 1.6 }}/>
                <div style={{ color: visitReason.length < 5 ? "rgba(245,166,35,0.8)" : "#F5A623", fontSize: "10px", marginTop: "5px", textAlign: "right" }}>{visitReason.length} car. {visitReason.length >= 5 ? "✓" : "(min. 5)"}</div>
              </div>
              <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}` }}>
                <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>Urgence</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  {([{ k: "normale", label: "Normal" }, { k: "urgente", label: "Urgent" }, { k: "planifiee", label: "Planifié" }] as { k: "normale"|"urgente"|"planifiee"; label: string }[]).map(u => (
                    <button key={u.k} onClick={() => setUrgence(u.k)} className="tap" style={{ padding: "11px 8px", borderRadius: "12px", cursor: "pointer", textAlign: "center", background: urgence === u.k ? "rgba(245,166,35,0.1)" : inputBg, border: urgence === u.k ? "2px solid rgba(245,166,35,0.5)" : `1px solid ${inputBord}`, color: urgence === u.k ? "#F5A623" : C.textSubtle, fontSize: "12px", fontWeight: urgence === u.k ? "800" : "600" }}>{u.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}` }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", cursor: "pointer" }}>
                  <div>
                    <div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>Pour un tiers</div>
                    <div style={{ color: C.textSubtle, fontSize: "11px", marginTop: "2px" }}>Parent, enfant, patient sous tutelle…</div>
                  </div>
                  <div onClick={() => setForOtherPerson(p => !p)} style={{ width: "44px", height: "24px", borderRadius: "12px", background: forOtherPerson ? meta.color : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: "2px", left: forOtherPerson ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}/>
                  </div>
                </label>
                {forOtherPerson && (
                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <input type="text" value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="Nom complet *" style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text }}/>
                    <input type="tel" value={otherPhone} onChange={e => setOtherPhone(e.target.value)} placeholder="Téléphone * (+224…)" style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text }}/>
                  </div>
                )}
              </div>
            </div>
            {submitError && <div style={{ marginTop: "12px", padding: "12px 14px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", color: "rgba(245,166,35,0.8)", fontSize: "13px" }}>{submitError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", marginTop: "24px" }}>
              <button onClick={() => setStepGratuit(1)} className="tap" style={{ padding: "15px", borderRadius: "14px", border: `1px solid ${C.borderCard}`, background: C.cardBg, color: C.text, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>← Retour</button>
              <button onClick={() => visitReason.trim().length >= 5 && setStepGratuit(3)} disabled={visitReason.trim().length < 5} className="tap" style={{ padding: "15px", borderRadius: "14px", border: "none", background: visitReason.trim().length >= 5 ? `linear-gradient(135deg,${meta.color},#F5A623)` : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", color: visitReason.trim().length >= 5 ? "#080812" : C.textSubtle, fontSize: "15px", fontWeight: "800", cursor: visitReason.trim().length >= 5 ? "pointer" : "not-allowed" }}>Vérifier & Confirmer →</button>
            </div>
          </div>
        )}

        {/* ── GRATUIT étape 3 ── */}
        {mode === "gratuit" && stepGratuit === 3 && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Récapitulatif</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Vérifiez avant de confirmer.</p>
            <div style={{ background: C.cardBg, borderRadius: "20px", border: `1px solid ${C.borderCard}`, overflow: "hidden", marginBottom: "16px" }}>
              <div style={{ height: "4px", background: `linear-gradient(90deg,${meta.color},${meta.color}66)` }}/>
              <div style={{ padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "16px", borderBottom: `1px solid ${C.borderSubtle}`, marginBottom: "16px" }}>
                  <InstitutionLogo inst={institution} size={44}/>
                  <div>
                    <div style={{ color: C.text, fontSize: "15px", fontWeight: "800" }}>{institution.name}</div>
                    <div style={{ color: C.textSubtle, fontSize: "12px" }}>{institution.ville}</div>
                  </div>
                </div>
                {[
                  { label: "Date & heure", value: selectedSlot ? formatDateLabel(selectedSlot.dateRdv, selectedSlot.heureRdv) : "—" },
                  { label: "Motif",         value: visitReason },
                  { label: "Urgence",       value: urgence === "normale" ? "Normal" : urgence === "urgente" ? "Urgent" : "Planifié" },
                  { label: "Type",          value: typeVisite === "presentiel" ? "Présentiel" : "Téléconsultation" },
                  ...(forOtherPerson ? [{ label: "Pour", value: `${otherName} · ${otherPhone}` }] : []),
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: "flex", gap: "12px", paddingBottom: i < arr.length - 1 ? "12px" : "0", marginBottom: i < arr.length - 1 ? "12px" : "0", borderBottom: i < arr.length - 1 ? `1px solid ${C.borderSubtle}` : "none" }}>
                    <div style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600", minWidth: "90px" }}>{row.label}</div>
                    <div style={{ color: C.text, fontSize: "12px", fontWeight: "700", flex: 1 }}>{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: "12px 14px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderSubtle}`, borderRadius: "12px", marginBottom: "16px" }}>
              <p style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.7, margin: 0 }}>En confirmant, vous acceptez les <Link href="/cgu" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>CGU Yelen224</Link>.</p>
            </div>
            {submitError && <div style={{ marginBottom: "12px", padding: "12px 14px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", color: "rgba(245,166,35,0.8)", fontSize: "13px" }}>{submitError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
              <button onClick={() => { setSubmitError(null); setStepGratuit(2); }} className="tap" style={{ padding: "15px", borderRadius: "14px", border: `1px solid ${C.borderCard}`, background: C.cardBg, color: C.text, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>← Modifier</button>
              <button onClick={handleSubmitGratuit} disabled={submitting} className="tap" style={{ padding: "15px", borderRadius: "14px", border: "none", background: submitting ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : `linear-gradient(135deg,${meta.color},#F5A623)`, color: submitting ? C.textSubtle : "#080812", fontSize: "15px", fontWeight: "800", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: submitting ? "none" : `0 8px 24px ${meta.color}40` }}>
                {submitting ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>Enregistrement…</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Confirmer le RDV</>}
              </button>
            </div>
          </div>
        )}

        {/* ── PAYANT étape 1 ── */}
        {mode === "payant" && stepPayant === 1 && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            <button onClick={() => setMode("choice")} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.textSubtle, fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: "0 0 16px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Retour au choix
            </button>
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Choisir un service</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 6px" }}>Services disponibles chez <strong style={{ color: C.text }}>{institution.name}</strong></p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", marginBottom: "20px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ color: C.textSubtle, fontSize: "11px" }}>Paiement <strong style={{ color: "#F5A623" }}>sur place uniquement</strong> · Un code de confirmation Yelen sera généré</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {paidServices.map(service => (
                <ServicePayantCard key={service.id} service={service} selected={selectedService?.id === service.id} onSelect={() => setSelectedService(selectedService?.id === service.id ? null : service)} isDark={isDark} C={C}/>
              ))}
            </div>
            <button onClick={() => selectedService && setStepPayant(2)} disabled={!selectedService} className="tap" style={{ width: "100%", marginTop: "24px", padding: "16px", borderRadius: "16px", border: "none", background: selectedService ? "linear-gradient(135deg,#F5A623,#C8940A)" : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", color: selectedService ? "#080812" : C.textSubtle, fontSize: "15px", fontWeight: "800", cursor: selectedService ? "pointer" : "not-allowed", boxShadow: selectedService ? "0 8px 28px rgba(245,166,35,0.4)" : "none" }}>
              {selectedService ? `Continuer · ${selectedService.nom} — ${formatPrix(selectedService.prix)} →` : "Sélectionnez un service"}
            </button>
          </div>
        )}

        {/* ── PAYANT étape 2 ── */}
        {mode === "payant" && stepPayant === 2 && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", border: "1.5px solid rgba(245,166,35,0.25)", borderRadius: "16px", padding: "14px 16px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(245,166,35,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedService?.nom}</div>
                  <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "700" }}>{selectedService ? formatPrix(selectedService.prix) : ""} · {selectedService?.duree_minutes} min</div>
                </div>
              </div>
              <button onClick={() => setStepPayant(1)} style={{ background: "none", border: "none", color: "#F5A623", fontSize: "11px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>Changer</button>
            </div>
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Créneau & motif</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Choisissez un créneau et décrivez votre besoin.</p>
            {hasCreneaux ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
                {groupedCreneaux.map(group => (
                  <div key={group.label}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                      <div style={{ height: "1px", flex: 1, background: C.borderSubtle }}/>
                      <span style={{ color: group.label === "Aujourd'hui" || group.label === "Demain" ? "#F5A623" : C.textSubtle, fontSize: "11px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase" }}>{group.label}</span>
                      <div style={{ height: "1px", flex: 1, background: C.borderSubtle }}/>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      {group.slots.map(slot => {
                        const sel = selectedSlotPayant?.key === slot.key;
                        return (
                          <button key={slot.key} onClick={() => setSelectedSlotPayant(slot)} className="tap" style={{ padding: "13px 12px", borderRadius: "14px", border: sel ? "2px solid #F5A623" : `1px solid ${C.borderCard}`, background: sel ? "rgba(245,166,35,0.1)" : C.cardBg, cursor: "pointer", textAlign: "left", boxShadow: sel ? "0 0 16px rgba(245,166,35,0.25)" : "none", transition: "all 0.15s" }}>
                            <div style={{ color: sel ? "#F5A623" : C.text, fontSize: "15px", fontWeight: "800", marginBottom: "2px" }}>{slot.heureRdv}</div>
                            <div style={{ color: sel ? "rgba(245,166,35,0.7)" : C.textSubtle, fontSize: "10px", fontWeight: "600" }}>
                              {(() => { try { return new Date(slot.dateRdv + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); } catch { return slot.dateRdv; } })()}
                            </div>
                            {sel && <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{ color: "#F5A623", fontSize: "9px", fontWeight: "800" }}>Sélectionné</span></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: C.cardBg, border: `1px dashed ${C.borderCard}`, borderRadius: "14px", padding: "20px", textAlign: "center", marginBottom: "20px" }}>
                <p style={{ color: C.textSubtle, fontSize: "13px", margin: 0 }}>Aucun créneau disponible — contactez l'institution au {institution.phone}</p>
              </div>
            )}
            <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}`, marginBottom: "20px" }}>
              <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>Motif de la visite *</div>
              <textarea value={visitReasonPayant} onChange={e => setVisitReasonPayant(e.target.value)} placeholder="Décrivez votre demande pour ce service…" rows={3} style={{ width: "100%", padding: "12px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "12px", fontSize: "13px", color: C.text, resize: "none", lineHeight: 1.6 }}/>
              <div style={{ color: visitReasonPayant.length < 5 ? "rgba(245,166,35,0.8)" : "#F5A623", fontSize: "10px", marginTop: "5px", textAlign: "right" }}>{visitReasonPayant.length} car. {visitReasonPayant.length >= 5 ? "✓" : "(min. 5)"}</div>
            </div>
            <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}`, marginBottom: "20px" }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", cursor: "pointer" }}>
                <div>
                  <div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>Pour un tiers</div>
                  <div style={{ color: C.textSubtle, fontSize: "11px", marginTop: "2px" }}>Parent, enfant, patient…</div>
                </div>
                <div onClick={() => setForOtherPayant(p => !p)} style={{ width: "44px", height: "24px", borderRadius: "12px", background: forOtherPayant ? "#F5A623" : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                  <div style={{ position: "absolute", top: "2px", left: forOtherPayant ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}/>
                </div>
              </label>
              {forOtherPayant && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input type="text" value={otherNamePayant} onChange={e => setOtherNamePayant(e.target.value)} placeholder="Nom complet *" style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text }}/>
                  <input type="tel" value={otherPhonePayant} onChange={e => setOtherPhonePayant(e.target.value)} placeholder="Téléphone * (+224…)" style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text }}/>
                </div>
              )}
            </div>
            {submitError && <div style={{ marginBottom: "12px", padding: "12px 14px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", color: "rgba(245,166,35,0.8)", fontSize: "13px" }}>{submitError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
              <button onClick={() => setStepPayant(1)} className="tap" style={{ padding: "15px", borderRadius: "14px", border: `1px solid ${C.borderCard}`, background: C.cardBg, color: C.text, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>← Retour</button>
              <button onClick={() => selectedSlotPayant && visitReasonPayant.trim().length >= 5 && setStepPayant(3)} disabled={!selectedSlotPayant || visitReasonPayant.trim().length < 5} className="tap" style={{ padding: "15px", borderRadius: "14px", border: "none", background: (selectedSlotPayant && visitReasonPayant.trim().length >= 5) ? "linear-gradient(135deg,#F5A623,#C8940A)" : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", color: (selectedSlotPayant && visitReasonPayant.trim().length >= 5) ? "#080812" : C.textSubtle, fontSize: "15px", fontWeight: "800", cursor: (selectedSlotPayant && visitReasonPayant.trim().length >= 5) ? "pointer" : "not-allowed" }}>Vérifier & Confirmer →</button>
            </div>
          </div>
        )}

        {/* ── PAYANT étape 3 ── */}
        {mode === "payant" && stepPayant === 3 && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Récapitulatif</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Vérifiez avant de confirmer votre réservation payante.</p>
            <div style={{ background: C.cardBg, borderRadius: "20px", border: "1.5px solid rgba(245,166,35,0.25)", overflow: "hidden", marginBottom: "16px", boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(245,166,35,0.1)" }}>
              <div style={{ height: "4px", background: "linear-gradient(90deg,#F5A623,#F2C94C,#F5A623)" }}/>
              <div style={{ padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "16px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, marginBottom: "16px" }}>
                  <InstitutionLogo inst={institution} size={44}/>
                  <div>
                    <div style={{ color: C.text, fontSize: "15px", fontWeight: "800" }}>{institution.name}</div>
                    <div style={{ color: C.textSubtle, fontSize: "12px" }}>{institution.ville}</div>
                  </div>
                </div>
                {[
                  { label: "Service",      value: selectedService?.nom ?? "—" },
                  { label: "Date & heure", value: selectedSlotPayant ? formatDateLabel(selectedSlotPayant.dateRdv, selectedSlotPayant.heureRdv) : "—" },
                  { label: "Durée",        value: `${selectedService?.duree_minutes} minutes` },
                  { label: "Motif",        value: visitReasonPayant },
                  ...(forOtherPayant ? [{ label: "Pour", value: `${otherNamePayant} · ${otherPhonePayant}` }] : []),
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: "flex", gap: "12px", paddingBottom: i < arr.length - 1 ? "12px" : "0", marginBottom: i < arr.length - 1 ? "12px" : "0", borderBottom: i < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` : "none" }}>
                    <div style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600", minWidth: "90px" }}>{row.label}</div>
                    <div style={{ color: C.text, fontSize: "12px", fontWeight: "700", flex: 1 }}>{row.value}</div>
                  </div>
                ))}
                <div style={{ marginTop: "16px", padding: "14px 16px", background: "rgba(245,166,35,0.08)", border: "1.5px solid rgba(245,166,35,0.25)", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Montant à payer sur place</div>
                    <div style={{ color: "#F5A623", fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>{selectedService ? formatPrix(selectedService.prix) : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "2px" }}>Mode</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                      <span style={{ color: "#F5A623", fontSize: "12px", fontWeight: "800" }}>Espèces sur place</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 14px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.03)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "12px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.7 }}>Un <strong style={{ color: "#F5A623" }}>code de confirmation Yelen à 6 chiffres</strong> sera généré après confirmation. Vous devrez le présenter le jour J pour valider votre RDV et payer.</div>
              </div>
            </div>
            <div style={{ padding: "12px 14px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderSubtle}`, borderRadius: "12px", marginBottom: "16px" }}>
              <p style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.7, margin: 0 }}>En confirmant, vous acceptez les <Link href="/cgu" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>CGU Yelen224</Link> et vous engagez à vous présenter au créneau sélectionné.</p>
            </div>
            {submitError && <div style={{ marginBottom: "12px", padding: "12px 14px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", color: "rgba(245,166,35,0.8)", fontSize: "13px" }}>{submitError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
              <button onClick={() => { setSubmitError(null); setStepPayant(2); }} className="tap" style={{ padding: "15px", borderRadius: "14px", border: `1px solid ${C.borderCard}`, background: C.cardBg, color: C.text, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>← Modifier</button>
              <button onClick={handleSubmitPayant} disabled={submitting} className="tap" style={{ padding: "15px", borderRadius: "14px", border: "none", background: submitting ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : "linear-gradient(135deg,#F5A623,#C8940A)", color: submitting ? C.textSubtle : "#080812", fontSize: "15px", fontWeight: "800", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: submitting ? "none" : "0 8px 28px rgba(245,166,35,0.4)" }}>
                {submitting ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>Génération du code…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Confirmer & obtenir mon code</>}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}