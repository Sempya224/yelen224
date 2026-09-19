"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader } from "@/components/YelenLoader";

// Yelen Rewards V2 (refonte 22/08/2026, retour Bryan) — remplace la V1
// "hero illustratif" (soleil animé, pastille rose, dégradé plein écran) par
// un ton tableau de bord financier, cohérent avec les cartes Home V2
// (composant VotreArgent, app/page.tsx) : chiffres en avant, or en accent
// seulement, très peu de décoration. L'IA change aussi de fond :
//
// 1. Votre statut — solde + acquis réels (identité/profil), jamais un
//    niveau inventé (Yelen n'a AUCUN système de niveaux aujourd'hui,
//    vérifié explicitement — les "paliers" sont des seuils débloqués une
//    fois pour toutes, pas un statut réévalué en continu façon Dasher
//    Rewards ; ne pas confondre les deux mécaniques).
// 2. Prochain objectif — sa propre carte, plus caché dans la barre du hero.
// 3. Vos avantages — 3 groupes (acquis/proche/verrouillé), et surtout plus
//    jamais le mot "disponible" pour un palier dont le circuit de
//    délivrance n'existe pas réellement (reward_claims existe en base mais
//    AUCUN workflow n'est construit, voir migration 20260726000007) — le
//    mot "Acquis" reste vrai, "à réclamer" précise l'état réel.
// 4. Comment progresser — régénéré depuis reward_rules (via /api/citoyen/
//    rewards::regles), plus jamais une liste statique qui re-périme au
//    prochain lot (trouvé lors de l'audit : "+15 points" restait affiché
//    après le passage à +45 en Lot 4). Chaque ligne montre son plafond
//    anti-abus réel si applicable (demarche_completed, 5/30j).
// 5. Votre activité / Historique — inchangés, déjà corrects.
//
// Langage graphique : ce solde EST fait pour être montré, c'est une
// monnaie gagnée par la valeur réelle créée dans Yelen — jamais le temps
// passé dans l'app. Zéro mécanique de jeu d'argent (pas de compte à
// rebours, pas de classement, pas de son/vibration).

type Palier = {
  code: string;
  seuil_points: number;
  label: string;
  type_recompense: "offre_partenaire" | "badge_symbolique" | "paiement_especes";
  statut_disponibilite: "disponible" | "a_venir";
  debloque: boolean;
  debloque_le: string | null;
};

type Regle = {
  code: string;
  label: string;
  points_delta: number;
  description: string;
  nb_realisations: number;
  derniere_realisation: string | null;
  plafond: { limite: number; jours: number; realise_periode: number; restant: number } | null;
};

type LigneHistorique = {
  id: string;
  points_delta: number;
  raison: string;
  source_type: string;
  rule_code: string | null;
  created_at: string;
};

type Donnees = {
  solde: number;
  gagne_a_vie: number;
  semaine_courante: number;
  semaine_precedente: number;
  paliers: Palier[];
  regles: Regle[];
  historique: LigneHistorique[];
};

const OR = "#F5A623";
const OR_FONCE = "#C8940A";
const INDIGO_MOYEN = "#2B2560";
const ROSE_SOURDE = "#C2685E";
const TEAL = "#0E9488";
const VERT = "#1E8F5F";
const NEAR_UNLOCK_RATIO = 0.7;

const TEINTE_PALIER: Record<Palier["type_recompense"], string> = {
  offre_partenaire: TEAL,
  badge_symbolique: INDIGO_MOYEN,
  paiement_especes: VERT,
};

const TEXTE_PALIER: Record<Palier["type_recompense"], { intro: string; detail: string }> = {
  offre_partenaire: {
    intro: "Des avantages chez des établissements partenaires de Yelen.",
    detail: "Ce palier donne accès à des offres proposées par des partenaires de Yelen. Le circuit de distribution n'est pas encore construit : votre déblocage, une fois atteint, est enregistré définitivement et ne peut jamais être perdu. En attendant, vous pouvez contacter Yelen pour recevoir votre récompense.",
  },
  badge_symbolique: {
    intro: "Une reconnaissance visible de votre engagement sur Yelen.",
    detail: "Le Badge Confiance est une reconnaissance symbolique, sans valeur monétaire. Il signale que vous honorez régulièrement vos rendez-vous et participez activement à l'écosystème Yelen.",
  },
  paiement_especes: {
    intro: "Une récompense en argent réel.",
    detail: "Ce palier débloque 30 000 GNF, un paiement réel. Comme il s'agit d'argent, la réclamation passe par une vérification manuelle avant tout versement — ce circuit n'est pas encore ouvert, mais votre déblocage reste acquis dès que vous atteignez ce palier.",
  },
};

// Texte citoyen par règle — humain et court, jamais le texte technique de
// reward_rules.description (écrit pour la doc/migration, avec chemins de
// fichiers et jargon serveur) qu'affichait par erreur la première version
// de ce popup (retour Bryan 22/08/2026). À compléter si de nouvelles
// règles sont activées un jour.
const TEXTE_REGLE: Record<string, string> = {
  rdv_complete: "Vous vous présentez à votre rendez-vous et votre présence est confirmée sur place. C'est la façon la plus simple de gagner des points sur Yelen.",
  rdv_no_show: "Un rendez-vous manqué, sans annulation ni justification, retire des points. Pensez à annuler à l'avance si vous ne pouvez plus vous y rendre.",
  demarche_completed: "Vous terminez une démarche personnelle que vous avez créée dans Mes démarches. Limité à quelques fois par mois pour rester juste envers tous les citoyens.",
  document_envoye: "Une institution vous demande un document (justificatif, pièce d'identité, etc.) et vous le lui envoyez directement depuis Yelen.",
  profil_complete: "Vous renseignez l'ensemble des informations de votre profil : nom, ville, date de naissance, et le reste. Ce bonus n'est accordé qu'une seule fois.",
  identite_verifiee: "Vous envoyez votre pièce d'identité pour faire vérifier votre compte. C'est la récompense la plus importante de Yelen — elle marque votre engagement le plus fort envers la confiance sur la plateforme.",
};

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function cleDernierVu(userId: string): string {
  return `yelen224_rewards_vu_${userId}`;
}

function formatPoints(n: number): string {
  return Math.abs(n).toLocaleString("fr-FR");
}

function formatDateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Icônes trait, propres à Yelen ───
const Ic = {
  Spark: ({ color = OR }: { color?: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3c.8 4.4 2.8 6.4 7 7-4.2.8-6.2 2.8-7 7-.8-4.2-2.8-6.2-7-7 4.2-.6 6.2-2.6 7-7z" fill={color}/>
    </svg>
  ),
  Absence: ({ color = ROSE_SOURDE }: { color?: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M9 12h6"/></svg>
  ),
  CheckRay: ({ color = OR }: { color?: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="m9 12 2 2 4-4"/></svg>
  ),
  Document: ({ color = OR }: { color?: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  ),
  Personne: ({ color = OR }: { color?: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  ),
  Point: ({ color = OR }: { color?: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/></svg>
  ),
  Lock: ({ color = "currentColor" }: { color?: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
  Clock: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  Check: ({ color = OR }: { color?: string }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Chev: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  // Même taille/épaisseur que le chevron retour du header partagé
  // (components/CompteEcranVide.tsx::CompteHeader) — retour Bryan
  // 22/08/2026 : la version précédente (20px/2.6) paraissait petite à côté.
  ChevGauche: () => <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  Headset: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>,
  X: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  // Palier 1500 — "offre partenaire" : une ouverture d'où sort la lumière.
  Ouverture: ({ color }: { color: string }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="4" fill={color} opacity="0.16"/>
      <path d="M8 16 15 8" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M15 8h-4M15 8v4" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  // Palier 2500 — "Badge Confiance" : hexagone + repère central.
  Confiance: ({ color }: { color: string }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" fill="none" stroke={color} strokeWidth="2"/>
      <path d="M12 9c.5 2.2 1.4 3.1 3.6 3.6-2.2.5-3.1 1.4-3.6 3.6-.5-2.2-1.4-3.1-3.6-3.6 2.2-.5 3.1-1.4 3.6-3.6z" fill={color}/>
    </svg>
  ),
  // Palier 5000 — "30 000 GNF" : un lever de lumière au-dessus d'un horizon.
  Horizon: ({ color }: { color: string }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M3 16h18" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      <path d="M7 16a5 5 0 0 1 10 0" fill={color}/>
      <path d="M12 4v3M6.5 7l2 2M17.5 7l-2 2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  // État vide.
  Attente: ({ color = OR }: { color?: string }) => (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
      <circle cx="26" cy="26" r="20" stroke={color} strokeWidth="2" strokeDasharray="3 6" opacity="0.45"/>
      <circle cx="26" cy="26" r="6" fill={color} opacity="0.3"/>
    </svg>
  ),
};

const ICONE_PALIER: Record<Palier["type_recompense"], (p: { color: string }) => React.ReactNode> = {
  offre_partenaire: Ic.Ouverture,
  badge_symbolique: Ic.Confiance,
  paiement_especes: Ic.Horizon,
};

// Icône + destination par règle — mêmes codes que reward_rules.code, seule
// source de vérité pour les montants (voir /api/citoyen/rewards::regles).
const ICONE_REGLE: Record<string, (p: { color: string }) => React.ReactNode> = {
  rdv_complete: Ic.Spark,
  rdv_no_show: Ic.Absence,
  demarche_completed: Ic.CheckRay,
  document_envoye: Ic.Document,
  profil_complete: Ic.Personne,
  identite_verifiee: Ic.Confiance,
};
const LIEN_REGLE: Record<string, string> = {
  rdv_complete: "/recherche",
  rdv_no_show: "/mes-rdv",
  demarche_completed: "/compte/mes-demarches",
  document_envoye: "/compte/documents-telecharges",
  profil_complete: "/compte/informations-personnelles",
  identite_verifiee: "/compte/verification-identite",
};
// Distinction "à réaliser une fois" vs répétable — aucun flag dédié en
// base pour ça (voir audit), donc connue ici par convention plutôt
// qu'inventée côté serveur.
const REGLES_UNIQUES = new Set(["profil_complete", "identite_verifiee"]);

const TEINTE_EVENEMENT: Record<string, string> = {
  rdv_complete: OR,
  rdv_no_show: ROSE_SOURDE,
  demarche_completed: TEAL,
  document_envoye: INDIGO_MOYEN,
  profil_complete: INDIGO_MOYEN,
  identite_verifiee: INDIGO_MOYEN,
};

function teinteEvenement(code: string | null, delta: number): string {
  if (code && TEINTE_EVENEMENT[code]) return TEINTE_EVENEMENT[code];
  return delta < 0 ? ROSE_SOURDE : OR;
}

function iconeEvenement(code: string | null, delta: number): React.ReactNode {
  if (code && ICONE_REGLE[code]) { const I = ICONE_REGLE[code]; return <I color={teinteEvenement(code, delta)}/>; }
  if (delta < 0) return <Ic.Absence/>;
  return <Ic.Point/>;
}

export function RecompensesClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [loading, setLoading] = useState(true);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState(false);
  const [gainToast, setGainToast] = useState<number | null>(null);
  const [palierDetail, setPalierDetail] = useState<Palier | null>(null);
  const [regleDetail, setRegleDetail] = useState<Regle | null>(null);
  const palierRef = useRef<HTMLDivElement>(null);
  const progresserRef = useRef<HTMLDivElement>(null);

  const charger = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setErreur(true); setLoading(false); return; }
    try {
      const res = await fetch("/api/citoyen/rewards", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const d: Donnees = {
          solde: json.solde, gagne_a_vie: json.gagne_a_vie,
          semaine_courante: json.semaine_courante ?? 0, semaine_precedente: json.semaine_precedente ?? 0,
          paliers: json.paliers, regles: json.regles ?? [], historique: json.historique,
        };
        setDonnees(d);

        if (d.historique.length > 0) {
          const plusRecent = d.historique[0].id;
          let vu: string | null = null;
          try { vu = localStorage.getItem(cleDernierVu(id)); } catch {}
          if (vu && vu !== plusRecent) setGainToast(d.historique[0].points_delta);
          try { localStorage.setItem(cleDernierVu(id), plusRecent); } catch {}
        }
      } else {
        setErreur(true);
      }
    } catch {
      setErreur(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void charger(id);
  }, [router, charger]);

  useEffect(() => {
    if (gainToast === null) return;
    const t = setTimeout(() => setGainToast(null), 4200);
    return () => clearTimeout(t);
  }, [gainToast]);

  const prochainPalier = donnees?.paliers.find((p) => !p.debloque) ?? null;
  const progressionPct = prochainPalier && donnees
    ? Math.min(100, Math.max(0, (donnees.gagne_a_vie / prochainPalier.seuil_points) * 100))
    : 100;

  const semaineDelta = donnees?.semaine_courante ?? 0;
  const semaineComparaison = donnees && donnees.semaine_precedente > 0 && donnees.semaine_courante > donnees.semaine_precedente
    ? "Vous êtes plus actif que la semaine dernière."
    : null;

  const identiteOk = (donnees?.regles.find((r) => r.code === "identite_verifiee")?.nb_realisations ?? 0) > 0;
  const profilOk = (donnees?.regles.find((r) => r.code === "profil_complete")?.nb_realisations ?? 0) > 0;

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        .tap { transition: transform 0.1s, opacity 0.1s; cursor: pointer !important; touch-action: manipulation; }
        .tap:active { opacity: 0.65; transform: scale(0.97); }
        @keyframes yelenToastIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes yelenGlow { 0%,100% { box-shadow: 0 0 0 1.5px ${OR}, 0 0 0 rgba(245,166,35,0) } 50% { box-shadow: 0 0 0 1.5px ${OR}, 0 0 14px rgba(245,166,35,0.3) } }
        @keyframes screenIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) { .yelen-anim, .yelen-anim * { animation: none !important; } }
      `}</style>

      {/* Header sobre — fond neutre, jamais de bandeau doré plein écran
          (retour Bryan 22/08/2026 : "pas pro"). L'or reste réservé aux
          chiffres et accents ponctuels. */}
      <header style={{ position: "sticky", top: 0, zIndex: 5, background: isDark ? "rgba(10,10,15,0.95)" : "rgba(242,242,247,0.95)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <button onClick={() => router.push("/?menu=1")} className="tap" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
            <Ic.ChevGauche/>
          </button>
          <div style={{ color: t1, fontSize: "16px", fontWeight: "800" }}>Yelen Rewards</div>
          <Link href="/faq" className="tap" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, textDecoration: "none" }}>
            <Ic.Headset/>
          </Link>
        </div>
      </header>

      {loading ? (
        <div style={{ padding: "60px 0", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={36} color={t1} label="Chargement de vos points…" labelColor={t2}/>
        </div>
      ) : erreur || !donnees ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: t2, fontSize: "14px", fontWeight: "600" }}>Impossible de charger vos points pour le moment.</div>
      ) : (
        <div style={{ padding: "16px" }} className="yelen-anim">
          {gainToast !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: card, border: `1px solid ${OR}`, borderRadius: "14px", padding: "10px 14px", marginBottom: "12px", animation: "yelenToastIn 0.3s ease" }}>
              <Ic.Spark color={OR}/>
              <span style={{ color: t1, fontSize: "13px", fontWeight: "700" }}>Vous venez de gagner {gainToast >= 0 ? `+${gainToast}` : gainToast} point{Math.abs(gainToast) > 1 ? "s" : ""} Yelen</span>
            </div>
          )}

          {/* 1 — VOTRE STATUT — solde en avant, aucun niveau inventé, juste
              les acquis réels (identité/profil) sous forme de puces
              factuelles. Fond tricolore Guinée (retour Bryan 22/08/2026) —
              mêmes couleurs exactes que la bande de Carte Yelen
              (app/compte/carte-yelen/carte-yelen-client.tsx), pas de
              nouvelles valeurs inventées. Le drapeau devient un CADRE plein
              (12px) autour d'un panneau opaque classique — 2e essai : le
              panneau vitré sombre + flou sur des bandes dures produisait un
              rendu boueux/tâché (retour Bryan). Panneau désormais identique
              aux autres cartes de l'écran (fond `card`, texte t1/OR déjà
              éprouvés), zéro transparence sur le drapeau. Uniquement cette
              carte, jamais tout l'écran. */}
          <div style={{ background: "linear-gradient(90deg,#CE1126 33.3%,#FCD20F 33.3% 66.6%,#009A44 66.6%)", borderRadius: "22px", padding: "12px", marginBottom: "14px" }}>
            <div style={{ background: card, borderRadius: "16px", padding: "24px 20px", textAlign: "center" }}>
              <div style={{ color: OR, fontSize: "46px", fontWeight: "900", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatPoints(donnees.solde)}</div>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: "7px" }}>Points Yelen</div>
              <div style={{ marginTop: "12px" }}>
                {semaineDelta !== 0 ? (
                  <span style={{ display: "inline-block", background: OR, color: "#080812", fontSize: "12.5px", fontWeight: "800", padding: "5px 13px", borderRadius: "999px" }}>{semaineDelta > 0 ? `+${semaineDelta}` : semaineDelta} cette semaine</span>
                ) : (
                  <span style={{ color: t2, fontSize: "12.5px", fontWeight: "600" }}>Aucune activité cette semaine</span>
                )}
              </div>
              {(identiteOk || profilOk) && (
                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "16px", flexWrap: "wrap", borderTop: `1px solid ${brd}`, paddingTop: "14px" }}>
                  {identiteOk && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: card2, color: t1, fontSize: "11.5px", fontWeight: "700", padding: "6px 11px", borderRadius: "999px" }}>
                      <Ic.Check/> Identité vérifiée
                    </span>
                  )}
                  {profilOk && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: card2, color: t1, fontSize: "11.5px", fontWeight: "700", padding: "6px 11px", borderRadius: "999px" }}>
                      <Ic.Check/> Profil complet
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {(semaineDelta !== 0 || semaineComparaison) && (
            <div style={{ background: card, borderRadius: "14px", padding: "12px 16px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ flex: 1, minWidth: 0, color: t2, fontSize: "12.5px" }}>{semaineComparaison ?? "Continuez sur cette lancée."}</div>
              <Link href="/menu/recompenses/historique" style={{ color: OR, fontSize: "12px", fontWeight: "700", textDecoration: "none", flexShrink: 0 }}>Voir mon activité →</Link>
            </div>
          )}

          {/* 2 — PROCHAIN OBJECTIF — sa propre carte, plus noyée dans un hero. */}
          {prochainPalier && (
            <div style={{ background: card, borderRadius: "16px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ color: t2, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>Prochain objectif</div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: rgba(TEINTE_PALIER[prochainPalier.type_recompense], 0.14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {(() => { const I = ICONE_PALIER[prochainPalier.type_recompense]; return <I color={TEINTE_PALIER[prochainPalier.type_recompense]}/>; })()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: t1, fontSize: "14.5px", fontWeight: "800" }}>{prochainPalier.label}</div>
                  <div style={{ color: t2, fontSize: "12px", marginTop: "1px" }}>{formatPoints(prochainPalier.seuil_points)} points</div>
                </div>
              </div>
              <div style={{ height: "7px", borderRadius: "4px", background: card2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progressionPct}%`, background: OR, borderRadius: "4px" }}/>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                <div style={{ color: t2, fontSize: "12px", fontWeight: "600" }}>Il vous reste {formatPoints(Math.max(0, prochainPalier.seuil_points - donnees.gagne_a_vie))} points</div>
                <button onClick={() => progresserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="tap" style={{ background: "none", border: "none", color: OR, fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: 0 }}>
                  Comment progresser →
                </button>
              </div>
            </div>
          )}

          {/* 3 — VOS AVANTAGES — 3 groupes, jamais "disponible" pour une
              récompense sans circuit réel de délivrance. */}
          <div ref={palierRef} style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "10px", scrollMarginTop: "20px" }}>Vos avantages</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
            {donnees.paliers.map((p) => {
              const ratio = donnees.gagne_a_vie / p.seuil_points;
              const enPreparation = p.debloque && p.statut_disponibilite === "a_venir";
              const acquisAReclamer = p.debloque && p.statut_disponibilite === "disponible";
              const presDebloque = !p.debloque && ratio >= NEAR_UNLOCK_RATIO;
              const estProchain = !p.debloque && prochainPalier?.code === p.code;
              const teintePalier = TEINTE_PALIER[p.type_recompense];
              const Icone = ICONE_PALIER[p.type_recompense];
              const bordure = p.debloque || presDebloque ? OR : brd;

              return (
                <div
                  key={p.code}
                  onClick={() => setPalierDetail(p)}
                  className={`tap${presDebloque ? " yelen-anim" : ""}`}
                  style={{
                    position: "relative", background: card, border: `1.5px solid ${bordure}`, borderRadius: "16px", padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: "12px",
                    animation: presDebloque ? "yelenGlow 2.6s ease-in-out infinite" : undefined,
                  }}
                >
                  {estProchain && (
                    <span style={{ position: "absolute", top: "-9px", left: "14px", background: OR, color: "#100D06", fontSize: "10px", fontWeight: "800", padding: "2px 9px", borderRadius: "999px" }}>Prochain objectif</span>
                  )}
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: p.debloque || presDebloque ? rgba(OR, 0.12) : rgba(teintePalier, 0.12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {p.debloque ? <Icone color={OR}/> : presDebloque ? <Icone color={OR}/> : <Ic.Lock color={teintePalier}/>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700" }}>{p.label}</div>
                      <span style={{ color: p.debloque ? OR : t2, fontSize: "10.5px", fontWeight: "700" }}>{formatPoints(p.seuil_points)} pts</span>
                    </div>
                    {acquisAReclamer && <div style={{ color: OR, fontSize: "12px", fontWeight: "700", marginTop: "2px" }}>Acquis — à réclamer auprès de Yelen</div>}
                    {enPreparation && <div style={{ color: OR, fontSize: "12px", fontWeight: "700", marginTop: "2px" }}>Acquis — récompense en préparation</div>}
                    {!p.debloque && presDebloque && <div style={{ color: OR, fontSize: "12px", fontWeight: "700", marginTop: "2px" }}>Proche — plus que {formatPoints(Math.max(0, p.seuil_points - donnees.gagne_a_vie))} pts</div>}
                    {!p.debloque && !presDebloque && <div style={{ color: t2, fontSize: "12px", marginTop: "2px" }}>{formatPoints(Math.max(0, p.seuil_points - donnees.gagne_a_vie))} points restants</div>}
                  </div>
                  <span style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></span>
                </div>
              );
            })}
          </div>

          {/* 4 — COMMENT PROGRESSER — régénéré depuis reward_rules, jamais
              une liste figée. */}
          <div ref={progresserRef} style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "10px", scrollMarginTop: "20px" }}>Comment progresser</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
            {donnees.regles.map((r) => {
              const unique = REGLES_UNIQUES.has(r.code);
              const dejaFait = unique && r.nb_realisations > 0;
              const Icone = ICONE_REGLE[r.code] ?? Ic.Point;
              const teinte = teinteEvenement(r.code, r.points_delta);
              const plafondAtteint = !!r.plafond && r.plafond.restant === 0;
              return (
                <div key={r.code} onClick={() => setRegleDetail(r)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", background: card, borderRadius: "14px", padding: "13px 16px", cursor: "pointer" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: rgba(teinte, 0.12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icone color={teinte}/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700" }}>{r.label}</div>
                    <div style={{ color: t2, fontSize: "11.5px", marginTop: "1px" }}>
                      {dejaFait ? "Déjà fait" : r.plafond ? (plafondAtteint ? "Plafond atteint pour cette période" : `${r.plafond.realise_periode}/${r.plafond.limite} ce mois-ci`) : r.nb_realisations > 0 ? `Réalisé ${r.nb_realisations} fois` : "Pas encore réalisé"}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, color: r.points_delta < 0 ? ROSE_SOURDE : OR, fontSize: "13.5px", fontWeight: "800" }}>
                    {r.points_delta >= 0 ? `+${r.points_delta}` : r.points_delta}
                  </div>
                  {dejaFait ? <span style={{ color: OR, flexShrink: 0 }}><Ic.Check color={OR}/></span> : <span style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></span>}
                </div>
              );
            })}
          </div>

          {/* 5 — VOTRE ACTIVITÉ */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ color: t1, fontSize: "15px", fontWeight: "800" }}>Votre activité Yelen</div>
            <Link href="/menu/recompenses/historique" style={{ color: t2, fontSize: "12.5px", fontWeight: "700", display: "flex", alignItems: "center", gap: "2px", textDecoration: "none" }}>
              Voir tout <Ic.Chev/>
            </Link>
          </div>
          {donnees.historique.length === 0 ? (
            <div style={{ background: card, borderRadius: "16px", padding: "32px 20px", textAlign: "center" }}>
              <Ic.Attente/>
              <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700", marginTop: "14px" }}>Rien à afficher pour l&apos;instant</div>
              <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.6, marginTop: "4px", maxWidth: "280px", marginLeft: "auto", marginRight: "auto" }}>
                Vos points apparaîtront ici dès votre première action réelle sur Yelen.
              </div>
            </div>
          ) : (
            <div style={{ background: card, borderRadius: "16px", overflow: "hidden" }}>
              {donnees.historique.slice(0, 5).map((h, i) => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${brd}` }}>
                  <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: rgba(teinteEvenement(h.rule_code, h.points_delta), 0.14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{iconeEvenement(h.rule_code, h.points_delta)}</div>
                  <div style={{ flex: 1, minWidth: 0, color: t1, fontSize: "13px", fontWeight: "600" }}>{h.raison}</div>
                  <div style={{ flexShrink: 0, background: rgba(teinteEvenement(h.rule_code, h.points_delta), 0.14), color: teinteEvenement(h.rule_code, h.points_delta), fontSize: "13px", fontWeight: "800", padding: "4px 10px", borderRadius: "20px" }}>{h.points_delta >= 0 ? `+${h.points_delta}` : h.points_delta}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Popup détail — palier */}
      {palierDetail && donnees && (() => {
        const p = palierDetail;
        const ratio = donnees.gagne_a_vie / p.seuil_points;
        const enPreparation = p.debloque && p.statut_disponibilite === "a_venir";
        const acquisAReclamer = p.debloque && p.statut_disponibilite === "disponible";
        const presDebloque = !p.debloque && ratio >= NEAR_UNLOCK_RATIO;
        const teintePalier = TEINTE_PALIER[p.type_recompense];
        const Icone = ICONE_PALIER[p.type_recompense];
        const texte = TEXTE_PALIER[p.type_recompense];
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(10,10,15,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                <button onClick={() => setPalierDetail(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}><Ic.X/></button>
                <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>{p.label}</div>
                <div/>
              </div>
            </header>

            <div style={{ padding: "24px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "480px", margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
                <div style={{ width: "88px", height: "88px", borderRadius: "24px", background: rgba(p.debloque || presDebloque ? OR : teintePalier, 0.14), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ transform: "scale(2.2)" }}><Icone color={p.debloque || presDebloque ? OR : teintePalier}/></div>
                </div>
              </div>

              <div style={{ textAlign: "center", color: t1, fontSize: "20px", fontWeight: "900", marginBottom: "4px" }}>{p.label}</div>
              <div style={{ textAlign: "center", color: t2, fontSize: "13px", fontWeight: "700", marginBottom: "20px" }}>{formatPoints(p.seuil_points)} points</div>

              <div style={{ background: card, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700", marginBottom: "6px" }}>{texte.intro}</div>
                <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>{texte.detail}</div>
              </div>

              <div style={{ background: card, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
                {acquisAReclamer && <div style={{ color: OR, fontSize: "13px", fontWeight: "800" }}>Acquis — à réclamer auprès de Yelen.</div>}
                {enPreparation && <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>Acquis. La récompense arrive bientôt — contactez Yelen pour la réclamer dès maintenant. Elle reste acquise, elle n&apos;expire pas.</div>}
                {!p.debloque && (
                  <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>
                    Il vous manque <strong style={{ color: t1 }}>{formatPoints(Math.max(0, p.seuil_points - donnees.gagne_a_vie))} points</strong> pour atteindre ce palier.
                  </div>
                )}
                {p.debloque && p.debloque_le && (
                  <div style={{ color: t3, fontSize: "12px", marginTop: "8px" }}>Atteint le {formatDateLongue(p.debloque_le)}.</div>
                )}
              </div>

              <div style={{ color: t3, fontSize: "12px", lineHeight: 1.6, textAlign: "center" }}>
                Ce seuil compte l&apos;ensemble de vos points gagnés depuis toujours — aucune action spécifique n&apos;est exigée en plus, tout point réel y contribue.
              </div>
            </div>
          </div>
        );
      })()}

      {/* Popup détail — règle ("comment progresser") */}
      {regleDetail && (() => {
        const r = regleDetail;
        const unique = REGLES_UNIQUES.has(r.code);
        const dejaFait = unique && r.nb_realisations > 0;
        const Icone = ICONE_REGLE[r.code] ?? Ic.Point;
        const teinte = teinteEvenement(r.code, r.points_delta);
        const lien = LIEN_REGLE[r.code];
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(10,10,15,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                <button onClick={() => setRegleDetail(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}><Ic.X/></button>
                <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>{r.label}</div>
                <div/>
              </div>
            </header>

            <div style={{ padding: "24px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "480px", margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
                <div style={{ width: "88px", height: "88px", borderRadius: "24px", background: rgba(teinte, 0.14), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ transform: "scale(2.2)" }}><Icone color={teinte}/></div>
                </div>
              </div>

              <div style={{ textAlign: "center", color: t1, fontSize: "20px", fontWeight: "900", marginBottom: "4px" }}>{r.label}</div>
              <div style={{ textAlign: "center", color: r.points_delta < 0 ? ROSE_SOURDE : OR, fontSize: "15px", fontWeight: "800", marginBottom: "20px" }}>{r.points_delta >= 0 ? `+${r.points_delta}` : r.points_delta} points</div>

              <div style={{ background: card, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
                <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>{TEXTE_REGLE[r.code] ?? r.description}</div>
              </div>

              <div style={{ background: card, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
                {dejaFait ? (
                  <div style={{ color: OR, fontSize: "13px", fontWeight: "800" }}>Déjà réalisé — cette action ne rapporte qu&apos;une seule fois.</div>
                ) : unique ? (
                  <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>Cette action rapporte des points une seule fois.</div>
                ) : (
                  <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>Réalisé {r.nb_realisations} fois jusqu&apos;ici{r.derniere_realisation ? ` — la dernière fois le ${formatDateLongue(r.derniere_realisation)}` : ""}.</div>
                )}
                {r.plafond && (
                  <div style={{ color: t3, fontSize: "12px", marginTop: "8px" }}>
                    Limité à {r.plafond.limite} fois par {r.plafond.jours} jours — {r.plafond.realise_periode}/{r.plafond.limite} déjà comptabilisées sur la période en cours.
                  </div>
                )}
              </div>

              {lien && !dejaFait && (
                <Link href={lien} className="tap" style={{ display: "block", textAlign: "center", background: OR, color: "#100D06", fontWeight: "800", fontSize: "13.5px", padding: "13px", borderRadius: "14px", textDecoration: "none" }}>
                  {r.code === "rdv_no_show" ? "Voir mes rendez-vous" : "Y aller"}
                </Link>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
