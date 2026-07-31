






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
// ✅ Messagerie — écran dédié (chantier Messagerie 19/07/2026), remplace
//    l'ancien pop-up flottant et le service tiers jamais branché
// ✅ Bandeau progression profil + statut Yelen intégré sous le header
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback, useMemo, useRef, Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Html5Qrcode } from "html5-qrcode";
import { YelenLogo } from "@/components/YelenLogo";
import { CONDITIONS_PRESTATAIRE } from "@/lib/conditionsPrestataire";
import { useTheme } from "@/components/ThemeProvider";
import { creneauEstOuvert, RDV_HORS_CRENEAU_MESSAGE, rdvEstEnRetard } from "@/lib/rdvGating";
import { salutation } from "@/lib/salutation";
import { canAccessTab, can, isMembreRole, isTabKey, ROLE_LABELS, type MembreRole } from "@/lib/institutionPermissions";
import { T, type ThemeTokens } from "./theme";
import { DisponibilitesTab } from "./components/DisponibilitesTab";
import { ServicesTab } from "./components/ServicesTab";
import { CommunicationTab } from "./components/CommunicationTab";
import { CodeQrTab } from "./components/CodeQrTab";
import { ValiderRdvTab } from "./components/ValiderRdvTab";
import { ProfilEntrepriseTab } from "./components/ProfilEntrepriseTab";
import { ConditionsInformationsTab } from "./components/ConditionsInformationsTab";
import { ProfilResponsableTab } from "./components/ProfilResponsableTab";
import { DocumentsTab } from "./components/DocumentsTab";
import { MesClientsTab } from "./components/MesClientsTab";
import { AvisReputationTab } from "./components/AvisReputationTab";
import { MessagerieTab } from "./components/MessagerieTab";
import { QuestionsClientsTab } from "./components/QuestionsClientsTab";
import { EquipeTab } from "./components/EquipeTab";
import { JournalTab } from "./components/JournalTab";
import { EspaceTravailTab } from "./components/EspaceTravailTab";
import { RdvPasseTab } from "./components/RdvPasseTab";
import { ParametresTab, ParametresDangerZone } from "./components/ParametresTab";
import { ProfilTab } from "./components/ProfilTab";
import { FinanceAccueilTab } from "./components/FinanceAccueilTab";
import { PaiementsTab } from "./components/PaiementsTab";
import { TransactionsTab } from "./components/TransactionsTab";
import { HistoriqueFinancierTab } from "./components/HistoriqueFinancierTab";
import { FacturationTab } from "./components/FacturationTab";
import { RapportsTab } from "./components/RapportsTab";
import { DocumentsFinanciersTab } from "./components/DocumentsFinanciersTab";
import { DocumentsClientsTab } from "./components/DocumentsClientsTab";
import { PartenariatTab } from "./components/PartenariatTab";
import { MesOffresTab } from "./components/MesOffresTab";
import { LogoutFlow, INSTITUTION_LOGOUT_COPY } from "./components/LogoutFlow";

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
  citoyen_photo?: string | null;
  pour_autre?: boolean;
  nom_autre?: string | null;
  phone_autre?: string | null;
  est_payant?: boolean;
  service_payant_nom?: string | null;
  service_payant_prix?: number | null;
  booking_payant_id?: string | null;
  notes?: string;
  presence?: boolean;
  presence_status?: string;
  presence_confirmed_at?: string;
  conversation_terminee?: boolean;
  motif_annulation?: string;
  created_at?: string;
  termine_at?: string;
  guichet?: string;
  motif_report?: string;
  duree_minutes?: number | null;
  description_besoin?: string | null;
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

type DashboardTab = "accueil" | "rdv" | "disponibilites" | "services" | "communication" | "scanner" | "codeqr" | "valider-rdv" | "analyse" | "parametres" | "profil-entreprise" | "conditions-informations" | "profil-responsable" | "documents" | "mes-clients" | "avis-reputation" | "rdv-historique" | "equipe" | "journal" | "espace-travail" | "messagerie" | "questions-clients" | "paiements" | "transactions" | "historique-financier" | "facturation" | "rapports" | "documents-financiers" | "documents-clients" | "profil" | "partenariat" | "mes-offres";
// Item de la liste "Paramètres" — soit un lien externe (href), soit une
// bascule d'onglet interne au dashboard (onTab), jamais les deux.
type SettingsItem = { label: string; href: string | null; onTab?: DashboardTab; color: string };
type SettingsSection = { titre: string; items: SettingsItem[] };

// RBAC Enterprise (5 rôles) — masquage de nav uniquement (cosmétique) :
// "guide"/"__plus__" ne sont pas dans TabKey et restent donc toujours
// visibles (isTabKey renvoie false). "messagerie" est dans TabKey depuis
// le chantier Messagerie (19/07/2026, écran dédié qui remplace l'ancien
// widget flottant hors RBAC). La vraie barrière vit dans chaque route API
// (lib/institutionPermissions.ts), jamais ici — voir Phase D du chantier
// RBAC.
function tabAllowed(role: MembreRole | null, key: string): boolean {
  if (!isTabKey(key)) return true;
  return role !== null && canAccessTab(role, key) !== "none";
}
function tabReadOnly(role: MembreRole | null, key: string): boolean {
  if (!isTabKey(key)) return false;
  return role !== null && canAccessTab(role, key) === "read";
}

// Bandeau affiché en tête d'un onglet en lecture seule (RBAC) — même
// mention partout, pour que le membre comprenne que la restriction vient
// du rôle qui lui a été assigné, pas d'un bug.
function ReadOnlyNotice({ C }: { C: ThemeTokens }) {
  return (
    <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "12px 14px", margin: "16px 16px 0", display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <span style={{ fontSize: "16px", flexShrink: 0 }}>🔒</span>
      <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>
        <strong style={{ color: C.orange }}>Lecture seule.</strong> Vous n&apos;avez pas les droits pour effectuer des actions sur cet écran. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez votre employeur.
      </p>
    </div>
  );
}

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
  conditions_prestataire_acceptees_le?: string | null;
  secteur?: string | null;
  statut_juridique?: string | null;
  whatsapp?: string;
  banniere?: string | null;
  annee_creation?: string;
  capacite?: string;
  langue?: string[];
  services?: string[];
  horaires?: { jour: string; ouvert: boolean; debut: string; fin: string }[];
  partenaire_statut?: string;
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
  kpi_variations: { nouveau: number; pending: number; confirmed: number; done: number; cancelled: number; total: number };
};

// ─── Design Tokens ────────────────────────────────────────────────────
// ─── CSS Global ────────────────────────────────────────────────────────
const cssFor = (C: ThemeTokens) => `
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
  html,body{background:${C.bg};overflow-x:hidden;overscroll-behavior:none}
  ::-webkit-scrollbar{display:none}
  *{scrollbar-width:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideDownBanner{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:translateY(0)}}
  @keyframes ping{0%{transform:scale(1);opacity:1}75%,100%{transform:scale(2.2);opacity:0}}
  @keyframes glow{0%,100%{box-shadow:0 0 8px ${C.gold}40}50%{box-shadow:0 0 24px ${C.gold}70}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  @keyframes bannerAlive{0%,100%{box-shadow:inset 0 0 0 rgba(0,0,0,0)}50%{box-shadow:inset 0 0 24px rgba(0,0,0,0.18)}}
  .tap{transition:opacity .12s,transform .12s;cursor:pointer;touch-action:manipulation;user-select:none}
  .tap:active{opacity:0.65;transform:scale(0.97)}
  input::placeholder{color:${C.t3}}
  textarea::placeholder{color:${C.t3}}
  input,textarea{color:${C.t1};background:transparent;border:none;outline:none;font-family:inherit}
  #qr-reader-modal video{border-radius:12px!important}
  #qr-reader-modal{border:none!important;background:transparent!important}
  #qr-reader-modal__dashboard_section_csr button{
    background:${C.gold}!important;color:#000!important;border:none!important;
    padding:10px 20px!important;border-radius:10px!important;font-weight:800!important;
    font-size:14px!important;cursor:pointer!important;font-family:inherit!important;
  }
  /* ── Layout PC ≥1024px ── */
  @media(min-width:1024px){
    .yelen-shell{display:flex;height:100svh;overflow:hidden}
    .yelen-sidebar{
      width:264px;min-width:264px;height:100svh;overflow:visible;
      background:${C.bgCard};border-right:1px solid rgba(255,255,255,0.07);
      display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;z-index:400
    }
    .yelen-main{margin-left:264px;flex:1;overflow-y:auto;height:100svh;display:flex;flex-direction:column}
    .yelen-bottom-nav{display:none!important}
    .yelen-content{flex:1;overflow-y:auto}
    .yelen-header-inner{padding:0 32px!important}
    .yelen-account-panel{
      position:fixed;top:0;bottom:0;width:232px;min-width:232px;height:100svh;
      background:${C.bgCard2};border-right:1px solid rgba(255,255,255,0.07);
      display:flex;flex-direction:column;overflow-y:auto;z-index:390;
      animation:fadeUp 0.16s ease;
    }
  }
  @media(max-width:1023px){
    .yelen-sidebar{display:none}
    .yelen-account-panel{display:none!important}
    .yelen-shell{display:block}
    .yelen-main{margin-left:0!important}
    /* min-height:100svh forcé en inline (toujours nécessaire ≥1024px pour
       la sidebar) créait un grand espace vide entre un contenu court et le
       menu fixe du bas sur mobile (retour Bryan 29/07/2026) — !important
       requis ici pour passer devant le style inline, uniquement <1024px,
       PC totalement inchangé. */
    .yelen-shell{min-height:auto!important}
  }
  @media(min-width:1024px){
    .yelen-main{padding-bottom:0!important}
  }
  /* ── Header : recherche + popovers (recherche, RDV entrant, feedback,
      aide, "..."), mobile-first — bottom sheet plein écran par défaut,
      dropdown ancré à partir de 1024px ── */
  .header-popover-panel{
    position:fixed;left:10px;right:10px;bottom:10px;z-index:500;
    max-height:76svh;overflow-y:auto;padding:14px 14px calc(14px + env(safe-area-inset-bottom));
    background:${C.bgCard};border:1px solid ${C.border2};border-radius:22px;
    box-shadow:0 -16px 48px rgba(0,0,0,0.5);animation:slideUp 0.22s ease;
  }
  .header-popover-grip{display:block}
  .header-popover-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:499;animation:fadeIn 0.2s ease}
  .header-search-desktop{display:none}
  /* ── Header mobile : consolidation façon Shopify admin (retour Bryan
      29/07/2026) — la rangée d'icônes (Partenaires, recherche, RDV entrants,
      notifications, questions clients, feedback, aide, actualiser) débordait
      de l'écran sur mobile (9 éléments à largeur fixe sur une seule ligne
      sans flexWrap). Seuls logo/nom + Scanner + "..." restent visibles en
      permanence <1024px, le reste rejoint le panneau "..." (voir
      .yelen-header-more-extra). !important nécessaire car ces boutons ont un
      display:"flex" inline — même convention que .header-search-icon-mobile
      ci-dessous. PC entièrement inchangé (≥1024px restaure display:flex). ── */
  .yelen-header-more-item{display:none!important}
  .yelen-header-more-extra{display:flex;flex-direction:column}
  @media(min-width:1024px){
    .header-popover-panel{
      position:absolute;left:auto;right:0;bottom:auto;top:calc(100% + 8px);
      width:340px;max-height:440px;border-radius:16px;padding:14px;
      box-shadow:0 20px 60px rgba(0,0,0,0.35);animation:fadeUp 0.16s ease;
    }
    .header-popover-grip{display:none}
    .header-popover-overlay{display:none}
    .header-search-desktop{display:flex}
    .yelen-header-more-item{display:flex!important}
    .yelen-header-more-extra{display:none}
    .yelen-header-more-badge{display:none!important}
    /* ── Doit rester APRÈS .yelen-header-more-item ci-dessus : cette icône
        cumule les deux classes et doit rester masquée sur PC (recherche
        desktop = le champ texte, pas cette icône), contrairement aux autres
        éléments "more-item" qui redeviennent visibles ≥1024px. ── */
    .header-search-icon-mobile{display:none!important}
  }
  /* ── Hiérarchie typographique — niveau SaaS US (audit CEO 12/07/2026) ──
      Mobile-first : tailles compactes par défaut, montent en puissance
      ≥1024px où l'espace horizontal le permet. ── */
  .yelen-h1{font-size:34px;font-weight:900;letter-spacing:-0.6px}
  .yelen-h2{font-size:20px;font-weight:700;letter-spacing:-0.3px}
  @media(min-width:1024px){
    .yelen-h1{font-size:46px}
    .yelen-h2{font-size:26px}
  }
  /* ── Sidebar : transition hover/actif (audit CEO 12/07/2026) ── */
  .yelen-nav-item{transition:background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease}
  .yelen-nav-item:hover{background:${C.bg3}}
  .yelen-nav-item-active:hover{background:linear-gradient(135deg, ${C.gold}15, ${C.gold}08)}
  .yelen-nav-item-active{box-shadow:0 2px 10px ${C.gold}18}
  /* ── Micro-animation hover (audit CEO 12/07/2026) ── */
  .yelen-card-hover{transition:transform 0.2s ease, box-shadow 0.2s ease}
  .yelen-card-hover:hover{transform:translateY(-2px); box-shadow:0 4px 16px rgba(0,0,0,0.08)}
  /* ── Conteneur de largeur maximale — refonte visuelle (19/07/2026).
      Sans ça, le contenu de chaque onglet occupe 100% de la largeur
      restante après la sidebar (jusqu'à ~1650px sur grand écran), ce
      qui étire les cartes/grilles à l'horizontale. Stripe/Linear
      cadrent toujours la zone de lecture, même sur écran large. N'agit
      qu'à partir de 1024px — mobile inchangé. Les bannières (progression,
      nouveau RDV, retard) restent dans <header>, donc pleine largeur
      volontairement, comme les alertes système chez Stripe. ── */
  @media(min-width:1024px){
    .yelen-page{max-width:1280px;margin:0 auto;width:100%}
  }
`;

// ─── Logo Yelen224 — composant partagé components/YelenLogo.tsx, importé
// en tête de fichier. Ne plus redéfinir de variante locale ici : c'était
// la cause de la divergence avec l'icône utilisée sur connexion/inscription.

// ─── Helpers ──────────────────────────────────────────────────────────
function stInfo(s: string, C: ThemeTokens) {
  switch (s) {
    case "confirme":   return { c: C.green,  bg: C.greenL,  l: "Confirmé" };
    case "en_attente": return { c: C.gold,   bg: "rgba(212,160,23,0.12)", l: "En attente" };
    case "annule":     return { c: C.red,    bg: C.redL,    l: "Annulé" };
    case "effectue":   return { c: C.blue,   bg: C.blueL,   l: "Effectué" };
    case "termine":    return { c: C.purple, bg: C.purpleL, l: "Terminé" };
    case "honore":     return { c: C.green,  bg: C.greenL,  l: "Honoré" };
    case "nouveau":    return { c: C.gold,   bg: `${C.gold}15`,           l: "Nouveau" };
    case "absent":     return { c: C.red,    bg: C.redL,                  l: "Absent" };
    case "en_retard":  return { c: C.orange, bg: C.orangeL,               l: "RDV passé" };
    default:           return { c: C.t2,     bg: "rgba(153,153,179,0.1)", l: s };
  }
}

// Dérive un "service" affichable depuis les tags déjà écrits dans objet par
// app/rdv/[id]/page.tsx (ex: "[URGENT] ...", "[SERVICE PAYANT] Nom — ...") —
// aucune catégorie inventée, juste ce qui existe déjà réellement en données.
function extraireService(objet: string | undefined): string {
  const m = (objet || "").match(/^\[([^\]]+)\]/);
  if (!m) return "Général";
  if (m[1] === "SERVICE PAYANT") {
    const suite = (objet || "").slice(m[0].length).split("—")[0].trim();
    return suite || "Service payant";
  }
  return m[1];
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

// Regroupe une liste par jour (Aujourd'hui/Hier/date) — même convention que
// NotifPanel côté citoyen (app/page.tsx), demandé par Bryan le 20/07/2026
// pour le panneau Notifications institution.
function libelleJourNotif(iso: string): string {
  const d = new Date(iso);
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const hier = new Date(auj); hier.setDate(hier.getDate() - 1);
  const dJour = new Date(d); dJour.setHours(0, 0, 0, 0);
  if (dJour.getTime() === auj.getTime()) return "Aujourd'hui";
  if (dJour.getTime() === hier.getTime()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function grouperParJour<T extends { created_at: string }>(items: T[]): { jour: string; items: T[] }[] {
  const groupes: { jour: string; items: T[] }[] = [];
  for (const n of items) {
    const jour = libelleJourNotif(n.created_at);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === jour) dernier.items.push(n);
    else groupes.push({ jour, items: [n] });
  }
  return groupes;
}

// Un date_rdv "brut" ("2026-07-20", sans heure) donné à `new Date(...)` est
// interprété comme minuit UTC par le moteur JS, puis reconverti dans le
// fuseau LOCAL du navigateur pour l'affichage — décale la date d'un jour
// dès que ce fuseau est en retard sur UTC (ex: un poste de dev réglé en
// Eastern Time, alors que la Guinée est en UTC+0). Bug réel diagnostiqué le
// 19/07/2026 (RDV affiché "dimanche 19" alors que la vraie date était le
// "lundi 20"). Ne pas utiliser new Date(date_rdv) directement pour de
// l'affichage — toujours passer par cette fonction, qui construit la date
// dans le fuseau local sans réinterprétation UTC.
function parseLocalDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(dateStr);
}

// heure_rdv vient de Postgres au format "HH:MM:SS" (colonne `time`) — jamais
// utile d'afficher les secondes à l'utilisateur.
function formatHeure(h?: string | null): string {
  return (h || "").slice(0, 5);
}

function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return parseLocalDate(iso).toLocaleDateString("fr-FR", opts || { day: "numeric", month: "short", year: "numeric" });
}

// Délègue à lib/salutation.ts (source unique, partagée avec le moteur de
// notifications — chantier "Yelen Assistant", 20/07/2026).
function getSalutation(name: string): string {
  return salutation(name);
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
// ─── Conditions prestataire + célébration de validation (19/07/2026) ──
// Séquence déclenchée une seule fois : au premier chargement du
// dashboard après passage de statut à "validee" tant que
// conditions_prestataire_acceptees_le est encore null. Voir
// lib/conditionsPrestataire.ts pour le contenu (texte d'exemple,
// distinct des CGU/Confidentialité génériques).
function ConditionsPrestataireModal({ onAccept, saving }: { onAccept: () => void; saving: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [checked, setChecked] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", animation: "fadeIn 0.2s ease" }}>
      <div style={{ backgroundColor: C.bgCard, borderRadius: "24px", border: `1px solid ${C.border2}`, maxWidth: "560px", width: "100%", maxHeight: "88svh", overflowY: "auto", padding: "28px 24px", animation: "slideUp 0.3s ease" }}>
        <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
        </div>
        <h2 style={{ color: C.t1, fontSize: "20px", fontWeight: "900", letterSpacing: "-0.4px", marginBottom: "6px" }}>Conditions d&apos;utilisation prestataire</h2>
        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, marginBottom: "18px" }}>Votre établissement vient d&apos;être validé. Avant de continuer, lisez et acceptez les conditions spécifiques aux institutions partenaires de Yelen224.</p>
        <div style={{ backgroundColor: C.bg3, borderRadius: "14px", padding: "16px", marginBottom: "18px", maxHeight: "260px", overflowY: "auto" }}>
          {CONDITIONS_PRESTATAIRE.map((s, i) => (
            <div key={s.titre} style={{ marginBottom: i < CONDITIONS_PRESTATAIRE.length - 1 ? "14px" : 0 }}>
              <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "800", marginBottom: "4px" }}>{s.titre}</div>
              <div style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.6 }}>{s.texte}</div>
            </div>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", marginBottom: "18px" }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ width: "18px", height: "18px", marginTop: "1px", accentColor: C.gold, flexShrink: 0, cursor: "pointer" }}/>
          <span style={{ color: C.t1, fontSize: "12.5px", lineHeight: 1.5 }}>J'ai lu et j'accepte les conditions d'utilisation prestataire de Yelen224.</span>
        </label>
        <button onClick={onAccept} disabled={!checked || saving} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontSize: "14px", fontWeight: "900", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", opacity: !checked || saving ? 0.5 : 1 }}>
          {saving ? "…" : "Accepter et continuer"}
        </button>
      </div>
    </div>
  );
}

function CelebrationModal({ instName, onClose }: { instName: string; onClose: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  // Particules : angle + distance + délai pré-calculés pour un
  // éclatement naturel façon animation "like" — pas besoin d'aléatoire
  // à l'exécution, un jeu de valeurs fixes suffit et reste stable.
  const particules = [
    { angle: 0, dist: 90, delay: 0, size: 14 }, { angle: 30, dist: 110, delay: 0.05, size: 10 },
    { angle: 60, dist: 85, delay: 0.1, size: 16 }, { angle: 90, dist: 100, delay: 0.02, size: 11 },
    { angle: 120, dist: 95, delay: 0.15, size: 14 }, { angle: 150, dist: 105, delay: 0.07, size: 10 },
    { angle: 180, dist: 90, delay: 0.12, size: 15 }, { angle: 210, dist: 100, delay: 0.03, size: 11 },
    { angle: 240, dist: 85, delay: 0.09, size: 16 }, { angle: 270, dist: 110, delay: 0.06, size: 10 },
    { angle: 300, dist: 95, delay: 0.14, size: 14 }, { angle: 330, dist: 90, delay: 0.04, size: 12 },
  ];
  const keyframes = particules.map((p, i) => {
    const rad = (p.angle * Math.PI) / 180;
    const dx = Math.round(Math.cos(rad) * p.dist);
    const dy = Math.round(Math.sin(rad) * p.dist);
    return `@keyframes particule-${i}{0%{transform:translate(-50%,-50%) scale(0);opacity:1}70%{opacity:1}100%{transform:translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1);opacity:0}}`;
  }).join("\n");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2100, backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", animation: "fadeIn 0.25s ease" }}>
      <style>{`${keyframes}\n@keyframes badge-pop{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}`}</style>
      <div style={{ textAlign: "center", maxWidth: "380px" }}>
        <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 24px" }}>
          {particules.map((p, i) => (
            <svg key={i} width={p.size} height={p.size} viewBox="0 0 24 24" fill={C.gold} style={{ position: "absolute", left: "50%", top: "50%", animation: `particule-${i} 0.9s ease-out ${p.delay}s both` }}>
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/>
            </svg>
          ))}
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", animation: "badge-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both", boxShadow: `0 0 40px ${C.gold}50` }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
        <h2 style={{ color: C.t1, fontSize: "24px", fontWeight: "900", letterSpacing: "-0.6px", marginBottom: "8px" }}>Compte validé !</h2>
        <p style={{ color: C.t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "24px" }}>{instName} est maintenant actif sur Yelen224. Les citoyens peuvent découvrir votre établissement et prendre rendez-vous dès maintenant.</p>
        <button onClick={onClose} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontSize: "14px", fontWeight: "900", padding: "14px 32px", borderRadius: "14px", border: "none", cursor: "pointer" }}>Commencer</button>
      </div>
    </div>
  );
}

function ProfilProgressionBandeau({ inst, instId, setTab }: { inst: Institution | null; instId: string; setTab: Dispatch<SetStateAction<DashboardTab>> }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
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
    validee:    { color: C.green,  bg: "rgba(0,200,150,0.10)",  border: "rgba(0,200,150,0.25)",  label: "Active",        ping: false },
    en_attente: { color: C.gold,   bg: "rgba(212,160,23,0.10)", border: "rgba(212,160,23,0.25)", label: "En attente de validation", ping: true  },
    refusee:    { color: C.red,    bg: "rgba(255,71,87,0.10)",  border: "rgba(255,71,87,0.25)",  label: "Dossier refusé",           ping: false },
  };
  const sc = statutCfg[inst.statut ?? "en_attente"] ?? statutCfg["en_attente"];
  const barColor = pct === 100 ? C.green : pct >= 60 ? C.gold : C.orange;

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
          <span style={{ backgroundColor: C.green, color: "#fff", fontSize: "9px", fontWeight: "900", padding: "2px 8px", borderRadius: "20px" }}>✓ VÉRIFIÉ</span>
        )}
        {inst.statut === "refusee" && (
          <a href="mailto:support@yelen224.com" style={{ color: C.red, fontSize: "10px", fontWeight: "800", textDecoration: "none" }}>Contacter →</a>
        )}
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border2}`, padding: "10px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "7px" }}>
        <span style={{ color: C.t2, fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>Profil</span>
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
              <div style={{ width: "14px", height: "14px", borderRadius: "50%", backgroundColor: s.done ? C.green : "rgba(255,255,255,0.08)", border: `1.5px solid ${s.done ? C.green : "rgba(255,255,255,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {s.done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span style={{ color: s.done ? C.green : C.t3, fontSize: "10px", fontWeight: s.done ? "700" : "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            </>
          );
          const itemStyle: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", gap: "4px", backgroundColor: s.done ? "rgba(0,200,150,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${s.done ? "rgba(0,200,150,0.2)" : C.border}`, borderRadius: "8px", padding: "5px 7px", textDecoration: "none" };
          // "Documents" et "Photo" sont desormais des onglets du dashboard
          // (DocumentsTab, ProfilEntrepriseTab), plus des pages separees —
          // bascule d'onglet au lieu d'une navigation.
          if (s.id === "docs" || s.id === "photo") {
            return <button key={s.id} onClick={() => setTab(s.id === "docs" ? "documents" : "profil-entreprise")} className="tap" style={{ ...itemStyle, border: `1px solid ${s.done ? "rgba(0,200,150,0.2)" : C.border}`, cursor: "pointer" }}>{content}</button>;
          }
          return (
            <Link key={s.id} href={`/institution/disponibilites`} style={itemStyle}>
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
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={i <= Math.round(note) ? C.gold : "rgba(255,255,255,0.1)"}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/>
        </svg>
      ))}
    </div>
  );
}

function SectionHeader({ label, accent, action, onAction, badge }: { label: string; accent: string; action?: string; onAction?: () => void; badge?: number }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "3px", height: "18px", background: accent, borderRadius: "2px", flexShrink: 0 }}/>
        <span className="yelen-h2" style={{ color: C.t1 }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ backgroundColor: accent, color: accent === C.gold ? "#000" : "#fff", fontSize: "9px", fontWeight: "900", padding: "2px 7px", borderRadius: "20px" }}>{badge}</span>
        )}
      </div>
      {action && <button onClick={onAction} style={{ background: "none", border: "none", color: accent, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>{action}</button>}
    </div>
  );
}

// Compteur animé — anime de 0 (ou de l'ancienne valeur) vers `value` sur
// ~700ms (ease-out) à chaque changement, façon Stripe/Linear. Purement
// visuel, aucun état persistant.
function AnimatedNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) { setDisplay(to); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display}</>;
}

function RadialProgress({ value, max = 100, color, size = 52, label }: { value: number; max?: number; color: string; size?: number; label?: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
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
        <span style={{ color: C.t1, fontSize: size < 50 ? "10px" : "12px", fontWeight: "800" }}>{label ?? `${Math.round(pct * 100)}%`}</span>
      </div>
    </div>
  );
}

function Toast({ msg, color, onDismiss }: { msg: string; color: string; onDismiss: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  useEffect(() => { const t = setTimeout(onDismiss, 4000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div onClick={onDismiss} style={{ position: "fixed", top: "66px", left: "50%", transform: "translateX(-50%)", zIndex: 950, backgroundColor: C.bgCard2, border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: "12px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", animation: "slideDown 0.25s ease", cursor: "pointer", minWidth: "220px", maxWidth: "calc(100vw - 32px)" }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }}/>
      <span style={{ color: C.t1, fontSize: "12px", fontWeight: "700", flex: 1 }}>{msg}</span>
    </div>
  );
}

// ─── Illustration d'état vide pour le panneau Notifications — trait, sans
// emoji, même esprit que EtatVideSante (chantier Avis & Réputation).
// Demandé par Bryan le 20/07/2026 (l'ancien texte seul était trop pauvre).
function NotifEmptyIllustration({ color }: { color: string }) {
  return (
    <svg width="64" height="64" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="34" stroke={`${color}30`} strokeWidth="1.5"/>
      <path d="M27 30a9 9 0 0 1 18 0c0 8 4 10 4 10H23s4-2 4-10z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M32.5 44a3.5 3.5 0 0 0 7 0" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M27 25l4 4M45 25l-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

// ─── HeaderPopover — primitive partagée par les 5 icônes du header
// (recherche, RDV entrant, feedback, aide, "..."). Une seule ouverte à la
// fois (activePopover au niveau du dashboard). Présentation responsive
// uniquement via CSS (.header-popover-panel, dropdown ancré ≥1024px / bottom
// sheet plein écran en dessous), pas de JSX dupliqué par breakpoint.
// ⚠️ Le panneau est rendu via createPortal dans document.body (retour Bryan
// 29/07/2026, capture à l'appui) : le <header> parent a un backdropFilter,
// qui crée un containing block pour tout descendant position:fixed (comme
// filter) — sans le portail, "bottom:10px" se calculait par rapport au bas
// du header (~100px de haut) au lieu du bas de l'écran, le panneau
// s'ouvrait donc hors-écran vers le haut. Même pattern déjà utilisé dans
// components/MonAssistant.tsx pour un problème de contexte d'empilement
// analogue. panelRef en plus de ref : le panneau n'est plus un descendant
// DOM du wrapper une fois portalé, donc le clic extérieur doit vérifier
// les deux. ───
function HeaderPopover({ id, active, onOpen, onClose, trigger, badge, glow, panelTitle, children, wrapperClassName, badgeClassName }: {
  id: string; active: boolean; onOpen: () => void; onClose: () => void;
  trigger: React.ReactNode; badge?: number; glow?: boolean; panelTitle: string; children: React.ReactNode;
  wrapperClassName?: string; badgeClassName?: string;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = ref.current && ref.current.contains(target);
      const insidePanel = panelRef.current && panelRef.current.contains(target);
      if (!insideTrigger && !insidePanel) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, onClose]);

  return (
    <div ref={ref} className={wrapperClassName} style={{ position: "relative" }}>
      <button onClick={() => (active ? onClose() : onOpen())} className="tap" title={panelTitle} style={{ position: "relative", background: active ? `${C.gold}15` : C.bgCard2, border: `1px solid ${active ? C.gold + "40" : C.border}`, borderRadius: "10px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, animation: glow && !!badge && badge > 0 ? "glow 1.6s ease-in-out infinite" : "none" }}>
        {trigger}
        {!!badge && badge > 0 && (
          <span className={badgeClassName} style={{ position: "absolute", top: "-5px", right: "-5px", backgroundColor: C.red, color: "#fff", fontSize: "9px", fontWeight: "900", minWidth: "17px", height: "17px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.bgCard}`, padding: "0 3px" }}>
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      {active && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="header-popover-panel" data-popover={id}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 10px", opacity: 0.5 }} className="header-popover-grip"/>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 12px", borderBottom: `1px solid ${C.border}`, marginBottom: "12px" }}>
            <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>{panelTitle}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, padding: "4px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BANDEAU NOUVEAU RDV
// ═══════════════════════════════════════════════════════════════════════
function NouveauRdvBanner({ rdv, onClose, onOpen }: { rdv: RDV; onClose: () => void; onOpen: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div onClick={onOpen} className="tap" style={{ backgroundColor: C.gold, padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", animation: "slideDownBanner 0.4s ease, bannerAlive 2.2s ease-in-out infinite 0.4s" }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#000" }}/>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: "#000", animation: "ping 1s ease-out infinite" }}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: "#000", fontSize: "12px", fontWeight: "900" }}>Nouveau RDV — {rdv.citoyen_nom}</span>
        <span style={{ color: "rgba(0,0,0,0.6)", fontSize: "10px", marginLeft: "8px" }}>{rdv.objet || "RDV général"} · {formatDate(rdv.date_rdv, { day: "numeric", month: "short" })} {formatHeure(rdv.heure_rdv)}</span>
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
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
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
        <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "28px 28px 0 0", padding: "28px 24px 48px", width: "100%", maxWidth: "520px", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease", maxHeight: "92svh", overflowY: "auto" }}>
          <div style={{ width: "40px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 24px" }}/>

          {/* Alerte avertissement */}
          <div style={{ backgroundColor: `${C.red}10`, border: `1px solid ${C.red}30`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "20px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <div style={{ color: C.red, fontSize: "11px", fontWeight: "900", marginBottom: "3px" }}>Attention — Impact sur votre compte</div>
              <div style={{ color: C.t2, fontSize: "10px", lineHeight: 1.6 }}>Les refus répétés sans motif valable peuvent entraîner une <strong style={{ color: C.red }}>restriction ou désactivation</strong> de votre compte Yelen. Chaque refus est enregistré.</div>
            </div>
          </div>

          <div style={{ color: C.t1, fontSize: "17px", fontWeight: "900", marginBottom: "6px" }}>Motif du refus</div>
          <div style={{ color: C.t3, fontSize: "11px", marginBottom: "16px" }}>Sélectionnez un motif pour <strong style={{ color: C.t2 }}>{rdv.citoyen_nom}</strong></div>

          {/* Motifs */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
            {motifs.map(m => (
              <div key={m} onClick={() => setMotifSelectionne(m)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: motifSelectionne === m ? `${C.red}12` : C.bg3, border: `1px solid ${motifSelectionne === m ? C.red + "40" : C.border}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${motifSelectionne === m ? C.red : C.t3}`, backgroundColor: motifSelectionne === m ? C.red : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {motifSelectionne === m && <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#fff" }}/>}
                </div>
                <span style={{ color: motifSelectionne === m ? C.t1 : C.t2, fontSize: "13px", fontWeight: motifSelectionne === m ? "700" : "500" }}>{m}</span>
              </div>
            ))}
          </div>

          {motifSelectionne === "Autre motif" && (
            <textarea
              value={motifCustom}
              onChange={e => setMotifCustom(e.target.value)}
              placeholder="Décrivez brièvement le motif..."
              rows={3}
              style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: C.t1, marginBottom: "14px" }}
            />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
            <button onClick={() => setShowRefusForm(false)} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", cursor: "pointer" }}>
              Annuler
            </button>
            <button
              onClick={() => motifFinal && onRefuse(motifFinal)}
              disabled={!motifFinal || loading}
              className="tap"
              style={{ backgroundColor: motifFinal ? C.redL : "rgba(255,255,255,0.04)", color: motifFinal ? C.red : C.t3, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${motifFinal ? C.red + "30" : C.border}`, cursor: motifFinal ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
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
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "28px 28px 0 0", padding: "28px 24px 48px", width: "100%", maxWidth: "520px", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease", maxHeight: "92svh", overflowY: "auto" }}>
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 24px" }}/>

        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: `${C.gold}20`, border: `1px solid ${C.gold}40`, borderRadius: "20px", padding: "4px 12px", marginBottom: "16px" }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.gold }}/>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: C.gold, animation: "ping 1.5s ease-out infinite" }}/>
          </div>
          <span style={{ color: C.gold, fontSize: "11px", fontWeight: "800" }}>Nouveau rendez-vous</span>
        </div>

        <div style={{ color: C.t1, fontSize: "20px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "20px" }}>Demande de RDV reçue</div>

        {/* Citoyen */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", backgroundColor: C.bg3, borderRadius: "16px", padding: "14px", marginBottom: "16px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", overflow: "hidden", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "900", color: C.gold, flexShrink: 0 }}>
            {rdv.citoyen_photo ? <img src={rdv.citoyen_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : rdv.citoyen_nom.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800" }}>{rdv.citoyen_nom}</div>
            {rdv.citoyen_phone && <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{rdv.citoyen_phone}</div>}
          </div>
          {rdv.citoyen_phone && (
            <a href={`tel:${rdv.citoyen_phone}`} style={{ width: "38px", height: "38px", borderRadius: "50%", backgroundColor: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </a>
          )}
        </div>

        {/* Détails RDV */}
        <div style={{ backgroundColor: C.bg3, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px" }}>
          {[
            { icon: "📋", label: "Objet", value: rdv.objet || "RDV général" },
            { icon: "📅", label: "Date",  value: formatDate(rdv.date_rdv, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) },
            { icon: "🕐", label: "Heure", value: rdv.heure_rdv ? formatHeure(rdv.heure_rdv) : "—" },
            ...(rdv.created_at ? [{ icon: "⏱", label: "Reçu", value: timeAgo(rdv.created_at) }] : []),
          ].map((item, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "9px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ fontSize: "14px", flexShrink: 0 }}>{item.icon}</span>
              <span style={{ color: C.t3, fontSize: "12px", width: "60px", flexShrink: 0, paddingTop: "1px" }}>{item.label}</span>
              <span style={{ color: C.t1, fontSize: "13px", fontWeight: "700", flex: 1 }}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Info QR */}
        <div style={{ backgroundColor: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: "12px", padding: "10px 14px", marginBottom: "20px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div>
            <div style={{ color: C.blue, fontSize: "11px", fontWeight: "800", marginBottom: "2px" }}>Confirmation de présence</div>
            <div style={{ color: C.t3, fontSize: "10px", lineHeight: 1.5 }}>Si accepté, le citoyen reçoit un QR code. Le jour J, scannez-le pour confirmer sa présence automatiquement.</div>
          </div>
        </div>

        {/* Boutons Accepter / Refuser */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
          <button
            onClick={() => setShowRefusForm(true)}
            disabled={loading}
            className="tap"
            style={{ backgroundColor: C.redL, color: C.red, fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "16px", border: `1px solid ${C.red}25`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Refuser
          </button>
          <button
            onClick={onAccept}
            disabled={loading}
            className="tap"
            style={{ background: `linear-gradient(135deg, ${C.green}, #009e76)`, color: "#fff", fontWeight: "900", fontSize: "15px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", boxShadow: `0 4px 20px ${C.green}35` }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            {loading ? "..." : "Accepter le RDV"}
          </button>
        </div>

        <button onClick={onClose} style={{ width: "100%", marginTop: "10px", background: "none", border: "none", color: C.t3, fontSize: "12px", cursor: "pointer", padding: "8px" }}>Fermer</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GUIDE SCALING
// ═══════════════════════════════════════════════════════════════════════
function GuideScalingModal({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
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
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${C.bg}88 0%, ${C.bg}EE 40%, ${C.bg} 100%)` }}/>
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100svh", padding: "20px 20px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "36px", height: "36px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <YelenLogo size={22} color="#000" />
            </div>
            <span style={{ color: C.gold, fontSize: "13px", fontWeight: "900", letterSpacing: "0.5px" }}>YELEN224 PRO</span>
          </div>
          <button onClick={onClose} className="tap" style={{ background: "rgba(255,255,255,0.12)", border: `1px solid ${C.border2}`, borderRadius: "50%", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: "40px" }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "28px" }}>
            {pages.map((_, i) => (<div key={i} onClick={() => setPage(i)} style={{ flex: i === page ? 3 : 1, height: "3px", borderRadius: "2px", backgroundColor: i === page ? C.gold : "rgba(255,255,255,0.15)", transition: "all 0.3s ease", cursor: "pointer" }}/>))}
          </div>
          <div style={{ color: C.gold, fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "8px", textTransform: "uppercase" }}>Guide {page + 1}/{pages.length}</div>
          <h2 style={{ color: C.t1, fontSize: "26px", fontWeight: "900", letterSpacing: "-0.8px", lineHeight: 1.2, marginBottom: "6px" }}>{currentPage.titre}</h2>
          <p style={{ color: C.t2, fontSize: "13px", marginBottom: "28px" }}>{currentPage.sous_titre}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
            {currentPage.contenu.map((item, i) => (
              <div key={i} style={{ backgroundColor: "rgba(17,17,24,0.85)", border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "14px 16px", display: "flex", gap: "14px", backdropFilter: "blur(8px)", animation: `fadeUp 0.25s ease ${i * 0.08}s both` }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, border: `1px solid ${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900", color: C.gold, flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "3px" }}>{item.label}</div>
                  <div style={{ color: C.t2, fontSize: "11px", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: page > 0 ? "1fr 2fr" : "1fr", gap: "10px" }}>
          {page > 0 && (<button onClick={() => setPage(p => p - 1)} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, color: C.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", cursor: "pointer" }}>Retour</button>)}
          <button onClick={() => page < pages.length - 1 ? setPage(p => p + 1) : onClose()} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "900", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", boxShadow: `0 4px 20px ${C.gold}40` }}>
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
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const demandes = rdvs.length;
  const confirmes = rdvs.filter(r => ["confirme", "effectue", "termine", "honore"].includes(r.statut)).length;
  const termines = rdvs.filter(r => ["effectue", "termine", "honore"].includes(r.statut)).length;
  const etapes = [
    { label: "Demandes RDV", value: demandes, color: C.gold, icon: "📅", desc: "Citoyens ayant soumis une demande de RDV", estime: false },
    { label: "RDV confirmés", value: confirmes, color: C.green, icon: "✅", desc: "Demandes acceptées et confirmées", estime: false },
    { label: "RDV terminés", value: termines, color: C.blue, icon: "🏁", desc: "Consultations effectivement réalisées", estime: false },
  ];
  const maxVal = Math.max(demandes, 1);
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${C.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Tunnel d'Acquisition" accent={C.blue} />
      <p style={{ color: C.t3, fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>Taux de transformation de vos demandes de RDV. Données réelles issues de votre activité.</p>
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
                    <span style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>{e.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {i > 0 && (<span style={{ color: convRate < 30 ? C.red : convRate < 60 ? C.orange : C.green, fontSize: "10px", fontWeight: "800", backgroundColor: convRate < 30 ? C.redL : convRate < 60 ? C.orangeL : C.greenL, padding: "1px 6px", borderRadius: "8px" }}>{convRate}%</span>)}
                      <span style={{ color: e.color, fontSize: "14px", fontWeight: "900" }}>{e.value.toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, backgroundColor: e.color, borderRadius: "3px" }}/>
                  </div>
                </div>
              </div>
              <div style={{ color: C.t3, fontSize: "10px", paddingLeft: "38px", marginBottom: "2px" }}>{e.desc}</div>
              {i < etapes.length - 1 && (<div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></div>)}
            </div>
          );
        })}
      </div>
      {demandes === 0 && (
        <div style={{ textAlign: "center", color: C.t3, fontSize: "11px", marginTop: "12px" }}>Aucune demande de RDV enregistrée pour l'instant.</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HEATMAP
// ═══════════════════════════════════════════════════════════════════════
function HeatmapActivite({ rdvs }: { rdvs: RDV[] }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const tranches = ["8h", "10h", "12h", "14h", "16h", "18h", "20h"];
  const matrice: number[][] = Array(7).fill(null).map(() => Array(7).fill(0));
  rdvs.forEach(r => {
    if (!r.heure_rdv) return;
    const d = parseLocalDate(r.date_rdv);
    const jourIdx = (d.getDay() + 6) % 7;
    const h = parseInt(r.heure_rdv.slice(0, 2));
    const trancheIdx = Math.min(Math.max(Math.floor((h - 8) / 2), 0), 6);
    matrice[jourIdx][trancheIdx]++;
  });
  const maxVal = Math.max(...matrice.flat(), 1);
  function getHeatColor(val: number): string {
    const pct = val / maxVal;
    if (pct === 0) return "rgba(255,255,255,0.04)";
    if (pct < 0.25) return `${C.blue}30`;
    if (pct < 0.5)  return `${C.gold}50`;
    if (pct < 0.75) return `${C.orange}70`;
    return C.red;
  }
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${C.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Heatmap d'Activité" accent={C.orange}/>
      <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px" }}>Intensité des RDV par jour et plage horaire</p>
      <div style={{ display: "flex", gap: "3px", marginBottom: "4px", paddingLeft: "32px" }}>
        {tranches.map(t => (<div key={t} style={{ flex: 1, textAlign: "center", color: C.t3, fontSize: "8px", fontWeight: "700" }}>{t}</div>))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {jours.map((jour, ji) => (
          <div key={jour} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <div style={{ width: "28px", color: C.t3, fontSize: "9px", fontWeight: "700", flexShrink: 0 }}>{jour}</div>
            {tranches.map((_, ti) => {
              const val = matrice[ji][ti];
              return (<div key={ti} style={{ flex: 1, height: "22px", borderRadius: "5px", backgroundColor: getHeatColor(val), display: "flex", alignItems: "center", justifyContent: "center" }}>{val > 0 && <span style={{ color: val / maxVal > 0.5 ? "#fff" : C.t2, fontSize: "8px", fontWeight: "800" }}>{val}</span>}</div>);
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", justifyContent: "flex-end" }}>
        <span style={{ color: C.t3, fontSize: "9px" }}>Faible</span>
        {["rgba(255,255,255,0.04)", `${C.blue}30`, `${C.gold}50`, `${C.orange}70`, C.red].map((c, i) => (<div key={i} style={{ width: "14px", height: "10px", borderRadius: "3px", backgroundColor: c }}/>))}
        <span style={{ color: C.t3, fontSize: "9px" }}>Élevé</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CARTE GÉOGRAPHIQUE
// ═══════════════════════════════════════════════════════════════════════
function CarteGeographique({ rdvs }: { rdvs: RDV[] }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const total = rdvs.length;
  const confirmes = rdvs.filter(r => ["confirme", "effectue", "termine", "honore"].includes(r.statut)).length;
  const taux = total > 0 ? Math.round((confirmes / total) * 100) : 0;
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${C.border}`, marginBottom: "14px" }}>
      <SectionHeader label="Zone de Chalandise" accent={C.teal}/>
      <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px" }}>Conakry, Guinée — Répartition géographique de vos clients</p>
      <div style={{ backgroundColor: C.bg3, borderRadius: "14px", padding: "4px", marginBottom: "14px" }}>
        <svg viewBox="0 0 120 90" style={{ width: "100%", height: "auto", display: "block" }}>
          <rect width="120" height="90" fill="#0d1420"/>
          <path d="M15,45 Q20,30 35,25 Q50,20 65,22 Q80,20 90,28 Q100,35 95,50 Q90,65 75,72 Q60,78 45,75 Q30,72 20,62 Q12,55 15,45Z" fill="#1a2035" stroke={`${C.teal}40`} strokeWidth="0.5"/>
          <path d="M35,55 Q38,50 42,52 Q48,55 45,62 Q40,68 35,65 Q30,60 35,55Z" fill="#1e2840" stroke={`${C.blue}50`} strokeWidth="0.4"/>
          <circle cx="60" cy="45" r={Math.min(Math.max(total * 0.6, 8), 28)} fill={`${C.gold}18`}/>
          <circle cx="60" cy="45" r={Math.min(Math.max(confirmes * 0.6, 5), 18)} fill={`${C.green}25`}/>
          <circle cx="60" cy="45" r="4" fill={C.gold}/>
          <text x="60" y="52" textAnchor="middle" fill={C.gold} fontSize="4" fontWeight="bold">Conakry</text>
          <text x="60" y="57" textAnchor="middle" fill={C.teal} fontSize="3.5">{total} RDV</text>
          <text x="5" y="8" fill={C.t3} fontSize="4" fontWeight="bold">GUINÉE · CONAKRY</text>
        </svg>
      </div>
      <div style={{ backgroundColor: `${C.teal}10`, border: `1px solid ${C.teal}20`, borderRadius: "10px", padding: "10px 12px", marginBottom: "12px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style={{ color: C.t3, fontSize: "10px", lineHeight: 1.5 }}>La répartition par quartier sera disponible lorsque les citoyens renseigneront leur adresse lors de l'inscription.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        {[
          { label: "Total RDV", value: total, color: C.gold },
          { label: "Confirmés", value: confirmes, color: C.green },
          { label: "Taux", value: `${taux}%`, color: C.teal },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <div style={{ color: s.color, fontSize: "18px", fontWeight: "900" }}>{s.value}</div>
            <div style={{ color: C.t3, fontSize: "9px", marginTop: "2px" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
        {[{ nom: "Conakry", pct: 100, count: total }].map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "20px", height: "20px", borderRadius: "6px", background: `linear-gradient(135deg, ${i === 0 ? C.gold : i === 1 ? C.orange : C.blue}30, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: i === 0 ? C.gold : i === 1 ? C.orange : C.blue, fontSize: "9px", fontWeight: "900" }}>{i + 1}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ color: C.t1, fontSize: "11px", fontWeight: "700" }}>{d.nom}</span>
                <span style={{ color: C.t2, fontSize: "11px" }}>{d.pct}% · {d.count} RDV</span>
              </div>
              <div style={{ height: "3px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "2px" }}>
                <div style={{ height: "100%", width: `${d.pct}%`, backgroundColor: i === 0 ? C.gold : i === 1 ? C.orange : C.blue, borderRadius: "2px" }}/>
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
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
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
    <div style={{ backgroundColor: C.bgCard, borderRadius: "18px", border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: "14px" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
        <SectionHeader label="Mes Clients — CRM" accent={C.purple}/>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "12px" }}>
          {[
            { label: "Total", value: clients.length, color: C.purple },
            { label: "Fidèles (3+)", value: clients.filter(c => c.nb_rdv >= 3).length, color: C.green },
            { label: "Nouveaux", value: clients.filter(c => c.est_nouveau).length, color: C.gold },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "8px", textAlign: "center" }}>
              <div style={{ color: s.color, fontSize: "18px", fontWeight: "900" }}>{s.value}</div>
              <div style={{ color: C.t3, fontSize: "9px" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "0 12px", display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client…" style={{ flex: 1, padding: "10px 0", fontSize: "13px" }}/>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {[{ key: "recents", label: "Récents" }, { key: "fideles", label: "Fidèles" }, { key: "nouveaux", label: "Nouveaux" }].map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key as any)} className="tap" style={{ flex: 1, backgroundColor: sortBy === s.key ? `${C.purple}20` : "transparent", border: `1px solid ${sortBy === s.key ? C.purple + "40" : C.border}`, borderRadius: "8px", padding: "6px", color: sortBy === s.key ? C.purple : C.t3, fontSize: "10px", fontWeight: "700", cursor: "pointer" }}>{s.label}</button>
          ))}
        </div>
      </div>
      <div style={{ maxHeight: "340px", overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: C.t3, fontSize: "12px" }}>Aucun client trouvé</div>
        ) : filtered.map((c) => (
          <div key={c.id} onClick={() => { setSelectedClient(c); setNoteText(c.note_privee || ""); }} className="tap" style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", backgroundColor: selectedClient?.id === c.id ? `${C.purple}08` : "transparent" }}>
            <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: `linear-gradient(135deg, ${C.purple}30, ${C.purple}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "900", color: C.purple, flexShrink: 0, position: "relative" }}>
              {c.nom.slice(0, 2).toUpperCase()}
              {c.est_nouveau && <div style={{ position: "absolute", top: "-2px", right: "-2px", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: C.gold, border: `1.5px solid ${C.bg}` }}/>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ color: C.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</span>
                {c.nb_rdv >= 5 && <span style={{ backgroundColor: `${C.gold}20`, color: C.gold, fontSize: "8px", fontWeight: "800", padding: "1px 5px", borderRadius: "6px", flexShrink: 0 }}>VIP</span>}
              </div>
              <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{c.nb_rdv} RDV · Dernier : {timeAgo(c.dernier_rdv)}</div>
              {c.note_privee && <div style={{ color: C.t2, fontSize: "10px", fontStyle: "italic", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{c.note_privee}"</div>}
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        ))}
      </div>
      {selectedClient && (
        <div style={{ borderTop: `1px solid ${C.border2}`, padding: "16px", backgroundColor: C.bgCard2, animation: "fadeUp 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: `linear-gradient(135deg, ${C.purple}30, ${C.purple}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "900", color: C.purple }}>
                {selectedClient.nom.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800" }}>{selectedClient.nom}</div>
                <div style={{ color: C.t3, fontSize: "11px" }}>{selectedClient.phone}</div>
              </div>
            </div>
            <button onClick={() => setSelectedClient(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
            {[
              { label: "RDV total", value: selectedClient.nb_rdv, color: C.purple },
              { label: "Client depuis", value: timeAgo(selectedClient.premiere_visite), color: C.blue },
              { label: "Statut", value: selectedClient.est_nouveau ? "Nouveau" : "Régulier", color: C.green },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 10px", textAlign: "center" }}>
                <div style={{ color: s.color, fontSize: "13px", fontWeight: "900", lineHeight: 1.2 }}>{s.value}</div>
                <div style={{ color: C.t3, fontSize: "9px", marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: "10px" }}>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Note privée (visible uniquement par vous)</div>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Ex: Préfère les RDV le matin, client régulier depuis janvier..." rows={3} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: C.t1 }}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <a href={`tel:${selectedClient.phone}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t1, fontSize: "12px", fontWeight: "700", padding: "11px", borderRadius: "10px", textDecoration: "none" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Appeler
            </a>
            <button onClick={saveNote} disabled={savingNote} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: `linear-gradient(135deg, ${C.purple}, #7a55d0)`, color: "#fff", fontSize: "12px", fontWeight: "800", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: savingNote ? 0.6 : 1 }}>
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
function ScoreSante({ score, stats, actionsPrioritaires, onVoirActions }: { score: number; stats: Stats; actionsPrioritaires?: number; onVoirActions?: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const color = score >= 80 ? C.green : score >= 60 ? C.gold : score >= 40 ? C.orange : C.red;
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Bon" : score >= 40 ? "À améliorer" : "Critique";
  const facteurs = [
    { label: "Taux de confirmation", value: stats.taux_confirmation, color: C.green },
    { label: "Satisfaction clients", value: stats.taux_satisfaction, color: C.gold },
    { label: "Réactivité (RDV/sem)", value: Math.min(stats.week * 10, 100), color: C.blue },
    { label: "Absence de refus", value: Math.max(0, 100 - stats.ratio_refus * 10), color: C.blue },
  ];
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${color}25`, marginBottom: "20px", boxShadow: C.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
        <div style={{ position: "relative", width: "100px", height: "100px", flexShrink: 0 }}>
          <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${(score/100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)" }}/>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color, fontSize: "30px", fontWeight: "900", lineHeight: 1 }}><AnimatedNumber value={score}/></span>
            <span style={{ color: C.t3, fontSize: "9px", fontWeight: "700" }}>/100</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="yelen-h2" style={{ color: C.t1, marginBottom: "3px" }}>Score de Santé</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${color}15`, color, fontSize: "11px", fontWeight: "800", padding: "3px 10px", borderRadius: "20px" }}>{label}</div>
          <div style={{ color: C.t3, fontSize: "10px", marginTop: "6px" }}>
            {score >= 80 ? "Votre établissement performe excellemment. Continuez !" : score >= 60 ? "Bon niveau. Quelques ajustements pour atteindre l'excellence." : "Des actions sont nécessaires pour améliorer votre performance."}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {facteurs.map(f => (
          <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: C.t3, fontSize: "10px", width: "140px", flexShrink: 0 }}>{f.label}</span>
            <div style={{ flex: 1, height: "4px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${f.value}%`, backgroundColor: f.color, borderRadius: "2px" }}/>
            </div>
            <span style={{ color: f.color, fontSize: "11px", fontWeight: "800", width: "32px", textAlign: "right" }}>{Math.round(f.value)}%</span>
          </div>
        ))}
      </div>
      {!!actionsPrioritaires && actionsPrioritaires > 0 && (
        <div style={{ marginTop: "16px", backgroundColor: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: "14px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
          <span style={{ color: C.red, fontSize: "12px", fontWeight: "800", flex: 1 }}>{actionsPrioritaires} action{actionsPrioritaires > 1 ? "s" : ""} prioritaire{actionsPrioritaires > 1 ? "s" : ""} requise{actionsPrioritaires > 1 ? "s" : ""}</span>
          {onVoirActions && (
            <button onClick={onVoirActions} className="tap" style={{ backgroundColor: C.red, color: "#fff", fontSize: "11px", fontWeight: "800", padding: "7px 14px", borderRadius: "10px", border: "none", cursor: "pointer", flexShrink: 0 }}>Voir les actions</button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OBJECTIFS HEBDOMADAIRES
// ═══════════════════════════════════════════════════════════════════════
function ObjectifsHebdo({ stats }: { stats: Stats }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const objectifs = [
    { label: "RDV cette semaine", actuel: stats.week, cible: Math.max(stats.week + 3, 10), color: C.blue, icon: "📅" },
    { label: "Taux de confirmation", actuel: stats.taux_confirmation, cible: 80, color: C.green, icon: "✅", unite: "%" },
    { label: "Score satisfaction", actuel: stats.taux_satisfaction, cible: 85, color: C.gold, icon: "⭐", unite: "%" },
  ];
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${C.border}`, marginBottom: "20px", boxShadow: C.shadow }}>
      <SectionHeader label="Objectifs de la semaine" accent={C.blue}/>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {objectifs.map((obj, i) => {
          const pct = Math.min((obj.actuel / obj.cible) * 100, 100);
          const atteint = pct >= 100;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: atteint ? C.greenL : C.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 }}>{atteint ? "✓" : obj.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: atteint ? C.green : C.t2, fontSize: "11px", fontWeight: atteint ? "800" : "600" }}>{obj.label}</span>
                  <span style={{ color: obj.color, fontSize: "11px", fontWeight: "800" }}>{obj.actuel}{obj.unite || ""} / {obj.cible}{obj.unite || ""}</span>
                </div>
                <div style={{ height: "4px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, backgroundColor: atteint ? C.green : obj.color, borderRadius: "2px" }}/>
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
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{ position: "fixed", bottom: "80px", right: "14px", zIndex: 300 }}>
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.gold}30`, borderRadius: "16px", padding: "10px 12px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", maxWidth: "200px", animation: "fadeUp 0.3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.green, animation: "ping 2s ease-out infinite" }}/>
            <span style={{ color: C.gold, fontSize: "10px", fontWeight: "800" }}>Support Yelen</span>
          </div>
          <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p style={{ color: C.t2, fontSize: "10px", lineHeight: 1.5, marginBottom: "8px" }}>Notre équipe est disponible 7j/7 pour vous aider.</p>
        <a href="mailto:support@yelen224.com" style={{ display: "flex", alignItems: "center", gap: "5px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontSize: "10px", fontWeight: "800", padding: "7px 10px", borderRadius: "8px", textDecoration: "none" }}>
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
function ScannerModal({ institutionId, onClose }: { institutionId: string; onClose: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [phase, setPhase] = useState<"scan" | "result" | "done" | "error">("scan");
  // Sous-phases de "scan" — remplace l'UI par défaut (anglaise, générique)
  // de Html5QrcodeScanner par un écran Yelen (français, doré), demandé par
  // Bryan le 20/07/2026. Html5Qrcode (classe bas niveau) ne génère aucune
  // UI propre — on construit nous-mêmes l'écran "avant autorisation".
  const [camPhase, setCamPhase] = useState<"avant" | "demarrage" | "actif" | "refuse">("avant");
  const [scanResult, setScanResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const html5QrRef = useRef<Html5Qrcode | null>(null);

  async function traiterCode(decodedText: string) {
    try {
      const storedId = localStorage.getItem("yelen224_institution_id") || institutionId;
      const res = await fetch("/api/qr/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qr_payload: decodedText, institution_id: storedId }) });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || "QR invalide"); setPhase("error"); return; }
      setScanResult(data);
      setPhase("result");
    } catch { setErrorMsg("Erreur réseau"); setPhase("error"); }
  }

  // stop() de html5-qrcode lève une exception SYNCHRONE ("Cannot stop,
  // scanner is not running or paused.") quand le scan n'est pas actif —
  // un simple .catch() ne l'attrape jamais puisque le throw a lieu avant
  // qu'une Promise existe à chaîner. D'où ce garde-fou sur isScanning.
  function arreterCameraSiActive(html5QrCode: Html5Qrcode | null) {
    if (!html5QrCode?.isScanning) return;
    try { html5QrCode.stop().catch(() => {}); } catch {}
  }

  async function demarrerCamera() {
    setCamPhase("demarrage");
    try {
      const html5QrCode = new Html5Qrcode("qr-reader-modal");
      html5QrRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText: string) => {
          arreterCameraSiActive(html5QrCode);
          void traiterCode(decodedText);
        },
        () => {},
      );
      setCamPhase("actif");
    } catch {
      setCamPhase("refuse");
    }
  }

  useEffect(() => {
    return () => { arreterCameraSiActive(html5QrRef.current); };
  }, []);

  async function confirmer() {
    if (!scanResult?.rdv) return;
    setConfirming(true);
    try {
      await fetch("/api/qr/validate", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rdv_id: scanResult.rdv.id, action: "present", institution_id: institutionId }) });
      setPhase("done");
    } catch { setErrorMsg("Erreur"); setPhase("error"); } finally { setConfirming(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "18px", fontWeight: "900" }}>Scanner le Client</div>
            <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>QR Code du citoyen</div>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {phase === "scan" && (
          <div>
            {/* Le conteneur doit déjà avoir des dimensions réelles (pas display:none)
                dès l'appel à Html5Qrcode.start() en phase "demarrage" — sur iOS Safari,
                attacher/lire un flux caméra dans un élément caché fait échouer start()
                silencieusement (rejeté comme une erreur générique, à tort affichée comme
                un refus de permission alors qu'aucun prompt n'a même pu s'afficher). */}
            <div style={{ position: "relative", display: (camPhase === "actif" || camPhase === "demarrage") ? "block" : "none" }}>
              <div id="qr-reader-modal" style={{ borderRadius: "16px", overflow: "hidden", backgroundColor: C.bg3, minHeight: "260px" }}/>
              {camPhase === "demarrage" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px", textAlign: "center" }}>
                  <div style={{ width: "36px", height: "36px", border: `3px solid ${C.gold}25`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }}/>
                  <div style={{ color: C.t2, fontSize: "13px", fontWeight: "700" }}>Ouverture de la caméra…</div>
                </div>
              )}
            </div>
            {camPhase === "avant" && (
              <div style={{ textAlign: "center", padding: "28px 12px" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "18px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Scanner le QR code Yelen du citoyen</div>
                <div style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, marginBottom: "20px" }}>Yelen a besoin d'accéder à votre caméra pour lire le code présenté par le citoyen à son arrivée.</div>
                <button onClick={demarrerCamera} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer" }}>
                  Activer la caméra
                </button>
              </div>
            )}
            {camPhase === "refuse" && (
              <div style={{ textAlign: "center", padding: "28px 12px" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "18px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                </div>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Accès à la caméra impossible</div>
                <div style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, marginBottom: "20px" }}>Autorisez la caméra pour Yelen224 dans les réglages de votre navigateur, puis réessayez.</div>
                <button onClick={demarrerCamera} className="tap" style={{ width: "100%", backgroundColor: C.bg3, color: C.t1, fontWeight: "700", fontSize: "13px", padding: "13px", borderRadius: "14px", border: `1px solid ${C.border}`, cursor: "pointer" }}>
                  Réessayer
                </button>
              </div>
            )}
          </div>
        )}
        {phase === "result" && scanResult?.rdv && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={{ backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "12px", padding: "10px 14px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ color: C.green, fontSize: "12px", fontWeight: "800" }}>QR valide</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "13px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: C.gold }}>
                {(scanResult.rdv.citoyen_nom || "C")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800" }}>{scanResult.rdv.citoyen_nom}</div>
                <div style={{ color: C.t3, fontSize: "11px" }}>{scanResult.rdv.objet || "RDV général"} · {formatDate(scanResult.rdv.date_rdv, { day: "numeric", month: "short" })}</div>
              </div>
            </div>
            <div>
              <button onClick={() => confirmer()} disabled={confirming} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${C.green}, #009e76)`, color: "#fff", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "14px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                {confirming ? "Confirmation..." : "Confirmer la présence"}
              </button>
              <p style={{ color: C.t3, fontSize: "10px", textAlign: "center", marginTop: "8px" }}>Pour marquer un client absent, utilisez la liste RDV.</p>
            </div>
          </div>
        )}
        {phase === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "50%", backgroundColor: C.greenL, border: `2px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ color: C.green, fontSize: "16px", fontWeight: "900", marginBottom: "4px" }}>Présence confirmée</div>
            <div style={{ color: C.t3, fontSize: "11px", marginBottom: "20px" }}>Le RDV reste "Confirmé" pendant la prestation — revenez à la liste RDV pour le marquer terminé une fois achevé.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setPhase("scan"); setScanResult(null); }} className="tap" style={{ flex: 1, backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t1, fontWeight: "700", fontSize: "13px", padding: "12px", borderRadius: "12px", cursor: "pointer" }}>Scanner suivant</button>
                <button onClick={onClose} className="tap" style={{ flex: 1, background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Fermer</button>
              </div>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "50%", backgroundColor: C.redL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <div style={{ color: C.red, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>QR invalide</div>
            <div style={{ color: C.t2, fontSize: "12px", marginBottom: "20px" }}>{errorMsg}</div>
            <button onClick={() => { setPhase("scan"); setErrorMsg(""); }} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "14px", padding: "12px 32px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Réessayer</button>
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
  const { theme, mode, setMode } = useTheme();
  const C = T[theme] as ThemeTokens;
  const params  = useParams();
  const router  = useRouter();
  const rawId   = params?.id;
  const instId  = Array.isArray(rawId) ? rawId[0] : rawId ?? "";

  const [inst, setInst]             = useState<Institution | null>(null);
  const [rdvs, setRdvs]             = useState<RDV[]>([]);
  const [avis, setAvis]             = useState<AvisItem[]>([]);
  const [clients, setClients]       = useState<Client[]>([]);
  // Fail-closed : null tant que le rôle n'est pas connu (chargement, ou
  // échec de fetch) — jamais un défaut permissif. isAdmin dérivé conservé
  // pour les usages existants (rdv-historique preload, etc.), le nouveau
  // code doit préférer canAccessTab(membreRole, ...)/can(membreRole, ...).
  const [membreRole, setMembreRole] = useState<MembreRole | null>(null);
  const isAdmin = membreRole === "admin";
  const [stats, setStats]           = useState<Stats>({
    today: 0, week: 0, month: 0, pending: 0, confirmed: 0, done: 0, cancelled: 0, nouveau: 0, absents: 0,
    avis_count: 0, moyenne_avis: 0, avis_non_lus: 0,
    taux_confirmation: 0, taux_annulation: 0, taux_satisfaction: 0, rdv_total: 0,
    evolution_week: 0, evolution_month: 0, peak_hour: "—", peak_day: "—",
    rdv_par_jour: [], rdv_par_heure: [], notes_distribution: [], recent_activity: [],
    ratio_refus: 0, compte_restreint: false, score_sante: 0,
    kpi_variations: { nouveau: 0, pending: 0, confirmed: 0, done: 0, cancelled: 0, total: 0 },
  });

  // Nouvelle structure de menu (chantier réorganisation dashboard) : "demandes"
  // fusionné dans "rdv" (Lot 2, filtre par statut "Nouveaux"). "disponibilites",
  // "services", "communication" et "scanner" sont de nouveaux onglets de
  // premier niveau (contenu réel ajouté lots suivants — squelette pour l'instant).
  const [tab, setTab] = useState<DashboardTab>("accueil");
  const [messagerieUnread, setMessagerieUnread] = useState(0);
  const [questionsNonRepondues, setQuestionsNonRepondues] = useState(0);
  const [messagerieCitoyenInitial, setMessagerieCitoyenInitial] = useState<string | null>(null);
  function ouvrirMessagerieClient(citoyenId: string) {
    setMessagerieCitoyenInitial(citoyenId);
    setTab("messagerie");
  }
  const [etapeValidation, setEtapeValidation] = useState<"conditions" | "celebration" | null>(null);
  const [acceptingConditions, setAcceptingConditions] = useState(false);
  const etapeValidationInitRef = useRef(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [navScrollable, setNavScrollable] = useState(false);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [refreshing, setRefreshing]         = useState(false);
  const [lastUpdated, setLastUpdated]       = useState<Date | null>(null);
  const [showScanner, setShowScanner]       = useState(false);
  const [showGuide, setShowGuide]           = useState(false);
  // Lot C (refonte cycle de vie RDV, 16/07/2026) — "Prendre en charge" :
  // préremplit Valider un RDV payant (au lieu de retaper le code), ou affiche
  // le dialogue de blocage exact du CEO si hors créneau (jamais un simple
  // toast — la règle ne doit laisser aucune ambiguïté sur pourquoi c'est bloqué).
  const [preloadBookingId, setPreloadBookingId] = useState<string | null>(null);
  const [horsCreneauDialog, setHorsCreneauDialog] = useState(false);
  const [termineDialog, setTermineDialog] = useState<RDV | null>(null);
  const [selectedRDV, setSelectedRDV]       = useState<RDV | null>(null);
  const [rdvHistorique, setRdvHistorique]   = useState<{ id: string; action: string; membre_nom: string; created_at: string }[]>([]);
  const [rdvEvents, setRdvEvents]           = useState<{ id: string; auteur_type: string; action: string; motif: string | null; created_at: string }[]>([]);
  const [actionLoading, setActionLoading]   = useState<string | null>(null);
  const [toast, setToast]                   = useState<{ msg: string; color: string } | null>(null);
  const [logoutOpen, setLogoutOpen]         = useState(false);
  const [rdvFilter, setRdvFilter]           = useState("tous");
  const [rdvSearch, setRdvSearch]           = useState("");
  const [rdvDateFilter, setRdvDateFilter]   = useState("");
  const [rdvServiceFilter, setRdvServiceFilter] = useState("");
  const [rdvSort, setRdvSort]               = useState<"prochain" | "recent" | "ancien">("prochain");
  const [rdvPage, setRdvPage]               = useState(1);
  const [rdvPageSize, setRdvPageSize]       = useState(10);
  const [rdvFiltersOpen, setRdvFiltersOpen] = useState(false);
  const [rdvMenuOpenId, setRdvMenuOpenId]   = useState<string | null>(null);
  const [guichetDraft, setGuichetDraft]     = useState("");
  const [savingGuichet, setSavingGuichet]   = useState(false);
  const [analyseTab, setAnalyseTab]         = useState<"tunnel" | "heatmap" | "geo" | "crm">("tunnel");
  const [bannerRdv, setBannerRdv]           = useState<RDV | null>(null);
  const [showBannerDetail, setShowBannerDetail] = useState(false);
  const [dismissRetard, setDismissRetard]   = useState(false);
  const lastRdvCountRef                     = useRef(0);

  // ── Header : popovers (recherche, "...", feedback, aide, RDV entrant) ──
  const [activePopover, setActivePopover]   = useState<"search" | "system" | "feedback" | "help" | "rdv" | "notifications" | "questions" | null>(null);
  const [institutionNotifs, setInstitutionNotifs] = useState<{ id: string; titre: string; message: string; lu: boolean; rdv_id: string | null; created_at: string }[]>([]);
  const [ongletNotif, setOngletNotif] = useState<"utilisateur" | "systeme">("utilisateur");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecte" | "reconnexion" | "hors_ligne">("reconnexion");
  const [searchQuery, setSearchQuery]       = useState("");
  const [feedbackType, setFeedbackType]     = useState<"bug" | "suggestion" | "ux" | "fonctionnalite">("bug");
  const [feedbackMsg, setFeedbackMsg]       = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const searchRef                           = useRef<HTMLDivElement>(null);
  const searchPanelRef                      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activePopover !== "search") return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = searchRef.current && searchRef.current.contains(target);
      const insidePanel = searchPanelRef.current && searchPanelRef.current.contains(target);
      if (!insideTrigger && !insidePanel) setActivePopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activePopover]);

  async function envoyerFeedback() {
    if (!feedbackMsg.trim()) return;
    setFeedbackSending(true);
    const res = await fetch("/api/institution/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: feedbackType, message: feedbackMsg }),
    });
    setFeedbackSending(false);
    if (!res.ok) { showToast("Erreur d'envoi", C.red); return; }
    setFeedbackMsg("");
    setActivePopover(null);
    showToast("Merci pour votre retour !", C.green);
  }

  // RBAC Enterprise (5 rôles) : /api/institution/membres renvoie 200 à
  // tout membre authentifié (liste allégée pour les non-admins/non-lecteurs)
  // — on ne peut donc pas se fier au code HTTP, on lit le champ `role`
  // renvoyé par la route (vérifié côté serveur via getAuthenticatedMembre,
  // pas de source de vérité côté client). Ce filtrage de nav ne fait que
  // masquer le bouton — la vraie barrière est dans chaque route API
  // (lib/institutionPermissions.ts can()/canAccessTab(), voir Phase D du
  // chantier RBAC : services, disponibilites, profile, documents, upload,
  // responsable, auth/deletion/*, rdv*, agenda, annonces, messages, notes,
  // notes-client, projets, paid-bookings).
  useEffect(() => {
    if (!instId) return;
    fetch("/api/institution/membres")
      .then(res => res.ok ? res.json() : null)
      .then(j => setMembreRole(isMembreRole(j?.role) ? j.role : null))
      .catch(() => setMembreRole(null));
  }, [instId]);

  // Déclenche la séquence conditions prestataire + célébration une
  // seule fois, au premier chargement de `inst` — le ref empêche un
  // rechargement ultérieur de `inst` (loadData périodique) de rouvrir
  // le modal après que l'utilisateur l'a déjà traité dans cette session.
  useEffect(() => {
    if (etapeValidationInitRef.current || !inst) return;
    etapeValidationInitRef.current = true;
    if (inst.statut === "validee" && !inst.conditions_prestataire_acceptees_le) {
      setEtapeValidation("conditions");
    }
  }, [inst]);

  async function accepterConditionsPrestataire() {
    setAcceptingConditions(true);
    const res = await fetch("/api/institution/conditions-prestataire", { method: "POST" });
    setAcceptingConditions(false);
    if (!res.ok) { showToast("Erreur, réessayez.", C.red); return; }
    setInst(prev => prev ? { ...prev, conditions_prestataire_acceptees_le: new Date().toISOString() } : prev);
    setEtapeValidation("celebration");
  }

  const showToast = useCallback((msg: string, color: string = C.green) => setToast({ msg, color }), [C.green]);

  function exportCsv() {
    const termines = rdvs.filter(r => ["effectue", "termine", "honore", "annule"].includes(r.statut));
    if (!termines.length) { showToast("Aucun RDV à exporter", C.orange); return; }
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
    showToast(`${termines.length} RDV exportés`, C.green);
  }

  // ── Actions RDV ──
  // Les 4 actions RDV passent désormais par une route serveur sécurisée
  // (app/api/institution/rdv/statut) au lieu d'un update Supabase direct
  // depuis le navigateur — corrige l'absence de policy RLS institution sur
  // `rdv` et journalise chaque action (migration 20260715000001).
  async function updateRdvStatut(rdvId: string, statut: "en_attente" | "annule" | "termine" | "absent", motif?: string) {
    const res = await fetch("/api/institution/rdv/statut", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rdv_id: rdvId, statut, motif: motif || null }),
    });
    if (res.ok) return { ok: true as const };
    const json = await res.json().catch(() => null);
    return { ok: false as const, error: typeof json?.error === "string" ? json.error : "Erreur" };
  }

  async function handleAccept(rdvId: string) {
    setActionLoading(rdvId);
    try {
      const res = await updateRdvStatut(rdvId, "en_attente");
      if (!res.ok) { showToast(res.error, C.red); return; }
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "en_attente" } : r));
      setSelectedRDV(null);
      setBannerRdv(null);
      setShowBannerDetail(false);
      showToast("RDV accepté — en attente du jour J", C.green);
    } catch { showToast("Erreur", C.red); } finally { setActionLoading(null); }
  }

  async function handleRefuse(rdvId: string, motif?: string) {
    setActionLoading(rdvId);
    try {
      const res = await updateRdvStatut(rdvId, "annule", motif);
      if (!res.ok) { showToast(res.error, C.red); return; }
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "annule", motif_annulation: motif || undefined } : r));
      setSelectedRDV(null);
      setBannerRdv(null);
      setShowBannerDetail(false);
      showToast("RDV refusé", C.orange);
    } catch { showToast("Erreur", C.red); } finally { setActionLoading(null); }
  }

  // Lot C — unique point d'entrée vers la confirmation de présence, qu'un
  // RDV soit gratuit (scanner) ou payant (validation code préremplie).
  // Vérification client immédiate (défense en profondeur, la vraie garantie
  // est déjà côté serveur — Lots A/B).
  function handlePrendreEnCharge(r: RDV) {
    if (!creneauEstOuvert(r.date_rdv, r.heure_rdv)) { setHorsCreneauDialog(true); return; }
    if (r.est_payant && r.booking_payant_id) {
      setPreloadBookingId(r.booking_payant_id);
      setTab("valider-rdv");
    } else {
      setShowScanner(true);
    }
  }

  async function handleTermine(rdvId: string) {
    setActionLoading(rdvId);
    try {
      const res = await updateRdvStatut(rdvId, "termine");
      if (!res.ok) { showToast(res.error, C.red); return; }
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut: "termine", termine_at: new Date().toISOString() } : r));
      setSelectedRDV(null);
      showToast("RDV marqué comme terminé", C.purple);
    } catch { showToast("Erreur", C.red); } finally { setActionLoading(null); }
  }

  async function handleAbsent(rdvId: string) {
    setActionLoading(rdvId);
    try {
      const res = await updateRdvStatut(rdvId, "absent");
      if (!res.ok) { showToast(res.error, C.red); return; }
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, presence_status: "absent", presence_confirmed_at: new Date().toISOString() } : r));
      setSelectedRDV(null);
      showToast("Client marqué absent", C.orange);
    } catch { showToast("Erreur", C.red); } finally { setActionLoading(null); }
  }

  async function ouvrirNotifications() {
    setActivePopover("notifications");
    if (institutionNotifs.some(n => !n.lu)) {
      setInstitutionNotifs(prev => prev.map(n => ({ ...n, lu: true })));
      await fetch("/api/institution/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    }
  }

  function handleClickNotif(n: { rdv_id: string | null }) {
    if (n.rdv_id) setTab("rdv");
    setActivePopover(null);
  }

  async function handleSaveGuichet() {
    if (!selectedRDV) return;
    setSavingGuichet(true);
    try {
      const res = await fetch("/api/institution/rdv/guichet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rdv_id: selectedRDV.id, guichet: guichetDraft }),
      });
      if (!res.ok) { showToast("Erreur", C.red); return; }
      const guichetFinal = guichetDraft.trim() || undefined;
      setRdvs(prev => prev.map(r => r.id === selectedRDV.id ? { ...r, guichet: guichetFinal } : r));
      setSelectedRDV(prev => prev ? { ...prev, guichet: guichetFinal } : prev);
      showToast("Guichet enregistré", C.purple);
    } finally { setSavingGuichet(false); }
  }

  async function saveClientNote(clientId: string, note: string) {
    try {
      localStorage.setItem(`yelen224_note_${instId}_${clientId}`, note);
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, note_privee: note } : c));
      showToast("Note sauvegardée", C.purple);
    } catch { showToast("Erreur sauvegarde", C.red); }
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
      if (instRes.status === 401) {
        // Session JWT expirée (8h) ou absente — avant, ce cas échouait
        // silencieusement (données vides affichées comme si l'institution
        // n'avait aucune donnée). On redirige explicitement vers la
        // reconnexion, qui propose le déverrouillage rapide (PIN/biométrie)
        // si l'appareil est mémorisé plutôt que de resaisir l'OTP.
        router.push("/institution/connexion?expired=1");
        return;
      }
      const instJson = instRes.ok ? await instRes.json() : null;
      const instData = instJson?.institution;
      if (instData) setInst(instData as Institution);
      localStorage.setItem("yelen224_institution_id", instId);

      const notifRes = await fetch(`/api/institution/notifications`);
      const notifJson = notifRes.ok ? await notifRes.json().catch(() => null) : null;
      setInstitutionNotifs(notifJson?.notifications ?? []);

      const rdvRes = await fetch(`/api/institution/rdv`);
      const rdvJson = rdvRes.ok ? await rdvRes.json().catch(() => null) : null;
      if (!rdvRes.ok) console.error("[Yelen] RDV fetch error:", rdvJson?.error);
      const rdvRaw = rdvJson?.rdvs ?? [];

      let rdvList: RDV[] = [];
      if (rdvRaw.length) {
        rdvList = rdvRaw;

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

      const avisRaw = rdvJson?.avis ?? [];

      let avisList: AvisItem[] = [];
      if (avisRaw.length) {
        const sevenD = new Date();
        sevenD.setDate(sevenD.getDate() - 7);

        avisList = avisRaw.map((a: any) => ({
          id: a.id,
          note: a.note,
          commentaire: a.commentaire,
          created_at: a.created_at,
          citoyen_nom: a.citoyen_nom || "Citoyen",
          rdv_confirmed: a.rdv_confirmed,
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
      const pending   = rdvList.filter(r => r.statut === "en_attente" && r.presence_status !== "absent").length;
      const confirmed = rdvList.filter(r => r.statut === "confirme").length;
      const done      = rdvList.filter(r => ["effectue", "termine", "honore"].includes(r.statut)).length;
      const cancelled = rdvList.filter(r => r.statut === "annule").length;
      const nouveau   = rdvList.filter(r => r.statut === "nouveau").length;
      const absents   = rdvList.filter(r => r.presence_status === "absent").length;
      const total     = rdvList.length;

      // Variations "vs hier" par catégorie pour les KPI de Vue d'ensemble —
      // basé sur date_rdv (même convention que todayN ci-dessus), pas de
      // colonne de timestamp par changement de statut pour toutes les
      // catégories donc c'est le proxy le plus honnête avec les données
      // réelles disponibles : compte du jour vs compte de la veille, sur
      // le statut actuel de chaque RDV programmé ce jour-là.
      const hierStr = dayAgo.toISOString().slice(0, 10);
      const variationVsHier = (filtre: (r: typeof rdvList[number]) => boolean): number => {
        const auj = rdvList.filter(r => r.date_rdv === today && filtre(r)).length;
        const hierN = rdvList.filter(r => r.date_rdv === hierStr && filtre(r)).length;
        return hierN > 0 ? Math.round(((auj - hierN) / hierN) * 100) : (auj > 0 ? 100 : 0);
      };
      const kpiVariations = {
        nouveau:   variationVsHier(r => r.statut === "nouveau"),
        pending:   variationVsHier(r => r.statut === "en_attente" && r.presence_status !== "absent"),
        confirmed: variationVsHier(r => r.statut === "confirme"),
        done:      variationVsHier(r => ["effectue", "termine", "honore"].includes(r.statut)),
        cancelled: variationVsHier(r => r.statut === "annule"),
        total:     variationVsHier(() => true),
      };

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
      rdvList.forEach(r => { const d = parseLocalDate(r.date_rdv).toLocaleDateString("fr-FR", { weekday: "long" }); dayMap[d] = (dayMap[d] || 0) + 1; });
      const peakDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      const notesDist = [5, 4, 3, 2, 1].map(n => {
        const count = avisList.filter(a => Math.round(a.note) === n).length;
        return { note: n, count, pct: avisList.length > 0 ? (count / avisList.length) * 100 : 0 };
      });

      const recentActivity = [
        ...avisList.slice(0, 3).map(a => ({ type: "avis", label: `Avis ${a.note}/5 de ${a.citoyen_nom}`, time: timeAgo(a.created_at), color: C.gold })),
        ...rdvList.filter(r => r.statut === "confirme").slice(0, 3).map(r => ({ type: "rdv", label: `RDV confirmé — ${r.citoyen_nom}`, time: timeAgo(r.date_rdv), color: C.green })),
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
        kpi_variations: kpiVariations,
      });
      setLastUpdated(new Date());

      // Badge "Messagerie" (sidebar) — non-bloquant, comme le reste des
      // compteurs annexes : une erreur ici ne doit jamais casser le
      // chargement du dashboard. Hérite du même cycle que loadData()
      // (montage, 30s, bouton Actualiser) plutôt qu'un intervalle séparé —
      // c'est exactement ce qui manquait au Journal d'activité avant son
      // correctif du 18/07/2026 (voir CLAUDE.md /chantier-journal-activite).
      try {
        const [msgRes, yelenRes] = await Promise.all([
          fetch("/api/institution/messages"),
          fetch("/api/institution/messagerie-yelen?compte=1"),
        ]);
        const msgJson = msgRes.ok ? await msgRes.json().catch(() => null) : null;
        const yelenJson = yelenRes.ok ? await yelenRes.json().catch(() => null) : null;
        setMessagerieUnread((msgJson?.total_non_lus ?? 0) + (yelenJson?.non_lus ?? 0));
      } catch {}

      // Badge "Questions clients" (icône en-tête dédiée) — strictement
      // séparé de messagerieUnread ci-dessus, ne touche jamais la table
      // messages ni MessagerieTab.
      try {
        const qRes = await fetch("/api/institution/questions?compte=1");
        const qJson = qRes.ok ? await qRes.json().catch(() => null) : null;
        setQuestionsNonRepondues(qJson?.non_repondues ?? 0);
      } catch {}

    } catch (e: any) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId]);

  useEffect(() => { loadData(); }, [loadData]);
  // Auto-refresh — complète le temps réel (postgres_changes) par un filet de
  // sécurité périodique, au cas où une reconnexion Realtime serait manquée.
  useEffect(() => {
    const interval = setInterval(() => loadData(), 30000);
    return () => clearInterval(interval);
  }, [loadData]);
  // Historique d'heures d'action (accepté/refusé/terminé/absent) pour le RDV
  // ouvert — journal_activite est déjà alimenté par chaque action (route
  // /api/institution/rdv/statut), simplement jamais affiché jusqu'ici.
  // Réservé aux rôles ayant accès au Journal (admin/superviseur/dirigeant) —
  // la route /api/institution/journal l'exige déjà côté serveur.
  useEffect(() => {
    if (!selectedRDV || !tabAllowed(membreRole, "journal")) { setRdvHistorique([]); return; }
    (async () => {
      const res = await fetch(`/api/institution/journal?cible_ids=${selectedRDV.id}&limit=10`);
      const j = await res.json().catch(() => null);
      setRdvHistorique(res.ok ? (j?.entrees ?? []) : []);
    })();
  }, [selectedRDV?.id, membreRole]);
  // Actions du citoyen (report/annulation/confirmation) — rdv_events,
  // distinct de journal_activite (actions du personnel). Accessible à tout
  // membre authentifié, pas seulement admin (cf. route events/route.ts).
  useEffect(() => {
    if (!selectedRDV) { setRdvEvents([]); return; }
    (async () => {
      const res = await fetch(`/api/institution/rdv/events?rdv_id=${selectedRDV.id}`);
      const j = await res.json().catch(() => null);
      setRdvEvents(res.ok ? (j?.entrees ?? []) : []);
    })();
  }, [selectedRDV?.id]);
  useEffect(() => { setGuichetDraft(selectedRDV?.guichet || ""); }, [selectedRDV?.id]);
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
        showToast(`Nouveau RDV de ${nom} !`, C.gold);
        loadData();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rdv", filter: `institution_id=eq.${instId}` }, (p) => {
        if (p.new?.statut === "annule" && p.old?.statut !== "annule") { showToast("RDV annulé par le citoyen", C.orange); loadData(); return; }
        // Un report ne change jamais statut vers "annule" (il repasse à
        // "en_attente", cf. reporterRdv dans app/mes-rdv/actions.ts) —
        // seul motif_report qui change signale un report réel.
        if (p.new?.motif_report && p.new.motif_report !== p.old?.motif_report) {
          showToast("RDV reporté par le citoyen", C.gold);
          loadData();
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "avis", filter: `institution_id=eq.${instId}` }, () => { showToast("Nouvel avis client", C.gold); loadData(); })
      .subscribe((status) => {
        setRealtimeStatus(status === "SUBSCRIBED" ? "connecte" : status === "CLOSED" ? "hors_ligne" : "reconnexion");
      });
    return () => { supabase.removeChannel(ch); };
  }, [instId, loadData]);

  const rdvsPending  = rdvs.filter(r => r.statut === "nouveau");
  // "En retard" = pas encore résolu (jamais accepté "nouveau", ou accepté
  // mais présence jamais scannée "en_attente") ET l'heure prévue est passée.
  // Couvre désormais aussi "nouveau" (avant : uniquement "en_attente" —
  // une demande jamais prise en charge ne déclenchait rien du tout, signalé
  // par Bryan le 19/07/2026).
  const rdvsEnRetard = rdvs.filter(r =>
    (r.statut === "nouveau" || (r.statut === "en_attente" && r.presence_status !== "absent"))
    && rdvEstEnRetard(r.date_rdv, r.heure_rdv)
  );
  // Le tout prochain RDV (le plus proche dans le temps, parmi ceux encore à
  // venir et non résolus) — signalé par un badge rose "Imminent" partout où
  // il apparaît (carte "Prochains rendez-vous", liste de l'onglet RDV),
  // demandé par Bryan le 19/07/2026.
  const imminentRdvId = useMemo(() => {
    const nowT = Date.now();
    const upcoming = rdvs
      .filter(r => !["annule", "termine"].includes(r.statut) && r.date_rdv && r.heure_rdv)
      .filter(r => new Date(`${r.date_rdv}T${r.heure_rdv}`).getTime() >= nowT)
      .sort((a, b) => new Date(`${a.date_rdv}T${a.heure_rdv}`).getTime() - new Date(`${b.date_rdv}T${b.heure_rdv}`).getTime());
    return upcoming[0]?.id ?? null;
  }, [rdvs]);
  const notifCount   = stats.avis_non_lus + stats.pending;
  const filteredRdvs = rdvs
    .filter(r => rdvFilter === "tous" || (rdvFilter === "absent" ? r.presence_status === "absent" : rdvFilter === "en_attente" ? r.statut === "en_attente" && r.presence_status !== "absent" : r.statut === rdvFilter))
    .filter(r => !rdvSearch || r.citoyen_nom.toLowerCase().includes(rdvSearch.toLowerCase()) || (r.objet || "").toLowerCase().includes(rdvSearch.toLowerCase()))
    .filter(r => !rdvDateFilter || r.date_rdv === rdvDateFilter)
    .filter(r => !rdvServiceFilter || extraireService(r.objet) === rdvServiceFilter)
    .sort((a, b) => {
      const ta = new Date(`${a.date_rdv}T${a.heure_rdv || "00:00"}`).getTime();
      const tb = new Date(`${b.date_rdv}T${b.heure_rdv || "00:00"}`).getTime();
      if (rdvSort === "recent") return tb - ta;
      if (rdvSort === "ancien") return ta - tb;
      // "prochain" (défaut) — le RDV le plus proche dans le temps en premier :
      // les à-venir d'abord (le plus tôt en tête), puis les passés ensuite
      // (le plus récemment passé en tête), plutôt qu'un simple tri global
      // qui reléguait le prochain RDV en bas de liste (signalé par Bryan le
      // 19/07/2026).
      const now4 = Date.now();
      const aFuture = ta >= now4, bFuture = tb >= now4;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      return aFuture ? ta - tb : tb - ta;
    });

  const rdvServiceOptions = useMemo(() => {
    const set = new Set(rdvs.map(r => extraireService(r.objet)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rdvs]);

  const rdvCountByCitoyen = useMemo(() => {
    const m = new Map<string, number>();
    rdvs.forEach(r => m.set(r.citoyen_id, (m.get(r.citoyen_id) || 0) + 1));
    return m;
  }, [rdvs]);

  const rdvTotalPages = Math.max(1, Math.ceil(filteredRdvs.length / rdvPageSize));
  const rdvPageClamped = Math.min(rdvPage, rdvTotalPages);
  const pageRdvs = filteredRdvs.slice((rdvPageClamped - 1) * rdvPageSize, rdvPageClamped * rdvPageSize);

  useEffect(() => {
    setRdvPage(1);
  }, [rdvFilter, rdvSearch, rdvDateFilter, rdvServiceFilter, rdvSort, rdvPageSize]);

  // ── Loading ──
  if (loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
      <style>{cssFor(C)}</style>
      <div style={{ position: "relative", width: "52px", height: "52px" }}>
        <div style={{ position: "absolute", inset: 0, border: `3px solid rgba(212,160,23,0.15)`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.85s linear infinite" }}/>
        <div style={{ position: "absolute", inset: "8px", border: `2px solid rgba(212,160,23,0.08)`, borderTopColor: `${C.gold}60`, borderRadius: "50%", animation: "spin 1.4s linear infinite reverse" }}/>
      </div>
      <YelenLogo size={28} color={C.gold} />
      <div style={{ color: C.t3, fontSize: "12px", fontWeight: "600", letterSpacing: "1px" }}>" BON RETOUR " Merci de patienter  YELEN224 est entrain de charger</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <style>{cssFor(C)}</style>
      <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "28px 24px", border: `1px solid ${C.border}`, textAlign: "center", maxWidth: "340px" }}>
        <YelenLogo size={40} color={C.gold} />
        <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "20px", marginTop: "16px" }}>{error}</div>
        <button onClick={loadData} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "12px 24px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Réessayer</button>
      </div>
    </div>
  );

  // ── Sidebar PC — sections avec labels de groupe (Principal / Activité /
  // Relation citoyenne / Pilotage / Compte), pattern dashboards pro. ──
  const navSectionsRaw: { label: string; items: { key: typeof tab; label: string; icon: React.ReactNode; onClick?: () => void }[] }[] = [
    { label: "Principal", items: [
      { key: "accueil",    label: "Vue d'ensemble",  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    ]},
    { label: "Activité", items: [
      { key: "messagerie", label: "Messagerie",     icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
      { key: "rdv",        label: "Rendez-vous",     icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
      { key: "disponibilites", label: "Disponibilités", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
      { key: "services",   label: "Services",        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg> },
      { key: "valider-rdv", label: "Valider un RDV", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="8 15 11 18 16 13"/></svg> },
    ]},
    { label: "Relation citoyenne", items: [
      { key: "communication", label: "Communication", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
      { key: "scanner",    label: "Scanner QR",      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg> },
      { key: "codeqr",     label: "Mon code QR",     icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="17.5" y1="14" x2="17.5" y2="17.5"/><line x1="14" y1="17.5" x2="17.5" y2="17.5"/></svg> },
    ]},
    { label: "Pilotage", items: [
      { key: "analyse",    label: "Analyse",         icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    ]},
    { label: "Finance", items: [
      { key: "paiements",  label: "Paiements",       icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
      { key: "transactions", label: "Transactions",  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
      { key: "historique-financier", label: "Historique financier", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
      { key: "facturation", label: "Facturation",    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg> },
      { key: "rapports",   label: "Rapports",        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 21H4a1 1 0 0 1-1-1V4"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="4" width="3" height="13"/></svg> },
      { key: "documents-financiers", label: "Documents financiers", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
      { key: "documents-clients", label: "Documents clients", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/></svg> },
    ]},
    { label: "Partenariat", items: [
      { key: "partenariat", label: "Partenaires",     icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 4-2 4 4"/></svg> },
      // "Mes offres" n'apparaît qu'une fois le partenariat approuvé — filtre
      // additionnel appliqué juste après (inst?.partenaire_statut), pas
      // seulement le RBAC générique tabAllowed().
      { key: "mes-offres", label: "Mes offres",       icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg> },
    ]},
  ];
  const navSections = navSectionsRaw
    .map(section => ({ ...section, items: section.items.filter(i => tabAllowed(membreRole, i.key) && (i.key !== "mes-offres" || inst?.partenaire_statut === "approuve")) }))
    .filter(section => section.items.length > 0);

  // Sous-menu "Compte" — pas dans le menu principal, façon Supabase : on
  // clique sur la ligne compte (icône + nom) dans le sidebar, ça ouvre ce
  // petit panneau entre le menu principal (réduit) et la vue courante.
  const accountItemsRaw: { key: typeof tab | "guide"; label: string; icon: React.ReactNode; onClick?: () => void }[] = [
    { key: "profil", label: "Profil", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg> },
    { key: "mes-clients", label: "Mes clients", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: "avis-reputation", label: "Avis & Réputation", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> },
    { key: "questions-clients", label: "Questions des clients", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="9.01" y2="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7"/></svg> },
    { key: "espace-travail", label: "Espace de travail", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
    { key: "equipe", label: "Équipe", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: "journal", label: "Journal d'activité", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { key: "rdv-historique", label: "Rendez-vous passés", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/><path d="M3 12a9 9 0 0 1 9-9"/></svg> },
    { key: "profil-entreprise", label: "Profil Entreprise", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><line x1="9" y1="8" x2="9" y2="8"/><line x1="15" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="9" y2="16"/><line x1="15" y1="16" x2="15" y2="16"/></svg> },
    { key: "conditions-informations", label: "Conditions & Informations", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg> },
    { key: "profil-responsable", label: "Profil Responsable", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg> },
    { key: "documents", label: "Documents", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
    { key: "guide", label: "Guide Yelen", onClick: () => setShowGuide(true), icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
  ];
  const accountItems = accountItemsRaw.filter(i => tabAllowed(membreRole, i.key));
  const accountTabKeys: (typeof tab | "guide")[] = accountItems.map(i => i.key);

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
    <div className="yelen-shell" style={{ minHeight: "100svh", backgroundColor: C.bg, fontFamily: "var(--font-jakarta), -apple-system, 'Helvetica Neue', sans-serif", color: C.t1 }}>
      <style>{cssFor(C)}</style>

      {/* ── SIDEBAR PC (≥1024px) ── */}
      <aside className="yelen-sidebar" style={{ width: sidebarCollapsed ? "76px" : "264px", minWidth: sidebarCollapsed ? "76px" : "264px", transition: "width 0.18s ease" }}>
        {/* Bouton réduire/étendre le menu, façon Supabase */}
        <button
          onClick={toggleSidebarCollapsed}
          className="tap"
          title={sidebarCollapsed ? "Étendre le menu" : "Réduire le menu"}
          style={{ position: "absolute", right: "-12px", top: "72px", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 401, color: C.t2 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: sidebarCollapsed ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        {/* Logo + titre */}
        <div style={{ padding: sidebarCollapsed ? "20px 10px 12px" : "20px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", marginBottom: sidebarCollapsed ? 0 : "12px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <YelenLogo size={22} color="#000" />
            </div>
            {!sidebarCollapsed && (
              <div>
                <div style={{ color: C.gold, fontSize: "13px", fontWeight: "900", letterSpacing: "0.5px" }}>YELEN224</div>
                <div style={{ color: C.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "0.5px" }}>PRO DASHBOARD</div>
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
                <div style={{ padding: "0 12px 6px", color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase" }}>
                  {section.label}
                </div>
              ) : (
                si > 0 && <div style={{ height: "1px", background: C.border, margin: "0 8px 8px" }}/>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {section.items.map(item => {
                  const active = tab === item.key;
                  const badge = item.key === "rdv" ? rdvsPending.length : item.key === "messagerie" ? messagerieUnread : 0;
                  const badgeColor = item.key === "messagerie" ? "#ef4444" : C.gold;
                  const badgeTextColor = item.key === "messagerie" ? "#fff" : "#000";
                  return (
                    <button key={item.key} onClick={() => { if (item.onClick) { item.onClick(); } else { setTab(item.key); } if (accountMenuOpen) closeAccountMenu(); }} className={`tap yelen-nav-item ${active ? "yelen-nav-item-active" : ""}`} title={sidebarCollapsed ? item.label : undefined} style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", padding: sidebarCollapsed ? "10px" : "10px 12px", borderRadius: "12px", background: active ? `linear-gradient(135deg, ${C.gold}15, ${C.gold}08)` : "transparent", border: `1px solid ${active ? C.gold + "30" : "transparent"}`, color: active ? C.gold : C.t2, fontWeight: active ? "700" : "500", fontSize: "13px", cursor: "pointer", textAlign: "left", position: "relative", width: "100%" }}>
                      <span style={{ color: active ? C.gold : C.t3, flexShrink: 0 }}>{item.icon}</span>
                      {!sidebarCollapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                      {badge > 0 && (
                        <span style={{ backgroundColor: badgeColor, color: badgeTextColor, fontSize: "9px", fontWeight: "900", borderRadius: "10px", minWidth: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", position: sidebarCollapsed ? "absolute" : "static", top: sidebarCollapsed ? "2px" : undefined, right: sidebarCollapsed ? "2px" : undefined, animation: item.key === "rdv" ? "glow 1.6s ease-in-out infinite" : "none" }}>{badge}</span>
                      )}
                      {active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: "3px", background: C.gold, borderRadius: "0 2px 2px 0" }}/>}
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
        <div style={{ padding: "12px 8px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* Ligne "Compte" — icône + nom institution, clic ouvre le sous-menu
              (Profil Entreprise / Profil Responsable / Paramètres) dans un
              panneau distinct, façon Supabase. Ne fait pas partie du menu
              principal : ne change jamais `tab` directement. */}
          <button onClick={openAccountMenu} className="tap" title={sidebarCollapsed ? "Compte" : undefined} style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", padding: sidebarCollapsed ? "9px" : "9px 10px", borderRadius: "10px", background: accountMenuOpen ? `${C.gold}12` : "transparent", border: `1px solid ${accountMenuOpen ? C.gold + "30" : C.border}`, color: accountMenuOpen ? C.gold : C.t2, cursor: "pointer", width: "100%" }}>
            {inst?.logo ? (
              <img src={inst.logo} alt="" style={{ width: "22px", height: "22px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }}/>
            ) : (
              <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <YelenLogo size={13} color={C.gold} />
              </div>
            )}
            {!sidebarCollapsed && (
              <span style={{ flex: 1, fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{inst?.name || "Compte"}</span>
            )}
            {!sidebarCollapsed && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: accountMenuOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><polyline points="9 18 15 12 9 6"/></svg>
            )}
          </button>
          {tabAllowed(membreRole, "parametres") && (
            <button onClick={() => setTab("parametres")} className="tap" title={sidebarCollapsed ? "Paramètres" : undefined} style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", padding: sidebarCollapsed ? "9px" : "9px 12px", borderRadius: "10px", background: "transparent", border: `1px solid ${C.border}`, color: C.t2, fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              {!sidebarCollapsed && "Paramètres"}
            </button>
          )}
        </div>
      </aside>

      {/* ── PANNEAU "COMPTE" — entre le sidebar (réduit) et la vue courante,
          façon Supabase (Project Settings). Desktop uniquement (≥1024px,
          voir CSS .yelen-account-panel). ── */}
      {accountMenuOpen && (
        <div className="yelen-account-panel" style={{ left: sidebarCollapsed ? "76px" : "264px" }}>
          <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={closeAccountMenu} className="tap" style={{ width: "26px", height: "26px", borderRadius: "8px", background: "transparent", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t2, flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst?.name || "Compte"}</div>
              <div style={{ color: C.t3, fontSize: "10px" }}>Paramètres du compte</div>
            </div>
          </div>
          {membreRole !== null && membreRole !== "admin" && (
            <div style={{ margin: "10px 10px 0", padding: "10px 11px", borderRadius: "10px", backgroundColor: `${C.blue}10`, border: `1px solid ${C.blue}25` }}>
              <p style={{ color: C.t2, fontSize: "10.5px", lineHeight: 1.6, margin: 0 }}>
                🔒 Votre employeur peut voir tout ce que vous faites (Journal d'activité). Vous ne voyez ici que ce à quoi il vous a donné accès.
              </p>
            </div>
          )}
          <div style={{ padding: "10px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {accountItems.map(item => {
              const active = tab === item.key;
              return (
                <button key={item.key} onClick={() => item.onClick ? item.onClick() : setTab(item.key as typeof tab)} className={`tap yelen-nav-item ${active ? "yelen-nav-item-active" : ""}`} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: active ? `linear-gradient(135deg, ${C.gold}15, ${C.gold}08)` : "transparent", border: `1px solid ${active ? C.gold + "30" : "transparent"}`, color: active ? C.gold : C.t2, fontWeight: active ? "700" : "500", fontSize: "13px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                  <span style={{ color: active ? C.gold : C.t3, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              );
            })}
          </div>
          {membreRole !== null && (
            <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${C.border}`, marginTop: "4px" }}>
              <p style={{ color: C.t3, fontSize: "10px", lineHeight: 1.5, margin: 0 }}>
                Compte {ROLE_LABELS[membreRole].toLowerCase()} créé par <strong style={{ color: C.t2 }}>{inst?.name || "votre établissement"}</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── CONTENU PRINCIPAL ── */}
      {/* ── paddingBottom en dur (80px) remplacé par un calc() aligné sur la
          hauteur réelle de .yelen-bottom-nav (~48px de contenu) + son
          propre env(safe-area-inset-bottom) : la valeur fixe supposait déjà
          l'encoche present (safe-area ≈ 32px) et laissait un espace vide
          au-dessus du menu du bas sur les appareils/navigateurs sans
          encoche (retour Bryan 29/07/2026, capture à l'appui). ≥1024px
          continue de forcer 0 via la règle existante, inchangé. ── */}
      <div className="yelen-main" style={{ paddingBottom: "calc(48px + env(safe-area-inset-bottom))", marginLeft: `${(sidebarCollapsed ? 76 : 264) + (accountMenuOpen ? 232 : 0)}px`, transition: "margin-left 0.18s ease" }}>

      {/* ── MODALS ── */}
      {showGuide && <GuideScalingModal onClose={() => setShowGuide(false)}/>}
      {showScanner && instId && <ScannerModal institutionId={instId} onClose={() => { setShowScanner(false); loadData(); }}/>}

      {horsCreneauDialog && (
        <div onClick={() => setHorsCreneauDialog(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "22px", border: `1px solid ${C.border2}`, maxWidth: "420px", width: "100%", padding: "28px 24px", textAlign: "center" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "50%", backgroundColor: C.orangeL, border: `1.5px solid ${C.orange}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900", marginBottom: "12px" }}>{RDV_HORS_CRENEAU_MESSAGE.titre}</div>
            <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: "20px", textAlign: "left" }}>{RDV_HORS_CRENEAU_MESSAGE.message}</div>
            <button onClick={() => setHorsCreneauDialog(false)} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "14px", padding: "13px", borderRadius: "13px", border: "none", cursor: "pointer" }}>
              Compris
            </button>
          </div>
        </div>
      )}

      {termineDialog && (() => {
        const confirmedAt = termineDialog.presence_confirmed_at ? new Date(termineDialog.presence_confirmed_at) : null;
        const elapsedMin = confirmedAt ? Math.max(0, Math.round((Date.now() - confirmedAt.getTime()) / 60000)) : null;
        const service = extraireService(termineDialog.objet);
        return (
          <div onClick={() => setTermineDialog(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "22px", border: `1px solid ${C.border2}`, maxWidth: "440px", width: "100%", padding: "26px 24px", maxHeight: "88svh", overflowY: "auto" }}>
              <div style={{ color: C.t1, fontSize: "17px", fontWeight: "900", marginBottom: "16px", textAlign: "center" }}>Terminer ce rendez-vous ?</div>

              <div style={{ backgroundColor: C.bg3, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px" }}>
                {[
                  { label: "Service", value: service },
                  { label: "Citoyen", value: termineDialog.citoyen_nom },
                  { label: "Heure prévue", value: termineDialog.heure_rdv ? formatHeure(termineDialog.heure_rdv) : "—" },
                  { label: "Confirmation", value: confirmedAt ? confirmedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—" },
                  { label: "Temps écoulé", value: elapsedMin !== null ? `${elapsedMin} minutes` : "—" },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>{row.label}</span>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{row.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.8, marginBottom: "20px" }}>
                En terminant ce rendez-vous :
                <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
                  <li>le rendez-vous sera définitivement clôturé ;</li>
                  <li>aucune modification ne sera possible ;</li>
                  <li>le citoyen recevra automatiquement une invitation à évaluer son expérience ;</li>
                  <li>cette évaluation sera publiée sur votre profil Yelen et participera à votre score de qualité.</li>
                </ul>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
                <button onClick={() => setTermineDialog(null)} className="tap" style={{ padding: "14px", borderRadius: "13px", border: `1px solid ${C.border2}`, background: C.bg3, color: C.t2, fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Retour</button>
                <button onClick={() => { handleTermine(termineDialog.id); setTermineDialog(null); }} disabled={!!actionLoading} className="tap" style={{ padding: "14px", borderRadius: "13px", border: "none", background: `linear-gradient(135deg, ${C.purple}, #7a55d0)`, color: "#fff", fontWeight: "800", fontSize: "13.5px", cursor: "pointer" }}>
                  {actionLoading === termineDialog.id ? "…" : "Terminer le rendez-vous"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showBannerDetail && bannerRdv && (
        <RdvDetailFullscreen
          rdv={bannerRdv}
          onClose={() => setShowBannerDetail(false)}
          onAccept={() => handleAccept(bannerRdv.id)}
          onRefuse={(motif) => handleRefuse(bannerRdv.id, motif)}
          loading={actionLoading === bannerRdv.id}
        />
      )}

      {selectedRDV && (() => {
        const presenceConfirmee = selectedRDV.presence_status === "present";
        const isRetard = rdvEstEnRetard(selectedRDV.date_rdv, selectedRDV.heure_rdv);
        // Pastille de statut — rendue "RDV passé" (orange) dès que le créneau
        // est dépassé sans confirmation de présence, plutôt que de laisser
        // "En attente"/"Nouveau" (statut brut) qui ne signale pas l'urgence.
        const badgeStatut = selectedRDV.presence_status === "absent"
          ? "absent"
          : (isRetard && (selectedRDV.statut === "en_attente" || selectedRDV.statut === "nouveau"))
          ? "en_retard"
          : selectedRDV.statut;

        // Conseil contextuel — dépend de l'état réel (statut + présence),
        // remplace/complète le bandeau "QR confirmé" qui n'existait qu'au
        // statut "confirme".
        const guide = (() => {
          if (selectedRDV.statut === "nouveau" && isRetard) {
            return { c: C.red, t: "Cette demande a dépassé l'heure prévue sans réponse — acceptez-la, refusez-la, ou marquez le client absent s'il ne s'est jamais présenté." };
          }
          if (selectedRDV.statut === "nouveau") return { c: C.gold, t: "Ce citoyen attend votre réponse — acceptez ou refusez sa demande." };
          if (selectedRDV.presence_status === "absent") return { c: C.red, t: "Ce client a été marqué absent — il ne s'est pas présenté à son rendez-vous." };
          if (selectedRDV.statut === "termine") return { c: C.purple, t: "Ce RDV est terminé." };
          if (selectedRDV.statut === "annule") return { c: C.red, t: "Ce RDV a été annulé." };
          if (selectedRDV.statut === "en_attente" && isRetard && !presenceConfirmee) {
            return { c: C.orange, t: "Ce RDV a dépassé l'heure prévue sans confirmation de présence — marquez-le absent, ou scannez le QR code si le citoyen est arrivé en retard." };
          }
          if ((selectedRDV.statut === "en_attente" || selectedRDV.statut === "confirme") && !presenceConfirmee) {
            return { c: C.blue, t: "RDV accepté, en attente du jour J. Scannez le QR code du citoyen à son arrivée pour confirmer sa présence." };
          }
          if ((selectedRDV.statut === "en_attente" || selectedRDV.statut === "confirme") && presenceConfirmee) {
            return { c: C.green, t: "Présence confirmée par scan QR — vous pouvez marquer ce RDV comme terminé." };
          }
          return null;
        })();

        // Historique d'heures — colonnes du RDV (toujours visibles) +
        // journal_activite (qui a fait quoi, réservé admin, cf. useEffect
        // rdvHistorique). Fusionnés et triés du plus récent au plus ancien.
        const ACTION_LABEL_RDV: Record<string, string> = {
          rdv_accepte: "RDV accepté", rdv_refuse: "RDV refusé",
          rdv_termine: "RDV marqué terminé", rdv_absent: "Client marqué absent",
        };
        const ACTION_LABEL_EVENT: Record<string, string> = {
          creation: "RDV créé", confirmation: "RDV confirmé", annulation: "RDV annulé",
          report: "RDV reporté", termine: "RDV terminé", absent: "Client marqué absent",
          message: "Message envoyé", depasse: "Alerte dépassement",
        };
        const AUTEUR_LABEL: Record<string, string> = { citoyen: "Par le citoyen", institution: "Par l'institution", system: "Système" };
        const historiqueItems = [
          selectedRDV.created_at ? { label: "RDV créé", who: null as string | null, at: selectedRDV.created_at } : null,
          selectedRDV.presence_confirmed_at ? { label: selectedRDV.presence_status === "absent" ? "Marqué absent" : "Présence confirmée (scan QR)", who: null, at: selectedRDV.presence_confirmed_at } : null,
          selectedRDV.termine_at ? { label: "RDV terminé", who: null, at: selectedRDV.termine_at } : null,
          ...rdvHistorique.map(h => ({ label: ACTION_LABEL_RDV[h.action] ?? h.action, who: h.membre_nom, at: h.created_at })),
          ...rdvEvents.map(e => ({ label: (ACTION_LABEL_EVENT[e.action] ?? e.action) + (e.motif ? ` — ${e.motif}` : ""), who: AUTEUR_LABEL[e.auteur_type] ?? e.auteur_type, at: e.created_at })),
        ].filter((x): x is { label: string; who: string | null; at: string } => !!x)
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

        return (
        <div className="rdv-detail-overlay" onClick={() => setSelectedRDV(null)} style={{ position: "fixed", inset: 0, zIndex: 800, backgroundColor: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <style>{`
            /* ── Détail RDV — bottom sheet mobile, dialogue centré 2 colonnes
                ≥1024px (même convention que la fiche client / popovers header) ── */
            @media(min-width:1024px){
              .rdv-detail-overlay{align-items:center!important}
              .rdv-detail-panel{max-width:820px!important;border-radius:20px!important;max-height:86svh!important}
              .rdv-detail-grip{display:none!important}
              .rdv-detail-close-x{display:flex!important}
              .rdv-detail-body{display:grid!important;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
            }
          `}</style>
          <div onClick={e => e.stopPropagation()} className="rdv-detail-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.28s ease" }}>
            <div className="rdv-detail-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
            <button onClick={() => setSelectedRDV(null)} className="rdv-detail-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ color: C.t1, fontSize: "17px", fontWeight: "900" }}>Détails du RDV</div>
              <span style={{ backgroundColor: stInfo(badgeStatut, C).bg, color: stInfo(badgeStatut, C).c, fontSize: "10px", fontWeight: "800", padding: "4px 10px", borderRadius: "20px", textTransform: "uppercase" }}>{stInfo(badgeStatut, C).l}</span>
            </div>

            <div className="rdv-detail-body">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                  <div style={{ width: "52px", height: "52px", borderRadius: "14px", overflow: "hidden", background: `linear-gradient(135deg, ${stInfo(badgeStatut, C).c}25, ${stInfo(badgeStatut, C).c}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "900", color: stInfo(badgeStatut, C).c, flexShrink: 0 }}>
                    {selectedRDV.citoyen_photo ? <img src={selectedRDV.citoyen_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : selectedRDV.citoyen_nom.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    {selectedRDV.pour_autre && <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "1px" }}>Réservé par</div>}
                    <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800" }}>{selectedRDV.citoyen_nom}</div>
                    {selectedRDV.citoyen_phone && <div style={{ color: C.t3, fontSize: "12px" }}>{selectedRDV.citoyen_phone}</div>}
                  </div>
                </div>
                {selectedRDV.est_payant && (
                  <div style={{ backgroundColor: `${C.gold}15`, border: `1px solid ${C.gold}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ color: C.gold, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Service payant</div>
                      <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>{selectedRDV.service_payant_nom}</div>
                    </div>
                    <div style={{ color: C.gold, fontSize: "15px", fontWeight: "900" }}>{(selectedRDV.service_payant_prix ?? 0).toLocaleString("fr-FR")} FCFA</div>
                  </div>
                )}
                {selectedRDV.pour_autre && (
                  <div style={{ backgroundColor: C.orangeL, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
                    <div style={{ color: C.orange, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Bénéficiaire du RDV (pour un tiers)</div>
                    <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>{selectedRDV.nom_autre || "—"}</div>
                    {selectedRDV.phone_autre && <div style={{ color: C.t2, fontSize: "12px", marginTop: "1px" }}>{selectedRDV.phone_autre}</div>}
                  </div>
                )}
                <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
                  {[
                    { label: "Objet", value: selectedRDV.objet || "RDV général" },
                    { label: "Date", value: formatDate(selectedRDV.date_rdv, { weekday: "long", day: "numeric", month: "long" }) },
                    { label: "Heure", value: selectedRDV.heure_rdv ? formatHeure(selectedRDV.heure_rdv) : "—" },
                    ...(selectedRDV.duree_minutes ? [{ label: "Durée prévue", value: `${selectedRDV.duree_minutes} min` }] : []),
                    ...(selectedRDV.presence_status ? [{ label: "Présence", value: selectedRDV.presence_status === "present" ? "Confirmée (QR)" : selectedRDV.presence_status === "absent" ? "Absent" : selectedRDV.presence_status }] : []),
                    ...(selectedRDV.motif_annulation ? [{ label: "Motif annulation", value: selectedRDV.motif_annulation }] : []),
                    ...(selectedRDV.motif_report ? [{ label: "🔄 Reporté", value: selectedRDV.motif_report }] : []),
                  ].map((item, i, arr) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>{item.label}</span>
                      <span style={{ color: C.t1, fontSize: "12px", fontWeight: "700", textAlign: "right", flex: 1 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
                {selectedRDV.description_besoin && (
                  <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Description du besoin</div>
                    <div style={{ color: C.t1, fontSize: "12.5px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{selectedRDV.description_besoin}</div>
                  </div>
                )}
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Guichet</div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      value={guichetDraft}
                      onChange={e => setGuichetDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !savingGuichet) handleSaveGuichet(); }}
                      placeholder="Ex: Guichet 3, Bureau A…"
                      style={{ flex: 1, backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px 12px", fontSize: "12px", color: C.t1, outline: "none" }}
                    />
                    <button onClick={handleSaveGuichet} disabled={savingGuichet || guichetDraft === (selectedRDV.guichet || "")} className="tap" style={{ backgroundColor: C.purple, color: "#fff", border: "none", borderRadius: "10px", padding: "0 14px", fontSize: "12px", fontWeight: "800", cursor: "pointer", opacity: savingGuichet || guichetDraft === (selectedRDV.guichet || "") ? 0.5 : 1 }}>
                      {savingGuichet ? "…" : "OK"}
                    </button>
                  </div>
                </div>
                {guide && (
                  <div style={{ backgroundColor: `${guide.c}08`, border: `1px solid ${guide.c}20`, borderRadius: "12px", padding: "10px 14px", marginBottom: "14px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={guide.c} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <div style={{ color: C.t3, fontSize: "10px", lineHeight: 1.5 }}>{guide.t}</div>
                  </div>
                )}
              </div>

              <div>
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Historique</div>
                  {historiqueItems.length === 0 ? (
                    <div style={{ color: C.t3, fontSize: "11.5px", padding: "8px 0" }}>Aucun événement pour l'instant.</div>
                  ) : (
                    <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "4px 12px" }}>
                      {historiqueItems.map((h, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", padding: "9px 0", borderBottom: i < historiqueItems.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          <div>
                            <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>{h.label}</div>
                            {h.who && <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{h.who}</div>}
                          </div>
                          <div style={{ color: C.t3, fontSize: "10px", whiteSpace: "nowrap", textAlign: "right" }}>
                            {formatDate(h.at, { day: "numeric", month: "short" })} · {new Date(h.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedRDV.statut === "nouveau" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <button onClick={() => handleRefuse(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: C.redL, color: C.red, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${C.red}25`, cursor: "pointer" }}>
                      {actionLoading === selectedRDV.id ? "..." : "Refuser"}
                    </button>
                    <button onClick={() => handleAccept(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ background: `linear-gradient(135deg, ${C.green}, #009e76)`, color: "#fff", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer" }}>
                      {actionLoading === selectedRDV.id ? "..." : "Accepter"}
                    </button>
                  </div>
                ) : (selectedRDV.statut === "en_attente" || selectedRDV.statut === "confirme") ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <button onClick={() => presenceConfirmee && handleTermine(selectedRDV.id)} disabled={!!actionLoading || !presenceConfirmee} className="tap" style={{ background: presenceConfirmee ? `linear-gradient(135deg, ${C.purple}, #7a55d0)` : C.bg3, color: presenceConfirmee ? "#fff" : C.t3, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: presenceConfirmee ? "none" : `1px solid ${C.border}`, cursor: presenceConfirmee ? "pointer" : "not-allowed" }}>
                      {actionLoading === selectedRDV.id ? "..." : "✓ Marquer terminé"}
                    </button>
                    {!presenceConfirmee && (
                      <div style={{ color: C.t3, fontSize: "11px", textAlign: "center", marginTop: "-4px" }}>
                        Scannez le QR code du citoyen pour confirmer sa présence avant de marquer ce RDV terminé.
                      </div>
                    )}
                    {selectedRDV.statut === "en_attente" && isRetard && (
                      <button onClick={() => handleAbsent(selectedRDV.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: C.orangeL, color: C.orange, fontWeight: "800", fontSize: "14px", padding: "13px", borderRadius: "14px", border: `1px solid ${C.orange}25`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {actionLoading === selectedRDV.id ? "..." : "Client absent"}
                      </button>
                    )}
                    <button onClick={() => setSelectedRDV(null)} className="tap" style={{ backgroundColor: C.bg3, color: C.t2, fontWeight: "700", fontSize: "14px", padding: "13px", borderRadius: "14px", border: `1px solid ${C.border}`, cursor: "pointer" }}>Fermer</button>
                  </div>
                ) : (
                  <button onClick={() => setSelectedRDV(null)} className="tap" style={{ width: "100%", backgroundColor: C.bg3, color: C.t2, fontWeight: "700", fontSize: "14px", padding: "13px", borderRadius: "14px", border: `1px solid ${C.border}`, cursor: "pointer" }}>Fermer</button>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {toast && <Toast msg={toast.msg} color={toast.color} onDismiss={() => setToast(null)}/>}

      {logoutOpen && (
        <LogoutFlow
          onClose={() => setLogoutOpen(false)}
          redirectTo="/institution/connexion?logged_out=1"
          copy={INSTITUTION_LOGOUT_COPY}
        />
      )}

      {/* ═══════ HEADER ═══════ */}
      {/* ── paddingTop: env(safe-area-inset-top) — manquait ici (seul header
          du projet à ne pas l'avoir, cf. dashboard-client.tsx côté citoyen)
          : sur mobile en PWA standalone (viewportFit:"cover", layout.tsx),
          la barre de statut du téléphone se superposait au header au lieu
          de s'afficher au-dessus (retour Bryan 29/07/2026, capture à
          l'appui). env() vaut 0 sans encoche/PWA, donc PC inchangé. ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 200, backgroundColor: `${C.bgCard}F5`, backdropFilter: "blur(28px) saturate(200%)", borderBottom: `1px solid ${C.border}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div className="yelen-header-inner" style={{ padding: "0 16px" }}>
          <div style={{ height: "56px", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
              {inst?.logo ? (
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.border2}`, flexShrink: 0 }}>
                  <img src={inst.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                </div>
              ) : (
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.gold}30, ${C.goldD}20)`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <YelenLogo size={20} color={C.gold} />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inst?.name ? getSalutation(inst.name) : "Dashboard"}
                </div>
                <div style={{ color: C.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "0.5px" }}>
                  YELEN224 PRO
                </div>
              </div>
            </div>

            {/* ── Icône Partenaires (chantier 26/07/2026) — entre le nom et
                la recherche, demande explicite du CEO. Navigation directe
                vers l'onglet "partenariat", pas un popover. Un point doré
                signale un partenariat déjà approuvé. ── */}
            {tabAllowed(membreRole, "partenariat") && (
              <button
                onClick={() => setTab("partenariat")}
                title="Partenaires"
                className="tap yelen-header-more-item"
                style={{ position: "relative", background: tab === "partenariat" ? `${C.gold}15` : C.bgCard2, border: `1px solid ${tab === "partenariat" ? C.gold + "40" : C.border}`, borderRadius: "10px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: tab === "partenariat" ? C.gold : C.t2 }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 4-2 4 4"/></svg>
                {inst?.partenaire_statut === "approuve" && (
                  <span style={{ position: "absolute", top: "5px", right: "5px", width: "6px", height: "6px", borderRadius: "50%", background: C.gold }}/>
                )}
              </button>
            )}

            {/* ── Recherche — wrapper position:relative commun à l'input
                desktop, l'icône mobile et le panneau de résultats, pour que
                la fermeture au clic extérieur et l'ancrage absolu (desktop)
                fonctionnent correctement ── */}
            <div ref={searchRef} style={{ position: "relative", flexShrink: 0 }}>
              <div className="header-search-desktop" style={{ alignItems: "center", gap: "8px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0 10px", width: "220px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => setActivePopover("search")}
                  placeholder="Rechercher…"
                  style={{ flex: 1, padding: "8px 0", fontSize: "12px" }}
                />
              </div>
              {/* ── Recherche mobile — icône qui ouvre le même popover ── */}
              <button onClick={() => setActivePopover(activePopover === "search" ? null : "search")} className="tap header-search-icon-mobile yelen-header-more-item" style={{ background: activePopover === "search" ? `${C.gold}15` : C.bgCard2, border: `1px solid ${activePopover === "search" ? C.gold + "40" : C.border}`, borderRadius: "10px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>

              {/* ── Résultats : navigation + clients. Portalé dans
                  document.body pour la même raison que HeaderPopover (le
                  <header> parent a un backdropFilter qui casse
                  position:fixed pour ce descendant). ── */}
              {activePopover === "search" && typeof document !== "undefined" && createPortal(
                <div ref={searchPanelRef} className="header-popover-panel">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Recherche</span>
                    <button onClick={() => setActivePopover(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, padding: "4px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher un onglet ou un client…" autoFocus style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "12px" }}/>
                  {(() => {
                    const q = searchQuery.trim().toLowerCase();
                    const navResults = [...navSections.flatMap(s => s.items), ...accountItems].filter(i => !q || i.label.toLowerCase().includes(q));
                    const clientResults = clients.filter(c => q && (c.nom.toLowerCase().includes(q) || c.phone.includes(q))).slice(0, 6);
                    return (
                      <>
                        {navResults.length > 0 && (
                          <div style={{ marginBottom: "10px" }}>
                            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>Navigation</div>
                            {navResults.slice(0, 8).map(i => (
                              <button key={i.key} onClick={() => { if (i.onClick) { i.onClick(); } else { setTab(i.key as typeof tab); } setActivePopover(null); setSearchQuery(""); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 8px", background: "none", border: "none", color: C.t1, fontSize: "13px", fontWeight: "600", textAlign: "left", cursor: "pointer", borderRadius: "8px" }}>
                                <span style={{ color: C.t3, display: "flex" }}>{i.icon}</span>{i.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {clientResults.length > 0 && (
                          <div>
                            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>Clients</div>
                            {clientResults.map(c => (
                              <button key={c.id} onClick={() => { setTab("mes-clients"); setActivePopover(null); setSearchQuery(""); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 8px", background: "none", border: "none", color: C.t1, fontSize: "13px", fontWeight: "600", textAlign: "left", cursor: "pointer", borderRadius: "8px" }}>
                                {c.nom}<span style={{ color: C.t3, fontWeight: "400", fontSize: "11px" }}>{c.phone}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {q && navResults.length === 0 && clientResults.length === 0 && (
                          <div style={{ padding: "20px 8px", textAlign: "center", color: C.t3, fontSize: "12px" }}>Aucun résultat.</div>
                        )}
                      </>
                    );
                  })()}
                </div>,
                document.body
              )}
            </div>

            {/* ── RDV entrants — badge = rdvsPending (statut "nouveau"),
                même définition que le badge du menu latéral ── */}
            <HeaderPopover id="rdv" active={activePopover === "rdv"} onOpen={() => setActivePopover("rdv")} onClose={() => setActivePopover(null)} badge={rdvsPending.length} glow panelTitle="RDV entrants" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            >
              {rdvsPending.length === 0 ? (
                <div style={{ padding: "24px 8px", textAlign: "center", color: C.t3, fontSize: "12px" }}>Aucun RDV entrant pour l'instant.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {rdvsPending.slice(0, 8).map(r => (
                    <div key={r.id} style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.citoyen_nom}</span>
                        <span style={{ color: C.t3, fontSize: "10px", flexShrink: 0 }}>{formatHeure(r.heure_rdv)}</span>
                      </div>
                      <div style={{ color: C.t2, fontSize: "11px", marginBottom: "8px" }}>{r.objet || "RDV général"}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                        <button onClick={() => handleRefuse(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: C.redL, color: C.red, fontSize: "11px", fontWeight: "700", padding: "7px", borderRadius: "8px", border: "none", cursor: "pointer" }}>Refuser</button>
                        <button onClick={() => handleAccept(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: C.greenL, color: C.green, fontSize: "11px", fontWeight: "700", padding: "7px", borderRadius: "8px", border: "none", cursor: "pointer" }}>Accepter</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </HeaderPopover>

            {/* ── Notifications — n'existait pas avant le chantier "Yelen
                Assistant" (20/07/2026) ; notifCount était calculé mais
                jamais affiché. Marque tout comme lu à l'ouverture. ── */}
            <HeaderPopover id="notifications" active={activePopover === "notifications"} onOpen={ouvrirNotifications} onClose={() => setActivePopover(null)} badge={institutionNotifs.filter(n => !n.lu).length} panelTitle="Notifications" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
            >
              {/* ── Onglets Utilisateur / Système — "Système" n'existe pas
                  encore (mention "à venir"), demandé par Bryan le 20/07/2026 ── */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                {([{ key: "utilisateur", label: "Mes notifications" }, { key: "systeme", label: "Système" }] as const).map(o => (
                  <button key={o.key} onClick={() => setOngletNotif(o.key)} style={{ flex: 1, background: ongletNotif === o.key ? `${C.gold}18` : C.bg3, border: `1px solid ${ongletNotif === o.key ? C.gold + "45" : C.border}`, borderRadius: "10px", padding: "8px 10px", color: ongletNotif === o.key ? C.gold : C.t3, fontSize: "12px", fontWeight: "800", cursor: "pointer" }}>
                    {o.label}
                  </button>
                ))}
              </div>
              {ongletNotif === "systeme" ? (
                <div style={{ padding: "20px 8px 8px", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><NotifEmptyIllustration color={C.gold}/></div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>Bientôt disponible</div>
                  <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6 }}>Les alertes système et informations de la plateforme Yelen apparaîtront ici.</div>
                </div>
              ) : institutionNotifs.length === 0 ? (
                <div style={{ padding: "20px 8px 8px", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><NotifEmptyIllustration color={C.gold}/></div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>Vous êtes à jour</div>
                  <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6 }}>Aucune notification pour l'instant — vous serez averti dès qu'un événement nécessite votre attention.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {grouperParJour(institutionNotifs.slice(0, 15)).map(g => (
                    <div key={g.jour}>
                      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", padding: "4px 2px 6px" }}>{g.jour}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
                        {g.items.map(n => (
                          <div key={n.id} onClick={() => handleClickNotif(n)} className={n.rdv_id ? "tap" : ""} style={{ backgroundColor: n.lu ? "transparent" : `${C.gold}0d`, border: `1px solid ${n.lu ? C.border : C.gold + "25"}`, borderRadius: "12px", padding: "10px 12px", cursor: n.rdv_id ? "pointer" : "default", display: "flex", gap: "10px" }}>
                            <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.gold }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: n.lu ? "600" : "800", flex: 1 }}>{n.titre}</div>
                                {!n.lu && <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.gold, flexShrink: 0 }}/>}
                              </div>
                              <div style={{ color: C.t2, fontSize: "11px", lineHeight: 1.5, marginTop: "1px" }}>{n.message}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                                <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700" }}>{new Date(n.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                                <span style={{ color: C.t3, fontSize: "10px" }}>·</span>
                                <span style={{ color: C.t3, fontSize: "10px", fontWeight: "600" }}>il y a {timeAgo(n.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </HeaderPopover>

            {/* ── Questions clients — icône dédiée, séparée du badge
                "Messagerie" du menu latéral (table questions_institution,
                pas messages). Clic renvoie directement vers le panneau
                "Mon compte > Questions des clients", pas un fil de
                discussion ici. ── */}
            <HeaderPopover id="questions" active={activePopover === "questions"} onOpen={() => setActivePopover("questions")} onClose={() => setActivePopover(null)} badge={questionsNonRepondues} panelTitle="Questions clients" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="9.01" y2="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7"/></svg>}
            >
              <div style={{ padding: "8px 4px", textAlign: "center" }}>
                {questionsNonRepondues === 0 ? (
                  <p style={{ color: C.t3, fontSize: "12px", margin: "12px 0" }}>Aucune nouvelle question pour l&apos;instant.</p>
                ) : (
                  <p style={{ color: C.t2, fontSize: "12.5px", margin: "12px 0", lineHeight: 1.6 }}>
                    {questionsNonRepondues} question{questionsNonRepondues > 1 ? "s" : ""} en attente de réponse, posée{questionsNonRepondues > 1 ? "s" : ""} publiquement par des citoyens avant leur RDV.
                  </p>
                )}
                <button onClick={() => { setActivePopover(null); setTab("questions-clients"); }} className="tap" style={{ width: "100%", backgroundColor: C.gold, color: "#000", border: "none", borderRadius: "10px", padding: "10px", fontSize: "12.5px", fontWeight: "800", cursor: "pointer" }}>
                  Voir toutes les questions
                </button>
              </div>
            </HeaderPopover>

            {/* ── Feedback ── */}
            <HeaderPopover id="feedback" active={activePopover === "feedback"} onOpen={() => setActivePopover("feedback")} onClose={() => setActivePopover(null)} panelTitle="Envoyer un feedback" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>}
            >
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                {([{ k: "bug", l: "Bug" }, { k: "suggestion", l: "Suggestion" }, { k: "ux", l: "UX" }, { k: "fonctionnalite", l: "Fonctionnalité" }] as const).map(t => (
                  <button key={t.k} onClick={() => setFeedbackType(t.k)} className="tap" style={{ backgroundColor: feedbackType === t.k ? `${C.gold}20` : C.bg3, border: `1px solid ${feedbackType === t.k ? C.gold + "40" : C.border}`, color: feedbackType === t.k ? C.gold : C.t2, fontSize: "11px", fontWeight: "700", padding: "6px 10px", borderRadius: "20px", cursor: "pointer" }}>{t.l}</button>
                ))}
              </div>
              <textarea value={feedbackMsg} onChange={e => setFeedbackMsg(e.target.value)} placeholder="Décrivez votre retour…" rows={4} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: C.t1, marginBottom: "10px" }}/>
              <button onClick={envoyerFeedback} disabled={feedbackSending || !feedbackMsg.trim()} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontSize: "13px", fontWeight: "800", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: feedbackSending || !feedbackMsg.trim() ? 0.5 : 1 }}>
                {feedbackSending ? "…" : "Envoyer"}
              </button>
            </HeaderPopover>

            {/* ── Aide — liens déjà existants ailleurs (Guide, FAQ, support,
                CGU, confidentialité), aucune nouvelle page ── */}
            <HeaderPopover id="help" active={activePopover === "help"} onOpen={() => setActivePopover("help")} onClose={() => setActivePopover(null)} panelTitle="Aide & ressources" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {[
                  { label: "Guide Yelen", action: () => { setShowGuide(true); setActivePopover(null); } },
                  { label: "Aide & FAQ", href: "/faq" },
                  { label: "Contacter le support", href: "mailto:support@yelen224.com" },
                  { label: "Conditions d'utilisation", href: "/cgu" },
                  { label: "Politique de confidentialité", href: "/confidentialite" },
                ].map(item => item.href ? (
                  <a key={item.label} href={item.href} className="tap" style={{ padding: "10px 8px", color: C.t1, fontSize: "13px", fontWeight: "600", textDecoration: "none", borderRadius: "8px" }}>{item.label}</a>
                ) : (
                  <button key={item.label} onClick={item.action} className="tap" style={{ padding: "10px 8px", color: C.t1, fontSize: "13px", fontWeight: "600", background: "none", border: "none", textAlign: "left", cursor: "pointer", borderRadius: "8px" }}>{item.label}</button>
                ))}
              </div>
            </HeaderPopover>

            <button onClick={() => setShowScanner(true)} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "900", fontSize: "11px", padding: "8px 12px", borderRadius: "10px", border: "none", cursor: "pointer", flexShrink: 0, boxShadow: `0 2px 12px ${C.gold}40` }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
              Scanner
            </button>

            {/* ── Actualiser — sorti du menu "...", auto-refresh toutes les 30s (cf. useEffect) ── */}
            <button onClick={() => loadData()} disabled={refreshing} className="tap yelen-header-more-item" title="Actualiser les données" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "10px", width: "36px", height: "36px", cursor: refreshing ? "default" : "pointer", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>

            {/* ── "..." — état du système + actions rapides. Sur mobile,
                regroupe aussi les accès raccourcis retirés de la rangée
                (recherche, Partenaires, RDV entrants, notifications,
                questions clients, feedback, aide, actualiser) — voir
                .yelen-header-more-extra ci-dessus, invisible ≥1024px, donc
                le panneau PC garde exactement ses 2 items d'origine. Badge
                agrégé (mobile uniquement, .yelen-header-more-badge) pour ne
                pas perdre le signal "attention requise" une fois les icônes
                individuelles masquées. ── */}
            <HeaderPopover id="system" active={activePopover === "system"} onOpen={() => setActivePopover("system")} onClose={() => setActivePopover(null)} panelTitle="État du système"
              badge={rdvsPending.length + institutionNotifs.filter(n => !n.lu).length + questionsNonRepondues} badgeClassName="yelen-header-more-badge"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px", marginBottom: "10px" }}>
                <div style={{ position: "relative", width: "8px", height: "8px", flexShrink: 0 }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: realtimeStatus === "connecte" ? C.green : realtimeStatus === "reconnexion" ? C.gold : C.red }}/>
                  {realtimeStatus === "connecte" && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: C.green, animation: "ping 1.8s ease-out infinite" }}/>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>
                    {realtimeStatus === "connecte" ? "Temps réel connecté" : realtimeStatus === "reconnexion" ? "Reconnexion…" : "Hors ligne"}
                  </div>
                  <div style={{ color: C.t3, fontSize: "10px" }}>YELEN224 PRO v5.1</div>
                </div>
              </div>

              {/* ── Accès rapides — mobile uniquement (.yelen-header-more-extra,
                  masqué ≥1024px). Reprend les 8 actions retirées de la
                  rangée du header, chaque onClick réutilise le handler déjà
                  branché sur l'icône d'origine, aucune nouvelle logique. ── */}
              <div className="yelen-header-more-extra" style={{ gap: "2px", marginBottom: "8px", paddingBottom: "8px", borderBottom: `1px solid ${C.border}` }}>
                {[
                  { key: "search", label: "Recherche", badge: 0, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
                    onClick: () => setActivePopover("search") },
                  ...(tabAllowed(membreRole, "partenariat") ? [{ key: "partenariat", label: "Partenaires", badge: 0, dot: inst?.partenaire_statut === "approuve",
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 4-2 4 4"/></svg>,
                    onClick: () => { setTab("partenariat"); setActivePopover(null); } }] : []),
                  { key: "rdv", label: "RDV entrants", badge: rdvsPending.length, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                    onClick: () => setActivePopover("rdv") },
                  { key: "notifications", label: "Notifications", badge: institutionNotifs.filter(n => !n.lu).length, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
                    onClick: ouvrirNotifications },
                  { key: "questions", label: "Questions clients", badge: questionsNonRepondues, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="9.01" y2="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7"/></svg>,
                    onClick: () => setActivePopover("questions") },
                  { key: "feedback", label: "Envoyer un feedback", badge: 0, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>,
                    onClick: () => setActivePopover("feedback") },
                  { key: "help", label: "Aide & ressources", badge: 0, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
                    onClick: () => setActivePopover("help") },
                  { key: "actualiser", label: "Actualiser les données", badge: 0, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round" style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
                    onClick: () => { loadData(); setActivePopover(null); } },
                ].map(item => (
                  <button key={item.key} onClick={item.onClick} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", color: C.t1, fontSize: "13px", fontWeight: "600", background: "none", border: "none", textAlign: "left", cursor: "pointer", borderRadius: "8px" }}>
                    {item.icon}
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge > 0 && (
                      <span style={{ backgroundColor: C.red, color: "#fff", fontSize: "10px", fontWeight: "800", minWidth: "18px", height: "18px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{item.badge > 9 ? "9+" : item.badge}</span>
                    )}
                    {item.dot && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.gold, flexShrink: 0 }}/>}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <button onClick={() => { setTab("parametres"); setActivePopover(null); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", color: C.t1, fontSize: "13px", fontWeight: "600", background: "none", border: "none", textAlign: "left", cursor: "pointer", borderRadius: "8px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  Changer de thème
                </button>
                <button onClick={() => { setActivePopover(null); setLogoutOpen(true); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", color: C.red, fontSize: "13px", fontWeight: "700", background: "none", border: "none", textAlign: "left", cursor: "pointer", borderRadius: "8px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Se déconnecter
                </button>
              </div>
            </HeaderPopover>
          </div>
        </div>

        {/* ── Portalé pour la même raison que les panneaux (backdropFilter
            du <header> cassait position:fixed:inset:0 — le voile ne
            couvrait que la zone du header au lieu de tout l'écran). ── */}
        {activePopover && typeof document !== "undefined" && createPortal(
          <div className="header-popover-overlay" onClick={() => setActivePopover(null)}/>,
          document.body
        )}

        {/* ── BANDEAU PROGRESSION + STATUT YELEN ── */}
        <ProfilProgressionBandeau inst={inst} instId={instId} setTab={setTab} />

        {/* ── BANDEAU NOUVEAU RDV — se déclenche à chaque INSERT Realtime ── */}
        {bannerRdv && !showBannerDetail && (
          <NouveauRdvBanner rdv={bannerRdv} onClose={() => setBannerRdv(null)} onOpen={() => setShowBannerDetail(true)}/>
        )}

        {/* ── BANDEAU RDV DÉPASSÉS ── */}
        {rdvsEnRetard.length > 0 && !dismissRetard && (
          <div style={{ backgroundColor: `${C.purple}18`, borderBottom: `1px solid ${C.purple}35`, padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", animation: "slideDownBanner 0.3s ease" }}>
            <div style={{ position: "relative", flexShrink: 0, width: "8px", height: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.purple }}/>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: C.purple, animation: "ping 1.5s ease-out infinite" }}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.purple, fontSize: "11px", fontWeight: "800" }}>
                {rdvsEnRetard.length === 1 ? "1 RDV a dépassé son heure sans réponse" : `${rdvsEnRetard.length} RDV ont dépassé leur heure sans réponse`} — acceptez/refusez, ou marquez absent
              </div>
              <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rdvsEnRetard.slice(0, 3).map(r => `${r.citoyen_nom} (${formatHeure(r.heure_rdv)})`).join(" · ")}{rdvsEnRetard.length > 3 ? ` +${rdvsEnRetard.length - 3}` : ""}
              </div>
            </div>
            <button onClick={() => { setTab("rdv"); setRdvFilter("tous"); setDismissRetard(true); }} className="tap" style={{ backgroundColor: C.purple, color: "#fff", fontSize: "10px", fontWeight: "800", padding: "6px 10px", borderRadius: "8px", border: "none", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
              Voir
            </button>
            <button onClick={() => setDismissRetard(true)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "4px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}
      </header>

      <div className="yelen-page">
      {/* ═══════════════════════════════════════════════════════════
          TAB : ACCUEIL FINANCIER (comptable) — même clé d'onglet que
          l'accueil opérationnel, contenu différent selon le rôle : le
          comptable n'a pas de vue d'ensemble générique (décision CEO
          22/07/2026), seulement son tableau de bord financier.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "accueil" && membreRole === "comptable" && <FinanceAccueilTab/>}

      {/* ═══════════════════════════════════════════════════════════
          TAB : ACCUEIL
      ═══════════════════════════════════════════════════════════ */}
      {tab === "accueil" && membreRole !== "comptable" && (() => {
        const actionsPrioritaires = rdvsPending.length + rdvsEnRetard.length + stats.avis_non_lus;
        const now2 = new Date();
        const prochains = rdvs
          .filter(r => !["annule", "termine"].includes(r.statut) && r.date_rdv && r.heure_rdv)
          .filter(r => new Date(`${r.date_rdv}T${r.heure_rdv}`) >= now2)
          .sort((a, b) => new Date(`${a.date_rdv}T${a.heure_rdv}`).getTime() - new Date(`${b.date_rdv}T${b.heure_rdv}`).getTime())
          .slice(0, 2);
        const todayStr = now2.toISOString().slice(0, 10);

        const donutSegments = [
          { label: "Nouveau", value: stats.nouveau, color: C.gold },
          { label: "En attente", value: stats.pending, color: C.orange },
          { label: "Confirmés", value: stats.confirmed, color: C.blue },
          { label: "Terminés", value: stats.done, color: C.green },
          { label: "Annulés", value: stats.cancelled, color: C.red },
        ];
        const donutTotal = donutSegments.reduce((a, b) => a + b.value, 0) || 1;
        const R = 58, CIRC = 2 * Math.PI * R;
        let donutCumul = 0;

        type Rappel = { color: string; titre: string; desc: string; action: () => void };
        const rappelsBruts: (Rappel | null)[] = [
          rdvsEnRetard.length > 0 ? { color: C.orange, titre: "RDV en retard", desc: `${rdvsEnRetard.length} rendez-vous ont dépassé leur heure sans être clôturés.`, action: () => { setTab("rdv"); setRdvFilter("en_attente"); } } : null,
          stats.compte_restreint ? { color: C.red, titre: "Compte restreint", desc: `${stats.ratio_refus}/10 refus détectés — contactez le support Yelen.`, action: () => { window.location.href = "mailto:support@yelen224.com"; } } : (stats.cancelled > 0 ? { color: C.red, titre: "Annulations", desc: `${stats.cancelled} rendez-vous annulés au total.`, action: () => { setTab("rdv"); setRdvFilter("annule"); } } : null),
          rdvsPending.length > 0 ? { color: C.blue, titre: "Nouvelles demandes", desc: `${rdvsPending.length} demande${rdvsPending.length > 1 ? "s" : ""} de RDV en attente de réponse.`, action: () => { setTab("rdv"); setRdvFilter("nouveau"); } } : null,
        ];
        const rappels = rappelsBruts.filter((r): r is Rappel => !!r);

        const lignePts = (() => {
          const W = 100, H = 34, pad = 3;
          const maxC = Math.max(...stats.rdv_par_jour.map(d => d.count), 1);
          return stats.rdv_par_jour.map((d, i) => ({
            x: pad + (i / Math.max(stats.rdv_par_jour.length - 1, 1)) * (W - 2 * pad),
            y: H - pad - (d.count / maxC) * (H - 2 * pad),
            d,
          }));
        })();

        return (
        <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
          <style>{`
            .vd-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
            .vd-analytics{display:flex;flex-direction:column;gap:16px}
            .vd-ops{display:flex;flex-direction:column;gap:16px}
            @media(min-width:1024px){
              .vd-kpis{grid-template-columns:repeat(6,1fr)}
              .vd-analytics{display:grid;grid-template-columns:2fr 2fr 1.5fr;align-items:start}
              .vd-ops{display:grid;grid-template-columns:repeat(3,1fr);align-items:start}
            }
          `}</style>

          {/* ── SECTION 1 : Header ── */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ color: C.t3, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
            <h1 className="yelen-h1" style={{ color: C.t1, marginBottom: "6px" }}>Vue d'ensemble</h1>
            <p style={{ color: C.t2, fontSize: "13px" }}>Suivez la performance de votre établissement en temps réel.</p>
          </div>

          {/* ── SECTION 2 : 6 cartes KPI ── */}
          <div className="vd-kpis" style={{ marginBottom: "20px" }}>
            {[
              { label: "Nouveaux RDV", value: stats.nouveau,   color: C.gold,   variation: stats.kpi_variations.nouveau,   filter: "nouveau",    icon: <><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></> },
              { label: "En attente",   value: stats.pending,   color: C.orange, variation: stats.kpi_variations.pending,   filter: "en_attente", icon: <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></> },
              { label: "Confirmés",    value: stats.confirmed, color: C.blue,   variation: stats.kpi_variations.confirmed, filter: "confirme",   icon: <><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></> },
              { label: "Terminés",     value: stats.done,      color: C.green,  variation: stats.kpi_variations.done,      filter: "effectue",   icon: <><rect x="4" y="4" width="16" height="16" rx="4"/><polyline points="8 12 11 15 16 9"/></> },
              { label: "Annulés",      value: stats.cancelled, color: C.red,    variation: stats.kpi_variations.cancelled, filter: "annule",     icon: <><circle cx="12" cy="12" r="9"/><line x1="14.5" y1="9.5" x2="9.5" y2="14.5"/><line x1="9.5" y1="9.5" x2="14.5" y2="14.5"/></> },
              { label: "Total RDV",    value: stats.rdv_total, color: C.purple, variation: stats.kpi_variations.total,     filter: "tous",       icon: <><line x1="7" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="20" y2="12"/><line x1="7" y1="17" x2="20" y2="17"/><line x1="4" y1="7" x2="4.01" y2="7"/><line x1="4" y1="12" x2="4.01" y2="12"/><line x1="4" y1="17" x2="4.01" y2="17"/></> },
            ].map(k => (
              <div key={k.label} onClick={() => { setTab("rdv"); setRdvFilter(k.filter); }} className="tap yelen-card-hover" style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: "18px", cursor: "pointer" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", backgroundColor: `${k.color}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="2" strokeLinecap="round">{k.icon}</svg>
                </div>
                <div style={{ color: C.t1, fontSize: "26px", fontWeight: "900", letterSpacing: "-0.5px", lineHeight: 1 }}><AnimatedNumber value={k.value}/></div>
                <div style={{ color: C.t2, fontSize: "11px", fontWeight: "700", marginTop: "6px" }}>{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "3px", marginTop: "6px" }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={k.variation >= 0 ? C.green : C.red} strokeWidth="3" strokeLinecap="round" style={{ transform: k.variation < 0 ? "rotate(180deg)" : "none" }}><polyline points="18 15 12 9 6 15"/></svg>
                  <span style={{ color: k.variation >= 0 ? C.green : C.red, fontSize: "10px", fontWeight: "800" }}>{k.variation >= 0 ? "+" : ""}{k.variation}%</span>
                  <span style={{ color: C.t3, fontSize: "10px" }}>vs hier</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Bonus conservé : Aujourd'hui + Semaine/Mois (pas dans le
              spec, donnée réelle distincte non dupliquée ailleurs) ── */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", backgroundColor: C.bgCard, borderRadius: "16px", padding: "16px", border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <div style={{ color: C.t2, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px" }}>Aujourd'hui</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ color: C.t1, fontSize: "34px", fontWeight: "800", letterSpacing: "-1px", lineHeight: 1 }}><AnimatedNumber value={stats.today}/></div>
                <div style={{ color: C.t3, fontSize: "11px" }}>{stats.confirmed} confirmés</div>
              </div>
            </div>
            {[
              { label: "Semaine", value: stats.week, sub: `${stats.evolution_week > 0 ? "+" : ""}${stats.evolution_week}% vs préc.` },
              { label: "Mois",    value: stats.month, sub: `${stats.evolution_month > 0 ? "+" : ""}${stats.evolution_month}% vs préc.` },
            ].map(k => (
              <div key={k.label} style={{ flex: "1 1 140px", backgroundColor: C.bgCard, borderRadius: "16px", padding: "16px", border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div style={{ color: C.t2, fontSize: "10px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px" }}>{k.label}</div>
                <div style={{ color: C.t1, fontSize: "26px", fontWeight: "800", letterSpacing: "-1px", lineHeight: 1 }}><AnimatedNumber value={k.value}/></div>
                <div style={{ color: C.t3, fontSize: "10px", marginTop: "4px" }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── SECTION 3 : Analytics, 3 colonnes ── */}
          <div className="vd-analytics" style={{ marginBottom: "24px" }}>
            <ScoreSante score={stats.score_sante} stats={stats} actionsPrioritaires={actionsPrioritaires} onVoirActions={() => { setTab("rdv"); setRdvFilter("nouveau"); }}/>

            <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Évolution des RDV</span>
                <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700", backgroundColor: C.bg3, padding: "3px 9px", borderRadius: "20px" }}>7 jours</span>
              </div>
              <svg viewBox="0 0 100 34" width="100%" height="90" preserveAspectRatio="none">
                {[0.25, 0.5, 0.75].map(f => <line key={f} x1="3" x2="97" y1={34 - 3 - f * 28} y2={34 - 3 - f * 28} stroke={C.border} strokeWidth="0.4"/>)}
                <path d={lignePts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")} fill="none" stroke={C.blue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                {lignePts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.6" fill={C.blue}/>)}
              </svg>
              <div style={{ display: "flex", marginBottom: "14px" }}>
                {stats.rdv_par_jour.map((d, i) => (
                  <span key={i} style={{ flex: 1, textAlign: "center", color: C.t3, fontSize: "9px", fontWeight: "600" }}>{d.day}</span>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {[
                  { label: "Total RDV", value: String(stats.rdv_total) },
                  { label: "vs semaine dernière", value: `${stats.evolution_week > 0 ? "+" : ""}${stats.evolution_week}%` },
                  { label: "Moyenne / jour", value: (stats.week / 7).toFixed(1) },
                  { label: "Jour le plus chargé", value: stats.peak_day },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900" }}>{s.value}</div>
                    <div style={{ color: C.t3, fontSize: "10px", marginTop: "2px" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "14px", display: "block" }}>Répartition par statut</span>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ position: "relative", width: "132px", height: "132px", flexShrink: 0 }}>
                  <svg width="132" height="132" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="66" cy="66" r={R} fill="none" stroke={C.bg3} strokeWidth="14"/>
                    {donutSegments.map(seg => {
                      const frac = seg.value / donutTotal;
                      const dash = `${frac * CIRC} ${CIRC}`;
                      const offset = -donutCumul * CIRC;
                      donutCumul += frac;
                      return seg.value > 0 ? <circle key={seg.label} cx="66" cy="66" r={R} fill="none" stroke={seg.color} strokeWidth="14" strokeDasharray={dash} strokeDashoffset={offset}/> : null;
                    })}
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: C.t1, fontSize: "24px", fontWeight: "900" }}>{stats.rdv_total}</span>
                    <span style={{ color: C.t3, fontSize: "9px", fontWeight: "700" }}>Total</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: "140px" }}>
                  {donutSegments.map(seg => (
                    <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: seg.color, flexShrink: 0 }}/>
                      <span style={{ color: C.t2, fontSize: "11px", flex: 1 }}>{seg.label}</span>
                      <span style={{ color: C.t1, fontSize: "11px", fontWeight: "800" }}>{seg.value}</span>
                      <span style={{ color: C.t3, fontSize: "10px", width: "34px", textAlign: "right" }}>{Math.round((seg.value / donutTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setTab("rdv")} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "10px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
                Voir le détail <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

          {/* ── SECTION 4 : Zone opérationnelle, 3 colonnes ── */}
          <div className="vd-ops" style={{ marginBottom: "24px" }}>
            <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "14px", display: "block" }}>Prochains rendez-vous</span>
              {prochains.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "12px", padding: "12px 0" }}>Aucun rendez-vous à venir.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {prochains.map((r, i) => {
                    const presenceConfirmee = r.presence_status === "present";
                    const isRetardProchain = rdvEstEnRetard(r.date_rdv, r.heure_rdv);
                    const s = stInfo(
                      r.presence_status === "absent"
                        ? "absent"
                        : (isRetardProchain && (r.statut === "en_attente" || r.statut === "nouveau"))
                        ? "en_retard"
                        : r.statut,
                      C
                    );
                    return (
                      <div key={r.id} style={{ paddingTop: i > 0 ? "12px" : 0, marginTop: i > 0 ? "12px" : 0, borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                          <div style={{ textAlign: "center", flexShrink: 0, width: "40px" }}>
                            <div style={{ color: C.t1, fontSize: "13px", fontWeight: "900" }}>{formatHeure(r.heure_rdv)}</div>
                            {r.date_rdv === todayStr && <div style={{ color: C.gold, fontSize: "8px", fontWeight: "800" }}>AUJ.</div>}
                          </div>
                          <div onClick={() => setSelectedRDV(r)} className="tap" style={{ width: "34px", height: "34px", borderRadius: "50%", overflow: "hidden", backgroundColor: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900", color: s.c, flexShrink: 0, cursor: "pointer" }}>
                            {r.citoyen_photo ? <img src={r.citoyen_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : r.citoyen_nom.slice(0, 2).toUpperCase()}
                          </div>
                          <div onClick={() => setSelectedRDV(r)} className="tap" style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{r.citoyen_nom}</span>
                              <span style={{ backgroundColor: s.bg, color: s.c, fontSize: "8px", fontWeight: "800", padding: "1px 6px", borderRadius: "20px", textTransform: "uppercase" }}>{s.l}</span>
                              {r.id === imminentRdvId && (
                                <span style={{ backgroundColor: "#EC489920", color: "#EC4899", fontSize: "8px", fontWeight: "800", padding: "1px 6px", borderRadius: "20px", textTransform: "uppercase" }}>Imminent</span>
                              )}
                            </div>
                            <div style={{ color: C.t2, fontSize: "10.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.objet || "RDV général"}{r.guichet ? ` · 📍 ${r.guichet}` : ""}</div>
                          </div>
                        </div>
                        {r.statut === "nouveau" ? (
                          <button onClick={() => handleAccept(r.id)} disabled={!!actionLoading} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${C.green}, #009e76)`, color: "#fff", fontWeight: "800", fontSize: "12px", padding: "9px", borderRadius: "10px", border: "none", cursor: "pointer" }}>
                            {actionLoading === r.id ? "…" : "Confirmer"}
                          </button>
                        ) : (r.statut === "en_attente" || r.statut === "confirme") && presenceConfirmee ? (
                          <button onClick={() => handleTermine(r.id)} disabled={!!actionLoading} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${C.purple}, #7a55d0)`, color: "#fff", fontWeight: "800", fontSize: "12px", padding: "9px", borderRadius: "10px", border: "none", cursor: "pointer" }}>
                            {actionLoading === r.id ? "…" : "Marquer terminé"}
                          </button>
                        ) : (
                          <button onClick={() => setSelectedRDV(r)} className="tap" style={{ width: "100%", backgroundColor: C.bg3, color: C.t2, fontWeight: "700", fontSize: "12px", padding: "9px", borderRadius: "10px", border: `1px solid ${C.border}`, cursor: "pointer" }}>Voir le détail</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <button onClick={() => setTab("rdv")} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "14px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
                Voir tous les prochains RDV <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
              <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "14px", display: "block" }}>Rappels importants</span>
              {rappels.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "12px" }}>Aucun rappel pour l'instant — tout est à jour.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {rappels.map((r, i) => (
                    <div key={i} style={{ backgroundColor: `${r.color}0F`, border: `1px solid ${r.color}25`, borderRadius: "14px", padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span style={{ color: r.color, fontSize: "12px", fontWeight: "800" }}>{r.titre}</span>
                      </div>
                      <div style={{ color: C.t2, fontSize: "11px", lineHeight: 1.5, marginBottom: "6px" }}>{r.desc}</div>
                      <button onClick={r.action} className="tap" style={{ background: "none", border: "none", color: r.color, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "4px" }}>
                        Voir maintenant <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div onClick={() => setTab("analyse")} className="tap yelen-card-hover" style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, cursor: "pointer" }}>
              <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "14px", display: "block" }}>Satisfaction clients</span>
              <div style={{ textAlign: "center", marginBottom: "14px" }}>
                <div style={{ fontSize: "36px", fontWeight: "900", letterSpacing: "-1.5px", color: stats.moyenne_avis >= 4 ? C.green : stats.moyenne_avis >= 3 ? C.gold : C.red, lineHeight: 1 }}>
                  {stats.moyenne_avis > 0 ? stats.moyenne_avis.toFixed(1) : "0.0"} <span style={{ fontSize: "16px", color: C.t3, fontWeight: "700" }}>/5</span>
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: "6px" }}><Stars note={stats.moyenne_avis} size={16}/></div>
                <div style={{ color: C.t3, fontSize: "10px", marginTop: "4px" }}>{stats.avis_count} avis</div>
              </div>
              {stats.notes_distribution.map(nd => (
                <div key={nd.note} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
                  <span style={{ color: C.t3, fontSize: "9px", width: "36px", flexShrink: 0 }}>{"★".repeat(nd.note)}{"☆".repeat(5 - nd.note)}</span>
                  <div style={{ flex: 1, height: "5px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${nd.pct}%`, background: nd.note >= 4 ? C.green : nd.note >= 3 ? C.gold : C.red, borderRadius: "3px" }}/>
                  </div>
                  <span style={{ color: C.t3, fontSize: "9px", width: "26px", textAlign: "right" }}>{Math.round(nd.pct)}%</span>
                </div>
              ))}
              <div style={{ color: C.gold, fontSize: "11px", fontWeight: "700", marginTop: "10px", display: "flex", alignItems: "center", gap: "4px" }}>
                Voir les avis clients <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
          </div>

          {/* ── Bonus conservé : objectifs hebdo, accès rapides, activité
              récente — hors des 5 sections du spec mais fonctionnalité
              réelle existante, gardée telle quelle ── */}
          <ObjectifsHebdo stats={stats}/>

          <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: "14px" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>Accès rapides</span>
            </div>
            {(() => {
              const accesRapidesItems = ([
                { label: "Annonces",    tab: "communication", href: undefined, icon: C.orange, svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg> },
                { label: "Mes services",tab: "services",      href: undefined, icon: C.blue,   svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
                { label: "Signalements",tab: "communication", href: undefined, icon: C.red,    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
                { label: "FAQ",         tab: undefined,       href: `/faq`,    icon: C.teal,   svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
              ] as { label: string; tab?: typeof tab; href?: string; icon: string; svg: React.ReactNode }[])
                .filter(item => !item.tab || tabAllowed(membreRole, item.tab));
              return (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${accesRapidesItems.length}, 1fr)` }}>
                  {accesRapidesItems.map((item, i) => {
                    const content = (
                      <>
                        <div style={{ width: "38px", height: "38px", borderRadius: "11px", backgroundColor: `${item.icon}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.svg}</div>
                        <span style={{ color: C.t2, fontSize: "9px", fontWeight: "700" }}>{item.label}</span>
                      </>
                    );
                    const isLast = i === accesRapidesItems.length - 1;
                    const style: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "14px 8px", textDecoration: "none", borderRight: isLast ? "none" : `1px solid ${C.border}` };
                    return item.tab ? (
                      <button key={i} onClick={() => setTab(item.tab!)} className="tap" style={{ ...style, background: "transparent", border: "none", borderRight: isLast ? "none" : `1px solid ${C.border}`, cursor: "pointer" }}>{content}</button>
                    ) : (
                      <Link key={i} href={item.href!} style={style}>{content}</Link>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {stats.recent_activity.length > 0 && (
            <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: "20px" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>Activité récente</span>
              </div>
              {stats.recent_activity.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: i < stats.recent_activity.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: a.color, flexShrink: 0 }}/>
                  <div style={{ flex: 1, color: C.t2, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</div>
                  <span style={{ color: C.t3, fontSize: "10px", flexShrink: 0 }}>{a.time}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", padding: "6px 4px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green }}/>
              <span style={{ color: C.t3, fontSize: "11px" }}>Dernière mise à jour : {lastUpdated ? timeAgo(lastUpdated.toISOString()) : "—"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <Link href="/cgu" style={{ color: C.t3, fontSize: "11px", textDecoration: "none" }}>CGU</Link>
              <Link href="/confidentialite" style={{ color: C.t3, fontSize: "11px", textDecoration: "none" }}>Confidentialité</Link>
              <span style={{ color: C.t3, fontSize: "11px", fontWeight: "700" }}>© 2026 Yelen224 by SemPya224</span>
            </div>
            <button onClick={() => loadData()} disabled={refreshing} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "700", cursor: refreshing ? "default" : "pointer" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Actualiser les données
            </button>
          </div>
        </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════
          TAB : RDV
      ═══════════════════════════════════════════════════════════ */}
      {tab === "rdv" && (
        <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
          <style>{`
            .rdv-card-inner{display:flex;flex-direction:column;gap:10px;padding:14px}
            .rdv-extra-filters{display:none;flex-direction:column;gap:8px;margin-bottom:12px}
            .rdv-extra-filters.open{display:flex}
            .rdv-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px}
            @media(min-width:1024px){
              .rdv-card-inner{display:grid;grid-template-columns:52px 44px 1fr auto auto;align-items:center;gap:16px;padding:16px 20px;min-height:120px}
              .rdv-extra-filters{display:flex!important;flex-direction:row}
              .rdv-kpis{grid-template-columns:repeat(6,1fr)}
            }
          `}</style>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <div>
              <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Rendez-vous</h1>
              <p style={{ color: C.t2, fontSize: "12.5px", marginTop: "2px" }}>Gérez tous les rendez-vous de votre établissement.</p>
            </div>
            <button onClick={exportCsv} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "8px 12px", color: C.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>

          {/* ── 6 cartes KPI — fonds pastel, icône circulaire par carte ── */}
          <div className="rdv-kpis">
            {[
              { label: "Nouveau",   value: stats.nouveau,   color: C.gold,   icon: <><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></> },
              { label: "En attente",value: stats.pending,   color: C.orange, icon: <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></> },
              { label: "Confirmés", value: stats.confirmed, color: C.blue,   icon: <><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></> },
              { label: "Terminés",  value: stats.done,      color: C.green,  icon: <><rect x="4" y="4" width="16" height="16" rx="4"/><polyline points="8 12 11 15 16 9"/></> },
              { label: "Annulés",   value: stats.cancelled, color: C.red,    icon: <><circle cx="12" cy="12" r="9"/><line x1="14.5" y1="9.5" x2="9.5" y2="14.5"/><line x1="9.5" y1="9.5" x2="14.5" y2="14.5"/></> },
              { label: "Total",     value: stats.rdv_total, color: C.purple, icon: <><line x1="7" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="20" y2="12"/><line x1="7" y1="17" x2="20" y2="17"/><line x1="4" y1="7" x2="4.01" y2="7"/><line x1="4" y1="12" x2="4.01" y2="12"/><line x1="4" y1="17" x2="4.01" y2="17"/></> },
            ].map(k => (
              <div key={k.label} style={{ backgroundColor: `${k.color}0F`, borderRadius: "18px", padding: "14px 16px", border: `1px solid ${k.color}25`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <div>
                  <div style={{ color: k.color, fontSize: "22px", fontWeight: "900" }}>{k.value}</div>
                  <div style={{ color: C.t2, fontSize: "11px", fontWeight: "700" }}>{k.label}</div>
                </div>
                <div style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: `${k.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="2" strokeLinecap="round">{k.icon}</svg>
                </div>
              </div>
            ))}
          </div>

          {/* ── Recherche + Date + Service + Filtres ── */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "0 14px", display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={rdvSearch} onChange={e => setRdvSearch(e.target.value)} placeholder="Rechercher un rendez-vous, un client, un service…" style={{ flex: 1, padding: "12px 0", fontSize: "13px" }}/>
            </div>
            <button onClick={() => setRdvFiltersOpen(v => !v)} className="tap" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px", backgroundColor: rdvFiltersOpen ? `${C.gold}15` : C.bgCard, border: `1px solid ${rdvFiltersOpen ? C.gold + "40" : C.border}`, borderRadius: "16px", padding: "0 14px", color: rdvFiltersOpen ? C.gold : C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              Filtres
            </button>
          </div>
          <div className={`rdv-extra-filters${rdvFiltersOpen ? " open" : ""}`}>
            <input type="date" value={rdvDateFilter} onChange={e => setRdvDateFilter(e.target.value)} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "9px 12px", fontSize: "12px", color: C.t1, flex: 1 }}/>
            <select value={rdvServiceFilter} onChange={e => setRdvServiceFilter(e.target.value)} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "9px 12px", fontSize: "12px", color: C.t1, flex: 1 }}>
              <option value="">Tous les services</option>
              {rdvServiceOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* ── Badges statut ── */}
          <div style={{ display: "flex", gap: "7px", marginBottom: "10px", overflowX: "auto" }}>
            {[
              { key: "nouveau",    label: "Nouveaux",    count: stats.nouveau },
              { key: "en_attente", label: "En attente",  count: stats.pending },
              { key: "confirme",   label: "Confirmés",   count: stats.confirmed },
              { key: "effectue",   label: "Effectués",   count: stats.done },
              { key: "annule",     label: "Annulés",     count: stats.cancelled },
              { key: "absent",     label: "Absents",     count: stats.absents },
              { key: "tous",       label: "Tous",        count: rdvs.length },
            ].map(f => {
              const active = rdvFilter === f.key;
              const sc = f.key === "tous" ? { c: C.gold, bg: `${C.gold}20` } : stInfo(f.key, C);
              const isNouveau = f.key === "nouveau";
              // "Nouveau"/"En attente"/"Tous" partagent la même couleur dorée —
              // une fois sélectionnés, ils doivent afficher le vrai doré plein
              // (comme les boutons solides du dashboard), pas un simple fond
              // pastel léger. Les autres filtres (Confirmés/Effectués/Annulés/
              // Absents) gardent leur propre couleur et leur style inchangés
              // (signalé par Bryan le 19/07/2026).
              const isGoldFilter = isNouveau || f.key === "en_attente" || f.key === "tous";
              return (
                <button key={f.key} onClick={() => setRdvFilter(f.key)} className="tap" style={{
                  flexShrink: 0,
                  backgroundColor: active ? (isGoldFilter ? sc.c : sc.bg) : (isNouveau ? `${C.gold}30` : C.bgCard),
                  border: `1.5px solid ${isNouveau ? sc.c : (active ? sc.c + "40" : C.border)}`,
                  borderRadius: isNouveau ? "22px" : "20px",
                  padding: isNouveau ? "10px 18px" : "6px 12px",
                  color: active ? (isGoldFilter ? "#000" : sc.c) : (isNouveau ? sc.c : C.t2),
                  fontSize: isNouveau ? "13px" : "11px",
                  fontWeight: isNouveau ? "900" : (active ? "800" : "600"),
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: isNouveau ? "7px" : "5px",
                  boxShadow: isNouveau ? `0 3px 12px ${sc.c}35` : "none",
                }}>
                  {isNouveau && (
                    active ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={sc.c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                    )
                  )}
                  {f.label}
                  <span style={{ backgroundColor: isNouveau ? (active ? "rgba(0,0,0,0.18)" : `${sc.c}25`) : (active ? `${sc.c}20` : C.bg3), color: isNouveau ? (active ? "#000" : sc.c) : (active ? sc.c : C.t3), fontSize: isNouveau ? "10.5px" : "9px", fontWeight: "800", padding: isNouveau ? "2px 7px" : "1px 5px", borderRadius: "10px" }}>{f.count}</span>
                </button>
              );
            })}
          </div>

          {/* ── Trier par ── */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>Trier par :</span>
            <select value={rdvSort} onChange={e => setRdvSort(e.target.value as "prochain" | "recent" | "ancien")} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "6px 10px", fontSize: "12px", color: C.t1, fontWeight: "700" }}>
              <option value="prochain">Prochain d'abord</option>
              <option value="recent">Plus récent</option>
              <option value="ancien">Plus ancien</option>
            </select>
          </div>

          {filteredRdvs.length === 0 ? (
            rdvFilter === "nouveau" ? (
              <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "48px 24px", textAlign: "center", border: `1px solid ${C.border}` }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ color: C.green, fontSize: "15px", fontWeight: "800", marginBottom: "4px" }}>Tout est traité</div>
                <div style={{ color: C.t3, fontSize: "12px" }}>Aucune nouvelle demande en attente</div>
              </div>
            ) : (
              <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", padding: "40px 20px", textAlign: "center", border: `1px solid ${C.border}` }}>
                <p style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Aucun rendez-vous trouvé</p>
              </div>
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {pageRdvs.map(r => {
                const presenceConfirmee = r.presence_status === "present";
                const isRetard = rdvEstEnRetard(r.date_rdv, r.heure_rdv);
                const nonResolu = r.statut === "nouveau" || (r.statut === "en_attente" && r.presence_status !== "absent");
                const badgeStatut = r.presence_status === "absent"
                  ? "absent"
                  : (isRetard && nonResolu)
                  ? "en_retard"
                  : r.statut;
                const s = stInfo(badgeStatut, C);
                const borderColor = isRetard && nonResolu ? C.red : s.c;
                const clientExistant = (rdvCountByCitoyen.get(r.citoyen_id) ?? 0) > 1;
                const service = extraireService(r.objet);
                const dateObj = parseLocalDate(r.date_rdv);
                const jourAbrege = dateObj.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "").toUpperCase();
                const moisAbrege = dateObj.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "").toUpperCase();
                const quickBadges = [
                  r.est_payant ? { icon: "💳", label: `Payant · ${(r.service_payant_prix ?? 0).toLocaleString("fr-FR")} FCFA` } : null,
                  r.duree_minutes ? { icon: "⏱", label: `${r.duree_minutes} min` } : null,
                  r.citoyen_phone ? { icon: "📞", label: r.citoyen_phone } : null,
                  { icon: "🏷", label: service },
                  r.guichet ? { icon: "📍", label: r.guichet } : null,
                  r.pour_autre ? { icon: "👥", label: `Pour ${r.nom_autre || "un tiers"}` } : null,
                ].filter((b): b is { icon: string; label: string } => !!b);
                const menuOpen = rdvMenuOpenId === r.id;
                return (
                  <div key={r.id} style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "20px", border: `1px solid ${C.border}`, borderLeft: `4px solid ${borderColor}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "visible" }}>
                    <div className="rdv-card-inner">
                      <div style={{ textAlign: "center", flexShrink: 0, display: "flex", flexDirection: "row", alignItems: "center", gap: "8px" }}>
                        <div>
                          <div style={{ color: C.t3, fontSize: "9px", fontWeight: "800" }}>{jourAbrege}</div>
                          <div style={{ color: C.t1, fontSize: "18px", fontWeight: "900", lineHeight: 1.1 }}>{dateObj.getDate()}</div>
                          <div style={{ color: C.t3, fontSize: "9px", fontWeight: "800" }}>{moisAbrege}</div>
                        </div>
                        <div>
                          <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: "700" }}>{r.heure_rdv ? formatHeure(r.heure_rdv) : "—"}</div>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: s.c, margin: "4px auto 0" }}/>
                        </div>
                      </div>

                      <div onClick={() => setSelectedRDV(r)} className="tap" style={{ width: "56px", height: "56px", borderRadius: "50%", overflow: "hidden", backgroundColor: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "900", color: s.c, flexShrink: 0, cursor: "pointer" }}>
                        {r.citoyen_photo ? <img src={r.citoyen_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : r.citoyen_nom.slice(0, 2).toUpperCase()}
                      </div>

                      <div onClick={() => setSelectedRDV(r)} className="tap" style={{ minWidth: 0, cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>{r.citoyen_nom}</span>
                          <span style={{ backgroundColor: s.bg, color: s.c, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase", flexShrink: 0 }}>{s.l}</span>
                          {clientExistant && (
                            <span style={{ backgroundColor: C.blueL, color: C.blue, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase", flexShrink: 0 }}>Client existant</span>
                          )}
                          {r.id === imminentRdvId && (
                            <span style={{ backgroundColor: "#EC489920", color: "#EC4899", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase", flexShrink: 0 }}>Imminent</span>
                          )}
                        </div>
                        <div style={{ color: C.t2, fontSize: "12px", fontWeight: "700", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.objet || "RDV général"}</div>
                        {r.motif_report && (
                          <div style={{ color: "#F59E0B", fontSize: "11px", fontWeight: "700", marginTop: "3px" }}>
                            🔄 Reporté par le citoyen — {r.motif_report}
                          </div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "7px" }}>
                          {quickBadges.map((b, i) => (
                            <span key={i} style={{ backgroundColor: C.bg3, color: C.t2, fontSize: "10px", fontWeight: "600", padding: "3px 8px", borderRadius: "20px", whiteSpace: "nowrap" }}>{b.icon} {b.label}</span>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button onClick={() => setSelectedRDV(r)} className="tap" title="Voir" style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button onClick={() => setRdvMenuOpenId(menuOpen ? null : r.id)} className="tap" title="Plus" style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: menuOpen ? `${C.gold}15` : C.bg3, border: `1px solid ${menuOpen ? C.gold + "40" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                        </button>
                      </div>

                      <div style={{ flexShrink: 0 }}>
                        {r.statut === "nouveau" ? (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button onClick={() => handleAccept(r.id)} disabled={!!actionLoading} className="tap" style={{ background: `linear-gradient(135deg, ${C.green}, #009e76)`, color: "#fff", fontWeight: "800", fontSize: "12px", padding: "10px 14px", borderRadius: "10px", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
                              {actionLoading === r.id ? "…" : "Accepter"}
                            </button>
                            {isRetard && (
                              <button onClick={() => handleAbsent(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: C.redL, color: C.red, fontWeight: "800", fontSize: "12px", padding: "10px 14px", borderRadius: "10px", border: `1px solid ${C.red}25`, cursor: "pointer", whiteSpace: "nowrap" }}>
                                Absent
                              </button>
                            )}
                            <button onClick={() => setRdvMenuOpenId(menuOpen ? null : r.id)} className="tap" style={{ width: "34px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                          </div>
                        ) : (r.presence_status !== "absent" && r.statut === "en_attente") ? (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button onClick={() => handlePrendreEnCharge(r)} disabled={!!actionLoading} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "10px 14px", borderRadius: "10px", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
                              Prendre en charge
                            </button>
                            {isRetard && (
                              <button onClick={() => handleAbsent(r.id)} disabled={!!actionLoading} className="tap" style={{ backgroundColor: C.orangeL, color: C.orange, fontWeight: "800", fontSize: "12px", padding: "10px 14px", borderRadius: "10px", border: `1px solid ${C.orange}25`, cursor: "pointer", whiteSpace: "nowrap" }}>
                                {actionLoading === r.id ? "…" : "Absent"}
                              </button>
                            )}
                            <button onClick={() => setRdvMenuOpenId(menuOpen ? null : r.id)} className="tap" style={{ width: "34px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                          </div>
                        ) : (r.presence_status !== "absent" && r.statut === "confirme") ? (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button onClick={() => presenceConfirmee && setTermineDialog(r)} disabled={!!actionLoading || !presenceConfirmee} title={presenceConfirmee ? undefined : "Présence non confirmée"} className="tap" style={{ background: presenceConfirmee ? `linear-gradient(135deg, ${C.purple}, #7a55d0)` : C.bg3, color: presenceConfirmee ? "#fff" : C.t3, fontWeight: "800", fontSize: "12px", padding: "10px 14px", borderRadius: "10px", border: presenceConfirmee ? "none" : `1px solid ${C.border}`, cursor: presenceConfirmee ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                              Marquer terminé
                            </button>
                            <button onClick={() => setRdvMenuOpenId(menuOpen ? null : r.id)} className="tap" style={{ width: "34px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                          </div>
                        ) : (
                          <span style={{ backgroundColor: s.bg, color: s.c, fontWeight: "800", fontSize: "11px", padding: "9px 14px", borderRadius: "10px", whiteSpace: "nowrap" }}>{s.l}</span>
                        )}
                      </div>
                    </div>

                    {menuOpen && (
                      <div style={{ position: "absolute", right: "14px", top: "calc(100% + 4px)", zIndex: 20, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "4px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", minWidth: "160px" }}>
                        {r.statut === "nouveau" && (
                          <button onClick={() => { setRdvMenuOpenId(null); handleRefuse(r.id); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "9px 10px", background: "none", border: "none", color: C.red, fontSize: "12px", fontWeight: "700", cursor: "pointer", borderRadius: "6px" }}>Refuser</button>
                        )}
                        <button onClick={() => { setRdvMenuOpenId(null); setSelectedRDV(r); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "9px 10px", background: "none", border: "none", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer", borderRadius: "6px" }}>Voir détails</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {rdvMenuOpenId && <div style={{ position: "fixed", inset: 0, zIndex: 15 }} onClick={() => setRdvMenuOpenId(null)}/>}

          {/* ── Pagination ── */}
          {filteredRdvs.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginTop: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button onClick={() => setRdvPage(p => Math.max(1, p - 1))} disabled={rdvPageClamped === 1} className="tap" style={{ width: "30px", height: "30px", borderRadius: "8px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, color: C.t2, cursor: rdvPageClamped === 1 ? "not-allowed" : "pointer", opacity: rdvPageClamped === 1 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                {(() => {
                  const pages: (number | "…")[] = [];
                  for (let p = 1; p <= rdvTotalPages; p++) {
                    if (p === 1 || p === rdvTotalPages || Math.abs(p - rdvPageClamped) <= 1) pages.push(p);
                    else if (pages[pages.length - 1] !== "…") pages.push("…");
                  }
                  return pages.map((p, i) => p === "…" ? (
                    <span key={`e${i}`} style={{ color: C.t3, fontSize: "12px", padding: "0 4px" }}>…</span>
                  ) : (
                    <button key={p} onClick={() => setRdvPage(p)} className="tap" style={{ minWidth: "30px", height: "30px", borderRadius: "8px", backgroundColor: p === rdvPageClamped ? `${C.gold}20` : C.bgCard, border: `1px solid ${p === rdvPageClamped ? C.gold + "40" : C.border}`, color: p === rdvPageClamped ? C.gold : C.t2, fontSize: "12px", fontWeight: p === rdvPageClamped ? "800" : "600", cursor: "pointer" }}>{p}</button>
                  ));
                })()}
                <button onClick={() => setRdvPage(p => Math.min(rdvTotalPages, p + 1))} disabled={rdvPageClamped === rdvTotalPages} className="tap" style={{ width: "30px", height: "30px", borderRadius: "8px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, color: C.t2, cursor: rdvPageClamped === rdvTotalPages ? "not-allowed" : "pointer", opacity: rdvPageClamped === rdvTotalPages ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>Lignes par page</span>
                <select value={rdvPageSize} onChange={e => setRdvPageSize(Number(e.target.value))} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "12px", color: C.t1, fontWeight: "700" }}>
                  {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
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
                  <div style={{ width: "3px", height: "16px", background: C.green, borderRadius: "2px" }}/>
                  <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>RDV Payants — validation en attente</span>
                  <span style={{ backgroundColor: C.green, color: "#000", fontSize: "9px", fontWeight: "900", padding: "2px 7px", borderRadius: "20px" }}>{payants.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {payants.map(r => (
                    <div key={r.id} style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.green}25`, borderLeft: `3px solid ${C.green}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>{r.citoyen_nom}</div>
                        <div style={{ color: C.t2, fontSize: "11px" }}>{r.objet}</div>
                        <div style={{ color: C.t3, fontSize: "10px", marginTop: "2px" }}>{formatDate(r.date_rdv, { day: "numeric", month: "short" })} · {formatHeure(r.heure_rdv)}</div>
                      </div>
                      <a href="/institution/valider-rdv" style={{ backgroundColor: C.green, color: "#000", fontSize: "11px", fontWeight: "800", padding: "8px 12px", borderRadius: "10px", textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center", gap: "5px" }}>
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
        <>
          {tabReadOnly(membreRole, "disponibilites") && <ReadOnlyNotice C={C}/>}
          <DisponibilitesTab disponibilites={inst.disponibilites} onSaved={loadData} access={tabReadOnly(membreRole, "disponibilites") ? "read" : "full"}/>
        </>
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
        <>
          {tabReadOnly(membreRole, "communication") && <ReadOnlyNotice C={C}/>}
          <CommunicationTab instId={instId} access={tabReadOnly(membreRole, "communication") ? "read" : "full"} canPublishAnnonce={membreRole !== null && can(membreRole, "communication.publish_annonce")}/>
        </>
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
            <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Scanner QR</h1>
            <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Historique des rendez-vous dont la présence a été confirmée par scan.</p>

            {scanned.length === 0 ? (
              <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "48px 20px", textAlign: "center" }}>
                <p style={{ color: C.t1, fontSize: "15px", fontWeight: "700", margin: "0 0 8px" }}>Aucun scan pour le moment</p>
                <p style={{ color: C.t2, fontSize: "13px", margin: 0 }}>Utilisez le bouton Scanner (en-tête ou menu) pour confirmer la présence d'un client à son arrivée.</p>
              </div>
            ) : (
              <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                {scanned.map((r, i) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: i < scanned.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.citoyen_nom}</div>
                      <div style={{ color: C.t3, fontSize: "11.5px" }}>{r.objet || "RDV général"} · {formatDate(r.date_rdv, { day: "numeric", month: "short" })} {formatHeure(r.heure_rdv)}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ backgroundColor: C.greenL, color: C.green, fontSize: "10.5px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>Présence confirmée</span>
                      {r.presence_confirmed_at && (
                        <div style={{ color: C.t3, fontSize: "10px", marginTop: "4px" }}>{formatDate(r.presence_confirmed_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
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
        <ValiderRdvTab instId={instId} preloadBookingId={preloadBookingId} onPreloadConsumed={() => setPreloadBookingId(null)}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : PROFIL ENTREPRISE — distinct de Profil Responsable, accès
          via le petit menu "Compte" (sidebar), pas dans le menu principal.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "profil-entreprise" && (
        <ProfilEntrepriseTab instId={instId} onToast={showToast}/>
      )}

      {tab === "conditions-informations" && (
        <ConditionsInformationsTab instId={instId} onToast={showToast}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : AVIS & RÉPUTATION — écran "Santé du compte", accès via
          le menu Compte (pas le menu principal).
      ═══════════════════════════════════════════════════════════ */}
      {tab === "avis-reputation" && (
        <div style={{ padding: "16px" }}>
          {tabReadOnly(membreRole, "avis-reputation") && <ReadOnlyNotice C={C}/>}
          <AvisReputationTab instId={instId} onToast={showToast} access={tabReadOnly(membreRole, "avis-reputation") ? "read" : "full"}/>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : PROFIL RESPONSABLE — table institution_responsables séparée
      ═══════════════════════════════════════════════════════════ */}
      {tab === "profil-responsable" && (
        <>
          {tabReadOnly(membreRole, "profil-responsable") && <ReadOnlyNotice C={C}/>}
          <ProfilResponsableTab instId={instId} onToast={showToast} access={tabReadOnly(membreRole, "profil-responsable") ? "read" : "full"}/>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : DOCUMENTS — vérification institutionnelle, remplace
          l'ancien /institution/document. Accès via menu Compte.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "documents" && (
        <>
          {tabReadOnly(membreRole, "documents") && <ReadOnlyNotice C={C}/>}
          <DocumentsTab instId={instId} onToast={showToast} access={tabReadOnly(membreRole, "documents") ? "read" : "full"}/>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ONGLETS FINANCE (comptable) — Phase B RBAC + Phases C-G contenu.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "paiements" && <PaiementsTab instId={instId} onToast={showToast} isAdmin={isAdmin}/>}
      {tab === "transactions" && <TransactionsTab instId={instId}/>}
      {tab === "historique-financier" && <HistoriqueFinancierTab instId={instId}/>}
      {tab === "facturation" && <FacturationTab instId={instId} onToast={showToast} isAdmin={isAdmin}/>}
      {tab === "rapports" && <RapportsTab instId={instId}/>}
      {tab === "documents-financiers" && <DocumentsFinanciersTab instId={instId} onToast={showToast}/>}
      {tab === "documents-clients" && <DocumentsClientsTab instId={instId} onToast={showToast}/>}
      {tab === "partenariat" && (
        <>
          {tabReadOnly(membreRole, "partenariat") && <ReadOnlyNotice C={C}/>}
          <PartenariatTab instId={instId} access={tabReadOnly(membreRole, "partenariat") ? "read" : "full"}/>
        </>
      )}
      {tab === "mes-offres" && (
        <>
          {tabReadOnly(membreRole, "mes-offres") && <ReadOnlyNotice C={C}/>}
          <MesOffresTab instId={instId} onToast={showToast} access={tabReadOnly(membreRole, "mes-offres") ? "read" : "full"}/>
        </>
      )}
      {tab === "messagerie" && (
        <>
          {tabReadOnly(membreRole, "messagerie") && <ReadOnlyNotice C={C}/>}
          <MessagerieTab onToast={showToast} initialCitoyenId={messagerieCitoyenInitial}/>
        </>
      )}
      {tab === "questions-clients" && (
        <QuestionsClientsTab readOnly={!(membreRole !== null && can(membreRole, "questions.repondre"))} onToast={showToast}/>
      )}
      {tab === "profil" && <ProfilTab onToast={showToast}/>}

      {/* ═══════════════════════════════════════════════════════════
          TAB : MES CLIENTS — fiche + timeline des RDV avec CETTE
          institution, notes internes persistées (notes_clients).
          Accès via menu Compte.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "mes-clients" && (
        <>
          {tabReadOnly(membreRole, "mes-clients") && <ReadOnlyNotice C={C}/>}
          <MesClientsTab instId={instId} onToast={showToast} isAdmin={isAdmin} access={tabReadOnly(membreRole, "mes-clients") ? "read" : "full"} onOuvrirMessagerie={tabAllowed(membreRole, "messagerie") ? ouvrirMessagerieClient : undefined}/>
        </>
      )}

      {tab === "equipe" && (
        <EquipeTab instId={instId} onToast={showToast}/>
      )}

      {tab === "journal" && (
        <JournalTab instId={instId} onToast={showToast}/>
      )}

      {tab === "espace-travail" && (
        <EspaceTravailTab instId={instId} onToast={showToast}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : RENDEZ-VOUS PASSÉS — historique global filtrable,
          suivi par RDV (rdv.notes) et rappel citoyen. Accès via menu Compte.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "rdv-historique" && (
        <RdvPasseTab instId={instId} onToast={showToast}/>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : ANALYSE
      ═══════════════════════════════════════════════════════════ */}
      {tab === "analyse" && (
        <div style={{ animation: "fadeUp 0.2s ease" }}>
          <div style={{ padding: "16px 16px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.blue}30, ${C.blue}10)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <div>
                <h1 style={{ color: C.t1, fontSize: "20px", fontWeight: "900", letterSpacing: "-0.4px" }}>Centre d'Analyse</h1>
                <p style={{ color: C.t3, fontSize: "10px" }}>Intelligence stratégique pour scaler votre activité</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px", overflowX: "auto", paddingBottom: "2px" }}>
              {[
                { key: "tunnel",  label: "Tunnel",     icon: "🎯" },
                { key: "heatmap", label: "Heatmap",    icon: "🔥" },
                { key: "geo",     label: "Géographie", icon: "🗺" },
                { key: "crm",     label: "Mes Clients",icon: "👥" },
              ].map(t => (
                <button key={t.key} onClick={() => setAnalyseTab(t.key as any)} className="tap" style={{ flexShrink: 0, backgroundColor: analyseTab === t.key ? `${C.blue}20` : C.bgCard, border: `1px solid ${analyseTab === t.key ? C.blue + "40" : C.border}`, borderRadius: "20px", padding: "7px 14px", color: analyseTab === t.key ? C.blue : C.t2, fontSize: "11px", fontWeight: analyseTab === t.key ? "800" : "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "8px", marginBottom: "14px" }}>
              {[
                { label: "Clients actifs",     value: clients.length, color: C.purple },
                { label: "Heure de pointe",    value: stats.peak_hour, color: C.orange },
                { label: "Taux confirmation",  value: `${stats.taux_confirmation}%`, color: C.green },
                { label: "Satisfaction",       value: stats.moyenne_avis > 0 ? `${stats.moyenne_avis}/5 ⭐` : "—", color: C.gold },
              ].map(k => (
                <div key={k.label} style={{ backgroundColor: C.bgCard, borderRadius: "12px", padding: "12px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ color: k.color, fontSize: "18px", fontWeight: "900", lineHeight: 1 }}>{k.value}</div>
                  <div style={{ color: C.t3, fontSize: "10px", marginTop: "3px" }}>{k.label}</div>
                </div>
              ))}
            </div>
            {analyseTab === "tunnel"  && <TunnelAcquisition rdvs={rdvs}/>}
            {analyseTab === "heatmap" && <HeatmapActivite rdvs={rdvs}/>}
            {analyseTab === "geo"     && <CarteGeographique rdvs={rdvs}/>}
            {analyseTab === "crm"     && <MiniCRM clients={clients} onSaveNote={saveClientNote} instId={instId}/>}
            <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", padding: "16px", border: `1px solid ${C.gold}20`, marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                <span style={{ color: C.gold, fontSize: "13px", fontWeight: "800" }}>Conseil personnalisé</span>
              </div>
              <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.7 }}>
                {stats.taux_confirmation < 50
                  ? `Votre taux de confirmation (${stats.taux_confirmation}%) est en dessous de la moyenne. Activez les réponses rapides et vérifiez vos disponibilités.`
                  : stats.avis_count < 5
                  ? "Vous avez peu d'avis. Encouragez vos clients à laisser une évaluation après chaque RDV."
                  : stats.week < 5
                  ? "Publiez une annonce cette semaine pour augmenter votre visibilité."
                  : `Excellente performance ! Vous gérez ${stats.week} RDV cette semaine.`
                }
              </p>
              <button onClick={() => setShowGuide(true)} className="tap" style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "6px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontSize: "12px", fontWeight: "800", padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer" }}>
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
          <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "16px" }}>Paramètres</h1>

          {inst && (
            <div style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "16px", border: `1px solid ${C.border}`, marginBottom: "14px", display: "flex", alignItems: "center", gap: "14px" }}>
              {inst.logo ? (
                <img src={inst.logo} alt="" style={{ width: "52px", height: "52px", borderRadius: "14px", objectFit: "cover", border: `1px solid ${C.gold}30`, flexShrink: 0 }}/>
              ) : (
                <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.gold}30, ${C.goldD}15)`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <YelenLogo size={28} color={C.gold} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</div>
                <div style={{ color: C.t2, fontSize: "11px" }}>{inst.category} · {inst.ville}</div>
                <div style={{ display: "flex", gap: "5px", marginTop: "4px", flexWrap: "wrap" }}>
                  {inst.statut === "validee" && <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: `${C.gold}20`, color: C.gold, fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "10px" }}>✓ Compte validé</div>}
                  {inst.badge_verifie && <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: C.greenL, color: C.green, fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "10px" }}>✓ Vérifié</div>}
                </div>
              </div>
              <button onClick={() => setTab("profil-entreprise")} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "700", flexShrink: 0, cursor: "pointer" }}>Modifier</button>
            </div>
          )}

          {/* Apparence — sélecteur Système / Clair / Sombre */}
          <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", border: `1px solid ${C.border}`, marginBottom: "14px", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.8px" }}>Apparence</span>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700", marginBottom: "3px" }}>Thème de l'interface</div>
              <div style={{ color: C.t3, fontSize: "11px", marginBottom: "12px" }}>« Système » suit les réglages de votre appareil</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {([
                  { key: "system" as const, label: "Système", icon: (c: string) => (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    ) },
                  { key: "light" as const, label: "Clair", icon: (c: string) => (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    ) },
                  { key: "dark" as const, label: "Sombre", icon: (c: string) => (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    ) },
                ]).map(opt => {
                  const selected = mode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setMode(opt.key)}
                      className="tap"
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "12px 8px", borderRadius: "14px", backgroundColor: selected ? `${C.gold}15` : C.bg3, border: `1.5px solid ${selected ? C.gold + "50" : C.border2}`, cursor: "pointer" }}
                    >
                      {opt.icon(selected ? C.gold : C.t2)}
                      <span style={{ color: selected ? C.gold : C.t2, fontSize: "12px", fontWeight: selected ? "700" : "500" }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <ParametresTab instId={instId} />

          {([
            {
              titre: "Abonnement",
              items: [
                { label: "Abonnement & Forfait", href: `/institution/abonnement`, color: C.purple },
              ],
            },
            {
              titre: "Support & Légal",
              items: [
                { label: "Aide & FAQ",                   href: `/faq`,          color: C.blue },
                { label: "Contacter le support",         href: "mailto:support@yelen224.com",         color: C.purple },
                { label: "Conditions d'utilisation",     href: "/cgu",                          color: C.t2 },
                { label: "Politique de confidentialité", href: "/confidentialite",              color: C.t2 },
              ],
            },
          ] as SettingsSection[]).map((section, si) => (
            <div key={si} style={{ marginBottom: "14px" }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{section.titre}</div>
              <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                {section.items.map((item, ii) => {
                  const itemContent = (
                    <>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color, flexShrink: 0 }}/>
                      <span style={{ flex: 1, color: C.t1, fontSize: "13px", fontWeight: "600" }}>{item.label}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </>
                  );
                  const itemStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", borderBottom: ii < section.items.length - 1 ? `1px solid ${C.border}` : "none", textDecoration: "none", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" };
                  return "onTab" in item && item.onTab ? (
                    <button key={ii} onClick={() => setTab(item.onTab!)} className="tap" style={itemStyle}>{itemContent}</button>
                  ) : (
                    <a key={ii} href={item.href ?? "#"} className="tap" style={itemStyle}>{itemContent}</a>
                  );
                })}
              </div>
            </div>
          ))}

          <ParametresDangerZone instId={instId} instName={inst?.name ?? ""} />

          <div style={{ textAlign: "center", color: C.t3, fontSize: "10px" }}>Yelen224 Pro · Guinée · v5.1 · 2026</div>
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
      </div>{/* fin .yelen-page */}
      </div>{/* fin .yelen-main */}
      <nav className="yelen-bottom-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, backgroundColor: `${C.bgCard}F7`, backdropFilter: "blur(32px) saturate(200%)", borderTop: `1px solid ${C.border}`, paddingBottom: "env(safe-area-inset-bottom)", display: "grid", gridTemplateColumns: "repeat(5,1fr)", boxShadow: "0 -12px 40px rgba(0,0,0,0.6)" }}>
        {([
          { key: "accueil",    label: "Accueil",   badge: 0,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill={a ? C.gold : "none"} stroke={a ? C.gold : C.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
          { key: "rdv",        label: "RDV",       badge: rdvsPending.length,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a ? C.gold : C.t2} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
          { key: "disponibilites", label: "Créneaux", badge: 0,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a ? C.gold : C.t2} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
          { key: "scanner",    label: "Scanner",   badge: 0,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a ? C.gold : C.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg> },
          { key: "__plus__",   label: "Plus",   badge: 0,
            icon: (a: boolean) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a ? C.gold : C.t2} strokeWidth="1.8" strokeLinecap="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg> },
        ] as { key: typeof tab | "__plus__"; label: string; badge: number; icon: (a: boolean) => any }[])
          .filter(item => tabAllowed(membreRole, item.key)).map(item => {
          const overflowTabs: (typeof tab)[] = ["services", "communication", "messagerie", "codeqr", "valider-rdv", "analyse", "parametres", "profil-entreprise", "profil-responsable", "documents", "paiements", "transactions", "historique-financier", "facturation", "rapports", "documents-financiers", "documents-clients"];
          const active = item.key === "__plus__" ? overflowTabs.includes(tab) : tab === item.key;
          return (
            <button key={item.key} onClick={() => item.key === "__plus__" ? setMobileMoreOpen(true) : setTab(item.key as typeof tab)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", background: "none", border: "none", padding: "8px 4px 5px", cursor: "pointer", position: "relative" }}>
              {active && <div style={{ position: "absolute", top: 0, left: "22%", right: "22%", height: "2px", background: `linear-gradient(90deg, ${C.gold}, ${C.goldL})`, borderRadius: "0 0 2px 2px" }}/>}
              <span style={{ position: "relative", display: "inline-flex" }}>
                {item.icon(active)}
                {item.badge > 0 && (
                  <span style={{ position: "absolute", top: "-5px", right: "-5px", backgroundColor: C.gold, color: "#000", fontSize: "8px", fontWeight: "800", borderRadius: "10px", minWidth: "14px", height: "14px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: `1.5px solid ${C.bg}` }}>
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span style={{ fontSize: "9px", fontWeight: active ? "800" : "600", color: active ? C.gold : C.t3, letterSpacing: "0.2px" }}>{item.label}</span>
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
          {/* ── maxHeight + overflowY:auto ajoutés (retour Bryan 30/07/2026) —
              14 items + le bloc "Compte" dépassaient la hauteur de l'écran
              sans aucun scroll ni limite, le bas de la liste et le fond
              cliquable (pour fermer) devenaient inatteignables : le menu
              semblait "figé". Même convention que .client-fiche-panel dans
              MesClientsTab.tsx (maxHeight + overflowY:auto). X de fermeture
              ajouté aussi (toujours visible, pas seulement ≥1024px comme
              .client-fiche-close-x — ce menu n'a pas d'équivalent desktop,
              la nav du bas qui le déclenche est elle-même masquée ≥1024px). ── */}
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "12px 12px calc(24px + env(safe-area-inset-bottom))", width: "100%", maxWidth: "480px", maxHeight: "82svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 16px" }}/>
            <button onClick={() => { setMobileMoreOpen(false); setAccountMenuOpen(false); }} className="tap" style={{ position: "absolute", top: "14px", right: "14px", width: "30px", height: "30px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            {accountMenuOpen ? (
              <>
                <button onClick={() => setAccountMenuOpen(false)} className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", padding: "6px 4px 14px", cursor: "pointer", color: C.t2, fontSize: "12px", fontWeight: "700" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  {inst?.name || "Compte"}
                </button>
                {membreRole !== null && membreRole !== "admin" && (
                  <div style={{ margin: "0 4px 10px", padding: "10px 11px", borderRadius: "10px", backgroundColor: `${C.blue}10`, border: `1px solid ${C.blue}25` }}>
                    <p style={{ color: C.t2, fontSize: "10.5px", lineHeight: 1.6, margin: 0 }}>
                      🔒 Votre employeur peut voir tout ce que vous faites (Journal d'activité). Vous ne voyez ici que ce à quoi il vous a donné accès.
                    </p>
                  </div>
                )}
                {accountItems.map(item => {
                  const active = tab === item.key;
                  return (
                    <button key={item.key} onClick={() => { if (item.onClick) { item.onClick(); } else { setTab(item.key as typeof tab); } setMobileMoreOpen(false); setAccountMenuOpen(false); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "13px 12px", borderRadius: "12px", background: active ? `${C.gold}12` : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ color: active ? C.gold : C.t2, display: "flex" }}>{item.icon}</span>
                      <span style={{ color: active ? C.gold : C.t1, fontSize: "14px", fontWeight: active ? "800" : "600", flex: 1 }}>{item.label}</span>
                      {active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  );
                })}
                {membreRole !== null && (
                  <div style={{ padding: "10px 4px 4px", marginTop: "4px", borderTop: `1px solid ${C.border}` }}>
                    <p style={{ color: C.t3, fontSize: "10px", lineHeight: 1.5, margin: 0 }}>
                      Compte {ROLE_LABELS[membreRole].toLowerCase()} créé par <strong style={{ color: C.t2 }}>{inst?.name || "votre établissement"}</strong>.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {([
                  { key: "services",       label: "Services",        icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg> },
                  { key: "communication",  label: "Communication",   icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                  { key: "messagerie",     label: "Messagerie",      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                  { key: "codeqr",         label: "Mon code QR",     icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="17.5" y1="14" x2="17.5" y2="17.5"/><line x1="14" y1="17.5" x2="17.5" y2="17.5"/></svg> },
                  { key: "valider-rdv",    label: "Valider un RDV",  icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="8 15 11 18 16 13"/></svg> },
                  { key: "analyse",        label: "Analyse",         icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
                  { key: "parametres",     label: "Paramètres",      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
                  { key: "paiements",      label: "Paiements",       icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
                  { key: "transactions",   label: "Transactions",    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
                  { key: "historique-financier", label: "Historique financier", icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
                  { key: "facturation",    label: "Facturation",     icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
                  { key: "rapports",       label: "Rapports",        icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 21H4a1 1 0 0 1-1-1V4"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="4" width="3" height="13"/></svg> },
                  { key: "documents-financiers", label: "Documents financiers", icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
                  { key: "documents-clients", label: "Documents clients", icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/></svg> },
                ] as { key: typeof tab; label: string; icon: React.ReactNode }[])
                  .filter(item => tabAllowed(membreRole, item.key)).map(item => {
                  const active = tab === item.key;
                  return (
                    <button key={item.key} onClick={() => { setTab(item.key); setMobileMoreOpen(false); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "13px 12px", borderRadius: "12px", background: active ? `${C.gold}12` : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ color: active ? C.gold : C.t2, display: "flex" }}>{item.icon}</span>
                      <span style={{ color: active ? C.gold : C.t1, fontSize: "14px", fontWeight: active ? "800" : "600", flex: 1 }}>{item.label}</span>
                      {active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  );
                })}
                <div style={{ height: "1px", background: C.border, margin: "6px 4px" }}/>
                <button onClick={() => setAccountMenuOpen(true)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "13px 12px", borderRadius: "12px", background: accountTabKeys.includes(tab) ? `${C.gold}12` : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  {inst?.logo ? (
                    <img src={inst.logo} alt="" style={{ width: "19px", height: "19px", borderRadius: "5px", objectFit: "cover", flexShrink: 0 }}/>
                  ) : (
                    <span style={{ color: accountTabKeys.includes(tab) ? C.gold : C.t2, display: "flex" }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>
                    </span>
                  )}
                  <span style={{ color: accountTabKeys.includes(tab) ? C.gold : C.t1, fontSize: "14px", fontWeight: accountTabKeys.includes(tab) ? "800" : "600", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst?.name || "Compte"}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {etapeValidation === "conditions" && (
        <ConditionsPrestataireModal onAccept={accepterConditionsPrestataire} saving={acceptingConditions}/>
      )}
      {etapeValidation === "celebration" && (
        <CelebrationModal instName={inst?.name ?? "Votre établissement"} onClose={() => setEtapeValidation(null)}/>
      )}
    </div>
  );
}
