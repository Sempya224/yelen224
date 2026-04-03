"use client";
// ═══════════════════════════════════════════════════════════════════════
// YELEN224 — Services Payants Institution
// Path : /app/institution/services-payants/page.tsx
// ✅ Supabase réel — paid_services + paid_bookings
// ✅ Session institution via institution_sessions / localStorage
// ✅ CRUD complet services + liste réservations
// ✅ Code confirmation 6 chiffres unique
// ✅ Mobile first — fond doré Yelen
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────
type PaidService = {
  id: string;
  institution_id: string;
  nom: string;
  prix: number;
  duree_minutes: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

type PaidBooking = {
  id: string;
  service_id: string;
  citoyen_id: string;
  institution_id: string;
  date_rdv: string;
  heure_rdv: string;
  confirmation_code: string;
  statut: string;
  created_at: string;
  citoyen_nom?: string;
  citoyen_phone?: string;
};

// ─── Design Tokens ─────────────────────────────────────────────────────
const T = {
  gold: "#D4A017",
  goldL: "#F2C94C",
  goldD: "#A07810",
  goldBg: "#FFFBF0",
  goldBg2: "#FFF8E6",
  goldBg3: "#FFF3D0",
  goldSurface: "#FFEDB3",
  border: "rgba(212,160,23,0.15)",
  border2: "rgba(212,160,23,0.28)",
  borderStrong: "rgba(212,160,23,0.45)",
  t1: "#1A1200",
  t2: "#5C4A00",
  t3: "#9A7E20",
  green: "#00875A",
  greenL: "rgba(0,135,90,0.10)",
  red: "#C0392B",
  redL: "rgba(192,57,43,0.10)",
  blue: "#1A6DB5",
  blueL: "rgba(26,109,181,0.10)",
  orange: "#B45309",
  orangeL: "rgba(180,83,9,0.10)",
};

// ─── CSS Global ────────────────────────────────────────────────────────
const CSS = `
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
  html,body{background:${T.goldBg};overflow-x:hidden}
  ::-webkit-scrollbar{display:none}
  *{scrollbar-width:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  @keyframes ping{0%{transform:scale(1);opacity:1}75%,100%{transform:scale(2.4);opacity:0}}
  .tap{transition:opacity .12s,transform .12s;cursor:pointer;touch-action:manipulation;user-select:none}
  .tap:active{opacity:0.65;transform:scale(0.97)}
  input,textarea{font-family:inherit;outline:none;border:none;background:transparent}
  input::placeholder,textarea::placeholder{color:${T.t3}}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
`;

// ─── Helpers ──────────────────────────────────────────────────────────
function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " FCFA";
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}
function statutInfo(s: string) {
  switch (s) {
    case "en_attente": return { c: T.orange, bg: T.orangeL, l: "En attente" };
    case "confirme":   return { c: T.green,  bg: T.greenL,  l: "Confirmé" };
    case "termine":    return { c: T.blue,   bg: T.blueL,   l: "Terminé" };
    case "no_show":    return { c: T.red,    bg: T.redL,    l: "No-show" };
    case "annule":     return { c: T.red,    bg: T.redL,    l: "Annulé" };
    default:           return { c: T.t3,     bg: "rgba(0,0,0,0.05)", l: s };
  }
}
function buildNom(u: { nom: string | null; prenom: string | null; phone: string } | null): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

// ─── Logo Yelen ────────────────────────────────────────────────────────
function YelenLogo({ size = 28, color = T.gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M24 8C17.373 8 12 13.373 12 20c0 4.418 2.239 8.306 5.636 10.636V36a2 2 0 0 0 2 2h8.728a2 2 0 0 0 2-2v-5.364C33.761 28.306 36 24.418 36 20c0-6.627-5.373-12-12-12z" fill={color} opacity="0.9"/>
      <path d="M20 38h8M21 40.5h6M22.5 43h3" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="24" y1="2" x2="24" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="38.5" y1="6.5" x2="36.4" y2="8.6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="44" y1="20" x2="41" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="9.5" y1="6.5" x2="11.6" y2="8.6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="4" y1="20" x2="7" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────
function Toast({ msg, color, onDismiss }: { msg: string; color: string; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div onClick={onDismiss} style={{ position: "fixed", top: "70px", left: "50%", transform: "translateX(-50%)", zIndex: 999, backgroundColor: "#fff", border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: "14px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", animation: "fadeUp 0.22s ease", cursor: "pointer", minWidth: "220px", maxWidth: "calc(100vw - 32px)", zIndex: 998 }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }}/>
      <span style={{ color: T.t1, fontSize: "12px", fontWeight: "700", flex: 1 }}>{msg}</span>
    </div>
  );
}

// ─── Formulaire création service ───────────────────────────────────────
function ServiceForm({
  onSave, onCancel, saving,
}: {
  onSave: (d: { nom: string; prix: number; duree_minutes: number; description: string }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [nom, setNom]     = useState("");
  const [prix, setPrix]   = useState("");
  const [duree, setDuree] = useState("");
  const [desc, setDesc]   = useState("");
  const [err, setErr]     = useState("");

  async function submit() {
    setErr("");
    if (!nom.trim())                           { setErr("Le nom est obligatoire"); return; }
    if (!prix || isNaN(+prix) || +prix <= 0)   { setErr("Entrez un prix valide en FCFA (ex: 5000)"); return; }
    if (!duree || isNaN(+duree) || +duree <= 0){ setErr("Entrez une durée valide en minutes (ex: 30)"); return; }
    await onSave({ nom: nom.trim(), prix: +prix, duree_minutes: +duree, description: desc.trim() });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: T.goldBg,
    border: `1.5px solid ${T.border2}`,
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "14px",
    color: T.t1,
    fontFamily: "inherit",
  };

  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "22px", border: `1.5px solid ${T.border2}`, padding: "20px", marginBottom: "16px", animation: "slideUp 0.28s ease", boxShadow: `0 6px 28px ${T.gold}18` }}>

      {/* En-tête formulaire */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 4px 12px ${T.gold}40` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <div>
          <div style={{ color: T.t1, fontSize: "16px", fontWeight: "900", letterSpacing: "-0.3px" }}>Nouveau service payant</div>
          <div style={{ color: T.t3, fontSize: "11px", marginTop: "1px" }}>Visible sur votre fiche profil</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* Nom */}
        <div>
          <label style={{ display: "block", color: T.t2, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>Nom du service *</label>
          <input
            value={nom}
            onChange={e => setNom(e.target.value)}
            placeholder="Ex: Consultation médicale, Coupe homme, Massage…"
            style={inputStyle}
          />
        </div>

        {/* Prix + Durée côte à côte */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={{ display: "block", color: T.t2, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>Prix (FCFA) *</label>
            <input type="number" value={prix} onChange={e => setPrix(e.target.value)} placeholder="5000" style={inputStyle}/>
          </div>
          <div>
            <label style={{ display: "block", color: T.t2, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>Durée (min) *</label>
            <input type="number" value={duree} onChange={e => setDuree(e.target.value)} placeholder="30" style={inputStyle}/>
          </div>
        </div>

        {/* Description */}
        <div>
          <label style={{ display: "block", color: T.t2, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>
            Description <span style={{ fontWeight: "500", textTransform: "none", fontSize: "10px" }}>(facultatif)</span>
          </label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Décrivez brièvement ce service pour les clients…"
            rows={3}
            style={{ ...inputStyle, resize: "none", lineHeight: 1.65 }}
          />
        </div>

        {/* Info paiement */}
        <div style={{ backgroundColor: T.goldBg3, border: `1px solid ${T.border2}`, borderLeft: `3px solid ${T.gold}`, borderRadius: "12px", padding: "11px 14px", display: "flex", gap: "10px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.goldD} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ color: T.t2, fontSize: "11px", lineHeight: 1.65 }}>
            Le client sera clairement informé que ce RDV est <strong style={{ color: T.goldD }}>payant — paiement sur place</strong>. Un code de confirmation Yelen à 6 chiffres sera généré. Votre numéro sera affiché pour toute question.
          </div>
        </div>

        {/* Erreur */}
        {err && (
          <div style={{ backgroundColor: T.redL, color: T.red, fontSize: "12px", fontWeight: "700", padding: "10px 14px", borderRadius: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {err}
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.7fr", gap: "10px" }}>
          <button onClick={onCancel} className="tap" style={{ backgroundColor: T.goldBg3, color: T.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1.5px solid ${T.border2}`, cursor: "pointer" }}>
            Annuler
          </button>
          <button onClick={submit} disabled={saving} className="tap" style={{ background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#fff", fontWeight: "900", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: `0 5px 18px ${T.gold}45`, opacity: saving ? 0.7 : 1 }}>
            {saving
              ? <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            }
            {saving ? "Création…" : "Créer le service"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Carte service ─────────────────────────────────────────────────────
function ServiceCard({ service, bookings, onToggle, onDelete, toggling }: {
  service: PaidService;
  bookings: PaidBooking[];
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const nbTotal     = bookings.length;
  const nbConfirmes = bookings.filter(b => ["confirme", "termine"].includes(b.statut)).length;
  const nbAttente   = bookings.filter(b => b.statut === "en_attente").length;

  return (
    <div style={{
      backgroundColor: "#fff",
      borderRadius: "20px",
      border: `1.5px solid ${service.is_active ? T.border2 : "rgba(0,0,0,0.07)"}`,
      marginBottom: "12px",
      overflow: "hidden",
      boxShadow: service.is_active ? `0 4px 24px ${T.gold}18` : "0 2px 8px rgba(0,0,0,0.05)",
      opacity: service.is_active ? 1 : 0.72,
      animation: "fadeUp 0.3s ease",
    }}>
      {/* Bande dorée top */}
      <div style={{ height: "3px", background: service.is_active ? `linear-gradient(90deg, ${T.gold}, ${T.goldL}, ${T.gold})` : "rgba(0,0,0,0.07)" }}/>

      <div style={{ padding: "16px" }}>

        {/* Ligne principale */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
          {/* Icône */}
          <div style={{ width: "46px", height: "46px", borderRadius: "14px", background: service.is_active ? `linear-gradient(135deg, ${T.gold}22, ${T.goldD}08)` : "rgba(0,0,0,0.05)", border: `1.5px solid ${service.is_active ? T.border2 : "rgba(0,0,0,0.07)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={service.is_active ? T.goldD : "#bbb"} strokeWidth="1.8" strokeLinecap="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>

          {/* Infos */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: T.t1, fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {service.nom}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ color: T.goldD, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.5px" }}>{formatPrix(service.prix)}</span>
              <span style={{ color: T.t3, fontSize: "11px" }}>·</span>
              <span style={{ color: T.t3, fontSize: "12px", fontWeight: "600" }}>{service.duree_minutes} min</span>
            </div>
          </div>

          {/* Toggle */}
          <div
            onClick={onToggle}
            className="tap"
            style={{ width: "48px", height: "27px", borderRadius: "14px", backgroundColor: service.is_active ? T.gold : "rgba(0,0,0,0.12)", position: "relative", cursor: "pointer", flexShrink: 0, opacity: toggling ? 0.5 : 1, transition: "background-color 0.3s" }}
          >
            <div style={{ position: "absolute", top: "3.5px", left: service.is_active ? "24px" : "3.5px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "left 0.25s ease" }}/>
          </div>
        </div>

        {/* Description */}
        {service.description && (
          <div style={{ color: T.t2, fontSize: "12px", lineHeight: 1.65, marginBottom: "14px", padding: "10px 13px", backgroundColor: T.goldBg, borderRadius: "11px", border: `1px solid ${T.border}` }}>
            {service.description}
          </div>
        )}

        {/* Statut badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }}>
          <div style={{ position: "relative", width: "8px", height: "8px", flexShrink: 0 }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: service.is_active ? T.green : T.t3 }}/>
            {service.is_active && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: T.green, animation: "ping 2s ease-out infinite" }}/>}
          </div>
          <span style={{ color: service.is_active ? T.green : T.t3, fontSize: "11px", fontWeight: "800" }}>
            {service.is_active ? "Service actif — visible sur votre profil" : "Service désactivé"}
          </span>
        </div>

        {/* Métriques */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "14px" }}>
          {[
            { label: "Réservations", value: nbTotal,     color: T.blue },
            { label: "Confirmés",    value: nbConfirmes, color: T.green },
            { label: "En attente",   value: nbAttente,   color: nbAttente > 0 ? T.orange : T.t3 },
          ].map(m => (
            <div key={m.label} style={{ backgroundColor: T.goldBg, borderRadius: "11px", padding: "10px", textAlign: "center", border: `1px solid ${T.border}` }}>
              <div style={{ color: m.color, fontSize: "18px", fontWeight: "900", lineHeight: 1 }}>{m.value}</div>
              <div style={{ color: T.t3, fontSize: "9px", fontWeight: "700", marginTop: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px" }}>
          {nbTotal > 0 && (
            <button onClick={() => setExpanded(e => !e)} className="tap" style={{ flex: 1, backgroundColor: T.goldBg3, border: `1.5px solid ${T.border2}`, color: T.goldD, fontWeight: "700", fontSize: "12px", padding: "11px", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.goldD} strokeWidth="2.5" strokeLinecap="round">
                {expanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
              </svg>
              {expanded ? "Masquer" : `Voir ${nbTotal} RDV`}
            </button>
          )}
          <button onClick={onDelete} className="tap" style={{ backgroundColor: T.redL, border: `1px solid ${T.red}22`, color: T.red, fontWeight: "700", fontSize: "12px", padding: "11px 15px", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Supprimer
          </button>
        </div>
      </div>

      {/* Liste réservations dépliable */}
      {expanded && nbTotal > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}`, animation: "fadeUp 0.22s ease" }}>
          <div style={{ padding: "12px 16px 8px", color: T.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.7px" }}>
            Réservations — {service.nom}
          </div>
          {bookings.map((b, i) => {
            const si = statutInfo(b.statut);
            return (
              <div key={b.id} style={{ padding: "11px 16px", borderBottom: i < bookings.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: `linear-gradient(135deg, ${T.gold}20, ${T.gold}06)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "900", color: T.goldD, flexShrink: 0, border: `1px solid ${T.border}` }}>
                  {(b.citoyen_nom || "C").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.citoyen_nom || "Citoyen"}</div>
                  <div style={{ color: T.t3, fontSize: "11px", marginTop: "1px" }}>{formatDate(b.date_rdv)} · {b.heure_rdv}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                  <span style={{ backgroundColor: si.bg, color: si.c, fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "20px", textTransform: "uppercase" }}>{si.l}</span>
                  <span style={{ color: T.t3, fontSize: "10px", fontFamily: "monospace", letterSpacing: "1.5px", backgroundColor: T.goldBg3, padding: "2px 7px", borderRadius: "6px", border: `1px solid ${T.border}` }}>#{b.confirmation_code}</span>
                </div>
              </div>
            );
          })}
          <div style={{ padding: "8px" }}/>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════
export default function ServicesPayantsPage() {
  const router = useRouter();

  const [instId, setInstId]         = useState<string | null>(null);
  const [inst, setInst]             = useState<any>(null);
  const [services, setServices]     = useState<PaidService[]>([]);
  const [bookings, setBookings]     = useState<PaidBooking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [toggling, setToggling]     = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; color: string } | null>(null);
  const [tab, setTab]               = useState<"services" | "reservations">("services");

  function showToast(msg: string, color = T.green) { setToast({ msg, color }); }

  // ── Récupère l'institution connectée (même pattern que profil/annonce) ──
  useEffect(() => {
    const id = localStorage.getItem("yelen224_institution_id");
    if (!id) { router.push("/institution/connexion"); return; }
    setInstId(id);
  }, [router]);

  // ── Charge toutes les données ──
  const loadData = useCallback(async () => {
    if (!instId) return;
    setLoading(true);
    try {
      // Info institution
      const { data: instData } = await supabase
        .from("institutions")
        .select("id, name, phone, logo, badge_verifie, category, statut")
        .eq("id", instId)
        .maybeSingle();
      if (instData) setInst(instData);

      // Services payants
      const { data: servData } = await supabase
        .from("paid_services")
        .select("*")
        .eq("institution_id", instId)
        .order("created_at", { ascending: false });
      const servList: PaidService[] = servData ?? [];
      setServices(servList);

      // Réservations liées à ces services
      if (servList.length > 0) {
        const sids = servList.map(s => s.id);
        const { data: bkRaw } = await supabase
          .from("paid_bookings")
          .select("*")
          .in("service_id", sids)
          .order("created_at", { ascending: false });

        if (bkRaw?.length) {
          const cids = [...new Set(bkRaw.map((b: any) => b.citoyen_id))];
          const { data: usersData } = await supabase
            .from("users")
            .select("id, nom, prenom, phone")
            .in("id", cids);
          const uMap: Record<string, { nom: string; phone: string }> = {};
          (usersData ?? []).forEach((u: any) => {
            uMap[u.id] = { nom: buildNom(u), phone: u.phone || "" };
          });
          setBookings(bkRaw.map((b: any) => ({
            ...b,
            citoyen_nom:   uMap[b.citoyen_id]?.nom   ?? "Citoyen",
            citoyen_phone: uMap[b.citoyen_id]?.phone ?? "",
          })));
        } else {
          setBookings([]);
        }
      } else {
        setBookings([]);
      }
    } finally {
      setLoading(false);
    }
  }, [instId]);

  useEffect(() => { if (instId) loadData(); }, [instId, loadData]);

  // ── Créer un service ──
  async function handleCreate(data: { nom: string; prix: number; duree_minutes: number; description: string }) {
    if (!instId) return;
    setSaving(true);
    const { error } = await supabase.from("paid_services").insert({
      institution_id: instId,
      nom: data.nom,
      prix: data.prix,
      duree_minutes: data.duree_minutes,
      description: data.description || null,
      is_active: true,
    });
    if (error) { showToast("Erreur : " + error.message, T.red); setSaving(false); return; }
    setShowForm(false);
    showToast("Service créé avec succès ✓", T.green);
    await loadData();
    setSaving(false);
  }

  // ── Toggle actif/inactif ──
  async function handleToggle(service: PaidService) {
    setToggling(service.id);
    await supabase.from("paid_services").update({ is_active: !service.is_active }).eq("id", service.id);
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: !s.is_active } : s));
    showToast(service.is_active ? "Service désactivé" : "Service activé ✓", service.is_active ? T.orange : T.green);
    setToggling(null);
  }

  // ── Supprimer un service ──
  async function handleDelete(id: string) {
    const hasBk = bookings.some(b => b.service_id === id);
    const msg = hasBk
      ? "Ce service a des réservations. Supprimer quand même ?"
      : "Supprimer ce service définitivement ?";
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from("paid_services").delete().eq("id", id);
    if (error) { showToast("Erreur suppression", T.red); return; }
    setServices(prev => prev.filter(s => s.id !== id));
    setBookings(prev => prev.filter(b => b.service_id !== id));
    showToast("Service supprimé", T.orange);
  }

  // ── Métriques globales ──
  const servicesActifs   = services.filter(s => s.is_active).length;
  const totalResa        = bookings.length;
  const totalConfirmes   = bookings.filter(b => ["confirme", "termine"].includes(b.statut)).length;
  const revenuEstime     = bookings
    .filter(b => ["confirme", "termine"].includes(b.statut))
    .reduce((acc, b) => acc + (services.find(s => s.id === b.service_id)?.prix ?? 0), 0);

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: T.goldBg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
      <style>{CSS}</style>
      <div style={{ position: "relative", width: "50px", height: "50px" }}>
        <div style={{ position: "absolute", inset: 0, border: `3px solid ${T.border2}`, borderTopColor: T.gold, borderRadius: "50%", animation: "spin 0.85s linear infinite" }}/>
        <div style={{ position: "absolute", inset: "8px", border: `2px solid ${T.border}`, borderTopColor: `${T.gold}80`, borderRadius: "50%", animation: "spin 1.4s linear infinite reverse" }}/>
      </div>
      <YelenLogo size={28} color={T.gold} />
      <div style={{ color: T.t3, fontSize: "12px", fontWeight: "600", letterSpacing: "0.5px" }}>Chargement des services…</div>
    </div>
  );

  const allBookingsSorted = [...bookings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div style={{ minHeight: "100svh", backgroundColor: T.goldBg, fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", color: T.t1, paddingBottom: "48px" }}>
      <style>{CSS}</style>

      {toast && <Toast msg={toast.msg} color={toast.color} onDismiss={() => setToast(null)}/>}

      {/* ════════ HEADER ════════ */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, backgroundColor: "rgba(255,251,240,0.97)", backdropFilter: "blur(24px) saturate(180%)", borderBottom: `1px solid ${T.border2}` }}>
        <div style={{ padding: "0 16px", height: "58px", display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.back()} className="tap" style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: T.goldBg3, border: `1.5px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: T.t1, fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px" }}>Services Payants</div>
            <div style={{ color: T.t3, fontSize: "10px", fontWeight: "600" }}>
              {inst?.name ?? "Mon institution"} · Paiement sur place
            </div>
          </div>
          <YelenLogo size={26} color={T.gold}/>
        </div>
      </header>

      <div style={{ padding: "16px" }}>

        {/* ── BANNIÈRE INSTITUTION ── */}
        {inst && (
          <div style={{ backgroundColor: "#fff", borderRadius: "18px", border: `1.5px solid ${T.border2}`, padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px", boxShadow: `0 4px 20px ${T.gold}14` }}>
            {inst.logo
              ? <img src={inst.logo} alt="" style={{ width: "44px", height: "44px", borderRadius: "12px", objectFit: "cover", border: `1.5px solid ${T.border}`, flexShrink: 0 }}/>
              : <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: `linear-gradient(135deg, ${T.gold}28, ${T.goldD}12)`, border: `1.5px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><YelenLogo size={22} color={T.gold}/></div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: T.t1, fontSize: "14px", fontWeight: "900", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</div>
              <div style={{ color: T.t3, fontSize: "11px", marginTop: "1px" }}>{inst.category}</div>
            </div>
            {inst.badge_verifie && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", backgroundColor: T.greenL, color: T.green, fontSize: "10px", fontWeight: "800", padding: "4px 10px", borderRadius: "20px", flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Vérifié
              </div>
            )}
          </div>
        )}

        {/* ── KPI GLOBAUX ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", marginBottom: "16px" }}>
          {[
            { label: "Services actifs",  value: String(servicesActifs),                                   color: T.gold,  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.goldD} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
            { label: "Réservations",     value: String(totalResa),                                         color: T.blue,  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
            { label: "Confirmés",        value: String(totalConfirmes),                                    color: T.green, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="1.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
            { label: "Revenu estimé",    value: revenuEstime > 0 ? formatPrix(revenuEstime) : "—",         color: T.goldD, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.goldD} strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg> },
          ].map(k => (
            <div key={k.label} style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "14px 16px", border: `1.5px solid ${T.border}`, boxShadow: `0 2px 12px ${T.gold}0A` }}>
              <div style={{ marginBottom: "8px" }}>{k.icon}</div>
              <div style={{ color: k.color, fontSize: k.value.length > 8 ? "13px" : "22px", fontWeight: "900", letterSpacing: "-0.5px", lineHeight: 1 }}>{k.value}</div>
              <div style={{ color: T.t3, fontSize: "10px", fontWeight: "700", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── INFO SYSTÈME ── */}
        <div style={{ backgroundColor: T.goldBg3, border: `1.5px solid ${T.border2}`, borderLeft: `4px solid ${T.gold}`, borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", gap: "12px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 3px 10px ${T.gold}35` }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div>
            <div style={{ color: T.goldD, fontSize: "12px", fontWeight: "800", marginBottom: "4px" }}>Système Yelen sécurisé</div>
            <div style={{ color: T.t2, fontSize: "11px", lineHeight: 1.7 }}>
              Chaque réservation génère un <strong style={{ color: T.goldD }}>code à 6 chiffres unique</strong>. Le client paie sur place. Sans code Yelen confirmé, le RDV n'est pas validé.
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px", backgroundColor: T.goldBg3, borderRadius: "14px", padding: "4px", border: `1px solid ${T.border}` }}>
          {([
            { key: "services",     label: "Mes services",  count: services.length },
            { key: "reservations", label: "Réservations",  count: totalResa },
          ] as { key: typeof tab; label: string; count: number }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="tap"
              style={{ flex: 1, backgroundColor: tab === t.key ? "#fff" : "transparent", border: tab === t.key ? `1.5px solid ${T.border2}` : "1.5px solid transparent", borderRadius: "11px", padding: "10px 8px", color: tab === t.key ? T.goldD : T.t3, fontSize: "12px", fontWeight: tab === t.key ? "800" : "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", boxShadow: tab === t.key ? `0 2px 10px ${T.gold}22` : "none", transition: "all 0.2s" }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{ backgroundColor: tab === t.key ? T.gold : T.border2, color: tab === t.key ? "#fff" : T.t2, fontSize: "9px", fontWeight: "900", padding: "2px 7px", borderRadius: "20px" }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ════════ TAB SERVICES ════════ */}
        {tab === "services" && (
          <>
            {/* Bouton créer (si pas de form) */}
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="tap"
                style={{ width: "100%", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#fff", fontWeight: "900", fontSize: "15px", padding: "16px", borderRadius: "16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: `0 6px 24px ${T.gold}40`, marginBottom: "16px", letterSpacing: "-0.2px" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Créer un service payant
              </button>
            )}

            {/* Formulaire */}
            {showForm && (
              <ServiceForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={saving}/>
            )}

            {/* Liste vide */}
            {services.length === 0 && !showForm && (
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", border: `1.5px solid ${T.border}`, padding: "44px 24px", textAlign: "center" }}>
                <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: `linear-gradient(135deg, ${T.gold}20, ${T.gold}06)`, border: `1.5px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </div>
                <div style={{ color: T.t1, fontSize: "16px", fontWeight: "900", marginBottom: "8px" }}>Aucun service payant</div>
                <div style={{ color: T.t3, fontSize: "13px", lineHeight: 1.65, marginBottom: "20px" }}>Créez votre premier service payant pour commencer à recevoir des réservations via Yelen.</div>
                <button onClick={() => setShowForm(true)} className="tap" style={{ background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#fff", fontWeight: "800", fontSize: "14px", padding: "13px 28px", borderRadius: "14px", border: "none", cursor: "pointer", boxShadow: `0 5px 20px ${T.gold}35` }}>
                  Créer mon premier service
                </button>
              </div>
            )}

            {/* Cartes services */}
            {services.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                bookings={bookings.filter(b => b.service_id === service.id)}
                onToggle={() => handleToggle(service)}
                onDelete={() => handleDelete(service.id)}
                toggling={toggling === service.id}
              />
            ))}
          </>
        )}

        {/* ════════ TAB RÉSERVATIONS ════════ */}
        {tab === "reservations" && (
          <>
            {allBookingsSorted.length === 0 ? (
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", border: `1.5px solid ${T.border}`, padding: "44px 24px", textAlign: "center" }}>
                <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: `linear-gradient(135deg, ${T.gold}20, ${T.gold}06)`, border: `1.5px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div style={{ color: T.t1, fontSize: "16px", fontWeight: "900", marginBottom: "8px" }}>Aucune réservation</div>
                <div style={{ color: T.t3, fontSize: "13px", lineHeight: 1.65 }}>Les réservations de vos services payants apparaîtront ici avec leur code Yelen.</div>
              </div>
            ) : (
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", border: `1.5px solid ${T.border2}`, overflow: "hidden", boxShadow: `0 4px 24px ${T.gold}15` }}>
                {allBookingsSorted.map((b, i) => {
                  const si  = statutInfo(b.statut);
                  const svc = services.find(s => s.id === b.service_id);
                  return (
                    <div key={b.id} style={{ padding: "14px 16px", borderBottom: i < allBookingsSorted.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "42px", height: "42px", borderRadius: "13px", background: `linear-gradient(135deg, ${T.gold}20, ${T.gold}06)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "900", color: T.goldD, flexShrink: 0, border: `1px solid ${T.border}` }}>
                        {(b.citoyen_nom || "C").slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.citoyen_nom || "Citoyen"}</div>
                        <div style={{ color: T.t3, fontSize: "11px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {svc?.nom ?? "Service"}{svc ? ` · ${formatPrix(svc.prix)}` : ""}
                        </div>
                        <div style={{ color: T.t3, fontSize: "10px", marginTop: "2px" }}>{formatDate(b.date_rdv)} · {b.heure_rdv} · {timeAgo(b.created_at)}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
                        <span style={{ backgroundColor: si.bg, color: si.c, fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "20px", textTransform: "uppercase" }}>{si.l}</span>
                        <span style={{ color: T.t2, fontSize: "10px", fontFamily: "monospace", letterSpacing: "1.5px", backgroundColor: T.goldBg3, padding: "2px 8px", borderRadius: "7px", border: `1px solid ${T.border}` }}>#{b.confirmation_code}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── FOOTER EXPLICATIF ── */}
        <div style={{ marginTop: "24px", backgroundColor: T.goldBg3, borderRadius: "18px", padding: "18px", border: `1.5px solid ${T.border2}`, display: "flex", gap: "14px" }}>
          <YelenLogo size={26} color={T.gold}/>
          <div>
            <div style={{ color: T.goldD, fontSize: "13px", fontWeight: "900", marginBottom: "8px", letterSpacing: "-0.2px" }}>Comment ça fonctionne ?</div>
            {[
              "Vous créez un service payant ici",
              "Il apparaît sur votre fiche profil Yelen",
              "Le client réserve → code Yelen généré",
              "Le jour J : paiement sur place + code confirmé",
              "Sans code Yelen = RDV non validé dans le système",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: i < 4 ? "8px" : "0" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "6px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: "900", color: "#fff", flexShrink: 0, marginTop: "1px" }}>{i + 1}</div>
                <div style={{ color: T.t2, fontSize: "12px", lineHeight: 1.6 }}>{step}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}