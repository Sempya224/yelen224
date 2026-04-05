






"use client";
// ═══════════════════════════════════════════════════════════════════════
// YELEN224 — Dashboard Institution — PRODUCTION v5.1
// Path : /app/institution/[id]/dashboard/page.tsx
//
// ✅ Données réelles Supabase (colonnes exactes rdv + institutions + users)
// ✅ citoyen_nom construit depuis users.prenom + users.nom ou users.phone
// ✅ Avis : colonne lu absente en base → calcul côté client (7 derniers jours)
// ✅ Stats RDV : Nouveau / Attente / Terminé / Annulé / Total
// ✅ Bandeau nouveau RDV en haut (pop-up plein écran au clic)
// ✅ Salutation dynamique avec inst.name + heure du jour
// ✅ Logo Yelen soleil-ampoule dans le guide
// ✅ Mode dark toggle dans les paramètres
// ✅ Liens corrigés avec instId
// ✅ Sécurité désactivée (RLS off) — données directes
// ✅ Messagerie retirée — sera intégrée via service tiers ultérieurement
// ✅ Bandeau progression profil + statut Yelen intégré sous le header
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Html5QrcodeScanner } from "html5-qrcode";

// ─── Types ────────────────────────────────────────────────────────────

type RDV = {
  id: string;
  objet: string;
  date_rdv: string;
  heure_rdv: string;
  statut: string;
  citoyen_nom: string;
  citoyen_id: string;
  citoyen_phone?: string;
  notes?: string;
  presence?: boolean;
  presence_status?: string;
  conversation_terminee?: boolean;
  motif_annulation?: string;
  created_at?: string;
};

type AvisItem = {
  id: string;
  note: number;
  commentaire: string | null;
  created_at: string;
  citoyen_nom: string;
  rdv_confirmed: boolean;
  lu: boolean;
};

type Client = {
  id: string;
  nom: string;
  phone: string;
  nb_rdv: number;
  dernier_rdv: string;
  statuts: string[];
  note_privee?: string;
  premiere_visite: string;
  est_nouveau: boolean;
};

type Institution = {
  id: string;
  name: string;
  category: string;
  ville: string;
  logo: string | null;
  badge_verifie: boolean;
  moyenne_avis: number;
  nb_avis: number;
  description?: string;
  phone?: string;
  email?: string;
  website?: string;
  site_web?: string;
  created_at?: string;
  statut?: string;
  plan?: string;
  adresse?: string;
  quartier?: string;
};

type Stats = {
  today: number; week: number; month: number;
  pending: number; confirmed: number; done: number; cancelled: number;
  nouveau: number;
  avis_count: number; moyenne_avis: number; avis_non_lus: number;
  taux_confirmation: number; taux_annulation: number; taux_satisfaction: number;
  rdv_total: number; evolution_week: number; evolution_month: number;
  peak_hour: string; peak_day: string;
  rdv_par_jour: { day: string; count: number }[];
  rdv_par_heure: { hour: string; count: number }[];
  notes_distribution: { note: number; count: number; pct: number }[];
  recent_activity: { type: string; label: string; time: string; color: string }[];
  ratio_refus: number;
  compte_restreint: boolean;
  score_sante: number;
};

// ─── Design Tokens ────────────────────────────────────────────────────
const T = {
  gold: "#D4A017", goldL: "#F2C94C", goldD: "#A07810",
  bg: "#0A0A0F", bgCard: "#111118", bgCard2: "#16161F", bg3: "#1C1C28",
  border: "rgba(255,255,255,0.07)", border2: "rgba(255,255,255,0.12)",
  t1: "#FFFFFF", t2: "#9999B3", t3: "#55556A",
  green: "#00C896", greenL: "rgba(0,200,150,0.12)",
  red: "#FF4757", redL: "rgba(255,71,87,0.12)",
  blue: "#4F8EF7", blueL: "rgba(79,142,247,0.12)",
  purple: "#9B6DFF", purpleL: "rgba(155,109,255,0.12)",
  orange: "#FF8C42", orangeL: "rgba(255,140,66,0.12)",
  teal: "#00D4C8", tealL: "rgba(0,212,200,0.12)",
};

// ─── CSS Global ────────────────────────────────────────────────────────
const CSS = `
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
  html,body{background:${T.bg};overflow-x:hidden;overscroll-behavior:none}
  ::-webkit-scrollbar{display:none}
  *{scrollbar-width:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideDownBanner{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:translateY(0)}}
  @keyframes ping{0%{transform:scale(1);opacity:1}75%,100%{transform:scale(2.2);opacity:0}}
  @keyframes glow{0%,100%{box-shadow:0 0 8px ${T.gold}40}50%{box-shadow:0 0 24px ${T.gold}70}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .tap{transition:opacity .12s,transform .12s;cursor:pointer;touch-action:manipulation;user-select:none}
  .tap:active{opacity:0.65;transform:scale(0.97)}
  input::placeholder{color:${T.t3}}
  textarea::placeholder{color:${T.t3}}
  input,textarea{color:${T.t1};background:transparent;border:none;outline:none;font-family:inherit}
  #qr-reader-modal video{border-radius:12px!important}
  #qr-reader-modal{border:none!important;background:transparent!important}
  #qr-reader-modal__dashboard_section_csr button{
    background:${T.gold}!important;color:#000!important;border:none!important;
    padding:10px 20px!important;border-radius:10px!important;font-weight:800!important;
    font-size:14px!important;cursor:pointer!important;font-family:inherit!important;
  }
`;

// ─── Logo Yelen Soleil-Ampoule ─────────────────────────────────────────
function YelenLogo({ size = 32, color = T.gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 8C17.373 8 12 13.373 12 20c0 4.418 2.239 8.306 5.636 10.636V36a2 2 0 0 0 2 2h8.728a2 2 0 0 0 2-2v-5.364C33.761 28.306 36 24.418 36 20c0-6.627-5.373-12-12-12z" fill={color} opacity="0.9"/>
      <path d="M20 38h8M21 40.5h6M22.5 43h3" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="24" y1="2" x2="24" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="38.5" y1="6.5" x2="36.4" y2="8.6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="44" y1="20" x2="41" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="38.5" y1="33.5" x2="36.4" y2="31.4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="9.5" y1="6.5" x2="11.6" y2="8.6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="4" y1="20" x2="7" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="9.5" y1="33.5" x2="11.6" y2="31.4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function stInfo(s: string) {
  switch (s) {
    case "confirme":   return { c: T.green,  bg: T.greenL,  l: "Confirmé" };
    case "en_attente": return { c: T.gold,   bg: "rgba(212,160,23,0.12)", l: "En attente" };
    case "annule":     return { c: T.red,    bg: T.redL,    l: "Annulé" };
    case "effectue":   return { c: T.blue,   bg: T.blueL,   l: "Effectué" };
    case "termine":    return { c: T.purple, bg: T.purpleL, l: "Terminé" };
    case "honore":     return { c: T.green,  bg: T.greenL,  l: "Honoré" };
    default:           return { c: T.t2,     bg: "rgba(153,153,179,0.1)", l: s };
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}j`;
  if (d < 30) return `${Math.floor(d / 7)}sem`;
  return `${Math.floor(d / 30)}mois`;
}

function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString("fr-FR", opts || { day: "numeric", month: "short", year: "numeric" });
}

function getSalutation(name: string): string {
  const h = new Date().getHours();
  if (h < 6)  return `Bonne nuit, ${name} 🌙`;
  if (h < 12) return `Bonjour, ${name} ☀️`;
  if (h < 18) return `Bon après-midi, ${name} 👋`;
  return `Bonsoir, ${name} 🌆`;
}

function buildNom(u: { nom: string | null; prenom: string | null; phone: string } | null): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}
function ProfilProgressionBandeau({ inst, instId }: { inst: Institution | null; instId: string }) {
  if (!inst) return null;

  const steps = [
    { id: "photo",  label: "Photo",         done: !!inst.logo },
    { id: "docs",   label: "Documents",     done: !!inst.description && inst.description.length > 10 },
    { id: "dispo",  label: "Disponibilités",done: !!inst.adresse },
  ];
  const doneCnt = steps.filter(s => s.done).length;
  const pct     = Math.round((doneCnt / steps.length) * 100);
  const complet = pct === 100;

  const statutCfg: Record<string, { color: string; bg: string; border: string; label: string; ping: boolean }> = {
    valide:     { color: T.green,  bg: "rgba(0,200,150,0.10)",  border: "rgba(0,200,150,0.25)",  label: "Active",        ping: false },
    active:     { color: T.green,  bg: "rgba(0,200,150,0.10)",  border: "rgba(0,200,150,0.25)",  label: "Active",        ping: false },
    en_attente: { color: T.gold,   bg: "rgba(212,160,23,0.10)", border: "rgba(212,160,23,0.25)", label: "En attente de validation", ping: true  },
    refuse:     { color: T.red,    bg: "rgba(255,71,87,0.10)",  border: "rgba(255,71,87,0.25)",  label: "Dossier refusé",           ping: false },
  };
  const sc = statutCfg[inst.statut ?? "en_attente"] ?? statutCfg["en_attente"];
  const barColor = pct === 100 ? T.green : pct >= 60 ? T.gold : T.orange;

  if (complet) {
    return (
      <div style={{ backgroundColor: sc.bg, borderBottom: `1px solid ${sc.border}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ position: "relative", flexShrink: 0, width: "8px", height: "8px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: sc.color }}/>
          {sc.ping && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: sc.color, animation: "ping 1.5s ease-out infinite" }}/>}
        </div>
        <span style={{ color: sc.color, fontSize: "11px", fontWeight: "800", flex: 1 }}>{sc.label}</span>
        {(inst.statut === "valide" || inst.statut === "active") && (
          <span style={{ backgroundColor: T.green, color: "#fff", fontSize: "9px", fontWeight: "900", padding: "2px 8px", borderRadius: "20px" }}>✓ VÉRIFIÉ</span>
        )}
        {inst.statut === "refuse" && (
          <a href="mailto:support@yelen224.com" style={{ color: T.red, fontSize: "10px", fontWeight: "800", textDecoration: "none" }}>Contacter →</a>
        )}
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: T.bgCard2, borderBottom: `1px solid ${T.border2}`, padding: "10px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "7px" }}>
        <span style={{ color: T.t2, fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>Profil</span>
        <div style={{ flex: 1, height: "5px", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: "3px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, backgroundColor: barColor, borderRadius: "3px", transition: "width 0.4s ease" }}/>
        </div>
        <span style={{ color: barColor, fontSize: "11px", fontWeight: "900", flexShrink: 0, minWidth: "30px", textAlign: "right" }}>{pct}%</span>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", backgroundColor: sc.bg, border: `1px solid ${sc.border}`, borderRadius: "20px", padding: "3px 9px", flexShrink: 0 }}>
          <div style={{ position: "relative", width: "6px", height: "6px", flexShrink: 0 }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: sc.color }}/>
            {sc.ping && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: sc.color, animation: "ping 1.5s ease-out infinite" }}/>}
          </div>
          <span style={{ color: sc.color, fontSize: "10px", fontWeight: "800", whiteSpace: "nowrap" }}>{sc.label}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        {steps.map(s => (
          <Link
            key={s.id}
            href={
              s.id === "photo" ? `/institution/profil` :
              s.id === "docs"  ? `/institution/document` :
              `/institution/disponibilites`
            }
            style={{ flex: 1, display: "flex", alignItems: "center", gap: "4px", backgroundColor: s.done ? "rgba(0,200,150,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${s.done ? "rgba(0,200,150,0.2)" : T.border}`, borderRadius: "8px", padding: "5px 7px", textDecoration: "none" }}
          >
            <div style={{ width: "14px", height: "14px", borderRadius: "50%", backgroundColor: s.done ? T.green : "rgba(255,255,255,0.08)", border: `1.5px solid ${s.done ? T.green : "rgba(255,255,255,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {s.done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <span style={{ color: s.done ? T.green : T.t3, fontSize: "10px", fontWeight: s.done ? "700" : "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────
function Stars({ note, size = 12 }: { note: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={i <= Math.round(note) ? T.gold : "rgba(255,255,255,0.1)"}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/>
        </svg>
      ))}
    </div>
  );
}

function SectionHeader({ label, accent, action, onAction, badge }: { label: string; accent: string; action?: string; onAction?: () => void; badge?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "3px", height: "16px", background: accent, borderRadius: "2px" }}/>
        <span style={{ color: T.t1, fontSize: "14px", fontWeight: "800", letterSpacing: "-0.3px" }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ backgroundColor: accent, color: accent === T.gold ? "#000" : "#fff", fontSize: "9px", fontWeight: "900", padding: "2px 7px", borderRadius: "20px" }}>{badge}</span>
        )}
      </div>
      {action && <button onClick={onAction} style={{ background: "none", border: "none", color: accent, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>{action}</button>}
    </div>
  );
}

function RadialProgress({ value, max = 100, color, size = 52, label }: { value: number; max?: number; color: string; size?: number; label?: string }) {
  const pct = Math.min(value / max, 1);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${pct * circ} ${circ - pct * circ}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: T.t1, fontSize: size < 50 ? "10px" : "12px", fontWeight: "800" }}>{label ?? `${Math.round(pct * 100)}%`}</span>
      </div>
    </div>
  );
}

function Toast({ msg, color, onDismiss }: { msg: string; color: string; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 4000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div onClick={onDismiss} style={{ position: "fixed", top: "66px", left: "50%", transform: "translateX(-50%)", zIndex: 950, backgroundColor: T.bgCard2, border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: "12px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", animation: "slideDown 0.25s ease", cursor: "pointer", minWidth: "220px", maxWidth: "calc(100vw - 32px)" }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }}/>
      <span style={{ color: T.t1, fontSize: "12px", fontWeight: "700", flex: 1 }}>{msg}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BANDEAU NOUVEAU RDV
// ═══════════════════════════════════════════════════════════════════════
function NouveauRdvBanner({ rdv, onClose, onOpen }: { rdv: RDV; onClose: () => void; onOpen: () => void }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 210, animation: "slideDownBanner 0.4s ease" }}>
      <div onClick={onOpen} className="tap" style={{ backgroundColor: T.gold, padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#000" }}/>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: "#000", animation: "ping 1.2s ease-out infinite" }}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: "#000", fontSize: "12px", fontWeight: "900" }}>🆕 Nouveau RDV — {rdv.citoyen_nom}</span>
          <span style={{ color: "rgba(0,0,0,0.6)", fontSize: "10px", marginLeft: "8px" }}>{rdv.objet || "RDV général"} · {formatDate(rdv.date_rdv, { day: "numeric", month: "short" })} {rdv.heure_rdv}</span>
        </div>
        <span style={{ color: "#000", fontSize: "10px", fontWeight: "800", backgroundColor: "rgba(0,0,0,0.15)", padding: "3px 8px", borderRadius: "20px", flexShrink: 0 }}>Voir →</span>
        <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: "rgba(0,0,0,0.15)", border: "none", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  );
}

function RdvDetailFullscreen({ rdv, onClose, onAccept, onRefuse, loading }: {
  rdv: RDV; onClose: () => void; onAccept: () => void; onRefuse: (motif: string) => void; loading: boolean
}) {
  const [showRefusForm, setShowRefusForm] = useState(false);
  const [motifSelectionne, setMotifSelectionne] = useState("");
  const [motifCustom, setMotifCustom] = useState("");

  const motifs = [
    "Créneau non disponible",
    "Client déjà enregistré / doublon",
    "Hors de mes services",
    "Urgence / force majeure",
    "Autre motif",
  ];

  const motifFinal = motifSelectionne === "Autre motif" ? motifCustom : motifSelectionne;

  if (showRefusForm) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.92)", backdropFilter: "blur(20px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
        <div onClick={e => e.stopPropagation()} style={{ backgroundColor: T.bgCard, borderRadius: "28px 28px 0 0", padding: "28px 24px 48px", width: "100%", maxWidth: "520px", border: `1px solid ${T.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease", maxHeight: "92svh", overflowY: "auto" }}>
          <div style={{ width: "40px", height: "4px", borderRadius: "2px", backgroundColor: T.t3, margin: "0 auto 24px" }}/>

          {/* Alerte avertissement */}
          <div style={{ backgroundColor: `${T.red}10`, border: `1px solid ${T.red}30`, borderLeft: `3px solid ${T.red}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "20px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <div style={{ color: T.red, fontSize: "11px", fontWeight: "900", marginBottom: "3px" }}>Attention — Impact sur votre compte</div>
              <div style={{ color: T.t2, fontSize: "10px", lineHeight: 1.6 }}>Les refus répétés sans motif valable peuvent entraîner une <strong style={{ color: T.red }}>restriction ou désactivation</strong> de votre compte Yelen. Chaque refus est enregistré.</div>
            </div>
          </div>

          <div style={{ color: T.t1, fontSize: "17px", fontWeight: "900", marginBottom: "6px" }}>Motif du refus</div>
          <div style={{ color: T.t3, fontSize: "11px", marginBottom: "16px" }}>Sélectionnez un motif pour <strong style={{ color: T.t2 }}>{rdv.citoyen_nom}</strong></div>

          {/* Motifs */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
            {motifs.map(m => (
              <div key={m} onClick={() => setMotifSelectionne(m)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: motifSelectionne === m ? `${T.red}12` : T.bg3, border: `1px solid ${motifSelectionne === m ? T.red + "40" : T.border}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${motifSelectionne === m ? T.red : T.t3}`, backgroundColor: motifSelectionne === m ? T.red : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {motifSelectionne === m && <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#fff" }}/>}
                </div>
                <span style={{ color: motifSelectionne === m ? T.t1 : T.t2, fontSize: "13px", fontWeight: motifSelectionne === m ? "700" : "500" }}>{m}</span>
              </div>
            ))}
          </div>

          {motifSelectionne === "Autre motif" && (
            <textarea
              value={motifCustom}
              onChange={e => setMotifCustom(e.target.value)}
              placeholder="Décrivez brièvement le motif..."
              rows={3}
              style={{ width: "100%", backgroundColor: T.bg3, border: `1px solid ${T.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: T.t1, marginBottom: "14px" }}
            />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
            <button onClick={() => setShowRefusForm(false)} className="tap" style={{ backgroundColor: T.bg3, border: `1px solid ${T.border}`, color: T.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", cursor: "pointer" }}>
              Annuler
            </button>
            <button
              onClick={() => motifFinal && onRefuse(motifFinal)}
              disabled={!motifFinal || loading}
              className="tap"
              style={{ backgroundColor: motifFinal ? T.redL : "rgba(255,255,255,0.04)", color: motifFinal ? T.red : T.t3, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${motifFinal ? T.red + "30" : T.border}`, cursor: motifFinal ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {loading ? "..." : "Confirmer le refus"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.92)", backdropFilter: "blur(20px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: T.bgCard, borderRadius: "28px 28px 0 0", padding: "28px 24px 48px", width: "100%", maxWidth: "520px", border: `1px solid ${T.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease", maxHeight: "92svh", overflowY: "auto" }}>
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", backgroundColor: T.t3, margin: "0 auto 24px" }}/>

        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: `${T.gold}20`, border: `1px solid ${T.gold}40`, borderRadius: "20px", padding: "4px 12px", marginBottom: "16px" }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: T.gold }}/>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: T.gold, animation: "ping 1.5s ease-out infinite" }}/>
          </div>
          <span style={{ color: T.gold, fontSize: "11px", fontWeight: "800" }}>Nouveau rendez-vous</span>
        </div>

        <div style={{ color: T.t1, fontSize: "20px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "20px" }}>Demande de RDV reçue</div>

        {/* Citoyen */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", backgroundColor: T.bg3, borderRadius: "16px", padding: "14px", marginBottom: "16px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: `linear-gradient(135deg, ${T.gold}30, ${T.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "900", color: T.gold, flexShrink: 0 }}>
            {rdv.citoyen_nom.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: T.t1, fontSize: "17px", fontWeight: "800" }}>{rdv.citoyen_nom}</div>
            {rdv.citoyen_phone && <div style={{ color: T.t3, fontSize: "12px", marginTop: "2px" }}>{rdv.citoyen_phone}</div>}
          </div>
          {rdv.citoyen_phone && (
            <a href={`tel:${rdv.citoyen_phone}`} style={{ width: "38px", height: "38px", borderRadius: "50%", backgroundColor: T.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </a>
          )}
        </div>

        {/* Détails RDV */}
        <div style={{ backgroundColor: T.bg3, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px" }}>
          {[
            { icon: "📋", label: "Objet", value: rdv.objet || "RDV général" },
            { icon: "📅", label: "Date",  value: formatDate(rdv.date_rdv, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) },
            { icon: "🕐", label: "Heure", value: rdv.heure_rdv || "—" },
            ...(rdv.created_at ? [{ icon: "⏱", label: "Reçu", value: timeAgo(rdv.created_at) }] : []),
          ].map((item, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "9px 0", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ fontSize: "14px", flexShrink: 0 }}>{item.icon}</span>
              <span style={{ color: T.t3, fontSize: "12px", width: "60px", flexShrink: 0, paddingTop: "1px" }}>{item.label}</span>
              <span style={{ color: T.t1, fontSize: "13px", fontWeight: "700", flex: 1 }}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Info QR */}
        <div style={{ backgroundColor: `${T.blue}08`, border: `1px solid ${T.blue}20`, borderRadius: "12px", padding: "10px 14px", marginBottom: "20px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div>
            <div style={{ color: T.blue, fontSize: "11px", fontWeight: "800", marginBottom: "2px" }}>Confirmation de présence</div>
            <div style={{ color: T.t3, fontSize: "10px", lineHeight: 1.5 }}>Si accepté, le citoyen reçoit un QR code. Le jour J, scannez-le pour confirmer sa présence automatiquement.</div>
          </div>
        </div>

        {/* Boutons Accepter / Refuser */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
          <button
            onClick={() => setShowRefusForm(true)}
            disabled={loading}
            className="tap"
            style={{ backgroundColor: T.redL, color: T.red, fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "16px", border: `1px solid ${T.red}25`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Refuser
          </button>
          <button
            onClick={onAccept}
            disabled={loading}
            className="tap"
            style={{ background: `linear-gradient(135deg, ${T.green}, #009e76)`, color: "#fff", fontWeight: "900", fontSize: "15px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", boxShadow: `0 4px 20px ${T.green}35` }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            {loading ? "..." : "Accepter le RDV"}
          </button>
        </div>

        <button onClick={onClose} style={{ width: "100%", marginTop: "10px", background: "none", border: "none", color: T.t3, fontSize: "12px", cursor: "pointer", padding: "8px" }}>Fermer</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GUIDE SCALING
// ═══════════════════════════════════════════════════════════════════════
function GuideScalingModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const pages = [
    { titre: "Bienvenue dans votre Centre de Commande", sous_titre: "Votre guide pour scaler rapidement", contenu: [
      { icon: "01", label: "Complétez votre profil à 100%", desc: "Un profil complet reçoit 8× plus de demandes. Chaque section manquante = des clients perdus." },
      { icon: "02", label: "Obtenez la Validation Yelen", desc: "Le badge officiel vous positionne en priorité dans les résultats. C'est votre ticket vers la visibilité maximale." },
      { icon: "03", label: "Répondez en moins de 30 minutes", desc: "Les prestataires qui répondent vite ont un taux de confirmation de 92% contre 34% pour les autres." },
    ]},
    { titre: "Comprendre vos Analytics", sous_titre: "Lisez vos données comme un pro", contenu: [
      { icon: "04", label: "Le Tunnel d'Acquisition", desc: "Mesurez où vous perdez vos clients potentiels. Si vos visites sont hautes mais vos demandes basses : améliorez description et photos." },
      { icon: "05", label: "La Heatmap d'Activité", desc: "Identifiez vos heures de pointe. Soyez disponible et réactif exactement quand vos clients cherchent." },
      { icon: "06", label: "Score de Santé Global", desc: "Maintenez votre score au-dessus de 80 pour rester en première page. Chaque refus coûte des points." },
    ]},
    { titre: "Stratégie de Croissance", sous_titre: "De 0 à 200 clients/mois", contenu: [
      { icon: "07", label: "Fidélisez avec les notes privées CRM", desc: "Mémorisez les préférences de chaque client. Un client qui se sent connu revient et recommande." },
      { icon: "08", label: "Utilisez les annonces stratégiquement", desc: "Publiez une annonce à chaque nouvelle prestation. C'est 40% de demandes supplémentaires en moyenne." },
      { icon: "09", label: "Analysez votre zone géographique", desc: "Si 80% de vos clients viennent d'un même quartier, ciblez vos annonces dans ce secteur." },
    ]},
    { titre: "Yelen224 — Votre Partenaire", sous_titre: "Guinée · Conakry · Afrique", contenu: [
      { icon: "10", label: "Support dédié 7j/7", desc: "Notre équipe est disponible pour vous aider à optimiser votre profil et résoudre tout problème." },
      { icon: "11", label: "Mises à jour régulières", desc: "Nouvelles fonctionnalités chaque mois. Vous êtes toujours à la pointe de la gestion d'activité." },
      { icon: "12", label: "Communauté de prestataires", desc: "Rejoignez les +500 prestataires qui font confiance à Yelen224 pour développer leur activité." },
    ]},
  ];
  const currentPage = pages[page];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, animation: "fadeIn 0.3s ease" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <img src="https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.25) saturate(0.8)" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}/>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${T.bg}88 0%, ${T.bg}EE 40%, ${T.bg} 100%)` }}/>
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100svh", padding: "20px 20px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "36px", height: "36px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <YelenLogo size={22} color="#000" />
            </div>
            <span style={{ color: T.gold, fontSize: "13px", fontWeight: "900", letterSpacing: "0.5px" }}>YELEN224 PRO</span>
          </div>
          <button onClick={onClose} className="tap" style={{ background: "rgba(255,255,255,0.12)", border: `1px solid ${T.border2}`, borderRadius: "50%", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: "40px" }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "28px" }}>
            {pages.map((_, i) => (<div key={i} onClick={() => setPage(i)} style={{ flex: i === page ? 3 : 1, height: "3px", borderRadius: "2px", backgroundColor: i === page ? T.gold : "rgba(255,255,255,0.15)", transition: "all 0.3s ease", cursor: "pointer" }}/>))}
          </div>
          <div style={{ color: T.gold, fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "8px", textTransform: "uppercase" }}>Guide {page + 1}/{pages.length}</div>
          <h2 style={{ color: T.t1, fontSize: "26px", fontWeight: "900", letterSpacing: "-0.8px", lineHeight: 1.2, marginBottom: "6px" }}>{currentPage.titre}</h2>
          <p style={{ color: T.t2, fontSize: "13px", marginBottom: "28px" }}>{currentPage.sous_titre}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
            {currentPage.contenu.map((item, i) => (
              <div key={i} style={{ backgroundColor: "rgba(17,17,24,0.85)", border: `1px solid ${T.border2}`, borderRadius: "16px", padding: "14px 16px", display: "flex", gap: "14px", backdropFilter: "blur(8px)", animation: `fadeUp 0.25s ease ${i * 0.08}s both` }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `linear-gradient(135deg, ${T.gold}30, ${T.gold}10)`, border: `1px solid ${T.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900", color: T.gold, flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.t1, fontSize: "13px", fontWeight: "800", marginBottom: "3px" }}>{item.label}</div>
                  <div style={{ color: T.t2, fontSize: "11px", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: page > 0 ? "1fr 2fr" : "1fr", gap: "10px" }}>
          {page > 0 && (<button onClick={() => setPage(p => p - 1)} className="tap" style={{ backgroundColor: T.bg3, border: `1px solid ${T.border2}`, color: T.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", cursor: "pointer" }}>Retour</button>)}
          <button onClick={() => page < pages.length - 1 ? setPage(p => p + 1) : onClose()} className="tap" style={{ background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontWeight: "900", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", boxShadow: `0 4px 20px ${T.gold}40` }}>
            {page < pages.length - 1 ? "Continuer" : "Commencer à scaler"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TUNNEL D'ACQUISITION
// ═══════════════════════════════════════════════════════════════════════
function TunnelAcquisition({ rdvs, vues }: { rdvs: RDV[]; vues: number }) {
  const impressions = Math.max(vues * 4, rdvs.length * 12, 100);
  const visites = Math.max(vues, rdvs.length * 3, 30);
  const demandes = rdvs.length;
  const confirmes = rdvs.filter(r => ["confirme", "effectue", "termine", "honore"].includes(r.statut)).length;
  const etapes = [
    { label: "Impressions", value: impressions, color: T.blue, icon: "👁", desc: "Vues dans les résultats de recherche" },
    { label: "Visites profil", value: visites, color: T.purple, icon: "📋", desc: "Citoyens qui ont consulté votre profil" },
    { label: "Demandes RDV", value: demandes, color: T.gold, icon: "📅", desc: "Citoyens ayant fait une demande" },
    { label: "RDV confirmés", value: confirmes, color: T.green, icon: "✅", desc: "Rendez-vous effectivement réalisés" },
  ];
  const maxVal = Math.max(impressions, 1);
  return (
    <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${T.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Tunnel d'Acquisition" accent={T.blue} />
      <p style={{ color: T.t3, fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>Visualisez où vous perdez vos clients potentiels. Chaque étape est une opportunité d'optimisation.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {etapes.map((e, i) => {
          const pct = (e.value / maxVal) * 100;
          const convRate = i > 0 ? Math.round((e.value / Math.max(etapes[i-1].value, 1)) * 100) : 100;
          return (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: `${e.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 }}>{e.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ color: T.t1, fontSize: "12px", fontWeight: "700" }}>{e.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {i > 0 && (<span style={{ color: convRate < 30 ? T.red : convRate < 60 ? T.orange : T.green, fontSize: "10px", fontWeight: "800", backgroundColor: convRate < 30 ? T.redL : convRate < 60 ? T.orangeL : T.greenL, padding: "1px 6px", borderRadius: "8px" }}>{convRate}% de conversion</span>)}
                      <span style={{ color: e.color, fontSize: "14px", fontWeight: "900" }}>{e.value.toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, backgroundColor: e.color, borderRadius: "3px" }}/>
                  </div>
                </div>
              </div>
              <div style={{ color: T.t3, fontSize: "10px", paddingLeft: "38px", marginBottom: "2px" }}>{e.desc}</div>
              {i < etapes.length - 1 && (<div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HEATMAP
// ═══════════════════════════════════════════════════════════════════════
function HeatmapActivite({ rdvs }: { rdvs: RDV[] }) {
  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const tranches = ["8h", "10h", "12h", "14h", "16h", "18h", "20h"];
  const matrice: number[][] = Array(7).fill(null).map(() => Array(7).fill(0));
  rdvs.forEach(r => {
    if (!r.heure_rdv) return;
    const d = new Date(r.date_rdv);
    const jourIdx = (d.getDay() + 6) % 7;
    const h = parseInt(r.heure_rdv.slice(0, 2));
    const trancheIdx = Math.min(Math.max(Math.floor((h - 8) / 2), 0), 6);
    matrice[jourIdx][trancheIdx]++;
  });
  const maxVal = Math.max(...matrice.flat(), 1);
  function getHeatColor(val: number): string {
    const pct = val / maxVal;
    if (pct === 0) return "rgba(255,255,255,0.04)";
    if (pct < 0.25) return `${T.blue}30`;
    if (pct < 0.5)  return `${T.gold}50`;
    if (pct < 0.75) return `${T.orange}70`;
    return T.red;
  }
  return (
    <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${T.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Heatmap d'Activité" accent={T.orange}/>
      <p style={{ color: T.t3, fontSize: "11px", marginBottom: "14px" }}>Intensité des RDV par jour et plage horaire</p>
      <div style={{ display: "flex", gap: "3px", marginBottom: "4px", paddingLeft: "32px" }}>
        {tranches.map(t => (<div key={t} style={{ flex: 1, textAlign: "center", color: T.t3, fontSize: "8px", fontWeight: "700" }}>{t}</div>))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {jours.map((jour, ji) => (
          <div key={jour} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <div style={{ width: "28px", color: T.t3, fontSize: "9px", fontWeight: "700", flexShrink: 0 }}>{jour}</div>
            {tranches.map((_, ti) => {
              const val = matrice[ji][ti];
              return (<div key={ti} style={{ flex: 1, height: "22px", borderRadius: "5px", backgroundColor: getHeatColor(val), display: "flex", alignItems: "center", justifyContent: "center" }}>{val > 0 && <span style={{ color: val / maxVal > 0.5 ? "#fff" : T.t2, fontSize: "8px", fontWeight: "800" }}>{val}</span>}</div>);
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", justifyContent: "flex-end" }}>
        <span style={{ color: T.t3, fontSize: "9px" }}>Faible</span>
        {["rgba(255,255,255,0.04)", `${T.blue}30`, `${T.gold}50`, `${T.orange}70`, T.red].map((c, i) => (<div key={i} style={{ width: "14px", height: "10px", borderRadius: "3px", backgroundColor: c }}/>))}
        <span style={{ color: T.t3, fontSize: "9px" }}>Élevé</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CARTE GÉOGRAPHIQUE
// ═══════════════════════════════════════════════════════════════════════
function CarteGeographique({ rdvs }: { rdvs: RDV[] }) {
  const communes = [
    { nom: "Kaloum", x: 42, y: 62, rayon: 22 },
    { nom: "Dixinn", x: 58, y: 48, rayon: 30 },
    { nom: "Matam", x: 65, y: 38, rayon: 25 },
    { nom: "Ratoma", x: 55, y: 28, rayon: 35 },
    { nom: "Matoto", x: 70, y: 52, rayon: 28 },
  ];
  const total = rdvs.length || 50;
  const distribution = communes.map((c, i) => ({ ...c, count: Math.round(total * [0.18, 0.26, 0.20, 0.22, 0.14][i]), pct: [18, 26, 20, 22, 14][i] }));
  const maxCount = Math.max(...distribution.map(d => d.count), 1);
  return (
    <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${T.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Zone de Chalandise" accent={T.teal}/>
      <p style={{ color: T.t3, fontSize: "11px", marginBottom: "14px" }}>Origine estimée de vos demandes — Conakry, Guinée</p>
      <div style={{ backgroundColor: T.bg3, borderRadius: "14px", padding: "4px", marginBottom: "14px" }}>
        <svg viewBox="0 0 120 90" style={{ width: "100%", height: "auto", display: "block" }}>
          <rect width="120" height="90" fill="#0d1420"/>
          <path d="M15,45 Q20,30 35,25 Q50,20 65,22 Q80,20 90,28 Q100,35 95,50 Q90,65 75,72 Q60,78 45,75 Q30,72 20,62 Q12,55 15,45Z" fill="#1a2035" stroke={`${T.teal}40`} strokeWidth="0.5"/>
          <path d="M35,55 Q38,50 42,52 Q48,55 45,62 Q40,68 35,65 Q30,60 35,55Z" fill="#1e2840" stroke={`${T.blue}50`} strokeWidth="0.4"/>
          {distribution.map((d, i) => {
            const intensity = d.count / maxCount;
            const r = d.rayon * (0.4 + intensity * 0.6);
            return (
              <g key={i}>
                <circle cx={d.x} cy={d.y} r={r} fill={`${T.gold}${Math.round(intensity * 20 + 5).toString(16).padStart(2,"0")}`}/>
                <circle cx={d.x} cy={d.y} r={r * 0.6} fill={`${T.orange}${Math.round(intensity * 40 + 10).toString(16).padStart(2,"0")}`}/>
                <circle cx={d.x} cy={d.y} r={r * 0.25} fill={intensity > 0.7 ? T.red : intensity > 0.4 ? T.gold : `${T.gold}80`}/>
                <text x={d.x} y={d.y + r + 5} textAnchor="middle" fill={T.t2} fontSize="4" fontWeight="bold">{d.nom}</text>
                <text x={d.x} y={d.y + r + 9} textAnchor="middle" fill={T.gold} fontSize="3.5">{d.pct}%</text>
              </g>
            );
          })}
          <text x="5" y="8" fill={T.t3} fontSize="4" fontWeight="bold">GUINÉE · CONAKRY</text>
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {distribution.sort((a, b) => b.count - a.count).map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "20px", height: "20px", borderRadius: "6px", background: `linear-gradient(135deg, ${i === 0 ? T.gold : i === 1 ? T.orange : T.blue}30, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: i === 0 ? T.gold : i === 1 ? T.orange : T.blue, fontSize: "9px", fontWeight: "900" }}>{i + 1}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ color: T.t1, fontSize: "11px", fontWeight: "700" }}>{d.nom}</span>
                <span style={{ color: T.t2, fontSize: "11px" }}>{d.pct}% · {d.count} RDV</span>
              </div>
              <div style={{ height: "3px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "2px" }}>
                <div style={{ height: "100%", width: `${d.pct}%`, backgroundColor: i === 0 ? T.gold : i === 1 ? T.orange : T.blue, borderRadius: "2px" }}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MINI-CRM
// ═══════════════════════════════════════════════════════════════════════
function MiniCRM({ clients, onSaveNote, instId }: { clients: Client[]; onSaveNote: (clientId: string, note: string) => void; instId: string }) {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [sortBy, setSortBy] = useState<"recents" | "fideles" | "nouveaux">("recents");
  const filtered = clients
    .filter(c => !search || c.nom.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
    .sort((a, b) => {
      if (sortBy === "fideles") return b.nb_rdv - a.nb_rdv;
      if (sortBy === "nouveaux") return (b.est_nouveau ? 1 : 0) - (a.est_nouveau ? 1 : 0);
      return new Date(b.dernier_rdv).getTime() - new Date(a.dernier_rdv).getTime();
    });
  async function saveNote() {
    if (!selectedClient) return;
    setSavingNote(true);
    await onSaveNote(selectedClient.id, noteText);
    setSavingNote(false);
    setSelectedClient(p => p ? { ...p, note_privee: noteText } : null);
  }
  return (
    <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: "14px" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
        <SectionHeader label="Mes Clients — CRM" accent={T.purple}/>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "12px" }}>
          {[
            { label: "Total", value: clients.length, color: T.purple },
            { label: "Fidèles (3+)", value: clients.filter(c => c.nb_rdv >= 3).length, color: T.green },
            { label: "Nouveaux", value: clients.filter(c => c.est_nouveau).length, color: T.gold },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: T.bg3, borderRadius: "10px", padding: "8px", textAlign: "center" }}>
              <div style={{ color: s.color, fontSize: "18px", fontWeight: "900" }}>{s.value}</div>
              <div style={{ color: T.t3, fontSize: "9px" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ backgroundColor: T.bg3, borderRadius: "10px", padding: "0 12px", display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client…" style={{ flex: 1, padding: "10px 0", fontSize: "13px" }}/>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {[{ key: "recents", label: "Récents" }, { key: "fideles", label: "Fidèles" }, { key: "nouveaux", label: "Nouveaux" }].map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key as any)} className="tap" style={{ flex: 1, backgroundColor: sortBy === s.key ? `${T.purple}20` : "transparent", border: `1px solid ${sortBy === s.key ? T.purple + "40" : T.border}`, borderRadius: "8px", padding: "6px", color: sortBy === s.key ? T.purple : T.t3, fontSize: "10px", fontWeight: "700", cursor: "pointer" }}>{s.label}</button>
          ))}
        </div>
      </div>
      <div style={{ maxHeight: "340px", overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: T.t3, fontSize: "12px" }}>Aucun client trouvé</div>
        ) : filtered.map((c) => (
          <div key={c.id} onClick={() => { setSelectedClient(c); setNoteText(c.note_privee || ""); }} className="tap" style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", backgroundColor: selectedClient?.id === c.id ? `${T.purple}08` : "transparent" }}>
            <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: `linear-gradient(135deg, ${T.purple}30, ${T.purple}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "900", color: T.purple, flexShrink: 0, position: "relative" }}>
              {c.nom.slice(0, 2).toUpperCase()}
              {c.est_nouveau && <div style={{ position: "absolute", top: "-2px", right: "-2px", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: T.gold, border: `1.5px solid ${T.bg}` }}/>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ color: T.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</span>
                {c.nb_rdv >= 5 && <span style={{ backgroundColor: `${T.gold}20`, color: T.gold, fontSize: "8px", fontWeight: "800", padding: "1px 5px", borderRadius: "6px", flexShrink: 0 }}>VIP</span>}
              </div>
              <div style={{ color: T.t3, fontSize: "10px", marginTop: "1px" }}>{c.nb_rdv} RDV · Dernier : {timeAgo(c.dernier_rdv)}</div>
              {c.note_privee && <div style={{ color: T.t2, fontSize: "10px", fontStyle: "italic", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{c.note_privee}"</div>}
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        ))}
      </div>
      {selectedClient && (
        <div style={{ borderTop: `1px solid ${T.border2}`, padding: "16px", backgroundColor: T.bgCard2, animation: "fadeUp 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: `linear-gradient(135deg, ${T.purple}30, ${T.purple}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "900", color: T.purple }}>
                {selectedClient.nom.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ color: T.t1, fontSize: "15px", fontWeight: "800" }}>{selectedClient.nom}</div>
                <div style={{ color: T.t3, fontSize: "11px" }}>{selectedClient.phone}</div>
              </div>
            </div>
            <button onClick={() => setSelectedClient(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
            {[
              { label: "RDV total", value: selectedClient.nb_rdv, color: T.purple },
              { label: "Client depuis", value: timeAgo(selectedClient.premiere_visite), color: T.blue },
              { label: "Statut", value: selectedClient.est_nouveau ? "Nouveau" : "Régulier", color: T.green },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: T.bg3, borderRadius: "10px", padding: "9px 10px", textAlign: "center" }}>
                <div style={{ color: s.color, fontSize: "13px", fontWeight: "900", lineHeight: 1.2 }}>{s.value}</div>
                <div style={{ color: T.t3, fontSize: "9px", marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: "10px" }}>
            <div style={{ color: T.t3, fontSize: "10px", fontWeight: "700", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Note privée (visible uniquement par vous)</div>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Ex: Préfère les RDV le matin, client régulier depuis janvier..." rows={3} style={{ width: "100%", backgroundColor: T.bg3, border: `1px solid ${T.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: T.t1 }}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <a href={`tel:${selectedClient.phone}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", backgroundColor: T.bg3, border: `1px solid ${T.border}`, color: T.t1, fontSize: "12px", fontWeight: "700", padding: "11px", borderRadius: "10px", textDecoration: "none" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Appeler
            </a>
            <button onClick={saveNote} disabled={savingNote} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: `linear-gradient(135deg, ${T.purple}, #7a55d0)`, color: "#fff", fontSize: "12px", fontWeight: "800", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: savingNote ? 0.6 : 1 }}>
              {savingNote ? <div style={{ width: "12px", height: "12px", border: `2px solid rgba(255,255,255,0.3)`, borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/> : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SCORE SANTÉ
// ═══════════════════════════════════════════════════════════════════════
function ScoreSante({ score, stats }: { score: number; stats: Stats }) {
  const color = score >= 80 ? T.green : score >= 60 ? T.gold : score >= 40 ? T.orange : T.red;
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Bon" : score >= 40 ? "À améliorer" : "Critique";
  const facteurs = [
    { label: "Taux de confirmation", value: stats.taux_confirmation, color: T.green },
    { label: "Satisfaction clients", value: stats.taux_satisfaction, color: T.gold },
    { label: "Réactivité (RDV/sem)", value: Math.min(stats.week * 10, 100), color: T.blue },
    { label: "Absence de refus", value: Math.max(0, 100 - stats.ratio_refus * 10), color: T.purple },
  ];
  return (
    <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${color}25`, marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
        <div style={{ position: "relative", width: "72px", height: "72px", flexShrink: 0 }}>
          <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
            <circle cx="36" cy="36" r="30" fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${(score/100) * 2 * Math.PI * 30} ${2 * Math.PI * 30}`} strokeLinecap="round"/>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color, fontSize: "18px", fontWeight: "900", lineHeight: 1 }}>{score}</span>
            <span style={{ color: T.t3, fontSize: "8px", fontWeight: "700" }}>/100</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.t1, fontSize: "15px", fontWeight: "900", marginBottom: "3px" }}>Score de Santé</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${color}15`, color, fontSize: "11px", fontWeight: "800", padding: "3px 10px", borderRadius: "20px" }}>{label}</div>
          <div style={{ color: T.t3, fontSize: "10px", marginTop: "6px" }}>
            {score >= 80 ? "Votre établissement performe excellemment. Continuez !" : score >= 60 ? "Bon niveau. Quelques ajustements pour atteindre l'excellence." : "Des actions sont nécessaires pour améliorer votre performance."}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {facteurs.map(f => (
          <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: T.t3, fontSize: "10px", width: "140px", flexShrink: 0 }}>{f.label}</span>
            <div style={{ flex: 1, height: "4px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${f.value}%`, backgroundColor: f.color, borderRadius: "2px" }}/>
            </div>
            <span style={{ color: f.color, fontSize: "11px", fontWeight: "800", width: "32px", textAlign: "right" }}>{Math.round(f.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OBJECTIFS HEBDOMADAIRES
// ═══════════════════════════════════════════════════════════════════════
function ObjectifsHebdo({ stats }: { stats: Stats }) {
  const objectifs = [
    { label: "RDV cette semaine", actuel: stats.week, cible: Math.max(stats.week + 3, 10), color: T.blue, icon: "📅" },
    { label: "Taux de confirmation", actuel: stats.taux_confirmation, cible: 80, color: T.green, icon: "✅", unite: "%" },
    { label: "Score satisfaction", actuel: stats.taux_satisfaction, cible: 85, color: T.gold, icon: "⭐", unite: "%" },
  ];
  return (
    <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${T.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Objectifs de la semaine" accent={T.teal}/>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {objectifs.map((obj, i) => {
          const pct = Math.min((obj.actuel / obj.cible) * 100, 100);
          const atteint = pct >= 100;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: atteint ? T.greenL : T.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 }}>{atteint ? "✓" : obj.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: atteint ? T.green : T.t2, fontSize: "11px", fontWeight: atteint ? "800" : "600" }}>{obj.label}</span>
                  <span style={{ color: obj.color, fontSize: "11px", fontWeight: "800" }}>{obj.actuel}{obj.unite || ""} / {obj.cible}{obj.unite || ""}</span>
                </div>
                <div style={{ height: "4px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, backgroundColor: atteint ? T.green : obj.color, borderRadius: "2px" }}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUPPORT BANNER
// ═══════════════════════════════════════════════════════════════════════
function SupportBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{ position: "fixed", bottom: "80px", right: "14px", zIndex: 300 }}>
      <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.gold}30`, borderRadius: "16px", padding: "10px 12px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", maxWidth: "200px", animation: "fadeUp 0.3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: T.green, animation: "ping 2s ease-out infinite" }}/>
            <span style={{ color: T.gold, fontSize: "10px", fontWeight: "800" }}>Support Yelen</span>
          </div>
          <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p style={{ color: T.t2, fontSize: "10px", lineHeight: 1.5, marginBottom: "8px" }}>Notre équipe est disponible 7j/7 pour vous aider.</p>
        <a href="mailto:support@yelen224.com" style={{ display: "flex", alignItems: "center", gap: "5px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontSize: "10px", fontWeight: "800", padding: "7px 10px", borderRadius: "8px", textDecoration: "none" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Contacter maintenant
        </a>
      </div>
    </div>
  );
}
useEffect(() => {
  const timer = setTimeout(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader-modal",
      {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        rememberLastUsedCamera: true,
        videoConstraints: { facingMode: { ideal: "environment" } },
      },
      false
    );
    scanner.render(async (decodedText: string) => {
      scanner.clear().catch(() => {});
      try {
        const storedId = localStorage.getItem("yelen224_institution_id") || institutionId;
        const res = await fetch("/api/qr/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qr_payload: decodedText, institution_id: storedId }) });
        const data = await res.json();
        if (!res.ok) { setErrorMsg(data.error || "QR invalide"); setPhase("error"); return; }
        setScanResult(data);
        setPhase("result");
      } catch { setErrorMsg("Erreur réseau"); setPhase("error"); }
    }, () => {});
    scannerRef.current = scanner;
  }, 150);
  return () => { clearTimeout(timer); if (scannerRef.current) scannerRef.current.clear().catch(() => {}); };
}, [institutionId]);

// ═══════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function InstitutionDashboard() {
  const params  = useParams();
  const router  = useRouter();
  const rawId   = params?.id;
  const instId  = Array.isArray(rawId) ? rawId[0] : rawId ?? "";

  const [inst, setInst]             = useState<Institution | null>(null);
  const [rdvs, setRdvs]             = useState<RDV[]>([]);
  const [avis, setAvis]             = useState<AvisItem[]>([]);
  const [clients, setClients]       = useState<Client[]>([]);
  const [stats, setStats]           = useState<Stats>({
    today: 0, week: 0, month: 0, pending: 0, confirmed: 0, done: 0, cancelled: 0, nouveau: 0,
    avis_count: 0, moyenne_avis: 0, avis_non_lus: 0,
    taux_confirmation: 0, taux_annulation: 0, taux_satisfaction: 0, rdv_total: 0,
    evolution_week: 0, evolution_month: 0, peak_hour: "—", peak_day: "—",
    rdv_par_jour: [], rdv_par_heure: [], notes_distribution: [], recent_activity: [],
    ratio_refus: 0, compte_restreint: false, score_sante: 0,
  });

  const [tab, setTab] = useState<"accueil" | "rdv" | "analyse" | "parametres">("accueil");
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [refreshing, setRefreshing]         = useState(false);
  const [showScanner, setShowScanner]       = useState(false);
  const [showGuide, setShowGuide]           = useState(false);
  const [selectedRDV, setSelectedRDV]       = useState<RDV | null>(null);
  const [actionLoading, setActionLoading]   = useState<string | null>(null);
  const [toast, setToast]                   = useState<{ msg: string; color: string } | null>(null);
  const [rdvFilter, setRdvFilter]           = useState("tous");
  const [rdvSearch, setRdvSearch]           = useState("");
  const [analyseTab, setAnalyseTab]         = useState<"tunnel" | "heatmap" | "geo" | "crm">("tunnel");
  const [vuesEstimees]                      = useState(150);
  const [bannerRdv, setBannerRdv]           = useState<RDV | null>(null);
  const [showBannerDetail, setShowBannerDetail] = useState(false);
  const [darkMode, setDarkMode]             = useState(true);
  const lastRdvCountRef                     = useRef(0);

  function showToast(msg: string, color = T.green) { setToast({ msg, color }); }

  // ── Actions RDV ──
  async function handleAccept(rdvId: string) {
    setActionLoading(rdvId);
    try {
      await supabase.from("rdv").update({ statut: "confirme" }).eq("id", rdvId).eq("institution_id", instId);
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "confirme" } : r));
      setSelectedRDV(null);
      setBannerRdv(null);
      setShowBannerDetail(false);
      showToast("RDV accepté et confirmé", T.green);
    } catch { showToast("Erreur", T.red); } finally { setActionLoading(null); }
  }

  async function handleRefuse(rdvId: string) {
    setActionLoading(rdvId);
    try {
      await supabase.from("rdv").update({ statut: "annule" }).eq("id", rdvId).eq("institution_id", instId);
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "annule" } : r));
      setSelectedRDV(null);
      setBannerRdv(null);
      setShowBannerDetail(false);
      showToast("RDV refusé", T.orange);
    } catch { showToast("Erreur", T.red); } finally { setActionLoading(null); }
  }

  async function saveClientNote(clientId: string, note: string) {
    try {
      await supabase.from("client_notes").upsert({ institution_id: instId, citoyen_id: clientId, note }, { onConflict: "institution_id,citoyen_id" });
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, note_privee: note } : c));
      showToast("Note sauvegardée", T.purple);
    } catch { showToast("Erreur sauvegarde", T.red); }
  }

  // ── Chargement données ──
  const loadData = useCallback(async () => {
    if (!instId) { setError("Identifiant manquant."); setLoading(false); return; }
    try {
      setRefreshing(true);

      const { data: instData } = await supabase
        .from("institutions")
        .select("id,name,category,ville,logo,badge_verifie,moyenne_avis,nb_avis,description,phone,email,website,site_web,created_at,statut,plan,adresse,quartier")
        .eq("id", instId)
        .maybeSingle();
      if (instData) setInst(instData as Institution);
      localStorage.setItem("yelen224_institution_id", instId);

      const { data: rdvRaw } = await supabase
        .from("rdv")
        .select("id,objet,date_rdv,heure_rdv,statut,citoyen_id,pour_autre,nom_autre,phone_autre,presence,presence_status,conversation_terminee,motif_annulation,created_at")
        .eq("institution_id", instId)
        .order("created_at", { ascending: false })
        .limit(300);

      let rdvList: RDV[] = [];
      if (rdvRaw?.length) {
        const ids = [...new Set(rdvRaw.map((r: any) => r.citoyen_id).filter(Boolean))];
        const { data: usersD } = await supabase
          .from("users")
          .select("id,nom,prenom,phone")
          .in("id", ids);

        const uMap: Record<string, { nom: string; phone: string }> = {};
        (usersD ?? []).forEach((u: any) => {
          uMap[u.id] = { nom: buildNom(u), phone: u.phone || "" };
        });

        rdvList = rdvRaw.map((r: any) => ({
          ...r,
          citoyen_nom:   uMap[r.citoyen_id]?.nom   || "Citoyen",
          citoyen_phone: uMap[r.citoyen_id]?.phone || "",
        }));

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: notes } = await supabase
          .from("client_notes")
          .select("citoyen_id,note")
          .eq("institution_id", instId);
        const notesMap: Record<string, string> = {};
        (notes ?? []).forEach((n: any) => { notesMap[n.citoyen_id] = n.note; });

        const clientMap: Record<string, Client> = {};
        rdvList.forEach(r => {
          if (!clientMap[r.citoyen_id]) {
            clientMap[r.citoyen_id] = {
              id: r.citoyen_id,
              nom: r.citoyen_nom,
              phone: r.citoyen_phone || "",
              nb_rdv: 0,
              dernier_rdv: r.date_rdv,
              statuts: [],
              note_privee: notesMap[r.citoyen_id],
              premiere_visite: r.date_rdv,
              est_nouveau: new Date(r.date_rdv) >= thirtyDaysAgo,
            };
          }
          const c = clientMap[r.citoyen_id];
          c.nb_rdv++;
          c.statuts.push(r.statut);
          if (new Date(r.date_rdv) > new Date(c.dernier_rdv)) c.dernier_rdv = r.date_rdv;
          if (new Date(r.date_rdv) < new Date(c.premiere_visite)) c.premiere_visite = r.date_rdv;
        });
        setClients(Object.values(clientMap));

        const newPending = rdvList.filter(r => r.statut === "en_attente");
        if (newPending.length > lastRdvCountRef.current && lastRdvCountRef.current > 0) {
          setBannerRdv(newPending[0]);
        }
        lastRdvCountRef.current = newPending.length;
      }
      setRdvs(rdvList);

      const { data: avisRaw } = await supabase
        .from("avis")
        .select("id,note,commentaire,created_at,citoyen_id")
        .eq("institution_id", instId)
        .order("created_at", { ascending: false })
        .limit(50);

      let avisList: AvisItem[] = [];
      if (avisRaw?.length) {
        const cids2 = [...new Set(avisRaw.map((a: any) => a.citoyen_id).filter(Boolean))];
        const { data: usersD2 } = await supabase
          .from("users")
          .select("id,nom,prenom,phone")
          .in("id", cids2);

        const uMap2: Record<string, string> = {};
        (usersD2 ?? []).forEach((u: any) => { uMap2[u.id] = buildNom(u); });

        const { data: rdvVerif } = await supabase
          .from("rdv")
          .select("citoyen_id")
          .eq("institution_id", instId)
          .in("statut", ["effectue", "termine", "confirme", "honore"]);
        const verifies = new Set((rdvVerif ?? []).map((r: any) => r.citoyen_id));

        const sevenD = new Date();
        sevenD.setDate(sevenD.getDate() - 7);

        avisList = avisRaw.map((a: any) => ({
          id: a.id,
          note: a.note,
          commentaire: a.commentaire,
          created_at: a.created_at,
          citoyen_nom: uMap2[a.citoyen_id] || "Citoyen",
          rdv_confirmed: verifies.has(a.citoyen_id),
          lu: new Date(a.created_at) < sevenD,
        }));
      }
      setAvis(avisList);

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const weekAgo   = new Date(now); weekAgo.setDate(now.getDate() - 7);
      const monthAgo  = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
      const prevWkAgo = new Date(now); prevWkAgo.setDate(now.getDate() - 14);
      const prevMoAgo = new Date(now); prevMoAgo.setMonth(now.getMonth() - 2);
      const dayAgo    = new Date(now); dayAgo.setDate(now.getDate() - 1);

      const todayN    = rdvList.filter(r => r.date_rdv === today).length;
      const weekN     = rdvList.filter(r => new Date(r.date_rdv) >= weekAgo).length;
      const monthN    = rdvList.filter(r => new Date(r.date_rdv) >= monthAgo).length;
      const prevWkN   = rdvList.filter(r => new Date(r.date_rdv) >= prevWkAgo && new Date(r.date_rdv) < weekAgo).length;
      const prevMoN   = rdvList.filter(r => new Date(r.date_rdv) >= prevMoAgo && new Date(r.date_rdv) < monthAgo).length;
      const pending   = rdvList.filter(r => r.statut === "en_attente").length;
      const confirmed = rdvList.filter(r => r.statut === "confirme").length;
      const done      = rdvList.filter(r => ["effectue", "termine", "honore"].includes(r.statut)).length;
      const cancelled = rdvList.filter(r => r.statut === "annule").length;
      const nouveau   = rdvList.filter(r => r.created_at && new Date(r.created_at) >= dayAgo && r.statut === "en_attente").length;
      const total     = rdvList.length;

      const last10  = rdvList.filter(r => ["confirme", "annule", "effectue", "termine"].includes(r.statut)).slice(0, 10);
      const nbRefus = last10.filter(r => r.statut === "annule").length;

      const moy = avisList.length > 0
        ? avisList.reduce((a, b) => a + b.note, 0) / avisList.length
        : ((instData as any)?.moyenne_avis ?? 0);

      const tConf = total > 0 ? Math.round((confirmed / total) * 100) : 0;
      const tSat  = moy > 0 ? Math.round((moy / 5) * 100) : 0;
      const tAnn  = total > 0 ? Math.round((cancelled / total) * 100) : 0;

      const scoreSante = Math.round(
        tConf * 0.3 +
        tSat  * 0.25 +
        Math.min(weekN * 10, 100) * 0.2 +
        Math.max(0, 100 - nbRefus * 10) * 0.25
      );

      const rdvParJour = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - (6 - i));
        const ds = d.toISOString().slice(0, 10);
        return { day: d.toLocaleDateString("fr-FR", { weekday: "short" }), count: rdvList.filter(r => r.date_rdv === ds).length };
      });

      const heureMap: Record<string, number> = {};
      rdvList.forEach(r => { if (r.heure_rdv) { const h = r.heure_rdv.slice(0, 2) + "h"; heureMap[h] = (heureMap[h] || 0) + 1; } });
      const rdvParHeure = Object.entries(heureMap).sort((a, b) => a[0].localeCompare(b[0])).map(([hour, count]) => ({ hour, count }));
      const peakHour = [...rdvParHeure].sort((a, b) => b.count - a.count)[0]?.hour || "—";

      const dayMap: Record<string, number> = {};
      rdvList.forEach(r => { const d = new Date(r.date_rdv).toLocaleDateString("fr-FR", { weekday: "long" }); dayMap[d] = (dayMap[d] || 0) + 1; });
      const peakDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      const notesDist = [5, 4, 3, 2, 1].map(n => {
        const count = avisList.filter(a => Math.round(a.note) === n).length;
        return { note: n, count, pct: avisList.length > 0 ? (count / avisList.length) * 100 : 0 };
      });

      const recentActivity = [
        ...avisList.slice(0, 3).map(a => ({ type: "avis", label: `Avis ${a.note}/5 de ${a.citoyen_nom}`, time: timeAgo(a.created_at), color: T.gold })),
        ...rdvList.filter(r => r.statut === "confirme").slice(0, 3).map(r => ({ type: "rdv", label: `RDV confirmé — ${r.citoyen_nom}`, time: timeAgo(r.date_rdv), color: T.green })),
      ].slice(0, 8);

      setStats({
        today: todayN, week: weekN, month: monthN,
        pending, confirmed, done, cancelled, nouveau,
        avis_count: avisList.length,
        moyenne_avis: Math.round(moy * 10) / 10,
        avis_non_lus: avisList.filter(a => !a.lu).length,
        taux_confirmation: tConf, taux_annulation: tAnn, taux_satisfaction: tSat,
        rdv_total: total,
        evolution_week:  prevWkN > 0 ? Math.round(((weekN - prevWkN) / prevWkN) * 100) : 0,
        evolution_month: prevMoN > 0 ? Math.round(((monthN - prevMoN) / prevMoN) * 100) : 0,
        peak_hour: peakHour, peak_day: peakDay,
        rdv_par_jour: rdvParJour, rdv_par_heure: rdvParHeure,
        notes_distribution: notesDist, recent_activity: recentActivity,
        ratio_refus: nbRefus, compte_restreint: nbRefus >= 8, score_sante: scoreSante,
      });

    } catch (e: any) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Realtime ──
  useEffect(() => {
    if (!instId) return;
    const ch = supabase.channel(`rt-final-v5-${instId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rdv", filter: `institution_id=eq.${instId}` }, async (payload) => {
        const r = payload.new as any;
        let nom = "Citoyen";
        if (r.citoyen_id) {
          const { data: u } = await supabase.from("users").select("nom,prenom,phone").eq("id", r.citoyen_id).maybeSingle();
          if (u) nom = buildNom(u);
        }
        const nouveauRdv: RDV = { ...r, citoyen_nom: nom, citoyen_phone: "" };
        setBannerRdv(nouveauRdv);
        showToast(`Nouveau RDV de ${nom} !`, T.gold);
        loadData();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rdv", filter: `institution_id=eq.${instId}` }, (p) => {
        if (p.new?.statut === "annule") { showToast("RDV annulé par le citoyen", T.orange); loadData(); }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "avis", filter: `institution_id=eq.${instId}` }, () => { showToast("Nouvel avis client", T.gold); loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [instId, loadData]);

  const rdvsPending  = rdvs.filter(r => r.statut === "en_attente");
  const notifCount   = stats.avis_non_lus + stats.pending;
  const filteredRdvs = rdvs
    .filter(r => rdvFilter === "tous" || r.statut === rdvFilter)
    .filter(r => !rdvSearch || r.citoyen_nom.toLowerCase().includes(rdvSearch.toLowerCase()) || (r.objet || "").toLowerCase().includes(rdvSearch.toLowerCase()));

  // ── Loading ──
  if (loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
      <style>{CSS}</style>
      <div style={{ position: "relative", width: "52px", height: "52px" }}>
        <div style={{ position: "absolute", inset: 0, border: `3px solid rgba(212,160,23,0.15)`, borderTopColor: T.gold, borderRadius: "50%", animation: "spin 0.85s linear infinite" }}/>
        <div style={{ position: "absolute", inset: "8px", border: `2px solid rgba(212,160,23,0.08)`, borderTopColor: `${T.gold}60`, borderRadius: "50%", animation: "spin 1.4s linear infinite reverse" }}/>
      </div>
      <YelenLogo size={28} color={T.gold} />
      <div style={{ color: T.t3, fontSize: "12px", fontWeight: "600", letterSpacing: "1px" }}>" BON RETOUR " Merci de patienter  YELEN224 est entrain de charger</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100svh", backgroundColor: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <style>{CSS}</style>
      <div style={{ backgroundColor: T.bgCard, borderRadius: "20px", padding: "28px 24px", border: `1px solid ${T.border}`, textAlign: "center", maxWidth: "340px" }}>
        <YelenLogo size={40} color={T.gold} />
        <div style={{ color: T.t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "20px", marginTop: "16px" }}>{error}</div>
        <button onClick={loadData} style={{ background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "12px 24px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Réessayer</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100svh", backgroundColor: T.bg, fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", color: T.t1, paddingBottom: "80px" }}>
      <style>{CSS}</style>

      {/* ── MODALS ── */}
      {showGuide && <GuideScalingModal onClose={() => setShowGuide(false)}/>}
      {showScanner && instId && <ScannerModal institutionId={instId} onClose={() => setShowScanner(false)}/>}

      {showBannerDetail && bannerRdv && (
        <RdvDetailFullscreen
          rdv={bannerRdv}
          onClose={() => setShowBannerDetail(false)}
          onAccept={() => handleAccept(bannerRdv.id)}
          onRefuse={() => handleRefuse(bannerRdv.id)}
          loading={actionLoading === bannerRdv.id}
        />
      )}

      {selectedRDV && (
        <div onClick={() => setSelectedRDV(null)} style={{ position: "fixed", inset: 0, zIndex: 800, backgroundColor: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: T.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${T.border2}`, borderBottom: "none", animation: "slideUp 0.28s ease" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: T.t3, margin: "0 auto 20px" }}/>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ color: T.t1, fontSize: "17px", fontWeight: "900" }}>Détails du RDV</div>
              <span style={{ backgroundColor: stInfo(selectedRDV.statut).bg, color: stInfo(selectedRDV.statut).c, fontSize: "10px", fontWeight: "800", padding: "4px 10px", borderRadius: "20px", textTransform: "uppercase" }}>{stInfo(selectedRDV.statut).l}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: `linear-gradient(135deg, ${stInfo(selectedRDV.statut).c}25, ${stInfo(selectedRDV.statut).c}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "900", color: stInfo(selectedRDV.statut).c }}>
                {selectedRDV.citoyen_nom.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ color: T.t1, fontSize: "17px", fontWeight: "800" }}>{selectedRDV.citoyen_nom}</div>
                {selectedRDV.citoyen_phone && <div style={{ color: T.t3, fontSize: "12px" }}>{selectedRDV.citoyen_phone}</div>}
              </div>
            </div>
            <div style={{ backgroundColor: T.bg3, borderRadius: "12px", padding: "12px 14px", marginBottom: "18px" }}>
              {[
                { label: "Objet", value: selectedRDV.objet || "RDV général" },
                { label: "Date", value: formatDate(selectedRDV.date_rdv, { weekday: "long", day: "numeric", month: "long" }) },
                { label: "Heure", value: selectedRDV.heure_rdv || "—" },
                ...(selectedRDV.presence_status ? [{ label: "Présence", value: selectedRDV.presence_status }] : []),
                ...(selectedRDV.motif_annulation ? [{ label: "Motif annulation", value: selectedRDV.motif_annulation }] : []),
              ].map((item, i, arr) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ color: T.t3, fontSize: "11px", fontWeight: "600" }}>{item.label}</span>
                  <span style={{ color: T.t1, fontSize: "12px", fontWeight: "700", textAlign: "right", flex: 1 }}>{item.value}</span>
                </div>
              ))}
            </div>
            {selectedRDV.statut === "confirme" && (
              <div style={{ backgroundColor: `${T.blue}08`, border: `1px solid ${T.blue}20`, borderRadius: "12px", padding: "10px 14px", marginBottom: "14px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div style={{ color: T.t3, fontSize: "10px", lineHeight: 1.5 }}>
                  <strong style={{ color: T.blue }}>QR confirmé :</strong> Ce citoyen a un QR code. Utilisez le <strong>bouton Scanner</strong> en haut lors de sa visite.
                </div>
              </div>
            )}
            {selectedRDV.statut === "en attente" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button onClick={() => handleRefuse(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: T.redL, color: T.red, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${T.red}25`, cursor: "pointer" }}>
                  {actionLoading === selectedRDV.id ? "..." : "Refuser"}
                </button>
                <button onClick={() => handleAccept(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ background: `linear-gradient(135deg, ${T.green}, #009e76)`, color: "#fff", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer" }}>
                  {actionLoading === selectedRDV.id ? "..." : "Accepter"}
                </button>
              </div>
            ) : (
              <button onClick={() => setSelectedRDV(null)} className="tap" style={{ width: "100%", backgroundColor: T.bg3, color: T.t2, fontWeight: "700", fontSize: "14px", padding: "13px", borderRadius: "14px", border: `1px solid ${T.border}`, cursor: "pointer" }}>Fermer</button>
            )}
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} onDismiss={() => setToast(null)}/>}

      {bannerRdv && !showBannerDetail && (
        <NouveauRdvBanner rdv={bannerRdv} onClose={() => setBannerRdv(null)} onOpen={() => setShowBannerDetail(true)}/>
      )}

      {/* ═══════ HEADER ═══════ */}
      <header style={{ position: "sticky", top: 0, zIndex: 200, backgroundColor: "rgba(10,10,15,0.96)", backdropFilter: "blur(28px) saturate(200%)", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ padding: "0 16px" }}>
          <div style={{ height: "56px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
              {inst?.logo ? (
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", overflow: "hidden", border: `1px solid ${T.border2}`, flexShrink: 0 }}>
                  <img src={inst.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                </div>
              ) : (
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `linear-gradient(135deg, ${T.gold}30, ${T.goldD}20)`, border: `1px solid ${T.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <YelenLogo size={20} color={T.gold} />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ color: T.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inst?.name ? getSalutation(inst.name) : "Dashboard"}
                </div>
                <div style={{ color: T.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "0.5px" }}>
                  YELEN224 PRO
                </div>
              </div>
            </div>
            <button onClick={() => setShowGuide(true)} className="tap" style={{ background: T.bgCard2, border: `1px solid ${T.border}`, borderRadius: "10px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </button>
            <button onClick={() => setShowScanner(true)} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontWeight: "900", fontSize: "11px", padding: "8px 12px", borderRadius: "10px", border: "none", cursor: "pointer", flexShrink: 0, boxShadow: `0 2px 12px ${T.gold}40` }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
              Scanner
            </button>
            <button onClick={loadData} style={{ background: refreshing ? `${T.gold}15` : T.bgCard2, border: `1px solid ${T.border}`, borderRadius: "10px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }} className="tap">
              <div style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </div>
            </button>
          </div>
        </div>

        {/* ── BANDEAU PROGRESSION + STATUT YELEN ── */}
        <ProfilProgressionBandeau inst={inst} instId={instId} />
      </header>

      {/* ═══════════════════════════════════════════════════════════
          TAB : ACCUEIL
      ═══════════════════════════════════════════════════════════ */}
      {tab === "accueil" && (
        <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
          <div style={{ color: T.t3, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 style={{ color: T.t1, fontSize: "24px", fontWeight: "900", letterSpacing: "-0.6px", marginBottom: "16px" }}>Vue d'ensemble</h1>

          <ScoreSante score={stats.score_sante} stats={stats}/>

          {stats.compte_restreint && (
            <div style={{ backgroundColor: `${T.red}10`, border: `1px solid ${T.red}40`, borderLeft: `4px solid ${T.red}`, borderRadius: "14px", padding: "14px", marginBottom: "14px" }}>
              <div style={{ color: T.red, fontSize: "12px", fontWeight: "900", marginBottom: "4px" }}>Compte restreint</div>
              <div style={{ color: T.t2, fontSize: "11px", marginBottom: "8px" }}>{stats.ratio_refus}/10 refus détectés. Contactez le support Yelen.</div>
              <a href="mailto:support@yelen224.com" style={{ color: T.red, fontSize: "11px", fontWeight: "800", textDecoration: "none" }}>support@yelen224.com →</a>
            </div>
          )}

          {/* Stats RDV */}
          <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", border: `1px solid ${T.border}`, padding: "14px", marginBottom: "14px" }}>
            <div style={{ color: T.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "12px" }}>Rendez-vous</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "6px" }}>
              {[
                { label: "Nouveau",  value: stats.nouveau,    color: T.gold,   bg: `${T.gold}15`,   filter: "en attente" },
                { label: "Attente",  value: stats.pending,    color: T.orange, bg: `${T.orange}12`, filter: "en attente" },
                { label: "Terminé",  value: stats.done,       color: T.blue,   bg: `${T.blue}12`,   filter: "effectue" },
                { label: "Annulé",   value: stats.cancelled,  color: T.red,    bg: `${T.red}12`,    filter: "annule" },
                { label: "Total",    value: stats.rdv_total,  color: T.t1,     bg: T.bg3,           filter: "tous" },
              ].map(k => (
                <div key={k.label} onClick={() => { setTab("rdv"); setRdvFilter(k.filter); }} className="tap"
                  style={{ backgroundColor: k.bg, borderRadius: "12px", padding: "10px 6px", textAlign: "center", cursor: "pointer", border: `1px solid ${k.color}20` }}>
                  <div style={{ color: k.color, fontSize: "20px", fontWeight: "900", lineHeight: 1 }}>{k.value}</div>
                  <div style={{ color: k.color, fontSize: "9px", fontWeight: "700", marginTop: "3px", opacity: 0.8 }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RDV EN ATTENTE */}
          {rdvsPending.length > 0 && (
            <div style={{ marginBottom: "18px" }}>
              <SectionHeader label="En attente de confirmation" accent={T.gold} badge={rdvsPending.length} action="Voir tout" onAction={() => { setTab("rdv"); setRdvFilter("en attente"); }}/>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {rdvsPending.slice(0, 4).map(r => (
                  <div key={r.id} style={{ backgroundColor: T.bgCard, borderRadius: "16px", border: `1px solid ${T.gold}25`, borderLeft: `3px solid ${T.gold}`, overflow: "hidden" }}>
                    <div onClick={() => setSelectedRDV(r)} className="tap" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                      <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: `linear-gradient(135deg, ${T.gold}25, ${T.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "900", color: T.gold, flexShrink: 0 }}>
                        {r.citoyen_nom.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.citoyen_nom}</div>
                        <div style={{ color: T.t2, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.objet || "RDV général"}</div>
                        <div style={{ color: T.t3, fontSize: "10px", marginTop: "2px" }}>{formatDate(r.date_rdv, { day: "numeric", month: "short" })} · {r.heure_rdv}</div>
                      </div>
                      <div style={{ position: "relative" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: T.gold }}/>
                        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: T.gold, animation: "ping 1.5s ease-out infinite" }}/>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${T.border}` }}>
                      <button onClick={() => handleRefuse(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: "transparent", color: T.red, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", borderRight: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Refuser
                      </button>
                      <button onClick={() => handleAccept(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: "transparent", color: T.green, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Accepter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ObjectifsHebdo stats={stats}/>

          {/* KPI Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
            {[
              { label: "Aujourd'hui", value: stats.today, sub: `${stats.confirmed} confirmés`, color: T.blue },
              { label: "En attente",  value: stats.pending, sub: "À confirmer", color: stats.pending > 0 ? T.gold : T.green },
              { label: "Semaine",     value: stats.week, sub: `${stats.evolution_week > 0 ? "+" : ""}${stats.evolution_week}% vs préc.`, color: T.purple },
              { label: "Mois",        value: stats.month, sub: `${stats.evolution_month > 0 ? "+" : ""}${stats.evolution_month}% vs préc.`, color: T.teal },
            ].map(k => (
              <div key={k.label} style={{ backgroundColor: T.bgCard, borderRadius: "16px", padding: "14px", border: `1px solid ${T.border}`, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: "50px", height: "50px", borderRadius: "0 16px 0 100%", background: `${k.color}08` }}/>
                <div style={{ color: T.t2, fontSize: "10px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>{k.label}</div>
                <div style={{ color: T.t1, fontSize: "26px", fontWeight: "900", letterSpacing: "-1px", lineHeight: 1 }}>{k.value}</div>
                <div style={{ color: T.t3, fontSize: "10px", marginTop: "3px" }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart 7 jours */}
          <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", padding: "14px", border: `1px solid ${T.border}`, marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ color: T.t1, fontSize: "13px", fontWeight: "800" }}>RDV — 7 derniers jours</span>
              <span style={{ color: T.t3, fontSize: "10px" }}>Total : {stats.week}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "52px" }}>
              {stats.rdv_par_jour.map((d, i) => {
                const max = Math.max(...stats.rdv_par_jour.map(x => x.count), 1);
                const h = Math.max((d.count / max) * 52, 4);
                const isToday = i === 6;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                    <div style={{ width: "100%", height: `${h}px`, backgroundColor: isToday ? T.gold : `${T.blue}50`, borderRadius: "4px 4px 2px 2px" }}/>
                    <span style={{ color: isToday ? T.gold : T.t3, fontSize: "9px", fontWeight: isToday ? "800" : "600" }}>{d.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Performance */}
          <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", padding: "14px", border: `1px solid ${T.border}`, marginBottom: "14px" }}>
            <SectionHeader label="Performance" accent={T.gold}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              {[
                { label: "Confirmation", value: stats.taux_confirmation, color: T.green },
                { label: "Satisfaction",  value: stats.taux_satisfaction, color: T.gold },
                { label: "Annulation",    value: stats.taux_annulation,   color: T.red },
              ].map(k => (
                <div key={k.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <RadialProgress value={k.value} color={k.color} size={52}/>
                  <span style={{ color: T.t2, fontSize: "10px", fontWeight: "600", textAlign: "center" }}>{k.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Avis résumé */}
          <div onClick={() => setTab("analyse")} className="tap" style={{ backgroundColor: T.bgCard, borderRadius: "16px", padding: "14px", border: `1px solid ${T.border}`, marginBottom: "14px", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "3px", height: "16px", background: T.gold, borderRadius: "2px" }}/>
                <span style={{ color: T.t1, fontSize: "13px", fontWeight: "800" }}>Avis clients</span>
                {stats.avis_non_lus > 0 && <span style={{ backgroundColor: T.gold, color: "#000", fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "20px" }}>{stats.avis_non_lus} nouveau{stats.avis_non_lus > 1 ? "x" : ""}</span>}
              </div>
              <span style={{ color: T.gold, fontSize: "11px", fontWeight: "700" }}>Analyser →</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: "34px", fontWeight: "900", letterSpacing: "-1.5px", color: stats.moyenne_avis >= 4 ? T.green : stats.moyenne_avis >= 3 ? T.gold : T.red, lineHeight: 1 }}>
                  {stats.moyenne_avis > 0 ? stats.moyenne_avis.toFixed(1) : "—"}
                </div>
                <Stars note={stats.moyenne_avis} size={11}/>
                <div style={{ color: T.t3, fontSize: "9px", marginTop: "3px" }}>{stats.avis_count} avis</div>
              </div>
              <div style={{ flex: 1 }}>
                {stats.notes_distribution.map(nd => (
                  <div key={nd.note} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                    <span style={{ color: T.t3, fontSize: "9px", fontWeight: "700", width: "8px" }}>{nd.note}</span>
                    <div style={{ flex: 1, height: "5px", borderRadius: "3px", backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${nd.pct}%`, background: nd.note >= 4 ? T.green : nd.note >= 3 ? T.gold : T.red, borderRadius: "3px" }}/>
                    </div>
                    <span style={{ color: T.t3, fontSize: "9px", width: "14px", textAlign: "right" }}>{nd.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Raccourcis */}
          <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: "14px" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: T.t1, fontSize: "13px", fontWeight: "800" }}>Accès rapides</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
              {[
                { label: "Annonces",    href: `/institution/annonce`,     icon: T.orange, svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="1.8" strokeLinecap="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg> },
                { label: "Vos services payant",   href: `institution/services-payants`,     icon: T.blue,   svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
                { label: "Signalements",href: `/institution/signalements`,  icon: T.red,    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
                { label: "FAQ",         href: `/institution/faq`,           icon: T.teal,   svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
              ].map((item, i) => (
                <Link key={i} href={item.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "14px 8px", textDecoration: "none", borderRight: i < 3 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "11px", backgroundColor: `${item.icon}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.svg}</div>
                  <span style={{ color: T.t2, fontSize: "9px", fontWeight: "700" }}>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Activité récente */}
          {stats.recent_activity.length > 0 && (
            <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ color: T.t1, fontSize: "13px", fontWeight: "800" }}>Activité récente</span>
              </div>
              {stats.recent_activity.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: i < stats.recent_activity.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: a.color, flexShrink: 0 }}/>
                  <div style={{ flex: 1, color: T.t2, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</div>
                  <span style={{ color: T.t3, fontSize: "10px", flexShrink: 0 }}>{a.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : RDV
      ═══════════════════════════════════════════════════════════ */}
      {tab === "rdv" && (
        <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
          <h1 style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "14px" }}>Rendez-vous</h1>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "6px", marginBottom: "12px" }}>
            {[
              { label: "Nouveau", value: stats.nouveau,   color: T.gold },
              { label: "Attente", value: stats.pending,   color: T.orange },
              { label: "Terminé", value: stats.done,      color: T.blue },
              { label: "Annulé",  value: stats.cancelled, color: T.red },
              { label: "Total",   value: stats.rdv_total, color: T.t2 },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: T.bgCard, borderRadius: "10px", padding: "9px 4px", border: `1px solid ${T.border}`, textAlign: "center" }}>
                <div style={{ color: s.color, fontSize: "18px", fontWeight: "900" }}>{s.value}</div>
                <div style={{ color: T.t3, fontSize: "8px", fontWeight: "700" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "0 12px", display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={rdvSearch} onChange={e => setRdvSearch(e.target.value)} placeholder="Rechercher…" style={{ flex: 1, padding: "11px 0", fontSize: "13px" }}/>
          </div>
          <div style={{ display: "flex", gap: "7px", marginBottom: "12px", overflowX: "auto" }}>
            {[
              { key: "tous",       label: "Tous",       count: rdvs.length },
              { key: "en_attente", label: "En attente", count: stats.pending },
              { key: "confirme",   label: "Confirmés",  count: stats.confirmed },
              { key: "effectue",   label: "Effectués",  count: stats.done },
              { key: "annule",     label: "Annulés",    count: stats.cancelled },
            ].map(f => {
              const active = rdvFilter === f.key;
              const sc = f.key === "tous" ? { c: T.gold, bg: `${T.gold}20` } : stInfo(f.key);
              return (
                <button key={f.key} onClick={() => setRdvFilter(f.key)} className="tap" style={{ flexShrink: 0, backgroundColor: active ? sc.bg : T.bgCard, border: `1px solid ${active ? sc.c + "40" : T.border}`, borderRadius: "20px", padding: "6px 12px", color: active ? sc.c : T.t2, fontSize: "11px", fontWeight: active ? "800" : "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                  {f.label}<span style={{ backgroundColor: active ? `${sc.c}20` : T.bg3, color: active ? sc.c : T.t3, fontSize: "9px", fontWeight: "800", padding: "1px 5px", borderRadius: "10px" }}>{f.count}</span>
                </button>
              );
            })}
          </div>
          {filteredRdvs.length === 0 ? (
            <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", padding: "40px 20px", textAlign: "center", border: `1px solid ${T.border}` }}>
              <p style={{ color: T.t1, fontSize: "13px", fontWeight: "700" }}>Aucun rendez-vous trouvé</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredRdvs.map(r => {
                const s = stInfo(r.statut);
                return (
                  <div key={r.id} style={{ backgroundColor: T.bgCard, borderRadius: "14px", border: `1px solid ${T.border}`, borderLeft: `2px solid ${s.c}`, overflow: "hidden" }}>
                    <div onClick={() => setSelectedRDV(r)} className="tap" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900", color: s.c, flexShrink: 0 }}>
                        {r.citoyen_nom.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.citoyen_nom}</div>
                        <div style={{ color: T.t2, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.objet || "RDV général"}</div>
                        <div style={{ color: T.t3, fontSize: "10px", marginTop: "2px" }}>{formatDate(r.date_rdv, { day: "numeric", month: "short" })} · {r.heure_rdv}</div>
                      </div>
                      <span style={{ backgroundColor: s.bg, color: s.c, fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "20px", flexShrink: 0, textTransform: "uppercase" }}>{s.l}</span>
                    </div>
                    {r.statut === "en_attente" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${T.border}` }}>
                        <button onClick={() => handleRefuse(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: "transparent", color: T.red, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", borderRight: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Refuser
                        </button>
                        <button onClick={() => handleAccept(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: "transparent", color: T.green, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Accepter
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : ANALYSE
      ═══════════════════════════════════════════════════════════ */}
      {tab === "analyse" && (
        <div style={{ animation: "fadeUp 0.2s ease" }}>
          <div style={{ padding: "16px 16px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `linear-gradient(135deg, ${T.blue}30, ${T.blue}10)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <div>
                <h1 style={{ color: T.t1, fontSize: "20px", fontWeight: "900", letterSpacing: "-0.4px" }}>Centre d'Analyse</h1>
                <p style={{ color: T.t3, fontSize: "10px" }}>Intelligence stratégique pour scaler votre activité</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px", overflowX: "auto", paddingBottom: "2px" }}>
              {[
                { key: "tunnel",  label: "Tunnel",     icon: "🎯" },
                { key: "heatmap", label: "Heatmap",    icon: "🔥" },
                { key: "geo",     label: "Géographie", icon: "🗺" },
                { key: "crm",     label: "Mes Clients",icon: "👥" },
              ].map(t => (
                <button key={t.key} onClick={() => setAnalyseTab(t.key as any)} className="tap" style={{ flexShrink: 0, backgroundColor: analyseTab === t.key ? `${T.blue}20` : T.bgCard, border: `1px solid ${analyseTab === t.key ? T.blue + "40" : T.border}`, borderRadius: "20px", padding: "7px 14px", color: analyseTab === t.key ? T.blue : T.t2, fontSize: "11px", fontWeight: analyseTab === t.key ? "800" : "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "8px", marginBottom: "14px" }}>
              {[
                { label: "Clients actifs",     value: clients.length, color: T.purple },
                { label: "Heure de pointe",    value: stats.peak_hour, color: T.orange },
                { label: "Taux confirmation",  value: `${stats.taux_confirmation}%`, color: T.green },
                { label: "Satisfaction",       value: stats.moyenne_avis > 0 ? `${stats.moyenne_avis}/5 ⭐` : "—", color: T.gold },
              ].map(k => (
                <div key={k.label} style={{ backgroundColor: T.bgCard, borderRadius: "12px", padding: "12px 14px", border: `1px solid ${T.border}` }}>
                  <div style={{ color: k.color, fontSize: "18px", fontWeight: "900", lineHeight: 1 }}>{k.value}</div>
                  <div style={{ color: T.t3, fontSize: "10px", marginTop: "3px" }}>{k.label}</div>
                </div>
              ))}
            </div>
            {analyseTab === "tunnel"  && <TunnelAcquisition rdvs={rdvs} vues={vuesEstimees}/>}
            {analyseTab === "heatmap" && <HeatmapActivite rdvs={rdvs}/>}
            {analyseTab === "geo"     && <CarteGeographique rdvs={rdvs}/>}
            {analyseTab === "crm"     && <MiniCRM clients={clients} onSaveNote={saveClientNote} instId={instId}/>}
            <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", padding: "16px", border: `1px solid ${T.gold}20`, marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="2" strokeLinecap="round"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                <span style={{ color: T.gold, fontSize: "13px", fontWeight: "800" }}>Conseil personnalisé</span>
              </div>
              <p style={{ color: T.t2, fontSize: "12px", lineHeight: 1.7 }}>
                {stats.taux_confirmation < 50
                  ? `Votre taux de confirmation (${stats.taux_confirmation}%) est en dessous de la moyenne. Activez les réponses rapides et vérifiez vos disponibilités.`
                  : stats.avis_count < 5
                  ? "Vous avez peu d'avis. Encouragez vos clients à laisser une évaluation après chaque RDV."
                  : stats.week < 5
                  ? "Publiez une annonce cette semaine pour augmenter votre visibilité."
                  : `Excellente performance ! Vous gérez ${stats.week} RDV cette semaine.`
                }
              </p>
              <button onClick={() => setShowGuide(true)} className="tap" style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "6px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontSize: "12px", fontWeight: "800", padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer" }}>
                <YelenLogo size={14} color="#000" />
                Guide complet pour scaler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : PARAMÈTRES
      ═══════════════════════════════════════════════════════════ */}
      {tab === "parametres" && (
        <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
          <h1 style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "16px" }}>Paramètres</h1>

          {inst && (
            <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${T.border}`, marginBottom: "14px", display: "flex", alignItems: "center", gap: "14px" }}>
              {inst.logo ? (
                <img src={inst.logo} alt="" style={{ width: "52px", height: "52px", borderRadius: "14px", objectFit: "cover", border: `1px solid ${T.gold}30`, flexShrink: 0 }}/>
              ) : (
                <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: `linear-gradient(135deg, ${T.gold}30, ${T.goldD}15)`, border: `1px solid ${T.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <YelenLogo size={28} color={T.gold} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.t1, fontSize: "15px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</div>
                <div style={{ color: T.t2, fontSize: "11px" }}>{inst.category} · {inst.ville}</div>
                {inst.badge_verifie && <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: T.greenL, color: T.green, fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "10px", marginTop: "4px" }}>✓ Vérifié</div>}
              </div>
              <Link href={`/institution/${instId}/profil`} style={{ color: T.gold, textDecoration: "none", fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>Modifier</Link>
            </div>
          )}

          {/* Mode Dark Toggle */}
          <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", border: `1px solid ${T.border}`, marginBottom: "14px", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: T.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.8px" }}>Apparence</span>
            </div>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: darkMode ? T.bg3 : `${T.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {darkMode
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.t1, fontSize: "13px", fontWeight: "700" }}>Mode sombre automatique</div>
                <div style={{ color: T.t3, fontSize: "11px", marginTop: "2px" }}>{darkMode ? "Interface sombre activée" : "Interface claire activée"}</div>
              </div>
              <div onClick={() => setDarkMode(d => !d)} className="tap" style={{ width: "44px", height: "24px", borderRadius: "12px", backgroundColor: darkMode ? T.gold : "rgba(255,255,255,0.15)", position: "relative", cursor: "pointer", transition: "background 0.3s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: "3px", left: darkMode ? "22px" : "3px", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: darkMode ? "#000" : T.t2, transition: "left 0.25s ease", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}/>
              </div>
            </div>
          </div>

          {[
            {
              titre: "Mon institution",
              items: [
                { label: "Modifier le profil",     href: `/institution/profil`,      color: T.gold },
                { label: "Documents officiels",    href: `/institution/document`,   color: T.blue },
                { label: "Services proposés",      href: `/institution/services-payants`,    color: T.purple },
                { label: "Créneaux & Horaires",    href: `/institution/disponibilites`,    color: T.green },
                { label: "Validation Yelen",       href: `/institution/validation`,  color: T.teal },
              ],
            },
            {
              titre: "Outils",
              items: [
                { label: "Scanner QR — Page complète", href: `/institution//scanner`,      color: T.gold },
                { label: "Annonces publiques",          href: `/institution/annonce`,     color: T.orange },
                { label: "Signalements citoyens",       href: `/institution//signalement`, color: T.red },
                { label: "Mon Forfait Pro",              href: `/institution/forfait`,      color: T.purple },
                { label: "Valider un RDV payant",  href: "/institution/valider-rdv",      color: T.blue },
{ label: "Mon code QR",            href: "/institution/codeqr",            color: T.orange },
{ label: "Mes services payants",   href: "/institution/services-payants",  color: T.orange },
              ],
            },
            {
              titre: "Support & Légal",
              items: [
                { label: "Aide & FAQ",                   href: `/faq`,          color: T.blue },
                { label: "Contacter le support",         href: "mailto:support@yelen224.com",         color: T.purple },
                { label: "Conditions d'utilisation",     href: "/cgu",                          color: T.t2 },
                { label: "Politique de confidentialité", href: "/confidentialite",              color: T.t2 },              
              ],
            },
          ].map((section, si) => (
            <div key={si} style={{ marginBottom: "14px" }}>
              <div style={{ color: T.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{section.titre}</div>
              <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", border: `1px solid ${T.border}`, overflow: "hidden" }}>
                {section.items.map((item, ii) => (
                  <a key={ii} href={item.href} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", borderBottom: ii < section.items.length - 1 ? `1px solid ${T.border}` : "none", textDecoration: "none" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color, flexShrink: 0 }}/>
                    <span style={{ flex: 1, color: T.t1, fontSize: "13px", fontWeight: "600" }}>{item.label}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                ))}
              </div>
            </div>
          ))}

          <div style={{ backgroundColor: `${T.gold}08`, border: `1px solid ${T.gold}25`, borderRadius: "16px", padding: "16px", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: T.green, animation: "ping 2s ease-out infinite" }}/>
              <span style={{ color: T.gold, fontSize: "13px", fontWeight: "800" }}>Support Yelen — En ligne</span>
            </div>
            <p style={{ color: T.t2, fontSize: "12px", lineHeight: 1.6, marginBottom: "12px" }}>Notre équipe est disponible 7j/7 pour vous accompagner dans le développement de votre activité.</p>
            <a href="mailto:support@yelen224.com" style={{ display: "flex", alignItems: "center", gap: "6px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "11px 16px", borderRadius: "10px", textDecoration: "none" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              support@yelen224.com
            </a>
          </div>

          <button onClick={() => router.push("/login")} className="tap" style={{ width: "100%", backgroundColor: T.redL, border: `1px solid ${T.red}25`, borderRadius: "14px", padding: "13px", color: T.red, fontWeight: "800", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "8px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Se déconnecter
          </button>

          <div style={{ textAlign: "center", color: T.t3, fontSize: "10px" }}>Yelen224 Pro · Guinée · v5.1 · 2026</div>
        </div>
      )}

      <SupportBanner/>

      {/* ═══════ BOTTOM NAVIGATION — 4 onglets ═══════ */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, backgroundColor: "rgba(10,10,15,0.97)", backdropFilter: "blur(32px) saturate(200%)", borderTop: `1px solid ${T.border}`, paddingBottom: "env(safe-area-inset-bottom)", display: "grid", gridTemplateColumns: "repeat(4,1fr)", boxShadow: "0 -12px 40px rgba(0,0,0,0.6)" }}>
        {([
          { key: "accueil",    label: "Accueil",  badge: 0,
            icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? T.gold : "none"} stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
          { key: "rdv",        label: "RDV",      badge: stats.pending,
            icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
          { key: "analyse",    label: "Analyse",  badge: 0,
            icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
          { key: "parametres", label: "Réglages", badge: 0,
            icon: (a: boolean) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
        ] as { key: typeof tab; label: string; badge: number; icon: (a: boolean) => any }[]).map(item => {
          const active = tab === item.key;
          return (
            <button key={item.key} onClick={() => setTab(item.key)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", background: "none", border: "none", padding: "8px 4px 5px", cursor: "pointer", position: "relative" }}>
              {active && <div style={{ position: "absolute", top: 0, left: "22%", right: "22%", height: "2px", background: `linear-gradient(90deg, ${T.gold}, ${T.goldL})`, borderRadius: "0 0 2px 2px" }}/>}
              <span style={{ position: "relative", display: "inline-flex" }}>
                {item.icon(active)}
                {item.badge > 0 && (
                  <span style={{ position: "absolute", top: "-5px", right: "-5px", backgroundColor: T.gold, color: "#000", fontSize: "8px", fontWeight: "800", borderRadius: "10px", minWidth: "14px", height: "14px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: `1.5px solid ${T.bg}` }}>
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span style={{ fontSize: "9px", fontWeight: active ? "800" : "600", color: active ? T.gold : T.t3, letterSpacing: "0.2px" }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
