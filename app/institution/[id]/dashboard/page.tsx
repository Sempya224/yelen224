






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

import React, { useEffect, useState, useCallback, useRef, Dispatch, SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Html5QrcodeScanner } from "html5-qrcode";
import { YelenLogo } from "@/components/YelenLogo";
import { T } from "./theme";
import { DisponibilitesTab } from "./components/DisponibilitesTab";
import { ServicesTab } from "./components/ServicesTab";
import { CommunicationTab } from "./components/CommunicationTab";
import { CodeQrTab } from "./components/CodeQrTab";
import { ValiderRdvTab } from "./components/ValiderRdvTab";
import { ProfilEntrepriseTab } from "./components/ProfilEntrepriseTab";
import { ProfilResponsableTab } from "./components/ProfilResponsableTab";
import { DocumentsTab } from "./components/DocumentsTab";

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
  presence_confirmed_at?: string;
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

type DashboardTab = "accueil" | "rdv" | "disponibilites" | "services" | "communication" | "scanner" | "codeqr" | "valider-rdv" | "analyse" | "parametres" | "profil-entreprise" | "profil-responsable" | "documents";

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
  created_at?: string;
  statut?: string;
  plan?: string;
  adresse?: string;
  quartier?: string;
  disponibilites?: unknown;
  secteur?: string | null;
  statut_juridique?: string | null;
  whatsapp?: string;
  banniere?: string | null;
  annee_creation?: string;
  capacite?: string;
  langue?: string[];
  services?: string[];
  horaires?: { jour: string; ouvert: boolean; debut: string; fin: string }[];
};

type Stats = {
  today: number; week: number; month: number;
  pending: number; confirmed: number; done: number; cancelled: number;
  nouveau: number; absents: number;
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
  /* ── Layout PC ≥1024px ── */
  @media(min-width:1024px){
    .yelen-shell{display:flex;height:100svh;overflow:hidden}
    .yelen-sidebar{
      width:264px;min-width:264px;height:100svh;overflow:visible;
      background:${T.bgCard};border-right:1px solid rgba(255,255,255,0.07);
      display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;z-index:400
    }
    .yelen-main{margin-left:264px;flex:1;overflow-y:auto;height:100svh;display:flex;flex-direction:column}
    .yelen-bottom-nav{display:none!important}
    .yelen-content{flex:1;overflow-y:auto}
    .yelen-header-inner{padding:0 32px!important}
    .yelen-account-panel{
      position:fixed;top:0;bottom:0;width:232px;min-width:232px;height:100svh;
      background:${T.bgCard2};border-right:1px solid rgba(255,255,255,0.07);
      display:flex;flex-direction:column;overflow-y:auto;z-index:390;
      animation:fadeUp 0.16s ease;
    }
  }
  @media(max-width:1023px){
    .yelen-sidebar{display:none}
    .yelen-account-panel{display:none!important}
    .yelen-shell{display:block}
    .yelen-main{margin-left:0!important}
  }
  @media(min-width:1024px){
    .yelen-main{padding-bottom:0!important}
  }
`;

// ─── Logo Yelen224 — composant partagé components/YelenLogo.tsx, importé
// en tête de fichier. Ne plus redéfinir de variante locale ici : c'était
// la cause de la divergence avec l'icône utilisée sur connexion/inscription.

// ─── Squelette temporaire — onglets nouvellement promus dont le contenu
// réel arrive dans un lot dédié (réorganisation dashboard, lots 2-7). À
// retirer au fur et à mesure que chaque onglet reçoit son vrai contenu.
function TabPlaceholder({ titre, description }: { titre: string; description: string }) {
  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "16px" }}>{titre}</h1>
      <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "32px 20px", border: `1px solid ${T.border}`, textAlign: "center" }}>
        <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `${T.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        </div>
        <p style={{ color: T.t2, fontSize: "13px", lineHeight: 1.6, maxWidth: "320px", margin: "0 auto" }}>{description}</p>
      </div>
    </div>
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
    case "nouveau":    return { c: T.gold,   bg: `${T.gold}15`,           l: "Nouveau" };
    case "absent":     return { c: T.red,    bg: T.redL,                  l: "Absent" };
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
// L'étape "Disponibilités" du bandeau de progression vérifiait !!inst.adresse
// (un champ sans rapport) au lieu de l'état réel des créneaux enregistrés —
// gère array direct et JSON string, mêmes formats que parseToRules côté
// DisponibilitesTab.
function hasDisponibilites(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "string") {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) && parsed.length > 0; } catch { return false; }
  }
  return false;
}
function ProfilProgressionBandeau({ inst, instId, setTab }: { inst: Institution | null; instId: string; setTab: Dispatch<SetStateAction<DashboardTab>> }) {
  if (!inst) return null;

  const steps = [
    { id: "photo",  label: "Photo",         done: !!inst.logo },
    { id: "docs",   label: "Documents",     done: !!inst.description && inst.description.length > 10 },
    { id: "dispo",  label: "Disponibilités",done: hasDisponibilites(inst.disponibilites) },
  ];
  const doneCnt = steps.filter(s => s.done).length;
  const pct     = Math.round((doneCnt / steps.length) * 100);
  const complet = pct === 100;

  const statutCfg: Record<string, { color: string; bg: string; border: string; label: string; ping: boolean }> = {
    validee:    { color: T.green,  bg: "rgba(0,200,150,0.10)",  border: "rgba(0,200,150,0.25)",  label: "Active",        ping: false },
    en_attente: { color: T.gold,   bg: "rgba(212,160,23,0.10)", border: "rgba(212,160,23,0.25)", label: "En attente de validation", ping: true  },
    refusee:    { color: T.red,    bg: "rgba(255,71,87,0.10)",  border: "rgba(255,71,87,0.25)",  label: "Dossier refusé",           ping: false },
  };
  const sc = statutCfg[inst.statut ?? "en_attente"] ?? statutCfg["en_attente"];
  const barColor = pct === 100 ? T.green : pct >= 60 ? T.gold : T.orange;

  // Profil complet ET institution validée → bandeau inutile, laisser la place aux alertes RDV
  if (complet && inst.statut === "validee") return null;

  if (complet) {
    return (
      <div style={{ backgroundColor: sc.bg, borderBottom: `1px solid ${sc.border}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ position: "relative", flexShrink: 0, width: "8px", height: "8px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: sc.color }}/>
          {sc.ping && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: sc.color, animation: "ping 1.5s ease-out infinite" }}/>}
        </div>
        <span style={{ color: sc.color, fontSize: "11px", fontWeight: "800", flex: 1 }}>{sc.label}</span>
        {inst.statut === "validee" && (
          <span style={{ backgroundColor: T.green, color: "#fff", fontSize: "9px", fontWeight: "900", padding: "2px 8px", borderRadius: "20px" }}>✓ VÉRIFIÉ</span>
        )}
        {inst.statut === "refusee" && (
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
        {steps.map(s => {
          const content = (
            <>
              <div style={{ width: "14px", height: "14px", borderRadius: "50%", backgroundColor: s.done ? T.green : "rgba(255,255,255,0.08)", border: `1.5px solid ${s.done ? T.green : "rgba(255,255,255,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {s.done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span style={{ color: s.done ? T.green : T.t3, fontSize: "10px", fontWeight: s.done ? "700" : "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            </>
          );
          const itemStyle: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", gap: "4px", backgroundColor: s.done ? "rgba(0,200,150,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${s.done ? "rgba(0,200,150,0.2)" : T.border}`, borderRadius: "8px", padding: "5px 7px", textDecoration: "none" };
          // "Documents" est desormais un onglet du dashboard (DocumentsTab),
          // plus une page separee — bascule d'onglet au lieu d'une navigation.
          if (s.id === "docs") {
            return <button key={s.id} onClick={() => setTab("documents")} className="tap" style={{ ...itemStyle, border: `1px solid ${s.done ? "rgba(0,200,150,0.2)" : T.border}`, cursor: "pointer" }}>{content}</button>;
          }
          return (
            <Link key={s.id} href={s.id === "photo" ? `/institution/profil` : `/institution/disponibilites`} style={itemStyle}>
              {content}
            </Link>
          );
        })}
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
    <div onClick={onOpen} className="tap" style={{ backgroundColor: T.gold, padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", animation: "slideDownBanner 0.4s ease" }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#000" }}/>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: "#000", animation: "ping 1.2s ease-out infinite" }}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: "#000", fontSize: "12px", fontWeight: "900" }}>Nouveau RDV — {rdv.citoyen_nom}</span>
        <span style={{ color: "rgba(0,0,0,0.6)", fontSize: "10px", marginLeft: "8px" }}>{rdv.objet || "RDV général"} · {formatDate(rdv.date_rdv, { day: "numeric", month: "short" })} {rdv.heure_rdv}</span>
      </div>
      <span style={{ color: "#000", fontSize: "10px", fontWeight: "800", backgroundColor: "rgba(0,0,0,0.15)", padding: "3px 8px", borderRadius: "20px", flexShrink: 0 }}>Voir →</span>
      <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: "rgba(0,0,0,0.15)", border: "none", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
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
function TunnelAcquisition({ rdvs }: { rdvs: RDV[] }) {
  const demandes = rdvs.length;
  const confirmes = rdvs.filter(r => ["confirme", "effectue", "termine", "honore"].includes(r.statut)).length;
  const termines = rdvs.filter(r => ["effectue", "termine", "honore"].includes(r.statut)).length;
  const etapes = [
    { label: "Demandes RDV", value: demandes, color: T.gold, icon: "📅", desc: "Citoyens ayant soumis une demande de RDV", estime: false },
    { label: "RDV confirmés", value: confirmes, color: T.green, icon: "✅", desc: "Demandes acceptées et confirmées", estime: false },
    { label: "RDV terminés", value: termines, color: T.blue, icon: "🏁", desc: "Consultations effectivement réalisées", estime: false },
  ];
  const maxVal = Math.max(demandes, 1);
  return (
    <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${T.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Tunnel d'Acquisition" accent={T.blue} />
      <p style={{ color: T.t3, fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>Taux de transformation de vos demandes de RDV. Données réelles issues de votre activité.</p>
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
                      {i > 0 && (<span style={{ color: convRate < 30 ? T.red : convRate < 60 ? T.orange : T.green, fontSize: "10px", fontWeight: "800", backgroundColor: convRate < 30 ? T.redL : convRate < 60 ? T.orangeL : T.greenL, padding: "1px 6px", borderRadius: "8px" }}>{convRate}%</span>)}
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
      {demandes === 0 && (
        <div style={{ textAlign: "center", color: T.t3, fontSize: "11px", marginTop: "12px" }}>Aucune demande de RDV enregistrée pour l'instant.</div>
      )}
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
  const total = rdvs.length;
  const confirmes = rdvs.filter(r => ["confirme", "effectue", "termine", "honore"].includes(r.statut)).length;
  const taux = total > 0 ? Math.round((confirmes / total) * 100) : 0;
  return (
    <div style={{ backgroundColor: T.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${T.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Zone de Chalandise" accent={T.teal}/>
      <p style={{ color: T.t3, fontSize: "11px", marginBottom: "14px" }}>Conakry, Guinée — Répartition géographique de vos clients</p>
      <div style={{ backgroundColor: T.bg3, borderRadius: "14px", padding: "4px", marginBottom: "14px" }}>
        <svg viewBox="0 0 120 90" style={{ width: "100%", height: "auto", display: "block" }}>
          <rect width="120" height="90" fill="#0d1420"/>
          <path d="M15,45 Q20,30 35,25 Q50,20 65,22 Q80,20 90,28 Q100,35 95,50 Q90,65 75,72 Q60,78 45,75 Q30,72 20,62 Q12,55 15,45Z" fill="#1a2035" stroke={`${T.teal}40`} strokeWidth="0.5"/>
          <path d="M35,55 Q38,50 42,52 Q48,55 45,62 Q40,68 35,65 Q30,60 35,55Z" fill="#1e2840" stroke={`${T.blue}50`} strokeWidth="0.4"/>
          <circle cx="60" cy="45" r={Math.min(Math.max(total * 0.6, 8), 28)} fill={`${T.gold}18`}/>
          <circle cx="60" cy="45" r={Math.min(Math.max(confirmes * 0.6, 5), 18)} fill={`${T.green}25`}/>
          <circle cx="60" cy="45" r="4" fill={T.gold}/>
          <text x="60" y="52" textAnchor="middle" fill={T.gold} fontSize="4" fontWeight="bold">Conakry</text>
          <text x="60" y="57" textAnchor="middle" fill={T.teal} fontSize="3.5">{total} RDV</text>
          <text x="5" y="8" fill={T.t3} fontSize="4" fontWeight="bold">GUINÉE · CONAKRY</text>
        </svg>
      </div>
      <div style={{ backgroundColor: `${T.teal}10`, border: `1px solid ${T.teal}20`, borderRadius: "10px", padding: "10px 12px", marginBottom: "12px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style={{ color: T.t3, fontSize: "10px", lineHeight: 1.5 }}>La répartition par quartier sera disponible lorsque les citoyens renseigneront leur adresse lors de l'inscription.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        {[
          { label: "Total RDV", value: total, color: T.gold },
          { label: "Confirmés", value: confirmes, color: T.green },
          { label: "Taux", value: `${taux}%`, color: T.teal },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: T.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <div style={{ color: s.color, fontSize: "18px", fontWeight: "900" }}>{s.value}</div>
            <div style={{ color: T.t3, fontSize: "9px", marginTop: "2px" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
        {[{ nom: "Conakry", pct: 100, count: total }].map((d, i) => (
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









// ═══════════════════════════════════════════════════════════════════════
// SCANNER QR
// ═══════════════════════════════════════════════════════════════════════
function ScannerModal({ institutionId, onClose, onTermine }: { institutionId: string; onClose: () => void; onTermine?: (rdvId: string) => void }) {
  const [phase, setPhase] = useState<"scan" | "result" | "done" | "error">("scan");
  const [scanResult, setScanResult] = useState<any>(null);
  const [storedRdvId, setStoredRdvId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const scanner = new Html5QrcodeScanner(
        "qr-reader-modal",
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          rememberLastUsedCamera: true,
          videoConstraints: {
            facingMode: "environment",
            width: { min: 320, ideal: 1280, max: 1920 },
            height: { min: 240, ideal: 720, max: 1080 },
          },
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

  async function confirmer() {
    if (!scanResult?.rdv) return;
    setConfirming(true);
    try {
      await fetch("/api/qr/validate", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rdv_id: scanResult.rdv.id, action: "present", institution_id: institutionId }) });
      setStoredRdvId(scanResult.rdv.id);
      setPhase("done");
    } catch { setErrorMsg("Erreur"); setPhase("error"); } finally { setConfirming(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: T.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${T.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: T.t3, margin: "0 auto 20px" }}/>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <div style={{ color: T.t1, fontSize: "18px", fontWeight: "900" }}>Scanner le Client</div>
            <div style={{ color: T.t3, fontSize: "12px", marginTop: "2px" }}>QR Code du citoyen</div>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: T.bg3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {phase === "scan" && <div id="qr-reader-modal" style={{ borderRadius: "16px", overflow: "hidden", backgroundColor: T.bg3, minHeight: "260px" }}/>}
        {phase === "result" && scanResult?.rdv && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={{ backgroundColor: T.greenL, border: `1px solid ${T.green}30`, borderRadius: "12px", padding: "10px 14px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ color: T.green, fontSize: "12px", fontWeight: "800" }}>QR valide</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "13px", background: `linear-gradient(135deg, ${T.gold}30, ${T.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: T.gold }}>
                {(scanResult.rdv.citoyen_nom || "C")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ color: T.t1, fontSize: "16px", fontWeight: "800" }}>{scanResult.rdv.citoyen_nom}</div>
                <div style={{ color: T.t3, fontSize: "11px" }}>{scanResult.rdv.objet || "RDV général"} · {formatDate(scanResult.rdv.date_rdv, { day: "numeric", month: "short" })}</div>
              </div>
            </div>
            <div>
              <button onClick={() => confirmer()} disabled={confirming} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${T.green}, #009e76)`, color: "#fff", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "14px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                {confirming ? "Confirmation..." : "Confirmer la présence"}
              </button>
              <p style={{ color: T.t3, fontSize: "10px", textAlign: "center", marginTop: "8px" }}>Pour marquer un client absent, utilisez la liste RDV.</p>
            </div>
          </div>
        )}
        {phase === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "50%", backgroundColor: T.greenL, border: `2px solid ${T.green}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ color: T.green, fontSize: "16px", fontWeight: "900", marginBottom: "4px" }}>Présence confirmée</div>
            <div style={{ color: T.t3, fontSize: "11px", marginBottom: "20px" }}>Marquez le RDV comme terminé une fois la consultation achevée</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {onTermine && storedRdvId && (
                <button onClick={() => { onTermine(storedRdvId); onClose(); }} className="tap" style={{ background: `linear-gradient(135deg, ${T.purple}, #7a55d0)`, color: "#fff", fontWeight: "800", fontSize: "14px", padding: "13px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                  ✓ Marquer RDV terminé
                </button>
              )}
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setPhase("scan"); setScanResult(null); setStoredRdvId(null); }} className="tap" style={{ flex: 1, backgroundColor: T.bg3, border: `1px solid ${T.border}`, color: T.t1, fontWeight: "700", fontSize: "13px", padding: "12px", borderRadius: "12px", cursor: "pointer" }}>Scanner suivant</button>
                <button onClick={onClose} className="tap" style={{ flex: 1, background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Fermer</button>
              </div>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "50%", backgroundColor: T.redL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <div style={{ color: T.red, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>QR invalide</div>
            <div style={{ color: T.t2, fontSize: "12px", marginBottom: "20px" }}>{errorMsg}</div>
            <button onClick={() => { setPhase("scan"); setErrorMsg(""); }} className="tap" style={{ background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontWeight: "800", fontSize: "14px", padding: "12px 32px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Réessayer</button>
          </div>
        )}
      </div>
    </div>
  );
}


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
    today: 0, week: 0, month: 0, pending: 0, confirmed: 0, done: 0, cancelled: 0, nouveau: 0, absents: 0,
    avis_count: 0, moyenne_avis: 0, avis_non_lus: 0,
    taux_confirmation: 0, taux_annulation: 0, taux_satisfaction: 0, rdv_total: 0,
    evolution_week: 0, evolution_month: 0, peak_hour: "—", peak_day: "—",
    rdv_par_jour: [], rdv_par_heure: [], notes_distribution: [], recent_activity: [],
    ratio_refus: 0, compte_restreint: false, score_sante: 0,
  });

  // Nouvelle structure de menu (chantier réorganisation dashboard) : "demandes"
  // fusionné dans "rdv" (Lot 2, filtre par statut "Nouveaux"). "disponibilites",
  // "services", "communication" et "scanner" sont de nouveaux onglets de
  // premier niveau (contenu réel ajouté lots suivants — squelette pour l'instant).
  const [tab, setTab] = useState<DashboardTab>("accueil");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [navScrollable, setNavScrollable] = useState(false);
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
  const [bannerRdv, setBannerRdv]           = useState<RDV | null>(null);
  const [showBannerDetail, setShowBannerDetail] = useState(false);
  const [dismissRetard, setDismissRetard]   = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem('yelen224_dark_mode');
      return s !== null ? s === 'true' : true;
    }
    return true;
  });
  const lastRdvCountRef                     = useRef(0);

  function showToast(msg: string, color = T.green) { setToast({ msg, color }); }

  function exportCsv() {
    const termines = rdvs.filter(r => ["effectue", "termine", "honore", "annule"].includes(r.statut));
    if (!termines.length) { showToast("Aucun RDV à exporter", T.orange); return; }
    const header = ["Date", "Heure", "Citoyen", "Téléphone", "Objet", "Statut", "Motif annulation", "Reçu le"];
    const rows = termines.map(r => [
      r.date_rdv,
      r.heure_rdv || "",
      r.citoyen_nom,
      r.citoyen_phone || "",
      r.objet || "RDV général",
      r.statut,
      r.motif_annulation || "",
      r.created_at ? new Date(r.created_at).toLocaleDateString("fr-FR") : "",
    ]);
    const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rdv_${inst?.name || instId}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast(`${termines.length} RDV exportés`, T.green);
  }

  // ── Actions RDV ──
  async function handleAccept(rdvId: string) {
    setActionLoading(rdvId);
    try {
      await supabase.from("rdv").update({ statut: "en_attente" }).eq("id", rdvId).eq("institution_id", instId);
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "en_attente" } : r));
      setSelectedRDV(null);
      setBannerRdv(null);
      setShowBannerDetail(false);
      showToast("RDV accepté — en attente du jour J", T.green);
    } catch { showToast("Erreur", T.red); } finally { setActionLoading(null); }
  }

  async function handleRefuse(rdvId: string, motif?: string) {
    setActionLoading(rdvId);
    try {
      await supabase.from("rdv").update({ statut: "annule", motif_annulation: motif || null }).eq("id", rdvId).eq("institution_id", instId);
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "annule", motif_annulation: motif || undefined } : r));
      setSelectedRDV(null);
      setBannerRdv(null);
      setShowBannerDetail(false);
      showToast("RDV refusé", T.orange);
    } catch { showToast("Erreur", T.red); } finally { setActionLoading(null); }
  }

  async function handleTermine(rdvId: string) {
    setActionLoading(rdvId);
    try {
      await supabase.from("rdv").update({ statut: "termine" }).eq("id", rdvId).eq("institution_id", instId);
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "termine" } : r));
      setSelectedRDV(null);
      showToast("RDV marqué comme terminé", T.purple);
    } catch { showToast("Erreur", T.red); } finally { setActionLoading(null); }
  }

  async function handleAbsent(rdvId: string) {
    setActionLoading(rdvId);
    try {
      await supabase.from("rdv").update({ statut: "absent" }).eq("id", rdvId).eq("institution_id", instId);
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "absent" } : r));
      setSelectedRDV(null);
      showToast("Client marqué absent", T.orange);
    } catch { showToast("Erreur", T.red); } finally { setActionLoading(null); }
  }

  async function saveClientNote(clientId: string, note: string) {
    try {
      localStorage.setItem(`yelen224_note_${instId}_${clientId}`, note);
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, note_privee: note } : c));
      showToast("Note sauvegardée", T.purple);
    } catch { showToast("Erreur sauvegarde", T.red); }
  }

  // ── Chargement données ──
  const loadData = useCallback(async () => {
    if (!instId) { setError("Identifiant manquant."); setLoading(false); return; }
    try {
      setError(null);
      setRefreshing(true);

      // Route serveur (service role) — RLS anon sur institutions ne couvre
      // que statut='validee', bloquait sinon l'institution consultant son
      // propre dashboard tant qu'elle n'est pas validée (406 PGRST116).
      const instRes = await fetch(`/api/institution/profile?institution_id=${instId}`);
      const instJson = instRes.ok ? await instRes.json() : null;
      const instData = instJson?.institution;
      if (instData) setInst(instData as Institution);
      localStorage.setItem("yelen224_institution_id", instId);

      const { data: rdvRaw, error: rdvErr } = await supabase
        .from("rdv")
        .select("id,objet,date_rdv,heure_rdv,statut,citoyen_id,pour_autre,nom_autre,phone_autre,presence,presence_status,presence_confirmed_at,conversation_terminee,motif_annulation,created_at")
        .eq("institution_id", instId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (rdvErr) console.error("[Yelen] RDV fetch error:", rdvErr.message);

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

        const notesMap: Record<string, string> = {};
        rdvRaw.forEach((r: any) => {
          if (r.citoyen_id && !notesMap[r.citoyen_id]) {
            const saved = localStorage.getItem(`yelen224_note_${instId}_${r.citoyen_id}`);
            if (saved) notesMap[r.citoyen_id] = saved;
          }
        });

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

        const newPending = rdvList.filter(r => r.statut === "nouveau");
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
      const nouveau   = rdvList.filter(r => r.statut === "nouveau").length;
      const absents   = rdvList.filter(r => r.statut === "absent").length;
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
        pending, confirmed, done, cancelled, nouveau, absents,
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
  useEffect(() => { localStorage.setItem('yelen224_dark_mode', String(darkMode)); }, [darkMode]);
  useEffect(() => { setSidebarCollapsed(localStorage.getItem("yelen224_sidebar_collapsed") === "1"); }, []);
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("yelen224_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    const checkNavOverflow = () => {
      const el = navRef.current;
      if (el) setNavScrollable(el.scrollHeight > el.clientHeight + 1);
    };
    checkNavOverflow();
    window.addEventListener("resize", checkNavOverflow);
    return () => window.removeEventListener("resize", checkNavOverflow);
  }, [sidebarCollapsed, tab]);

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

  const rdvsPending  = rdvs.filter(r => r.statut === "nouveau");
  const rdvsEnRetard = rdvs.filter(r => {
    if (r.statut !== "en_attente" || !r.date_rdv || !r.heure_rdv) return false;
    const [hh, mm] = r.heure_rdv.split(":").map(Number);
    const rdvTime = new Date(`${r.date_rdv}T${String(hh).padStart(2,"0")}:${String(mm || 0).padStart(2,"0")}:00`);
    return rdvTime < new Date();
  });
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

  // ── Sidebar PC — sections avec labels de groupe (Principal / Activité /
  // Relation citoyenne / Pilotage / Compte), pattern dashboards pro. ──
  const navSections: { label: string; items: { key: typeof tab; label: string; icon: React.ReactNode }[] }[] = [
    { label: "Principal", items: [
      { key: "accueil",    label: "Vue d'ensemble",  icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    ]},
    { label: "Activité", items: [
      { key: "rdv",        label: "Rendez-vous",     icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
      { key: "disponibilites", label: "Disponibilités", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
      { key: "services",   label: "Services",        icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg> },
      { key: "valider-rdv", label: "Valider un RDV", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="8 15 11 18 16 13"/></svg> },
    ]},
    { label: "Relation citoyenne", items: [
      { key: "communication", label: "Communication", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
      { key: "scanner",    label: "Scanner QR",      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg> },
      { key: "codeqr",     label: "Mon code QR",     icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="17.5" y1="14" x2="17.5" y2="17.5"/><line x1="14" y1="17.5" x2="17.5" y2="17.5"/></svg> },
    ]},
    { label: "Pilotage", items: [
      { key: "analyse",    label: "Analyse",         icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    ]},
  ];

  // Sous-menu "Compte" — pas dans le menu principal, façon Supabase : on
  // clique sur la ligne compte (icône + nom) dans le sidebar, ça ouvre ce
  // petit panneau entre le menu principal (réduit) et la vue courante.
  const accountItems: { key: typeof tab; label: string; icon: React.ReactNode }[] = [
    { key: "profil-entreprise", label: "Profil Entreprise",  icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><line x1="9" y1="8" x2="9" y2="8"/><line x1="15" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="9" y2="16"/><line x1="15" y1="16" x2="15" y2="16"/></svg> },
    { key: "profil-responsable", label: "Profil Responsable", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg> },
    { key: "documents", label: "Documents", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
    { key: "parametres", label: "Paramètres",      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ];
  const accountTabKeys: (typeof tab)[] = accountItems.map(i => i.key);

  function openAccountMenu() {
    setAccountMenuOpen(v => {
      const next = !v;
      setSidebarCollapsed(next);
      return next;
    });
  }
  function closeAccountMenu() {
    setAccountMenuOpen(false);
    setSidebarCollapsed(false);
  }

  return (
    <div className="yelen-shell" style={{ minHeight: "100svh", backgroundColor: T.bg, fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", color: T.t1 }}>
      <style>{CSS}</style>

      {/* ── SIDEBAR PC (≥1024px) ── */}
      <aside className="yelen-sidebar" style={{ width: sidebarCollapsed ? "76px" : "264px", minWidth: sidebarCollapsed ? "76px" : "264px", transition: "width 0.18s ease" }}>
        {/* Bouton réduire/étendre le menu, façon Supabase */}
        <button
          onClick={toggleSidebarCollapsed}
          className="tap"
          title={sidebarCollapsed ? "Étendre le menu" : "Réduire le menu"}
          style={{ position: "absolute", right: "-12px", top: "72px", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: T.bgCard2, border: `1px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 401, color: T.t2 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: sidebarCollapsed ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        {/* Logo + titre */}
        <div style={{ padding: sidebarCollapsed ? "20px 10px 12px" : "20px 16px 12px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", marginBottom: sidebarCollapsed ? 0 : "12px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <YelenLogo size={22} color="#000" />
            </div>
            {!sidebarCollapsed && (
              <div>
                <div style={{ color: T.gold, fontSize: "13px", fontWeight: "900", letterSpacing: "0.5px" }}>YELEN224</div>
                <div style={{ color: T.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "0.5px" }}>PRO DASHBOARD</div>
              </div>
            )}
          </div>
        </div>
        {/* Navigation principale — overflowY:auto scope le scroll à ce bloc
            seul (l'aside parent reste overflow:visible pour ne pas clipper
            le bouton toggle en bord de sidebar). Barre jaune #F5A623 en
            bord droit si le contenu dépasse la hauteur visible. */}
        <nav ref={navRef} style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px", overflowY: "auto", position: "relative" }}>
          {navSections.map((section, si) => (
            <div key={section.label} style={{ marginTop: si > 0 ? "14px" : 0 }}>
              {!sidebarCollapsed ? (
                <div style={{ padding: "0 12px 6px", color: T.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase" }}>
                  {section.label}
                </div>
              ) : (
                si > 0 && <div style={{ height: "1px", background: T.border, margin: "0 8px 8px" }}/>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {section.items.map(item => {
                  const active = tab === item.key;
                  const badge = item.key === "rdv" ? rdvsPending.length : 0;
                  return (
                    <button key={item.key} onClick={() => { setTab(item.key); if (accountMenuOpen) closeAccountMenu(); }} className="tap" title={sidebarCollapsed ? item.label : undefined} style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", padding: sidebarCollapsed ? "10px" : "10px 12px", borderRadius: "12px", background: active ? `linear-gradient(135deg, ${T.gold}15, ${T.gold}08)` : "transparent", border: `1px solid ${active ? T.gold + "30" : "transparent"}`, color: active ? T.gold : T.t2, fontWeight: active ? "700" : "500", fontSize: "13px", cursor: "pointer", textAlign: "left", position: "relative", width: "100%" }}>
                      <span style={{ color: active ? T.gold : T.t3, flexShrink: 0 }}>{item.icon}</span>
                      {!sidebarCollapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                      {badge > 0 && (
                        <span style={{ backgroundColor: T.gold, color: "#000", fontSize: "9px", fontWeight: "900", borderRadius: "10px", minWidth: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", position: sidebarCollapsed ? "absolute" : "static", top: sidebarCollapsed ? "2px" : undefined, right: sidebarCollapsed ? "2px" : undefined }}>{badge}</span>
                      )}
                      {active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: "3px", background: T.gold, borderRadius: "0 2px 2px 0" }}/>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {navScrollable && (
            <div style={{ position: "absolute", top: "4px", bottom: "4px", right: "2px", width: "3px", borderRadius: "2px", backgroundColor: "#F5A623", opacity: 0.55, pointerEvents: "none" }}/>
          )}
        </nav>
        {/* Raccourcis bas de sidebar — Scanner QR et Disponibilités retirés :
            déjà présents dans le menu principal ci-dessus (un seul chemin
            d'accès par fonctionnalité). Guide Yelen conservé : distinct,
            aucun équivalent dans le menu principal. */}
        <div style={{ padding: "12px 8px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* Ligne "Compte" — icône + nom institution, clic ouvre le sous-menu
              (Profil Entreprise / Profil Responsable / Paramètres) dans un
              panneau distinct, façon Supabase. Ne fait pas partie du menu
              principal : ne change jamais `tab` directement. */}
          <button onClick={openAccountMenu} className="tap" title={sidebarCollapsed ? "Compte" : undefined} style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", padding: sidebarCollapsed ? "9px" : "9px 10px", borderRadius: "10px", background: accountMenuOpen ? `${T.gold}12` : "transparent", border: `1px solid ${accountMenuOpen ? T.gold + "30" : T.border}`, color: accountMenuOpen ? T.gold : T.t2, cursor: "pointer", width: "100%" }}>
            {inst?.logo ? (
              <img src={inst.logo} alt="" style={{ width: "22px", height: "22px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }}/>
            ) : (
              <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: `linear-gradient(135deg, ${T.gold}30, ${T.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <YelenLogo size={13} color={T.gold} />
              </div>
            )}
            {!sidebarCollapsed && (
              <span style={{ flex: 1, fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{inst?.name || "Compte"}</span>
            )}
            {!sidebarCollapsed && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: accountMenuOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><polyline points="9 18 15 12 9 6"/></svg>
            )}
          </button>
          <button onClick={() => setShowGuide(true)} className="tap" title={sidebarCollapsed ? "Guide Yelen" : undefined} style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", padding: sidebarCollapsed ? "9px" : "9px 12px", borderRadius: "10px", background: "transparent", border: `1px solid ${T.border}`, color: T.t2, fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {!sidebarCollapsed && "Guide Yelen"}
          </button>
        </div>
      </aside>

      {/* ── PANNEAU "COMPTE" — entre le sidebar (réduit) et la vue courante,
          façon Supabase (Project Settings). Desktop uniquement (≥1024px,
          voir CSS .yelen-account-panel). ── */}
      {accountMenuOpen && (
        <div className="yelen-account-panel" style={{ left: sidebarCollapsed ? "76px" : "264px" }}>
          <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={closeAccountMenu} className="tap" style={{ width: "26px", height: "26px", borderRadius: "8px", background: "transparent", border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.t2, flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: T.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst?.name || "Compte"}</div>
              <div style={{ color: T.t3, fontSize: "10px" }}>Paramètres du compte</div>
            </div>
          </div>
          <div style={{ padding: "10px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {accountItems.map(item => {
              const active = tab === item.key;
              return (
                <button key={item.key} onClick={() => setTab(item.key)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: active ? `linear-gradient(135deg, ${T.gold}15, ${T.gold}08)` : "transparent", border: `1px solid ${active ? T.gold + "30" : "transparent"}`, color: active ? T.gold : T.t2, fontWeight: active ? "700" : "500", fontSize: "13px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                  <span style={{ color: active ? T.gold : T.t3, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CONTENU PRINCIPAL ── */}
      <div className="yelen-main" style={{ paddingBottom: "80px", marginLeft: `${(sidebarCollapsed ? 76 : 264) + (accountMenuOpen ? 232 : 0)}px`, transition: "margin-left 0.18s ease" }}>

      {/* ── MODALS ── */}
      {showGuide && <GuideScalingModal onClose={() => setShowGuide(false)}/>}
      {showScanner && instId && <ScannerModal institutionId={instId} onClose={() => { setShowScanner(false); loadData(); }} onTermine={handleTermine}/>}

      {showBannerDetail && bannerRdv && (
        <RdvDetailFullscreen
          rdv={bannerRdv}
          onClose={() => setShowBannerDetail(false)}
          onAccept={() => handleAccept(bannerRdv.id)}
          onRefuse={(motif) => handleRefuse(bannerRdv.id, motif)}
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
            {selectedRDV.statut === "nouveau" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button onClick={() => handleRefuse(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: T.redL, color: T.red, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${T.red}25`, cursor: "pointer" }}>
                  {actionLoading === selectedRDV.id ? "..." : "Refuser"}
                </button>
                <button onClick={() => handleAccept(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ background: `linear-gradient(135deg, ${T.green}, #009e76)`, color: "#fff", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer" }}>
                  {actionLoading === selectedRDV.id ? "..." : "Accepter"}
                </button>
              </div>
            ) : selectedRDV.statut === "en_attente" ? (() => {
              const isRetard = (() => {
                if (!selectedRDV.date_rdv || !selectedRDV.heure_rdv) return false;
                const [hh, mm] = selectedRDV.heure_rdv.split(":").map(Number);
                return new Date(`${selectedRDV.date_rdv}T${String(hh).padStart(2,"0")}:${String(mm||0).padStart(2,"0")}:00`) < new Date();
              })();
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button onClick={() => handleTermine(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ background: `linear-gradient(135deg, ${T.purple}, #7a55d0)`, color: "#fff", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer" }}>
                    {actionLoading === selectedRDV.id ? "..." : "✓ Marquer terminé"}
                  </button>
                  {isRetard && (
                    <button onClick={() => handleAbsent(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: T.orangeL, color: T.orange, fontWeight: "800", fontSize: "14px", padding: "13px", borderRadius: "14px", border: `1px solid ${T.orange}25`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      {actionLoading === selectedRDV.id ? "..." : "Client absent"}
                    </button>
                  )}
                  <button onClick={() => setSelectedRDV(null)} className="tap" style={{ backgroundColor: T.bg3, color: T.t2, fontWeight: "700", fontSize: "14px", padding: "13px", borderRadius: "14px", border: `1px solid ${T.border}`, cursor: "pointer" }}>Fermer</button>
                </div>
              );
            })() : selectedRDV.statut === "confirme" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button onClick={() => handleTermine(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ background: `linear-gradient(135deg, ${T.purple}, #7a55d0)`, color: "#fff", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer" }}>
                  {actionLoading === selectedRDV.id ? "..." : "✓ Marquer terminé"}
                </button>
                <button onClick={() => setSelectedRDV(null)} className="tap" style={{ backgroundColor: T.bg3, color: T.t2, fontWeight: "700", fontSize: "14px", padding: "13px", borderRadius: "14px", border: `1px solid ${T.border}`, cursor: "pointer" }}>Fermer</button>
              </div>
            ) : (
              <button onClick={() => setSelectedRDV(null)} className="tap" style={{ width: "100%", backgroundColor: T.bg3, color: T.t2, fontWeight: "700", fontSize: "14px", padding: "13px", borderRadius: "14px", border: `1px solid ${T.border}`, cursor: "pointer" }}>Fermer</button>
            )}
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} onDismiss={() => setToast(null)}/>}

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
        <ProfilProgressionBandeau inst={inst} instId={instId} setTab={setTab} />

        {/* ── BANDEAU NOUVEAU RDV — se déclenche à chaque INSERT Realtime ── */}
        {bannerRdv && !showBannerDetail && (
          <NouveauRdvBanner rdv={bannerRdv} onClose={() => setBannerRdv(null)} onOpen={() => setShowBannerDetail(true)}/>
        )}

        {/* ── BANDEAU RDV DÉPASSÉS ── */}
        {rdvsEnRetard.length > 0 && !dismissRetard && (
          <div style={{ backgroundColor: `${T.purple}18`, borderBottom: `1px solid ${T.purple}35`, padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", animation: "slideDownBanner 0.3s ease" }}>
            <div style={{ position: "relative", flexShrink: 0, width: "8px", height: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: T.purple }}/>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: T.purple, animation: "ping 1.5s ease-out infinite" }}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: T.purple, fontSize: "11px", fontWeight: "800" }}>
                {rdvsEnRetard.length === 1 ? "1 RDV confirmé a dépassé son heure" : `${rdvsEnRetard.length} RDV confirmés ont dépassé leur heure`} — Pensez à les clôturer
              </div>
              <div style={{ color: T.t3, fontSize: "10px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rdvsEnRetard.slice(0, 3).map(r => `${r.citoyen_nom} (${r.heure_rdv})`).join(" · ")}{rdvsEnRetard.length > 3 ? ` +${rdvsEnRetard.length - 3}` : ""}
              </div>
            </div>
            <button onClick={() => { setTab("rdv"); setRdvFilter("confirme"); setDismissRetard(true); }} className="tap" style={{ backgroundColor: T.purple, color: "#fff", fontSize: "10px", fontWeight: "800", padding: "6px 10px", borderRadius: "8px", border: "none", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
              Voir
            </button>
            <button onClick={() => setDismissRetard(true)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "4px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "6px" }}>
              {[
                { label: "Nouveau",  value: stats.nouveau,    color: T.gold,   bg: `${T.gold}15`,   filter: "nouveau" },
                { label: "Attente",  value: stats.pending,    color: T.orange, bg: `${T.orange}12`, filter: "en_attente" },
                { label: "Terminé",  value: stats.done,       color: T.blue,   bg: `${T.blue}12`,   filter: "effectue" },
                { label: "Annulé",   value: stats.cancelled,  color: T.red,    bg: `${T.red}12`,    filter: "annule" },
                { label: "Absent",   value: stats.absents,    color: T.orange, bg: `${T.orange}10`, filter: "absent" },
                { label: "Total",    value: stats.rdv_total,  color: T.t1,     bg: T.bg3,           filter: "tous" },
              ].map(k => (
                <div key={k.label} onClick={() => { setTab("rdv"); setRdvFilter(k.filter); }} className="tap"
                  style={{ backgroundColor: k.bg, borderRadius: "12px", padding: "10px 4px", textAlign: "center", cursor: "pointer", border: `1px solid ${k.color}20` }}>
                  <div style={{ color: k.color, fontSize: "18px", fontWeight: "900", lineHeight: 1 }}>{k.value}</div>
                  <div style={{ color: k.color, fontSize: "8px", fontWeight: "700", marginTop: "3px", opacity: 0.8 }}>{k.label}</div>
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
              {([
                { label: "Annonces",    tab: "communication", href: undefined, icon: T.orange, svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="1.8" strokeLinecap="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg> },
                { label: "Mes services",tab: "services",      href: undefined, icon: T.blue,   svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
                { label: "Signalements",tab: "communication", href: undefined, icon: T.red,    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
                { label: "FAQ",         tab: undefined,       href: `/faq`,    icon: T.teal,   svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
              ] as { label: string; tab?: typeof tab; href?: string; icon: string; svg: React.ReactNode }[]).map((item, i) => {
                const content = (
                  <>
                    <div style={{ width: "38px", height: "38px", borderRadius: "11px", backgroundColor: `${item.icon}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.svg}</div>
                    <span style={{ color: T.t2, fontSize: "9px", fontWeight: "700" }}>{item.label}</span>
                  </>
                );
                const style: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "14px 8px", textDecoration: "none", borderRight: i < 3 ? `1px solid ${T.border}` : "none" };
                return item.tab ? (
                  <button key={i} onClick={() => setTab(item.tab!)} className="tap" style={{ ...style, background: "transparent", border: "none", borderRight: i < 3 ? `1px solid ${T.border}` : "none", cursor: "pointer" }}>{content}</button>
                ) : (
                  <Link key={i} href={item.href!} style={style}>{content}</Link>
                );
              })}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <h1 style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Rendez-vous</h1>
            <button onClick={exportCsv} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: T.bgCard, border: `1px solid ${T.border2}`, borderRadius: "10px", padding: "8px 12px", color: T.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
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
              { key: "tous",       label: "Tous",        count: rdvs.length },
              { key: "nouveau",    label: "Nouveaux",    count: stats.nouveau },
              { key: "en_attente", label: "En attente",  count: stats.pending },
              { key: "confirme",   label: "Confirmés",   count: stats.confirmed },
              { key: "effectue",   label: "Effectués",   count: stats.done },
              { key: "annule",     label: "Annulés",     count: stats.cancelled },
              { key: "absent",     label: "Absents",     count: stats.absents },
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
            rdvFilter === "nouveau" ? (
              <div style={{ backgroundColor: T.bgCard, borderRadius: "20px", padding: "48px 24px", textAlign: "center", border: `1px solid ${T.border}` }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: T.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ color: T.green, fontSize: "15px", fontWeight: "800", marginBottom: "4px" }}>Tout est traité</div>
                <div style={{ color: T.t3, fontSize: "12px" }}>Aucune nouvelle demande en attente</div>
              </div>
            ) : (
              <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", padding: "40px 20px", textAlign: "center", border: `1px solid ${T.border}` }}>
                <p style={{ color: T.t1, fontSize: "13px", fontWeight: "700" }}>Aucun rendez-vous trouvé</p>
              </div>
            )
          ) : rdvFilter === "nouveau" ? (
            // Vue "Nouvelles demandes" — cartes avec urgence, appel rapide,
            // fusionnée ici depuis l'ancien onglet séparé "demandes". Affichée
            // uniquement pour ce filtre précis, la vue compacte standard couvre
            // tous les autres statuts juste en dessous.
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredRdvs.map((r, idx) => {
                const recuIl = r.created_at ? Date.now() - new Date(r.created_at).getTime() : 0;
                const minutesEcoulees = Math.floor(recuIl / 60000);
                const urgence = minutesEcoulees < 15 ? T.red : minutesEcoulees < 60 ? T.orange : T.gold;
                return (
                  <div key={r.id} style={{ backgroundColor: T.bgCard, borderRadius: "18px", border: `2px solid ${urgence}35`, borderLeft: `4px solid ${urgence}`, overflow: "hidden", animation: `fadeUp 0.2s ease ${idx * 0.06}s both` }}>
                    <div style={{ backgroundColor: `${urgence}12`, padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: urgence }}/>
                        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: urgence, animation: "ping 1.5s ease-out infinite" }}/>
                      </div>
                      <span style={{ color: urgence, fontSize: "10px", fontWeight: "900" }}>
                        {minutesEcoulees < 1 ? "À l'instant" : minutesEcoulees < 60 ? `Il y a ${minutesEcoulees} min` : `Il y a ${Math.floor(minutesEcoulees/60)}h`}
                      </span>
                      <span style={{ marginLeft: "auto", color: T.t3, fontSize: "9px" }}>Demande #{idx + 1}</span>
                    </div>
                    <div style={{ padding: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "46px", height: "46px", borderRadius: "13px", background: `linear-gradient(135deg, ${urgence}30, ${urgence}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "900", color: urgence, flexShrink: 0 }}>
                        {r.citoyen_nom.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.t1, fontSize: "15px", fontWeight: "800" }}>{r.citoyen_nom}</div>
                        {r.citoyen_phone && <div style={{ color: T.t3, fontSize: "11px" }}>{r.citoyen_phone}</div>}
                        <div style={{ color: T.t2, fontSize: "11px", marginTop: "3px" }}>{r.objet || "RDV général"}</div>
                      </div>
                      {r.citoyen_phone && (
                        <a href={`tel:${r.citoyen_phone}`} style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: T.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        </a>
                      )}
                    </div>
                    <div style={{ margin: "0 14px 12px", backgroundColor: T.bg3, borderRadius: "10px", padding: "10px 12px", display: "flex", gap: "16px" }}>
                      <div>
                        <div style={{ color: T.t3, fontSize: "9px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Date</div>
                        <div style={{ color: T.t1, fontSize: "12px", fontWeight: "800" }}>{formatDate(r.date_rdv, { weekday: "short", day: "numeric", month: "short" })}</div>
                      </div>
                      <div style={{ width: "1px", backgroundColor: T.border }}/>
                      <div>
                        <div style={{ color: T.t3, fontSize: "9px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Heure</div>
                        <div style={{ color: T.t1, fontSize: "12px", fontWeight: "800" }}>{r.heure_rdv || "—"}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px", padding: "0 14px 14px" }}>
                      <button onClick={() => handleRefuse(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: T.redL, color: T.red, fontWeight: "800", fontSize: "13px", padding: "12px", borderRadius: "12px", border: `1px solid ${T.red}25`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Refuser
                      </button>
                      <button onClick={() => handleAccept(r.id)} disabled={!!actionLoading} className="tap" style={{ background: `linear-gradient(135deg, ${T.green}, #009e76)`, color: "#fff", fontWeight: "900", fontSize: "14px", padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", boxShadow: `0 3px 14px ${T.green}30` }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        {actionLoading === r.id ? "..." : "Accepter"}
                      </button>
                    </div>
                  </div>
                );
              })}
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
                    {r.statut === "nouveau" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${T.border}` }}>
                        <button onClick={() => handleRefuse(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: "transparent", color: T.red, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", borderRight: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Refuser
                        </button>
                        <button onClick={() => handleAccept(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: "transparent", color: T.green, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Accepter
                        </button>
                      </div>
                    )}
                    {r.statut === "en_attente" && (() => {
                      const rdvRetard = (() => {
                        if (!r.date_rdv || !r.heure_rdv) return false;
                        const [hh, mm] = r.heure_rdv.split(":").map(Number);
                        return new Date(`${r.date_rdv}T${String(hh).padStart(2,"0")}:${String(mm||0).padStart(2,"0")}:00`) < new Date();
                      })();
                      return (
                        <div style={{ borderTop: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: rdvRetard ? "1fr 1fr" : "1fr" }}>
                          <button onClick={() => handleTermine(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: "transparent", color: T.purple, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", borderRight: rdvRetard ? `1px solid ${T.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.purple} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Terminé
                          </button>
                          {rdvRetard && (
                            <button onClick={() => handleAbsent(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: "transparent", color: T.orange, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Absent
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {r.statut === "confirme" && (
                      <div style={{ borderTop: `1px solid ${T.border}` }}>
                        <button onClick={() => handleTermine(r.id)} disabled={!!actionLoading} className="tap" style={{ width: "100%", backgroundColor: "transparent", color: T.purple, fontWeight: "800", fontSize: "12px", padding: "10px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.purple} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Marquer terminé
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* RDV Payants en attente de validation */}
          {rdvFilter === "tous" && (() => {
            const payants = rdvs.filter(r =>
              (r.statut === "en_attente" || r.statut === "nouveau") &&
              r.objet && r.objet.toLowerCase().includes("[payant]")
            );
            if (!payants.length) return null;
            return (
              <div style={{ marginTop: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <div style={{ width: "3px", height: "16px", background: T.green, borderRadius: "2px" }}/>
                  <span style={{ color: T.t1, fontSize: "14px", fontWeight: "800" }}>RDV Payants — validation en attente</span>
                  <span style={{ backgroundColor: T.green, color: "#000", fontSize: "9px", fontWeight: "900", padding: "2px 7px", borderRadius: "20px" }}>{payants.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {payants.map(r => (
                    <div key={r.id} style={{ backgroundColor: T.bgCard, borderRadius: "14px", border: `1px solid ${T.green}25`, borderLeft: `3px solid ${T.green}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.t1, fontSize: "13px", fontWeight: "700" }}>{r.citoyen_nom}</div>
                        <div style={{ color: T.t2, fontSize: "11px" }}>{r.objet}</div>
                        <div style={{ color: T.t3, fontSize: "10px", marginTop: "2px" }}>{formatDate(r.date_rdv, { day: "numeric", month: "short" })} · {r.heure_rdv}</div>
                      </div>
                      <a href="/institution/valider-rdv" style={{ backgroundColor: T.green, color: "#000", fontSize: "11px", fontWeight: "800", padding: "8px 12px", borderRadius: "10px", textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center", gap: "5px" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Valider paiement
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* L'ancien onglet "Nouvelles demandes" est fusionné dans l'onglet
          Rendez-vous ci-dessus (filtre "Nouveaux") — plus de bloc séparé ici. */}

      {/* ═══════════════════════════════════════════════════════════
          TAB : DISPONIBILITÉS
      ═══════════════════════════════════════════════════════════ */}
      {tab === "disponibilites" && inst && (
        <DisponibilitesTab disponibilites={inst.disponibilites} onSaved={loadData}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : SERVICES
      ═══════════════════════════════════════════════════════════ */}
      {tab === "services" && (
        <ServicesTab instId={instId}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : COMMUNICATION — Annonces (Lot 5a réel), Signalements (Lot 5b à venir)
      ═══════════════════════════════════════════════════════════ */}
      {tab === "communication" && (
        <CommunicationTab instId={instId}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : SCANNER QR — historique des RDV scannés (présence
          confirmée via le bouton Scanner du header/sidebar, colonnes
          réelles presence_status/presence_confirmed_at — confirmé par
          la lecture de app/api/qr/validate/route.ts, pas les champs
          qr_valide/qr_scanne_le documentés dans CLAUDE.md, obsolètes).
      ═══════════════════════════════════════════════════════════ */}
      {tab === "scanner" && (() => {
        const scanned = rdvs
          .filter(r => r.presence_status === "present")
          .sort((a, b) => new Date(b.presence_confirmed_at || b.date_rdv).getTime() - new Date(a.presence_confirmed_at || a.date_rdv).getTime());
        return (
          <div style={{ padding: "16px" }}>
            <h1 style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Scanner QR</h1>
            <p style={{ color: T.t2, fontSize: "13px", marginBottom: "16px" }}>Historique des rendez-vous dont la présence a été confirmée par scan.</p>

            {scanned.length === 0 ? (
              <div style={{ backgroundColor: T.bgCard, border: `1px dashed ${T.border2}`, borderRadius: "16px", padding: "48px 20px", textAlign: "center" }}>
                <p style={{ color: T.t1, fontSize: "15px", fontWeight: "700", margin: "0 0 8px" }}>Aucun scan pour le moment</p>
                <p style={{ color: T.t2, fontSize: "13px", margin: 0 }}>Utilisez le bouton Scanner (en-tête ou menu) pour confirmer la présence d'un client à son arrivée.</p>
              </div>
            ) : (
              <div style={{ backgroundColor: T.bgCard, borderRadius: "16px", border: `1px solid ${T.border}`, overflow: "hidden" }}>
                {scanned.map((r, i) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: i < scanned.length - 1 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: T.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.t1, fontSize: "13.5px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.citoyen_nom}</div>
                      <div style={{ color: T.t3, fontSize: "11.5px" }}>{r.objet || "RDV général"} · {formatDate(r.date_rdv, { day: "numeric", month: "short" })} {r.heure_rdv?.slice(0, 5)}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ backgroundColor: T.greenL, color: T.green, fontSize: "10.5px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>Présence confirmée</span>
                      {r.presence_confirmed_at && (
                        <div style={{ color: T.t3, fontSize: "10px", marginTop: "4px" }}>{formatDate(r.presence_confirmed_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════
          TAB : MON CODE QR
      ═══════════════════════════════════════════════════════════ */}
      {tab === "codeqr" && inst && (
        <CodeQrTab instId={instId} instName={inst.name}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : VALIDER UN RDV PAYANT
      ═══════════════════════════════════════════════════════════ */}
      {tab === "valider-rdv" && (
        <ValiderRdvTab instId={instId}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : PROFIL ENTREPRISE — distinct de Profil Responsable, accès
          via le petit menu "Compte" (sidebar), pas dans le menu principal.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "profil-entreprise" && (
        <ProfilEntrepriseTab instId={instId} onToast={showToast}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : PROFIL RESPONSABLE — table institution_responsables séparée
      ═══════════════════════════════════════════════════════════ */}
      {tab === "profil-responsable" && (
        <ProfilResponsableTab instId={instId} onToast={showToast}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : DOCUMENTS — vérification institutionnelle, remplace
          l'ancien /institution/document. Accès via menu Compte.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "documents" && (
        <DocumentsTab instId={instId} onToast={showToast}/>
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
            {analyseTab === "tunnel"  && <TunnelAcquisition rdvs={rdvs}/>}
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
              <Link href={`/institution/profil`} style={{ color: T.gold, textDecoration: "none", fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>Modifier</Link>
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

      {/* ═══════ BOTTOM NAVIGATION — 4 onglets + "Plus" (mobile) ═══════
          8-9 onglets ne tiennent plus dans une barre à 5 colonnes égales.
          On garde ici les 4 actions les plus fréquentes visibles en permanence
          (Accueil, Rendez-vous, Disponibilités, Scanner — Scanner remonté en
          priorité comme demandé), le reste (Services, Communication, Analyse,
          Paramètres) est accessible via "Plus", qui ouvre une feuille. Le
          sidebar desktop, lui, affiche déjà les 8 onglets sans contrainte
          d'espace — pas besoin d'y répliquer ce compromis. */}
      </div>{/* fin .yelen-main */}
      <nav className="yelen-bottom-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, backgroundColor: "rgba(10,10,15,0.97)", backdropFilter: "blur(32px) saturate(200%)", borderTop: `1px solid ${T.border}`, paddingBottom: "env(safe-area-inset-bottom)", display: "grid", gridTemplateColumns: "repeat(5,1fr)", boxShadow: "0 -12px 40px rgba(0,0,0,0.6)" }}>
        {([
          { key: "accueil",    label: "Accueil",   badge: 0,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill={a ? T.gold : "none"} stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
          { key: "rdv",        label: "RDV",       badge: rdvsPending.length,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
          { key: "disponibilites", label: "Créneaux", badge: 0,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
          { key: "scanner",    label: "Scanner",   badge: 0,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg> },
          { key: "__plus__",   label: "Plus",   badge: 0,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a ? T.gold : T.t2} strokeWidth="1.8" strokeLinecap="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg> },
        ] as { key: typeof tab | "__plus__"; label: string; badge: number; icon: (a: boolean) => any }[]).map(item => {
          const overflowTabs: (typeof tab)[] = ["services", "communication", "codeqr", "valider-rdv", "analyse", "parametres", "profil-entreprise", "profil-responsable", "documents"];
          const active = item.key === "__plus__" ? overflowTabs.includes(tab) : tab === item.key;
          return (
            <button key={item.key} onClick={() => item.key === "__plus__" ? setMobileMoreOpen(true) : setTab(item.key as typeof tab)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", background: "none", border: "none", padding: "8px 4px 5px", cursor: "pointer", position: "relative" }}>
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

      {/* ═══════ FEUILLE "PLUS" — onglets restants (mobile uniquement) ═══════
          Drill-down "Compte" : la ligne Compte ouvre un second écran dans la
          même feuille (pas un menu principal séparé) listant Profil
          Entreprise / Profil Responsable / Paramètres — équivalent mobile
          du panneau desktop .yelen-account-panel. */}
      {mobileMoreOpen && (
        <div onClick={() => { setMobileMoreOpen(false); setAccountMenuOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: T.bgCard, borderRadius: "24px 24px 0 0", padding: "12px 12px 24px", width: "100%", maxWidth: "480px", border: `1px solid ${T.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: T.t3, margin: "0 auto 16px" }}/>

            {accountMenuOpen ? (
              <>
                <button onClick={() => setAccountMenuOpen(false)} className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", padding: "6px 4px 14px", cursor: "pointer", color: T.t2, fontSize: "12px", fontWeight: "700" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  {inst?.name || "Compte"}
                </button>
                {accountItems.map(item => {
                  const active = tab === item.key;
                  return (
                    <button key={item.key} onClick={() => { setTab(item.key); setMobileMoreOpen(false); setAccountMenuOpen(false); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "13px 12px", borderRadius: "12px", background: active ? `${T.gold}12` : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ color: active ? T.gold : T.t2, display: "flex" }}>{item.icon}</span>
                      <span style={{ color: active ? T.gold : T.t1, fontSize: "14px", fontWeight: active ? "800" : "600", flex: 1 }}>{item.label}</span>
                      {active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {([
                  { key: "services",       label: "Services",        icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg> },
                  { key: "communication",  label: "Communication",   icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                  { key: "codeqr",         label: "Mon code QR",     icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="17.5" y1="14" x2="17.5" y2="17.5"/><line x1="14" y1="17.5" x2="17.5" y2="17.5"/></svg> },
                  { key: "valider-rdv",    label: "Valider un RDV",  icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="8 15 11 18 16 13"/></svg> },
                  { key: "analyse",        label: "Analyse",         icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
                ] as { key: typeof tab; label: string; icon: React.ReactNode }[]).map(item => {
                  const active = tab === item.key;
                  return (
                    <button key={item.key} onClick={() => { setTab(item.key); setMobileMoreOpen(false); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "13px 12px", borderRadius: "12px", background: active ? `${T.gold}12` : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ color: active ? T.gold : T.t2, display: "flex" }}>{item.icon}</span>
                      <span style={{ color: active ? T.gold : T.t1, fontSize: "14px", fontWeight: active ? "800" : "600", flex: 1 }}>{item.label}</span>
                      {active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  );
                })}
                <div style={{ height: "1px", background: T.border, margin: "6px 4px" }}/>
                <button onClick={() => setAccountMenuOpen(true)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "13px 12px", borderRadius: "12px", background: accountTabKeys.includes(tab) ? `${T.gold}12` : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  {inst?.logo ? (
                    <img src={inst.logo} alt="" style={{ width: "19px", height: "19px", borderRadius: "5px", objectFit: "cover", flexShrink: 0 }}/>
                  ) : (
                    <span style={{ color: accountTabKeys.includes(tab) ? T.gold : T.t2, display: "flex" }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>
                    </span>
                  )}
                  <span style={{ color: accountTabKeys.includes(tab) ? T.gold : T.t1, fontSize: "14px", fontWeight: accountTabKeys.includes(tab) ? "800" : "600", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst?.name || "Compte"}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
