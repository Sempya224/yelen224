"use client";
// ═══════════════════════════════════════════════════════════════════════
// YELEN224 — Prise de RDV (Wizard)
// Path : /app/rdv/[id]/page.tsx
//
// Refonte Lot D (décision CEO 16/07/2026) : le citoyen ne réserve plus un
// "rendez-vous" abstrait avec un motif libre — il réserve un SERVICE précis
// proposé par l'établissement (gratuit, "Offre générale" — institutions.
// services structuré, Lot A — ou payant, paid_services — réellement
// fonctionnel dès maintenant, aucun flag de gating : la restriction par
// abonnement/statut de compte est un mécanisme à concevoir séparément,
// plus tard, pas une raison de désactiver la fonctionnalité en attendant).
// Calendrier + créneaux dérivés de institutions.disponibilites +
// capacite_par_creneau (Lot B, via /api/rdv-disponibilite). Champs
// complémentaires configurés par service (Lot C) demandés seulement si le
// service en a. QR + code Yelen générés pour toute réservation (gratuite ou
// payante) — unifie l'ancienne dualité SuccessGratuit/SuccessPayant.
// ═══════════════════════════════════════════════════════════════════════

import NextImage from "next/image";
import { supabase } from "@/lib/supabase";
import { DEVISE_LABEL } from "@/lib/devise";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
type ThemeC = (typeof T)[keyof typeof T];
import { YelenLoader } from "@/components/YelenLoader";
import { EcranContenuIntrouvable } from "@/components/EcranContenuIntrouvable";
import Link from "next/link";
import QRCode from "qrcode";
import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRdv, notifierReservationPayante } from "./actions";
import { type CreneauSlot, generateSlotsInRange, toISODate } from "@/lib/disponibilites";
import { ACTIVITE_CATEGORIE_COLORS, ActiviteCategorieIcon } from "@/lib/activiteVisuels";

// ─── Types ────────────────────────────────────────────────────────────
type InstitutionRow = {
  id: string;
  name: string;
  ville: string;
  quartier: string;
  adresse: string;
  phone: string;
  category: string;
  // Chantier "Recherche & catégories" (21/08/2026) — `category` (texte
  // libre) n'est plus jamais écrite depuis la migration Taxonomie, voir
  // app/recherche/shared.tsx. Résolu via activite_categorie_id (FK directe
  // sur institutions) → activite_categories.code, jamais un embed
  // PostgREST (piège documenté, CLAUDE.md).
  activiteCategorieCode: string | null;
  badge_verifie: boolean;
  logo: string | null;
  description: string | null;
  moyenne_avis: number;
  nb_avis: number;
  disponibilites: unknown;
  services: unknown;
  capacite_par_creneau: number;
};

type ChampComplementaire = { label: string; type: "texte" | "tel" | "numero"; requis: boolean };

type PaidServiceRow = {
  id: string;
  nom: string;
  prix: number;
  duree_minutes: number;
  description: string | null;
  champs_complementaires: ChampComplementaire[] | null;
  taux_taxe: number | null;
};

// Service unifié — gratuit (Offre générale) ou payant (paid_services),
// tous deux réservables via le même wizard (principe CEO : "le citoyen
// réserve un service, jamais un motif abstrait").
type WizardService = {
  id: string;
  nom: string;
  description: string;
  duree_minutes: number;
  payant: boolean;
  prix: number;
  champs_complementaires: ChampComplementaire[];
  serviceIdForBooking?: string;
  tauxTaxe?: number;
};

type Availability = { capacite: number; counts: Record<string, number> };

type StepId = "service" | "date" | "heure" | "recap" | "champs";

// ─── Utilitaires date ─────────────────────────────────────────────────
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_FR = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

// Retour Bryan 25/07/2026 : la durée est configurable côté institution pour
// tous les services (gratuits comme payants, voir WizardService.duree_minutes)
// mais n'était jamais utilisée pour montrer une vraie plage horaire au
// citoyen — seulement une heure de début. addMinutes gère le passage à
// minuit (RDV tard le soir) par un modulo 24h.
function addMinutes(heure: string, minutes: number): string {
  const [h, m] = heure.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatDateLabel(dateRdv: string, heureRdv: string, dureeMinutes?: number): string {
  try {
    const d = new Date(`${dateRdv}T${heureRdv || "00:00"}:00`);
    if (isNaN(d.getTime())) return `${dateRdv} ${heureRdv}`.trim();
    const jour = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (!heureRdv) return jour;
    const plage = dureeMinutes && dureeMinutes > 0 ? `${heureRdv} - ${addMinutes(heureRdv, dureeMinutes)}` : heureRdv;
    return `${jour} à ${plage}`;
  } catch { return `${dateRdv} ${heureRdv}`.trim(); }
}

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// GNF (Franc Guinéen), pas FCFA — la Guinée n'appartient pas à la zone
// UEMOA/CEMAC, elle a sa propre monnaie (retour Bryan 25/07/2026). Migration
// FCFA → GNF étendue à tout le projet le 06/08/2026 via lib/devise.ts
// (DEVISE_LABEL, schéma centralisé pour une future expansion multi-devise).
function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " " + DEVISE_LABEL;
}

function buildIcs(opts: { title: string; description: string; location: string; dateRdv: string; heureRdv: string; durationMinutes: number }): string {
  const [y, mo, d] = opts.dateRdv.split("-").map(Number);
  const [hh, mm] = (opts.heureRdv || "00:00").split(":").map(Number);
  const start = new Date(y, mo - 1, d, hh, mm);
  const end = new Date(start.getTime() + Math.max(opts.durationMinutes, 15) * 60000);
  const fmt = (dt: Date) => `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}T${String(dt.getHours()).padStart(2, "0")}${String(dt.getMinutes()).padStart(2, "0")}00`;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Yelen224//RDV//FR", "BEGIN:VEVENT",
    `UID:${Date.now()}@yelen224`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${opts.title}`, `DESCRIPTION:${opts.description}`, `LOCATION:${opts.location}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

// ─── Composant Logo ───────────────────────────────────────────────────
// Métadonnées catégories — chantier "Recherche & catégories" (21/08/2026) :
// remplace l'ancien CAT_META local (basé sur `category`, texte libre plus
// jamais écrit depuis la migration Taxonomie) par lib/activiteVisuels.tsx,
// même source unique que app/recherche/shared.tsx. Institution sans
// activiteCategorieCode → fallback gris neutre, jamais une couleur/icône
// inventée.
function InstitutionLogo({ inst, size = 56 }: { inst: InstitutionRow; size?: number }) {
  const [err, setErr] = useState(false);
  const color = inst.activiteCategorieCode ? (ACTIVITE_CATEGORIE_COLORS[inst.activiteCategorieCode] ?? "#9C9CA8") : "#9C9CA8";
  const initials = inst.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  if (inst.logo && !err) {
    return (
      <div style={{ width: size, height: size, position: "relative", borderRadius: "16px", overflow: "hidden", flexShrink: 0, border: `2px solid ${color}30`, boxShadow: `0 0 0 4px ${color}12` }}>
        <NextImage src={inst.logo} alt={inst.name} fill sizes={`${size}px`} onError={() => setErr(true)} style={{ objectFit: "cover" }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "16px", flexShrink: 0, background: `linear-gradient(135deg, ${color}25, ${color}10)`, border: `2px solid ${color}35`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", boxShadow: `0 0 0 4px ${color}08` }}>
      {inst.activiteCategorieCode ? (
        <ActiviteCategorieIcon code={inst.activiteCategorieCode} color={color} size={Math.round(size * 0.38)}/>
      ) : (
        <svg width={Math.round(size * 0.38)} height={Math.round(size * 0.38)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/></svg>
      )}
      <span style={{ color, fontSize: "10px", fontWeight: "900", letterSpacing: "0.5px" }}>{initials || "?"}</span>
    </div>
  );
}

// Badge vérifié — repris à l'identique de app/institution/[id]/page.tsx
// (accordé par un admin Yelen après contrôle des documents) pour garder
// exactement le même repère visuel entre la fiche institution et le wizard.
function MetaVerifiedBadge({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#0095F6" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"/>
      <path fill="#fff" d="M9.9 16.2 6 12.3l1.4-1.4 2.5 2.5 6.7-6.7 1.4 1.4z"/>
    </svg>
  );
}

// Pop-up plein écran à l'intention de quitter — même gabarit exact que le
// plein écran "Avis" de la fiche institution (app/institution/[id]/page.tsx,
// reviewsOpen : position fixed inset:0 sur C.pageBg, header sticky avec X
// carré à gauche, PAS une carte flottante sur overlay noir), retour Bryan
// 25/07/2026, pour rester cohérent avec le seul autre plein écran du produit.
const RAISONS_ABANDON = [
  "Je regardais juste ce qui était proposé",
  "Les horaires ne me conviennent pas",
  "Je reviendrai plus tard",
  "Autre raison",
];

function ExitIntentModal({ institutionName, isDark, C, onStay, onSubmitFeedback, onLeaveNow }: {
  institutionName: string; isDark: boolean; C: ThemeC; onStay: () => void;
  onSubmitFeedback: (raison: string, commentaire: string) => Promise<void>;
  onLeaveNow: () => void;
}) {
  const [raison, setRaison] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [phase, setPhase] = useState<"form" | "sending" | "merci">("form");
  const inputBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBord = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  async function handleLeave() {
    if (!raison) { onLeaveNow(); return; }
    setPhase("sending");
    await onSubmitFeedback(raison, commentaire);
    setPhase("merci");
    setTimeout(onLeaveNow, 1600);
  }

  if (phase === "merci") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#FBBF24)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(245,166,35,0.35)", marginBottom: "16px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ color: C.text, fontSize: "17px", fontWeight: "900", textAlign: "center" }}>Merci, c&apos;est noté</div>
        <p style={{ color: C.textSubtle, fontSize: "12.5px", textAlign: "center", marginTop: "6px" }}>Votre retour nous aide à améliorer Yelen.</p>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
        <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <button onClick={onStay} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Un instant</div>
          <div/>
        </div>
      </header>

      <div style={{ padding: "28px 16px", maxWidth: "440px", margin: "0 auto" }}>
        <h2 style={{ color: C.text, fontSize: "19px", fontWeight: "900", margin: "0 0 8px", letterSpacing: "-0.3px" }}>Vous partez déjà ?</h2>
        <p style={{ color: C.textSubtle, fontSize: "13px", lineHeight: 1.6, margin: "0 0 24px" }}>
          Rien ne presse et vous êtes libre à tout moment. Si {institutionName} ne correspondait pas à ce que vous cherchiez, un mot nous suffit pour comprendre — ça nous sert à améliorer Yelen.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: raison === "Autre raison" ? "10px" : "20px" }}>
          {RAISONS_ABANDON.map(r => (
            <button key={r} onClick={() => setRaison(r)} disabled={phase === "sending"} className="tap" style={{ textAlign: "left", padding: "13px 14px", borderRadius: "12px", border: raison === r ? "2px solid #F5A623" : `1.5px solid ${inputBord}`, background: raison === r ? "rgba(245,166,35,0.1)" : "transparent", color: raison === r ? "#F5A623" : C.text, fontSize: "13px", fontWeight: "700", cursor: phase === "sending" ? "default" : "pointer" }}>
              {r}
            </button>
          ))}
        </div>
        {raison === "Autre raison" && (
          <textarea value={commentaire} onChange={e => setCommentaire(e.target.value.slice(0, 300))} placeholder="En quelques mots, si vous voulez bien" rows={2} disabled={phase === "sending"}
            style={{ width: "100%", padding: "11px 13px", borderRadius: "10px", border: `1px solid ${inputBord}`, background: inputBg, color: C.text, fontSize: "13px", marginBottom: "20px", resize: "none" }}/>
        )}

        <button onClick={onStay} disabled={phase === "sending"} className="tap" style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: phase === "sending" ? "default" : "pointer", marginBottom: "8px" }}>
          Reprendre ma réservation
        </button>
        <button onClick={handleLeave} disabled={phase === "sending"} className="tap" style={{ width: "100%", background: "none", border: "none", color: raison ? C.text : C.textSubtle, fontSize: "12.5px", fontWeight: "700", padding: "8px", cursor: phase === "sending" ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
          {phase === "sending"
            ? <><div style={{ width: "13px", height: "13px", border: `2px solid ${isDark ? "rgba(245,166,35,0.2)" : "rgba(245,166,35,0.25)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>Envoi…</>
            : raison ? "Envoyer et quitter" : "Quitter sans répondre"}
        </button>
      </div>
    </div>
  );
}

// ─── Carte Service unifiée (gratuit ou payant) ────────────────────────
function ServiceCard({ service, selected, onSelect, isDark, C, premium = false }: {
  service: WizardService; selected: boolean; onSelect: () => void; isDark: boolean; C: ThemeC; premium?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Le doré reste réservé à l'état sélectionné et au CTA "Choisir ce
  // service" (action qui mérite attention) — même logique que la refonte
  // Accueil (retour CEO 23/07/2026, app/page.tsx) : le reste de la carte
  // (icône, prix, détails) redevient neutre pour ne pas noyer l'écran sous
  // une "flotte" de doré quand plusieurs services sont listés.
  const accent = "#F5A623";
  const neutralIconBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const neutralIconBrd = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const statusColor = service.payant ? "#F5A623" : (isDark ? "#00C896" : "#00875A");
  return (
    <div style={{ borderRadius: "18px", border: selected ? `2px solid ${accent}` : `1.5px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`, background: selected ? `${accent}0d` : C.cardBg, overflow: "hidden", boxShadow: selected ? `0 0 0 3px ${accent}1a, 0 3px 12px ${accent}18` : isDark ? "0 1px 6px rgba(0,0,0,0.15)" : "0 1px 6px rgba(0,0,0,0.04)", transition: "all 0.2s" }}>
      {premium && <div style={{ height: "3px", background: accent }}/>}
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "13px", background: neutralIconBg, border: `1.5px solid ${neutralIconBrd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {service.payant
              ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <span style={{ color: C.text, fontSize: "15px", fontWeight: "800", letterSpacing: "-0.3px" }}>{service.nom}</span>
              <span style={{ background: `${statusColor}18`, color: statusColor, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase" }}>{service.payant ? "Payant" : "Gratuit"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {service.payant && <span style={{ color: C.text, fontSize: "16px", fontWeight: "900" }}>{formatPrix(service.prix)}</span>}
              {service.duree_minutes > 0 && (
                <>
                  {service.payant && <span style={{ color: C.textSubtle, fontSize: "11px" }}>·</span>}
                  <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600" }}>{service.duree_minutes} min</span>
                </>
              )}
            </div>
          </div>
          <div onClick={onSelect} className="tap" style={{ width: "26px", height: "26px", borderRadius: "50%", border: selected ? `2px solid ${accent}` : `2px solid ${isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`, background: selected ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {selected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
        </div>
        {service.description && (
          <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: C.textSubtle, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "8px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.5" strokeLinecap="round">{expanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}</svg>
            {expanded ? "Masquer les détails" : "Voir les détails"}
          </button>
        )}
        {expanded && service.description && (
          <div style={{ marginTop: "8px", padding: "12px 14px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: "12px", border: `1px solid ${C.borderCard}`, animation: "fadeUp 0.2s ease" }}>
            <p style={{ color: C.textMuted, fontSize: "12px", lineHeight: 1.7, margin: 0 }}>{service.description}</p>
          </div>
        )}
        {!selected && (
          <button onClick={onSelect} className="tap" style={{ width: "100%", marginTop: "12px", padding: "12px", borderRadius: "12px", border: `1.5px solid ${neutralIconBrd}`, background: "transparent", color: C.text, fontWeight: "800", fontSize: "13px", cursor: "pointer" }}>
            Choisir ce service
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Écran succès (unifié gratuit/payant) ─────────────────────────────
function SuccessScreen({ inst, service, code, dateRdv, heureRdv, C, isDark }: {
  inst: InstitutionRow; service: WizardService; code: string; dateRdv: string; heureRdv: string; C: ThemeC; isDark: boolean;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    // Correction d'erreur "H" (~30%) — nécessaire pour superposer le logo
    // Yelen au centre sans rendre le QR illisible (retour Bryan 25/07/2026).
    QRCode.toDataURL(code, { width: 168, margin: 1, errorCorrectionLevel: "H", color: { dark: "#080812", light: "#FFFFFF" } })
      .then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [code]);

  function handleCalendar() {
    const ics = buildIcs({
      title: `${service.nom} — ${inst.name}`,
      description: `Réservation Yelen224 — Code ${code}`,
      location: `${inst.adresse || inst.ville}`,
      dateRdv, heureRdv, durationMinutes: service.duree_minutes || 30,
    });
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "rendez-vous-yelen224.ics"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    const text = `Mon RDV chez ${inst.name} — ${service.nom} — ${formatDateLabel(dateRdv, heureRdv, service.duree_minutes)} — Code Yelen ${code}`;
    if (navigator.share) { try { await navigator.share({ title: "Mon rendez-vous Yelen224", text }); } catch {} }
    else { try { await navigator.clipboard.writeText(text); } catch {} }
  }

  // Repères "Prochaines étapes" — ce que le citoyen sait déjà être vrai
  // (rappels automatiques réellement envoyés, lib/notificationEngine.ts,
  // vérifié en prod le 20/07/2026 selon CLAUDE.md) plutôt qu'une promesse
  // vague. Téléphone affiché seulement s'il existe réellement.
  const prochainesEtapes = [
    { icon: "pin" as const, texte: `Présentez ce code ou QR à votre arrivée chez ${inst.name}.` },
    { icon: "bell" as const, texte: "Des rappels automatiques vous seront envoyés avant le rendez-vous." },
    ...(inst.phone ? [{ icon: "phone" as const, texte: `Besoin de contacter l'établissement ? ${inst.phone}` }] : []),
  ];
  const etapeIcons: Record<"pin" | "bell" | "phone", ReactNode> = {
    pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    bell: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  };

  return (
    <div style={{ minHeight: "100svh", background: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ background: C.cardBg, borderRadius: "24px", border: `1px solid ${C.borderCard}`, overflow: "hidden", boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.25)" : "0 4px 16px rgba(0,0,0,0.06)" }}>
          <div style={{ padding: "24px 22px" }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ color: "#22c55e", fontSize: "11px", fontWeight: "800", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "12px" }}>Rendez-vous confirmé</div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>
                <InstitutionLogo inst={inst} size={44}/>
              </div>
              <h2 style={{ color: C.text, fontSize: "19px", fontWeight: "900", margin: "0 0 4px" }}>{service.nom}</h2>
              <div style={{ color: C.textSubtle, fontSize: "12px" }}>{inst.name} · {inst.ville}</div>
            </div>

            {qrDataUrl && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                {/* Logo Yelen réel (public/icon-192.png, même asset que le
                    manifest PWA) superposé au centre — la correction d'erreur
                    "H" (30%) du QR tolère cette zone masquée sans nuire au
                    scan (retour Bryan 25/07/2026). */}
                <div style={{ position: "relative", width: "150px", height: "150px" }}>
                  {/* IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode), non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code" style={{ width: "150px", height: "150px", borderRadius: "14px", border: `1.5px solid ${C.borderCard}` }}/>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "38px", height: "38px", borderRadius: "10px", background: "#fff", padding: "4px", boxShadow: "0 0 0 3px #fff" }}>
                    <NextImage src="/icon-192.png" alt="" fill sizes="38px" style={{ objectFit: "contain", borderRadius: "6px" }}/>
                  </div>
                </div>
              </div>
            )}
            {/* Doré conservé uniquement ici — le code que le citoyen doit
                effectivement présenter, la seule information de cet écran
                qui mérite vraiment l'attention (retour Bryan 25/07/2026 :
                même principe que le reste du chantier). */}
            <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", border: "1.5px solid rgba(245,166,35,0.3)", borderRadius: "16px", padding: "14px", marginBottom: "16px", textAlign: "center" }}>
              <div style={{ color: C.textSubtle, fontSize: "9px", fontWeight: "700", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "6px" }}>Code de confirmation Yelen</div>
              <div style={{ color: "#F5A623", fontSize: "22px", fontWeight: "900", fontFamily: "monospace", letterSpacing: "3px" }}>{code}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
              {[
                { label: "Date & heure", value: formatDateLabel(dateRdv, heureRdv, service.duree_minutes) },
                { label: "Prix", value: service.payant ? `${formatPrix(service.prix)} (sur place)` : "Gratuit" },
                { label: "Durée prévue", value: service.duree_minutes > 0 ? `${service.duree_minutes} minutes` : "—" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "9px 12px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "10px" }}>
                  <span style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "600" }}>{row.label}</span>
                  <span style={{ color: C.text, fontSize: "12px", fontWeight: "700" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Prochaines étapes — absent jusqu'ici, l'écran ne répondait pas
                à "qu'est-ce qui se passe maintenant ?" (retour Bryan
                25/07/2026, niveau Uber/Airbnb "What's next"). */}
            <div style={{ border: `1px solid ${C.borderSubtle}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "18px" }}>
              <div style={{ color: C.text, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Prochaines étapes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                {prochainesEtapes.map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ flexShrink: 0, marginTop: "1px" }}>{etapeIcons[e.icon]}</span>
                    <p style={{ color: C.textSubtle, fontSize: "11.5px", lineHeight: 1.6, margin: 0 }}>{e.texte}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
              <button onClick={handleCalendar} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.text, fontWeight: "700", fontSize: "12.5px", padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Calendrier
              </button>
              <button onClick={handleShare} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.text, fontWeight: "700", fontSize: "12.5px", padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>
                Partager
              </button>
            </div>
            <p style={{ color: C.textSubtle, fontSize: "11.5px", textAlign: "center", margin: "0 0 10px" }}>
              Retrouvez ce QR et ce code à tout moment dans <strong style={{ color: C.text }}>Mon QR</strong>.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <Link href="/mon-qr" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px", textDecoration: "none" }}>
                Mon QR
              </Link>
              <Link href="/mes-rdv" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.text, fontWeight: "700", fontSize: "14px", padding: "15px", borderRadius: "14px", textDecoration: "none" }}>
                Mes RDV
              </Link>
            </div>
          </div>
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

  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [institution, setInstitution] = useState<InstitutionRow | null>(null);
  const [paidServicesRaw, setPaidServicesRaw] = useState<PaidServiceRow[]>([]);
  const [availability, setAvailability] = useState<Availability>({ capacite: 1, counts: {} });

  const [step, setStep]                     = useState<StepId>("service");
  const [selectedService, setSelectedService] = useState<WizardService | null>(null);
  const [calendarMonth, setCalendarMonth]   = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [selectedDate, setSelectedDate]     = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot]     = useState<CreneauSlot | null>(null);
  const [forOther, setForOther]             = useState(false);
  const [otherName, setOtherName]           = useState("");
  const [otherPhone, setOtherPhone]         = useState("");
  const [champsReponses, setChampsReponses] = useState<Record<string, string>>({});
  const [descriptionBesoin, setDescriptionBesoin] = useState("");
  // Repliée par défaut (pattern "Booking overview" repéré par Bryan
  // 25/07/2026) — un champ texte ouvert en permanence sur un récap déjà
  // long, alors que la plupart des citoyens n'ont rien à ajouter.
  const [demandeSpecialeOpen, setDemandeSpecialeOpen] = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [submitError, setSubmitError]       = useState<string | null>(null);
  const [success, setSuccess]               = useState<{ code: string; dateRdv: string; heureRdv: string } | null>(null);
  // Feedback d'abandon (retour Bryan 25/07/2026) — le X du header ouvre ce
  // pop-up plutôt que de quitter directement, pour comprendre pourquoi un
  // citoyen décroche du flux de réservation avant d'aller au bout.
  const [exitModalOpen, setExitModalOpen]   = useState(false);

  // Indicateur de position de scroll — même composant que app/page.tsx et
  // app/institution/[id]/page.tsx, étendu au wizard de réservation jusqu'au
  // récapitulatif (retour Bryan 25/07/2026).
  const [scrollPct, setScrollPct]         = useState(0);
  const [scrollThumbH, setScrollThumbH]   = useState(0);
  const [scrollBarShown, setScrollBarShown] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onScrollPct = () => {
      const viewport = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const max = total - viewport;
      setScrollPct(max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0);
      setScrollThumbH(total > 0 ? Math.min(Math.max(viewport / total, 0.08), 1) : 1);
      setScrollBarShown(true);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
      scrollHideTimer.current = setTimeout(() => setScrollBarShown(false), 900);
    };
    onScrollPct();
    window.addEventListener("scroll", onScrollPct, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScrollPct);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    };
  }, [step]);

  useEffect(() => {
    let userId: string | null = null;
    if (typeof window !== "undefined") {
      try { userId = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    }
    if (!userId?.trim()) {
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.replace(`/inscription?redirect=${returnUrl}`);
    }
  }, [router]);

  const load = useCallback(async (institutionId: string) => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("institutions")
      .select("id,name,ville,quartier,adresse,phone,category,badge_verifie,logo,description,moyenne_avis,nb_avis,disponibilites,services,capacite_par_creneau,activite_categorie_id")
      .eq("id", institutionId)
      .maybeSingle();
    if (error) { setLoadError(error.message); return; }
    if (!data)  { notFound(); return; }
    const row = data as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    if (!name) { setLoadError("Établissement invalide."); return; }

    // Résolution activite_categorie_id → code, requête séparée jamais un
    // embed PostgREST (piège documenté, CLAUDE.md /pieges-techniques-connus).
    let activiteCategorieCode: string | null = null;
    if (row.activite_categorie_id) {
      const { data: catRow } = await supabase.from("activite_categories").select("code").eq("id", row.activite_categorie_id as string).maybeSingle();
      activiteCategorieCode = catRow?.code ?? null;
    }

    setInstitution({
      id: String(row.id), name, ville: String(row.ville ?? "").trim(), quartier: String(row.quartier ?? "").trim(),
      adresse: String(row.adresse ?? "").trim(), phone: String(row.phone ?? "").trim(), category: String(row.category ?? "Autre").trim(),
      activiteCategorieCode,
      badge_verifie: Boolean(row.badge_verifie), logo: row.logo ? String(row.logo) : null,
      description: row.description ? String(row.description) : null,
      moyenne_avis: Number(row.moyenne_avis ?? 0), nb_avis: Number(row.nb_avis ?? 0),
      disponibilites: row.disponibilites, services: row.services,
      capacite_par_creneau: Number(row.capacite_par_creneau ?? 1),
    });

    // Repli automatique si la colonne taux_taxe n'existe pas encore en base
    // (migration 20260722000001_module_financier.sql pas encore exécutée) —
    // avant, une seule colonne manquante faisait échouer toute la requête et
    // vidait silencieusement les services payants du wizard (retour Bryan
    // 25/07/2026 : "les services payants ont disparu").
    let services: PaidServiceRow[] | null = null;
    const first = await supabase
      .from("paid_services")
      .select("id, nom, prix, duree_minutes, description, champs_complementaires, is_active, taux_taxe")
      .eq("institution_id", institutionId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (!first.error) {
      services = first.data;
    } else {
      console.error("[Yelen] paid_services fetch error (avec taux_taxe):", first.error.message);
      const fallback = await supabase
        .from("paid_services")
        .select("id, nom, prix, duree_minutes, description, champs_complementaires, is_active")
        .eq("institution_id", institutionId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (fallback.error) console.error("[Yelen] paid_services fetch error (repli):", fallback.error.message);
      services = fallback.data?.map(s => ({ ...s, taux_taxe: null })) ?? null;
    }
    setPaidServicesRaw(services ?? []);

    const from = toISODate(new Date());
    const toDate = new Date(); toDate.setDate(toDate.getDate() + 27);
    const to = toISODate(toDate);
    const res = await fetch(`/api/rdv-disponibilite?institution_id=${institutionId}&date_from=${from}&date_to=${to}`);
    const j = res.ok ? await res.json().catch(() => null) : null;
    setAvailability(j ? { capacite: j.capacite ?? 1, counts: j.counts ?? {} } : { capacite: 1, counts: {} });
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => { setLoading(true); await load(id); setLoading(false); })();
  }, [id, load]);

  const generalServices: WizardService[] = useMemo(() => {
    const raw = Array.isArray(institution?.services) ? institution!.services : [];
    return raw.map((s: unknown): WizardService | null => {
      const nom = typeof s === "string" ? s.trim() : String((s as Record<string, unknown>)?.nom ?? "").trim();
      if (!nom) return null;
      const o = typeof s === "object" && s ? (s as Record<string, unknown>) : {};
      return {
        id: `offre-${nom}`, nom,
        description: typeof o.description === "string" ? o.description : "",
        duree_minutes: typeof o.duree_minutes === "number" ? o.duree_minutes : 0,
        payant: false, prix: 0,
        champs_complementaires: Array.isArray(o.champs_complementaires) ? (o.champs_complementaires as ChampComplementaire[]) : [],
      };
    }).filter((s): s is WizardService => s !== null);
  }, [institution]);

  const paidWizardServices: WizardService[] = useMemo(() => {
    return paidServicesRaw.map(s => ({
      id: s.id, nom: s.nom, description: s.description ?? "", duree_minutes: s.duree_minutes,
      payant: true, prix: s.prix, champs_complementaires: s.champs_complementaires ?? [], serviceIdForBooking: s.id,
      tauxTaxe: s.taux_taxe ?? 0,
    }));
  }, [paidServicesRaw]);

  const allServices  = useMemo(() => [...generalServices, ...paidWizardServices], [generalServices, paidWizardServices]);
  const hasPremium   = paidWizardServices.length > 0;

  const allSlots = useMemo(() => institution ? generateSlotsInRange(institution.disponibilites, 28) : [], [institution]);
  const slotsByDate = useMemo(() => {
    const m = new Map<string, CreneauSlot[]>();
    for (const s of allSlots) { if (!m.has(s.dateRdv)) m.set(s.dateRdv, []); m.get(s.dateRdv)!.push(s); }
    return m;
  }, [allSlots]);

  function remainingFor(dateRdv: string, heureRdv: string): number {
    const used = availability.counts[`${dateRdv}|${heureRdv}`] ?? 0;
    return availability.capacite - used;
  }
  function dayStatus(dateRdv: string): "none" | "available" | "complet" {
    const slots = slotsByDate.get(dateRdv);
    if (!slots || slots.length === 0) return "none";
    return slots.some(s => remainingFor(s.dateRdv, s.heureRdv) > 0) ? "available" : "complet";
  }

  const steps: StepId[] = useMemo(() => [
    "service", "date", "heure", "recap",
    ...(selectedService && selectedService.champs_complementaires.length > 0 ? ["champs" as StepId] : []),
  ], [selectedService]);
  const stepIndex = steps.indexOf(step);

  function goToService(s: WizardService) {
    setSelectedService(s); setSelectedDate(null); setSelectedSlot(null);
    setStep("date");
  }

  // Best-effort : un échec d'enregistrement du feedback ne doit jamais
  // empêcher le citoyen de quitter (même logique que les notifications
  // best-effort ailleurs dans le produit, voir lib/notificationEngine.ts).
  // Séparé de la navigation pour laisser le pop-up afficher son écran de
  // remerciement avant de rediriger (retour Bryan 25/07/2026).
  async function handleExitSubmitFeedback(raison: string, commentaire: string) {
    let citoyenId: string | null = null;
    try { citoyenId = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    try {
      await supabase.from("rdv_abandon_feedback").insert({
        citoyen_id: citoyenId, institution_id: id || null, etape: step, raison, commentaire: commentaire.trim() || null,
      });
    } catch {}
  }

  function handleExitLeaveNow() {
    router.push(id ? `/institution/${id}` : "/recherche");
  }

  function goToRecapOrConfirm() {
    if (selectedService && selectedService.champs_complementaires.length > 0) setStep("champs");
    else void handleConfirm();
  }

  async function handleConfirm() {
    if (!id || !institution || !selectedService || !selectedSlot) return;
    setSubmitError(null);
    if (forOther && (!otherName.trim() || !otherPhone.trim())) { setSubmitError("Renseignez le nom et le téléphone."); return; }
    for (const c of selectedService.champs_complementaires) {
      if (c.requis && !(champsReponses[c.label] ?? "").trim()) { setSubmitError(`Le champ "${c.label}" est requis.`); return; }
    }
    let userId: string | null = null;
    if (typeof window !== "undefined") {
      try { userId = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    }
    if (!userId?.trim()) { setSubmitError("Vous devez être connecté."); return; }

    setSubmitting(true);
    try {
      const code = genCode();
      const reponses = selectedService.champs_complementaires.length > 0 ? champsReponses : null;
      const objet = `[${selectedService.nom}]${selectedService.payant ? ` ${formatPrix(selectedService.prix)} sur place` : ""}${forOther ? ` — Pour ${otherName.trim()} (${otherPhone.trim()})` : ""}`;
      const dureeMinutes = selectedService.duree_minutes > 0 ? selectedService.duree_minutes : null;
      const besoin = descriptionBesoin.trim() || null;
      // Preuve de valeur du QR "Mon code QR" (retour Bryan 25/07/2026) —
      // posé par la fiche institution quand ?source=qr est détecté. Lu ici,
      // jamais requis : une session sans ce flag réserve normalement.
      let provenance: string | null = null;
      try { provenance = sessionStorage.getItem("yelen224_provenance"); } catch {}

      if (selectedService.payant) {
        const { error: bkErr } = await supabase.from("paid_bookings").insert({
          service_id: selectedService.serviceIdForBooking, citoyen_id: userId.trim(), institution_id: id,
          date_rdv: selectedSlot.dateRdv, heure_rdv: selectedSlot.heureRdv || "00:00",
          confirmation_code: code, statut: "en_attente", champs_complementaires_reponses: reponses, provenance,
        });
        // Message humanisé — avant, le texte brut de l'erreur Postgres
        // (nom de contrainte, colonne...) remontait directement au citoyen
        // (retour Bryan 25/07/2026). Le détail reste en console pour le
        // diagnostic, jamais affiché à l'écran.
        if (bkErr) { console.error("[rdv] paid_bookings insert:", bkErr.message); setSubmitError("Une erreur est survenue pendant la réservation. Réessayez dans un instant."); return; }
        const { data: rdvInserted, error: rdvErr } = await supabase.from("rdv").insert({
          citoyen_id: userId.trim(), institution_id: id, date_rdv: selectedSlot.dateRdv, heure_rdv: selectedSlot.heureRdv || "00:00",
          // statut "nouveau" (pas "en_attente") — même valeur initiale que le
          // flux gratuit (app/rdv/[id]/actions.ts::createRdv), corrige une
          // incohérence signalée par Bryan le 05/08/2026 : le jumeau rdv d'une
          // réservation payante sautait l'étape "nouveau" (accepter/refuser
          // côté institution) que suit tout rdv gratuit. paid_bookings.statut
          // reste "en_attente" (son propre enum statut_paid_booking n'a pas de
          // valeur "nouveau" — c'est ce que lit l'écran de validation).
          objet, statut: "nouveau", pour_autre: forOther, nom_autre: forOther ? otherName.trim() : null,
          phone_autre: forOther ? otherPhone.trim() : null, qr_token: code, champs_complementaires_reponses: reponses,
          duree_minutes: dureeMinutes, description_besoin: besoin, provenance,
        }).select("id").single();
        if (rdvErr) { console.error("[rdv] rdv insert (payant):", rdvErr.message); setSubmitError("Une erreur est survenue pendant la réservation. Réessayez dans un instant."); return; }
        // Chantier "Yelen Assistant" (20/07/2026), Phase 1 — non-bloquant :
        // une erreur ici ne doit jamais faire échouer la réservation.
        if (rdvInserted?.id) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) await notifierReservationPayante({ rdvId: rdvInserted.id, accessToken: session.access_token });
          } catch (e) { console.error("[rdv] notification réservation payante:", e); }
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setSubmitError("Session expirée, reconnectez-vous."); return; }
        const result = await createRdv({
          citoyenId: userId.trim(), institutionId: id, dateRdv: selectedSlot.dateRdv, heureRdv: selectedSlot.heureRdv || "00:00",
          objet, pourAutre: forOther, nomAutre: forOther ? otherName.trim() : null, phoneAutre: forOther ? otherPhone.trim() : null,
          qrToken: code, champsComplementairesReponses: reponses, dureeMinutes, descriptionBesoin: besoin, provenance, accessToken: session.access_token,
        });
        if (!result.ok) { setSubmitError(result.error); return; }
      }
      try { sessionStorage.removeItem("yelen224_provenance"); } catch {}
      setSuccess({ code, dateRdv: selectedSlot.dateRdv, heureRdv: selectedSlot.heureRdv });
    } finally { setSubmitting(false); }
  }

  if (loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <YelenLoader size={44} label="Chargement…" labelColor={C.textSubtle}/>
    </div>
  );

  if (loadError || !institution) return (
    <EcranContenuIntrouvable
      pageBg={C.pageBg} text={C.text} textSubtle={C.textSubtle} border={C.border} isDark={isDark}
      eyebrow="RENDEZ-VOUS INTROUVABLE"
      title="Cette réservation n'existe pas"
      message={loadError || "Elle a peut-être été supprimée ou l'adresse saisie est incorrecte."}
      primaryHref="/recherche" primaryLabel="Retour à la recherche"
      secondaryHref="/" secondaryLabel="Retour à l'accueil"
    />
  );

  if (success) return <SuccessScreen inst={institution} service={selectedService!} code={success.code} dateRdv={success.dateRdv} heureRdv={success.heureRdv} C={C} isDark={isDark}/>;

  const CSS = `
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    /* overflow-x sur html/body retiré (23/07/2026, voir globals.css) —
       casse position:fixed pour tous ses descendants sur WebKit/iOS (X du
       header, pop-up plein écran, barre CTA fixe, barre de scroll
       verticale...). Protection horizontale déplacée sur le wrapper racine
       (overflowX:"hidden" ci-dessous), pattern déjà utilisé par app/page.tsx. */
    html,body{background:${C.pageBg}}
    ::-webkit-scrollbar{display:none} *{scrollbar-width:none}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes barUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
    @keyframes ping{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0;transform:scale(2.2)}}
    .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
    .tap:active{opacity:0.65;transform:scale(0.97)}
    textarea,input,select{font-family:inherit}
    input:focus,textarea:focus{outline:none}
  `;

  const backButton = (target: StepId) => (
    <button onClick={() => setStep(target)} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.textSubtle, fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: "0 0 16px" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
  );

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, color: C.text, paddingBottom: "40px", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* HEADER — neutre (même principe que app/page.tsx, 23/07/2026) : le
          doré reste réservé aux actions/états qui méritent attention
          (barre de progression), plus de bandeau doré plein sur tout
          l'écran. */}
      {(() => {
        const hBg    = isDark ? "rgba(8,8,15,0.98)" : C.cardBg;
        const hBrd   = `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.borderCard}`;
        const hText  = C.text;
        const hSub   = C.textSubtle;
        const trackBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
        const fillBg  = "#F5A623";
        return (
        <div style={{ position: "sticky", top: 0, zIndex: 200, background: hBg, backdropFilter: isDark ? "blur(24px)" : "none", borderBottom: hBrd, paddingTop: "env(safe-area-inset-top)" }}>
          <div style={{ height: "3px", background: trackBg }}>
            <div style={{ height: "100%", width: `${((stepIndex + 1) / steps.length) * 100}%`, background: fillBg, transition: "width 0.4s ease" }}/>
          </div>
          <div style={{ padding: "10px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <InstitutionLogo inst={institution} size={30}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: hText, fontSize: "12px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}>{institution.name}</div>
                <div style={{ color: hSub, fontSize: "9px", fontWeight: "700" }}>Étape {stepIndex + 1} / {steps.length}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {institution.nb_avis > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="#F5A623" stroke="#F5A623" strokeWidth="1"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/></svg>
                  <span style={{ color: hText, fontSize: "11px", fontWeight: "800" }}>{institution.moyenne_avis.toFixed(1)}</span>
                </div>
              )}
              <button onClick={() => setExitModalOpen(true)} className="tap" aria-label="Quitter la réservation" style={{ background: "none", border: "none", padding: "4px", margin: "-4px", cursor: "pointer", display: "flex", color: hSub }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      <div style={{ padding: "20px 16px 0" }}>

        {/* ═══ ÉTAPE 1 — Choisir un service ═══ */}
        {step === "service" && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            <h1 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Que souhaitez-vous faire aujourd&apos;hui ?</h1>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 10px" }}>Sélectionnez le service correspondant à votre besoin.</p>

            {/* Badge vérifié — la note est désormais affichée dans le
                bandeau (même ligne que le X de fermeture, retour Bryan
                25/07/2026). Affiché seulement si réellement accordé. */}
            {institution.badge_verifie && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "18px" }}>
                <MetaVerifiedBadge size={14}/>
                <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "700" }}>Établissement vérifié</span>
              </div>
            )}

            <div style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>Services de l&apos;établissement</div>
            {allServices.length === 0 ? (
              <div style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px dashed ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`, borderRadius: "20px", padding: "28px 20px", textAlign: "center" }}>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Aucun service configuré.</div>
                <div style={{ color: C.textSubtle, fontSize: "12.5px", marginBottom: "16px" }}>Cet établissement ne propose actuellement aucun rendez-vous.</div>
                <Link href={`/institution/${institution.id}`} style={{ display: "inline-block", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "13px", padding: "10px 20px", borderRadius: "12px", textDecoration: "none" }}>Retour</Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: hasPremium ? "28px" : 0 }}>
                {allServices.map(s => <ServiceCard key={s.id} service={s} selected={selectedService?.id === s.id} onSelect={() => goToService(s)} isDark={isDark} C={C}/>)}
              </div>
            )}

            {hasPremium && (
              <>
                <h2 style={{ color: C.text, fontSize: "16px", fontWeight: "900", margin: "0 0 4px" }}>Services premium</h2>
                <p style={{ color: C.textSubtle, fontSize: "12.5px", margin: "0 0 14px" }}>Ces services nécessitent un paiement sur place ou selon les modalités définies par l&apos;établissement.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {paidWizardServices.map(s => <ServiceCard key={`premium-${s.id}`} service={s} selected={selectedService?.id === s.id} onSelect={() => goToService(s)} isDark={isDark} C={C} premium/>)}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ ÉTAPE 2 — Choisir une date ═══ */}
        {step === "date" && selectedService && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {backButton("service")}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>Choisir une date</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Sélectionnez le jour qui vous convient pour <strong style={{ color: C.text }}>{selectedService.nom}</strong>.</p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <button onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })} className="tap" style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, cursor: "pointer" }}>‹</button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", textTransform: "capitalize" }}>{MOIS_FR[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</div>
              <button onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })} className="tap" style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, cursor: "pointer" }}>›</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", marginBottom: "6px" }}>
              {JOURS_FR.map((j, i) => <div key={i} style={{ textAlign: "center", color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase" }}>{j}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px" }}>
              {(() => {
                const first = new Date(calendarMonth);
                const startOffset = first.getDay();
                const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
                const cells: (Date | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
                const today = new Date(); today.setHours(0, 0, 0, 0);
                return cells.map((d, i) => {
                  if (!d) return <div key={i}/>;
                  const iso = toISODate(d);
                  const isPast = d < today;
                  const st = isPast ? "none" : dayStatus(iso);
                  const disabled = isPast || st === "none" || st === "complet";
                  const sel = selectedDate === iso;
                  return (
                    <button key={i} disabled={disabled} onClick={() => { setSelectedDate(iso); setSelectedSlot(null); setStep("heure"); }} className={disabled ? "" : "tap"}
                      style={{ aspectRatio: "1", borderRadius: "10px", border: sel ? "2px solid #F5A623" : `1px solid ${C.borderCard}`, background: sel ? "rgba(245,166,35,0.15)" : disabled ? "transparent" : C.cardBg, color: disabled ? C.textSubtle : sel ? "#F5A623" : C.text, fontSize: "12px", fontWeight: sel ? "800" : "600", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1, position: "relative" }}>
                      {d.getDate()}
                      {st === "available" && !isPast && <div style={{ position: "absolute", bottom: "4px", left: "50%", transform: "translateX(-50%)", width: "4px", height: "4px", borderRadius: "50%", background: sel ? "#F5A623" : "#00C896" }}/>}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 3 — Choisir un horaire ═══ */}
        {step === "heure" && selectedService && selectedDate && (() => {
          const slots = slotsByDate.get(selectedDate) ?? [];
          const groupes = [
            { label: "Matin", slots: slots.filter(s => Number(s.heureRdv.slice(0, 2)) < 12) },
            { label: "Après-midi", slots: slots.filter(s => Number(s.heureRdv.slice(0, 2)) >= 12 && Number(s.heureRdv.slice(0, 2)) < 18) },
            { label: "Soir", slots: slots.filter(s => Number(s.heureRdv.slice(0, 2)) >= 18) },
          ].filter(g => g.slots.length > 0);

          return (
          <div style={{ animation: "fadeUp 0.25s ease", paddingBottom: selectedSlot ? "88px" : 0 }}>
            {backButton("date")}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>Choisir un horaire</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 24px", textTransform: "capitalize" }}>{new Date(selectedDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>

            {groupes.map(g => (
              <div key={g.label} style={{ marginBottom: "22px" }}>
                <div style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>{g.label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {g.slots.map(slot => {
                    const remaining = remainingFor(slot.dateRdv, slot.heureRdv);
                    const complet = remaining <= 0;
                    const sel = selectedSlot?.key === slot.key;
                    // Plus de "Disponible" en vert par défaut (retour Bryan
                    // 25/07/2026) — le libellé n'apparaît que pour un état
                    // qui mérite vraiment attention (dernières places,
                    // complet), sinon la carte reste neutre.
                    const label = complet ? "Complet" : remaining === 1 ? "Dernières places" : null;
                    const labelColor = complet ? C.textSubtle : "#F5A623";
                    // Plage horaire réelle (retour Bryan 25/07/2026) — la
                    // durée est configurable côté institution pour tout
                    // service, gratuit comme payant (WizardService.duree_minutes).
                    const heureAffichee = selectedService.duree_minutes > 0 ? `${slot.heureRdv} - ${addMinutes(slot.heureRdv, selectedService.duree_minutes)}` : slot.heureRdv;
                    return (
                      <button key={slot.key} disabled={complet} onClick={() => setSelectedSlot(slot)} className={complet ? "" : "tap"}
                        style={{ padding: "13px 12px", borderRadius: "14px", border: sel ? "2px solid #F5A623" : `1px solid ${C.borderCard}`, background: sel ? "rgba(245,166,35,0.1)" : complet ? "transparent" : C.cardBg, cursor: complet ? "default" : "pointer", textAlign: "left", opacity: complet ? 0.4 : 1 }}>
                        <div style={{ color: sel ? "#F5A623" : C.text, fontSize: "14px", fontWeight: "800", marginBottom: label ? "2px" : 0, whiteSpace: "nowrap" }}>{heureAffichee}</div>
                        {label && <div style={{ color: labelColor, fontSize: "10px", fontWeight: "700" }}>{label}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {selectedSlot && (
              <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 300, padding: "14px 16px calc(14px + env(safe-area-inset-bottom))", background: isDark ? "rgba(8,8,15,0.98)" : "rgba(255,255,255,0.98)", backdropFilter: "blur(20px)", borderTop: `1px solid ${C.borderCard}`, animation: "barUp 0.25s ease" }}>
                <div>
                  <button onClick={() => setStep("recap")} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontSize: "15px", fontWeight: "800", cursor: "pointer" }}>
                    Continuer avec {selectedService.duree_minutes > 0 ? `${selectedSlot.heureRdv} - ${addMinutes(selectedSlot.heureRdv, selectedService.duree_minutes)}` : selectedSlot.heureRdv} →
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* ═══ ÉTAPE 4 — Récapitulatif ═══ */}
        {step === "recap" && selectedService && selectedSlot && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {backButton("heure")}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>Récapitulatif</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Vérifiez avant de confirmer.</p>

            <div style={{ background: C.cardBg, borderRadius: "20px", overflow: "hidden", marginBottom: "16px" }}>
              <div style={{ padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "16px", borderBottom: `1px solid ${C.borderSubtle}`, marginBottom: "16px" }}>
                  <InstitutionLogo inst={institution} size={44}/>
                  <div><div style={{ color: C.text, fontSize: "15px", fontWeight: "800" }}>{institution.name}</div><div style={{ color: C.textSubtle, fontSize: "12px" }}>{institution.adresse || institution.ville}</div></div>
                </div>

                {/* Chaque ligne a désormais son propre "Modifier" — avant,
                    seule la flèche retour en haut permettait de corriger un
                    choix, étape par étape (retour Bryan 25/07/2026). */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "12px", marginBottom: "12px", borderBottom: `1px solid ${C.borderSubtle}` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20.59 13.41 13 21l-8-8V5a2 2 0 0 1 2-2h6l8 8a2 2 0 0 1 0 2.83z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "600" }}>Service</div>
                    <div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>{selectedService.nom}</div>
                  </div>
                  <button onClick={() => setStep("service")} className="tap" style={{ background: "none", border: "none", color: C.textSubtle, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "4px", flexShrink: 0 }}>Modifier</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "600" }}>Date &amp; heure</div>
                    <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", textTransform: "capitalize" }}>{formatDateLabel(selectedSlot.dateRdv, selectedSlot.heureRdv, selectedService.duree_minutes)}</div>
                  </div>
                  <button onClick={() => setStep("date")} className="tap" style={{ background: "none", border: "none", color: C.textSubtle, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "4px", flexShrink: 0 }}>Modifier</button>
                </div>

                <div style={{ marginTop: "16px", padding: "14px 16px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderSubtle}`, borderRadius: "14px" }}>
                  <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "2px" }}>Prix</div>
                  <div style={{ color: C.text, fontSize: "20px", fontWeight: "900" }}>{selectedService.payant ? formatPrix(selectedService.prix) : "Gratuit"}</div>
                </div>

                {/* Informations sur le prix — façon Booking.com, uniquement
                    pour les services payants. taux_taxe ne s'ajoute jamais
                    au prix payé par le citoyen : c'est une donnée comptable
                    interne à l'institution pour ses factures (montant_ttc =
                    montant_ht × (1+taux), api/institution/factures/route.ts)
                    — vérifié dans le code, pas une supposition. Le prix
                    affiché ici EST déjà le montant final (retour Bryan
                    25/07/2026). */}
                {selectedService.payant && (
                  <div style={{ marginTop: "10px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                    <p style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.6, margin: 0 }}>
                      Prix en Franc Guinéen (GNF) — c&apos;est le montant final que vous réglez à l&apos;établissement, Yelen n&apos;ajoute aucun frais ni majoration.
                      {selectedService.tauxTaxe && selectedService.tauxTaxe > 0 ? ` Inclut une taxe de ${selectedService.tauxTaxe}% — rien à ajouter de votre côté.` : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", cursor: "pointer" }}>
                <div><div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>Pour un tiers</div><div style={{ color: C.textSubtle, fontSize: "11px", marginTop: "2px" }}>Parent, enfant…</div></div>
                <div onClick={() => setForOther(v => !v)} style={{ width: "44px", height: "24px", borderRadius: "12px", background: forOther ? "#F5A623" : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", position: "relative", cursor: "pointer" }}>
                  <div style={{ position: "absolute", top: "2px", left: forOther ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#fff", transition: "left 0.2s" }}/>
                </div>
              </label>
              {forOther && (() => {
                // Validation visible directement sur le champ fautif — avant,
                // seul un bandeau générique tout en bas de l'écran signalait
                // l'erreur, loin de ces champs en haut (retour Bryan 25/07/2026).
                const pourTiersInvalide = submitError === "Renseignez le nom et le téléphone.";
                const nameInvalide = pourTiersInvalide && !otherName.trim();
                const phoneInvalide = pourTiersInvalide && !otherPhone.trim();
                return (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="Nom complet *" style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${nameInvalide ? "#ef4444" : inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text }}/>
                    {nameInvalide && <div style={{ color: "#ef4444", fontSize: "10.5px", fontWeight: "600", marginTop: "4px" }}>Champ requis</div>}
                  </div>
                  <div>
                    <input type="tel" value={otherPhone} onChange={e => setOtherPhone(e.target.value)} placeholder="Téléphone *" style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${phoneInvalide ? "#ef4444" : inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text }}/>
                    {phoneInvalide && <div style={{ color: "#ef4444", fontSize: "10.5px", fontWeight: "600", marginTop: "4px" }}>Champ requis</div>}
                  </div>
                  <div style={{ display: "flex", gap: "8px", padding: "10px 12px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderSubtle}`, borderRadius: "10px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <p style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.6, margin: 0 }}>Votre compte reste <strong style={{ color: C.text }}>seul responsable</strong> de ce rendez-vous, même réservé pour un tiers. Assurez-vous que les informations fournies sont exactes.</p>
                  </div>
                </div>
                );
              })()}
            </div>

            <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
              <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", marginBottom: demandeSpecialeOpen ? "2px" : 0 }}>Demande spéciale</div>
              {demandeSpecialeOpen ? (
                <>
                  <div style={{ color: C.textSubtle, fontSize: "11px", marginBottom: "10px" }}>Optionnel — aide l&apos;établissement à préparer votre visite.</div>
                  <textarea
                    value={descriptionBesoin}
                    onChange={e => setDescriptionBesoin(e.target.value.slice(0, 500))}
                    placeholder="Ex : Je souhaite ouvrir un compte épargne pour mon enfant…"
                    rows={3}
                    autoFocus
                    style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text, resize: "vertical", minHeight: "72px" }}
                  />
                  <div style={{ color: C.textSubtle, fontSize: "10px", textAlign: "right", marginTop: "4px" }}>{descriptionBesoin.length}/500</div>
                </>
              ) : (
                <button onClick={() => setDemandeSpecialeOpen(true)} className="tap" style={{ background: "none", border: "none", color: C.textSubtle, fontSize: "12.5px", fontWeight: "700", cursor: "pointer", padding: "6px 0 0" }}>
                  + Ajouter une demande spéciale
                </button>
              )}
            </div>

            <div style={{ padding: "12px 14px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderSubtle}`, borderRadius: "12px", marginBottom: "16px" }}>
              <p style={{ color: C.textSubtle, fontSize: "11.5px", lineHeight: 1.7, margin: "0 0 8px" }}>
                {selectedService.payant
                  ? "Le paiement s'effectue directement auprès de l'établissement. Yelen ne collecte aucun paiement. Une fois votre rendez-vous confirmé, un code de validation Yelen sera généré — présentez-le lors de votre arrivée."
                  : "Une fois votre rendez-vous confirmé, un code de validation Yelen sera généré — présentez-le lors de votre arrivée."}
              </p>
              {/* Politique d'annulation — absente jusqu'ici, alors qu'aucune
                  limite de délai ni frais n'existe réellement côté produit
                  (annulerRdv/reporterRdv, app/mes-rdv/actions.ts, demandent
                  seulement un motif) : information vérifiée, pas inventée. */}
              <p style={{ color: C.textSubtle, fontSize: "11.5px", lineHeight: 1.7, margin: 0 }}>
                Besoin de changer d&apos;avis ? Vous pouvez annuler ou reporter ce rendez-vous à tout moment depuis <strong style={{ color: C.text }}>Mes RDV</strong>, sans frais.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", marginBottom: "12px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "600" }}>Réservation sécurisée — traitée par Yelen224</span>
            </div>
            {/* Déjà montré au bon endroit (champs Pour un tiers ci-dessus) —
                pas la peine de le répéter ici en plus. Style rouge, pas doré
                — une erreur n'est pas une action à mettre en valeur. */}
            {submitError && submitError !== "Renseignez le nom et le téléphone." && (
              <div style={{ marginBottom: "12px", padding: "12px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "12px", color: "#ef4444", fontSize: "13px" }}>{submitError}</div>
            )}
            <button onClick={goToRecapOrConfirm} disabled={submitting} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: submitting ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : "linear-gradient(135deg,#F5A623,#C8940A)", color: submitting ? C.textSubtle : "#080812", fontSize: "15px", fontWeight: "800", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              {submitting ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>Confirmation…</> : (selectedService.champs_complementaires.length > 0 ? "Continuer →" : "Confirmer le rendez-vous")}
            </button>
            <p style={{ color: C.textSubtle, fontSize: "10.5px", lineHeight: 1.6, textAlign: "center", margin: "10px 0 0" }}>
              En continuant, vous acceptez nos <Link href="/cgu" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Conditions Générales d&apos;Utilisation</Link> et notre <Link href="/confidentialite" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Politique de Confidentialité</Link>.
            </p>
          </div>
        )}

        {/* ═══ ÉTAPE 5 — Informations complémentaires (si configurées) ═══ */}
        {step === "champs" && selectedService && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {backButton("recap")}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>Informations complémentaires</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Demandées par {institution.name} pour ce service.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
              {selectedService.champs_complementaires.map(c => (
                <div key={c.label}>
                  <label style={{ display: "block", color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{c.label}{c.requis ? " *" : ""}</label>
                  <input type={c.type === "tel" ? "tel" : c.type === "numero" ? "text" : "text"} value={champsReponses[c.label] ?? ""} onChange={e => setChampsReponses(r => ({ ...r, [c.label]: e.target.value }))} style={{ width: "100%", padding: "12px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "12px", fontSize: "13px", color: C.text }}/>
                </div>
              ))}
            </div>
            {submitError && <div style={{ marginBottom: "12px", padding: "12px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "12px", color: "#ef4444", fontSize: "13px" }}>{submitError}</div>}
            <button onClick={handleConfirm} disabled={submitting} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: submitting ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : "linear-gradient(135deg,#F5A623,#C8940A)", color: submitting ? C.textSubtle : "#080812", fontSize: "15px", fontWeight: "800", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              {submitting ? <><YelenLoader size={16} color="#080812"/>Confirmation…</> : "Confirmer le rendez-vous"}
            </button>
            <p style={{ color: C.textSubtle, fontSize: "10.5px", lineHeight: 1.6, textAlign: "center", margin: "10px 0 0" }}>
              En continuant, vous acceptez nos <Link href="/cgu" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Conditions Générales d&apos;Utilisation</Link> et notre <Link href="/confidentialite" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Politique de Confidentialité</Link>.
            </p>
          </div>
        )}
      </div>

      {/* Indicateur de position de scroll — même composant que app/page.tsx
          et la fiche institution, jusqu'au récapitulatif (retour Bryan
          25/07/2026). Étape "heure" a déjà sa barre CTA fixe en bas — offset
          plus grand pour ne pas se superposer. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top) + 68px)",
          bottom: `calc(env(safe-area-inset-bottom) + ${step === "heure" && selectedSlot ? 96 : 20}px)`,
          right: "3px",
          width: "3px",
          zIndex: 90,
          pointerEvents: "none",
          opacity: scrollBarShown ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: `${scrollPct * (1 - scrollThumbH) * 100}%`,
            height: `${scrollThumbH * 100}%`,
            width: "100%",
            borderRadius: "3px",
            background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)",
          }}
        />
      </div>

      {exitModalOpen && institution && (
        <ExitIntentModal institutionName={institution.name} isDark={isDark} C={C} onStay={() => setExitModalOpen(false)} onSubmitFeedback={handleExitSubmitFeedback} onLeaveNow={handleExitLeaveNow}/>
      )}
    </div>
  );
}
