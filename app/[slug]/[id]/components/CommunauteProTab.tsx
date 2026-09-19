"use client";

// Publications institution dans Yelen Community (22/08/2026, retour Bryan)
// — écran dédié, distinct de Communication/Annonces (contenu temporaire
// avec expiration, déjà diffusé sur la fiche publique + widget "Cette
// semaine" de l'Accueil citoyen). Ici : mêmes catégories que le fil
// citoyen (lib/communauteCategories.ts) SAUF Carrière & Emploi et
// Marketing & Vente (retiré 23/08/2026, retour Bryan : ce terrain est déjà
// couvert par Offres et Annonces, pas de doublon de catégorie). Même
// modération admin que les posts citoyens
// (statut='en_attente_validation' → app/admin/posts). Écritures via
// /api/institution/communaute-posts (service_role, institution_auteur_id
// dérivé du JWT) — jamais un insert client direct (aucune session
// Supabase Auth côté institution).
//
// Création en popup (23/08/2026, retour Bryan : "dois ouvrir pop, regarde
// la pop de la fiche client, réutilise-la") — même mécanique responsive
// que .client-fiche-panel de MesClientsTab.tsx : bottom sheet mobile par
// défaut, dialogue centré ≥1024px (grip masqué, X de fermeture affiché).
//
// Demande d'adhésion (23/08/2026, retour Bryan : "même flux que demande
// de partenariat") — mirroring de PartenariatTab.tsx : écran pitch tant
// que institutions.communaute_statut n'est pas 'approuve', même logique
// de statuts (aucun/en_attente/approuve/refuse), même formulaire plein
// écran (DemandeCommunauteOverlay), même modération admin dédiée
// (app/admin/communaute-demandes, permission communaute.moderate). Une
// fois approuvé, l'écran Publications ci-dessous (déjà livré, Lots 1-4)
// s'affiche tel quel, sans aucun changement.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader, YelenLoaderEcran } from "@/components/YelenLoader";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { POST_CATEGORIES, POST_CATEGORIE_LABELS, POST_CATEGORIE_COULEURS, type PostCategorie } from "@/lib/communauteCategories";
import { DemandeCommunauteOverlay } from "@/components/DemandeCommunauteOverlay";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AvatarInstitution, CategorieBadge } from "@/components/CommunautePostCard";

type PostInstitution = {
  id: string;
  categorie: string;
  contenu: string | null;
  images: string[] | null;
  statut: "en_attente_validation" | "publiee" | "refusee";
  motif_refus: string | null;
  nb_partages: number;
  // Comptes réels ajoutés au Lot Community Pro (23/08/2026) — post_likes/
  // post_comments comptés côté route (voir communaute-posts/route.ts),
  // jamais une valeur par défaut inventée : toujours 0 réel si aucune ligne.
  nb_likes: number;
  nb_commentaires: number;
  // Impressions (post présent dans le fil) / vues (post ouvert en détail)
  // réelles — post_impressions/post_vues, voir chargerFilCommunaute/
  // ouvrirPostDetail dans app/page.tsx. nb_portee = citoyens distincts
  // parmi les impressions DE CE POST (pas une part de la portée
  // institution globale, calculée séparément côté route).
  nb_impressions: number;
  nb_vues: number;
  nb_portee: number;
  created_at: string;
};

// Chaîne Yelen — audience réelle (23/08/2026). abonnes_perdus_ce_mois
// vient du journal append-only citoyen_abonnement_events (citoyen_abonnements
// reste un hard-delete, sans trace propre) ; nb_abonnes/nouveaux_ce_mois
// viennent de institutions.nb_abonnes (trigger DB) et d'un count() sur
// citoyen_abonnements. audience_active_ce_mois (ajouté une fois
// post_vues disponible, voir Performance) — citoyens distincts ayant
// réellement ouvert une publication depuis le 1er du mois, pas juste
// abonnés.
type AudienceData = { nb_abonnes: number; nouveaux_ce_mois: number; abonnes_perdus_ce_mois: number; audience_active_ce_mois: number };

// Performance — impressions/vues/portée réelles (23/08/2026), agrégées
// côté route depuis post_impressions/post_vues déjà comptés par post.
type PerformanceData = { impressions_total: number; vues_total: number; portee: number };

type CommunauteStatut = "aucun" | "en_attente" | "approuve" | "refuse";
type Demande = { id: string; statut: string; motif_refus: string | null; date_decision: string | null; created_at: string };

const MAX_IMAGES = 4;

// Carrière & Emploi / Marketing & Vente exclues — déjà couvertes par
// Offres et Annonces, jamais un doublon de catégorie pour l'institution.
const CATEGORIES_INSTITUTION = POST_CATEGORIES.filter(c => c !== "carriere_emploi" && c !== "marketing_vente");

const STATUT_CFG = (C: ThemeTokens): Record<string, { label: string; color: string; bg: string }> => ({
  en_attente_validation: { label: "En attente de validation", color: C.gold, bg: `${C.gold}15` },
  publiee: { label: "Publiée", color: C.green, bg: C.greenL },
  refusee: { label: "Refusée", color: C.red, bg: C.redL },
});

function fmt(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateHeure(d: string) {
  const date = new Date(d);
  const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} à ${heure}`;
}

// Pop de bienvenue (23/08/2026, retour Bryan : "si profil validé... on
// l'affiche ce pop... bouton commencer qui ouvre l'écran communauté") —
// affiché une seule fois, la première fois que l'institution ouvre l'écran
// après approbation. Suivi côté client (localStorage, jamais un flag
// serveur pour un simple accueil cosmétique) — même prudence try/catch que
// partout ailleurs dans le projet (localStorage peut lever en navigation
// privée mobile).
const BIENVENUE_KEY = (id: string) => `yelen224_communaute_pro_bienvenue_${id}`;
function aDejaVuBienvenue(instId: string): boolean {
  try { return window.localStorage.getItem(BIENVENUE_KEY(instId)) === "1"; } catch { return false; }
}
function marquerBienvenueVue(instId: string) {
  try { window.localStorage.setItem(BIENVENUE_KEY(instId), "1"); } catch { /* navigation privée mobile — sans conséquence, juste revu au prochain accès */ }
}

function CommunauteProBienvenue({ onCommencer, C }: { onCommencer: () => void; C: ThemeTokens }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "24px", padding: "36px 28px", maxWidth: "420px", width: "100%", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
          <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
            <circle cx="48" cy="48" r="46" stroke={`${C.gold}25`} strokeWidth="1.5" />
            <circle cx="48" cy="48" r="34" fill={`${C.gold}15`} />
            <path d="M34 48l9 9 19-19" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <h2 style={{ color: C.t1, fontSize: "19px", fontWeight: 800, margin: "0 0 10px", letterSpacing: "-0.3px" }}>Bienvenue dans Yelen Community</h2>
        <p style={{ color: C.t2, fontSize: "13.5px", lineHeight: 1.7, margin: "0 0 28px" }}>
          Votre demande a été approuvée — votre établissement peut désormais publier dans le fil communautaire des citoyens Yelen. Chaque publication reste vérifiée par notre équipe avant diffusion.
        </p>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={onCommencer}>
          Commencer
        </Button>
      </div>
    </div>
  );
}

const ICONS = {
  Megaphone: (color: string) => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h1l3 5V4L6 9H5a2 2 0 0 0-2 2z" /><path d="M13 6a5 5 0 0 1 0 12" /><path d="M17 3a9 9 0 0 1 0 18" /></svg>,
  Check: (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  Users: (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  Shield: (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" /></svg>,
  Chat: (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  Clock: (color: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
  X: (color: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>,
};

const AVANTAGES = [
  { icon: "Users" as const, titre: "Visibilité auprès des citoyens Yelen", texte: "Vos publications apparaissent dans le fil communautaire, aux côtés des idées et actualités des membres Yelen." },
  { icon: "Shield" as const, titre: "Contrôle qualité Yelen", texte: "Chaque publication est vérifiée avant diffusion — un gage de confiance pour les citoyens qui la lisent." },
  { icon: "Chat" as const, titre: "Un vrai dialogue", texte: "Vos publications reçoivent likes, commentaires et partages, comme celles des membres de la communauté." },
];

const ETAPES = [
  { n: 1, titre: "Vous soumettez votre demande", texte: "Décrivez ce que votre établissement compte partager avec la communauté et laissez un contact." },
  { n: 2, titre: "Yelen examine votre demande", texte: "Notre équipe vérifie que votre établissement est bien adapté au fil communautaire." },
  { n: 3, titre: "Accès débloqué", texte: "Une fois approuvée, publiez directement depuis cet écran — chaque publication reste modérée avant diffusion." },
];

// "À quoi vous attendre" — remplace Comment ça marche une fois la demande
// soumise (23/08/2026, retour Bryan) : plus la peine d'expliquer le
// processus en général, la question devient "qu'est-ce qui se passe
// maintenant, concrètement, pendant que j'attends".
const A_QUOI_SATTENDRE = [
  { icon: "Shield" as const, titre: "Un examen humain, pas automatique", texte: "Un membre de l'équipe Yelen lit chaque demande personnellement — rien n'est validé à l'aveugle." },
  { icon: "Chat" as const, titre: "Une réponse par notification", texte: "Dès que la décision est prise, vous êtes notifié directement ici, dans votre tableau de bord." },
  { icon: "Clock" as const, titre: "Rien à faire de votre côté", texte: "Votre demande est en file d'examen. Si nous avons besoin d'un complément, nous vous contactons directement." },
];

function phraseConfiance(n: number): string {
  if (n === 0) return "Yelen Community pour les institutions vient d'ouvrir — soyez parmi les premières à en faire partie.";
  if (n === 1) return "1 établissement publie déjà dans Yelen Community.";
  return `${n} établissements publient déjà dans Yelen Community.`;
}

// Illustration état vide — même esprit que CommunauteEmptyIllustration
// (components/CommunautePostCard.tsx, fil citoyen) : trait seul, teinte de
// marque, jamais d'emoji. Un mégaphone plutôt que deux personnages : ici
// c'est l'institution qui s'apprête à prendre la parole, pas une
// communauté qui se retrouve.
function CommunauteProEmptyIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="42" stroke={`${color}25`} strokeWidth="1.5" />
      <path d="M28 40v8a4 4 0 0 0 4 4h2l4 8V32l-4 8h-2a4 4 0 0 0-4 4z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill="none" />
      <path d="M38 32l18-8v40l-18-8" stroke={color} strokeWidth="2" strokeLinejoin="round" fill="none" />
      <path d="M60 36c2 2 2 6 0 8" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M65 32c4 4 4 12 0 16" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// Famille d'illustrations Yelen Community Pro (23/08/2026, retour Bryan :
// états vides "réels" — jamais un dashboard de zéros, jamais un simple
// "Aucune donnée"). Même recette que CommunauteProEmptyIllustration
// ci-dessus (cercle trait fin `${color}25` à 80px + motif linéaire
// `color` strokeWidth 2, jamais de remplissage plein, jamais d'emoji) —
// une illustration par état vide de niveau écran, pas une par petit
// sous-bloc.
function IllustrationChaineDemarre({ color }: { color: string }) {
  // Vue d'ensemble — un phare/balise qui commence à rayonner : écho
  // volontaire à "Yelen" = "lumière" en malinké, pour "votre présence
  // commence à briller" plutôt qu'un dashboard vide générique.
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="38" stroke={`${color}25`} strokeWidth="1.5" />
      <circle cx="40" cy="42" r="7" stroke={color} strokeWidth="2" fill="none" />
      <path d="M40 22v6M27 29l4 4M53 29l-4 4M22 42h6M52 42h6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IllustrationAudience({ color }: { color: string }) {
  // Audience — silhouettes reliées à un profil central : l'audience se
  // construit autour de la chaîne, pas des personnages caricaturaux.
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="38" stroke={`${color}25`} strokeWidth="1.5" />
      <circle cx="40" cy="40" r="9" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="22" cy="26" r="5" stroke={color} strokeWidth="1.8" fill="none" />
      <circle cx="58" cy="26" r="5" stroke={color} strokeWidth="1.8" fill="none" />
      <circle cx="24" cy="56" r="5" stroke={color} strokeWidth="1.8" fill="none" />
      <path d="M26 30l9 6M54 30l-9 6M28 52l7-6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1 4" />
    </svg>
  );
}

function IllustrationPerformance({ color }: { color: string }) {
  // Performance — une ligne de tendance qui part de zéro : jamais une
  // courbe inventée, juste le principe visuel "ça va commencer à monter".
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="38" stroke={`${color}25`} strokeWidth="1.5" />
      <path d="M22 50h36M22 50v-24" stroke={`${color}55`} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22 50c8 0 10-14 18-14s10 8 18-6" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="22" cy="50" r="2.5" fill={color} />
    </svg>
  );
}

function IllustrationPresence({ color }: { color: string }) {
  // Présence — une carte professionnelle encore partiellement vide,
  // jamais la fiche établissement elle-même (juste le principe).
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="38" stroke={`${color}25`} strokeWidth="1.5" />
      <rect x="20" y="26" width="40" height="28" rx="4" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="30" cy="36" r="4" stroke={color} strokeWidth="1.8" fill="none" />
      <path d="M38 35h14M38 40h10" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M25 47h30" stroke={`${color}55`} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// État vide de niveau écran — illustration + titre + texte court + action
// suivante (jamais "Aucune donnée", jamais un dashboard de zéros — retour
// Bryan 23/08/2026). Structure commune aux 3 sous-vues qui peuvent être
// totalement vides pour une institution qui vient d'arriver (Vue
// d'ensemble/Performance/Audience) ; Publications avait déjà ce
// traitement (CommunauteProEmptyIllustration), Présence garde un simple
// texte pour son unique sous-bloc concerné (jamais une illustration par
// petit composant).
function CommunityEmptyScreen({ C, illustration, titre, texte, cta }: {
  C: ThemeTokens; illustration: React.ReactNode; titre: string; texte: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "36px 20px", maxWidth: "380px", margin: "0 auto" }}>
      <div style={{ marginBottom: "16px" }}>{illustration}</div>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, marginBottom: "8px" }}>{titre}</div>
      <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>{texte}</div>
      {cta && (
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" style={{ marginTop: "20px" }} onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  );
}

// FAQ — panneau latéral sticky ≥1024px, empilé sous le contenu principal en
// mobile (23/08/2026, retour Bryan). Les 2 premières questions redirigent
// explicitement vers Communication/Mes offres : Yelen Community n'est ni un
// doublon d'annonces ni un doublon d'offres, voir le commentaire d'en-tête
// de fichier sur CATEGORIES_INSTITUTION.
type FaqItem = { q: string; a: string; cta?: { label: string; tab: "communication" | "mes-offres" } };

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Puis-je publier une annonce ici ?",
    a: "Non — Yelen Community est réservé aux publications communautaires (idées, actualités, dialogue avec les citoyens). Vos annonces avec date d'expiration ont leur propre espace.",
    cta: { label: "Aller à Communication", tab: "communication" },
  },
  {
    q: "Puis-je publier une offre ici ?",
    a: "Non plus — vos offres commerciales (remises, promotions) ont leur propre espace de suivi, distinct du fil communautaire.",
    cta: { label: "Aller à Mes offres", tab: "mes-offres" },
  },
  {
    q: "Quels sont les avantages à rejoindre la communauté ?",
    a: "Vos publications gagnent en visibilité auprès des citoyens Yelen, reçoivent likes, commentaires et partages, et font exister votre établissement au-delà de la prise de rendez-vous.",
  },
  {
    q: "Mes publications sont-elles vérifiées avant diffusion ?",
    a: "Oui, systématiquement. Chaque publication passe par un contrôle qualité Yelen avant d'apparaître dans le fil — un gage de confiance pour les citoyens qui la lisent.",
  },
  {
    q: "Quelles règles dois-je respecter ?",
    a: "Un ton respectueux envers les citoyens, aucun contenu trompeur ou indésirable, et un contenu réellement utile à la communauté. Toute publication qui ne respecte pas ces conditions peut être refusée ou retirée.",
  },
];

function CommunauteFaq({ C, onNavigate }: { C: ThemeTokens; onNavigate?: (tab: string) => void }) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  return (
    <div className="communaute-pro-faq-sidebar" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, margin: "0 0 4px" }}>Questions fréquentes</div>
      {FAQ_ITEMS.map((item, i) => {
        const actif = ouvert === i;
        return (
          <div key={item.q} style={{ background: actif ? C.gold : C.bgCard2, borderRadius: "12px", overflow: "hidden" }}>
            <button
              onClick={() => setOuvert(actif ? null : i)}
              className="tap"
              aria-expanded={actif}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "none", border: "none", padding: "12px 14px", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ color: actif ? "#080812" : C.t1, fontSize: "12.5px", fontWeight: 700 }}>{item.q}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={actif ? "#080812" : C.t3} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: actif ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {actif && (
              <div style={{ padding: "0 14px 14px" }}>
                <p style={{ color: "rgba(8,8,18,0.75)", fontSize: "12px", lineHeight: 1.6, margin: item.cta ? "0 0 10px" : 0 }}>{item.a}</p>
                {item.cta && (
                  <button onClick={() => onNavigate?.(item.cta!.tab)} className="tap" style={{ background: "#080812", color: C.gold, border: "none", borderRadius: "9px", padding: "9px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
                    {item.cta.label}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Aiguillage par statut d'adhésion — n'atteint jamais CommunauteProHub tant
// que communaute_statut !== 'approuve'.
export function CommunauteProTab({ instId, instName, canPublish, onNavigate, refreshKey = 0 }: { instId: string; instName?: string; canPublish: boolean; onNavigate?: (tab: string) => void; refreshKey?: number }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [statut, setStatut] = useState<CommunauteStatut>("aucun");
  const [demande, setDemande] = useState<Demande | null>(null);
  const [institutionsActives, setInstitutionsActives] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [bienvenueOuverte, setBienvenueOuverte] = useState(false);

  const load = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    const res = await fetch("/api/institution/communaute-demande");
    const j = await res.json().catch(() => null);
    if (res.ok && j) {
      const nouveauStatut: CommunauteStatut = j.communaute_statut;
      setStatut(nouveauStatut);
      setDemande(j.derniere_demande);
      setInstitutionsActives(j.institutions_actives ?? 0);
      if (nouveauStatut === "approuve" && !aDejaVuBienvenue(instId)) setBienvenueOuverte(true);
    }
    if (!silencieux) setLoading(false);
  }, [instId]);

  useEffect(() => { load(); }, [load, instId]);
  // Refetch silencieux (pas de spinner plein écran) quand
  // institutions.communaute_statut change en base pendant que cet onglet
  // reste monté (KeepMounted) — sinon une validation admin pendant que
  // l'institution a déjà l'onglet ouvert laissait le statut figé sur
  // l'ancienne valeur jusqu'au prochain rechargement de page (23/08/2026,
  // retour Bryan : le pop de bienvenue s'affichait puis "Commencer"
  // retombait sur l'écran "en attente" resté en cache React).
  useEffect(() => {
    if (refreshKey === 0) return;
    load(true);
  }, [refreshKey, load]);

  if (loading) return <YelenLoaderEcran labelColor={C.t2} />;

  if (statut === "approuve") {
    if (bienvenueOuverte) {
      return (
        <CommunauteProBienvenue
          C={C}
          onCommencer={() => { marquerBienvenueVue(instId); setBienvenueOuverte(false); }}
        />
      );
    }
    return <CommunauteProHub instId={instId} instName={instName} canPublish={canPublish} />;
  }

  const peutDemander = canPublish && (statut === "aucun" || statut === "refuse");
  const STATUT_INFO: Record<CommunauteStatut, { label: string; color: string; icon: keyof typeof ICONS; message: string; prochaineEtape: string }> = {
    aucun: {
      label: "Pas encore de demande", color: C.t2, icon: "Megaphone",
      message: "Votre établissement n'a pas encore rejoint Yelen Community.",
      prochaineEtape: canPublish ? "Décrivez ce que vous comptez partager et soumettez votre demande ci-dessous." : "Un administrateur de votre institution peut soumettre une demande.",
    },
    en_attente: {
      label: "En cours d'examen", color: C.orange, icon: "Clock",
      message: "Votre demande est entre de bonnes mains.",
      prochaineEtape: "Notre équipe l'examine — vous serez notifié dès la décision prise.",
    },
    approuve: { label: "Membre actif", color: C.green, icon: "Check", message: "", prochaineEtape: "" },
    refuse: {
      label: "Demande refusée", color: C.red, icon: "X",
      message: "Cette demande n'a pas été retenue.",
      prochaineEtape: canPublish ? "Vous pouvez soumettre une nouvelle demande à tout moment." : "Un administrateur de votre institution peut soumettre une nouvelle demande.",
    },
  };
  const si = STATUT_INFO[statut];

  // Bandeau de statut sur fond doré Yelen en clair / neutre sombre en dark
  // (23/08/2026, retour Bryan) — même convention que CompteHeader/CitoyenMenu
  // (gold-in-light/neutral-in-dark, jamais un fond noir dédié). La couleur
  // sémantique du statut (orange/rouge/vert) reste réservée à la pastille,
  // en simple accent — jamais la couleur dominante du bandeau.
  // Fond plat (pas de dégradé) — même ton que le bouton "Scanner" du header
  // (23/08/2026, retour Bryan : le dégradé viré au brun dans le coin
  // inférieur droit rendait la pastille de statut illisible).
  const heroGold = theme === "light";
  const heroBg = heroGold ? C.gold : "#0A0A0F";
  const heroText1 = heroGold ? "#080812" : C.t1;
  const heroText2 = heroGold ? "rgba(8,8,18,0.72)" : C.t2;
  const heroIconBg = heroGold ? "rgba(8,8,18,0.12)" : C.bgCard2;
  const heroIconBorder = heroGold ? "rgba(8,8,18,0.18)" : C.border2;
  const heroCtaBg = heroGold ? "#080812" : C.gold;
  const heroCtaText = heroGold ? C.gold : "#080812";
  // Pastille de statut sur puce sombre opaque (au lieu d'une teinte
  // ${si.color}18 qui devenait orange-sur-doré illisible) — la couleur
  // sémantique du statut redescend au rang de simple pastille de 6px.
  const heroPillBg = heroGold ? "rgba(8,8,18,0.85)" : `${si.color}18`;
  const heroPillText = heroGold ? "#FFFFFF" : si.color;

  return (
    <div style={{ padding: "16px", maxWidth: "1180px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: C.gold, border: `1px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {ICONS.Megaphone("#080812")}
        </div>
        <div>
          <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: 800, margin: 0, letterSpacing: "-0.3px" }}>Yelen Community</h1>
          <p style={{ color: C.t2, fontSize: "13px", margin: "2px 0 0" }}>Partagez la voix de votre établissement auprès des citoyens Yelen.</p>
        </div>
      </div>

      {/* ── FAQ en panneau latéral collant ≥1024px, comble le vide à droite
          du contenu principal — empilée sous le contenu en mobile (23/08/2026,
          retour Bryan), même convention que .dispo-layout de
          DisponibilitesTab.tsx. ── */}
      <div className="communaute-pro-layout" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", alignItems: "start" }}>
        <style>{`
          @media(min-width:1024px){
            .communaute-pro-layout{grid-template-columns:1fr 320px!important}
            .communaute-pro-faq-sidebar{position:sticky;top:16px}
          }
        `}</style>
      <div style={{ minWidth: 0 }}>
      <div style={{
        position: "sticky", top: "16px", zIndex: 5,
        background: heroBg, borderRadius: "18px",
        padding: "22px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "18px", flexWrap: "wrap",
        boxShadow: heroGold ? "0 10px 26px rgba(200,140,10,0.25)" : "0 8px 24px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: 0 }}>
          <div style={{ width: "54px", height: "54px", borderRadius: "16px", background: heroIconBg, border: `1.5px solid ${heroIconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {ICONS[si.icon](heroText1)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: heroText1, fontSize: "14.5px", fontWeight: 800, marginBottom: "3px" }}>{si.message}</div>
            <div style={{ color: heroText2, fontSize: "12px", lineHeight: 1.5 }}>{si.prochaineEtape}</div>
            {statut === "refuse" && demande?.motif_refus && (
              <div style={{ color: heroText2, fontSize: "12px", marginTop: "6px", maxWidth: "480px" }}>Motif : {demande.motif_refus}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px", flexShrink: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: heroPillBg, color: heroPillText, fontSize: "11px", fontWeight: 800, padding: "5px 12px", borderRadius: "20px", whiteSpace: "nowrap" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: si.color, flexShrink: 0 }} />
            {si.label}
          </span>
          {statut === "en_attente" && demande && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: heroText1, fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" }}>Soumise le {fmtDateHeure(demande.created_at)}</div>
              <div style={{ color: heroText2, fontSize: "11.5px", marginTop: "3px", whiteSpace: "nowrap" }}>Examen sous 48h · 72h maximum</div>
            </div>
          )}
          {peutDemander && (
            <button onClick={() => setFormOpen(true)} className="tap" style={{ height: "40px", background: heroCtaBg, border: "none", color: heroCtaText, fontWeight: 700, fontSize: "13px", padding: "0 22px", borderRadius: "12px", cursor: "pointer", whiteSpace: "nowrap" }}>
              {statut === "refuse" ? "Nouvelle demande" : "Demander à rejoindre"}
            </button>
          )}
        </div>
      </div>

      <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 14px" }}>Ce que ça change pour votre établissement</h2>
      <div style={{ display: "grid", gap: "10px", marginBottom: "28px" }}>
        {AVANTAGES.map(a => (
          <div key={a.titre} style={{ display: "flex", gap: "12px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {ICONS[a.icon](C.gold)}
            </div>
            <div>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "2px" }}>{a.titre}</div>
              <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{a.texte}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 14px" }}>{statut === "en_attente" ? "À quoi vous attendre" : "Comment ça marche"}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
        {statut === "en_attente"
          ? A_QUOI_SATTENDRE.map(e => (
            <div key={e.titre} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "10px" }}>
                {ICONS[e.icon](C.gold)}
              </div>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>{e.titre}</div>
              <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{e.texte}</div>
            </div>
          ))
          : ETAPES.map(e => (
            <div key={e.n} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
              <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: C.bgCard2, border: `1.5px solid ${C.gold}`, color: C.gold, fontWeight: 800, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "10px" }}>{e.n}</div>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>{e.titre}</div>
              <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{e.texte}</div>
            </div>
          ))}
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.gold}33`, borderRadius: "18px", padding: "22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>
            {statut === "en_attente" ? "Votre demande est en cours" : "Prêt à rejoindre ?"}
          </div>
          <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "440px" }}>
            {!canPublish
              ? "Seul un administrateur de votre institution peut soumettre une demande d'adhésion."
              : statut === "en_attente"
              ? "Notre équipe examine votre dossier — vous serez notifié dès la décision prise."
              : phraseConfiance(institutionsActives)}
          </div>
        </div>
        {peutDemander && (
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ padding: "0 22px", flexShrink: 0 }} onClick={() => setFormOpen(true)}>
            Soumettre une demande
          </Button>
        )}
      </div>
      </div>

      <CommunauteFaq C={C} onNavigate={onNavigate} />
      </div>

      {formOpen && (
        <DemandeCommunauteOverlay
          instId={instId}
          onClose={() => setFormOpen(false)}
          onSubmitted={() => { setFormOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// Community Pro — centre de présence professionnelle du prestataire
// (23/08/2026, LOT architecture, retour Bryan : Community n'est pas un
// réseau social mais une couche de présence/découverte qui fait revenir
// sur Yelen — cf. LinkedIn Pages/Spotify for Artists comme références de
// mécanisme, jamais copiées telles quelles). Remplace l'ancien écran
// "Publications" unique (Lots 1-4 + refonte rendu du 23/08/2026, feed +
// composer conservés à l'identique ci-dessous) par un shell à 5
// sous-vues, piloté par `?subtab=` (même mécanisme que ClockInShiftTab.tsx :
// survit à un F5/changement d'onglet, contrairement à un useState local) :
//   - Vue d'ensemble : KPI réels agrégés depuis les posts déjà chargés
//     (aucune nouvelle requête) + "Ce qui fonctionne" dérivé par règles
//     déterministes (zéro LLM, même discipline que lib/postSuggestions.ts),
//     affiché seulement au-delà d'un seuil d'échantillon minimal.
//   - Publications : le feed refondu, inchangé.
//   - Performance : likes/commentaires/partages réels par post ; vues/
//     impressions/portée en stub honnête (aucune table de tracking
//     n'existe pour les posts aujourd'hui — voir annonce_vues/offre_vues
//     pour le pattern à répliquer le jour où c'est décidé).
//   - Audience : stub entier (aucun concept de followers/visite de profil
//     n'existe dans le schéma).
//   - Présence : aperçu de ce qu'un citoyen verrait (identité + posts
//     publiés uniquement), aucune donnée nouvelle.
// "Créer" reste un bouton modal (composer ci-dessous), pas un 6e onglet —
// cohérent avec Signalements/Documents clients qui créent aussi depuis une
// liste, jamais un écran dédié.
const SUB_VIEWS = ["apercu", "publications", "performance", "audience", "presence"] as const;
type SubView = (typeof SUB_VIEWS)[number];

const SUBNAV_LABELS: Record<SubView, string> = {
  apercu: "Vue d'ensemble",
  publications: "Publications",
  performance: "Performance",
  audience: "Audience",
  presence: "Présence",
};

const SUBNAV_ICONS: Record<SubView, (color: string) => React.ReactNode> = {
  apercu: color => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="8" /><rect x="10" y="8" width="4" height="12" /><rect x="17" y="4" width="4" height="16" /></svg>,
  publications: color => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="7" y1="9" x2="17" y2="9" /><line x1="7" y1="13" x2="17" y2="13" /><line x1="7" y1="17" x2="12" y2="17" /></svg>,
  performance: color => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 6" /><polyline points="15 6 21 6 21 12" /></svg>,
  audience: color => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  presence: color => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" /></svg>,
};

function CommunauteProHub({ instId, instName, canPublish }: { instId: string; instName?: string; canPublish: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const rawSubtab = searchParams.get("subtab");
  const subView: SubView = rawSubtab && (SUB_VIEWS as readonly string[]).includes(rawSubtab) ? (rawSubtab as SubView) : "apercu";
  const setSubView = useCallback((next: SubView) => {
    const qp = new URLSearchParams(searchParams.toString());
    qp.set("subtab", next);
    router.push(`${pathname}?${qp.toString()}`);
  }, [searchParams, pathname, router]);

  const [composerOuvert, setComposerOuvert] = useState(false);
  const [posts, setPosts] = useState<PostInstitution[]>([]);
  // Chaîne Yelen — audience réelle (23/08/2026), nb_abonnes maintenu par
  // trigger DB, nouveaux_ce_mois compté côté route. null tant que non
  // chargé, jamais un 0 par défaut qui se ferait passer pour une vraie valeur.
  const [audience, setAudience] = useState<AudienceData | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [texte, setTexte] = useState("");
  const [categorie, setCategorie] = useState<PostCategorie | null>(null);
  const [fichiers, setFichiers] = useState<File[]>([]);

  const showNotif = useCallback((type: "success" | "error", msg: string) => {
    setNotif({ type, msg });
    setTimeout(() => setNotif(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/institution/communaute-posts").then(r => r.json()).catch(() => ({ posts: [], audience: null, performance: null }));
    setPosts(res.posts || []);
    setAudience(res.audience ?? null);
    setPerformance(res.performance ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData, instId]);

  const choisirFichiers = (files: FileList | null) => {
    if (!files) return;
    const nouveaux = Array.from(files).filter(f => f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024);
    setFichiers(prev => [...prev, ...nouveaux].slice(0, MAX_IMAGES));
  };

  const resetForm = () => { setTexte(""); setCategorie(null); setFichiers([]); };
  const ouvrirComposer = () => { resetForm(); setComposerOuvert(true); };
  const fermerComposer = () => { setComposerOuvert(false); resetForm(); };

  const uploadUneImage = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/institution/communaute-posts/media", { method: "POST", body: fd });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.url ?? null;
  };

  const peutPublier = (texte.trim() || fichiers.length > 0) && categorie && !saving;

  const handlePublier = async () => {
    if (!peutPublier) return;
    setSaving(true);
    try {
      const images: string[] = [];
      for (const f of fichiers) { const url = await uploadUneImage(f); if (url) images.push(url); }

      const res = await fetch("/api/institution/communaute-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu: texte.trim(), images, categorie }),
      });
      if (!res.ok) {
        showNotif("error", "Erreur lors de la publication.");
      } else {
        showNotif("success", "Publication envoyée pour validation.");
        fermerComposer();
        fetchData();
      }
    } catch {
      showNotif("error", "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div style={{ padding: "40px 16px", display: "flex", justifyContent: "center" }}>
      <YelenLoader size={32} />
    </div>
  );

  return (
    <div style={{ padding: "16px" }}>
      <style>{`
        .communaute-pro-subnav{display:flex;gap:8px;overflow-x:auto;-ms-overflow-style:none;scrollbar-width:none}
        .communaute-pro-subnav::-webkit-scrollbar{display:none}
      `}</style>
      {notif && (
        <div style={{ position: "fixed", top: "70px", right: "16px", zIndex: 1000, backgroundColor: C.bgCard2, border: `1px solid ${notif.type === "success" ? C.green : C.red}40`, borderLeft: `4px solid ${notif.type === "success" ? C.green : C.red}`, borderRadius: "12px", padding: "14px 20px", maxWidth: "320px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          <p style={{ color: notif.type === "success" ? C.green : C.red, fontSize: "13px", margin: 0, fontWeight: "700" }}>{notif.msg}</p>
        </div>
      )}

      <div style={{ marginBottom: "18px" }}>
        <h2 style={{ color: C.t1, fontSize: "18px", fontWeight: 800, margin: "0 0 4px" }}>Yelen Community</h2>
        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>Votre présence professionnelle sur Yelen — publiez, mesurez et faites connaître votre établissement auprès des citoyens. Chaque publication est validée par l&apos;équipe Yelen avant diffusion.</p>
      </div>

      <div className="communaute-pro-subnav" style={{ marginBottom: "20px" }}>
        {SUB_VIEWS.map(key => {
          const actif = subView === key;
          return (
            <button key={key} onClick={() => setSubView(key)} className="tap" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px", backgroundColor: actif ? C.gold : C.bgCard, border: `1px solid ${actif ? C.gold : C.border}`, borderRadius: "20px", padding: "8px 14px", color: actif ? "#080812" : C.t2, fontSize: "12px", fontWeight: actif ? 800 : 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              {SUBNAV_ICONS[key](actif ? "#080812" : C.t2)}
              {SUBNAV_LABELS[key]}
            </button>
          );
        })}
      </div>

      {subView === "apercu" && (
        <VueEnsembleView C={C} posts={posts} audience={audience} canPublish={canPublish} onCreer={ouvrirComposer} onVoirPublications={() => setSubView("publications")} />
      )}

      {subView === "publications" && (
        <PublicationsFeedView C={C} instName={instName} posts={posts} canPublish={canPublish} onCreer={ouvrirComposer} />
      )}

      {subView === "performance" && <PerformanceView C={C} instName={instName} posts={posts} performance={performance} canPublish={canPublish} onCreer={ouvrirComposer} />}
      {subView === "audience" && <AudienceView C={C} audience={audience} canPublish={canPublish} onCreer={ouvrirComposer} />}
      {subView === "presence" && <PresenceView C={C} instName={instName} posts={posts} />}

      {composerOuvert && (
        <div className="communaute-pro-composer-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={fermerComposer}>
          <style>{`
            /* ── Composeur Yelen Community — surface quasi plein écran en
                mobile (header flèche retour, une colonne, catégories
                empilées en pilules qui s'enroulent), dialogue centré et de
                largeur maîtrisée ≥1024px (même mécanique bottom-sheet que
                .client-fiche-panel de MesClientsTab.tsx, mais reflow complet
                du header/des sections plutôt qu'une simple réduction). ── */
            @media(min-width:1024px){
              .communaute-pro-composer-overlay{align-items:center!important}
              .communaute-pro-composer-panel{max-width:560px!important;border-radius:20px!important;max-height:86svh!important}
              .communaute-pro-composer-grip{display:none!important}
              .communaute-pro-composer-back{display:none!important}
              .communaute-pro-composer-close-x{display:flex!important}
            }
          `}</style>
          <div onClick={e => e.stopPropagation()} className="communaute-pro-composer-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "18px 20px 24px", width: "100%", maxWidth: "560px", maxHeight: "96svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
            <div className="communaute-pro-composer-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 16px" }} />

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
              <button onClick={fermerComposer} aria-label="Retour" className="communaute-pro-composer-back tap" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: C.t1, cursor: "pointer", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18 9 12l6-6" /></svg>
              </button>
              <h3 style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: 0, flex: 1, minWidth: 0 }}>Nouvelle publication</h3>
              <button onClick={fermerComposer} aria-label="Fermer" className="communaute-pro-composer-close-x tap" style={{ display: "none", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <p style={{ color: C.t2, fontSize: "12.5px", margin: "2px 0 18px" }}>Partagez quelque chose avec la communauté Yelen</p>

            <textarea
              autoFocus
              value={texte}
              onChange={e => setTexte(e.target.value)}
              placeholder="Que souhaitez-vous partager ?"
              style={{ width: "100%", minHeight: "120px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", color: C.t1, fontSize: "14px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: "22px" }}
            />

            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>Média</div>
            {fichiers.length > 0 && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                {fichiers.map((f, i) => (
                  <div key={i} style={{ position: "relative", width: "72px", height: "72px", borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                    {/* IMG-EXCEPTION: reason=URL.createObjectURL(f) génère un blob: local, non fetchable par l'optimiseur next/image | reviewed=2026-08-22 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(f)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => setFichiers(prev => prev.filter((_, idx) => idx !== i))} aria-label="Retirer" className="tap" style={{ position: "absolute", top: "3px", right: "3px", width: "20px", height: "20px", borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={e => choisirFichiers(e.target.files)} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={fichiers.length >= MAX_IMAGES}
              className="tap"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", boxSizing: "border-box", backgroundColor: C.bg3, border: `1px dashed ${C.border2}`, borderRadius: "12px", padding: "13px 14px", color: C.t2, fontSize: "12.5px", fontWeight: 700, cursor: fichiers.length >= MAX_IMAGES ? "default" : "pointer", opacity: fichiers.length >= MAX_IMAGES ? 0.5 : 1, marginBottom: "24px" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Ajouter une image ({fichiers.length}/{MAX_IMAGES})
            </button>

            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>
              Catégorie {!categorie && <span style={{ color: C.red, fontWeight: 700 }}>· requise</span>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "24px" }}>
              {CATEGORIES_INSTITUTION.map(cat => {
                const actif = categorie === cat;
                const couleur = POST_CATEGORIE_COULEURS[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setCategorie(cat)}
                    className="tap"
                    style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: actif ? `${couleur}14` : C.bg3, border: `1px solid ${actif ? couleur : C.border}`, borderRadius: "999px", padding: "9px 16px", cursor: "pointer" }}
                  >
                    {actif && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>}
                    <span style={{ color: actif ? couleur : C.t1, fontSize: "12.5px", fontWeight: actif ? 800 : 700, whiteSpace: "nowrap" }}>{POST_CATEGORIE_LABELS[cat]}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, margin: "0 0 16px" }} />
            <div style={{ display: "flex", gap: "10px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={fermerComposer}>Annuler</Button>
              <Button
                tokens={toUiTokens(C)}
                className="tap"
                variant="primary"
                size="md"
                style={{ flex: 1 }}
                disabled={!peutPublier}
                loading={saving}
                onClick={handlePublier}
              >
                Publier
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sous-vues Community Pro ────────────────────────────────────────────
// Tuile KPI et stub honnête "Bientôt disponible" — même spec visuelle que
// KpiCard/PerformancesStub de CentreAnalyseTab.tsx (aucun composant
// partagé n'existe dans le dashboard pour ça, chaque onglet réimplémente
// sa propre tuile — on suit la même convention plutôt que d'importer un
// composant d'un autre onglet).
function HubKpiCard({ label, icon, color, value, sub, C }: { label: string; icon: React.ReactNode; color: string; value: string; sub?: string; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="14px" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "26px", height: "26px", borderRadius: "8px", backgroundColor: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ color: C.t1, fontSize: "20px", fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <span style={{ color: C.t3, fontSize: "10px" }}>{sub ?? "Pas de comparaison disponible"}</span>
    </Card>
  );
}

const HUB_ICONS = {
  publications: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="7" y1="9" x2="17" y2="9" /><line x1="7" y1="13" x2="17" y2="13" /></svg>,
  attente: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
  coeur: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>,
  commentaire: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  partage: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>,
  abonnes: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></svg>,
  abonnesPerdus: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="16" y1="11" x2="22" y2="11" /></svg>,
  impressions: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>,
  vue: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="1" fill={color} /></svg>,
  portee: (color: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" /></svg>,
};

// Vue d'ensemble — KPI réels agrégés depuis les posts déjà chargés (aucune
// nouvelle requête). "Ce qui fonctionne" dérivé par règles déterministes
// (zéro LLM, même discipline que lib/postSuggestions.ts), affiché
// seulement au-delà d'un échantillon minimal fiable (≥3 publiées pour la
// meilleure catégorie, ≥3 avec/sans image pour la comparaison média) —
// jamais un constat sur un échantillon trop faible, même principe que le
// "délai moyen observé" des favoris citoyen.
function VueEnsembleView({ C, posts, audience, canPublish, onCreer, onVoirPublications }: {
  C: ThemeTokens; posts: PostInstitution[]; audience: AudienceData | null; canPublish: boolean; onCreer: () => void; onVoirPublications: () => void;
}) {
  const publiees = posts.filter(p => p.statut === "publiee");
  const nbEnAttente = posts.filter(p => p.statut === "en_attente_validation").length;
  const nbRefusees = posts.filter(p => p.statut === "refusee").length;
  const totalPartages = posts.reduce((s, p) => s + p.nb_partages, 0);
  const totalLikes = posts.reduce((s, p) => s + p.nb_likes, 0);
  const totalCommentaires = posts.reduce((s, p) => s + p.nb_commentaires, 0);

  const engagement = (p: PostInstitution) => p.nb_likes + p.nb_commentaires + p.nb_partages;
  let topCategorieLabel: string | null = null;
  if (publiees.length >= 3) {
    const parCategorie = new Map<string, number>();
    for (const p of publiees) parCategorie.set(p.categorie, (parCategorie.get(p.categorie) ?? 0) + engagement(p));
    const meilleure = [...parCategorie.entries()].sort((a, b) => b[1] - a[1])[0];
    if (meilleure && meilleure[1] > 0) topCategorieLabel = POST_CATEGORIE_LABELS[meilleure[0] as PostCategorie] ?? meilleure[0];
  }
  const avecImage = publiees.filter(p => (p.images?.length ?? 0) > 0);
  const sansImage = publiees.filter(p => (p.images?.length ?? 0) === 0);
  let imageGagne = false;
  if (avecImage.length >= 3 && sansImage.length >= 3) {
    const moyenne = (arr: PostInstitution[]) => arr.reduce((s, p) => s + engagement(p), 0) / arr.length;
    imageGagne = moyenne(avecImage) > moyenne(sansImage);
  }
  const insights: string[] = [];
  if (topCategorieLabel) insights.push(`Vos publications « ${topCategorieLabel} » génèrent le plus d'interactions.`);
  if (imageGagne) insights.push("Les publications avec image reçoivent en moyenne plus d'interactions.");

  // État vide (23/08/2026, retour Bryan) — rien n'a encore été créé,
  // jamais un dashboard de tuiles à zéro. "Créer une publication" est le
  // seul geste utile à ce stade, donc le seul mis en avant.
  if (posts.length === 0) {
    return (
      <CommunityEmptyScreen
        C={C}
        illustration={<IllustrationChaineDemarre color={C.gold} />}
        titre="Votre chaîne commence ici"
        texte="Votre espace Community Pro est prêt. Publiez votre première actualité pour présenter votre activité et commencer à construire votre audience sur Yelen. Les données d'audience et de performance apparaîtront avec votre activité."
        cta={canPublish ? { label: "Créer une publication", onClick: onCreer } : undefined}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>Votre présence en un coup d&apos;œil</div>
        {canPublish && (
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={onCreer}>
            + Nouvelle publication
          </Button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px", marginBottom: "24px" }}>
        <HubKpiCard
          C={C} label="ABONNÉS" icon={HUB_ICONS.abonnes(C.gold)} color={C.gold}
          value={audience ? audience.nb_abonnes.toLocaleString("fr-FR") : "—"}
          sub={audience ? `+${audience.nouveaux_ce_mois} ce mois` : undefined}
        />
        <HubKpiCard C={C} label="PUBLICATIONS PUBLIÉES" icon={HUB_ICONS.publications(C.green)} color={C.green} value={String(publiees.length)} />
        <HubKpiCard C={C} label="EN ATTENTE" icon={HUB_ICONS.attente(C.gold)} color={C.gold} value={String(nbEnAttente)} />
        <HubKpiCard C={C} label="J'AIME" icon={HUB_ICONS.coeur(C.red)} color={C.red} value={totalLikes.toLocaleString("fr-FR")} />
        <HubKpiCard C={C} label="COMMENTAIRES" icon={HUB_ICONS.commentaire(C.blue)} color={C.blue} value={totalCommentaires.toLocaleString("fr-FR")} />
        <HubKpiCard C={C} label="PARTAGES" icon={HUB_ICONS.partage(C.teal)} color={C.teal} value={totalPartages.toLocaleString("fr-FR")} />
      </div>

      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>Ce qui fonctionne</div>
      {insights.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
          {insights.map((texte, i) => (
            <Card key={i} tokens={toCardTokens(C)} padding="12px 14px" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
              <span style={{ color: C.t1, fontSize: "12.5px", lineHeight: 1.5 }}>{texte}</span>
            </Card>
          ))}
        </div>
      ) : (
        <Card tokens={toCardTokens(C)} padding="16px" style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, marginBottom: "20px" }}>
          Publiez encore quelques contenus pour débloquer des tendances sur ce qui fonctionne le mieux auprès des citoyens Yelen.
        </Card>
      )}

      {nbRefusees > 0 && (
        <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "16px" }}>{nbRefusees} publication{nbRefusees > 1 ? "s" : ""} refusée{nbRefusees > 1 ? "s" : ""} — consultez le motif dans Publications.</div>
      )}

      <button onClick={onVoirPublications} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, color: C.gold, fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}>
        Voir toutes les publications
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>
  );
}

// Pastille de statut discrète — point coloré + texte, jamais un gros
// rectangle plein (23/08/2026, retour Bryan : centre de gestion de
// contenu, pas un feed). La catégorie garde sa pilule colorée (reste
// identifiable), seul le statut passe en style plat.
function StatutDot({ C, statut }: { C: ThemeTokens; statut: PostInstitution["statut"] }) {
  const cfg = STATUT_CFG(C)[statut];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: cfg.color, fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// Vignette de publication — taille contrôlée par le CSS de la carte
// (.communaute-pro-pub-thumb), jamais l'image qui dicte la hauteur de la
// carte (23/08/2026, retour Bryan, correction du problème visible sur le
// screenshot d'origine). Sans image : pastille catégorie en repli, jamais
// une case vide. Avec plusieurs images : la première + un badge "+N",
// jamais une pile de vignettes énormes.
function PubThumb({ C, images, categorie }: { C: ThemeTokens; images: string[]; categorie: string }) {
  const couleurCat = POST_CATEGORIE_COULEURS[categorie as PostCategorie];
  if (images.length === 0) {
    return (
      <div className="communaute-pro-pub-thumb" style={{ borderRadius: "12px", background: couleurCat ? `${couleurCat}14` : C.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <CategorieBadge categorie={categorie} taille={32} />
      </div>
    );
  }
  return (
    <div className="communaute-pro-pub-thumb" style={{ position: "relative", borderRadius: "12px", overflow: "hidden", background: C.bg3, flexShrink: 0 }}>
      <Image src={images[0]} alt="" fill sizes="(max-width: 1024px) 100vw, 160px" style={{ objectFit: "cover" }} />
      {images.length > 1 && (
        <div style={{ position: "absolute", bottom: "6px", right: "6px", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "10.5px", fontWeight: 800, padding: "2px 7px", borderRadius: "20px" }}>
          +{images.length - 1}
        </div>
      )}
    </div>
  );
}

const STATUT_TABS: { key: "toutes" | PostInstitution["statut"]; label: string }[] = [
  { key: "toutes", label: "Toutes" },
  { key: "publiee", label: "Publiées" },
  { key: "en_attente_validation", label: "En attente" },
  { key: "refusee", label: "Refusées" },
];

const DATE_FILTRES: { key: "toutes" | "7j" | "30j" | "annee"; label: string }[] = [
  { key: "toutes", label: "Toutes les dates" },
  { key: "7j", label: "7 derniers jours" },
  { key: "30j", label: "30 derniers jours" },
  { key: "annee", label: "Cette année" },
];

function debutPeriode(filtre: "7j" | "30j" | "annee"): Date {
  const d = new Date();
  if (filtre === "7j") d.setDate(d.getDate() - 7);
  else if (filtre === "30j") d.setDate(d.getDate() - 30);
  else { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
  return d;
}

// Publications — centre de gestion du contenu de l'établissement
// (23/08/2026, refonte complète, retour Bryan : "voici toute ma présence
// éditoriale Yelen", pas "voici mon post"). Statuts réels uniquement
// (STATUT_TABS ci-dessus, aucun "Brouillon"/"Programmée"/"Archivée"
// inventé — le backend n'a que en_attente_validation/publiee/refusee).
// Recherche/filtres 100% client (posts déjà tous chargés), aucun nouvel
// appel réseau. Actions réelles uniquement : "Voir la publication" ouvre
// un aperçu lecture seule (PublicationDetailOverlay) — pas de menu
// "•••" Modifier/Dupliquer/Archiver/Supprimer, ces actions n'existent
// pas dans le métier actuel (pas de route d'édition/suppression/
// duplication de post institution) et ne doivent pas être inventées.
function PublicationsFeedView({ C, instName, posts, canPublish, onCreer }: {
  C: ThemeTokens; instName?: string; posts: PostInstitution[]; canPublish: boolean; onCreer: () => void;
}) {
  const [statutFiltre, setStatutFiltre] = useState<"toutes" | PostInstitution["statut"]>("toutes");
  const [recherche, setRecherche] = useState("");
  const [categorieFiltre, setCategorieFiltre] = useState<string>("toutes");
  const [dateFiltre, setDateFiltre] = useState<"toutes" | "7j" | "30j" | "annee">("toutes");
  const [detailPost, setDetailPost] = useState<PostInstitution | null>(null);

  const filtresActifs = statutFiltre !== "toutes" || recherche.trim() !== "" || categorieFiltre !== "toutes" || dateFiltre !== "toutes";
  const reinitialiser = () => { setStatutFiltre("toutes"); setRecherche(""); setCategorieFiltre("toutes"); setDateFiltre("toutes"); };

  const postsFiltres = posts.filter(p => {
    if (statutFiltre !== "toutes" && p.statut !== statutFiltre) return false;
    if (categorieFiltre !== "toutes" && p.categorie !== categorieFiltre) return false;
    if (dateFiltre !== "toutes" && new Date(p.created_at) < debutPeriode(dateFiltre)) return false;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      const labelCat = (POST_CATEGORIE_LABELS[p.categorie as PostCategorie] ?? "").toLowerCase();
      if (!(p.contenu ?? "").toLowerCase().includes(q) && !labelCat.includes(q)) return false;
    }
    return true;
  });

  if (posts.length === 0) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>Publications</div>
            <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5 }}>Gérez les contenus publiés par votre établissement sur Yelen Community.</div>
          </div>
        </div>
        <Card tokens={toCardTokens(C)} padding="12px">
          <CommunityEmptyScreen
            C={C}
            illustration={<CommunauteProEmptyIllustration color={C.gold} />}
            titre="Vos publications commencent ici"
            texte="Votre espace Community Pro est prêt. Publiez votre première actualité pour commencer à construire votre présence sur Yelen."
            cta={canPublish ? { label: "Créer une publication", onClick: onCreer } : undefined}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        .communaute-pro-pub-card{display:flex;flex-direction:column;gap:12px}
        .communaute-pro-pub-thumb{width:100%;aspect-ratio:16/9}
        .communaute-pro-pub-filters{display:flex;flex-direction:column;gap:8px}
        @media(min-width:1024px){
          .communaute-pro-pub-card{flex-direction:row;align-items:flex-start;gap:16px}
          .communaute-pro-pub-thumb{width:160px;aspect-ratio:4/3;flex-shrink:0}
          .communaute-pro-pub-filters{flex-direction:row;align-items:center}
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>Publications</div>
          <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5, maxWidth: "460px" }}>Gérez les contenus publiés par votre établissement sur Yelen Community.</div>
        </div>
        {canPublish && (
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" style={{ flexShrink: 0 }} onClick={onCreer}>
            + Nouvelle publication
          </Button>
        )}
      </div>

      <div className="communaute-pro-subnav" style={{ marginBottom: "14px" }}>
        {STATUT_TABS.map(tab => {
          const count = tab.key === "toutes" ? posts.length : posts.filter(p => p.statut === tab.key).length;
          const actif = statutFiltre === tab.key;
          return (
            <button key={tab.key} onClick={() => setStatutFiltre(tab.key)} className="tap" style={{ flexShrink: 0, background: actif ? C.gold : C.bgCard, border: `1px solid ${actif ? C.gold : C.border}`, borderRadius: "20px", padding: "8px 14px", color: actif ? "#080812" : C.t2, fontSize: "12px", fontWeight: actif ? 800 : 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="communaute-pro-pub-filters" style={{ marginBottom: "18px", gap: "8px" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher une publication…"
            style={{ width: "100%", boxSizing: "border-box", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px 10px 34px", color: C.t1, fontSize: "12.5px", fontFamily: "inherit" }}
          />
        </div>
        <select value={categorieFiltre} onChange={e => setCategorieFiltre(e.target.value)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          <option value="toutes">Toutes les catégories</option>
          {CATEGORIES_INSTITUTION.map(cat => <option key={cat} value={cat}>{POST_CATEGORIE_LABELS[cat]}</option>)}
        </select>
        <select value={dateFiltre} onChange={e => setDateFiltre(e.target.value as typeof dateFiltre)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          {DATE_FILTRES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <span style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>Publications récentes</span>
        <span style={{ color: C.t3, fontSize: "11.5px" }}>{postsFiltres.length} publication{postsFiltres.length !== 1 ? "s" : ""}</span>
      </div>

      {postsFiltres.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="40px 24px" style={{ textAlign: "center" }}>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "6px" }}>Aucun résultat</div>
          <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: "0 auto 18px", maxWidth: "320px" }}>Aucune publication ne correspond à votre recherche{filtresActifs ? " ou à vos filtres" : ""}.</p>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={reinitialiser}>
            Réinitialiser les filtres
          </Button>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {postsFiltres.map(p => {
            const label = POST_CATEGORIE_LABELS[p.categorie as PostCategorie] || p.categorie;
            const couleurCat = POST_CATEGORIE_COULEURS[p.categorie as PostCategorie];
            const images = p.images ?? [];
            const lignes = (p.contenu ?? "").split("\n").filter(Boolean);
            const titreLigne = lignes[0] ?? null;
            const resteTexte = lignes.slice(1).join(" ").trim();
            return (
              <Card key={p.id} tokens={toCardTokens(C)} padding="14px" className="communaute-pro-pub-card">
                <PubThumb C={C} images={images} categorie={p.categorie} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {couleurCat && <span style={{ background: `${couleurCat}18`, color: couleurCat, fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px" }}>{label}</span>}
                      <StatutDot C={C} statut={p.statut} />
                    </div>
                    <span style={{ color: C.t3, fontSize: "11px", flexShrink: 0 }}>{fmt(p.created_at)}</span>
                  </div>

                  <div style={{ color: C.t2, fontSize: "11.5px" }}>{instName || "Votre établissement"}</div>

                  {titreLigne && (
                    <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {titreLigne.length > 70 ? titreLigne.slice(0, 70).trimEnd() + "…" : titreLigne}
                    </div>
                  )}
                  {resteTexte && (
                    <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {resteTexte.length > 100 ? resteTexte.slice(0, 100).trimEnd() + "…" : resteTexte}
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: C.t3, fontSize: "11.5px", fontWeight: 700 }}>{HUB_ICONS.vue(C.t3)}{p.nb_vues}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: C.t3, fontSize: "11.5px", fontWeight: 700 }}>{HUB_ICONS.coeur(C.t3)}{p.nb_likes}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: C.t3, fontSize: "11.5px", fontWeight: 700 }}>{HUB_ICONS.commentaire(C.t3)}{p.nb_commentaires}</span>
                  </div>

                  {p.statut === "refusee" && p.motif_refus && (
                    <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "8px 10px" }}>
                      <p style={{ color: C.red, fontSize: "11px", margin: 0 }}><strong>Motif du refus :</strong> {p.motif_refus}</p>
                    </div>
                  )}

                  <button onClick={() => setDetailPost(p)} className="tap" style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.gold, fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
                    Voir la publication
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {detailPost && (
        <PublicationDetailOverlay C={C} instName={instName} post={detailPost} onClose={() => setDetailPost(null)} />
      )}
    </div>
  );
}

// Aperçu lecture seule d'une publication — ouvert depuis "Voir la
// publication" (23/08/2026). Contenu non tronqué, toutes les images,
// indicateurs réels déjà chargés — aucun nouvel appel réseau, aucune
// action au-delà de fermer (pas de Modifier/Dupliquer/Archiver/Supprimer,
// ces fonctionnalités n'existent pas dans le métier actuel).
function PublicationDetailOverlay({ C, instName, post, onClose }: { C: ThemeTokens; instName?: string; post: PostInstitution; onClose: () => void }) {
  const label = POST_CATEGORIE_LABELS[post.categorie as PostCategorie] || post.categorie;
  const couleurCat = POST_CATEGORIE_COULEURS[post.categorie as PostCategorie];
  const images = post.images ?? [];
  return (
    <div className="communaute-pro-pubdetail-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <style>{`
        @media(min-width:1024px){
          .communaute-pro-pubdetail-overlay{align-items:center!important}
          .communaute-pro-pubdetail-panel{max-width:600px!important;border-radius:20px!important;max-height:88svh!important}
          .communaute-pro-pubdetail-grip{display:none!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="communaute-pro-pubdetail-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "18px 20px 24px", width: "100%", maxWidth: "600px", maxHeight: "92svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
        <div className="communaute-pro-pubdetail-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 16px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
          {couleurCat && <span style={{ background: `${couleurCat}18`, color: couleurCat, fontSize: "10.5px", fontWeight: 800, padding: "4px 10px", borderRadius: "20px" }}>{label}</span>}
          <StatutDot C={C} statut={post.statut} />
          <span style={{ marginLeft: "auto", color: C.t3, fontSize: "11.5px" }}>{fmt(post.created_at)}</span>
        </div>

        <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "12px" }}>{instName || "Votre établissement"}</div>

        {post.contenu && (
          <p style={{ color: C.t1, fontSize: "13.5px", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: `0 0 ${images.length > 0 ? "14px" : "18px"}` }}>{post.contenu}</p>
        )}

        {images.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
            {images.map((url, i) => (
              <div key={i} style={{ position: "relative", width: "100%", borderRadius: "12px", overflow: "hidden", background: C.bg3 }}>
                <Image src={url} alt="" width={800} height={600} style={{ width: "100%", height: "auto", display: "block" }} />
              </div>
            ))}
          </div>
        )}

        {post.statut === "refusee" && post.motif_refus && (
          <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "10px 12px", marginBottom: "18px" }}>
            <p style={{ color: C.red, fontSize: "11.5px", margin: 0 }}><strong>Motif du refus :</strong> {post.motif_refus}</p>
          </div>
        )}

        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Performance</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: "8px", marginBottom: post.nb_impressions > 0 ? "8px" : "20px" }}>
          <PerfMetric C={C} label="Impressions" value={post.nb_impressions} />
          <PerfMetric C={C} label="Vues" value={post.nb_vues} />
          <PerfMetric C={C} label="Portée" value={post.nb_portee} />
          <PerfMetric C={C} label="J'aime" value={post.nb_likes} />
          <PerfMetric C={C} label="Commentaires" value={post.nb_commentaires} />
          <PerfMetric C={C} label="Partages" value={post.nb_partages} />
        </div>
        {post.nb_impressions > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <span style={{ color: C.t2, fontSize: "11.5px" }}>Taux d&apos;engagement : </span>
            <span style={{ color: C.t1, fontSize: "11.5px", fontWeight: 800 }}>
              {(((post.nb_likes + post.nb_commentaires + post.nb_partages) / post.nb_impressions) * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </span>
          </div>
        )}

        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}

function PerfMetric({ C, label, value }: { C: ThemeTokens; label: string; value: number }) {
  return (
    <div style={{ textAlign: "center", minWidth: "44px" }}>
      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>{value}</div>
      <div style={{ color: C.t3, fontSize: "9.5px" }}>{label}</div>
    </div>
  );
}

// Mini-bloc métrique encadré — registre visuel Performance, distinct des
// lignes texte de Publications (23/08/2026, retour Bryan : "la donnée est
// prioritaire"). `sub` porte soit le taux d'engagement, soit la
// performance relative vs moyenne — jamais les deux sur la même tuile.
function PerfTile({ C, label, value, sub, subColor }: { C: ThemeTokens; label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", padding: "8px 10px", textAlign: "center" }}>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      <div style={{ color: C.t3, fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
      {sub && <div style={{ color: subColor ?? C.t3, fontSize: "9.5px", fontWeight: 700, marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

function engagementDe(p: PostInstitution) { return p.nb_likes + p.nb_commentaires + p.nb_partages; }

const TRI_OPTIONS: { key: "engagement" | "impressions" | "vues" | "portee" | "recent"; label: string }[] = [
  { key: "engagement", label: "Plus performantes" },
  { key: "impressions", label: "Plus d'impressions" },
  { key: "vues", label: "Plus de vues" },
  { key: "portee", label: "Plus de portée" },
  { key: "recent", label: "Plus récentes" },
];

// Performance — centre de lecture de la performance éditoriale
// (23/08/2026, refonte complète, retour Bryan : "Performance sert à
// comprendre ce qui fonctionne", pas à gérer le contenu — jamais la
// grosse carte de Publications ici). Métriques 100% réelles
// (impressions/vues/portée par post, voir communaute-posts/route.ts) ;
// taux d'engagement et performance relative sont de simples calculs sur
// ces nombres réels (jamais une nouvelle table). Pas de sélecteur de
// période : aucune table ne stocke d'historique quotidien aujourd'hui, un
// sélecteur qui ne filtrerait rien serait un faux bouton.
function PerformanceView({ C, instName, posts, performance, canPublish, onCreer }: {
  C: ThemeTokens; instName?: string; posts: PostInstitution[]; performance: PerformanceData | null; canPublish: boolean; onCreer: () => void;
}) {
  const [tri, setTri] = useState<(typeof TRI_OPTIONS)[number]["key"]>("engagement");
  const [detailPost, setDetailPost] = useState<PostInstitution | null>(null);

  const publieesBrutes = posts.filter(p => p.statut === "publiee");

  // État vide (23/08/2026, retour Bryan) — jamais de tuiles Impressions/
  // Vues/Portée à zéro tant qu'il n'y a rien à mesurer : aucune publication
  // publiée = rien à afficher du tout, pas un dashboard de zéros.
  if (publieesBrutes.length === 0) {
    return (
      <CommunityEmptyScreen
        C={C}
        illustration={<IllustrationPerformance color={C.purple} />}
        titre="Pas encore de publications"
        texte="Publiez votre premier contenu pour commencer à mesurer votre présence sur Yelen Community."
        cta={canPublish ? { label: "Créer une publication", onClick: onCreer } : undefined}
      />
    );
  }

  const publiees = publieesBrutes.slice().sort((a, b) => {
    if (tri === "impressions") return b.nb_impressions - a.nb_impressions;
    if (tri === "vues") return b.nb_vues - a.nb_vues;
    if (tri === "portee") return b.nb_portee - a.nb_portee;
    if (tri === "recent") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return engagementDe(b) - engagementDe(a);
  });

  // Performance relative — seulement à partir de 3 publications avec des
  // impressions réelles, jamais un constat sur un échantillon trop faible
  // (même seuil que "Ce qui fonctionne" en Vue d'ensemble).
  const avecImpressions = publieesBrutes.filter(p => p.nb_impressions > 0);
  const moyenneImpressions = avecImpressions.length >= 3
    ? avecImpressions.reduce((s, p) => s + p.nb_impressions, 0) / avecImpressions.length
    : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>Performance de vos publications</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: C.t3, fontSize: "11.5px" }}>Trier par</span>
          <select value={tri} onChange={e => setTri(e.target.value as typeof tri)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "8px 12px", color: C.t1, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            {TRI_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px", marginBottom: "20px" }}>
        <HubKpiCard C={C} label="IMPRESSIONS" icon={HUB_ICONS.impressions(C.blue)} color={C.blue} value={performance ? performance.impressions_total.toLocaleString("fr-FR") : "—"} sub="Post présent dans le fil" />
        <HubKpiCard C={C} label="VUES" icon={HUB_ICONS.vue(C.purple)} color={C.purple} value={performance ? performance.vues_total.toLocaleString("fr-FR") : "—"} sub="Post ouvert en détail" />
        <HubKpiCard C={C} label="PORTÉE" icon={HUB_ICONS.portee(C.teal)} color={C.teal} value={performance ? performance.portee.toLocaleString("fr-FR") : "—"} sub="Citoyens distincts touchés" />
      </div>

      <style>{`
        .communaute-pro-perf-row{display:flex;flex-direction:column;gap:12px}
        .communaute-pro-perf-thumb{width:100%;aspect-ratio:16/9}
        .communaute-pro-perf-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
        @media(min-width:1024px){
          .communaute-pro-perf-row{flex-direction:row;align-items:flex-start;gap:16px}
          .communaute-pro-perf-thumb{width:120px;aspect-ratio:16/9;flex-shrink:0}
          .communaute-pro-perf-metrics{grid-template-columns:repeat(4,minmax(80px,110px))}
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {publiees.map(p => {
          const label = POST_CATEGORIE_LABELS[p.categorie as PostCategorie] || p.categorie;
          const couleurCat = POST_CATEGORIE_COULEURS[p.categorie as PostCategorie];
          const lignes = (p.contenu ?? "").split("\n").filter(Boolean);
          const titreLigne = lignes[0] ?? null;
          const resteTexte = lignes.slice(1).join(" ").trim();
          const engagement = engagementDe(p);
          const aDesDonnees = p.nb_impressions > 0 || p.nb_vues > 0 || p.nb_portee > 0 || engagement > 0;
          const tauxEngagement = p.nb_impressions > 0 ? (engagement / p.nb_impressions) * 100 : null;
          const delta = moyenneImpressions && p.nb_impressions > 0
            ? Math.round(((p.nb_impressions - moyenneImpressions) / moyenneImpressions) * 100)
            : null;

          return (
            <Card key={p.id} tokens={toCardTokens(C)} padding="12px" className="communaute-pro-perf-row">
              <PubThumb C={C} images={p.images ?? []} categorie={p.categorie} />

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {couleurCat && <span style={{ background: `${couleurCat}18`, color: couleurCat, fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px" }}>{label}</span>}
                      <StatutDot C={C} statut={p.statut} />
                    </div>
                    <span style={{ color: C.t3, fontSize: "11px", flexShrink: 0 }}>{fmt(p.created_at)}</span>
                  </div>
                  <div style={{ color: C.t2, fontSize: "11.5px", marginTop: "4px" }}>{instName || "Votre établissement"}</div>
                  {titreLigne && (
                    <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {titreLigne.length > 70 ? titreLigne.slice(0, 70).trimEnd() + "…" : titreLigne}
                    </div>
                  )}
                  {resteTexte && (
                    <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {resteTexte.length > 90 ? resteTexte.slice(0, 90).trimEnd() + "…" : resteTexte}
                    </div>
                  )}
                </div>

                {aDesDonnees ? (
                  <div className="communaute-pro-perf-metrics">
                    <PerfTile
                      C={C} label="Impressions" value={String(p.nb_impressions)}
                      sub={delta !== null ? `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta)}% vs moy.` : undefined}
                      subColor={delta !== null ? (delta >= 0 ? C.green : C.red) : undefined}
                    />
                    <PerfTile C={C} label="Vues" value={String(p.nb_vues)} />
                    <PerfTile C={C} label="Portée" value={String(p.nb_portee)} />
                    <PerfTile
                      C={C} label="Engagement" value={String(engagement)}
                      sub={tauxEngagement !== null ? `${tauxEngagement.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : undefined}
                    />
                  </div>
                ) : (
                  <div style={{ color: C.t3, fontSize: "11.5px" }}>Aucune donnée disponible pour l&apos;instant.</div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => setDetailPost(p)} className="tap" style={{ background: "none", border: "none", padding: 0, color: C.gold, fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
                    Voir les détails →
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {detailPost && (
        <PublicationDetailOverlay C={C} instName={instName} post={detailPost} onClose={() => setDetailPost(null)} />
      )}
    </div>
  );
}

// Audience — Abonnés, Nouveaux abonnés ce mois, Abonnés perdus ce mois ET
// désormais Audience active ce mois, tous réels (Chaîne Yelen, 23/08/2026).
// audience_active_ce_mois est devenue calculable dès que post_vues a
// existé (lot Performance) — citoyens distincts ayant réellement ouvert
// une publication depuis le 1er du mois, plus juste "qui est abonné" mais
// "qui consulte vraiment". Plus aucun stub sur cet onglet.
function AudienceView({ C, audience, canPublish, onCreer }: { C: ThemeTokens; audience: AudienceData | null; canPublish: boolean; onCreer: () => void }) {
  // État vide (23/08/2026, retour Bryan) — aucune fonctionnalité "découvrir
  // comment développer votre présence" n'existe aujourd'hui, donc pas de
  // CTA fabriqué pour ça : la seule action réelle disponible est publier.
  const estVide = audience !== null
    && audience.nb_abonnes === 0
    && audience.nouveaux_ce_mois === 0
    && audience.abonnes_perdus_ce_mois === 0
    && audience.audience_active_ce_mois === 0;
  if (estVide) {
    return (
      <CommunityEmptyScreen
        C={C}
        illustration={<IllustrationAudience color={C.gold} />}
        titre="Votre audience se construit ici"
        texte="Les citoyens peuvent s'abonner à votre chaîne et suivre vos publications. Les premières données apparaîtront dès que votre audience commencera à grandir."
        cta={canPublish ? { label: "Créer une publication", onClick: onCreer } : undefined}
      />
    );
  }

  return (
    <div>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "14px" }}>Audience</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px" }}>
        <HubKpiCard
          C={C} label="ABONNÉS" icon={HUB_ICONS.abonnes(C.gold)} color={C.gold}
          value={audience ? audience.nb_abonnes.toLocaleString("fr-FR") : "—"}
          sub={audience ? `+${audience.nouveaux_ce_mois} ce mois` : undefined}
        />
        <HubKpiCard
          C={C} label="NOUVEAUX ABONNÉS CE MOIS" icon={HUB_ICONS.abonnes(C.green)} color={C.green}
          value={audience ? String(audience.nouveaux_ce_mois) : "—"}
        />
        <HubKpiCard
          C={C} label="ABONNÉS PERDUS CE MOIS" icon={HUB_ICONS.abonnesPerdus(C.red)} color={C.red}
          value={audience ? String(audience.abonnes_perdus_ce_mois) : "—"}
        />
        <HubKpiCard
          C={C} label="AUDIENCE ACTIVE CE MOIS" icon={HUB_ICONS.vue(C.purple)} color={C.purple}
          value={audience ? String(audience.audience_active_ce_mois) : "—"}
          sub="A réellement ouvert une publication"
        />
      </div>
    </div>
  );
}

// Présence — aperçu de ce qu'un citoyen verrait (identité + publications
// publiées uniquement), aucune donnée nouvelle. 2 colonnes ≥1024px
// (aperçu identité + liste), 1 colonne en mobile.
function PresenceView({ C, instName, posts }: { C: ThemeTokens; instName?: string; posts: PostInstitution[] }) {
  const publiees = posts.filter(p => p.statut === "publiee");
  const nom = instName || "Votre établissement";
  return (
    <div className="communaute-pro-presence" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", alignItems: "start" }}>
      <style>{`@media(min-width:1024px){.communaute-pro-presence{grid-template-columns:340px 1fr!important}}`}</style>

      <Card tokens={toCardTokens(C)} padding="20px">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <AvatarInstitution nom={nom} logo={null} taille={52} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nom}</div>
            <div style={{ color: C.t3, fontSize: "11.5px" }}>Présence Yelen Community</div>
          </div>
        </div>
        <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.7 }}>
          C&apos;est ce que voit un citoyen Yelen qui découvre votre établissement dans le fil communautaire : {publiees.length} publication{publiees.length !== 1 ? "s" : ""} visible{publiees.length !== 1 ? "s" : ""}.
        </div>
      </Card>

      <div>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "12px" }}>Publications visibles dans le fil</div>
        {publiees.length === 0 ? (
          <Card tokens={toCardTokens(C)} padding="0">
            <CommunityEmptyScreen
              C={C}
              illustration={<IllustrationPresence color={C.gold} />}
              titre="Présentez votre activité à la communauté Yelen"
              texte="Vos prochaines publications apparaîtront ici dès qu'elles seront validées — c'est ce que verra un citoyen qui découvre votre établissement."
            />
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {publiees.slice(0, 6).map(p => {
              const label = POST_CATEGORIE_LABELS[p.categorie as PostCategorie] || p.categorie;
              const couleurCat = POST_CATEGORIE_COULEURS[p.categorie as PostCategorie];
              const contenu = p.contenu ?? "";
              const apercu = contenu.length > 90 ? contenu.slice(0, 90).trimEnd() + "…" : contenu;
              return (
                <Card key={p.id} tokens={toCardTokens(C)} padding="12px 14px">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    {couleurCat && <span style={{ background: `${couleurCat}18`, color: couleurCat, fontSize: "9.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px" }}>{label}</span>}
                    <span style={{ marginLeft: "auto", color: C.t3, fontSize: "10.5px" }}>{fmt(p.created_at)}</span>
                  </div>
                  {apercu && <div style={{ color: C.t1, fontSize: "12px", lineHeight: 1.5 }}>{apercu}</div>}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
