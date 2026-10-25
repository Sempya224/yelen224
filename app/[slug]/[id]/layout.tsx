






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

import React, { Suspense, useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import type { Html5Qrcode } from "html5-qrcode";
import { YelenLogo } from "@/components/YelenLogo";
import { YelenLoader } from "@/components/YelenLoader";
import { CONDITIONS_PRESTATAIRE } from "@/lib/conditionsPrestataire";
import { useTheme } from "@/components/ThemeProvider";
import { creneauEstOuvert, rdvEstEnRetard, rdvNonTraite, rdvEnFenetreDeGrace } from "@/lib/rdvGating";
import { CheckInUnavailableDialog } from "./components/CheckInUnavailableDialog";
import { PreparationVisiteModal } from "./components/PreparationVisiteModal";
import { RdvDetailModal } from "./components/RdvDetailModal";
import { RdvDetailContenu, useRdvHistorique } from "./components/RdvDetailSections";
import { peutVoirDemande, separerUrgent } from "@/lib/rdvFiche";
import { MOTIF_ABSENT_MIN_CARACTERES } from "@/lib/rdvDecision";
import { heureAmPm as formaterHeureAmPm, heureDepuisHorodatage } from "@/lib/heure";
import { salutation } from "@/lib/salutation";
import { can, isMembreRole, isTabKey, ROLE_LABELS, tabAllowed, tabReadOnly, type MembreRole } from "@/lib/institutionPermissions";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "./theme";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { parseLocalDate, timeAgo } from "./dashboardShared";
import { AppointmentsTable, RdvKpiBand, correspondFiltreRdv, variationJour, type RdvKpi } from "./components/rdv/AppointmentsUi";
import { AppointmentsToolbar } from "./components/rdv/AppointmentsToolbar";
import { parseAppointmentLabel } from "./components/rdv/parseAppointmentLabel";
import { ClockStyles, ComboField } from "./components/ClockInShiftUi";
import { HeaderStyles, Breadcrumbs, KbdChip } from "./components/HeaderUi";
import { NotificationsPopoverContent } from "./components/NotificationsPopoverContent";
import { RdvEntrantsPopoverContent } from "./components/RdvEntrantsPopoverContent";
import type { NotificationInstitution } from "@/lib/notificationsPresentation";
import { PopoverStyles, popoverItem, PopoverSection, PopoverChevron, PopoverEmpty, PopoverFooter, IcoVideQuestion } from "./components/PopoverUi";
import { ApercuStyles, ApercuCard, VoirLien, EtatVideCarte, ApercuHeader, KpiBand, SyntheseBand, LigneATraiter, EtoilesAmbre, LigneDistribution, LigneObjectif, CarteAcces, nomPropre as nomAffiche, motsEnCasse, tempsRelatif, heureAmPm } from "./components/ApercuUi";
import { CompteSuspenduScreen } from "./components/CompteSuspenduScreen";
import { SecurityActivationGate } from "./components/SecurityActivationGate";
import { LogoutFlow, INSTITUTION_LOGOUT_COPY } from "./components/LogoutFlow";
import { telechargerExportServeur } from "@/lib/export/telechargementClient";

// Onglets chargés à la demande (next/dynamic) : webpack ne compile plus tout
// le dashboard à la première ouverture, seulement l'onglet affiché. ssr:false
// car le layout n'affiche les onglets qu'après le chargement client de l'institution.
function OngletChargement() {
  return (
    <div role="status" aria-label="Chargement" style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid rgba(128,128,128,0.25)", borderTopColor: "#F5A623", animation: "yelenOngletSpin 0.8s linear infinite" }}/>
      <style>{"@keyframes yelenOngletSpin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

const NotificationsPage = dynamic(() => import("./components/NotificationsPage").then(m => m.NotificationsPage), { ssr: false, loading: () => <OngletChargement/> });
const DisponibilitesTab = dynamic(() => import("./components/DisponibilitesTab").then(m => m.DisponibilitesTab), { ssr: false, loading: () => <OngletChargement/> });
const ServicesTab = dynamic(() => import("./components/ServicesTab").then(m => m.ServicesTab), { ssr: false, loading: () => <OngletChargement/> });
const ServicesHotelTab = dynamic(() => import("./components/ServicesHotelTab").then(m => m.ServicesHotelTab), { ssr: false, loading: () => <OngletChargement/> });
const CommunicationTab = dynamic(() => import("./components/CommunicationTab").then(m => m.CommunicationTab), { ssr: false, loading: () => <OngletChargement/> });
const CommunauteProTab = dynamic(() => import("./components/CommunauteProTab").then(m => m.CommunauteProTab), { ssr: false, loading: () => <OngletChargement/> });
const SignalementsTab = dynamic(() => import("./components/SignalementsTab").then(m => m.SignalementsTab), { ssr: false, loading: () => <OngletChargement/> });
const ScansTab = dynamic(() => import("./components/ScannerHistoriqueTab").then(m => m.ScansTab), { ssr: false, loading: () => <OngletChargement/> });
const CodeQrTab = dynamic(() => import("./components/CodeQrTab").then(m => m.CodeQrTab), { ssr: false, loading: () => <OngletChargement/> });
const ValiderRdvTab = dynamic(() => import("./components/ValiderRdvTab").then(m => m.ValiderRdvTab), { ssr: false, loading: () => <OngletChargement/> });
const ProfilEntrepriseTab = dynamic(() => import("./components/ProfilEntrepriseTab").then(m => m.ProfilEntrepriseTab), { ssr: false, loading: () => <OngletChargement/> });
const ConditionsInformationsTab = dynamic(() => import("./components/ConditionsInformationsTab").then(m => m.ConditionsInformationsTab), { ssr: false, loading: () => <OngletChargement/> });
const ConfigurationHotelTab = dynamic(() => import("./components/ConfigurationHotelTab").then(m => m.ConfigurationHotelTab), { ssr: false, loading: () => <OngletChargement/> });
const ProfilResponsableTab = dynamic(() => import("./components/ProfilResponsableTab").then(m => m.ProfilResponsableTab), { ssr: false, loading: () => <OngletChargement/> });
const DocumentsTab = dynamic(() => import("./components/DocumentsTab").then(m => m.DocumentsTab), { ssr: false, loading: () => <OngletChargement/> });
const CentreConfigurationTab = dynamic(() => import("./components/CentreConfigurationTab").then(m => m.CentreConfigurationTab), { ssr: false, loading: () => <OngletChargement/> });
const MesClientsTab = dynamic(() => import("./components/MesClientsTab").then(m => m.MesClientsTab), { ssr: false, loading: () => <OngletChargement/> });
const AvisReputationTab = dynamic(() => import("./components/AvisReputationTab").then(m => m.AvisReputationTab), { ssr: false, loading: () => <OngletChargement/> });
const HelpCenterGuide = dynamic(() => import("./components/HelpCenterGuide").then(m => m.HelpCenterGuide), { ssr: false, loading: () => <OngletChargement/> });
const MessagerieTab = dynamic(() => import("./components/MessagerieTab").then(m => m.MessagerieTab), { ssr: false, loading: () => <OngletChargement/> });
const CollaborationTab = dynamic(() => import("./components/CollaborationTab").then(m => m.CollaborationTab), { ssr: false, loading: () => <OngletChargement/> });
const SupportYelenTab = dynamic(() => import("./components/SupportYelenTab").then(m => m.SupportYelenTab), { ssr: false, loading: () => <OngletChargement/> });
const RecommandationsTab = dynamic(() => import("./components/RecommandationsTab").then(m => m.RecommandationsTab), { ssr: false, loading: () => <OngletChargement/> });
const QuestionsClientsTab = dynamic(() => import("./components/QuestionsClientsTab").then(m => m.QuestionsClientsTab), { ssr: false, loading: () => <OngletChargement/> });
const EquipeTab = dynamic(() => import("./components/EquipeTab").then(m => m.EquipeTab), { ssr: false, loading: () => <OngletChargement/> });
const JournalTab = dynamic(() => import("./components/JournalTab").then(m => m.JournalTab), { ssr: false, loading: () => <OngletChargement/> });
const EspaceTravailTab = dynamic(() => import("./components/EspaceTravailTab").then(m => m.EspaceTravailTab), { ssr: false, loading: () => <OngletChargement/> });
const MaSemaineTab = dynamic(() => import("./components/MaSemaineTab").then(m => m.MaSemaineTab), { ssr: false, loading: () => <OngletChargement/> });
const RdvPasseTab = dynamic(() => import("./components/RdvPasseTab").then(m => m.RdvPasseTab), { ssr: false, loading: () => <OngletChargement/> });
const ParametresDangerZone = dynamic(() => import("./components/ParametresTab").then(m => m.ParametresDangerZone), { ssr: false, loading: () => <OngletChargement/> });
const ParametresAccueil = dynamic(() => import("./components/ParametresAccueil").then(m => m.ParametresAccueil), { ssr: false, loading: () => <OngletChargement/> });
const SecuriteCompteTab = dynamic(() => import("./components/SecuriteCompteTab").then(m => m.SecuriteCompteTab), { ssr: false, loading: () => <OngletChargement/> });
const NotificationsTab = dynamic(() => import("./components/NotificationsTab").then(m => m.NotificationsTab), { ssr: false, loading: () => <OngletChargement/> });
const LegalTab = dynamic(() => import("./components/LegalTab").then(m => m.LegalTab), { ssr: false, loading: () => <OngletChargement/> });
const ProfilTab = dynamic(() => import("./components/ProfilTab").then(m => m.ProfilTab), { ssr: false, loading: () => <OngletChargement/> });
const FinanceAccueilTab = dynamic(() => import("./components/FinanceAccueilTab").then(m => m.FinanceAccueilTab), { ssr: false, loading: () => <OngletChargement/> });
const PaiementsTab = dynamic(() => import("./components/PaiementsTab").then(m => m.PaiementsTab), { ssr: false, loading: () => <OngletChargement/> });
const TransactionsTab = dynamic(() => import("./components/TransactionsTab").then(m => m.TransactionsTab), { ssr: false, loading: () => <OngletChargement/> });
const HistoriqueFinancierTab = dynamic(() => import("./components/HistoriqueFinancierTab").then(m => m.HistoriqueFinancierTab), { ssr: false, loading: () => <OngletChargement/> });
const FacturationTab = dynamic(() => import("./components/FacturationTab").then(m => m.FacturationTab), { ssr: false, loading: () => <OngletChargement/> });
const RapportsTab = dynamic(() => import("./components/RapportsTab").then(m => m.RapportsTab), { ssr: false, loading: () => <OngletChargement/> });
const CentreAnalyseTab = dynamic(() => import("./components/CentreAnalyseTab").then(m => m.CentreAnalyseTab), { ssr: false, loading: () => <OngletChargement/> });
const DocumentsFinanciersTab = dynamic(() => import("./components/DocumentsFinanciersTab").then(m => m.DocumentsFinanciersTab), { ssr: false, loading: () => <OngletChargement/> });
const DocumentsClientsTab = dynamic(() => import("./components/DocumentsClientsTab").then(m => m.DocumentsClientsTab), { ssr: false, loading: () => <OngletChargement/> });
const PartenariatTab = dynamic(() => import("./components/PartenariatTab").then(m => m.PartenariatTab), { ssr: false, loading: () => <OngletChargement/> });
const MesOffresTab = dynamic(() => import("./components/MesOffresTab").then(m => m.MesOffresTab), { ssr: false, loading: () => <OngletChargement/> });
const ClockInShiftTab = dynamic(() => import("./components/ClockInShiftTab").then(m => m.ClockInShiftTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenCompteTab = dynamic(() => import("./components/YelenCompteTab").then(m => m.YelenCompteTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenContratTab = dynamic(() => import("./components/YelenContratTab").then(m => m.YelenContratTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenForfaitTab = dynamic(() => import("./components/YelenForfaitTab").then(m => m.YelenForfaitTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenPaiementsTab = dynamic(() => import("./components/YelenPaiementsTab").then(m => m.YelenPaiementsTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenTransactionsTab = dynamic(() => import("./components/YelenTransactionsTab").then(m => m.YelenTransactionsTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenReconciliationTab = dynamic(() => import("./components/YelenReconciliationTab").then(m => m.YelenReconciliationTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenFraisTab = dynamic(() => import("./components/YelenFraisTab").then(m => m.YelenFraisTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenFacturationTab = dynamic(() => import("./components/YelenFacturationTab").then(m => m.YelenFacturationTab), { ssr: false, loading: () => <OngletChargement/> });
const YelenDocumentsTab = dynamic(() => import("./components/YelenDocumentsTab").then(m => m.YelenDocumentsTab), { ssr: false, loading: () => <OngletChargement/> });

// ─── Types ────────────────────────────────────────────────────────────

export type RDV = {
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
  reference?: string;
  accepte_le?: string | null;
  date_depart?: string | null;
  pays_depart?: string | null;
  ville_depart?: string | null;
  notes?: string;
  presence?: boolean;
  presence_status?: string;
  presence_confirmed_at?: string;
  conversation_terminee?: boolean;
  motif_annulation?: string;
  annule_par?: string | null;
  created_at?: string;
  termine_at?: string;
  guichet?: string;
  instructions_accueil?: string | null;
  preparation_confirmee_le?: string | null;
  motif_report?: string;
  duree_minutes?: number | null;
  description_besoin?: string | null;
  champs_complementaires_reponses?: Record<string, string> | null;
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

export type Client = {
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

type DashboardTab = "accueil" | "rdv" | "disponibilites" | "services" | "communication" | "communaute-pro" | "signalements" | "scanner" | "codeqr" | "valider-rdv" | "analyse" | "recommandations" | "parametres" | "profil-entreprise" | "conditions-informations" | "configuration-hotel" | "profil-responsable" | "documents" | "mes-clients" | "avis-reputation" | "rdv-historique" | "equipe" | "journal" | "espace-travail" | "messagerie" | "collaboration" | "support" | "questions-clients" | "paiements" | "transactions" | "historique-financier" | "facturation" | "rapports" | "documents-financiers" | "documents-clients" | "profil" | "partenariat" | "mes-offres" | "clock-in-shift" | "parametres-securite" | "parametres-notifications" | "parametres-legal" | "yelen-compte" | "yelen-contrat" | "yelen-forfait" | "yelen-paiements" | "yelen-transactions" | "yelen-reconciliation" | "yelen-frais-commissions" | "yelen-facturation" | "yelen-documents" | "yelen-support" | "ma-semaine" | "notifications";
// Onglets encore navigables quand institutions.statut === "suspendue"
// (décision CEO 17/08/2026, écran dédié "Espace suspendu") — interprétation
// de "Communication/Support" + "Paramètres/Compte", ajustable ici seul.
// Constante de module (pas recréée à chaque rendu) pour rester une
// dépendance stable du useEffect de redirection dans le composant.
// "messagerie" (pas "communication") — retour Bryan 17/08/2026 : pendant
// une suspension, l'institution doit pouvoir suivre ses conversations déjà
// ouvertes avec des citoyens, pas publier de nouvelles annonces publiques
// (CommunicationTab) qui n'ont plus de sens tant qu'elle est invisible.
// "support" (chantier "Séparation Messagerie/Support" 06/09/2026) : le
// support Yelen doit rester joignable même suspendu, comme avant quand ce
// canal vivait encore dans l'onglet "Yelen" de MessagerieTab.
const ALLOWED_TABS_SUSPENDU: ReadonlySet<DashboardTab> = new Set([
  "accueil", "messagerie", "support", "parametres", "profil", "profil-entreprise", "profil-responsable", "conditions-informations", "configuration-hotel", "documents",
  "parametres-securite", "parametres-notifications", "parametres-legal",
]);
// Regroupement à 2 niveaux de la section sidebar "Finance" (7 écrans → 2
// entrées repliables : Opérations / Suivi & documents). Les icônes/labels
// des écrans eux-mêmes ne changent pas (repris tels quels depuis
// navSectionsRaw dans renderMainNav) — seules ces 2 icônes de groupe sont
// nouvelles. Constante de module : statique, ne dépend d'aucun state/prop.
const FINANCE_GROUPS: { key: "operations" | "suivi"; label: string; icon: React.ReactNode; tabs: DashboardTab[] }[] = [
  { key: "operations", label: "Opérations", tabs: ["paiements", "transactions", "facturation"],
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> },
  { key: "suivi", label: "Suivi & documents", tabs: ["historique-financier", "rapports", "documents-financiers", "documents-clients"],
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
];
// Même principe que FINANCE_GROUPS, appliqué au groupe "Équipe & travail" du
// panneau "Compte" (pas la sidebar principale) : 4 écrans → 2 sous-sections
// repliables (Équipe / Travail), fermées par défaut, ouvertes aussi si `tab`
// est déjà un de leurs enfants.
const EQUIPE_TRAVAIL_GROUPS: { key: "equipe" | "travail"; label: string; icon: React.ReactNode; tabs: DashboardTab[] }[] = [
  { key: "equipe", label: "Équipe", tabs: ["equipe", "collaboration"],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { key: "travail", label: "Travail", tabs: ["ma-semaine", "espace-travail", "clock-in-shift"],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
];
// "Yelen Business" (17/09/2026, schéma à 4 sections repris de Bryan le
// même jour) — 3e menu, ouvert depuis le popover "Management" du header
// (icône avatar) via businessMenuOpen, pas depuis la sidebar gauche
// (retour Bryan : menu principal trop chargé) ni un panneau docké dans
// "Compte" — un tiroir flottant ancré à droite de l'écran
// (.yelen-business-drawer), overlay indépendant de la navigation interne
// à gauche. Relation commerciale institution <-> Yelen (compte/contrat,
// forfait, frais/commission de la plateforme, documents Yelen, support
// dédié), distincte du groupe "Finance" qui gère l'argent des clients de
// l'institution. Écrans à l'état vide pour l'instant (voir
// YelenBusinessStub plus bas) — aucune donnée/route réelle encore.
// Regroupé en 4 sections (Compte / Finance / Documents / Assistance) —
// YELEN_BUSINESS_TABS reste la liste à plat dérivée (flatMap), pour ne
// rien changer aux appels existants (.some/.map) qui ne connaissent pas
// la notion de section.
const YELEN_BUSINESS_SECTIONS: { section: string; items: { key: DashboardTab; label: string; icon: React.ReactNode }[] }[] = [
  { section: "Compte", items: [
    { key: "yelen-compte", label: "Compte Yelen",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg> },
    { key: "yelen-contrat", label: "Contrat Yelen",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 3v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V3"/><path d="M9.5 13l1.8 1.8L14.5 11.5"/></svg> },
  ]},
  { section: "Finance", items: [
    { key: "yelen-forfait", label: "Forfait Yelen",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg> },
    { key: "yelen-paiements", label: "Moyens de paiement",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
    { key: "yelen-transactions", label: "Transactions",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> },
    { key: "yelen-reconciliation", label: "Réconciliation",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg> },
    { key: "yelen-frais-commissions", label: "Frais & commissions",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="7" x2="12" y2="17"/><path d="M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5S10.34 12 12 12s3 1.12 3 2.5-1.34 2.5-3 2.5-3-1.12-3-2.5"/></svg> },
    { key: "yelen-facturation", label: "Facturation",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg> },
  ]},
  { section: "Documents", items: [
    { key: "yelen-documents", label: "Documents Yelen",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> },
  ]},
  { section: "Assistance", items: [
    { key: "yelen-support", label: "Support Yelen",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.8 1c0 1.5-2.3 1.8-2.3 3.3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  ]},
];
const YELEN_BUSINESS_TABS: { key: DashboardTab; label: string; icon: React.ReactNode }[] = YELEN_BUSINESS_SECTIONS.flatMap(s => s.items);

// Workspace persistant (Lot 04-B) — remplace le rendu conditionnel
// {tab === "x" && <XTab/>} (démonte/remonte intégralement à chaque bascule,
// cause racine identifiée au Lot 04-A) par un montage une seule fois au
// premier passage, conservé ensuite pour le reste de la session et
// simplement masqué en CSS. Défini au niveau module (pas dans
// InstitutionDashboardInner) : un composant redéfini à chaque rendu du
// parent perdrait son identité React à chaque frappe/interaction (piège déjà
// documenté dans ce projet). N'affecte jamais l'autorisation — c'est un
// choix de rendu client, chaque appel API reste vérifié côté serveur
// (section 9/10 du brief).
function KeepMounted({ tabKey, current, visited, onBack, C, children }: {
  tabKey: DashboardTab; current: DashboardTab; visited: Set<DashboardTab>; onBack?: () => void; C?: ThemeTokens; children: React.ReactNode;
}) {
  if (!visited.has(tabKey)) return null;
  return (
    <div style={{ display: current === tabKey ? "block" : "none" }}>
      {onBack && C && (
        <button onClick={onBack} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "16px 16px 0", cursor: "pointer", color: C.t2, fontSize: "13px", fontWeight: 700 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          Retour
        </button>
      )}
      {children}
    </div>
  );
}

// Garde de rendu des écrans Paramètres (Sécurité, Notifications, Légal) :
// les onglets ont une URL propre, donc un membre sans accès peut les ouvrir
// directement. Même source de vérité que navAllowed (tabAllowed), aucune règle
// nouvelle. Cosmétique : la vraie barrière reste dans chaque route API.
// `role === null` = rôle pas encore chargé (ou chargement échoué) — on
// n'affiche ni l'écran ni un refus tant que le rôle n'est pas connu.
function ParametresGarde({ role, autorise, onRetour, C, children }: {
  role: MembreRole | null; autorise: boolean; onRetour: () => void; C: ThemeTokens; children: React.ReactNode;
}) {
  if (role === null) {
    return <div role="status" aria-live="polite" style={{ padding: "48px 16px", textAlign: "center", color: C.t3, fontSize: "13px" }}>Vérification de vos droits d&apos;accès…</div>;
  }
  if (!autorise) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: C.t1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>Accès réservé aux administrateurs</p>
        <p style={{ color: C.t3, fontSize: "13px", marginBottom: "16px" }}>Votre rôle ne permet pas d&apos;ouvrir cet écran.</p>
        <button type="button" onClick={onRetour} className="tap yelen-focus-ring" style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "8px 14px", color: C.t1, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Retour</button>
      </div>
    );
  }
  return <>{children}</>;
}

// État vide générique des 7 écrans "Yelen Business" (17/09/2026, voir
// YELEN_BUSINESS_TABS) — scaffolding volontaire, aucune donnée/route
// réelle pour l'instant. Un seul composant paramétré (label + icône)
// plutôt que 7 quasi-doublons, jamais du texte brut : en-tête de page
// standard (titre + repère "Yelen Business") + carte centrée façon
// NotifEmptyIllustration/IllustrationRdvNeuf (halo doré, icône, titre,
// description). Remplacé écran par écran quand chaque brique sera
// réellement construite.
function YelenBusinessStub({ label, icon, C }: { label: string; icon: React.ReactNode; C: ThemeTokens }) {
  return (
    <div style={{ padding: "20px 16px" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>Yelen Business</div>
        <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800" }}>{label}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "56px 20px", textAlign: "center", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `${C.gold}12`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", color: C.gold }}>
          {icon}
        </div>
        <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Bientôt disponible</div>
        <div style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6, maxWidth: "320px" }}>Cet écran de {label.toLowerCase()} est en préparation — rien à configurer pour l&apos;instant.</div>
      </div>
    </div>
  );
}

// États vides sur mesure de l'onglet RDV (retour Bryan 15/08/2026 : tous
// les filtres de statut partageaient la même illustration générique et le
// même texte générique, seul le titre changeait). Même grammaire visuelle
// que Centre d'Analyse/Clock In Shift : halo doré léger, trait neutre
// (t3/border2), un accent doré. Défini au niveau module pour ne pas être
// redéfini à chaque rendu (même piège que KeepMounted ci-dessus).
function IllustrationRdvNeuf({ C }: { C: ThemeTokens }) {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="24" y="26" width="40" height="38" rx="6" fill={C.bgCard} stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <path d="M24 36h40" stroke={C.t3} strokeWidth="2"/>
      <path d="M33 22v8M55 22v8" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="68" cy="60" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M68 55v10M63 60h10" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}
function IllustrationRdvRecherche({ C }: { C: ThemeTokens }) {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="42" cy="42" r="18" stroke={C.t3} strokeWidth="2" strokeDasharray="4 5"/>
      <circle cx="66" cy="66" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <circle cx="63" cy="63" r="4.5" stroke={C.gold} strokeWidth="2"/>
      <line x1="66.2" y1="66.2" x2="69" y2="69" stroke={C.gold} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function IllustrationRdvAttente({ C }: { C: ThemeTokens }) {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M34 26h28M34 70h28M36 26c0 12 24 12 24 22s-24 10-24 22M60 26c0 12-24 12-24 22s24 10 24 22" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="68" cy="30" r="10" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <circle cx="68" cy="30" r="2" fill={C.gold}/>
    </svg>
  );
}
function IllustrationRdvConfirmes({ C }: { C: ThemeTokens }) {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="22" y="24" width="40" height="38" rx="6" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <path d="M22 34h40" stroke={C.t3} strokeWidth="2"/>
      <circle cx="68" cy="58" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M63 58l3.5 3.5L73 54" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationRdvEffectues({ C }: { C: ThemeTokens }) {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M30 20v56" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <path d="M30 22h30l-6 9 6 9H30z" stroke={C.t3} strokeWidth="2" strokeLinejoin="round" strokeDasharray="3 5"/>
      <circle cx="66" cy="64" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M61 64l3.5 3.5L71 60" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationRdvBoiteVide({ C }: { C: ThemeTokens }) {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M22 44l8-20h36l8 20v18a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" stroke={C.t3} strokeWidth="2" strokeLinejoin="round" strokeDasharray="3 5"/>
      <path d="M22 44h16l4 6h12l4-6h16" stroke={C.t3} strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="68" cy="60" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M63 60l3.5 3.5L73 56" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationRdvSucces({ C }: { C: ThemeTokens }) {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M48 22l20 8v16c0 14-9 22-20 28-11-6-20-14-20-28V30z" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M39 48l6 6 12-13" stroke={C.gold} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
// Variante "alerte" — même scène de calendrier que IllustrationRdvNeuf mais
// badge accent paramétrable (rouge pour refusé/suspendu, jamais le doré de
// marque réservé aux cas neutres/positifs — même logique de couleurs que
// statutCfg dans ProfilProgressionBandeau : validee=vert, en_attente=doré,
// refusee=rouge).
function IllustrationRdvAlerte({ C, accent }: { C: ThemeTokens; accent: string }) {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${accent}0a`}/>
      <rect x="24" y="26" width="40" height="38" rx="6" fill={C.bgCard} stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <path d="M24 36h40" stroke={C.t3} strokeWidth="2"/>
      <path d="M33 22v8M55 22v8" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="68" cy="60" r="11" fill={C.bgCard} stroke={accent} strokeWidth="2.2"/>
      <path d="M68 55v6" stroke={accent} strokeWidth="2.4" strokeLinecap="round"/>
      <circle cx="68" cy="64.5" r="1.3" fill={accent}/>
    </svg>
  );
}

function RdvEmptyState({ C, illustration, titre, texte, cta }: {
  C: ThemeTokens; illustration: React.ReactNode; titre: string; texte: string; cta?: { label: string; onClick: () => void };
}) {
  return (
    <Card tokens={toCardTokens(C)} padding="40px 24px" style={{ textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>{illustration}</div>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>{titre}</div>
      <p style={{ color: C.t3, fontSize: "12.5px", fontWeight: "600", lineHeight: 1.6, maxWidth: "340px", margin: cta ? "0 auto 16px" : "0 auto" }}>{texte}</p>
      {cta && (
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </Card>
  );
}

// RBAC Enterprise (5 rôles) — masquage de nav uniquement (cosmétique) :
// "guide"/"__plus__" ne sont pas dans TabKey et restent donc toujours
// visibles (isTabKey renvoie false). "messagerie" est dans TabKey depuis
// le chantier Messagerie (19/07/2026, écran dédié qui remplace l'ancien
// widget flottant hors RBAC). La vraie barrière vit dans chaque route API
// (lib/institutionPermissions.ts), jamais ici — voir Phase D du chantier
// RBAC. tabAllowed/tabReadOnly déplacées dans lib/institutionPermissions.ts
// (Lot D, Centre de configuration, 12/08/2026) pour être importables par
// CentreConfigurationTab.tsx sans dupliquer la matrice.

// Bandeau affiché en tête d'un onglet en lecture seule (RBAC) — même
// mention partout, pour que le membre comprenne que la restriction vient
// du rôle qui lui a été assigné, pas d'un bug.
function ReadOnlyNotice({ C }: { C: ThemeTokens }) {
  return (
    <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "12px 14px", margin: "16px 16px 0", display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "2px" }} aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>
        <strong style={{ color: C.orange }}>Lecture seule.</strong> Vous n&apos;avez pas les droits pour effectuer des actions sur cet écran. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez votre employeur.
      </p>
    </div>
  );
}

type Institution = {
  id: string;
  slug: string;
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
  disponibilites_modifie_le?: string | null;
  disponibilites_modifie_par?: string | null;
  institution_membres?: { prenom: string; nom: string } | { prenom: string; nom: string }[] | null;
  conditions_prestataire_acceptees_le?: string | null;
  secteur?: string | null;
  // Chantier Taxonomie des activités (Phase 4, 20/08/2026) — remplace
  // secteur === "hotel" pour tout gating d'écran dépendant de l'activité
  // (institutions.secteur n'est plus jamais écrite depuis la Phase 2 du
  // wizard). Voir api/institution/profile/route.ts.
  activite_principale_code?: string | null;
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

export type Stats = {
  today: number; week: number; month: number;
  pending: number; confirmed: number; done: number; cancelled: number;
  nouveau: number; absents: number; non_traites: number;
  avis_count: number; moyenne_avis: number; avis_non_lus: number;
  taux_confirmation: number; taux_annulation: number; taux_satisfaction: number;
  rdv_total: number; evolution_week: number; evolution_month: number;
  // V3 (17/09/2026) — indique si une vraie période précédente existe pour
  // comparer (prevWkN/prevMoN > 0). Sans base réelle, l'UI affiche "Historique
  // insuffisant" plutôt qu'un 0% fabriqué (division par zéro déjà court-
  // circuitée à 0 avant ce chantier, ce qui se lisait à tort comme "stable").
  evolution_week_has: boolean; evolution_month_has: boolean;
  peak_hour: string; peak_day: string;
  rdv_par_jour: { day: string; count: number }[];
  rdv_par_heure: { hour: string; count: number }[];
  notes_distribution: { note: number; count: number; pct: number }[];
  recent_activity: { type: string; label: string; time: string; color: string }[];
  ratio_refus: number;
  compte_restreint: boolean;
  score_sante: number;
  // V3 : { value, has } — `has=false` (pas de RDV la veille pour cette
  // catégorie) doit afficher "Pas encore de comparaison", jamais un %
  // fabriqué (0% ou +100% arbitraire comme avant ce chantier).
  kpi_variations: { nouveau: KpiVariation; pending: KpiVariation; confirmed: KpiVariation; done: KpiVariation; cancelled: KpiVariation; total: KpiVariation; non_traites: KpiVariation };
};

// aujourdhui / hier : nombre de RDV prévus ces deux jours (jours de Conakry) dans la
// catégorie, affichés tels quels sur l'écran Rendez-vous. value / has : ancien
// pourcentage, conservé tant que la bande KPI de l'accueil (ApercuUi.KpiBand) n'a
// pas migré vers le même affichage.
export type KpiVariation = { value: number; has: boolean; aujourdhui: number; hier: number };
const VARIATION_NULLE: KpiVariation = { value: 0, has: false, aujourdhui: 0, hier: 0 };

// ─── Design Tokens ────────────────────────────────────────────────────
// ─── CSS Global ────────────────────────────────────────────────────────
const cssFor = (C: ThemeTokens, theme: "light" | "dark") => `
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
  html,body{background:${C.bg};overflow-x:hidden;overscroll-behavior:none}
  /* Barre de défilement TOUJOURS visible partout dans le dashboard (retour
     Bryan 24/10/2026), neutre comme celle de .rdv-detail-scroll : gris clair
     en sombre (un thumb noir y serait invisible), noirâtre en clair. Remplace
     le masquage global de globals.css, qui ne vaut plus ici. Les classes plus
     spécifiques (.msgv2-*, .rdv-detail-scroll, .header-popover-body) gardent
     leurs règles propres. scrollbar-width/color est la spec standard ; les
     ::-webkit-scrollbar ci-dessous couvrent les Safari/Chrome plus anciens. */
  *{scrollbar-width:thin;scrollbar-color:${theme === "dark" ? "rgba(255,255,255,0.28)" : "rgba(10,10,18,0.30)"} transparent}
  ::-webkit-scrollbar{display:block;width:10px;height:10px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:${theme === "dark" ? "rgba(255,255,255,0.28)" : "rgba(10,10,18,0.30)"};border-radius:6px;border:2px solid transparent;background-clip:content-box}
  ::-webkit-scrollbar-thumb:hover{background:${theme === "dark" ? "rgba(255,255,255,0.45)" : "rgba(10,10,18,0.50)"};background-clip:content-box}
  /* ── Barre de scroll centrale institution — façon Supabase (retour
      Bryan 01/09/2026) : contrairement au reste du produit (masquée
      partout par défaut ci-dessus), la sidebar, le contenu principal et
      le panneau compte du dashboard institution montrent une vraie barre
      de défilement, unique et cohérente sur tous les écrans (tous passent
      par .yelen-main). Neutre (noir/gris, PAS le doré de marque — retour
      Bryan : "standards US comme Supabase"), noirâtre en thème clair,
      gris clair en thème sombre pour rester visible sur un fond quasi
      noir (#0A0A0F) — un thumb littéralement noir y serait invisible.
      Auto-masquée : invisible au repos, apparaît pendant le scroll,
      disparaît <2s après le dernier scroll — classe .scrollbar-active
      posée/retirée en JS (voir effet ci-dessous). scrollbar-width/
      ::-webkit-scrollbar width JAMAIS togglés (toujours réservés) : les
      toggler faisait apparaître/disparaître la gouttière elle-même et
      décalait le contenu vers la droite (retour Bryan) — seule la
      couleur du thumb change, jamais l'espace réservé. Appliqué le
      13/10/2026 à .rdv-detail-scroll (fiche RDV) puis repassé le
      19/10/2026 en barre TOUJOURS visible (retour Bryan : la barre
      disparaissait après quelques secondes sur cette pop-up précise,
      gênant — voir bloc .rdv-detail-scroll dédié ci-dessous, même
      traitement que .header-popover-body). ── */
  .msgv2-list-pane, .msgv2-thread-scroll {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }
  .msgv2-list-pane.scrollbar-active, .msgv2-thread-scroll.scrollbar-active {
    scrollbar-color: ${theme === "dark" ? "rgba(255,255,255,0.35)" : "rgba(10,10,18,0.35)"} transparent;
  }
  .msgv2-list-pane::-webkit-scrollbar, .msgv2-thread-scroll::-webkit-scrollbar {
    display: block;
    width: 10px;
    height: 10px;
  }
  .msgv2-list-pane::-webkit-scrollbar-track, .msgv2-thread-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .msgv2-list-pane::-webkit-scrollbar-thumb, .msgv2-thread-scroll::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 8px;
    transition: background-color 0.25s ease;
  }
  .msgv2-list-pane.scrollbar-active::-webkit-scrollbar-thumb, .msgv2-thread-scroll.scrollbar-active::-webkit-scrollbar-thumb {
    background: ${theme === "dark" ? "rgba(255,255,255,0.35)" : "rgba(10,10,18,0.35)"};
  }
  .msgv2-list-pane.scrollbar-active::-webkit-scrollbar-thumb:hover, .msgv2-thread-scroll.scrollbar-active::-webkit-scrollbar-thumb:hover {
    background: ${theme === "dark" ? "rgba(255,255,255,0.55)" : "rgba(10,10,18,0.55)"};
  }
  .rdv-detail-scroll {
    scrollbar-width: auto;
    scrollbar-color: ${C.border2} transparent;
  }
  .rdv-detail-scroll::-webkit-scrollbar {
    display: block;
    width: 10px;
  }
  .rdv-detail-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .rdv-detail-scroll::-webkit-scrollbar-thumb {
    background: ${C.border2};
    border-radius: 8px;
    border: 2px solid ${C.bgCard};
  }
  .rdv-detail-scroll::-webkit-scrollbar-thumb:hover {
    background: ${C.t3};
  }
  /* ── Contenu principal (.yelen-main, tous les onglets dont Vue
      d'ensemble) + Sidebar + panneau Compte — barre toujours visible
      façon YouTube/Supabase (retour Bryan 13/10/2026). Gris translucide
      neutre dans les deux thèmes (même logique que .msgv2-*/.rdv-detail-
      scroll ci-dessus) : un essai doré en thème sombre (13/10/2026) puis
      un essai couleur texte C.t2/C.t3 (trop proche du noir pur en thème
      clair, surtout au survol) ont tous les deux été annulés le
      18/10/2026. ── */
  .yelen-main, .yelen-account-panel {
    scrollbar-width: auto;
    scrollbar-color: ${theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(10,10,18,0.16)"} transparent;
  }
  .yelen-sidebar nav {
    scrollbar-width: thin;
    scrollbar-color: ${theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(10,10,18,0.16)"} transparent;
  }
  .yelen-main::-webkit-scrollbar, .yelen-account-panel::-webkit-scrollbar {
    display: block;
    width: 8px;
  }
  .yelen-sidebar nav::-webkit-scrollbar {
    display: block;
    width: 5px;
  }
  .yelen-main::-webkit-scrollbar-track, .yelen-sidebar nav::-webkit-scrollbar-track, .yelen-account-panel::-webkit-scrollbar-track {
    background: transparent;
  }
  .yelen-main::-webkit-scrollbar-thumb {
    background: ${theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(10,10,18,0.16)"};
    border-radius: 8px;
  }
  .yelen-sidebar nav::-webkit-scrollbar-thumb {
    background: ${theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(10,10,18,0.16)"};
    border-radius: 8px;
    border: 2px solid ${C.bgCard};
  }
  .yelen-account-panel::-webkit-scrollbar-thumb {
    background: ${theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(10,10,18,0.16)"};
    border-radius: 8px;
    border: 2px solid ${C.bgCard2};
  }
  .yelen-main::-webkit-scrollbar-thumb:hover, .yelen-sidebar nav::-webkit-scrollbar-thumb:hover, .yelen-account-panel::-webkit-scrollbar-thumb:hover {
    background: ${theme === "dark" ? "rgba(255,255,255,0.32)" : "rgba(10,10,18,0.28)"};
  }
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
  @keyframes slideInRight{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
  .yelen-shell{--header-h:56px}
  .tap{transition:opacity .12s,transform .12s;cursor:pointer;touch-action:manipulation;user-select:none}
  .tap:active{opacity:0.65;transform:scale(0.97)}
  /* ── Tiroir "Yelen Business" (17/09/2026) — flottant, ancré à droite,
      indépendant de la sidebar/du panneau Compte, actif à toutes les
      largeurs (contrairement à .yelen-account-panel, desktop uniquement).
      z-index au-dessus du header (200) et des popovers (500). ── */
  .yelen-business-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:598;animation:fadeIn 0.2s ease}
  .yelen-business-drawer{
    position:fixed;top:0;right:0;bottom:0;width:min(340px,92vw);height:100svh;
    background:${C.bgCard};border-left:1px solid ${C.border2};
    box-shadow:-16px 0 48px rgba(0,0,0,0.35);
    display:flex;flex-direction:column;overflow:hidden;z-index:599;
    animation:slideInRight 0.2s ease;
    padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);
  }
  /* Sélection de texte + cases/radios aux couleurs de la marque (C.gold, source
     unique theme.ts). Texte sombre sur or : le blanc sur #F5A623 n'atteint pas
     le contraste AA ; l'or reste identique en clair et en sombre. */
  :root{--selection-bg:${C.gold};--selection-fg:#1A1A1A;accent-color:${C.gold}}
  /* Filet de sécurité focus clavier : boutons/liens sans règle propre n'héritent
     plus de l'anneau bleu du navigateur. :where() = spécificité 0, donc toutes les
     règles .xxx:focus-visible des composants gardent la priorité. Inputs exclus
     (leur bordure de focus est gérée composant par composant). */
  :where(button,a,[role="button"],[tabindex]):focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
  ::selection,input::selection,textarea::selection{background:var(--selection-bg);color:var(--selection-fg)}
  ::-moz-selection,input::-moz-selection,textarea::-moz-selection{background:var(--selection-bg);color:var(--selection-fg)}
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
      width:224px;min-width:224px;height:100svh;overflow:visible;
      background:${C.bgCard};border-right:1px solid rgba(255,255,255,0.07);
      display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;z-index:400
    }
    .yelen-main{margin-left:224px;flex:1;overflow-y:scroll;height:100svh;display:flex;flex-direction:column}
    .yelen-bottom-nav{display:none!important}
    .yelen-content{flex:1;overflow-y:auto}
    .yelen-header-inner{padding:0 32px!important}
    .yelen-account-panel{
      position:fixed;top:0;bottom:0;width:216px;min-width:216px;height:100svh;
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
    max-height:76svh;display:flex;flex-direction:column;overflow:hidden;
    padding:14px 14px calc(14px + env(safe-area-inset-bottom));
    background:${C.bgCard};border:1px solid ${C.border2};border-radius:22px;
    box-shadow:0 -16px 48px rgba(0,0,0,0.5);animation:slideUp 0.22s ease;
  }
  /* ── Corps scrollable du panneau — tête (grip + titre) reste fixe pendant
      le défilement du contenu (retour Bryan 13/10/2026). min-height:0
      nécessaire : sans ça un enfant flex ne rétrécit jamais sous sa taille
      de contenu et ignore le overflow du parent. ── */
  .header-popover-body{padding-top:12px;overflow-y:auto;flex:1 1 auto;min-height:0;scrollbar-width:auto;scrollbar-color:${C.border2} transparent;padding-right:4px}
  /* ── Barre de défilement personnalisée façon YouTube/Supabase — épaisse
      et toujours visible (pas l'overlay fin qui apparaît seulement au
      survol), retour Bryan 13/10/2026. ── */
  .header-popover-body::-webkit-scrollbar{width:10px}
  .header-popover-body::-webkit-scrollbar-track{background:transparent}
  .header-popover-body::-webkit-scrollbar-thumb{background:${C.border2};border-radius:8px;border:2px solid ${C.bgCard}}
  .header-popover-body::-webkit-scrollbar-thumb:hover{background:${C.t3}}
  .header-popover-grip{display:block;flex-shrink:0}
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
      width:360px;max-height:calc(100vh - 56px - 24px);border-radius:12px;padding:0;
      box-shadow:0 8px 24px rgba(0,0,0,0.12);animation:fadeUp 0.16s ease;
    }
    .header-popover-panel .header-popover-body{padding:12px 16px 16px}
    /* Largeur unique 360 px pour tous les popovers (Aide : 400 px max). */
    .header-popover-panel[data-popover="help"]{width:400px}
    .header-popover-panel[data-popover="notifications"],.header-popover-panel[data-popover="rdv"]{width:420px;max-width:calc(100vw - 24px)}
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
  .yelen-nav-item{transition:background 0.2s ease, border-color 0.2s ease}
  .yelen-nav-item:hover{background:${C.bg3}}
  /* ── Panneau Administration : liste dense façon settings Enterprise,
      volontairement distincte du menu principal (pas d'icônes, puces,
      rangées plus compactes) — voir /chantier-design si repris. ── */
  .yelen-account-item{transition:background 0.15s ease}
  .yelen-account-item:hover{background:${theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(10,10,18,0.04)"}}
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
    .yelen-page{max-width:1600px;margin:0 auto;width:100%}
    /* Vue d'ensemble : pleine largeur, aucun vide latéral (retour Bryan 23/10/2026). */
    .yelen-page.yelen-page--fluide{max-width:none}
    /* Les onglets posent leur propre max-width (1100-1600px) + margin auto sur
       leur racine : sans cet override, ils restent centrés avec du vide à
       gauche/droite même quand .yelen-page est fluide (retour Bryan 24/10/2026).
       !important nécessaire : ces max-width sont des styles inline. */
    .yelen-page.yelen-page--fluide > *{max-width:none !important}
    /* Marges latérales internes (24-32px posées en inline par chaque onglet)
       réduites à 4px : contenu quasi collé à la sidebar et à la scrollbar. */
    .yelen-page.yelen-page--fluide > *,
    .yelen-page.yelen-page--fluide .ya-pad{padding-left:4px !important;padding-right:4px !important}
  }
  /* container-type ici (pas sur .cc-layout lui-même, qui ne peut pas se
     mesurer contre son propre contexte de confinement) : permet à
     CentreConfigurationTab.tsx de baser ses bandeaux latéraux fixes sur la
     largeur RÉELLEMENT rendue de .yelen-page plutôt que sur le viewport —
     évite tout seuil en px qui suppose une largeur de sidebar/mise à
     l'échelle Windows non garantie (retour Bryan 14/08/2026 : un seuil
     @media(min-width:1440px) ne s'est jamais déclenché en conditions
     réelles malgré un écran large, probablement à cause du scaling
     Windows qui réduit la largeur CSS effective). */
  .yelen-page{container-type:inline-size}
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
    case "termine":    return { c: C.green,  bg: C.greenL,  l: "Terminé" };
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

// Un date_rdv "brut" ("2026-07-20", sans heure) donné à `new Date(...)` est
// interprété comme minuit UTC par le moteur JS, puis reconverti dans le
// fuseau LOCAL du navigateur pour l'affichage — décale la date d'un jour
// dès que ce fuseau est en retard sur UTC (ex: un poste de dev réglé en
// Eastern Time, alors que la Guinée est en UTC+0). Bug réel diagnostiqué le
// 19/07/2026 (RDV affiché "dimanche 19" alors que la vraie date était le
// "lundi 20"). Ne pas utiliser new Date(date_rdv) directement pour de
// l'affichage — toujours passer par cette fonction, qui construit la date
// heure_rdv vient de Postgres au format "HH:MM:SS" (colonne `time`) — jamais
// utile d'afficher les secondes à l'utilisateur. Rendu en 12 h AM/PM via le
// formateur partagé (lib/heure.ts) : règle Yelen, jamais d'heure en 24 h.
function formatHeure(h?: string | null): string {
  return formaterHeureAmPm(h);
}

function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return parseLocalDate(iso).toLocaleDateString("fr-FR", opts || { day: "numeric", month: "short", year: "numeric" });
}

// Délègue à lib/salutation.ts (source unique, partagée avec le moteur de
// notifications — chantier "Yelen Assistant", 20/07/2026).
function getSalutation(name: string): string {
  return salutation(name);
}

// Statut "Support Yelen" du popover Aide (chantier "Refonte Aide &
// ressources", 06/09/2026) — jamais un signal inventé (aucun suivi réel de
// présence agent n'existe) : dérivé des horaires déjà documentés/affichés
// ailleurs dans le produit (GuideScalingModal : "Support disponible Lun–Ven,
// 8h–18h GMT"). Guinée = UTC+0 toute l'année (hypothèse déjà actée pour le
// job Clock In Shift) — getUTCDay/getUTCHours donnent directement l'heure
// locale réelle, peu importe le fuseau du navigateur.
function supportEstDisponible(maintenant: Date): boolean {
  const jour = maintenant.getUTCDay();
  const heure = maintenant.getUTCHours();
  return jour >= 1 && jour <= 5 && heure >= 8 && heure < 18;
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
// conditions_prestataire_acceptees_le est encore null. Le document qui
// fait foi est le CGP complet (/conditions-prestataires) — requalifié
// 23/09/2026 (chantier Légal & Confidentialité, Lot 1) : ce modal
// n'affiche plus qu'un résumé (lib/conditionsPrestataire.ts) et renvoie
// explicitement vers le texte complet avant que la case ne puisse être
// cochée, au lieu de faire accepter un texte "exemple" comme s'il
// s'agissait du contrat réel.
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
        <h2 style={{ color: C.t1, fontSize: "20px", fontWeight: "800", letterSpacing: "-0.4px", marginBottom: "6px" }}>Conditions Générales Prestataires</h2>
        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, marginBottom: "18px" }}>Votre établissement vient d&apos;être validé. Avant de continuer, prenez connaissance des Conditions Générales Prestataires (CGP) de Yelen224 — voici les points essentiels ; le texte complet est disponible via le lien ci-dessous.</p>
        <div style={{ backgroundColor: C.bg3, borderRadius: "14px", padding: "16px", marginBottom: "14px", maxHeight: "260px", overflowY: "auto" }}>
          {CONDITIONS_PRESTATAIRE.map((s, i) => (
            <div key={s.titre} style={{ marginBottom: i < CONDITIONS_PRESTATAIRE.length - 1 ? "14px" : 0 }}>
              <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "800", marginBottom: "4px" }}>{s.titre}</div>
              <div style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.6 }}>{s.texte}</div>
            </div>
          ))}
        </div>
        <a href="/conditions-prestataires" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.gold, fontSize: "12.5px", fontWeight: "700", textDecoration: "none", marginBottom: "18px" }}>
          Lire les CGP complètes
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17 17 7M7 7h10v10"/></svg>
        </a>
        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", marginBottom: "18px" }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ width: "18px", height: "18px", marginTop: "1px", accentColor: C.gold, flexShrink: 0, cursor: "pointer" }}/>
          <span style={{ color: C.t1, fontSize: "12.5px", lineHeight: 1.5 }}>J&apos;ai lu et j&apos;accepte les Conditions Générales Prestataires (CGP) de Yelen224.</span>
        </label>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth disabled={!checked} loading={saving} onClick={onAccept}>
          Accepter et continuer
        </Button>
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
        <h2 style={{ color: C.t1, fontSize: "24px", fontWeight: "800", letterSpacing: "-0.6px", marginBottom: "8px" }}>Compte validé !</h2>
        <p style={{ color: C.t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "24px" }}>{instName} est maintenant actif sur Yelen224. Les citoyens peuvent découvrir votre établissement et prendre rendez-vous dès maintenant.</p>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={onClose} style={{ padding: "0 32px" }}>Commencer</Button>
      </div>
    </div>
  );
}

function ProfilProgressionBandeau({ inst, tab, membreRole, configComplete, configPct }: {
  inst: Institution | null;
  instId: string;
  tab: DashboardTab;
  membreRole: MembreRole | null;
  configComplete: boolean | null;
  configPct: number | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  if (!inst) return null;

  // Masqué sur l'onglet Accueil tant que le Centre de configuration (Setup
  // Center, décision CEO 12/08/2026) y est affiché à la place — évite deux
  // barres de progression visibles simultanément. Reste affiché normalement
  // sur tous les autres onglets, comme rappel discret (usage d'origine).
  if (tab === "accueil" && membreRole !== "comptable" && !configComplete) return null;

  const steps = [
    { id: "photo",  label: "Photo",         done: !!inst.logo },
    { id: "docs",   label: "Documents",     done: !!inst.description && inst.description.length > 10 },
    { id: "dispo",  label: "Disponibilités",done: hasDisponibilites(inst.disponibilites) },
  ];
  const localDoneCnt = steps.filter(s => s.done).length;
  const localPct = Math.round((localDoneCnt / steps.length) * 100);
  // Le Centre de configuration (6 groupes réels) est la source de vérité dès
  // qu'elle a été chargée au moins une fois pendant la session — sinon repli
  // sur l'ancien calcul local à 3 steps, pour ne jamais rien afficher de vide
  // avant le premier fetch (ex. comptable, qui ne charge jamais l'agrégat).
  const pct = configComplete !== null && configPct !== null ? configPct : localPct;
  const complet = configComplete !== null ? configComplete : pct === 100;

  // en_attente utilise la vraie couleur de marque (l'or) — retour Bryan
  // 14/08/2026 : "met le vrai fond yelen et retire ce flot" (la teinte
  // translucide à 10% n'est pas la couleur Yelen, juste une dilution).
  // Fond plein C.gold + encre noire fixe (pas de token de thème, pour
  // rester lisible identiquement en clair/sombre — même règle que le hero
  // et la FAQ de CentreConfigurationTab.tsx). validee/refusee gardent leurs
  // teintes translucides vert/rouge : ce sont des couleurs de statut,
  // jamais la couleur de marque, non concernées par ce retour.
  const statutCfg: Record<string, { color: string; bg: string; border: string; label: string; ping: boolean }> = {
    validee:    { color: C.green,  bg: "rgba(0,200,150,0.10)",  border: "rgba(0,200,150,0.25)",  label: "Active",        ping: false },
    en_attente: { color: "#000000", bg: C.gold, border: "transparent", label: "En attente de validation", ping: true  },
    refusee:    { color: C.red,    bg: "rgba(255,71,87,0.10)",  border: "rgba(255,71,87,0.25)",  label: "Dossier refusé",           ping: false },
    // Absente jusqu'au 17/08/2026 : sans cette clé, le fallback `??
    // statutCfg["en_attente"]` (ligne suivante) affichait à tort "En
    // attente de validation" pour une institution suspendue — bug réel
    // signalé par Bryan, corrigé ici (root cause du bandeau erroné).
    suspendue:  { color: C.red,    bg: "rgba(255,71,87,0.10)",  border: "rgba(255,71,87,0.25)",  label: "Espace suspendu",          ping: false },
  };
  const sc = statutCfg[inst.statut ?? "en_attente"] ?? statutCfg["en_attente"];
  // Toujours l'or plein de la marque (jamais orange/vert ici) : ce bandeau
  // n'est atteint QUE quand `complet` est faux (le cas complet retourne
  // plus haut), donc un vert à pct===100 mentait — un établissement peut
  // afficher 100% de configuration sans être activé (statut≠validee), cf.
  // même principe que CentreConfigurationTab (retour Bryan 14/08/2026 :
  // "met le vrai fond yelen jaune").
  const barColor = C.gold;

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
          <span style={{ backgroundColor: C.green, color: "#fff", fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>✓ VÉRIFIÉ</span>
        )}
        {inst.statut === "refusee" && (
          <a href="mailto:support@yelen224.com" style={{ color: C.red, fontSize: "10px", fontWeight: "800", textDecoration: "none" }}>Contacter →</a>
        )}
      </div>
    );
  }

  // Rangée de pills Photo/Documents/Disponibilités retirée (retour Bryan
  // 14/08/2026) : redondante avec la checklist réelle du Centre de
  // configuration (6 groupes, cf. CentreConfigurationTab.tsx) — celle-ci
  // n'en couvrait que 3 avec des règles simplifiées/divergentes (le step
  // "Documents" y testait en réalité la description, pas les documents de
  // vérification). Le bandeau ne garde plus que la ligne de progression +
  // le statut, comme rappel discret sur les autres onglets.
  return (
    <div style={{ backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border2}`, padding: "10px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ color: C.t2, fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>Profil</span>
        <div style={{ flex: 1, height: "5px", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: "3px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, backgroundColor: barColor, borderRadius: "3px", transition: "width 0.4s ease" }}/>
        </div>
        <span style={{ color: barColor, fontSize: "11px", fontWeight: "800", flexShrink: 0, minWidth: "30px", textAlign: "right" }}>{pct}%</span>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", backgroundColor: sc.bg, border: `1px solid ${sc.border}`, borderRadius: "20px", padding: "3px 9px", flexShrink: 0 }}>
          <div style={{ position: "relative", width: "6px", height: "6px", flexShrink: 0 }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: sc.color }}/>
            {sc.ping && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: sc.color, animation: "ping 1.5s ease-out infinite" }}/>}
          </div>
          <span style={{ color: sc.color, fontSize: "10px", fontWeight: "800", whiteSpace: "nowrap" }}>{sc.label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────
// Compteur animé — anime de 0 (ou de l'ancienne valeur) vers `value` sur
// ~700ms (ease-out) à chaque changement, façon Stripe/Linear. Purement
// visuel, aucun état persistant.
function AnimatedNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    // display affiche déjà `to` dans ce cas (soit dès le montage si value
    // vaut 0, soit parce que le tick RAF précédent l'y a amené avant de
    // mettre fromRef.current à jour, voir ligne ~686) — rien à resynchroniser.
    if (from === to) return;
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

function Toast({ msg, color, onDismiss }: { msg: string; color: string; onDismiss: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  useEffect(() => { const t = setTimeout(onDismiss, 4000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div onClick={onDismiss} style={{ position: "fixed", top: "66px", left: "50%", transform: "translateX(-50%)", zIndex: 1500, backgroundColor: C.bgCard2, border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: "8px", padding: "13px 16px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", animation: "slideDown 0.25s ease", cursor: "pointer", minWidth: "220px", maxWidth: "calc(100vw - 32px)" }}>
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

// ─── useDesktopAnchor — repositionne un panneau portalé dans document.body
// au-dessous de son déclencheur, ≥1024px uniquement (retour Bryan
// 01/08/2026 : sur PC, les 5 popovers du header + la recherche s'ouvraient
// invisibles). Cause : la CSS ≥1024px (.header-popover-panel) utilise
// position:absolute + top:calc(100% + 8px) en supposant un ancêtre
// position:relative proche (le wrapper du bouton) — vrai avant le portail
// du 29/07/2026, faux depuis : une fois portalé en enfant direct de
// document.body, il n'y a plus d'ancêtre positionné entre les deux, donc
// top:100% se calculait par rapport à la hauteur du document entier au
// lieu du bas du bouton. Sous 1024px, aucun impact : le panneau y reste en
// position:fixed avec des offsets fixes (left/right/bottom:10px), qui ne
// dépendent d'aucun ancêtre positionné. Ici on calcule donc les coordonnées
// réelles du bouton (getBoundingClientRect) et on les impose en inline
// style uniquement ≥1024px ; sous ce seuil, retourne null pour laisser la
// CSS mobile inchangée piloter entièrement le panneau.
function useDesktopAnchor(triggerRef: React.RefObject<HTMLElement | null>, active: boolean, width = 360, fallbackRef?: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    // queueMicrotask (même convention que EquipeTab.tsx dans ce dossier) :
    // évite l'avertissement react-hooks/set-state-in-effect sur un setState
    // synchrone en tête d'effet, sans changer le comportement (le popover
    // n'a de toute façon pas de listener à nettoyer dans ce cas).
    if (!active) { queueMicrotask(() => setPos(null)); return; }
    const compute = () => {
      if (window.innerWidth < 1024 || !triggerRef.current) { setPos(null); return; }
      let rect = triggerRef.current.getBoundingClientRect();
      // Déclencheur masqué (replié dans « Plus ») : on s'ancre sur le bouton « Plus ».
      if (rect.width === 0 && fallbackRef?.current) rect = fallbackRef.current.getBoundingClientRect();
      // Aligné à droite du bouton, jamais hors viewport (marge 8 px).
      const right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 8, right });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [active, triggerRef, width, fallbackRef]);

  return pos;
}

// Onglet « Système » des notifications (popover et écran dédié) : contenu
// volontairement inchangé, « Bientôt disponible ».
function NotifSystemeBientot({ C }: { C: ThemeTokens }) {
  return (
    <div style={{ padding: "20px 8px 8px", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><NotifEmptyIllustration color={C.gold}/></div>
      <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>Bientôt disponible</div>
      <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6 }}>Les alertes système et informations de la plateforme Yelen apparaîtront ici.</div>
    </div>
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
// les deux. Positionnement desktop ancré via useDesktopAnchor ci-dessus
// (retour Bryan 01/08/2026, le portail avait cassé l'ancrage ≥1024px). ───
function HeaderPopover({ id, active, onOpen, onClose, trigger, badge, glow, panelTitle, children, wrapperClassName, badgeClassName, badgeLabel, fallbackAnchorRef }: {
  id: string; active: boolean; onOpen: () => void; onClose: () => void;
  trigger: React.ReactNode; badge?: number; glow?: boolean; panelTitle: string; children: React.ReactNode;
  wrapperClassName?: string; badgeClassName?: string; badgeLabel?: string; fallbackAnchorRef?: React.RefObject<HTMLElement | null>;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const desktopPos = useDesktopAnchor(ref, active, id === "help" ? 400 : id === "notifications" || id === "rdv" ? 420 : 360, fallbackAnchorRef);

  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = ref.current && ref.current.contains(target);
      const insidePanel = panelRef.current && panelRef.current.contains(target);
      if (!insideTrigger && !insidePanel) onClose();
    };
    // Échap ferme et rend le focus au déclencheur.
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { onClose(); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", key); };
  }, [active, onClose]);

  const nbBadge = badge && badge > 0 ? badge : 0;
  return (
    <div ref={ref} className={wrapperClassName} style={{ position: "relative" }}>
      <button ref={btnRef} onClick={() => (active ? onClose() : onOpen())} className="hdr-ico tap" title={nbBadge > 0 ? `${panelTitle} — ${badgeLabel ?? `${nbBadge} en attente`}` : panelTitle} aria-label={nbBadge > 0 ? `${panelTitle} — ${badgeLabel ?? `${nbBadge} en attente`}` : panelTitle} aria-haspopup="dialog" aria-expanded={active}
        style={{ position: "relative", background: active ? C.bg3 : "transparent", border: "none", borderRadius: "8px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, animation: glow && nbBadge > 0 ? "glow 1.6s ease-in-out infinite" : "none" }}>
        {trigger}
        {nbBadge > 0 && (
          <span aria-hidden="true" className={badgeClassName} style={{ position: "absolute", top: "-5px", right: "-5px", backgroundColor: C.red, color: "#fff", fontSize: "10px", fontWeight: "800", minWidth: "17px", height: "17px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.bgCard}`, padding: "0 3px" }}>
            {nbBadge > 9 ? "9+" : nbBadge}
          </span>
        )}
      </button>
      {active && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} role="dialog" aria-label={panelTitle} className="header-popover-panel" data-popover={id} style={desktopPos ? { position: "fixed", top: desktopPos.top, right: desktopPos.right, left: "auto", bottom: "auto" } : undefined}>
          <PopoverStyles C={C}/>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 10px", opacity: 0.5, flexShrink: 0 }} className="header-popover-grip"/>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "48px", padding: "0 8px 0 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <span style={{ color: C.t1, fontSize: "14px", fontWeight: 600 }}>{panelTitle}</span>
            <button onClick={onClose} aria-label="Fermer" className="hp-close tap" style={{ width: "32px", height: "32px", borderRadius: "8px", background: "none", border: "none", cursor: "pointer", color: C.t2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="header-popover-body">{children}</div>
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
        <span style={{ color: "#000", fontSize: "12px", fontWeight: "800" }}>Nouveau RDV — {rdv.citoyen_nom}</span>
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
              <div style={{ color: C.red, fontSize: "11px", fontWeight: "800", marginBottom: "3px" }}>Attention — Impact sur votre compte</div>
              <div style={{ color: C.t2, fontSize: "10px", lineHeight: 1.6 }}>Les refus répétés sans motif valable peuvent entraîner une <strong style={{ color: C.red }}>restriction ou désactivation</strong> de votre compte Yelen. Chaque refus est enregistré.</div>
            </div>
          </div>

          <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Motif du refus</div>
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
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => setShowRefusForm(false)}>
              Annuler
            </Button>
            <Button
              tokens={toUiTokens(C)} className="tap"
              variant="danger"
              size="md"
              fullWidth
              disabled={!motifFinal}
              loading={loading}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              onClick={() => { if (motifFinal) onRefuse(motifFinal); }}
            >
              Confirmer le refus
            </Button>
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

        <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "20px" }}>Demande de RDV reçue</div>

        {/* Citoyen */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", backgroundColor: C.bg3, borderRadius: "16px", padding: "14px", marginBottom: "16px" }}>
          <div style={{ width: "52px", height: "52px", position: "relative", borderRadius: "14px", overflow: "hidden", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "800", color: C.gold, flexShrink: 0 }}>
            {rdv.citoyen_photo ? <Image src={rdv.citoyen_photo} alt="" fill sizes="52px" style={{ objectFit: "cover" }}/> : rdv.citoyen_nom.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800" }}>{rdv.citoyen_nom}</div>
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
            { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>, label: "Objet", value: rdv.objet || "RDV général" },
            { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label: "Date",  value: formatDate(rdv.date_rdv, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) },
            { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>, label: "Heure", value: rdv.heure_rdv ? formatHeure(rdv.heure_rdv) : "—" },
            ...(rdv.created_at ? [{ icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>, label: "Reçu", value: timeAgo(rdv.created_at) }] : []),
          ].map((item, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "9px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ display: "flex", flexShrink: 0, marginTop: "1px" }}>{item.icon}</span>
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
          <Button
            tokens={toUiTokens(C)} className="tap"
            variant="danger"
            size="md"
            fullWidth
            disabled={loading}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
            onClick={() => setShowRefusForm(true)}
          >
            Refuser
          </Button>
          <button
            onClick={onAccept}
            disabled={loading}
            className="tap"
            style={{ width: "100%", height: "40px", padding: "0 16px", backgroundColor: C.green, color: "#fff", fontWeight: "700", fontSize: "13px", borderRadius: "12px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
          >
            {loading ? <YelenLoader size={14} color="#fff"/> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            {loading ? "Traitement…" : "Accepter le RDV"}
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
  const [bgErreur, setBgErreur] = useState(false);
  const pages = [
    { titre: "Bienvenue dans votre Centre de Commande", sous_titre: "Votre guide pour scaler rapidement", contenu: [
      { icon: "01", label: "Complétez votre profil à 100%", desc: "Un profil complet (photos, description, horaires, services) inspire confiance et aide les citoyens à choisir votre établissement en un coup d'œil." },
      { icon: "02", label: "Obtenez la Validation Yelen", desc: "Le badge vérifié vous place dans la vitrine « Partenaires vérifiés », mise en avant aux citoyens sur l'écran Découverte." },
      { icon: "03", label: "Restez réactif sur vos demandes", desc: "Un citoyen qui attend trop longtemps une réponse peut se tourner vers un autre établissement. Traitez vos nouvelles demandes rapidement." },
    ]},
    { titre: "Comprendre vos Analytics", sous_titre: "Lisez vos données comme un pro", contenu: [
      { icon: "04", label: "Le Tunnel d'Acquisition", desc: "Suivez chaque étape, de la demande initiée jusqu'au service terminé, et repérez où vous perdez le plus de clients potentiels." },
      { icon: "05", label: "La Heatmap d'Activité", desc: "Visualisez vos heures et jours les plus demandés pour ajuster vos disponibilités en conséquence." },
      { icon: "06", label: "Score de Santé Global", desc: "Un indicateur basé sur votre taux de confirmation, la satisfaction client, votre activité hebdomadaire et vos refus. Un outil pour vous auto-évaluer et progresser." },
    ]},
    { titre: "Stratégie de Croissance", sous_titre: "Développez votre activité sur Yelen", contenu: [
      { icon: "07", label: "Fidélisez avec les notes privées CRM", desc: "Notez les préférences et l'historique de chaque client depuis sa fiche. Ces notes sont privées, visibles seulement par votre équipe." },
      { icon: "08", label: "Utilisez les annonces stratégiquement", desc: "Publiez une annonce à chaque nouvelle prestation ou offre spéciale pour la rendre visible aux citoyens qui suivent votre établissement." },
      { icon: "09", label: "Analysez votre zone géographique", desc: "Identifiez les quartiers d'où viennent le plus vos clients pour cibler vos annonces là où elles comptent." },
    ]},
    { titre: "Yelen224 — Votre Partenaire", sous_titre: "Guinée · Conakry · Afrique", contenu: [
      { icon: "10", label: "Support dédié", desc: "Support disponible Lun–Ven, 8h–18h (GMT). Notre équipe vous aide à optimiser votre profil et résoudre tout problème." },
      { icon: "11", label: "Mises à jour régulières", desc: "De nouvelles fonctionnalités sont ajoutées régulièrement pour améliorer votre gestion d'activité." },
      { icon: "12", label: "Communauté de prestataires", desc: "Rejoignez les prestataires qui font confiance à Yelen224 pour développer leur activité en République de Guinée." },
    ]},
  ];
  const currentPage = pages[page];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, animation: "fadeIn 0.3s ease" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        {!bgErreur && (
          <Image src="https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2" alt="" fill sizes="100vw" priority style={{ objectFit: "cover", filter: "brightness(0.25) saturate(0.8)" }} onError={() => setBgErreur(true)}/>
        )}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${C.bg}88 0%, ${C.bg}EE 40%, ${C.bg} 100%)` }}/>
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100svh", padding: "20px 20px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "36px", height: "36px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <YelenLogo size={22} color="#000" />
            </div>
            <span style={{ color: C.gold, fontSize: "13px", fontWeight: "800", letterSpacing: "0.5px" }}>YELEN224 PRO</span>
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
          <h2 style={{ color: C.t1, fontSize: "28px", fontWeight: "800", letterSpacing: "-0.8px", lineHeight: 1.2, marginBottom: "6px" }}>{currentPage.titre}</h2>
          <p style={{ color: C.t2, fontSize: "13px", marginBottom: "28px" }}>{currentPage.sous_titre}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
            {currentPage.contenu.map((item, i) => (
              <div key={i} style={{ backgroundColor: theme === "dark" ? "rgba(17,17,24,0.85)" : "rgba(255,255,255,0.88)", border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "14px 16px", display: "flex", gap: "14px", backdropFilter: "blur(8px)", animation: `fadeUp 0.25s ease ${i * 0.08}s both` }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, border: `1px solid ${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "800", color: C.gold, flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "3px" }}>{item.label}</div>
                  <div style={{ color: C.t2, fontSize: "11px", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: page > 0 ? "1fr 2fr" : "1fr", gap: "10px" }}>
          {page > 0 && (<Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => setPage(p => p - 1)}>Retour</Button>)}
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={() => page < pages.length - 1 ? setPage(p => p + 1) : onClose()}>
            {page < pages.length - 1 ? "Continuer" : "Commencer à scaler"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SCORE SANTÉ
// ═══════════════════════════════════════════════════════════════════════
function ScoreSante({ score, stats, actionsPrioritaires, onVoirActions }: { score: number; stats: Stats; actionsPrioritaires?: number; onVoirActions?: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const color = score >= 80 ? C.green : score >= 60 ? C.gold : score >= 40 ? C.orange : C.red;
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Bon" : score >= 40 ? "À améliorer" : "Critique";
  // V3 (17/09/2026) — poids réels de scoreSante (voir calcul dans loadData),
  // affichés pour rendre le score explicable plutôt qu'une boîte noire.
  // Seuil ✓/⚠ à 70% : arbitraire mais cohérent avec les seuils déjà
  // utilisés pour label/couleur du score global (60/80).
  const facteurs = [
    { label: "Taux de confirmation", value: stats.taux_confirmation, color: C.green, poids: 30 },
    { label: "Satisfaction clients", value: stats.taux_satisfaction, color: C.gold, poids: 25 },
    { label: "Réactivité (RDV/sem)", value: Math.min(stats.week * 10, 100), color: C.blue, poids: 20 },
    { label: "Absence de refus", value: Math.max(0, 100 - stats.ratio_refus * 10), color: C.blue, poids: 25 },
  ];
  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${color}25`, marginBottom: "20px", boxShadow: C.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
        <div style={{ position: "relative", width: "100px", height: "100px", flexShrink: 0 }}>
          <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${(score/100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)" }}/>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color, fontSize: "28px", fontWeight: "800", lineHeight: 1 }}><AnimatedNumber value={score}/></span>
            <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700" }}>/100</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="yelen-h2" style={{ color: C.t1, marginBottom: "3px" }}>Score de Santé</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", color, fontSize: "11px", fontWeight: "800", padding: "3px 10px", borderRadius: "20px" }}>{label}</div>
          <div style={{ color: C.t3, fontSize: "10px", marginTop: "6px" }}>
            {score >= 80 ? "Votre établissement performe excellemment. Continuez !" : score >= 60 ? "Bon niveau. Quelques ajustements pour atteindre l'excellence." : "Des actions sont nécessaires pour améliorer votre performance."}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {facteurs.map(f => {
          const ok = f.value >= 70;
          return (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {ok ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              )}
              <span style={{ color: C.t3, fontSize: "10px", width: "128px", flexShrink: 0 }}>{f.label}</span>
              <div style={{ flex: 1, height: "4px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${f.value}%`, backgroundColor: f.color, borderRadius: "2px" }}/>
              </div>
              <span style={{ color: f.color, fontSize: "11px", fontWeight: "800", width: "32px", textAlign: "right" }}>{Math.round(f.value)}%</span>
            </div>
          );
        })}
      </div>
      <button onClick={() => setDetailsOuverts(v => !v)} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "10.5px", fontWeight: "700", cursor: "pointer", padding: "10px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
        {detailsOuverts ? "Masquer les détails" : "Voir les détails"} <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" style={{ transform: detailsOuverts ? "rotate(-90deg)" : "rotate(90deg)" }}><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      {detailsOuverts && (
        <div style={{ marginTop: "8px", padding: "12px 14px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px" }}>
          <div style={{ color: C.t2, fontSize: "10.5px", lineHeight: 1.6 }}>
            Score = somme pondérée des 4 facteurs ci-dessus : Taux de confirmation (30%), Satisfaction clients (25%), Réactivité — RDV cette semaine (20%), Absence de refus sur vos 10 derniers RDV traités (25%).
            {" "}Un facteur marqué ⚠ est sous 70% et pèse sur le score global.
          </div>
        </div>
      )}
      {!!actionsPrioritaires && actionsPrioritaires > 0 && (
        <div style={{ marginTop: "16px", border: `1px solid ${C.red}30`, borderRadius: "14px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
          <span style={{ color: C.red, fontSize: "12px", fontWeight: "800", flex: 1 }}>{actionsPrioritaires} action{actionsPrioritaires > 1 ? "s" : ""} prioritaire{actionsPrioritaires > 1 ? "s" : ""} requise{actionsPrioritaires > 1 ? "s" : ""}</span>
          {onVoirActions && (
            <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="sm" onClick={onVoirActions} style={{ flexShrink: 0 }}>Voir les actions</Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OBJECTIFS HEBDOMADAIRES
// ═══════════════════════════════════════════════════════════════════════
function ObjectifsHebdo({ stats }: { stats: Stats }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const objectifs = [
    { label: "RDV cette semaine", actuel: stats.week, cible: Math.max(stats.week + 3, 10), unite: "" },
    { label: "Taux de confirmation", actuel: stats.taux_confirmation, cible: 80, unite: "%" },
    { label: "Score satisfaction", actuel: stats.taux_satisfaction, cible: 85, unite: "%" },
  ];
  return (
    <ApercuCard C={C} titre="Objectifs de la semaine" titreId="apc-objectifs" className="apc-objectifs">
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {objectifs.map(obj => {
          // Même calcul qu'avant : proportion valeur / cible, plafonnée à 100 %.
          const pct = Math.min((obj.actuel / obj.cible) * 100, 100);
          const texte = obj.unite ? `${obj.actuel} % · objectif ${obj.cible} %` : `${obj.actuel} / ${obj.cible}`;
          return <LigneObjectif key={obj.label} C={C} label={obj.label} texte={texte} pct={pct}/>;
        })}
      </div>
    </ApercuCard>
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
  const [camPhase, setCamPhase] = useState<"avant" | "demarrage" | "actif" | "refuse" | "pas_de_camera">("avant");
  const [scanResult, setScanResult] = useState<{ rdv: { id: string; citoyen_nom?: string; objet?: string; date_rdv?: string } } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  // Titre dynamique (01/09/2026) — jusqu'ici toujours "QR invalide" quelle
  // que soit la cause. Un QR au cycle définitivement expiré n'est pas un
  // "QR invalide" au sens habituel (mauvais code) mais un rendez-vous que le
  // système refuse désormais de laisser confirmer — le staff doit voir
  // pourquoi, pas juste "invalide" (retour Bryan : jamais de blocage muet).
  const [errorTitre, setErrorTitre] = useState("QR invalide");
  const [confirming, setConfirming] = useState(false);
  const html5QrRef = useRef<Html5Qrcode | null>(null);

  async function traiterCode(decodedText: string) {
    try {
      const storedId = localStorage.getItem("yelen224_institution_id") || institutionId;
      const res = await fetch("/api/qr/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qr_payload: decodedText, institution_id: storedId }) });
      const data = await res.json();
      if (!res.ok) { setErrorTitre(data.titre || "QR invalide"); setErrorMsg(data.error || "QR invalide"); setPhase("error"); return; }
      setScanResult(data);
      setPhase("result");
    } catch { setErrorTitre("QR invalide"); setErrorMsg("Erreur réseau"); setPhase("error"); }
  }

  // stop() de html5-qrcode lève une exception SYNCHRONE ("Cannot stop,
  // scanner is not running or paused.") quand le scan n'est pas actif —
  // un simple .catch() ne l'attrape jamais puisque le throw a lieu avant
  // qu'une Promise existe à chaîner. D'où ce garde-fou sur isScanning.
  function arreterCameraSiActive(html5QrCode: Html5Qrcode | null) {
    if (!html5QrCode?.isScanning) return;
    try { html5QrCode.stop().catch(() => {}); } catch {}
  }

  // Beaucoup de PC de bureau en institution n'ont tout simplement aucune
  // caméra (contrairement à un téléphone/une tablette) — ce que
  // html5-qrcode renvoie alors ("NotFoundError"/erreur générique selon le
  // navigateur) était jusqu'ici confondu avec un refus de permission
  // ("Autorisez la caméra... puis réessayez", un message qui n'aide à rien
  // si l'ordinateur n'a physiquement pas de caméra). enumerateDevices()
  // liste les périphériques sans exiger la permission caméra au préalable
  // (seuls les labels détaillés sont masqués sans permission, pas le type
  // "videoinput" lui-même) — détection faite AVANT de déclencher le prompt
  // navigateur, pour distinguer les deux cas et orienter vers Yelen
  // Business Mobile (caméra native, déjà le vrai cas d'usage produit, voir
  // docs/chantiers/YELEN-BUSINESS-MOBILE.md §14.3) quand aucune caméra
  // n'existe sur ce poste. `force` permet de passer outre si la détection
  // se trompe (certains navigateurs/pilotes webcam exotiques).
  async function demarrerCamera(force = false) {
    setCamPhase("demarrage");
    try {
      if (!force && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!devices.some(d => d.kind === "videoinput")) { setCamPhase("pas_de_camera"); return; }
      }
      const { Html5Qrcode: Html5QrcodeLib } = await import("html5-qrcode");
      const html5QrCode = new Html5QrcodeLib("qr-reader-modal");
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
      const res = await fetch("/api/qr/validate", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rdv_id: scanResult.rdv.id, action: "present", institution_id: institutionId }) });
      const data = await res.json().catch(() => null);
      // Course possible entre le scan (POST) et ce clic : le QR peut avoir
      // expiré entre-temps (défense en profondeur côté serveur, voir
      // validate/route.ts) — remontée explicite au lieu d'un succès muet.
      if (!res.ok) { setErrorTitre(data?.titre || "QR invalide"); setErrorMsg(data?.error || "Erreur de confirmation"); setPhase("error"); return; }
      setPhase("done");
    } catch { setErrorTitre("QR invalide"); setErrorMsg("Erreur"); setPhase("error"); } finally { setConfirming(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "22px", padding: "24px 20px", width: "100%", maxWidth: "440px", border: `1px solid ${C.border2}`, animation: "fadeUp 0.2s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800" }}>Scanner le Client</div>
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
                  <YelenLoader size={36} label="Ouverture de la caméra…" labelColor={C.t2}/>
                </div>
              )}
            </div>
            {camPhase === "avant" && (
              <div style={{ textAlign: "center", padding: "28px 12px" }}>
                <Image src="/illustrations/checkin-scan-client-icon.png" alt="" width={200} height={200} style={{ width: "72px", height: "72px", margin: "0 auto 16px", display: "block" }}/>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Scanner le QR code Yelen du citoyen</div>
                <div style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, marginBottom: "20px" }}>Yelen a besoin d&apos;accéder à votre caméra pour lire le code présenté par le citoyen à son arrivée.</div>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={demarrerCamera}>
                  Activer la caméra
                </Button>
              </div>
            )}
            {camPhase === "refuse" && (
              <div style={{ textAlign: "center", padding: "28px 12px" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "18px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                </div>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Accès à la caméra impossible</div>
                <div style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, marginBottom: "20px" }}>Autorisez la caméra pour Yelen224 dans les réglages de votre navigateur, puis réessayez.</div>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => demarrerCamera()}>
                  Réessayer
                </Button>
              </div>
            )}
            {camPhase === "pas_de_camera" && (
              <div style={{ textAlign: "center", padding: "28px 12px" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "18px", border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                </div>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Aucune caméra détectée sur cet ordinateur</div>
                <div style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, marginBottom: "20px" }}>
                  Scannez plutôt depuis votre téléphone, avec l&apos;application <strong style={{ color: C.t1 }}>Yelen Business</strong> — même compte, caméra native, plus rapide au guichet.
                </div>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => demarrerCamera(true)} style={{ marginBottom: "8px" }}>
                  Essayer quand même sur cet ordinateur
                </Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="ghost" size="md" fullWidth onClick={onClose}>
                  Fermer
                </Button>
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
              <div style={{ width: "48px", height: "48px", borderRadius: "13px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "800", color: C.gold }}>
                {(scanResult.rdv.citoyen_nom || "C")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800" }}>{scanResult.rdv.citoyen_nom}</div>
                <div style={{ color: C.t3, fontSize: "11px" }}>{scanResult.rdv.objet || "RDV général"} · {formatDate(scanResult.rdv.date_rdv ?? "", { day: "numeric", month: "short" })}</div>
              </div>
            </div>
            <div>
              <button onClick={() => confirmer()} disabled={confirming} className="tap" style={{ width: "100%", height: "40px", padding: "0 16px", backgroundColor: C.green, color: "#fff", fontWeight: "700", fontSize: "13px", borderRadius: "12px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
                {confirming ? <YelenLoader size={15} color="#fff"/> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                {confirming ? "Confirmation…" : "Confirmer la présence"}
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
            <div style={{ color: C.green, fontSize: "20px", fontWeight: "800", marginBottom: "4px" }}>Présence confirmée</div>
            <div style={{ color: C.t3, fontSize: "11px", marginBottom: "20px" }}>Le RDV reste &quot;Confirmé&quot; pendant la prestation — revenez à la liste RDV pour le marquer terminé une fois achevé.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => { setPhase("scan"); setScanResult(null); }}>Scanner suivant</Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ flex: 1 }} onClick={onClose}>Fermer</Button>
              </div>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "50%", backgroundColor: C.redL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <div style={{ color: C.red, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>{errorTitre}</div>
            <div style={{ color: C.t2, fontSize: "12px", marginBottom: "20px", whiteSpace: "pre-line" }}>{errorMsg}</div>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => { setPhase("scan"); setErrorMsg(""); setErrorTitre("QR invalide"); }} style={{ padding: "0 32px" }}>Réessayer</Button>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
// Workspace persistant (Lot 04-B) : le composant lui-même ne démonte jamais
// tant que l'utilisateur reste sur cette route — seul le rendu interne de
// chaque onglet change. Renommé (non exporté) pour permettre l'ajout d'une
// frontière <Suspense> ci-dessous, requise par useSearchParams() (piège déjà
// documenté dans le projet : useSearchParams sans Suspense casse le build
// Netlify en prerendering, invisible à tsc).
function InstitutionDashboardInner() {
  const { theme, mode, setMode } = useTheme();
  const C = T[theme] as ThemeTokens;
  const params  = useParams();
  const router  = useRouter();
  const searchParams = useSearchParams();
  const rawId   = params?.id;
  const instId  = Array.isArray(rawId) ? rawId[0] : rawId ?? "";
  const rawSlug = params?.slug;
  const urlSlug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug ?? "";
  const rawScreen = params?.screen;
  const screenParam = Array.isArray(rawScreen) ? rawScreen[0] : rawScreen ?? "";

  const [inst, setInst]             = useState<Institution | null>(null);
  const [rdvs, setRdvs]             = useState<RDV[]>([]);
  const [exportAccueilEnCours, setExportAccueilEnCours] = useState(false);
  const [clients, setClients]       = useState<Client[]>([]);
  // Fail-closed : null tant que le rôle n'est pas connu (chargement, ou
  // échec de fetch) — jamais un défaut permissif. isAdmin dérivé conservé
  // pour les usages existants (rdv-historique preload, etc.), le nouveau
  // code doit préférer canAccessTab(membreRole, ...)/can(membreRole, ...).
  const [membreRole, setMembreRole] = useState<MembreRole | null>(null);
  // Rôles personnalisés (16/09/2026) — domaines retirés au rôle de base
  // pour CE membre (institution_membres.acces_restreints), pilote le
  // masquage réel de la nav via tabAllowed/tabReadOnly (3e paramètre).
  const [accesRestreints, setAccesRestreints] = useState<string[] | null>(null);
  const isAdmin = membreRole === "admin";
  // Prénom du membre connecté (16/09/2026, retour Bryan) — le header
  // saluait jusqu'ici toujours l'institution ("Bonjour, {inst.name}"), sans
  // distinction entre les 5 rôles qui peuvent s'y connecter. Fallback sur
  // inst.name tant que /api/institution/membres n'a pas répondu.
  const [membrePrenom, setMembrePrenom] = useState<string | null>(null);
  // Yelen Security Activation (16/09/2026) — voir lib/institutionAuth.ts.
  // null tant que non chargé = jamais bloquant par défaut (fail-open le
  // temps du premier appel, cohérent avec le reste de ce fichier).
  const [activationSecurite, setActivationSecurite] = useState<{ requise: boolean; bloque: boolean; deadline: string | null } | null>(null);
  const [popupActivationOuvert, setPopupActivationOuvert] = useState(false);
  const [popupActivationDismiss, setPopupActivationDismiss] = useState(false);
  const [stats, setStats]           = useState<Stats>({
    today: 0, week: 0, month: 0, pending: 0, confirmed: 0, done: 0, cancelled: 0, nouveau: 0, absents: 0, non_traites: 0,
    avis_count: 0, moyenne_avis: 0, avis_non_lus: 0,
    taux_confirmation: 0, taux_annulation: 0, taux_satisfaction: 0, rdv_total: 0,
    evolution_week: 0, evolution_month: 0, evolution_week_has: false, evolution_month_has: false, peak_hour: "—", peak_day: "—",
    rdv_par_jour: [], rdv_par_heure: [], notes_distribution: [], recent_activity: [],
    ratio_refus: 0, compte_restreint: false, score_sante: 0,
    kpi_variations: { nouveau: VARIATION_NULLE, pending: VARIATION_NULLE, confirmed: VARIATION_NULLE, done: VARIATION_NULLE, cancelled: VARIATION_NULLE, total: VARIATION_NULLE, non_traites: VARIATION_NULLE },
  });

  // Nouvelle structure de menu (chantier réorganisation dashboard) : "demandes"
  // fusionné dans "rdv" (Lot 2, filtre par statut "Nouveaux"). "disponibilites",
  // "services", "communication" et "scanner" sont de nouveaux onglets de
  // premier niveau (contenu réel ajouté lots suivants — squelette pour l'instant).
  //
  // Workspace persistant (Lot 04-B, migré URLs dynamiques institution) :
  // "tab" n'est plus un useState local mais une valeur dérivée du segment
  // d'URL [screen] (/{slug}/{id}/{screen}), seule source de vérité — jamais
  // deux systèmes qui peuvent diverger (section 5 du brief). isTabKey() est
  // le même garde-fou runtime déjà utilisé pour le RBAC (lib/institutionPermissions.ts,
  // TAB_KEYS couvre exactement les 34 valeurs de DashboardTab) : un segment
  // invalide ou absent retombe silencieusement sur "accueil" (Test G). Le
  // segment "dashboard" (écran d'accueil, seul nom conservé de l'ancienne
  // route /institution/{id}/dashboard) correspond au tab interne "accueil".
  // setTab() garde EXACTEMENT la même signature qu'avant partout ailleurs
  // dans ce fichier (15+ sites d'appel inchangés) — seul router.push (jamais
  // .replace) crée une entrée d'historique navigateur (section 6, Test D),
  // en conservant les query params existants pour ne jamais écraser
  // ?subtab= posé par ClockInShiftTab.
  const tab: DashboardTab =
    screenParam !== "dashboard" && isTabKey(screenParam) ? (screenParam as DashboardTab) : "accueil";
  // Compte les navigations internes (setTab) depuis le montage du dashboard
  // — permet à "Retour" (plus bas) de distinguer "il y a un vrai historique
  // à l'intérieur du dashboard" de "premier écran vu, rien avant" (lien
  // direct, refresh) : dans ce dernier cas router.back() sortirait carrément
  // du dashboard, d'où le repli sur Accueil.
  const navCountRef = useRef(0);
  const setTab = useCallback((next: DashboardTab) => {
    navCountRef.current += 1;
    const segment = next === "accueil" ? "dashboard" : next;
    const qs = searchParams.toString();
    router.push(`/${urlSlug}/${instId}/${segment}${qs ? `?${qs}` : ""}`);
  }, [searchParams, urlSlug, instId, router]);
  // "Retour" (retour Bryan 15/08/2026) : affiché en haut des écrans
  // secondaires (accessibles uniquement via le sous-menu "Compte" ou le
  // bouton Paramètres, jamais directement depuis la sidebar/barre du bas —
  // voir accountTabKeys plus loin dans ce fichier). Revient dans l'historique
  // réel du navigateur quand il y en a un dans cette session du dashboard,
  // sinon repli sûr vers Accueil.
  const handleRetour = useCallback(() => {
    if (navCountRef.current > 0) router.back();
    else setTab("accueil");
  }, [router, setTab]);
  // Mount-on-first-visit + keep-mounted (section 2 du brief) : chaque onglet
  // visité au moins une fois pendant cette session du dashboard reste dans
  // visitedTabs pour le reste de la session — KeepMounted (plus bas dans ce
  // fichier) l'utilise pour ne jamais démonter un onglet déjà visité, en le
  // masquant par CSS (display:none) plutôt qu'en le retirant du DOM. Ne
  // survit pas un refresh complet (nouvelle session), ce qui est le
  // comportement attendu (Test E : refresh doit rouvrir le tab de l'URL, pas
  // "se souvenir" des autres onglets déjà visités avant le refresh).
  const [visitedTabs, setVisitedTabs] = useState<Set<DashboardTab>>(() => new Set([tab]));
  useEffect(() => {
    setVisitedTabs(prev => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);
  // Écran dédié "Espace suspendu" (décision CEO 17/08/2026) : Accueil est
  // remplacé, et les autres onglets métier redirigent silencieusement vers
  // Accueil — seuls Messagerie (suivre les conversations déjà ouvertes,
  // pas "Communication"/annonces publiques — retour Bryan 17/08/2026) et
  // Paramètres/Compte restent navigables (ALLOWED_TABS_SUSPENDU,
  // module-level). Cosmétique uniquement (même principe que le RBAC nav
  // ci-dessus, "la vraie barrière vit dans chaque route API") : chaque
  // route API vérifie déjà indépendamment le statut institution le cas
  // échéant (POST /api/institution/messages notamment), ceci ne fait
  // qu'orienter l'UI.
  const suspendu = inst?.statut === "suspendue";
  useEffect(() => {
    if (suspendu && !ALLOWED_TABS_SUSPENDU.has(tab)) setTab("accueil");
  }, [suspendu, tab, setTab]);
  // Agent d'accueil (retour Bryan 13/09/2026) : pas de vue d'ensemble
  // générique, "Accueil" redirige directement vers "Valider un RDV" — front
  // office pur, même principe que le comptable et sa FinanceAccueilTab
  // dédiée. Gardé après le redirect de suspension (pas dans
  // ALLOWED_TABS_SUSPENDU) pour ne jamais entrer en boucle avec lui.
  useEffect(() => {
    if (!suspendu && membreRole === "agent" && tab === "accueil") setTab("valider-rdv");
  }, [suspendu, membreRole, tab, setTab]);
  // Filtre de nav additionnel (cosmétique, polish) : cache les entrées
  // menant à un onglet bloqué pendant la suspension, en plus de la
  // redirection ci-dessus qui reste la vraie garde-fou. "__plus__"/"guide"
  // ne sont pas des onglets (ouvrent un menu/une modale), jamais masqués.
  const navAllowed = useCallback((key: string) => {
    if (!tabAllowed(membreRole, key, accesRestreints)) return false;
    if (suspendu && key !== "__plus__" && key !== "guide" && !ALLOWED_TABS_SUSPENDU.has(key as DashboardTab)) return false;
    return true;
  }, [membreRole, accesRestreints, suspendu]);
  // Centre de configuration (Setup Center post-inscription, décision CEO
  // 12/08/2026) : null tant que le statut réel n'a pas encore été chargé
  // par CentreConfigurationTab — traité comme "pas complet" pour éviter un
  // flash du dashboard KPI avant d'avoir la vraie réponse serveur.
  const [configComplete, setConfigComplete] = useState<boolean | null>(null);
  // Force un remontage de CentreConfigurationTab (donc un refetch de
  // /api/institution/configuration-status) quand institutions.statut
  // change en base pendant la session — sinon un admin qui valide
  // pendant que l'institution est connectée ne bascule jamais vers le
  // dashboard KPI sans recharger la page à la main (retour Bryan
  // 21/08/2026 : validé côté admin, notification reçue, mais l'écran
  // "Vérification en cours" reste affiché).
  const [instRefreshKey, setInstRefreshKey] = useState(0);
  const [configPct, setConfigPct] = useState<number | null>(null);
  // Force un refetch de CommunauteProTab (adhésion Yelen Community) quand
  // institutions.communaute_statut change en base pendant la session — même
  // besoin que instRefreshKey ci-dessus, colonne distincte (voir listener
  // realtime plus bas).
  const [communauteRefreshKey, setCommunauteRefreshKey] = useState(0);
  const [messagerieUnread, setMessagerieUnread] = useState(0);
  // Support Yelen (chantier "Séparation Messagerie/Support" 06/09/2026) —
  // strictement séparé de messagerieUnread ci-dessus depuis que le canal
  // Yelen a quitté MessagerieTab pour un écran dédié (SupportYelenTab).
  // Retour Bryan 06/09/2026 : ouvert dans un NOUVEL ONGLET NAVIGATEUR (URL
  // propre /{slug}/{id}/support, "support" ajouté à TAB_KEYS/DashboardTab
  // en "full" pour les 5 rôles — hors RBAC métier comme Feedback/Aide/Guide,
  // simplement routable) plutôt qu'une pop-up plein écran superposée à
  // l'onglet courant, pour permettre de naviguer entre les deux écrans.
  const [supportUnread, setSupportUnread] = useState(0);
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
  // 3e menu "Yelen Business" (17/09/2026) — panneau empilé à droite du
  // panneau Compte, ouvert depuis son item "Plus" (voir YELEN_BUSINESS_TABS).
  // Fermé automatiquement avec le panneau Compte (closeAccountMenu) puisqu'il
  // n'a pas de sens sans lui rester ouvert.
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Sous-sections repliables de la section sidebar "Finance" (7 écrans → 2
  // entrées) — fermées par défaut, façon NN/g (au-delà de 2 niveaux de nav
  // la compréhension se dégrade, donc pas de 3e niveau). S'ouvrent aussi
  // automatiquement si `tab` bascule sur un de leurs enfants (ex: lien
  // direct), sans jamais refermer l'autre groupe. Desktop uniquement
  // (sidebar étendue) — voir renderMainNav : en mode réduit (icon rail
  // 76px) la section Finance reste rendue à plat comme avant, la
  // hiérarchie n'a pas de sens sans place pour l'indentation/les labels.
  const [financeGroupsOpen, setFinanceGroupsOpen] = useState<{ operations: boolean; suivi: boolean }>({ operations: false, suivi: false });
  const [equipeTravailGroupsOpen, setEquipeTravailGroupsOpen] = useState<{ equipe: boolean; travail: boolean }>({ equipe: false, travail: false });
  // Groupe "Établissement" du panneau Compte (retour Bryan 17/09/2026) :
  // repliable, fermé par défaut — configuration/documents/conditions ne
  // servent qu'une fois, juste après la création du compte, pas à consulter
  // à chaque visite comme les autres groupes du panneau. Rouvert
  // automatiquement si `tab` est déjà un de ses enfants (lien direct).
  const [etablissementOpen, setEtablissementOpen] = useState(false);
  // Tooltip instantané façon Supabase pour les icônes de la sidebar
  // réduite — portalé (position:fixed) pour ne pas être rogné par
  // overflow-y:auto du <nav> (CSS force overflow-x en "auto" dès que
  // overflow-y n'est pas "visible", même non explicitement posé).
  const [navTooltip, setNavTooltip] = useState<{ label: string; top: number } | null>(null);
  const showNavTooltip = (label: string) => (e: React.MouseEvent<HTMLElement>) => {
    if (!sidebarCollapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setNavTooltip({ label, top: r.top + r.height / 2 });
  };
  const hideNavTooltip = () => setNavTooltip(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  // Bascule si loadData() dépasse 8s sans avoir répondu — jamais un
  // chargement muet, l'utilisateur doit savoir que c'est plus lent que
  // d'habitude plutôt que de se demander si l'app est figée (retour Bryan
  // 21/08/2026 : "Yelen ne doit jamais être silencieux").
  const [slowLoading, setSlowLoading]       = useState(false);
  const slowLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing]         = useState(false);
  const [lastUpdated, setLastUpdated]       = useState<Date | null>(null);
  const [showScanner, setShowScanner]       = useState(false);
  const [showGuide, setShowGuide]           = useState(false);
  // Lot C (refonte cycle de vie RDV, 16/07/2026) — "Prendre en charge" :
  // préremplit Valider un RDV payant (au lieu de retaper le code), ou affiche
  // le dialogue de blocage exact du CEO si hors créneau (jamais un simple
  // toast — la règle ne doit laisser aucune ambiguïté sur pourquoi c'est bloqué).
  const [preloadBookingId, setPreloadBookingId] = useState<string | null>(null);
  const [horsCreneauDialog, setHorsCreneauDialog] = useState<RDV | null>(null);
  const [termineDialog, setTermineDialog] = useState<RDV | null>(null);
  const [selectedRDV, setSelectedRDV]       = useState<RDV | null>(null);
  const [mesClientsInitialId, setMesClientsInitialId] = useState<string | null>(null);
  const [mesClientsInitialFiltre, setMesClientsInitialFiltre] = useState<"fideles" | "nouveaux" | "occasionnels" | "a_reactiver" | null>(null);
  const [mesClientsInitialSearch, setMesClientsInitialSearch] = useState<string | null>(null);
  const rdvHisto = useRdvHistorique(selectedRDV?.id ?? null, tabAllowed(membreRole, "journal"));
  const [actionLoading, setActionLoading]   = useState<string | null>(null);
  // Confirmation "Marquer absent" (retour Bryan 17/08/2026 : "tu cliques,
  // le processus commence sans aucun message d'action") — niveau 2 (motif
  // obligatoire depuis le 08/09/2026, revenant sur le choix initial du
  // 05/08/2026 : un no-show déclenche une mécanique de restriction citoyen
  // potentiellement lourde, l'accountability l'exige) — partagée par les 3
  // points d'entrée (fiche détail + 2 lignes de liste).
  const [confirmAbsent, setConfirmAbsent]   = useState<{ id: string; nom: string } | null>(null);
  const [confirmAbsentMotif, setConfirmAbsentMotif] = useState("");
  const [confirmAbsentError, setConfirmAbsentError] = useState<string | null>(null);
  const [confirmRefuse, setConfirmRefuse]   = useState<{ id: string; nom: string } | null>(null);
  const [confirmRefuseMotif, setConfirmRefuseMotif] = useState("");
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
  const [prepModalRdv, setPrepModalRdv]     = useState<RDV | null>(null);
  const [bannerRdv, setBannerRdv]           = useState<RDV | null>(null);
  const [showBannerDetail, setShowBannerDetail] = useState(false);
  const [dismissRetard, setDismissRetard]   = useState(false);
  const lastRdvCountRef                     = useRef(0);
  // Vue d'ensemble V3 (17/09/2026) — sélecteur de période du graphe
  // "Évolution des RDV", dérivé côté client de `rdvs` (déjà chargé, 300
  // RDV les + récents, voir api/institution/rdv/route.ts) : pas de
  // nouvel appel réseau pour passer de 7 à 30/90 jours.
  const [evolutionRange, setEvolutionRange] = useState<7 | 30 | 90>(7);

  // ── Header : popovers (recherche, "...", feedback, aide, RDV entrant) ──
  const [activePopover, setActivePopover]   = useState<"search" | "system" | "feedback" | "help" | "rdv" | "notifications" | "questions" | "avatar" | "plus" | null>(null);
  const [institutionNotifs, setInstitutionNotifs] = useState<NotificationInstitution[]>([]);
  // Affichage seulement : ids non lus au moment de l'ouverture du popover
  // (le marquage lu, lui, reste fait à l'ouverture par ouvrirNotifications).
  const [notifsNonLuesAffichees, setNotifsNonLuesAffichees] = useState<ReadonlySet<string>>(new Set());
  const [notifsChargement, setNotifsChargement] = useState(false);
  const [notifsErreur, setNotifsErreur] = useState(false);
  // Changements sensibles de profil (nom, adresse, localisation, activité) en
  // cours d'examen par l'équipe Yelen — pastille rouge sur l'avatar du header
  // et sur l'entrée "Entreprise" des menus, pour que rien ne soit silencieux
  // (voir docs/product/YELEN_REVERIFICATION_POLICY.md). Disparaît dès que
  // l'équipe a répondu (la réponse arrive aussi par notification).
  const [changementsProfilEnCours, setChangementsProfilEnCours] = useState(0);
  const [ongletNotif, setOngletNotif] = useState<"utilisateur" | "systeme">("utilisateur");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecte" | "reconnexion" | "hors_ligne">("reconnexion");
  const [searchQuery, setSearchQuery]       = useState("");
  const [feedbackType, setFeedbackType]     = useState<"bug" | "suggestion" | "ux" | "fonctionnalite">("bug");
  const [feedbackMsg, setFeedbackMsg]       = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const searchRef                           = useRef<HTMLDivElement>(null);
  const searchInputRef                      = useRef<HTMLInputElement>(null);
  const plusWrapRef                         = useRef<HTMLDivElement>(null);
  const isMac = React.useSyncExternalStore(() => () => {}, () => /Mac/i.test(navigator.platform), () => false);
  const searchPanelRef                      = useRef<HTMLDivElement>(null);
  const searchDesktopPos = useDesktopAnchor(searchRef, activePopover === "search");
  // Raccourci Ctrl/⌘ K : ouvre la recherche (même popover qu'au clic).
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActivePopover("search");
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

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
      .then(j => {
        setMembreRole(isMembreRole(j?.role) ? j.role : null);
        setAccesRestreints(Array.isArray(j?.moi?.acces_restreints) ? j.moi.acces_restreints : null);
        setMembrePrenom(typeof j?.moi?.prenom === "string" ? j.moi.prenom : null);
      })
      .catch(() => { setMembreRole(null); setAccesRestreints(null); setMembrePrenom(null); });
  }, [instId]);

  // Yelen Security Activation — chargé une fois au montage du dashboard,
  // jamais bloquant par défaut si l'appel échoue (fail-open, cohérent avec
  // le reste de cette page : une panne de ce endpoint ne doit jamais priver
  // un membre légitime de son dashboard).
  useEffect(() => {
    if (!instId) return;
    fetch("/api/institution/auth/security-activation-status")
      .then(res => res.ok ? res.json() : null)
      .then(j => { if (j) setActivationSecurite({ requise: !!j.requise, bloque: !!j.bloque, deadline: j.deadline ?? null }); })
      .catch(() => {});
  }, [instId]);

  // Popup non-bloquant (avant l'échéance) — déclenché après quelques
  // minutes d'usage réel du dashboard, jamais immédiatement à l'ouverture
  // (décision Bryan : laisser d'abord découvrir la valeur de l'espace avant
  // de demander une action de sécurité). "Plus tard" ferme pour cette
  // session uniquement — réapparaîtra à la prochaine ouverture tant que
  // l'activation n'est pas faite ou l'échéance dépassée.
  useEffect(() => {
    if (!activationSecurite?.requise || activationSecurite.bloque || popupActivationDismiss) return;
    const t = setTimeout(() => setPopupActivationOuvert(true), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [activationSecurite, popupActivationDismiss]);

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

  // Toast one-shot du Centre de configuration (Lot E, 12/08/2026) — ne se
  // déclenche que sur une vraie transition observée pendant la session
  // (false -> true), jamais sur un premier chargement déjà complet, pour ne
  // pas répéter la célébration à chaque retour sur l'onglet Accueil. Séparé
  // du CelebrationModal existant (transition de statut vers "validee"),
  // deux déclencheurs distincts, volontairement pas mélangés.
  const configCompleteSeenRef = useRef<boolean | null>(null);
  const handleConfigStatusChange = useCallback((complete: boolean, pct: number) => {
    if (configCompleteSeenRef.current === false && complete) {
      showToast("Configuration terminée — votre espace Yelen est prêt.", C.green);
    }
    configCompleteSeenRef.current = complete;
    setConfigComplete(complete);
    setConfigPct(pct);
  }, [showToast, C.green]);

  // Charge le vrai statut de configuration dès l'ouverture du dashboard,
  // quel que soit l'onglet actif (23/08/2026, retour Bryan). Avant ce fetch,
  // configComplete/configPct ne venaient QUE du montage de
  // CentreConfigurationTab, lui-même réservé à l'onglet Accueil — un
  // établissement déjà validé (étapes obligatoires terminées, cf. `complete`
  // dans /api/institution/configuration-status) mais jamais revenu sur
  // Accueil pendant la session restait donc figé sur l'ancien repli local à
  // 3 steps de ProfilProgressionBandeau (photo/description/disponibilités),
  // qui ignore complètement inst.statut === "validee" et les étapes
  // facultatives (ex. "Équipe et accès") — le bandeau de progression ne
  // disparaissait jamais sur les autres onglets malgré un profil validé.
  useEffect(() => {
    if (!instId) return;
    fetch("/api/institution/configuration-status")
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j) handleConfigStatusChange(j.complete, j.pct); })
      .catch(() => {});
  }, [instId, instRefreshKey, handleConfigStatusChange]);

  // Export CSV serveur (lib/export) : la sélection de l'accueil (RDV terminés ou annulés)
  // est envoyée par identifiants vers la MÊME route que « RDV passés » ; le serveur relit,
  // masque le téléphone selon le rôle, enregistre et signe le document.
  async function exportCsv() {
    const termines = rdvs.filter(r => ["effectue", "termine", "honore", "annule"].includes(r.statut));
    if (!termines.length) { showToast("Aucun RDV à exporter", C.orange); return; }
    setExportAccueilEnCours(true);
    const r = await telechargerExportServeur("/api/institution/rdv-historique/export", { ecran: "rdv_accueil", ids: termines.map(x => x.id) }, "rdv_accueil.csv");
    setExportAccueilEnCours(false);
    showToast(r.texte, r.ok ? C.green : C.red);
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
    if (!creneauEstOuvert(r.date_rdv, r.heure_rdv)) { setHorsCreneauDialog(r); return; }
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

  async function handleAbsent(rdvId: string, motif: string): Promise<{ ok: boolean; error?: string }> {
    setActionLoading(rdvId);
    try {
      const res = await updateRdvStatut(rdvId, "absent", motif);
      if (!res.ok) return { ok: false, error: res.error };
      setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, presence_status: "absent", presence_confirmed_at: new Date().toISOString() } : r));
      setSelectedRDV(null);
      showToast("Client marqué absent", C.orange);
      return { ok: true };
    } catch { return { ok: false, error: "Erreur" }; } finally { setActionLoading(null); }
  }

  async function ouvrirNotifications() {
    setActivePopover("notifications");
    setNotifsNonLuesAffichees(new Set(institutionNotifs.filter(n => !n.lu).map(n => n.id)));
    if (institutionNotifs.some(n => !n.lu)) {
      setInstitutionNotifs(prev => prev.map(n => ({ ...n, lu: true })));
      await fetch("/api/institution/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    }
  }

  function handleClickNotif(n: { rdv_id: string | null }) {
    if (n.rdv_id) setTab("rdv");
    setActivePopover(null);
  }

  // Arrivée directe sur l'écran Notifications (lien, URL, menu) : même capture
  // d'affichage et même marquage lu que l'ouverture du popover. Si le popover
  // vient de le faire, plus aucune non lue n'existe ici — la capture déjà
  // faite est conservée, jamais doublée.
  useEffect(() => {
    if (tab !== "notifications" || !tabAllowed(membreRole, "notifications")) return;
    const nonLues = institutionNotifs.filter(n => !n.lu);
    if (nonLues.length === 0) return;
    setNotifsNonLuesAffichees(new Set(nonLues.map(n => n.id)));
    setInstitutionNotifs(prev => prev.map(n => ({ ...n, lu: true })));
    void fetch("/api/institution/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  }, [tab, membreRole, institutionNotifs]);

  // Rechargement ciblé des notifications (bouton « Réessayer ») : distingue
  // une vraie erreur d'une liste vide. Les non lues affichées sont recapturées
  // puis marquées lues, comme à l'ouverture.
  async function rechargerNotifications() {
    setNotifsChargement(true);
    setNotifsErreur(false);
    try {
      const res = await fetch("/api/institution/notifications");
      const json = res.ok ? await res.json().catch(() => null) : null;
      if (!json || !Array.isArray(json.notifications)) { setNotifsErreur(true); return; }
      const liste = json.notifications as NotificationInstitution[];
      setInstitutionNotifs(liste.map(n => ({ ...n, lu: true })));
      setNotifsNonLuesAffichees(new Set(liste.filter(n => !n.lu).map(n => n.id)));
      if (liste.some(n => !n.lu)) {
        await fetch("/api/institution/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      }
    } catch { setNotifsErreur(true); } finally { setNotifsChargement(false); }
  }

  function handlePreparationSaved(rdvId: string, patch: { guichet: string; instructions_accueil: string | null; preparation_confirmee_le: string | null }) {
    setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, ...patch } : r));
    setSelectedRDV(prev => prev && prev.id === rdvId ? { ...prev, ...patch } : prev);
    showToast(patch.preparation_confirmee_le ? "Client informé" : "Préparation enregistrée", C.gold);
  }

  // ── Chargement données ──
  const loadData = useCallback(async () => {
    if (!instId) { setError("Identifiant manquant."); setLoading(false); return; }
    setSlowLoading(false);
    if (slowLoadingTimerRef.current) clearTimeout(slowLoadingTimerRef.current);
    slowLoadingTimerRef.current = setTimeout(() => setSlowLoading(true), 8000);
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
      if (instRes.status === 403) {
        // L'ID d'institution de l'URL ne correspond pas à celui de la
        // session (route API, voir institution/profile/route.ts:24) — que
        // ce soit une manipulation manuelle de l'URL ou un lien partagé par
        // erreur, ce n'est jamais un simple "données vides" : on ne laisse
        // JAMAIS la coquille du dashboard s'afficher dans ce cas. On coupe
        // la session et on force une reconnexion complète — seule action
        // qui rétablit un état de confiance (retour Bryan 21/08/2026 :
        // "seul le système décide", dès qu'un seul chiffre de l'ID change).
        await fetch("/api/institution/auth/logout", { method: "POST" }).catch(() => {});
        router.push("/institution/connexion?acces_refuse=1");
        return;
      }
      if (!instRes.ok) {
        // Tout autre échec (500, 404...) : jamais silencieux, jamais la
        // coquille vide du dashboard. Message distinct du cas réseau
        // (catch ci-dessous) — ici le serveur a répondu, mais en erreur.
        setError(
          instRes.status >= 500
            ? "Le serveur Yelen224 rencontre un problème technique. Réessayez dans un instant."
            : "Impossible de charger les informations de votre établissement pour le moment."
        );
        return;
      }
      const instJson = await instRes.json();
      const instData = instJson?.institution;
      if (!instData) {
        // Réponse 200 mais aucune ligne trouvée (institution supprimée
        // alors qu'une session pour elle était encore valide) — même
        // principe : jamais la coquille vide, un message explicite.
        setError("Cet établissement n'a pas pu être retrouvé. Contactez le support Yelen224 si le problème persiste.");
        return;
      }
      setInst(instData as Institution);
      localStorage.setItem("yelen224_institution_id", instId);

      const notifRes = await fetch(`/api/institution/notifications`);
      const notifJson = notifRes.ok ? await notifRes.json().catch(() => null) : null;
      setNotifsErreur(!notifJson || !Array.isArray(notifJson.notifications));
      setInstitutionNotifs(notifJson?.notifications ?? []);

      const rdvRes = await fetch(`/api/institution/rdv`);
      const rdvJson = rdvRes.ok ? await rdvRes.json().catch(() => null) : null;
      if (!rdvRes.ok) console.error("[Yelen] RDV fetch error:", rdvJson?.error);
      const rdvRaw = (rdvJson?.rdvs ?? []) as RDV[];

      let rdvList: RDV[] = [];
      if (rdvRaw.length) {
        rdvList = rdvRaw;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const notesMap: Record<string, string> = {};
        rdvRaw.forEach((r) => {
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

      type AvisRaw = { id: string; note: number; commentaire: string | null; created_at: string; citoyen_nom: string | null; rdv_confirmed: boolean };
      const avisRaw = (rdvJson?.avis ?? []) as AvisRaw[];

      let avisList: AvisItem[] = [];
      if (avisRaw.length) {
        const sevenD = new Date();
        sevenD.setDate(sevenD.getDate() - 7);

        avisList = avisRaw.map((a) => ({
          id: a.id,
          note: a.note,
          commentaire: a.commentaire,
          created_at: a.created_at,
          citoyen_nom: a.citoyen_nom || "Citoyen",
          rdv_confirmed: a.rdv_confirmed,
          lu: new Date(a.created_at) < sevenD,
        }));
      }
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const weekAgo   = new Date(now); weekAgo.setDate(now.getDate() - 7);
      const monthAgo  = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
      const prevWkAgo = new Date(now); prevWkAgo.setDate(now.getDate() - 14);
      const prevMoAgo = new Date(now); prevMoAgo.setMonth(now.getMonth() - 2);

      const todayN    = rdvList.filter(r => r.date_rdv === today).length;
      const weekN     = rdvList.filter(r => new Date(r.date_rdv) >= weekAgo).length;
      const monthN    = rdvList.filter(r => new Date(r.date_rdv) >= monthAgo).length;
      const prevWkN   = rdvList.filter(r => new Date(r.date_rdv) >= prevWkAgo && new Date(r.date_rdv) < weekAgo).length;
      const prevMoN   = rdvList.filter(r => new Date(r.date_rdv) >= prevMoAgo && new Date(r.date_rdv) < monthAgo).length;
      // Exclut désormais aussi les RDV "non traités" (voir rdvNonTraite) —
      // un RDV en retard n'apparaît plus que dans le compteur/filtre dédié,
      // jamais aussi dans "Nouveaux"/"En attente" (retour Bryan 08/09/2026 :
      // ces 3 catégories doivent être mutuellement exclusives).
      // Tous les compteurs passent par correspondFiltreRdv (AppointmentsUi.tsx),
      // la même fonction que le filtre de la liste : un compteur et la liste qu'il
      // ouvre ne peuvent plus diverger.
      const compter = (filtre: string) => rdvList.filter(r => correspondFiltreRdv(r, filtre, now)).length;
      const pending   = compter("en_attente");
      const confirmed = compter("confirme");
      const done      = compter("effectue");
      const cancelled = compter("annule");
      const nouveau   = compter("nouveau");
      const absents   = compter("absent");
      const nonTraites = compter("en_retard");
      const total     = rdvList.length;

      // Variations « aujourd'hui / hier » par catégorie : nombre de RDV PRÉVUS
      // (date_rdv) ces deux jours, au statut actuel, jours de Conakry (lib/heure.ts).
      // Écran Rendez-vous : affichés tels quels, sans pourcentage. value / has
      // (ancien pourcentage) ne servent plus qu'à la bande KPI de l'accueil.
      const variation = (filtre: string): KpiVariation => {
        const v = variationJour(rdvList, filtre, now);
        return {
          aujourdhui: v.aujourdhui, hier: v.hier,
          value: v.hier > 0 ? Math.round(((v.aujourdhui - v.hier) / v.hier) * 100) : 0, has: v.hier > 0,
        };
      };
      const kpiVariations = {
        nouveau: variation("nouveau"), pending: variation("en_attente"), confirmed: variation("confirme"),
        done: variation("effectue"), cancelled: variation("annule"), total: variation("tous"), non_traites: variation("en_retard"),
      };

      const last10  = rdvList.filter(r => ["confirme", "annule", "effectue", "termine"].includes(r.statut)).slice(0, 10);
      const nbRefus = last10.filter(r => r.statut === "annule").length;

      const moy = avisList.length > 0
        ? avisList.reduce((a, b) => a + b.note, 0) / avisList.length
        : ((instData as Institution | null)?.moyenne_avis ?? 0);

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
        pending, confirmed, done, cancelled, nouveau, absents, non_traites: nonTraites,
        avis_count: avisList.length,
        moyenne_avis: Math.round(moy * 10) / 10,
        avis_non_lus: avisList.filter(a => !a.lu).length,
        taux_confirmation: tConf, taux_annulation: tAnn, taux_satisfaction: tSat,
        rdv_total: total,
        evolution_week:  prevWkN > 0 ? Math.round(((weekN - prevWkN) / prevWkN) * 100) : 0,
        evolution_month: prevMoN > 0 ? Math.round(((monthN - prevMoN) / prevMoN) * 100) : 0,
        evolution_week_has: prevWkN > 0, evolution_month_has: prevMoN > 0,
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
          // Même source que l'écran Messagerie (conversations non lues) : badge,
          // en-tête et chip « Non lues » disent la même chose (22/10/2026).
          fetch("/api/institution/conversations"),
          fetch("/api/institution/messagerie-yelen?compte=1"),
        ]);
        const msgJson = msgRes.ok ? await msgRes.json().catch(() => null) : null;
        const yelenJson = yelenRes.ok ? await yelenRes.json().catch(() => null) : null;
        setMessagerieUnread(msgJson?.counts?.non_lues ?? 0);
        // Badge "Support" (trigger header "Aide & ressources") — strictement
        // séparé depuis que le canal Yelen a quitté la Messagerie citoyenne
        // (chantier "Séparation Messagerie/Support" 06/09/2026).
        setSupportUnread(yelenJson?.non_lus ?? 0);
      } catch {}

      // Badge "Questions clients" (icône en-tête dédiée) — strictement
      // séparé de messagerieUnread ci-dessus, ne touche jamais la table
      // messages ni MessagerieTab.
      try {
        const qRes = await fetch("/api/institution/questions?compte=1");
        const qJson = qRes.ok ? await qRes.json().catch(() => null) : null;
        setQuestionsNonRepondues(qJson?.non_repondues ?? 0);
      } catch {}

    } catch (e) {
      // Distingue le cas réseau (le plus fréquent en pratique) d'un vrai
      // bug applicatif — jamais le même message générique pour les deux,
      // sinon "chargement de votre dashboard" reste affiché sans qu'on
      // sache s'il faut vérifier sa connexion ou signaler un bug.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("Pas de connexion internet. Vérifiez votre réseau puis réessayez.");
      } else if (e instanceof TypeError) {
        setError("Impossible de joindre les serveurs Yelen224. Vérifiez votre connexion puis réessayez.");
      } else {
        setError(e instanceof Error ? e.message : "Erreur de chargement");
      }
    } finally {
      if (slowLoadingTimerRef.current) clearTimeout(slowLoadingTimerRef.current);
      setSlowLoading(false);
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Slug périmé dans l'URL (institution renommée depuis, slug régénéré par
  // PATCH /api/institution/profile) : l'id reste seul canonique, on corrige
  // l'URL vers le slug à jour — aucune ancienne URL partagée/bookmarkée ne
  // se casse jamais. Le slug n'est ici QUE cosmétique, jamais une preuve
  // d'autorisation (déjà vérifiée par le 403 de /api/institution/profile
  // dans loadData ci-dessus). Effet séparé de loadData (jamais dans ses
  // deps) pour ne pas redéclencher tout le chargement des données à chaque
  // changement d'onglet ou poll périodique — ne fait rien tant que le slug
  // courant correspond déjà à celui de l'URL.
  useEffect(() => {
    if (!inst?.slug || inst.slug === urlSlug) return;
    const qs = searchParams.toString();
    router.replace(`/${inst.slug}/${instId}/${screenParam || "dashboard"}${qs ? `?${qs}` : ""}`);
  }, [inst?.slug, urlSlug, instId, screenParam, searchParams, router]);

  // Auto-refresh — complète le temps réel (postgres_changes) par un filet de
  // sécurité périodique, au cas où une reconnexion Realtime serait manquée.
  useEffect(() => {
    const interval = setInterval(() => loadData(), 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Nombre de changements de profil en cours d'examen (?resume=1 : requête
  // légère). Réservé aux rôles qui voient l'onglet Entreprise — la route
  // refuse les autres (403), inutile de la solliciter. Recompté à chaque
  // nouvelle notification reçue (la réponse de l'équipe Yelen en crée une) et
  // toutes les 30 s, comme le reste du tableau de bord.
  const rafraichirChangementsProfil = useCallback(async () => {
    if (!instId) return;
    try {
      const res = await fetch("/api/institution/changements-profil?resume=1");
      if (!res.ok) { setChangementsProfilEnCours(0); return; }
      const j = await res.json().catch(() => null);
      setChangementsProfilEnCours(typeof j?.en_cours === "number" ? j.en_cours : 0);
    } catch {
      // Information complémentaire : on garde la dernière valeur connue.
    }
  }, [instId]);
  const nbNotifs = institutionNotifs.length;
  useEffect(() => {
    if (!membreRole || !can(membreRole, "profil_entreprise.write")) return;
    rafraichirChangementsProfil();
    const interval = setInterval(rafraichirChangementsProfil, 30000);
    return () => clearInterval(interval);
  }, [membreRole, rafraichirChangementsProfil, nbNotifs]);
  // Historique du RDV ouvert (rdv_events + journal_activite) : voir useRdvHistorique.
  useEffect(() => { setSidebarCollapsed(localStorage.getItem("yelen224_sidebar_collapsed") === "1"); }, []);
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("yelen224_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };


  // ── Barre de scroll auto-masquée (retour Bryan 01/09/2026) : la classe
  // .scrollbar-active (voir cssFor) rend le thumb visible pendant le
  // scroll et le masque <2s après le dernier scroll. Un seul listener au
  // niveau document (capture) plutôt que 3 refs+listeners — les événements
  // "scroll" des .yelen-main/.yelen-sidebar nav/.yelen-account-panel ne
  // remontent pas (pas de bubbling) mais sont capturables en amont.
  useEffect(() => {
    const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement;
      if (!el.matches?.(".msgv2-list-pane, .msgv2-thread-scroll")) return;
      el.classList.add("scrollbar-active");
      const prev = timers.get(el);
      if (prev) clearTimeout(prev);
      timers.set(el, setTimeout(() => el.classList.remove("scrollbar-active"), 1500));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  // Ctrl/Cmd+K ouvre "Aide Yelen" (retour Bryan 06/09/2026).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActivePopover("help");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Realtime ──
  useEffect(() => {
    if (!instId) return;
    const ch = supabase.channel(`rt-final-v5-${instId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rdv", filter: `institution_id=eq.${instId}` }, async (payload) => {
        const r = payload.new as unknown as Omit<RDV, "citoyen_nom" | "citoyen_phone">;
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "institutions", filter: `id=eq.${instId}` }, (p) => {
        if (p.new?.statut !== p.old?.statut) {
          loadData();
          setInstRefreshKey(k => k + 1);
        }
        // Adhésion Yelen Community validée/refusée pendant que l'onglet
        // "communaute-pro" est déjà monté (KeepMounted, jamais démonté tant
        // que la session dure) : CommunauteProTab ne fait son fetch qu'une
        // fois au montage, donc restait figé sur l'ancien statut sans ce
        // signal — bug réel signalé par Bryan (23/08/2026) : le pop de
        // bienvenue s'affichait bien (statut approuvé au moment du montage
        // initial) mais après clic sur "Commencer", l'écran retombait sur le
        // pitch "en attente" figé dans l'état React, jamais rafraîchi.
        if (p.new?.communaute_statut !== p.old?.communaute_statut) {
          setCommunauteRefreshKey(k => k + 1);
        }
      })
      .subscribe((status) => {
        setRealtimeStatus(status === "SUBSCRIBED" ? "connecte" : status === "CLOSED" ? "hors_ligne" : "reconnexion");
      });
    return () => { supabase.removeChannel(ch); };
  }, [instId, loadData]);

  // Exclut les "nouveau" déjà en retard (comptés séparément dans
  // rdvsEnRetard) — sinon un même RDV gonflait à la fois "Nouvelles
  // demandes" et "RDV en retard" dans actionsPrioritaires/les rappels.
  const rdvsPending  = rdvs.filter(r => r.statut === "nouveau" && !rdvNonTraite(r.statut, r.presence_status, r.date_rdv, r.heure_rdv));
  // "En retard" = non traité (voir lib/rdvGating.ts::rdvNonTraite). Utilisée
  // par le Rappel "RDV en retard" et le KPI/onglet "Non traités" — inchangée.
  const rdvsEnRetard = rdvs.filter(r => rdvNonTraite(r.statut, r.presence_status, r.date_rdv, r.heure_rdv));
  // Fenêtre de grâce (voir lib/rdvGating.ts::rdvEnFenetreDeGrace) — distincte
  // de rdvsEnRetard : RDV dont l'heure est dépassée mais pas encore
  // officiellement "non traités" (30 min de grâce). Retour Bryan 13/09/2026 :
  // seul le bandeau d'en-tête (pas le Rappel ni le KPI) utilise cette liste —
  // un RDV déjà "non traité" n'est plus valable pour ce bandeau, il ne vit
  // plus que dans le décompte dédié "Non traités".
  const rdvsEnGrace = rdvs.filter(r => rdvEnFenetreDeGrace(r.statut, r.presence_status, r.date_rdv, r.heure_rdv));
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
  // "Nouveaux"/"En attente" excluent désormais les RDV non traités (déjà en
  // retard) — mutuellement exclusif avec le filtre "Non traités" (retour
  // Bryan 08/09/2026), même règle que les compteurs stats.pending/nouveau.
  // Définition unique des catégories : correspondFiltreRdv (AppointmentsUi.tsx),
  // partagée avec les compteurs de loadData.
  const filteredRdvs = rdvs
    .filter(r => correspondFiltreRdv(r, rdvFilter))
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

  // Chip « nom du citoyen » des notifications : RDV déjà en mémoire, aucune requête.
  const nomCitoyenParRdv = useMemo(() => new Map(rdvs.map(r => [r.id, r.citoyen_nom] as const)), [rdvs]);
  // Même source pour l'écran Notifications (nom, référence, statut brut du RDV).
  const infoRdvParId = useMemo(() => new Map(rdvs.map(r => [r.id, { nom: r.citoyen_nom, reference: r.reference, statut: r.statut }] as const)), [rdvs]);

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
    <div style={{ minHeight: "100svh", backgroundColor: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{cssFor(C, theme)}</style>
      <YelenLoader size={52} label={slowLoading ? "Ça prend plus de temps que d'habitude — vérifiez votre connexion…" : "Bon retour — chargement de votre dashboard…"} labelColor={C.t3}/>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <style>{cssFor(C, theme)}</style>
      <Card tokens={toCardTokens(C)} padding="28px 24px" style={{ textAlign: "center", maxWidth: "340px" }}>
        <YelenLogo size={40} color={C.gold} />
        <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "20px", marginTop: "16px" }}>{error}</div>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={loadData} style={{ padding: "0 24px" }}>Réessayer</Button>
      </Card>
    </div>
  );

  // ── Sidebar PC — sections avec labels de groupe (Principal / Activité /
  // Relation citoyenne / Pilotage / Compte), pattern dashboards pro. ──
  const navSectionsRaw: { label: string; items: { key: typeof tab; label: string; icon: React.ReactNode; onClick?: () => void }[] }[] = [
    { label: "Principal", items: [
      { key: "accueil",    label: "Vue d'ensemble",  icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    ]},
    { label: "Activité", items: [
      { key: "messagerie", label: "Messagerie",     icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
      { key: "rdv",        label: "Rendez-vous",     icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
      { key: "disponibilites", label: "Disponibilités", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
      { key: "services",   label: "Services",        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg> },
      { key: "valider-rdv", label: "Valider un RDV", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="8 15 11 18 16 13"/></svg> },
    ]},
    { label: "Relation citoyenne", items: [
      { key: "communication", label: "Communication", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
      { key: "communaute-pro", label: "Yelen Community", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><circle cx="18" cy="8" r="2.5"/><path d="M22 21v-1.5a3.5 3.5 0 0 0-2.5-3.36"/></svg> },
      { key: "signalements", label: "Signalements",   icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
      { key: "scanner",    label: "Scanner QR",      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg> },
      { key: "codeqr",     label: "Mon code QR",     icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="17.5" y1="14" x2="17.5" y2="17.5"/><line x1="14" y1="17.5" x2="17.5" y2="17.5"/></svg> },
    ]},
    { label: "Pilotage", items: [
      { key: "analyse",    label: "Centre d'analyse", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    ]},
    { label: "Finance", items: [
      { key: "paiements",  label: "Paiements",       icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
      { key: "transactions", label: "Transactions",  icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
      { key: "historique-financier", label: "Historique financier", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
      { key: "facturation", label: "Facturation",    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg> },
      { key: "rapports",   label: "Rapports",        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 21H4a1 1 0 0 1-1-1V4"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="4" width="3" height="13"/></svg> },
      { key: "documents-financiers", label: "Documents financiers", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
      { key: "documents-clients", label: "Documents clients", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/></svg> },
    ]},
    { label: "Partenariat", items: [
      { key: "partenariat", label: "Partenaires",     icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 4-2 4 4"/></svg> },
      // "Mes offres" n'apparaît qu'une fois le partenariat approuvé — filtre
      // additionnel appliqué juste après (inst?.partenaire_statut), pas
      // seulement le RBAC générique tabAllowed().
      { key: "mes-offres", label: "Mes offres",       icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg> },
    ]},
  ];
  const navSections = navSectionsRaw
    .map(section => ({ ...section, items: section.items.filter(i => navAllowed(i.key) && (i.key !== "mes-offres" || inst?.partenaire_statut === "approuve")) }))
    .filter(section => section.items.length > 0);

  // Sous-menu "Compte" — pas dans le menu principal, façon Supabase : on
  // clique sur la ligne compte (icône + nom) dans le sidebar, ça ouvre ce
  // petit panneau entre le menu principal (réduit) et la vue courante.
  const accountItemsRaw: { key: typeof tab | "guide"; label: string; icon: React.ReactNode; onClick?: () => void; group: string }[] = [
    // N'apparaît que pour activite_principale_code === "hotellerie" — filtre
    // additionnel appliqué juste après (comme "mes-offres"/partenaire_statut),
    // pas seulement le RBAC générique navAllowed(). Migré depuis
    // secteur === "hotel" (chantier Taxonomie des activités, Phase 4,
    // 20/08/2026) — secteur n'est plus jamais écrite depuis la Phase 2 du
    // wizard, ce gating restait bloqué en faux pour toute institution créée
    // depuis (bug réel trouvé par Bryan sur un compte hôtel de test).
    { group: "Établissement", key: "configuration-hotel", label: "Configuration Hôtel", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/><path d="M3 18h18"/><path d="M5 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/></svg> },
    { group: "Établissement", key: "documents", label: "Documents", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
    { group: "Établissement", key: "conditions-informations", label: "Conditions et informations", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg> },
    { group: "Relation client", key: "mes-clients", label: "Mes clients", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { group: "Relation client", key: "avis-reputation", label: "Santé du compte", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> },
    { group: "Relation client", key: "questions-clients", label: "Questions des clients", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="9.01" y2="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7"/></svg> },
    { group: "Équipe & travail", key: "equipe", label: "Équipe", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    // Collaboration (déplacé du menu principal vers Compte > Équipe & travail,
    // 16/09/2026) — membre <-> membre, distinct de Messagerie (citoyen <-> institution).
    { group: "Équipe & travail", key: "collaboration", label: "Collaboration", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    // "Préparer ma semaine" (Phase 1, 26/09/2026, décision CEO) — nouveau
    // rituel hebdomadaire personnel au membre, place en tête du sous-groupe
    // "Travail" (porte d'entrée), avant l'outil de gestion Espace de
    // travail dont il réutilise le moteur (taches/evenements_agenda).
    { group: "Équipe & travail", key: "ma-semaine", label: "Ma semaine", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg> },
    { group: "Équipe & travail", key: "espace-travail", label: "Espace de travail", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
    { group: "Équipe & travail", key: "clock-in-shift", label: "Clock In Shift", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
    { group: "Historique", key: "journal", label: "Journal d'activité", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { group: "Historique", key: "rdv-historique", label: "Rendez-vous passés", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/><path d="M3 12a9 9 0 0 1 9-9"/></svg> },
    { group: "Aide", key: "guide", label: "Guide Yelen", onClick: () => setShowGuide(true), icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
  ];
  const accountItems = accountItemsRaw.filter(i => navAllowed(i.key) && (i.key !== "configuration-hotel" || inst?.activite_principale_code === "hotellerie"));
  const accountTabKeys: (typeof tab | "guide")[] = accountItems.map(i => i.key);
  const accountGroups = accountItems.reduce((groups, item) => {
    let group = groups.find(g => g.label === item.group);
    if (!group) { group = { label: item.group, items: [] }; groups.push(group); }
    group.items.push(item);
    return groups;
  }, [] as { label: string; items: typeof accountItems }[]);

  // Menu avatar du header (façon GitHub) — sortie complète de
  // Profil / Profil Responsable / Profil Entreprise hors du sous-menu
  // "Compte" de la sidebar gauche (groupe "Compte" de accountItemsRaw
  // maintenant vide, ne s'affiche plus). Libellés sans le mot "Profil"
  // (retour Bryan) — le panneau "Compte" de la sidebar gauche a été
  // renommé "Organisation" (au lieu d'"Administration") pour ne pas
  // entrer en collision avec l'item "Administration" ci-dessous.
  const avatarMenuItemsRaw: { key: typeof tab; label: string; icon: React.ReactNode }[] = [
    { key: "profil", label: "Administration", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg> },
    { key: "profil-responsable", label: "Responsable", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg> },
    { key: "profil-entreprise", label: "Entreprise", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><line x1="9" y1="8" x2="9" y2="8"/><line x1="15" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="9" y2="16"/><line x1="15" y1="16" x2="15" y2="16"/></svg> },
  ];
  const avatarMenuItems = avatarMenuItemsRaw.filter(i => navAllowed(i.key));

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
  function renderMainNav(collapsed: boolean) {
    // Bouton d'un écran (repris tel quel pour un item à plat ET pour un
    // enfant replié sous un groupe Finance — seul `indent` change).
    const renderNavItem = (item: (typeof navSections)[number]["items"][number], indent = false) => {
      const active = tab === item.key;
      const badge = item.key === "rdv" ? rdvsPending.length : item.key === "messagerie" ? messagerieUnread : item.key === "profil-entreprise" ? changementsProfilEnCours : 0;
      const badgeColor = item.key === "messagerie" || item.key === "rdv" || item.key === "profil-entreprise" ? C.red : C.gold;
      const badgeTextColor = item.key === "messagerie" || item.key === "rdv" || item.key === "profil-entreprise" ? "#fff" : "#000";
      return (
        <button key={item.key} onClick={() => { if (item.onClick) { item.onClick(); } else { setTab(item.key); } if (accountMenuOpen) closeAccountMenu(); }} onMouseEnter={collapsed ? showNavTooltip(item.label) : undefined} onMouseLeave={collapsed ? hideNavTooltip : undefined} className={`tap yelen-nav-item ${active ? "yelen-nav-item-active" : ""}`} style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: "10px", padding: collapsed ? "10px" : indent ? "8px 12px 8px 34px" : "10px 12px", borderRadius: "12px", background: "transparent", border: "1px solid transparent", color: active ? C.gold : C.t2, fontWeight: active ? "700" : "500", fontSize: "13.5px", cursor: "pointer", textAlign: "left", position: "relative", width: "100%" }}>
          <span style={{ color: active ? C.gold : C.t3, flexShrink: 0 }}>{item.icon}</span>
          {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
          {badge > 0 && (
            <span style={{ backgroundColor: badgeColor, color: badgeTextColor, fontSize: "10px", fontWeight: "800", borderRadius: "10px", minWidth: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", position: collapsed ? "absolute" : "static", top: collapsed ? "2px" : undefined, right: collapsed ? "2px" : undefined, animation: item.key === "rdv" ? "glow 1.6s ease-in-out infinite" : "none" }}>{badge}</span>
          )}
        </button>
      );
    };

    return navSections.map((section, si) => (
      <div key={section.label} style={{ marginTop: si > 0 ? "14px" : 0 }}>
        {!collapsed ? (
          <div style={{ padding: "0 12px 6px", color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase" }}>
            {section.label}
          </div>
        ) : (
          si > 0 && <div style={{ height: "1px", background: C.border, margin: "0 8px 8px" }}/>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {/* Section "Finance" (7 écrans) : sidebar étendue → 2 groupes
              repliables (Opérations / Suivi & documents), fermés par défaut,
              s'ouvrent aussi si `tab` est déjà un de leurs enfants (lien
              direct). Sidebar réduite (icon rail) : pas assez de place pour
              indentation/labels, on retombe sur la liste à plat d'origine. */}
          {section.label === "Finance" && !collapsed ? (
            FINANCE_GROUPS.map(group => {
              const groupItems = section.items.filter(i => group.tabs.includes(i.key));
              if (groupItems.length === 0) return null;
              const open = financeGroupsOpen[group.key] || groupItems.some(i => i.key === tab);
              return (
                <div key={group.key}>
                  <button onClick={() => setFinanceGroupsOpen(v => ({ ...v, [group.key]: !v[group.key] }))} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "transparent", border: "1px solid transparent", color: open ? C.gold : C.t2, fontWeight: "500", fontSize: "13.5px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                    <span style={{ color: open ? C.gold : C.t3, flexShrink: 0 }}>{group.icon}</span>
                    <span style={{ flex: 1 }}>{group.label}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  {open && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {groupItems.map(item => renderNavItem(item, true))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            section.items.map(item => renderNavItem(item))
          )}
        </div>
      </div>
    ));
  }

  return (
    <div className="yelen-shell" style={{ minHeight: "100svh", backgroundColor: C.bg, fontFamily: "var(--font-jakarta), -apple-system, 'Helvetica Neue', sans-serif", color: C.t1 }}>
      <style>{cssFor(C, theme)}</style>

      {/* ── SIDEBAR PC (≥1024px) ── */}
      <aside className="yelen-sidebar" style={{ width: sidebarCollapsed ? "68px" : "224px", minWidth: sidebarCollapsed ? "68px" : "224px", transition: "width 0.18s ease" }}>
        {/* Logo + titre + bouton réduire/étendre le menu, alignés sur la
            même ligne (façon Supabase) — repliée : bouton centré sous le
            logo faute de place pour les deux côte à côte en 68px. */}
        <div style={{ padding: sidebarCollapsed ? "20px 10px 12px" : "20px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between", gap: "10px", marginBottom: sidebarCollapsed ? 0 : "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ position: "relative", width: "36px", height: "36px", borderRadius: "10px", overflow: "hidden", flexShrink: 0 }}>
                <Image src="/icon-512.png" alt="Yelen224" fill sizes="36px" style={{ objectFit: "cover" }}/>
              </div>
              {!sidebarCollapsed && (
                <div>
                  <div style={{ fontSize: "13px", fontWeight: "800", letterSpacing: "0.5px" }}><span style={{ color: C.gold }}>YELEN</span><span style={{ color: theme === "dark" ? "#fff" : "#000" }}>224</span></div>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <button
                onClick={toggleSidebarCollapsed}
                className="tap"
                title="Réduire le menu"
                style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "transparent", border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: C.t2 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="3"/><path d="M9 3v18"/></svg>
              </button>
            )}
          </div>
          {sidebarCollapsed && (
            <button
              onClick={toggleSidebarCollapsed}
              className="tap"
              title="Étendre le menu"
              style={{ marginTop: "10px", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "transparent", border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t2 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="3"/><path d="M9 3v18"/></svg>
            </button>
          )}
        </div>
        {/* Navigation principale — overflowY:auto scope le scroll à ce bloc
            seul (l'aside parent reste overflow:visible pour ne pas clipper
            le bouton toggle en bord de sidebar). */}
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px", overflowY: "auto", position: "relative" }}>
          {renderMainNav(sidebarCollapsed)}
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
          <button onClick={openAccountMenu} onMouseEnter={showNavTooltip(inst?.name || "Compte")} onMouseLeave={hideNavTooltip} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", padding: sidebarCollapsed ? "9px" : "9px 10px", borderRadius: "10px", background: "transparent", border: `1px solid ${C.border}`, color: accountMenuOpen ? C.gold : C.t2, cursor: "pointer", width: "100%" }}>
            {inst?.logo ? (
              <div style={{ position: "relative", width: "22px", height: "22px", borderRadius: "6px", overflow: "hidden", flexShrink: 0 }}><Image src={inst.logo} alt="" fill sizes="22px" style={{ objectFit: "cover" }}/></div>
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
          {tabAllowed(membreRole, "parametres", accesRestreints) && (
            <button onClick={() => setTab("parametres")} onMouseEnter={showNavTooltip("Paramètres")} onMouseLeave={hideNavTooltip} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "10px", padding: sidebarCollapsed ? "9px" : "9px 12px", borderRadius: "10px", background: "transparent", border: `1px solid ${C.border}`, color: C.t2, fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              {!sidebarCollapsed && "Paramètres"}
            </button>
          )}
        </div>
      </aside>

      {navTooltip && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: "84px", top: navTooltip.top, transform: "translateY(-50%)", background: "#0A0A12", color: "#fff", fontSize: "11.5px", fontWeight: 700, padding: "5px 9px", borderRadius: "6px", whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(0,0,0,0.35)", zIndex: 9999, pointerEvents: "none" }}>
          {navTooltip.label}
        </div>,
        document.body
      )}

      {/* ── PANNEAU "COMPTE" — entre le sidebar (réduit) et la vue courante,
          façon Supabase (Project Settings). Desktop uniquement (≥1024px,
          voir CSS .yelen-account-panel). ── */}
      {accountMenuOpen && (
        <div className="yelen-account-panel" style={{ left: sidebarCollapsed ? "68px" : "224px" }}>
          <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${C.border}` }}>
            <button onClick={closeAccountMenu} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", background: "transparent", border: "none", padding: 0, marginBottom: "12px", cursor: "pointer", color: C.t3, fontSize: "10.5px", fontWeight: "700", letterSpacing: "0.3px" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", letterSpacing: "-0.3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Organisation</div>
            <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>Paramètres</div>
          </div>
          {membreRole !== null && membreRole !== "admin" && (
            <div style={{ margin: "10px 10px 0", padding: "10px 11px", borderRadius: "10px", backgroundColor: `${C.blue}10`, border: `1px solid ${C.blue}25` }}>
              <p style={{ color: C.t2, fontSize: "10.5px", lineHeight: 1.6, margin: 0 }}>
                🔒 Votre employeur peut voir tout ce que vous faites (Journal d&apos;activité). Vous ne voyez ici que ce à quoi il vous a donné accès.
              </p>
            </div>
          )}
          <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column" }}>
            {accountGroups.map((group, gi) => {
              const renderAccountItem = (item: (typeof group.items)[number]) => {
                const active = tab === item.key;
                return (
                  <button key={item.key} onClick={() => item.onClick ? item.onClick() : setTab(item.key as typeof tab)} className="tap yelen-account-item" style={{ display: "flex", alignItems: "center", gap: "9px", padding: "6.5px 8px", borderRadius: "7px", background: "transparent", border: "none", color: active ? C.gold : C.t2, fontWeight: active ? "700" : "500", fontSize: "12.5px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                    <span style={{ color: active ? C.gold : C.t3, flexShrink: 0, display: "flex" }}>{React.cloneElement(item.icon as React.ReactElement<{ width?: string | number; height?: string | number }>, { width: 14, height: 14 })}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                  </button>
                );
              };
              // "Établissement" (config hôtel/documents/conditions) : groupe
              // entier replié par défaut, un seul clic sur son en-tête
              // l'ouvre — jamais utile en continu, seulement après la
              // création du compte (voir état etablissementOpen ci-dessus).
              if (group.label === "Établissement") {
                const open = etablissementOpen || group.items.some(i => i.key === tab);
                return (
                  <div key={group.label} style={{ marginTop: gi > 0 ? "14px" : "2px" }}>
                    <button onClick={() => setEtablissementOpen(v => !v)} className="tap" style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0 8px 4px", background: "transparent", border: "none", color: C.t3, fontSize: "10px", fontWeight: "700", letterSpacing: "0.7px", textTransform: "uppercase", cursor: "pointer", width: "100%", textAlign: "left" }}>
                      <span style={{ flex: 1 }}>{group.label}</span>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {open && (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {group.items.map(item => renderAccountItem(item))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={group.label} style={{ marginTop: gi > 0 ? "14px" : "2px" }}>
                  <div style={{ padding: "0 8px 4px", color: C.t3, fontSize: "10px", fontWeight: "700", letterSpacing: "0.7px", textTransform: "uppercase" }}>{group.label}</div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {/* "Équipe & travail" (4 écrans) : 2 sous-sections repliables
                        (Équipe / Travail), même principe que FINANCE_GROUPS dans
                        la sidebar principale, fermées par défaut, ouvertes aussi
                        si `tab` est déjà un de leurs enfants (lien direct). */}
                    {group.label === "Équipe & travail" ? (
                      EQUIPE_TRAVAIL_GROUPS.map(sub => {
                        const subItems = group.items.filter(i => sub.tabs.includes(i.key as DashboardTab));
                        if (subItems.length === 0) return null;
                        const open = equipeTravailGroupsOpen[sub.key] || subItems.some(i => i.key === tab);
                        return (
                          <div key={sub.key}>
                            <button onClick={() => setEquipeTravailGroupsOpen(v => ({ ...v, [sub.key]: !v[sub.key] }))} className="tap" style={{ display: "flex", alignItems: "center", gap: "9px", padding: "6.5px 8px", borderRadius: "7px", background: "transparent", border: "none", color: open ? C.gold : C.t2, fontWeight: "500", fontSize: "12.5px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                              <span style={{ color: open ? C.gold : C.t3, flexShrink: 0, display: "flex" }}>{sub.icon}</span>
                              <span style={{ flex: 1 }}>{sub.label}</span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            {open && (
                              <div style={{ display: "flex", flexDirection: "column", paddingLeft: "14px" }}>
                                {subItems.map(item => renderAccountItem(item))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      group.items.map(item => renderAccountItem(item))
                    )}
                  </div>
                </div>
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

      {/* ── TIROIR "YELEN BUSINESS" (17/09/2026) — 3e menu, ouvert depuis
          l'item dédié du popover "Management" (icône avatar du header),
          plus depuis le menu principal gauche (retour Bryan : trop chargé
          là-bas) ni docké dans un panneau Compte — un tiroir flottant
          ancré à droite de l'écran, overlay au-dessus du contenu, ne
          modifie jamais marginLeft/sidebar. Séparation volontaire "menus
          de travail" (sidebar gauche, écrans internes) vs "Yelen Business"
          (relation commerciale avec la plateforme). Portalé dans
          document.body pour passer au-dessus de tout (même raison que
          HeaderPopover : le <header> a un backdropFilter qui casse
          position:fixed pour un descendant). ── */}
      {businessMenuOpen && typeof document !== "undefined" && createPortal(
        <>
          <div className="yelen-business-overlay" onClick={() => setBusinessMenuOpen(false)}/>
          <div className="yelen-business-drawer">
            <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", letterSpacing: "-0.3px" }}>Yelen Business</div>
                <div style={{ color: C.gold, fontSize: "11px", fontWeight: "700", marginTop: "2px" }}>Votre relation avec Yelen</div>
              </div>
              <button onClick={() => setBusinessMenuOpen(false)} className="tap" style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, padding: "4px", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="header-popover-body" style={{ padding: "10px 12px 16px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              {YELEN_BUSINESS_SECTIONS.map(({ section, items }) => {
                const visibleItems = items.filter(item => navAllowed(item.key));
                if (visibleItems.length === 0) return null;
                return (
                  <div key={section} style={{ marginBottom: "6px" }}>
                    <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px", padding: "12px 10px 6px" }}>{section}</div>
                    {visibleItems.map(item => {
                      const active = tab === item.key;
                      return (
                        <button key={item.key} onClick={() => { setTab(item.key); setBusinessMenuOpen(false); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 10px", borderRadius: "10px", background: "transparent", border: "none", color: active ? C.gold : C.t2, fontWeight: active ? "700" : "500", fontSize: "13px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                          <span style={{ color: active ? C.gold : C.t3, flexShrink: 0, display: "flex" }}>{item.icon}</span>
                          <span style={{ flex: 1 }}>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {/* ── Footer du tiroir (17/09/2026, retour Bryan) — copyright,
                toujours ancré en bas puisque la liste ci-dessus scroll
                indépendamment (flex:1 + overflow-y:auto), jamais le tiroir
                entier. ── */}
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, color: C.t3, fontSize: "10.5px", textAlign: "center", flexShrink: 0 }}>
              © 2026 Yelen224 — Par SemPya224
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── CONTENU PRINCIPAL ── */}
      {/* ── paddingBottom en dur (80px) remplacé par un calc() aligné sur la
          hauteur réelle de .yelen-bottom-nav (~48px de contenu) + son
          propre env(safe-area-inset-bottom) : la valeur fixe supposait déjà
          l'encoche present (safe-area ≈ 32px) et laissait un espace vide
          au-dessus du menu du bas sur les appareils/navigateurs sans
          encoche (retour Bryan 29/07/2026, capture à l'appui). ≥1024px
          continue de forcer 0 via la règle existante, inchangé. ── */}
      <div className="yelen-main client-fiche-scroll" style={{ paddingBottom: "calc(48px + env(safe-area-inset-bottom))", marginLeft: `${(sidebarCollapsed ? 68 : 224) + (accountMenuOpen ? 216 : 0)}px`, transition: "margin-left 0.18s ease" } as React.CSSProperties}>

      {/* ── MODALS ── */}
      {showGuide && <GuideScalingModal onClose={() => setShowGuide(false)}/>}
      {showScanner && instId && <ScannerModal institutionId={instId} onClose={() => { setShowScanner(false); loadData(); }}/>}

      <CheckInUnavailableDialog
        key={horsCreneauDialog?.id ?? "none"}
        open={!!horsCreneauDialog}
        rdv={horsCreneauDialog}
        C={C}
        onClose={() => setHorsCreneauDialog(null)}
        onBecameAvailable={() => {
          const r = horsCreneauDialog;
          setHorsCreneauDialog(null);
          if (r) handlePrendreEnCharge(r);
        }}
      />

      {termineDialog && (() => {
        const confirmedAt = termineDialog.presence_confirmed_at ? new Date(termineDialog.presence_confirmed_at) : null;
        const elapsedMin = confirmedAt ? Math.max(0, Math.round((Date.now() - confirmedAt.getTime()) / 60000)) : null;
        const service = extraireService(termineDialog.objet);
        return (
          <div onClick={() => setTermineDialog(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "22px", border: `1px solid ${C.border2}`, maxWidth: "440px", width: "100%", padding: "26px 24px", maxHeight: "88svh", overflowY: "auto" }}>
              <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "16px", textAlign: "center" }}>Terminer ce rendez-vous ?</div>

              <div style={{ backgroundColor: C.bg3, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px" }}>
                {[
                  { label: "Service", value: service },
                  { label: "Citoyen", value: termineDialog.citoyen_nom },
                  { label: "Heure prévue", value: termineDialog.heure_rdv ? formatHeure(termineDialog.heure_rdv) : "—" },
                  { label: "Confirmation", value: confirmedAt ? heureDepuisHorodatage(confirmedAt) : "—" },
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
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => setTermineDialog(null)}>Retour</Button>
                <button onClick={() => { handleTermine(termineDialog.id); setTermineDialog(null); }} disabled={!!actionLoading} className="tap" style={{ width: "100%", height: "40px", padding: "0 16px", borderRadius: "12px", border: "none", backgroundColor: C.purple, color: "#fff", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>
                  {actionLoading === termineDialog.id ? "…" : "Terminer le rendez-vous"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <PreparationVisiteModal
        rdv={prepModalRdv ? {
          id: prepModalRdv.id,
          citoyen_nom: prepModalRdv.citoyen_nom,
          date_rdv: prepModalRdv.date_rdv,
          heure_rdv: prepModalRdv.heure_rdv,
          prestationNom: prepModalRdv.est_payant ? (prepModalRdv.service_payant_nom || "Service payant") : (separerUrgent(prepModalRdv.objet).objet ? extraireService(separerUrgent(prepModalRdv.objet).objet) : "RDV général"),
          duree_minutes: prepModalRdv.duree_minutes,
          guichet: prepModalRdv.guichet,
          instructions_accueil: prepModalRdv.instructions_accueil,
          preparation_confirmee_le: prepModalRdv.preparation_confirmee_le,
          est_payant: prepModalRdv.est_payant,
          booking_payant_id: prepModalRdv.booking_payant_id,
          pour_autre: prepModalRdv.pour_autre,
          nom_autre: prepModalRdv.nom_autre,
          description_besoin: prepModalRdv.description_besoin,
          champs_complementaires_reponses: prepModalRdv.champs_complementaires_reponses,
          date_depart: prepModalRdv.date_depart,
        } : null}
        masquerDemande={!peutVoirDemande(membreRole)}
        institutionNom={inst?.name || "votre établissement"}
        C={C}
        onClose={() => setPrepModalRdv(null)}
        onSaved={(patch) => { if (prepModalRdv) handlePreparationSaved(prepModalRdv.id, patch); }}
      />

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
        // Prestation — nom unique affiché (service payant si présent, sinon
        // l'objet du RDV gratuit), passé par extraireService() : avant ce
        // correctif, l'objet brut ("[Ouverture de compte]", tag posé par
        // app/rdv/[id]/page.tsx) s'affichait crochets inclus. La balise
        // [URGENT] est retirée avant, sinon extraireService() la prendrait
        // pour le nom du service.
        const { urgent, objet: objetSansUrgent } = separerUrgent(selectedRDV.objet);
        const prestationNom = selectedRDV.est_payant
          ? (selectedRDV.service_payant_nom || "Service payant")
          : (objetSansUrgent ? extraireService(objetSansUrgent) : "RDV général");
        // Réponses aux champs complémentaires configurés par l'institution
        // (clés = libellé du champ en texte brut, voir paid_services.champs_complementaires).
        const champs = Object.entries(selectedRDV.champs_complementaires_reponses || {})
          .filter((entree): entree is [string, string] => typeof entree[1] === "string" && entree[1].trim().length > 0);
        // « Préparer la venue » n'a de sens que pour un RDV accepté (en_attente)
        // dont la présence n'est pas encore confirmée (retour Bryan 13/10/2026).
        const prepPertinente = selectedRDV.statut === "en_attente" && selectedRDV.presence_status !== "present";

        return (
          <RdvDetailModal
            key={selectedRDV.id}
            C={C}
            rdv={selectedRDV}
            events={rdvHisto.events}
            can={(permission) => membreRole !== null && can(membreRole, permission, accesRestreints)}
            suspendu={suspendu}
            actionLoading={actionLoading}
            bloqueClavier={!!confirmAbsent || !!confirmRefuse || !!prepModalRdv || !!horsCreneauDialog || !!termineDialog}
            onClose={() => setSelectedRDV(null)}
            onAction={(id) => {
              if (id === "accepter") handleAccept(selectedRDV.id);
              else if (id === "refuser") setConfirmRefuse({ id: selectedRDV.id, nom: selectedRDV.citoyen_nom });
              else if (id === "terminer") handleTermine(selectedRDV.id);
              else if (id === "absent") setConfirmAbsent({ id: selectedRDV.id, nom: selectedRDV.citoyen_nom });
              else if (id === "preparer") setPrepModalRdv(selectedRDV);
              else if (id === "confirmer_presence") { const cible = selectedRDV; setSelectedRDV(null); handlePrendreEnCharge(cible); }
            }}
          >
            <RdvDetailContenu
              C={C}
              rdv={selectedRDV}
              rdvs={rdvs}
              colonnes={selectedRDV}
              events={rdvHisto.events}
              journal={rdvHisto.journal}
              etatHistorique={rdvHisto.etat}
              onReessayer={rdvHisto.reessayer}
              prestationNom={prestationNom}
              urgent={urgent}
              masquerDemande={!peutVoirDemande(membreRole)}
              champs={champs}
              prepPertinente={prepPertinente}
              onVoirProfil={selectedRDV.citoyen_id && tabAllowed(membreRole, "mes-clients", accesRestreints)
                ? () => { setMesClientsInitialId(selectedRDV.citoyen_id); setSelectedRDV(null); setTab("mes-clients"); }
                : undefined}
            />
          </RdvDetailModal>
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

      <ConfirmModal
        open={!!confirmAbsent}
        onClose={() => { setConfirmAbsent(null); setConfirmAbsentMotif(""); setConfirmAbsentError(null); }}
        onConfirm={async () => {
          if (!confirmAbsent) return;
          // Même seuil que le serveur (rdv/statut/route.ts) — évite un aller-retour réseau pour un motif trop court.
          if (confirmAbsentMotif.trim().length < MOTIF_ABSENT_MIN_CARACTERES) {
            setConfirmAbsentError(`Le motif doit contenir au moins ${MOTIF_ABSENT_MIN_CARACTERES} caractères.`);
            return;
          }
          setConfirmAbsentError(null);
          const res = await handleAbsent(confirmAbsent.id, confirmAbsentMotif);
          if (res.ok) { setConfirmAbsent(null); setConfirmAbsentMotif(""); }
          else setConfirmAbsentError(res.error || "Erreur");
        }}
        tokens={toUiTokens(C)}
        level={2}
        title={confirmAbsent ? `Marquer ${confirmAbsent.nom} absent ?` : "Marquer absent ?"}
        description="Le rendez-vous sera enregistré comme non honoré par le client. Ce motif reste consultable dans l'historique de l'établissement."
        motifValue={confirmAbsentMotif}
        onMotifChange={setConfirmAbsentMotif}
        motifPlaceholder="Ex : ne s'est jamais présenté, ni prévenu"
        confirmLabel="Marquer absent"
        errorMessage={confirmAbsentError ?? undefined}
      />

      <ConfirmModal
        open={!!confirmRefuse}
        onClose={() => { setConfirmRefuse(null); setConfirmRefuseMotif(""); }}
        onConfirm={async () => {
          if (!confirmRefuse) return;
          const { id } = confirmRefuse;
          setConfirmRefuse(null);
          const motif = confirmRefuseMotif.trim();
          setConfirmRefuseMotif("");
          await handleRefuse(id, motif || undefined);
        }}
        tokens={toUiTokens(C)}
        level={2}
        motifValue={confirmRefuseMotif}
        onMotifChange={setConfirmRefuseMotif}
        motifPlaceholder="Ex : créneau complet, service indisponible ce jour-là"
        danger
        title={confirmRefuse ? `Refuser le rendez-vous de ${confirmRefuse.nom} ?` : "Refuser ce rendez-vous ?"}
        description="Le citoyen sera prévenu que son rendez-vous est refusé et pourra réserver un autre créneau."
        confirmLabel="Refuser"
      />

      {/* ═══════ HEADER ═══════ */}
      {/* ── paddingTop: env(safe-area-inset-top) — manquait ici (seul header
          du projet à ne pas l'avoir, cf. dashboard-client.tsx côté citoyen)
          : sur mobile en PWA standalone (viewportFit:"cover", layout.tsx),
          la barre de statut du téléphone se superposait au header au lieu
          de s'afficher au-dessus (retour Bryan 29/07/2026, capture à
          l'appui). env() vaut 0 sans encoche/PWA, donc PC inchangé. ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 200, backgroundColor: `${C.bgCard}F5`, backdropFilter: "blur(28px) saturate(200%)", borderBottom: `1px solid ${C.border}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div className="yelen-header-inner" style={{ padding: "0 16px" }}>
          <div style={{ height: "var(--header-h)", display: "flex", alignItems: "center", gap: "4px" }}>
            <HeaderStyles C={C}/>
            {/* Fil d'Ariane construit à partir des tableaux de navigation existants
                (≥1024 px) ; le bloc logo + salutation reste pour le mobile. */}
            {(() => {
              let crumbs: string[] = [];
              const ns = navSections.find(sec => sec.items.some(i => i.key === tab));
              if (ns) {
                const fg = ns.label === "Finance" ? FINANCE_GROUPS.find(g => g.tabs.includes(tab as DashboardTab)) : undefined;
                crumbs = [ns.label, ...(fg ? [fg.label] : []), ns.items.find(i => i.key === tab)?.label ?? ""];
              } else {
                const ag = accountGroups.find(g => g.items.some(i => i.key === tab));
                if (ag) {
                  const sg = ag.label === "Équipe & travail" ? EQUIPE_TRAVAIL_GROUPS.find(g => g.tabs.includes(tab as DashboardTab)) : undefined;
                  crumbs = ["Organisation", sg ? sg.label : ag.label, ag.items.find(i => i.key === tab)?.label ?? ""];
                } else {
                  const av = avatarMenuItems.find(i => i.key === tab);
                  if (av) crumbs = ["Compte", av.label];
                  else if (tab === "parametres") crumbs = ["Organisation", "Paramètres"];
                }
              }
              return <Breadcrumbs C={C} crumbs={crumbs.filter(Boolean)}/>;
            })()}
            <div className="hdr-mobile-id" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
              {inst?.logo ? (
                <div style={{ width: "34px", height: "34px", position: "relative", borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.border2}`, flexShrink: 0 }}>
                  <Image src={inst.logo} alt="" fill sizes="34px" style={{ objectFit: "cover" }}/>
                </div>
              ) : (
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.gold}30, ${C.goldD}20)`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <YelenLogo size={20} color={C.gold} />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {/* Retour Bryan 17/09/2026 : le rôle "admin" (propriétaire/
                      responsable de l'établissement, seul rôle à accès total —
                      voir MembreRole) est salué par le nom de l'entreprise, pas
                      son propre prénom. Les 4 autres rôles (agent, comptable,
                      superviseur, dirigeant) gardent la salutation par prénom,
                      inchangée. */}
                  {membreRole === "admin"
                    ? (inst?.name ? getSalutation(inst.name) : "Dashboard")
                    : (membrePrenom ? getSalutation(membrePrenom) : inst?.name ? getSalutation(inst.name) : "Dashboard")}
                </div>
                {/* ── Sous-titre rôle (ADMIN/AGENT D'ACCUEIL/…) retiré d'ici
                    (retour Bryan 17/09/2026) : redondant avec le nom déjà
                    affiché juste au-dessus, et encombrait la salutation.
                    Déplacé dans le popover "Management" (icône avatar,
                    ci-dessous) sous forme de carte profil en pied de menu. ── */}
              </div>
            </div>

            {/* ── Icône Partenaires (chantier 26/07/2026) — entre le nom et
                la recherche, demande explicite du CEO. Navigation directe
                vers l'onglet "partenariat", pas un popover. Un point doré
                signale un partenariat déjà approuvé. ── */}
            {tabAllowed(membreRole, "partenariat") && (
              <button
                onClick={() => setTab("partenariat")}
                title={inst?.partenaire_statut === "approuve" ? "Partenaires — Partenariat approuvé" : "Partenaires"}
                aria-label={inst?.partenaire_statut === "approuve" ? "Partenaires — Partenariat approuvé" : "Partenaires"}
                className="hdr-ico tap yelen-header-more-item"
                style={{ position: "relative", background: tab === "partenariat" ? C.bg3 : "transparent", border: "none", borderRadius: "8px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: tab === "partenariat" ? C.gold : C.t2 }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 4-2 4 4"/></svg>
                {inst?.partenaire_statut === "approuve" && (
                  <span aria-hidden="true" style={{ position: "absolute", top: "7px", right: "7px", width: "7px", height: "7px", borderRadius: "50%", background: C.gold, border: `1.5px solid ${C.bgCard}` }}/>
                )}
              </button>
            )}

            {/* ── Recherche — wrapper position:relative commun à l'input
                desktop, l'icône mobile et le panneau de résultats, pour que
                la fermeture au clic extérieur et l'ancrage absolu (desktop)
                fonctionnent correctement ── */}
            <div ref={searchRef} style={{ position: "relative", flexShrink: 0 }}>
              <div className="header-search-desktop hdr-search-field" style={{ alignItems: "center", gap: "8px", height: "36px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 10px", boxSizing: "border-box" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => setActivePopover("search")}
                  placeholder="Rechercher…"
                  aria-label="Rechercher (Ctrl K)"
                  style={{ flex: 1, minWidth: 0, padding: "0", fontSize: "13px" }}
                />
                <KbdChip C={C} mac={isMac}/>
              </div>
              {/* ── Recherche mobile — icône qui ouvre le même popover ── */}
              <button onClick={() => setActivePopover(activePopover === "search" ? null : "search")} className="tap header-search-icon-mobile yelen-header-more-item" style={{ background: activePopover === "search" ? `${C.gold}15` : C.bgCard2, border: `1px solid ${activePopover === "search" ? C.gold + "40" : C.border}`, borderRadius: "10px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>

              {/* ── Résultats : navigation + clients. Portalé dans
                  document.body pour la même raison que HeaderPopover (le
                  <header> parent a un backdropFilter qui casse
                  position:fixed pour ce descendant). searchDesktopPos
                  (useDesktopAnchor) réancre le panneau ≥1024px depuis que
                  le portail a cassé l'ancrage CSS position:absolute (retour
                  Bryan 01/08/2026). ── */}
              {activePopover === "search" && typeof document !== "undefined" && createPortal(
                <div ref={searchPanelRef} role="dialog" aria-label="Recherche" className="header-popover-panel" style={searchDesktopPos ? { position: "fixed", top: searchDesktopPos.top, right: searchDesktopPos.right, left: "auto", bottom: "auto" } : undefined}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "48px", padding: "0 8px 0 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                    <span style={{ color: C.t1, fontSize: "14px", fontWeight: 600 }}>Recherche</span>
                    <button onClick={() => setActivePopover(null)} aria-label="Fermer" style={{ background: "none", border: "none", cursor: "pointer", color: C.t2, padding: "8px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher un onglet ou un client…" aria-label="Rechercher un onglet ou un client" autoFocus style={{ width: "calc(100% - 32px)", margin: "12px 16px 0", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "12px", flexShrink: 0 }}/>
                  <div className="header-popover-body">
                  {(() => {
                    const q = searchQuery.trim().toLowerCase();
                    const navResults = [...navSections.flatMap(s => s.items), ...accountItems].filter(i => !q || i.label.toLowerCase().includes(q));
                    const clientResults = clients.filter(c => q && (c.nom.toLowerCase().includes(q) || c.phone.includes(q))).slice(0, 6);
                    return (
                      <>
                        {navResults.length > 0 && (
                          <div style={{ marginBottom: "10px" }}>
                            <div style={{ color: C.t3, fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Navigation</div>
                            {navResults.slice(0, 8).map(i => (
                              <button key={i.key} onClick={() => { if (i.onClick) { i.onClick(); } else { setTab(i.key as typeof tab); } setActivePopover(null); setSearchQuery(""); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 8px", background: "none", border: "none", color: C.t1, fontSize: "13px", fontWeight: "600", textAlign: "left", cursor: "pointer", borderRadius: "8px" }}>
                                <span style={{ color: C.t3, display: "flex" }}>{i.icon}</span>{i.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {clientResults.length > 0 && (
                          <div>
                            <div style={{ color: C.t3, fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Clients</div>
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
                  </div>
                </div>,
                document.body
              )}
            </div>

            {/* ── RDV entrants — badge = rdvsPending (statut "nouveau"),
                même définition que le badge du menu latéral. Masqué pour le
                comptable (retour Bryan 16/09/2026) : "rdv" = "none" dans
                TAB_MATRIX pour ce rôle, l'icône n'avait aucune utilité. ── */}
            {membreRole !== "comptable" && (
            <HeaderPopover id="rdv" active={activePopover === "rdv"} onOpen={() => setActivePopover("rdv")} onClose={() => setActivePopover(null)} badge={rdvsPending.length} glow panelTitle="RDV entrants" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            >
              <RdvEntrantsPopoverContent C={C} rdvs={rdvsPending} actionLoading={actionLoading}
                onOuvrir={r => { setActivePopover(null); setSelectedRDV(r); }}
                onAccepter={id => { void handleAccept(id); }} onRefuser={(id, motif) => { void handleRefuse(id, motif); }}
                onVoirTous={() => { setActivePopover(null); setTab("rdv"); }}/>
            </HeaderPopover>
            )}

            {/* ── Notifications — n'existait pas avant le chantier "Yelen
                Assistant" (20/07/2026). Marque tout comme lu à l'ouverture.
                Masquée pour le comptable (retour Bryan 16/09/2026). ── */}
            {membreRole !== "comptable" && (
            <HeaderPopover id="notifications" active={activePopover === "notifications"} onOpen={ouvrirNotifications} onClose={() => setActivePopover(null)} badge={institutionNotifs.filter(n => !n.lu).length} panelTitle="Notifications" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
            >
              <NotificationsPopoverContent C={C}
                notifs={institutionNotifs} nonLuesIds={notifsNonLuesAffichees}
                chargement={notifsChargement} erreur={notifsErreur} onReessayer={rechargerNotifications}
                nomPourRdv={id => nomCitoyenParRdv.get(id)} onOuvrir={handleClickNotif}
                onVoirToutes={() => { setActivePopover(null); setTab("notifications"); }}
                onglet={ongletNotif} onChangerOnglet={setOngletNotif}
                contenuSysteme={<NotifSystemeBientot C={C}/>}/>
            </HeaderPopover>
            )}

            {/* ── Questions clients — icône dédiée, séparée du badge
                "Messagerie" du menu latéral (table questions_institution,
                pas messages). Clic renvoie directement vers le panneau
                "Mon compte > Questions des clients", pas un fil de
                discussion ici. Masquée pour le comptable (retour Bryan
                16/09/2026) : "questions-clients" = "none" dans TAB_MATRIX
                pour ce rôle. ── */}
            {membreRole !== "comptable" && (
            <HeaderPopover id="questions" active={activePopover === "questions"} onOpen={() => setActivePopover("questions")} onClose={() => setActivePopover(null)} badge={questionsNonRepondues} panelTitle="Questions clients" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="9.01" y2="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7"/></svg>}
            >
              {questionsNonRepondues === 0 ? (
                <PopoverEmpty C={C} icone={IcoVideQuestion} titre="Aucune nouvelle question" aide="Les questions des citoyens apparaîtront ici."/>
              ) : (
                <p style={{ color: C.t2, fontSize: "14px", margin: "4px 0 0", lineHeight: 1.6 }}>
                  {questionsNonRepondues} question{questionsNonRepondues > 1 ? "s" : ""} en attente de réponse, posée{questionsNonRepondues > 1 ? "s" : ""} publiquement par des citoyens avant leur RDV.
                </p>
              )}
              <PopoverFooter C={C} label="Voir toutes les questions" onClick={() => { setActivePopover(null); setTab("questions-clients"); }}/>
            </HeaderPopover>
            )}

            {/* ── Feedback ── */}
            <HeaderPopover id="feedback" active={activePopover === "feedback"} onOpen={() => setActivePopover("feedback")} onClose={() => setActivePopover(null)} panelTitle="Envoyer un feedback" wrapperClassName="yelen-header-more-item hdr-collapsible" fallbackAnchorRef={plusWrapRef}
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>}
            >
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                {([{ k: "bug", l: "Bug" }, { k: "suggestion", l: "Suggestion" }, { k: "ux", l: "UX" }, { k: "fonctionnalite", l: "Fonctionnalité" }] as const).map(t => (
                  <button key={t.k} onClick={() => setFeedbackType(t.k)} className="tap" style={{ backgroundColor: feedbackType === t.k ? `${C.gold}20` : C.bg3, border: `1px solid ${feedbackType === t.k ? C.gold + "40" : C.border}`, color: feedbackType === t.k ? C.gold : C.t2, fontSize: "11px", fontWeight: "700", padding: "6px 10px", borderRadius: "20px", cursor: "pointer" }}>{t.l}</button>
                ))}
              </div>
              <textarea value={feedbackMsg} onChange={e => setFeedbackMsg(e.target.value)} placeholder="Décrivez votre retour…" rows={4} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: C.t1, marginBottom: "10px" }}/>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth disabled={!feedbackMsg.trim()} loading={feedbackSending} onClick={envoyerFeedback}>
                Envoyer
              </Button>
            </HeaderPopover>

            {/* ── Recommandations (système de recommandation institutionnel,
                Phase 4, architecture validée CEO 13/10/2026) — lien direct
                (pas un HeaderPopover, aucun contenu à prévisualiser ici),
                ouvre l'écran dédié dans un NOUVEL ONGLET NAVIGATEUR, même
                patron que Support Yelen (URL propre /{slug}/{id}/..., gérée
                par le catch-all app/[slug]/[id]/[screen]/page.tsx). Masqué
                pour agent/comptable (TAB_MATRIX["recommandations"] = "none"
                pour ces 2 rôles, décision CEO explicite). ── */}
            {tabAllowed(membreRole, "recommandations") && (
              <a href={`/${urlSlug}/${instId}/recommandations`} target="_blank" rel="noopener noreferrer" title="Recommandations" aria-label="Recommandations (nouvel onglet)" className="hdr-ico tap yelen-header-more-item hdr-collapsible" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: "8px", width: "36px", height: "36px", cursor: "pointer", flexShrink: 0, color: C.t2, textDecoration: "none" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>
              </a>
            )}

            {/* ── Aide — liens déjà existants ailleurs (Guide, FAQ, CGU,
                confidentialité) + Support Yelen (chantier "Séparation
                Messagerie/Support" 06/09/2026, retour Bryan) : icône casque
                identique à celle du header côté citoyen (app/page.tsx
                ::Ic.Headset, remplace le "?"), badge de non-lus repris de
                supportUnread. Le clic ouvre l'écran de conversation dédié
                (SupportYelenTab, tab "support") dans un NOUVEL ONGLET
                NAVIGATEUR (target="_blank", retour Bryan : "l'utilisateur
                peut naviguer entre les 2 écrans") — remplace l'ancien
                mailto, désormais géré en direct dans l'app plutôt qu'en
                sortie vers le client mail. ── */}
            <HeaderPopover id="help" active={activePopover === "help"} onOpen={() => setActivePopover("help")} onClose={() => setActivePopover(null)} badge={supportUnread} panelTitle="Aide Yelen" wrapperClassName="yelen-header-more-item"
              trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            >
              {(() => {
                const dispo = supportEstDisponible(new Date());
                const couleurSupport = dispo ? C.green : C.orange;
                const item = popoverItem(C);
                return (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <p style={{ margin: "0 0 12px 10px", color: C.t2, fontSize: "13px" }}>Comment pouvons-nous vous aider ?</p>

                    <PopoverSection C={C} titre="Besoin d'aide ?">
                      <a href={`/${urlSlug}/${instId}/support`} target="_blank" rel="noopener noreferrer" onClick={() => setActivePopover(null)} className="hp-item tap" style={{ position: "relative", display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "10px", border: `1px solid ${C.border}`, background: C.bgCard, textDecoration: "none" }}>
                        <span style={{ color: C.t2, display: "flex", flexShrink: 0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg></span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 500 }}>Support Yelen</span>
                          <span style={{ display: "block", color: C.t2, fontSize: "13px" }}>Contacter notre équipe</span>
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${couleurSupport}1c`, color: couleurSupport, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                          <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: couleurSupport }}/>{dispo ? "Disponible" : "Fermé pour le moment"}
                        </span>
                        {supportUnread > 0 && (
                          <span role="status" aria-label={`${supportUnread} message${supportUnread > 1 ? "s" : ""} non lu${supportUnread > 1 ? "s" : ""}`} style={{ position: "absolute", top: -6, right: -6, background: C.red, color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 17, height: 17, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: `2px solid ${C.bgCard}` }}>{supportUnread > 9 ? "9+" : supportUnread}</span>
                        )}
                      </a>
                    </PopoverSection>

                    <PopoverSection C={C} titre="Ressources">
                      <button onClick={() => { setShowGuide(true); setActivePopover(null); }} className="hp-item tap" style={item}>
                        <span style={{ color: C.t3, display: "flex", flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                        <span style={{ flex: 1 }}>Aide & astuces</span>
                        <PopoverChevron C={C}/>
                      </button>
                      <button onClick={() => { setTab("parametres"); setActivePopover(null); }} className="hp-item tap" style={item}>
                        <span style={{ color: C.t3, display: "flex", flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z"/></svg></span>
                        <span style={{ flex: 1 }}>Sécurité du compte</span>
                        <PopoverChevron C={C}/>
                      </button>
                    </PopoverSection>

                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                      <PopoverSection C={C} titre="Informations légales">
                        <Link href="/cgu" onClick={() => setActivePopover(null)} className="hp-item tap" style={{ ...item, color: C.t2 }}><span style={{ flex: 1 }}>Conditions d&apos;utilisation</span><PopoverChevron C={C}/></Link>
                        <Link href="/confidentialite" onClick={() => setActivePopover(null)} className="hp-item tap" style={{ ...item, color: C.t2 }}><span style={{ flex: 1 }}>Politique de confidentialité</span><PopoverChevron C={C}/></Link>
                      </PopoverSection>
                    </div>
                  </div>
                );
              })()}
            </HeaderPopover>

            <span className="yelen-header-scanner" style={{ display: "contents" }}>
            <Button
              tokens={toUiTokens(C)} className="tap"
              variant="secondary"
              size="sm"
              aria-label="Scanner un QR code"
              title="Scanner"
              style={{ flexShrink: 0, margin: "0 4px" }}
              icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>}
              onClick={() => setShowScanner(true)}
            >
              <span className="hdr-scan-lbl">Scanner</span>
            </Button>
            </span>

            {/* ── « Plus » (1024–1279 px) : Feedback, Recommandations et Actualiser
                quand la largeur manque. Aucun contrôle à badge ici. ── */}
            <div ref={plusWrapRef} className="hdr-plus">
              <HeaderPopover id="plus" active={activePopover === "plus"} onOpen={() => setActivePopover("plus")} onClose={() => setActivePopover(null)} panelTitle="Plus d'actions"
                trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>}
              >
                <div role="menu" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <button role="menuitem" onClick={() => setActivePopover("feedback")} className="hp-item tap" style={popoverItem(C)}>
                    <span style={{ color: C.t3, display: "flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></span>
                    <span style={{ flex: 1 }}>Envoyer un feedback</span>
                  </button>
                  {tabAllowed(membreRole, "recommandations") && (
                    <button role="menuitem" onClick={() => { window.open(`/${urlSlug}/${instId}/recommandations`, "_blank", "noopener,noreferrer"); setActivePopover(null); }} className="hp-item tap" style={popoverItem(C)}>
                      <span style={{ color: C.t3, display: "flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg></span>
                      <span style={{ flex: 1 }}>Recommandations</span>
                    </button>
                  )}
                  <button role="menuitem" onClick={() => { loadData(); setActivePopover(null); }} disabled={refreshing} className="hp-item tap" style={popoverItem(C)}>
                    <span style={{ color: C.t3, display: "flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>
                    <span style={{ flex: 1 }}>Actualiser les données</span>
                  </button>
                </div>
              </HeaderPopover>
            </div>


            {/* ── Actualiser — sorti du menu "...", auto-refresh toutes les 30s (cf. useEffect) ── */}
            <button onClick={() => loadData()} disabled={refreshing} className="hdr-ico tap yelen-header-more-item hdr-collapsible" title="Actualiser les données" aria-label="Actualiser les données" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: "8px", width: "36px", height: "36px", cursor: refreshing ? "default" : "pointer", flexShrink: 0 }}>
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
              badge={membreRole === "comptable" ? 0 : rdvsPending.length + institutionNotifs.filter(n => !n.lu).length + questionsNonRepondues} badgeClassName="yelen-header-more-badge"
              trigger={<>
                <svg className="hdr-sys-m" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
                <span className="hdr-sys-d" style={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  <span role="status" aria-label={realtimeStatus === "connecte" ? "Temps réel connecté" : realtimeStatus === "reconnexion" ? "Reconnexion en cours" : "Hors ligne"} style={{ position: "absolute", top: "-4px", right: "-5px", width: "9px", height: "9px", borderRadius: "50%", border: `2px solid ${C.bgCard}`, backgroundColor: realtimeStatus === "connecte" ? C.green : realtimeStatus === "reconnexion" ? C.orange : C.red, boxSizing: "content-box" }}/>
                </span>
              </>}
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
                  // Profil / Profil Entreprise — mobile n'a pas l'avatar du
                  // header (yelen-header-more-item masqué <1024px, voir plus
                  // haut) : repris ici pour garder le même accès qu'avant,
                  // seul le chemin desktop change dans cette 1ère étape.
                  ...avatarMenuItems.map(item => ({ key: item.key, label: item.label, badge: item.key === "profil-entreprise" ? changementsProfilEnCours : 0, dot: false,
                    icon: item.icon,
                    onClick: () => { setTab(item.key); setActivePopover(null); } })),
                  // "Yelen Business" (17/09/2026) — même raison que
                  // avatarMenuItems ci-dessus : mobile n'a pas l'avatar du
                  // header, repris ici pour garder un accès équivalent au
                  // tiroir desktop (voir YELEN_BUSINESS_TABS).
                  ...(YELEN_BUSINESS_TABS.some(t => navAllowed(t.key)) ? [{ key: "yelen-business", label: "Yelen Business", badge: 0, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
                    onClick: () => { setBusinessMenuOpen(true); setActivePopover(null); } }] : []),
                  ...(tabAllowed(membreRole, "partenariat") ? [{ key: "partenariat", label: "Partenaires", badge: 0, dot: inst?.partenaire_statut === "approuve",
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 4-2 4 4"/></svg>,
                    onClick: () => { setTab("partenariat"); setActivePopover(null); } }] : []),
                  // RDV entrants / Notifications / Questions clients masqués
                  // pour le comptable (retour Bryan 16/09/2026) — même
                  // cohérence que les icônes retirées de la rangée desktop.
                  ...(membreRole !== "comptable" ? [{ key: "rdv", label: "RDV entrants", badge: rdvsPending.length, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                    onClick: () => setActivePopover("rdv") }] : []),
                  ...(membreRole !== "comptable" ? [{ key: "notifications", label: "Notifications", badge: institutionNotifs.filter(n => !n.lu).length, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
                    onClick: ouvrirNotifications }] : []),
                  ...(membreRole !== "comptable" ? [{ key: "questions", label: "Questions clients", badge: questionsNonRepondues, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="9.01" y2="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7"/></svg>,
                    onClick: () => setActivePopover("questions") }] : []),
                  ...(tabAllowed(membreRole, "recommandations") ? [{ key: "recommandations", label: "Recommandations", badge: 0, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>,
                    onClick: () => { window.open(`/${urlSlug}/${instId}/recommandations`, "_blank"); setActivePopover(null); } }] : []),
                  { key: "feedback", label: "Envoyer un feedback", badge: 0, dot: false,
                    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>,
                    onClick: () => setActivePopover("feedback") },
                  { key: "help", label: "Aide et ressources", badge: 0, dot: false,
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

              {/* ── Thème en ligne dans le popover, façon Supabase (retour
                  Bryan 01/09/2026) : plus besoin d'aller jusqu'à Paramètres
                  pour changer de thème — 3 options radio réglant `mode`
                  directement via useTheme(), appliqué immédiatement. ── */}
              <div style={{ padding: "2px 8px 6px", borderBottom: `1px solid ${C.border}`, marginBottom: "6px" }}>
                <div style={{ color: C.t3, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 8px 4px" }}>Thème</div>
                {([
                  { key: "system" as const, label: "Système" },
                  { key: "light" as const, label: "Clair" },
                  { key: "dark" as const, label: "Sombre" },
                ]).map(opt => (
                  <button key={opt.key} onClick={() => setMode(opt.key)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px", color: C.t1, fontSize: "13px", fontWeight: mode === opt.key ? "700" : "600", background: "none", border: "none", textAlign: "left", cursor: "pointer", borderRadius: "8px", width: "100%" }}>
                    <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: `1.5px solid ${mode === opt.key ? C.gold : C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {mode === opt.key && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: C.gold }}/>}
                    </span>
                    <span style={{ flex: 1 }}>{opt.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <button onClick={() => { setActivePopover(null); setLogoutOpen(true); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", color: C.red, fontSize: "13px", fontWeight: "700", background: "none", border: "none", textAlign: "left", cursor: "pointer", borderRadius: "8px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Se déconnecter
                </button>
              </div>
            </HeaderPopover>

            {/* ── Avatar du compte — façon GitHub, distinct du "..." ci-dessus.
                Ouvre Profil / Profil Responsable / Profil Entreprise (sortis
                du sous-menu "Compte" de la sidebar gauche, voir
                avatarMenuItemsRaw). Fond C.gold plein (pas de dégradé
                translucide) + glyphe plein contrasté en noir, même logique
                que badgeTextColor sur fond doré ailleurs dans ce fichier.
                Desktop uniquement pour cette 1ère étape (yelen-header-more-item,
                comme RDV/Notifications/Questions/Feedback/Aide) — le
                drill-down mobile "Compte" garde son propre chemin d'accès,
                pas touché ici. ── */}
            <span className="yelen-header-more-item" aria-hidden="true" style={{ width: "1px", height: "20px", background: C.border2, margin: "0 8px" }}/>
            <HeaderPopover id="avatar" active={activePopover === "avatar"} onOpen={() => setActivePopover("avatar")} onClose={() => setActivePopover(null)} badge={changementsProfilEnCours} badgeLabel={`${changementsProfilEnCours} modification${changementsProfilEnCours > 1 ? "s" : ""} de profil en cours`} panelTitle="Management" wrapperClassName="yelen-header-more-item"
              trigger={
                <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#000"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5Zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5Z"/></svg>
                </div>
              }
            >
              {/* En-tête utilisateur : prénom + rôle en casse normale (reprend
                  l'ancienne carte profil de pied de menu). */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "0 10px 12px", marginBottom: "8px", borderBottom: `1px solid ${C.border}` }}>
                <div aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "50%", background: C.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "13px", fontWeight: 600, color: C.t2 }}>
                  {(membrePrenom || "Y").charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{membrePrenom || "Yelen224 Pro"}</div>
                  <div style={{ color: C.t2, fontSize: "13px" }}>{membreRole ? ROLE_LABELS[membreRole].charAt(0) + ROLE_LABELS[membreRole].slice(1).toLowerCase() : "Yelen224 Pro"}</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {avatarMenuItems.map(item => {
                  const active = tab === item.key;
                  return (
                    <button key={item.key} onClick={() => { setTab(item.key); setActivePopover(null); }} className="hp-item tap" aria-current={active ? "page" : undefined} style={{ ...popoverItem(C), fontWeight: active ? 600 : 400 }}>
                      <span style={{ color: C.t3, display: "flex", flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.key === "profil-entreprise" && changementsProfilEnCours > 0 && (
                        <span role="status" title={`${changementsProfilEnCours} modification${changementsProfilEnCours > 1 ? "s" : ""} de profil en cours`} aria-label={`${changementsProfilEnCours} changement${changementsProfilEnCours > 1 ? "s" : ""} en cours d'examen`} style={{ backgroundColor: C.red, color: "#fff", fontSize: "10px", fontWeight: "800", borderRadius: "9px", minWidth: "17px", height: "17px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", flexShrink: 0 }}>{changementsProfilEnCours > 9 ? "9+" : changementsProfilEnCours}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* « Yelen Business » : ouvre un tiroir séparé (.yelen-business-drawer). */}
              {YELEN_BUSINESS_TABS.some(t => navAllowed(t.key)) && (
                <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: `1px solid ${C.border}` }}>
                  <button onClick={() => { setActivePopover(null); setBusinessMenuOpen(true); }} className="hp-item tap" style={popoverItem(C)}>
                    <span style={{ color: C.t3, display: "flex", flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></span>
                    <span style={{ flex: 1 }}>Yelen Business</span>
                    <PopoverChevron C={C}/>
                  </button>
                </div>
              )}
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
        <ProfilProgressionBandeau inst={inst} instId={instId} tab={tab} membreRole={membreRole} configComplete={configComplete} configPct={configPct} />

        {/* ── BANDEAU NOUVEAU RDV — se déclenche à chaque INSERT Realtime ──
            Masqué pendant une suspension (retour Bryan 17/08/2026, capture
            montrant "1 RDV a dépassé son heure... acceptez/refusez" par-
            dessus l'écran "Espace suspendu") : aucune nouvelle réservation
            n'est possible tant que l'établissement est suspendu, ces
            bandeaux "agissez sur ce RDV" n'ont plus de sens dans ce contexte. ── */}
        {bannerRdv && !showBannerDetail && !suspendu && (
          <NouveauRdvBanner rdv={bannerRdv} onClose={() => setBannerRdv(null)} onOpen={() => setShowBannerDetail(true)}/>
        )}

        {/* ── BANDEAU RDV EN FENÊTRE DE GRÂCE — masqué pendant une suspension,
            même raison. Ne montre plus les RDV déjà "non traités" (retour
            Bryan 13/09/2026) : passé les 30 minutes de grâce après l'heure
            prévue, un RDV sort de ce bandeau et ne vit plus que dans
            l'onglet/KPI "Non traités". ── */}
        {rdvsEnGrace.length > 0 && !dismissRetard && !suspendu && (
          <div style={{ backgroundColor: `${C.purple}18`, borderBottom: `1px solid ${C.purple}35`, padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", animation: "slideDownBanner 0.3s ease" }}>
            <div style={{ position: "relative", flexShrink: 0, width: "8px", height: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.purple }}/>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: C.purple, animation: "ping 1.5s ease-out infinite" }}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.purple, fontSize: "11px", fontWeight: "800" }}>
                {rdvsEnGrace.length === 1 ? "1 RDV a dépassé son heure — agissez avant qu'il devienne non traité" : `${rdvsEnGrace.length} RDV ont dépassé leur heure — agissez avant qu'ils deviennent non traités`}
              </div>
              <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rdvsEnGrace.slice(0, 3).map(r => `${r.citoyen_nom} (${formatHeure(r.heure_rdv)})`).join(" · ")}{rdvsEnGrace.length > 3 ? ` +${rdvsEnGrace.length - 3}` : ""}
              </div>
            </div>
            <button onClick={() => { setTab("rdv"); setRdvFilter("tous"); setDismissRetard(true); }} className="tap" style={{ height: "32px", backgroundColor: C.purple, color: "#fff", fontSize: "12px", fontWeight: "700", padding: "0 12px", borderRadius: "10px", border: "none", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
              Voir
            </button>
            <button onClick={() => setDismissRetard(true)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "4px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}
      </header>

      <div className={tab === "messagerie" || tab === "parametres" ? "yelen-page" : "yelen-page yelen-page--fluide"}>
      {/* ═══════════════════════════════════════════════════════════
          TAB : ACCUEIL — Espace suspendu (décision CEO 17/08/2026).
          Priorité absolue sur les 3 branches accueil ci-dessous, quel que
          soit le rôle (y compris comptable — "focus unique" s'applique à
          tout le monde) : une institution suspendue n'a plus de dashboard
          KPI ni de Setup Center à voir, seulement cet écran.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "accueil" && suspendu && (
        <CompteSuspenduScreen
          C={C}
          instName={inst?.name ?? ""}
          onOuvrirMessagerie={() => setTab("messagerie")}
          onOuvrirParametres={() => setTab("parametres")}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : ACCUEIL FINANCIER (comptable) — même clé d'onglet que
          l'accueil opérationnel, contenu différent selon le rôle : le
          comptable n'a pas de vue d'ensemble générique (décision CEO
          22/07/2026), seulement son tableau de bord financier.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "accueil" && !suspendu && membreRole === "comptable" && <FinanceAccueilTab/>}

      {/* ═══════════════════════════════════════════════════════════
          TAB : ACCUEIL — Centre de configuration (Setup Center post-
          inscription, décision CEO 12/08/2026) tant que l'établissement
          n'est pas entièrement configuré, puis bascule automatiquement
          vers le dashboard KPI classique ci-dessous.
      ═══════════════════════════════════════════════════════════ */}
      {tab === "accueil" && !suspendu && membreRole !== "comptable" && !configComplete && (
        <CentreConfigurationTab
          key={instRefreshKey}
          instId={instId}
          instName={inst?.name ?? ""}
          membreRole={membreRole}
          onNavigate={(t) => setTab(t as DashboardTab)}
          onStatusChange={handleConfigStatusChange}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB : ACCUEIL — volontairement PAS wrapped en KeepMounted
          (Lot 04-B). Ses données (stats, rdvs, etc.) vivent déjà dans
          InstitutionDashboardInner lui-même, qui ne démonte jamais tant que
          l'utilisateur reste sur cette route — un aller-retour vers un
          autre onglet ne perd donc déjà aucune donnée ici (seul le rendu
          DOM est reconstruit, sans conséquence fonctionnelle). Les 3
          branches accueil/comptable/Setup Center sont par ailleurs
          mutuellement exclusives via membreRole/configComplete — les
          envelopper séparément dans KeepMounted (qui ne connaît que "tab")
          risquerait d'afficher le Setup Center ET le tableau de bord KPI
          simultanément au moment précis où configComplete passe à true en
          cours de session. Non traité dans ce lot (voir rapport final).
      ═══════════════════════════════════════════════════════════ */}
      {tab === "accueil" && !suspendu && membreRole !== "comptable" && configComplete && (() => {
        const actionsPrioritaires = rdvsPending.length + rdvsEnRetard.length + stats.avis_non_lus;
        const now2 = new Date();
        const prochains = rdvs
          .filter(r => !["annule", "termine"].includes(r.statut) && r.date_rdv && r.heure_rdv)
          .filter(r => new Date(`${r.date_rdv}T${r.heure_rdv}`) >= now2)
          .sort((a, b) => new Date(`${a.date_rdv}T${a.heure_rdv}`).getTime() - new Date(`${b.date_rdv}T${b.heure_rdv}`).getTime())
          .slice(0, 2);
        const todayStr = now2.toISOString().slice(0, 10);

        const donutSegments = [
          { label: "Nouveau", value: stats.nouveau, color: C.gold, filter: "nouveau" },
          { label: "En attente", value: stats.pending, color: C.orange, filter: "en_attente" },
          { label: "Confirmés", value: stats.confirmed, color: C.blue, filter: "confirme" },
          { label: "Terminés", value: stats.done, color: C.green, filter: "effectue" },
          { label: "Annulés", value: stats.cancelled, color: C.red, filter: "annule" },
        ];
        const donutTotal = donutSegments.reduce((a, b) => a + b.value, 0) || 1;
        const R = 58, CIRC = 2 * Math.PI * R;
        let donutCumul = 0;

        type Rappel = { color: string; titre: string; desc: string; action: () => void };
        const rappelsBruts: (Rappel | null)[] = [
          rdvsEnRetard.length > 0 ? { color: C.orange, titre: "RDV en retard", desc: `${rdvsEnRetard.length} rendez-vous ont dépassé leur heure sans être clôturés.`, action: () => { setTab("rdv"); setRdvFilter("en_retard"); } } : null,
          stats.compte_restreint ? { color: C.red, titre: "Compte restreint", desc: `${stats.ratio_refus}/10 refus détectés — contactez le support Yelen.`, action: () => { window.location.href = "mailto:support@yelen224.com"; } } : (stats.cancelled > 0 ? { color: C.red, titre: "Annulations", desc: `${stats.cancelled} rendez-vous annulés au total.`, action: () => { setTab("rdv"); setRdvFilter("annule"); } } : null),
          rdvsPending.length > 0 ? { color: C.blue, titre: "Nouvelles demandes", desc: `${rdvsPending.length} demande${rdvsPending.length > 1 ? "s" : ""} de RDV en attente de réponse.`, action: () => { setTab("rdv"); setRdvFilter("nouveau"); } } : null,
        ];
        const rappels = rappelsBruts.filter((r): r is Rappel => !!r);

        return (
        <div className="apc-wrap" style={{ animation: "fadeUp 0.2s ease" }}>
          <ApercuStyles C={C}/>

          <ApercuHeader C={C} date={new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            salutation={membreRole === "admin" ? (inst?.name ? getSalutation(inst.name) : undefined) : (membrePrenom ? getSalutation(membrePrenom) : inst?.name ? getSalutation(inst.name) : undefined)}
            demandes={rdvsPending.length}
            onDemandes={() => { setTab("rdv"); setRdvFilter("nouveau"); }}
            onValider={() => setTab("valider-rdv")}
            onDispo={() => setTab("disponibilites")}/>

          {/* Bande KPI unique — mêmes 7 indicateurs, mêmes clics
              setTab("rdv")+setRdvFilter, mêmes variations (kpi_variations). */}
          {(() => {
            const pt = (label: string, value: number, dot: string, variation: KpiVariation, filter: string) => ({
              key: filter, label, valeur: <AnimatedNumber value={value}/>, valeurTexte: value, dot, variation,
              onClick: () => { setTab("rdv"); setRdvFilter(filter); },
            });
            return (
              <KpiBand C={C} groupes={[
                { label: "Activité", poids: 2, items: [
                  pt("Nouveaux RDV", stats.nouveau, C.gold, stats.kpi_variations.nouveau, "nouveau"),
                  pt("Total RDV", stats.rdv_total, C.t3, stats.kpi_variations.total, "tous"),
                ] },
                { label: "À traiter", poids: 2, items: [
                  pt("En attente", stats.pending, C.orange, stats.kpi_variations.pending, "en_attente"),
                  pt("Non traités", stats.non_traites, stats.non_traites > 0 ? C.red : C.t3, stats.kpi_variations.non_traites, "en_retard"),
                ] },
                { label: "Résultat", poids: 3, items: [
                  pt("Confirmés", stats.confirmed, C.blue, stats.kpi_variations.confirmed, "confirme"),
                  pt("Terminés", stats.done, C.green, stats.kpi_variations.done, "effectue"),
                  pt("Annulés", stats.cancelled, C.red, stats.kpi_variations.cancelled, "annule"),
                ] },
              ]}/>
            );
          })()}

          {/* Aujourd'hui / Semaine / Mois — mêmes valeurs et mêmes textes
              (tendance, « Historique insuffisant… »), illustrations retirées. */}
          <SyntheseBand C={C} items={[
            stats.confirmed === 0
              ? { key: "auj", label: "Aujourd'hui", valeur: null, lignes: [], vide: "Aucun RDV confirmé aujourd'hui.", illustration: <Image src="/illustrations/rdv-confirme-jour-vide.png" alt="" width={1250} height={590} style={{ width: "96px", height: "auto" }}/> }
              : { key: "auj", label: "Aujourd'hui", valeur: <AnimatedNumber value={stats.today}/>, lignes: [
                  `${stats.confirmed} confirmés`,
                  ...(() => { const pa = prochains.find(r => r.date_rdv === todayStr); return pa ? [`Prochain à ${heureAmPm(pa.heure_rdv)} — ${nomAffiche(pa.citoyen_nom)}`] : []; })(),
                ] },
            { key: "sem", label: "Semaine", illustration: <Image src="/illustrations/rdv-semaine.png" alt="" width={880} height={560} style={{ width: "72px", height: "auto" }}/>, valeur: <AnimatedNumber value={stats.week}/>, lignes: [stats.evolution_week_has ? `${stats.evolution_week > 0 ? "+" : ""}${stats.evolution_week}% vs préc.` : "Historique insuffisant pour établir une tendance"] },
            { key: "mois", label: "Mois", illustration: <Image src="/illustrations/rdv-mois.png" alt="" width={1150} height={650} style={{ width: "72px", height: "auto" }}/>, valeur: <AnimatedNumber value={stats.month}/>, lignes: [stats.evolution_month_has ? `${stats.evolution_month > 0 ? "+" : ""}${stats.evolution_month}% vs préc.` : "Historique insuffisant pour établir une tendance"] },
          ]}/>

          {/* Ligne principale — grille 12 colonnes, cartes de même hauteur. */}
          <div className="apc-main">
            <ApercuCard C={C} className="apc-c5 apc-o1" titre="Prochains rendez-vous" titreId="apc-prochains" action={<VoirLien C={C} label="Voir tout" onClick={() => setTab("rdv")}/>}>
              {prochains.length === 0 ? (
                <EtatVideCarte C={C} titre="Aucun rendez-vous à venir" aide="Les prochains rendez-vous apparaîtront ici."
                  icone={<Image src="/illustrations/prochains-rdv-vide.png" alt="" width={1536} height={1024} style={{ width: "96px", height: "auto" }}/>}/>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {prochains.map((r, i) => {
                    const presenceConfirmee = r.presence_status === "present";
                    const st = stInfo(
                      r.presence_status === "absent" ? "absent"
                        : rdvNonTraite(r.statut, r.presence_status, r.date_rdv, r.heure_rdv) ? "en_retard" : r.statut,
                      C
                    );
                    return (
                      <div key={r.id} style={{ padding: "12px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                          <div style={{ width: "64px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                            <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600 }}>{heureAmPm(r.heure_rdv)}</div>
                            {r.date_rdv === todayStr && <div style={{ color: C.t3, fontSize: "12px" }}>Aujourd&apos;hui</div>}
                          </div>
                          <div onClick={() => setSelectedRDV(r)} className="tap" style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>{nomAffiche(r.citoyen_nom)}</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${st.c}1c`, color: st.c, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                                <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: st.c }}/>{st.l}
                              </span>
                              {r.id === imminentRdvId && <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${C.orange}1c`, color: C.orange, fontSize: "12px", fontWeight: 600 }}>Imminent</span>}
                            </div>
                            <div style={{ color: C.t2, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.objet || "RDV général"}</span>
                              {r.guichet && <span style={{ color: C.t3, flexShrink: 0 }}>· {r.guichet}</span>}
                            </div>
                          </div>
                        </div>
                        {r.statut === "nouveau" ? (
                          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth disabled={!!actionLoading} onClick={() => handleAccept(r.id)}>{actionLoading === r.id ? "…" : "Confirmer"}</Button>
                        ) : (r.statut === "en_attente" || r.statut === "confirme") && presenceConfirmee ? (
                          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth disabled={!!actionLoading} onClick={() => handleTermine(r.id)}>{actionLoading === r.id ? "…" : "Marquer terminé"}</Button>
                        ) : (
                          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth onClick={() => setSelectedRDV(r)}>Voir le détail</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ApercuCard>

            <ApercuCard C={C} className="apc-c3 apc-o2" titre="À traiter maintenant" titreId="apc-atraiter">
              {rappels.length === 0 ? (
                <EtatVideCarte C={C} titre="Tout est à jour" aide="Aucun rendez-vous en retard ni demande en attente."
                  icone={<span style={{ display: "flex", gap: "8px" }}><Image src="/illustrations/rdv-retard-vide.png" alt="" width={887} height={887} style={{ width: "72px", height: "auto" }}/><Image src="/illustrations/annulations-vide.png" alt="" width={887} height={887} style={{ width: "72px", height: "auto" }}/></span>}/>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {rappels.map((r, i) => <LigneATraiter key={i} C={C} couleur={r.color} titre={r.titre} desc={r.desc} onClick={r.action}/>)}
                </div>
              )}
            </ApercuCard>

            <ApercuCard C={C} className="apc-c4 apc-o3" titre="Satisfaction clients" titreId="apc-satisfaction" action={<VoirLien C={C} label="Voir les avis" onClick={() => setTab("analyse")}/>}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                <span style={{ color: C.t1, fontSize: "32px", fontWeight: 600, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{stats.moyenne_avis > 0 ? stats.moyenne_avis.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0,0"}</span>
                <div>
                  <EtoilesAmbre C={C} note={stats.moyenne_avis}/>
                  <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{stats.avis_count} avis</div>
                </div>
              </div>
              {stats.notes_distribution.map(nd => <LigneDistribution key={nd.note} C={C} note={nd.note} pct={nd.pct} count={nd.count}/>)}
            </ApercuCard>
          </div>

          {/* ── SECTION 3 : Analytics, 3 colonnes ── */}
          <div className="vd-analytics" style={{ marginBottom: "24px" }}>
            <ScoreSante score={stats.score_sante} stats={stats} actionsPrioritaires={actionsPrioritaires} onVoirActions={() => { setTab("rdv"); setRdvFilter("nouveau"); }}/>

            {(() => {
              // V3 (17/09/2026) — sélecteur 7/30/90j dérivé de `rdvs` (déjà
              // chargé en entier, 300 RDV les + récents) plutôt que du seul
              // stats.rdv_par_jour figé à 7 jours. Comparaison à la période
              // précédente de même longueur, honnête (evoHasComparison=false
              // → "Pas encore de comparaison", jamais un % fabriqué).
              const evoDebut = new Date(now2); evoDebut.setDate(evoDebut.getDate() - (evolutionRange - 1)); evoDebut.setHours(0, 0, 0, 0);
              const evoPrevDebut = new Date(evoDebut); evoPrevDebut.setDate(evoPrevDebut.getDate() - evolutionRange);
              const evoPrevFin = new Date(evoDebut); evoPrevFin.setDate(evoPrevFin.getDate() - 1);
              const evolutionSeries = Array.from({ length: evolutionRange }, (_, i) => {
                const d = new Date(evoDebut); d.setDate(d.getDate() + i);
                const ds = d.toISOString().slice(0, 10);
                return { date: ds, day: d.toLocaleDateString("fr-FR", { weekday: "short" }), count: rdvs.filter(r => r.date_rdv === ds).length };
              });
              const evoTotal = evolutionSeries.reduce((a, b) => a + b.count, 0);
              const evoPrecN = rdvs.filter(r => new Date(r.date_rdv) >= evoPrevDebut && new Date(r.date_rdv) <= evoPrevFin).length;
              const evoHasComparison = evoPrecN > 0;
              const evoDeltaPct = evoHasComparison ? Math.round(((evoTotal - evoPrecN) / evoPrecN) * 100) : 0;
              const evoLabelComparaison = evolutionRange === 7 ? "vs semaine précédente" : evolutionRange === 30 ? "vs mois précédent" : "vs période précédente";
              const maxC = Math.max(...evolutionSeries.map(d => d.count), 1);
              const rPt = evolutionRange > 30 ? 0.8 : evolutionRange > 7 ? 1.2 : 1.6;
              const evolutionPts = evolutionSeries.map((d, i) => ({
                x: 3 + (i / Math.max(evolutionSeries.length - 1, 1)) * 94,
                y: 34 - 3 - (d.count / maxC) * 28,
                d,
              }));
              return (
              <Card tokens={toCardTokens(C)} padding="20px" style={{ boxShadow: C.shadow }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Évolution des RDV</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {([7, 30, 90] as const).map(r => (
                      <button key={r} onClick={() => setEvolutionRange(r)} className="tap" style={{ backgroundColor: evolutionRange === r ? C.gold : C.bg3, color: evolutionRange === r ? "#080812" : C.t2, border: "none", borderRadius: "20px", padding: "3px 10px", fontSize: "10px", fontWeight: "800", cursor: "pointer" }}>
                        {r}j
                      </button>
                    ))}
                  </div>
                </div>
                <svg viewBox="0 0 100 34" width="100%" height="90" preserveAspectRatio="none">
                  {[0.25, 0.5, 0.75].map(f => <line key={f} x1="3" x2="97" y1={34 - 3 - f * 28} y2={34 - 3 - f * 28} stroke={C.border} strokeWidth="0.4"/>)}
                  <path d={evolutionPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")} fill="none" stroke={C.blue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  {evolutionPts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={rPt} fill={C.blue} style={{ cursor: "pointer" }} onClick={() => { setRdvDateFilter(p.d.date); setTab("rdv"); }}>
                      <title>{`${p.d.date} — ${p.d.count} RDV`}</title>
                    </circle>
                  ))}
                </svg>
                {evolutionRange === 7 && (
                  <div style={{ display: "flex", marginBottom: "14px" }}>
                    {evolutionSeries.map((d, i) => (
                      <span key={i} style={{ flex: 1, textAlign: "center", color: C.t3, fontSize: "10px", fontWeight: "600" }}>{d.day}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: evolutionRange === 7 ? 0 : "14px" }}>
                  {[
                    { label: `Total (${evolutionRange}j)`, value: String(evoTotal) },
                    { label: evoLabelComparaison, value: evoHasComparison ? `${evoDeltaPct > 0 ? "+" : ""}${evoDeltaPct}%` : "Pas encore de comparaison" },
                    { label: "Moyenne / jour", value: (evoTotal / evolutionRange).toFixed(1) },
                    { label: "Jour le plus chargé", value: stats.peak_day },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ color: C.t1, fontSize: s.value.length > 12 ? "12px" : "16px", fontWeight: "800" }}>{s.value}</div>
                      <div style={{ color: C.t3, fontSize: "10px", marginTop: "2px" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </Card>
              );
            })()}

            <Card tokens={toCardTokens(C)} padding="20px" style={{ boxShadow: C.shadow }}>
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
                      return seg.value > 0 ? <circle key={seg.label} cx="66" cy="66" r={R} fill="none" stroke={seg.color} strokeWidth="14" strokeDasharray={dash} strokeDashoffset={offset} onClick={() => { setTab("rdv"); setRdvFilter(seg.filter); }} style={{ cursor: "pointer" }}/> : null;
                    })}
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: C.t1, fontSize: "24px", fontWeight: "800" }}>{stats.rdv_total}</span>
                    <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700" }}>Total</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: "140px" }}>
                  {donutSegments.map(seg => (
                    <div key={seg.label} onClick={() => { setTab("rdv"); setRdvFilter(seg.filter); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", cursor: "pointer" }}>
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
            </Card>
          </div>

          <ObjectifsHebdo stats={stats}/>

          <div className="apc-bottom">
            <ApercuCard C={C} className="apc-b4" titre="Accès rapides" titreId="apc-acces">
              {(() => {
                const ic = (d: React.ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
                const items = ([
                  { label: "Annonces", desc: "Publier une annonce", tab: "communication", svg: ic(<path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>) },
                  { label: "Mes services", desc: "Gérer vos offres", tab: "services", svg: ic(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>) },
                  { label: "Signalements", desc: "Suivre les cas", tab: "signalements", svg: ic(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>) },
                ] as { label: string; desc: string; tab: DashboardTab; svg: React.ReactNode }[])
                  .filter(item => tabAllowed(membreRole, item.tab, accesRestreints));
                return <div className="apc-acces">{items.map(item => <CarteAcces key={item.label} C={C} icone={item.svg} titre={item.label} desc={item.desc} onClick={() => setTab(item.tab)}/>)}</div>;
              })()}
            </ApercuCard>

            <ApercuCard C={C} className="apc-b8" titre="Activité récente" titreId="apc-activite">
              {stats.recent_activity.length === 0 ? (
                <EtatVideCarte C={C} titre="Aucune activité récente" aide="Les avis et rendez-vous récents apparaîtront ici."
                  icone={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}/>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {stats.recent_activity.map((a, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                      <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: a.type === "avis" ? C.orange : a.type === "message" ? C.blue : C.green, flexShrink: 0 }}/>
                      <span style={{ flex: 1, minWidth: 0, color: C.t1, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{motsEnCasse(a.label)}</span>
                      <span title={a.time} style={{ color: C.t3, fontSize: "13px", flexShrink: 0 }}>{tempsRelatif(a.time)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ApercuCard>
          </div>

          {/* ── Pied de page ── */}
          <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px 20px", padding: "4px 0 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green }}/>
              <span aria-live="polite" style={{ color: C.t3, fontSize: "12px" }}>Dernière mise à jour : {lastUpdated ? timeAgo(lastUpdated.toISOString()) : "—"}</span>
              <button type="button" onClick={() => loadData()} disabled={refreshing} className="apc-btn tap" aria-label="Actualiser les données" title="Actualiser les données"
                style={{ width: "28px", height: "28px", borderRadius: "6px", background: "none", border: "none", color: C.t2, cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </button>
            </div>
            <nav aria-label="Liens utiles" style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
              <Link href="/cgu" style={{ color: C.t3, fontSize: "12px", textDecoration: "none" }}>CGU</Link>
              <Link href="/confidentialite" style={{ color: C.t3, fontSize: "12px", textDecoration: "none" }}>Confidentialité</Link>
              {/* Guide Yelen — même modale que le panneau "Aide" du header (setShowGuide). */}
              <button onClick={() => setShowGuide(true)} className="apc-btn tap" style={{ color: C.t3, fontSize: "12px", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>Guide</button>
              {/* Support — ouvre SupportYelenTab (tab "support") dans un nouvel onglet navigateur. */}
              <a href={`/${urlSlug}/${instId}/support`} target="_blank" rel="noopener noreferrer" style={{ color: C.t3, fontSize: "12px", textDecoration: "none" }}>Support</a>
            </nav>
            <span style={{ color: C.t3, fontSize: "12px" }}>© 2026 Yelen224 by SemPya224</span>
          </footer>
        </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════
          TAB : RDV
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="rdv" current={tab} visited={visitedTabs}>
        <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
          <style>{`
            .rdv-card-inner{display:flex;flex-direction:column;gap:10px;padding:14px}
            .rdv-extra-filters{display:none;flex-direction:column;gap:8px;margin-bottom:12px}
            .rdv-extra-filters.open{display:flex}
            .rdv-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px}
            @media(min-width:1024px){
              .rdv-card-inner{display:grid;grid-template-columns:52px 44px 1fr auto auto;align-items:center;gap:16px;padding:16px 20px;min-height:120px}
              .rdv-extra-filters{display:flex!important;flex-direction:row}
              .rdv-kpis{grid-template-columns:repeat(7,1fr)}
            }
          `}</style>
          <ClockStyles C={C}/>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px 16px", flexWrap: "wrap", marginBottom: "16px" }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.3px" }}>Rendez-vous</h1>
              <p style={{ margin: "4px 0 0", color: C.t2, fontSize: "13px" }}>Gérez tous les rendez-vous de votre établissement.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <HelpCenterGuide tab="rdv" />
              <Button
                tokens={toUiTokens(C)}
                className="tap"
                variant="secondary"
                size="sm"
                style={{ flexShrink: 0 }}
                icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                loading={exportAccueilEnCours}
                onClick={exportCsv}
              >
                Export CSV
              </Button>
            </div>
          </div>

          {/* Bande KPI compacte, cliquable : même setter que le segmenté (setRdvFilter),
              mêmes compteurs que l'Aperçu général ; variation « Aujourd'hui : N · hier : M »
              (nombre de RDV prévus, jours de Conakry), sans pourcentage. */}
          {(() => {
            const kv = stats.kpi_variations;
            const it = (key: string, label: string, value: number, dot: string, variation: KpiVariation): RdvKpi => ({
              key, label, valeur: <AnimatedNumber value={value}/>, valeurTexte: value, dot,
              variation: { aujourdhui: variation.aujourdhui, hier: variation.hier },
              active: rdvFilter === key, onClick: () => setRdvFilter(key),
            });
            return (
              <RdvKpiBand C={C} items={[
                it("nouveau", "Nouveaux", stats.nouveau, C.gold, kv.nouveau),
                it("en_attente", "En attente", stats.pending, C.orange, kv.pending),
                it("en_retard", "Non traités", stats.non_traites, stats.non_traites > 0 ? C.red : C.t3, kv.non_traites),
                it("confirme", "Confirmés", stats.confirmed, C.blue, kv.confirmed),
                it("effectue", "Effectués", stats.done, C.green, kv.done),
                it("annule", "Annulés", stats.cancelled, C.red, kv.cancelled),
                it("tous", "Total", stats.rdv_total, C.t3, kv.total),
              ]}/>
            );
          })()}

          {/* Barre d'outils unique : pastilles de statut fusionnées dans le segmenté,
              mêmes états (rdvFilter, rdvSearch, rdvDateFilter, rdvServiceFilter, rdvSort). */}
          <AppointmentsToolbar C={C}
            segments={[
              { key: "tous", label: "Tous", count: rdvs.length },
              { key: "nouveau", label: "Nouveaux", count: stats.nouveau },
              { key: "en_attente", label: "En attente", count: stats.pending },
              { key: "confirme", label: "Confirmés", count: stats.confirmed },
              { key: "effectue", label: "Effectués", count: stats.done },
              { key: "annule", label: "Annulés", count: stats.cancelled },
              { key: "absent", label: "Absents", count: stats.absents },
              { key: "en_retard", label: "Non traités", count: stats.non_traites, alerte: true },
            ]}
            statut={rdvFilter} onStatut={setRdvFilter}
            search={rdvSearch} onSearch={setRdvSearch}
            date={rdvDateFilter} onDate={setRdvDateFilter}
            service={rdvServiceFilter} onService={setRdvServiceFilter} serviceOptions={rdvServiceOptions}
            filtersOpen={rdvFiltersOpen} onToggleFilters={() => setRdvFiltersOpen(v => !v)}
            sort={rdvSort} onSort={setRdvSort} total={filteredRdvs.length}
            onReset={() => { setRdvSearch(""); setRdvDateFilter(""); setRdvServiceFilter(""); setRdvFilter("tous"); }}/>

          {filteredRdvs.length === 0 ? (
            rdvFilter === "nouveau" ? (
              <RdvEmptyState C={C} illustration={<IllustrationRdvBoiteVide C={C}/>}
                titre="Tout est traité"
                texte="Aucune nouvelle demande n'attend votre réponse pour l'instant. Vous serez prévenu dès qu'un citoyen réservera un créneau chez vous."/>
            ) : (() => {
              // États vides distincts par statut (retour Bryan 15/08/2026 :
              // tous les filtres partageaient la même illustration et le
              // même texte générique, seul le titre changeait). 2 priorités
              // avant le statut : aucun RDV du tout pour l'établissement,
              // puis recherche/filtres actifs sans résultat (CTA de
              // réinitialisation) — inchangées, seul le cas "par statut" est
              // maintenant pleinement illustré, ton positif pour
              // annulés/absents (une liste vide y est une bonne nouvelle).
              const filtresActifs = !!rdvSearch || !!rdvDateFilter || !!rdvServiceFilter;
              const aucuneDonnee = rdvs.length === 0;

              // Distinction cruciale (retour Bryan 15/08/2026) : un
              // établissement déjà validé qui n'a simplement pas encore reçu
              // son premier RDV n'est PAS dans la même situation qu'un
              // établissement pas encore vérifié — dans ce second cas, la
              // vraie raison de l'absence de RDV est que les citoyens ne
              // peuvent pas encore le trouver, un message générique
              // "patientez" serait trompeur. Mêmes libellés que
              // ProfilProgressionBandeau.statutCfg (source unique du wording
              // de statut dans ce fichier), jamais réinventés ici.
              if (aucuneDonnee) {
                const statut = inst?.statut;
                if (statut === "refusee") {
                  return (
                    <RdvEmptyState C={C} illustration={<IllustrationRdvAlerte C={C} accent={C.red}/>}
                      titre="Votre dossier a été refusé"
                      texte="Votre établissement n'est pas visible des citoyens tant que ce point n'est pas résolu — c'est pour cela qu'aucun rendez-vous n'apparaît ici."
                      cta={{ label: "Contacter le support", onClick: () => { window.location.href = "mailto:support@yelen224.com"; } }}/>
                  );
                }
                if (statut === "suspendue") {
                  return (
                    <RdvEmptyState C={C} illustration={<IllustrationRdvAlerte C={C} accent={C.red}/>}
                      titre="Votre espace est suspendu"
                      texte="Votre établissement n'est plus visible des citoyens pendant la suspension — c'est pour cela qu'aucun rendez-vous n'apparaît ici."
                      cta={{ label: "Contacter le support", onClick: () => { window.location.href = "mailto:support@yelen224.com"; } }}/>
                  );
                }
                if (statut && statut !== "validee") {
                  // en_attente, ou toute autre valeur — même repli que
                  // statutCfg (?? en_attente) : accent doré, jamais rouge,
                  // ce n'est pas un problème, juste une attente normale.
                  return (
                    <RdvEmptyState C={C} illustration={<IllustrationRdvNeuf C={C}/>}
                      titre="Votre dossier est en attente de validation"
                      texte="Tant que l'équipe Yelen n'a pas validé votre dossier, votre établissement n'est pas visible des citoyens — c'est pour cela qu'aucun rendez-vous n'apparaît encore ici. Profitez-en pour vérifier que votre profil est complet."
                      cta={{ label: "Vérifier mon profil", onClick: () => setTab("profil-entreprise") }}/>
                  );
                }
                // statut === "validee" (ou pas encore chargé — jamais
                // affirmer "pas vérifié" sans le savoir réellement) : cas
                // normal, établissement bien visible, simplement en
                // attente de son tout premier rendez-vous.
                return (
                  <RdvEmptyState C={C} illustration={<IllustrationRdvNeuf C={C}/>}
                    titre="Aucun rendez-vous pour l'instant"
                    texte={`Dès qu'un citoyen réservera un créneau chez ${inst?.name || "votre établissement"}, il apparaîtra automatiquement ici.`}
                    cta={inst ? { label: "Voir ma fiche publique", onClick: () => window.open(`/institution/${instId}`, "_blank") } : undefined}/>
                );
              }
              if (filtresActifs) {
                return (
                  <RdvEmptyState C={C} illustration={<IllustrationRdvRecherche C={C}/>}
                    titre="Aucun résultat pour cette recherche"
                    texte="Aucun rendez-vous ne correspond à ces filtres. Essayez d'élargir votre recherche."
                    cta={{ label: "Réinitialiser les filtres", onClick: () => { setRdvSearch(""); setRdvDateFilter(""); setRdvServiceFilter(""); } }}/>
                );
              }
              const demandesActionnables = stats.nouveau + stats.pending;
              const RDV_STATUT_VIDE: Record<string, { titre: string; texte: string; illustration: React.ReactNode; cta?: { label: string; onClick: () => void } }> = {
                en_attente: {
                  titre: "Aucun rendez-vous en attente",
                  texte: "Personne ne patiente pour l'instant — les demandes prises en charge apparaîtront ici jusqu'à leur confirmation.",
                  illustration: <IllustrationRdvAttente C={C}/>,
                  cta: stats.nouveau > 0 ? { label: "Voir les nouvelles demandes", onClick: () => setRdvFilter("nouveau") } : undefined,
                },
                confirme: {
                  titre: "Aucun rendez-vous confirmé",
                  texte: "Dès qu'une demande sera acceptée et confirmée, elle apparaîtra ici en attendant le jour du rendez-vous.",
                  illustration: <IllustrationRdvConfirmes C={C}/>,
                  cta: demandesActionnables > 0 ? { label: "Voir les demandes à traiter", onClick: () => setRdvFilter("nouveau") } : undefined,
                },
                effectue: {
                  titre: "Aucun rendez-vous effectué",
                  texte: "Les rendez-vous menés à leur terme, présence confirmée, s'accumuleront ici au fil de votre activité.",
                  illustration: <IllustrationRdvEffectues C={C}/>,
                },
                annule: {
                  titre: "Zéro annulation",
                  texte: "Aucun rendez-vous n'a été annulé sous ce filtre — un bon signe pour la fiabilité de votre organisation.",
                  illustration: <IllustrationRdvSucces C={C}/>,
                },
                absent: {
                  titre: "Personne à signaler absent",
                  texte: "Aucun client n'a manqué son rendez-vous sous ce filtre. Continuez ainsi.",
                  illustration: <IllustrationRdvSucces C={C}/>,
                },
                en_retard: {
                  titre: "Aucun rendez-vous non traité",
                  texte: "Tous les rendez-vous dont l'heure est dépassée ont été résolus (pris en charge ou marqués absents). Rien n'est en attente de votre décision.",
                  illustration: <IllustrationRdvSucces C={C}/>,
                },
                tous: {
                  titre: "Aucun rendez-vous pour l'instant",
                  texte: "Les rendez-vous apparaîtront automatiquement ici dès qu'ils correspondront à ce statut.",
                  illustration: <IllustrationRdvNeuf C={C}/>,
                },
              };
              const etat = RDV_STATUT_VIDE[rdvFilter] ?? RDV_STATUT_VIDE.tous;
              return <RdvEmptyState C={C} illustration={etat.illustration} titre={etat.titre} texte={etat.texte} cta={etat.cta}/>;
            })()
          ) : (
            <AppointmentsTable C={C}
              rows={pageRdvs.map(r => ({
                r,
                badgeStatut: r.presence_status === "absent" ? "absent" : rdvNonTraite(r.statut, r.presence_status, r.date_rdv, r.heure_rdv) ? "en_retard" : r.statut,
                isRetard: rdvEstEnRetard(r.date_rdv, r.heure_rdv),
                clientExistant: (rdvCountByCitoyen.get(r.citoyen_id) ?? 0) > 1,
                imminent: r.id === imminentRdvId,
              }))}
              actions={{
                loading: actionLoading,
                onOpen: setSelectedRDV,
                onAccept: handleAccept,
                onPrendre: handlePrendreEnCharge,
                onAbsent: setConfirmAbsent,
                onTermine: setTermineDialog,
                onRefuse: id => { setConfirmRefuseMotif(""); setConfirmRefuse({ id, nom: rdvs.find(x => x.id === id)?.citoyen_nom ?? "ce citoyen" }); },
              }}/>
          )}


          {/* ── Pagination : une ligne, mêmes états (rdvPage, rdvPageSize). ── */}
          {filteredRdvs.length > 0 && (() => {
            const debut = (rdvPageClamped - 1) * rdvPageSize + 1;
            const fin = Math.min(rdvPageClamped * rdvPageSize, filteredRdvs.length);
            const btn = (actif: boolean): React.CSSProperties => ({ minWidth: "32px", height: "32px", borderRadius: "8px", backgroundColor: actif ? C.bg3 : "transparent", border: `1px solid ${actif ? C.gold : C.border}`, color: actif ? C.t1 : C.t2, fontSize: "13px", fontWeight: actif ? 600 : 400, cursor: "pointer", fontVariantNumeric: "tabular-nums", display: "inline-flex", alignItems: "center", justifyContent: "center" });
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px 20px", marginTop: "16px" }}>
                <span aria-live="polite" style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{debut}–{fin} sur {filteredRdvs.length}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
                  <nav aria-label="Pagination des rendez-vous" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <button onClick={() => setRdvPage(p => Math.max(1, p - 1))} disabled={rdvPageClamped === 1} aria-label="Page précédente" className="tap" style={{ ...btn(false), opacity: rdvPageClamped === 1 ? 0.4 : 1, cursor: rdvPageClamped === 1 ? "not-allowed" : "pointer" }}>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    {(() => {
                      const pages: (number | "…")[] = [];
                      for (let p = 1; p <= rdvTotalPages; p++) {
                        if (p === 1 || p === rdvTotalPages || Math.abs(p - rdvPageClamped) <= 1) pages.push(p);
                        else if (pages[pages.length - 1] !== "…") pages.push("…");
                      }
                      return pages.map((p, i) => p === "…" ? (
                        <span key={`e${i}`} aria-hidden="true" style={{ color: C.t3, fontSize: "13px", padding: "0 4px" }}>…</span>
                      ) : (
                        <button key={p} onClick={() => setRdvPage(p)} aria-label={`Page ${p}`} aria-current={p === rdvPageClamped ? "page" : undefined} className="tap" style={btn(p === rdvPageClamped)}>{p}</button>
                      ));
                    })()}
                    <button onClick={() => setRdvPage(p => Math.min(rdvTotalPages, p + 1))} disabled={rdvPageClamped === rdvTotalPages} aria-label="Page suivante" className="tap" style={{ ...btn(false), opacity: rdvPageClamped === rdvTotalPages ? 0.4 : 1, cursor: rdvPageClamped === rdvTotalPages ? "not-allowed" : "pointer" }}>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </nav>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: C.t2, fontSize: "13px" }}>Lignes par page :</span>
                    <div style={{ width: "84px" }}><ComboField C={C} id="apt-lignes" compact sansAucun valeur={String(rdvPageSize)} onChange={v => setRdvPageSize(Number(v))} options={[10, 20, 50].map(n => ({ value: String(n), label: String(n) }))}/></div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* RDV payants en attente de validation — même logique, tokens alignés (cartes blanches, badges doux, un bouton primaire). */}
          {rdvFilter === "tous" && (() => {
            const payants = rdvs.filter(r =>
              (r.statut === "en_attente" || r.statut === "nouveau") &&
              r.objet && r.objet.toLowerCase().includes("[payant]")
            );
            if (!payants.length) return null;
            return (
              <section aria-labelledby="rdv-payants-titre" style={{ marginTop: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <h2 id="rdv-payants-titre" style={{ margin: 0, color: C.t1, fontSize: "16px", fontWeight: 600 }}>RDV payants — validation en attente</h2>
                  <span style={{ display: "inline-flex", alignItems: "center", height: "20px", padding: "0 7px", borderRadius: "10px", backgroundColor: `${C.green}1c`, color: C.green, fontSize: "12px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{payants.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {payants.map(r => {
                    const parsed = parseAppointmentLabel(r.objet);
                    return (
                      <div key={r.id} style={{ backgroundColor: C.bgCard, borderRadius: "12px", border: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>{nomAffiche(r.citoyen_nom)}</div>
                          <div style={{ color: C.t2, fontSize: "13px", overflowWrap: "anywhere" }}>{parsed.reconnu ? `${parsed.service ?? ""}${parsed.montant ? ` · ${parsed.montant}` : ""}` : r.objet}</div>
                          <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px", fontVariantNumeric: "tabular-nums" }}>{formatDate(r.date_rdv, { day: "numeric", month: "short" })} · {heureAmPm(r.heure_rdv)}</div>
                        </div>
                        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setTab("valider-rdv")}>Valider paiement</Button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}
        </div>
      </KeepMounted>

      {/* L'ancien onglet "Nouvelles demandes" est fusionné dans l'onglet
          Rendez-vous ci-dessus (filtre "Nouveaux") — plus de bloc séparé ici. */}

      {/* ═══════════════════════════════════════════════════════════
          TAB : DISPONIBILITÉS
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="disponibilites" current={tab} visited={visitedTabs}>
        {inst && (
          <>
            {tabReadOnly(membreRole, "disponibilites") && <ReadOnlyNotice C={C}/>}
            <DisponibilitesTab disponibilites={inst.disponibilites} modifieLe={inst.disponibilites_modifie_le ?? null} modifieParNom={(() => { const rel = inst.institution_membres; const m = Array.isArray(rel) ? rel[0] : rel; return m ? `${m.prenom} ${m.nom}` : null; })()} peutVoirHistorique={membreRole !== null && can(membreRole, "journal.read")} onSaved={loadData} access={tabReadOnly(membreRole, "disponibilites") ? "read" : "full"} isHotel={inst.activite_principale_code === "hotellerie"} onNavigate={(t) => setTab(t as DashboardTab)}/>
          </>
        )}
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : SERVICES
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="services" current={tab} visited={visitedTabs}>
        {/* Chantier Services Hôtel V2 (docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md,
            20/08/2026) — même tabKey/menu pour tous les secteurs (aucun
            nouveau menu), rendu conditionnel comme "Chambres" déjà livré.
            ServicesTab.tsx reste strictement inchangé pour les 14 autres
            catégories. */}
        {inst?.activite_principale_code === "hotellerie"
          ? <ServicesHotelTab instId={instId}/>
          : <ServicesTab instId={instId}/>}
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : COMMUNICATION — Annonces (Lot 5a réel), Signalements (Lot 5b à venir)
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="communication" current={tab} visited={visitedTabs}>
        {tabReadOnly(membreRole, "communication") && <ReadOnlyNotice C={C}/>}
        <CommunicationTab instId={instId} canPublishAnnonce={membreRole !== null && can(membreRole, "communication.publish_annonce")}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : YELEN COMMUNITY — publications institution (22/08/2026)
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="communaute-pro" current={tab} visited={visitedTabs}>
        {tabReadOnly(membreRole, "communaute-pro") && <ReadOnlyNotice C={C}/>}
        <CommunauteProTab instId={instId} instName={inst?.name} canPublish={membreRole !== null && can(membreRole, "communaute_pro.publish")} onNavigate={(t) => setTab(t as DashboardTab)} refreshKey={communauteRefreshKey}/>
      </KeepMounted>

      <KeepMounted tabKey="signalements" current={tab} visited={visitedTabs}>
        {tabReadOnly(membreRole, "signalements") && <ReadOnlyNotice C={C}/>}
        <SignalementsTab instId={instId} access={tabReadOnly(membreRole, "signalements") ? "read" : "full"} active={tab === "signalements"}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : SCANNER QR — historique des RDV scannés (présence
          confirmée via le bouton Scanner du header/sidebar, colonnes
          réelles presence_status/presence_confirmed_at — confirmé par
          la lecture de app/api/qr/validate/route.ts, pas les champs
          qr_valide/qr_scanne_le documentés dans CLAUDE.md, obsolètes).
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="scanner" current={tab} visited={visitedTabs}>
      <ScansTab C={C} rdvs={rdvs} loading={loading} error={error ?? ""} active={tab === "scanner"} onScan={() => setShowScanner(true)} onRetry={loadData}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : MON CODE QR
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="codeqr" current={tab} visited={visitedTabs}>
        {inst && <CodeQrTab instId={instId} instName={inst.name} instSlug={inst.slug} onToast={showToast}/>}
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : VALIDER UN RDV PAYANT
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="valider-rdv" current={tab} visited={visitedTabs}>
        <ValiderRdvTab instId={instId} preloadBookingId={preloadBookingId} onPreloadConsumed={() => setPreloadBookingId(null)}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : PROFIL ENTREPRISE — distinct de Profil Responsable, accès
          via le petit menu "Compte" (sidebar), pas dans le menu principal.
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="profil-entreprise" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <ProfilEntrepriseTab instId={instId} onToast={showToast} onNavigate={(t) => setTab(t as DashboardTab)} onChangementsProfilMaj={rafraichirChangementsProfil}/>
      </KeepMounted>

      <KeepMounted tabKey="conditions-informations" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <ConditionsInformationsTab instId={instId} onToast={showToast} hrefSupport={`/${urlSlug}/${instId}/support`}/>
      </KeepMounted>

      <KeepMounted tabKey="configuration-hotel" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <ConfigurationHotelTab instId={instId} onToast={showToast} onNavigate={(t) => setTab(t as DashboardTab)}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : AVIS & RÉPUTATION — écran "Santé du compte", accès via
          le menu Compte (pas le menu principal).
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="avis-reputation" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <div style={{ padding: "16px" }}>
          {tabReadOnly(membreRole, "avis-reputation") && <ReadOnlyNotice C={C}/>}
          <AvisReputationTab instId={instId} onToast={showToast} access={tabReadOnly(membreRole, "avis-reputation") ? "read" : "full"}/>
        </div>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : PROFIL RESPONSABLE — table institution_responsables séparée
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="profil-responsable" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        {tabReadOnly(membreRole, "profil-responsable") && <ReadOnlyNotice C={C}/>}
        <ProfilResponsableTab instId={instId} onToast={showToast} access={tabReadOnly(membreRole, "profil-responsable") ? "read" : "full"}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : DOCUMENTS — vérification institutionnelle, remplace
          l'ancien /institution/document. Accès via menu Compte.
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="documents" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        {tabReadOnly(membreRole, "documents") && <ReadOnlyNotice C={C}/>}
        <DocumentsTab instId={instId} onToast={showToast} access={tabReadOnly(membreRole, "documents") ? "read" : "full"} instName={inst?.name} instLogo={inst?.logo} badgeVerifie={!!inst?.badge_verifie} onNavigate={(t) => setTab(t as DashboardTab)}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          ONGLETS FINANCE (comptable) — Phase B RBAC + Phases C-G contenu.
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="paiements" current={tab} visited={visitedTabs}><PaiementsTab instId={instId} onToast={showToast} isAdmin={isAdmin}/></KeepMounted>
      <KeepMounted tabKey="transactions" current={tab} visited={visitedTabs}><TransactionsTab instId={instId}/></KeepMounted>
      <KeepMounted tabKey="historique-financier" current={tab} visited={visitedTabs}><HistoriqueFinancierTab instId={instId}/></KeepMounted>
      <KeepMounted tabKey="facturation" current={tab} visited={visitedTabs}><FacturationTab instId={instId} onToast={showToast} isAdmin={isAdmin} membreRole={membreRole}
          onVoirClient={tabAllowed(membreRole, "mes-clients", accesRestreints) ? (citoyenId) => { setMesClientsInitialId(citoyenId); setTab("mes-clients"); } : undefined}/></KeepMounted>
      <KeepMounted tabKey="rapports" current={tab} visited={visitedTabs}><RapportsTab instId={instId}/></KeepMounted>
      <KeepMounted tabKey="documents-financiers" current={tab} visited={visitedTabs}><DocumentsFinanciersTab instId={instId} onToast={showToast}/></KeepMounted>
      <KeepMounted tabKey="documents-clients" current={tab} visited={visitedTabs}><DocumentsClientsTab instId={instId} onToast={showToast} active={tab === "documents-clients"}/></KeepMounted>
      {/* ═══ YELEN BUSINESS (17/09/2026) — 10 écrans à l'état vide (4
          sections : Compte/Finance/Documents/Assistance), voir
          YELEN_BUSINESS_SECTIONS/YelenBusinessStub en tête de fichier ═══ */}
      {YELEN_BUSINESS_TABS.map(item => (
        <KeepMounted key={item.key} tabKey={item.key} current={tab} visited={visitedTabs}>
          <YelenBusinessStub label={item.label} icon={item.icon} C={C}/>
        </KeepMounted>
      ))}
      <KeepMounted tabKey="partenariat" current={tab} visited={visitedTabs}>
        {tabReadOnly(membreRole, "partenariat") && <ReadOnlyNotice C={C}/>}
        <PartenariatTab
          instId={instId}
          access={tabReadOnly(membreRole, "partenariat") ? "read" : "full"}
          institution={{ name: inst?.name ?? "", logo: inst?.logo ?? null, secteur: inst?.secteur ?? null, website: inst?.website }}
          onNavigate={(t) => setTab(t as DashboardTab)}
        />
      </KeepMounted>
      <KeepMounted tabKey="mes-offres" current={tab} visited={visitedTabs}>
        {tabReadOnly(membreRole, "mes-offres") && <ReadOnlyNotice C={C}/>}
        <MesOffresTab instId={instId} onToast={showToast} access={tabReadOnly(membreRole, "mes-offres") ? "read" : "full"}/>
      </KeepMounted>
      <KeepMounted tabKey="messagerie" current={tab} visited={visitedTabs}>
        {tabReadOnly(membreRole, "messagerie") && <ReadOnlyNotice C={C}/>}
        <MessagerieTab onToast={showToast} initialCitoyenId={messagerieCitoyenInitial} suspendu={suspendu}
          onVoirProfilClient={tabAllowed(membreRole, "mes-clients", accesRestreints) ? (citoyenId) => { setMesClientsInitialId(citoyenId); setTab("mes-clients"); } : undefined}
          onVoirRdv={tabAllowed(membreRole, "rdv", accesRestreints) ? () => setTab("rdv") : undefined}
          instName={inst?.name} instLogo={inst?.logo} onUnreadChange={setMessagerieUnread}
        />
      </KeepMounted>
      <KeepMounted tabKey="collaboration" current={tab} visited={visitedTabs}>
        <CollaborationTab onToast={showToast}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          YELEN BUSINESS — relation commerciale institution <-> Yelen.
          Premier écran construit (Compte Yelen) ; yelen-contrat/
          yelen-forfait/yelen-paiements/yelen-transactions/
          yelen-reconciliation/yelen-frais-commissions/yelen-facturation/
          yelen-documents/yelen-support restent à l'état vide (chantiers
          séparés à venir).
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="yelen-compte" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <YelenCompteTab inst={inst} onToast={showToast}
          onVoirJournal={tabAllowed(membreRole, "journal") ? () => setTab("journal") : undefined}
          onContacterSupport={() => setTab("support")}/>
      </KeepMounted>
      <KeepMounted tabKey="yelen-contrat" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <YelenContratTab inst={inst} onToast={showToast} onContacterSupport={() => setTab("support")}/>
      </KeepMounted>
      <KeepMounted tabKey="yelen-forfait" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <YelenForfaitTab inst={inst} onToast={showToast} onContacterSupport={() => setTab("support")}/>
      </KeepMounted>
      <KeepMounted tabKey="yelen-paiements" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <YelenPaiementsTab inst={inst} onToast={showToast}/>
      </KeepMounted>
      <KeepMounted tabKey="yelen-transactions" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <YelenTransactionsTab inst={inst} onToast={showToast} membreRole={membreRole} onVoirForfait={() => setTab("yelen-forfait")}/>
      </KeepMounted>
      <KeepMounted tabKey="yelen-reconciliation" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <YelenReconciliationTab inst={inst} onToast={showToast} membreRole={membreRole}/>
      </KeepMounted>
      <KeepMounted tabKey="yelen-frais-commissions" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <YelenFraisTab inst={inst} onToast={showToast} membreRole={membreRole}/>
      </KeepMounted>
      <KeepMounted tabKey="yelen-facturation" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <YelenFacturationTab inst={inst} onToast={showToast} membreRole={membreRole} onVoirForfait={() => setTab("yelen-forfait")}/>
      </KeepMounted>
      <KeepMounted tabKey="yelen-documents" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        {tabReadOnly(membreRole, "yelen-documents") && <ReadOnlyNotice C={C}/>}
        <YelenDocumentsTab inst={inst} onToast={showToast} membreRole={membreRole}/>
      </KeepMounted>

      {/* Support Yelen (chantier "Séparation Messagerie/Support" 06/09/2026)
          — URL propre /{slug}/{id}/support, ouverte dans un nouvel onglet
          navigateur depuis le panneau header "Aide & ressources" (jamais un
          lien de sidebar). onClose ramène vers Accueil dans CE même onglet
          navigateur — n'a rien à voir avec le fait d'ouvrir/fermer un autre
          onglet du navigateur. */}
      <KeepMounted tabKey="support" current={tab} visited={visitedTabs}>
        <SupportYelenTab
          onClose={() => setTab("accueil")}
          onToast={showToast}
          onRead={() => setSupportUnread(0)}
          instName={inst?.name} instLogo={inst?.logo}
        />
      </KeepMounted>
      {/* Recommandations (Phase 4, architecture validée CEO 13/10/2026) —
          URL propre /{slug}/{id}/recommandations, ouverte dans un nouvel
          onglet navigateur depuis l'icône header dédiée (jamais un lien de
          sidebar), même patron que Support Yelen ci-dessus. */}
      <KeepMounted tabKey="recommandations" current={tab} visited={visitedTabs}>
        <RecommandationsTab
          onClose={() => setTab("accueil")}
          onNavigate={(t) => setTab(t as DashboardTab)}
          onToast={showToast}
          membreRole={membreRole}
          instName={inst?.name}
        />
      </KeepMounted>
      <KeepMounted tabKey="questions-clients" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <QuestionsClientsTab readOnly={!(membreRole !== null && can(membreRole, "questions.repondre"))} onToast={showToast}/>
      </KeepMounted>
      <KeepMounted tabKey="profil" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}><ProfilTab onToast={showToast} onNavigate={(t) => setTab(t as DashboardTab)}/></KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : MES CLIENTS — fiche + timeline des RDV avec CETTE
          institution, notes internes persistées (notes_clients).
          Accès via menu Compte.
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="mes-clients" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        {tabReadOnly(membreRole, "mes-clients", accesRestreints) && <ReadOnlyNotice C={C}/>}
        <MesClientsTab instId={instId} onToast={showToast} isAdmin={isAdmin} access={tabReadOnly(membreRole, "mes-clients", accesRestreints) ? "read" : "full"} onOuvrirMessagerie={tabAllowed(membreRole, "messagerie") ? ouvrirMessagerieClient : undefined} onVoirFacturation={tabAllowed(membreRole, "facturation", accesRestreints) ? () => setTab("facturation") : undefined} initialClientId={mesClientsInitialId} onInitialClientConsumed={() => setMesClientsInitialId(null)} initialSortBy={mesClientsInitialFiltre} onInitialSortByConsumed={() => setMesClientsInitialFiltre(null)} initialSearch={mesClientsInitialSearch} onInitialSearchConsumed={() => setMesClientsInitialSearch(null)}/>
      </KeepMounted>

      <KeepMounted tabKey="equipe" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <EquipeTab instId={instId} onToast={showToast} active={tab === "equipe"}/>
      </KeepMounted>

      <KeepMounted tabKey="clock-in-shift" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <ClockInShiftTab instId={instId} instSlug={inst?.slug ?? ""} onToast={showToast} access={tabReadOnly(membreRole, "clock-in-shift") ? "read" : "full"} active={tab === "clock-in-shift"}/>
      </KeepMounted>

      <KeepMounted tabKey="journal" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <JournalTab instId={instId} onToast={showToast} active={tab === "journal"}/>
      </KeepMounted>

      <KeepMounted tabKey="espace-travail" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <EspaceTravailTab instId={instId} onToast={showToast}/>
      </KeepMounted>

      <KeepMounted tabKey="ma-semaine" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <MaSemaineTab onToast={showToast}/>
      </KeepMounted>

      {/* Notifications : liste complète + détail. Mêmes données que le popover
          (état partagé du layout), aucune requête propre. Masqué au comptable,
          comme le popover. */}
      <KeepMounted tabKey="notifications" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        {tabAllowed(membreRole, "notifications") && (
          <NotificationsPage active={tab === "notifications"} notifs={institutionNotifs} nonLuesIds={notifsNonLuesAffichees}
            chargement={notifsChargement} erreur={notifsErreur} onReessayer={rechargerNotifications}
            rdvInfo={id => infoRdvParId.get(id)} onVoirRdv={handleClickNotif} contenuSysteme={<NotifSystemeBientot C={C}/>}/>
        )}
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : RENDEZ-VOUS PASSÉS — historique global filtrable,
          suivi par RDV (rdv.notes) et rappel citoyen. Accès via menu Compte.
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="rdv-historique" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <RdvPasseTab instId={instId} onToast={showToast}/>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : CENTRE D'ANALYSE
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="analyse" current={tab} visited={visitedTabs}>
        {tabReadOnly(membreRole, "analyse", accesRestreints) && <ReadOnlyNotice C={C}/>}
        <CentreAnalyseTab
          instId={instId}
          rdvs={rdvs}
          stats={stats}
          onOpenGuide={() => setShowGuide(true)}
          active={tab === "analyse"}
          onVoirClients={tabAllowed(membreRole, "mes-clients", accesRestreints) ? (filtre, texte) => { setMesClientsInitialFiltre(filtre ?? null); setMesClientsInitialSearch(texte ?? null); setTab("mes-clients"); } : undefined}
        />
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          TAB : PARAMÈTRES
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="parametres" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <ParametresGarde role={membreRole} autorise={tabAllowed(membreRole, "parametres", accesRestreints)} onRetour={handleRetour} C={C}>
        <ParametresAccueil C={C} active={tab === "parametres"} inst={inst} mode={mode} setMode={setMode} onOuvrir={setTab}>
          <ParametresDangerZone instId={instId} instName={inst?.name ?? ""} />
        </ParametresAccueil>
        </ParametresGarde>
      </KeepMounted>

      {/* ═══════════════════════════════════════════════════════════
          Écrans dédiés issus de l'éclatement de "Paramètres" — accès
          uniquement via les 4 lignes listées sur l'écran Paramètres
          ci-dessus (aucune entrée sidebar dédiée), même palier RBAC que
          "parametres" (voir lib/institutionPermissions.ts).
      ═══════════════════════════════════════════════════════════ */}
      <KeepMounted tabKey="parametres-securite" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <ParametresGarde role={membreRole} autorise={tabAllowed(membreRole, "parametres-securite", accesRestreints)} onRetour={handleRetour} C={C}>
          <SecuriteCompteTab instId={instId}/>
        </ParametresGarde>
      </KeepMounted>

      <KeepMounted tabKey="parametres-notifications" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <ParametresGarde role={membreRole} autorise={tabAllowed(membreRole, "parametres-notifications", accesRestreints)} onRetour={handleRetour} C={C}>
          <NotificationsTab instId={instId}/>
        </ParametresGarde>
      </KeepMounted>

      <KeepMounted tabKey="parametres-legal" current={tab} visited={visitedTabs} onBack={handleRetour} C={C}>
        <ParametresGarde role={membreRole} autorise={tabAllowed(membreRole, "parametres-legal", accesRestreints)} onRetour={handleRetour} C={C}>
          <LegalTab conditionsAccepteesLe={inst?.conditions_prestataire_acceptees_le ?? null} onGererCompte={() => setTab("parametres")}/>
        </ParametresGarde>
      </KeepMounted>


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
        ] as { key: typeof tab | "__plus__"; label: string; badge: number; icon: (a: boolean) => React.ReactNode }[])
          .filter(item => navAllowed(item.key)).map(item => {
          const overflowTabs: (typeof tab)[] = ["services", "communication", "communaute-pro", "signalements", "messagerie", "codeqr", "valider-rdv", "analyse", "parametres", "profil-entreprise", "profil-responsable", "documents", "paiements", "transactions", "historique-financier", "facturation", "rapports", "documents-financiers", "documents-clients", "parametres-securite", "parametres-notifications", "parametres-legal"];
          const active = item.key === "__plus__" ? overflowTabs.includes(tab) : tab === item.key;
          return (
            <button key={item.key} onClick={() => item.key === "__plus__" ? setMobileMoreOpen(true) : setTab(item.key as typeof tab)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", background: "none", border: "none", padding: "8px 4px 5px", cursor: "pointer", position: "relative" }}>
              {active && <div style={{ position: "absolute", top: 0, left: "22%", right: "22%", height: "2px", background: `linear-gradient(90deg, ${C.gold}, ${C.goldL})`, borderRadius: "0 0 2px 2px" }}/>}
              <span style={{ position: "relative", display: "inline-flex" }}>
                {item.icon(active)}
                {item.badge > 0 && (
                  <span style={{ position: "absolute", top: "-5px", right: "-5px", backgroundColor: C.red, color: "#fff", fontSize: "10px", fontWeight: "800", borderRadius: "10px", minWidth: "14px", height: "14px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: `1.5px solid ${C.bg}` }}>
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span style={{ fontSize: "10px", fontWeight: active ? "800" : "600", color: active ? C.gold : C.t3, letterSpacing: "0.2px" }}>{item.label}</span>
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
                      🔒 Votre employeur peut voir tout ce que vous faites (Journal d&apos;activité). Vous ne voyez ici que ce à quoi il vous a donné accès.
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
                  { key: "communaute-pro", label: "Yelen Community", icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><circle cx="18" cy="8" r="2.5"/><path d="M22 21v-1.5a3.5 3.5 0 0 0-2.5-3.36"/></svg> },
                  { key: "signalements",   label: "Signalements",    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
                  { key: "messagerie",     label: "Messagerie",      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                  { key: "codeqr",         label: "Mon code QR",     icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="17.5" y1="14" x2="17.5" y2="17.5"/><line x1="14" y1="17.5" x2="17.5" y2="17.5"/></svg> },
                  { key: "valider-rdv",    label: "Valider un RDV",  icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="8 15 11 18 16 13"/></svg> },
                  { key: "analyse",        label: "Centre d'analyse", icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
                  { key: "parametres",     label: "Paramètres",      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
                  { key: "paiements",      label: "Paiements",       icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
                  { key: "transactions",   label: "Transactions",    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
                  { key: "historique-financier", label: "Historique financier", icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
                  { key: "facturation",    label: "Facturation",     icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
                  { key: "rapports",       label: "Rapports",        icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 21H4a1 1 0 0 1-1-1V4"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="4" width="3" height="13"/></svg> },
                  { key: "documents-financiers", label: "Documents financiers", icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> },
                  { key: "documents-clients", label: "Documents clients", icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/></svg> },
                ] as { key: typeof tab; label: string; icon: React.ReactNode }[])
                  .filter(item => navAllowed(item.key)).map(item => {
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
                    <div style={{ position: "relative", width: "19px", height: "19px", borderRadius: "5px", overflow: "hidden", flexShrink: 0 }}><Image src={inst.logo} alt="" fill sizes="19px" style={{ objectFit: "cover" }}/></div>
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

      {/* Yelen Security Activation (16/09/2026) — écran plein écran non
          fermable une fois l'échéance dépassée, sinon simple popup
          dismissible déclenché après quelques minutes d'usage réel. */}
      {activationSecurite?.bloque && (
        <SecurityActivationGate
          bloquant
          deadline={activationSecurite.deadline}
          onToast={showToast}
          onActive={() => setActivationSecurite(prev => prev ? { ...prev, requise: false, bloque: false } : prev)}
        />
      )}
      {!activationSecurite?.bloque && popupActivationOuvert && (
        <SecurityActivationGate
          bloquant={false}
          deadline={activationSecurite?.deadline ?? null}
          onToast={showToast}
          onActive={() => { setPopupActivationOuvert(false); setActivationSecurite(prev => prev ? { ...prev, requise: false } : prev); }}
          onFermer={() => { setPopupActivationOuvert(false); setPopupActivationDismiss(true); }}
        />
      )}
    </div>
  );
}

// Frontière Suspense requise par useSearchParams() dans InstitutionDashboardInner
// (piège déjà documenté dans ce projet : sans elle, le build Netlify échoue
// en prerendering, invisible à tsc --noEmit).
//
// Volontairement un layout.tsx (racine des URLs dynamiques institution
// /{slug}/{id}/{screen}, chantier 28/08/2026) et non un page.tsx : les
// layouts ne sont jamais remontés quand seul un segment enfant change lors
// d'une navigation interne — contrairement à un page.tsx, dont Next.js ne
// garantit pas la préservation d'état entre deux valeurs d'un même segment
// dynamique. C'est ce qui permet à "tab"/setTab (dérivés de useParams().screen
// plus bas) de continuer à piloter l'écran affiché SANS jamais démonter
// InstitutionDashboardInner — exactement l'invariant "workspace persistant"
// déjà en place avant ce chantier (auparavant assuré via ?tab= en query
// string pour la même raison). app/[slug]/[id]/[screen]/page.tsx n'est
// qu'un stub requis par Next.js pour matcher la route ; tout le rendu réel
// vient d'ici.
export default function InstitutionLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLoader size={36}/>
      </div>
    }>
      <InstitutionDashboardInner/>
      {children}
    </Suspense>
  );
}
