"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLogo } from "@/components/YelenLogo";
import { YelenLoader } from "@/components/YelenLoader";

// Yelen Rewards — refonte visuelle (retour CEO 26/07/2026, ajustée
// plusieurs fois le même jour après retours directs de Bryan) :
// (1) "pas de fond noir sur Yelen" — fond doré Yelen en clair, neutre
//     sombre de l'appli en sombre, jamais de noir dédié ;
// (2) chaque récompense cliquable (popup explicatif), cadenas colorés,
//     palier le plus proche signalé, points sur fonds distincts ;
// (3) header et hero UNIFIÉS en une seule zone continue, même technique
//     que le hero de l'onglet Accueil (app/page.tsx) : un bandeau de
//     couleur UNIE (évite la couture visible entre deux dégradés
//     recalculés sur des hauteurs différentes, cf. commentaire d'origine
//     dans app/page.tsx) surmontant un bloc en dégradé, boutons retour/
//     aide en chips translucides sur l'or — jamais une barre neutre
//     séparée au-dessus d'un bloc doré. Le logo Yelen officiel
//     (components/YelenLogo.tsx) accompagne l'illustration du soleil ;
//     le champ des points vit sur un fond rose dédié pour ressortir.
//
// Langage graphique propriétaire "Yelen = lumière" : un noyau entouré de
// rayons (jamais de cadeau/pièce/trophée générique). Distinct de YelenID
// (identité) et Yelen Trust/Score (jamais un score visible) : ce solde
// EST fait pour être montré, c'est une monnaie gagnée par la valeur
// réelle créée dans Yelen — jamais le temps passé dans l'app. Zéro
// mécanique de jeu d'argent : pas de compte à rebours, pas de classement,
// pas de son/vibration ; la seule "boucle" est le moment de gain (bandeau
// discret) et la tendance hebdomadaire, toutes deux basées sur des
// données réelles, jamais un chiffre inventé.

type Palier = {
  code: string;
  seuil_points: number;
  label: string;
  type_recompense: "offre_partenaire" | "badge_symbolique" | "paiement_especes";
  statut_disponibilite: "disponible" | "a_venir";
  debloque: boolean;
  debloque_le: string | null;
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
  historique: LigneHistorique[];
};

const OR = "#F5A623";
const OR_VIF = "#FFC65C";
const INDIGO_MOYEN = "#2B2560";
const ROSE_SOURDE = "#C2685E";
const TEAL = "#0E9488";
const VERT = "#1E8F5F";
const VIOLET = "#8B5CF6";
const NEAR_UNLOCK_RATIO = 0.7;
const ROSE_CLAIR_BG = "#FCE1E6";
const ROSE_CLAIR_TXT = "#7A2E3A";
const ROSE_SOMBRE_BG = "rgba(226,120,140,0.16)";
const ROSE_SOMBRE_TXT = "#F3B8C4";

// Une couleur propre par type de récompense — y compris pour l'état
// verrouillé (retour Bryan : "donne à chaque cadenas une couleur
// différente"), pas un gris générique uniforme.
const TEINTE_PALIER: Record<Palier["type_recompense"], string> = {
  offre_partenaire: TEAL,
  badge_symbolique: INDIGO_MOYEN,
  paiement_especes: VERT,
};

const TEXTE_PALIER: Record<Palier["type_recompense"], { intro: string; detail: string }> = {
  offre_partenaire: {
    intro: "Des avantages chez des établissements partenaires de Yelen.",
    detail: "Ce palier donnera accès à des offres proposées par des partenaires de Yelen. Le circuit de distribution de ces offres n'est pas encore construit : votre déblocage, une fois atteint, est enregistré définitivement et ne peut jamais être perdu. En attendant, vous pourrez contacter Yelen pour recevoir votre récompense.",
  },
  badge_symbolique: {
    intro: "Une reconnaissance visible de votre engagement sur Yelen.",
    detail: "Le Badge Confiance est une reconnaissance symbolique, sans valeur monétaire. Il signale que vous honorez régulièrement vos rendez-vous et participez activement à l'écosystème Yelen.",
  },
  paiement_especes: {
    intro: "Une récompense en argent réel.",
    detail: "Ce palier débloque 30 000 GNF, un paiement réel. Comme il s'agit d'argent, la réclamation passera par une vérification manuelle avant tout versement — ce circuit n'est pas encore ouvert, mais votre déblocage reste acquis dès que vous atteignez ce palier.",
  },
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

// ─── Illustration Hero — noyau + rayons + particules de lumière ───
// `clair` = affiché sur le fond doré (mode clair) : le noyau doit être
// PLUS clair que le fond pour se détacher (crème, ombre indigo dessous).
// En mode sombre (fond neutre de l'appli), le noyau redevient doré.
function HeroIllustration({ clair }: { clair: boolean }) {
  const rayons = Array.from({ length: 12 }, (_, i) => i * 30);
  const particules = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 60 + 20) * (Math.PI / 180);
    const rDepart = 26;
    const rFin = 54;
    return {
      x: Math.cos(angle) * rDepart,
      y: Math.sin(angle) * rDepart,
      dx: Math.cos(angle) * (rFin - rDepart),
      dy: Math.sin(angle) * (rFin - rDepart),
      delai: i * 0.55,
    };
  });

  const noyauHaut = clair ? "#FFFDF6" : OR_VIF;
  const noyauBas  = clair ? "#FFE9BE" : OR;
  const couleurTrait = clair ? "#FFFDF6" : OR_VIF;

  return (
    <svg width="128" height="128" viewBox="-64 -64 128 128" style={{ display: "block" }}>
      <defs>
        <radialGradient id="yelenOmbre" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={INDIGO_MOYEN} stopOpacity={clair ? 0.25 : 0.5}/>
          <stop offset="100%" stopColor={INDIGO_MOYEN} stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="yelenNoyau" cx="38%" cy="34%" r="65%">
          <stop offset="0%" stopColor={noyauHaut}/>
          <stop offset="100%" stopColor={noyauBas}/>
        </radialGradient>
        <linearGradient id="yelenRayon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={couleurTrait} stopOpacity="0.95"/>
          <stop offset="100%" stopColor={couleurTrait} stopOpacity="0"/>
        </linearGradient>
      </defs>

      <ellipse cx="0" cy="6" rx="36" ry="26" fill="url(#yelenOmbre)"/>

      <g>
        {rayons.map((angle, i) => (
          <line
            key={angle}
            x1="0" y1="-20" x2="0" y2={i % 2 === 0 ? -40 : -32}
            stroke="url(#yelenRayon)" strokeWidth="2.6" strokeLinecap="round"
            transform={`rotate(${angle})`}
            style={{ transformOrigin: "0 0", opacity: 0.85, animation: `yelenRayPulse 3.4s ease-in-out ${(i % 4) * 0.35}s infinite` }}
          />
        ))}
      </g>

      {particules.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y} r="2.3" fill={couleurTrait}
          style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, opacity: 0, animation: `yelenParticuleDerive 3.2s ease-out ${p.delai}s infinite` } as React.CSSProperties}
        />
      ))}

      <circle r="19" fill="url(#yelenNoyau)"/>
    </svg>
  );
}

// ─── Icônes trait, propres à Yelen (jamais de clipart générique) ───
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
  Point: ({ color = OR }: { color?: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/></svg>
  ),
  Lock: ({ color = "currentColor" }: { color?: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
  Clock: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  Chev: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  ChevGauche: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  Headset: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>,
  X: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Montee: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="14" width="3.4" height="6" rx="1" fill={OR}/>
      <rect x="10.3" y="9" width="3.4" height="11" rx="1" fill={OR}/>
      <rect x="16.6" y="4" width="3.4" height="16" rx="1" fill={OR_VIF}/>
    </svg>
  ),
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
  Liste: ({ color = OR }: { color?: string }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="3" stroke={color} strokeWidth="2"/>
      <path d="M8 8h8M8 12h8M8 16h4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Loupe: ({ color = OR }: { color?: string }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth="2"/>
      <path d="M15.5 15.5 20 20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M10.5 8v5M8 10.5h5" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  Portefeuille: ({ color = OR }: { color?: string }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="13" rx="3" stroke={color} strokeWidth="2"/>
      <path d="M3 10h18" stroke={color} strokeWidth="2"/>
      <circle cx="17" cy="14.5" r="1.4" fill={color}/>
    </svg>
  ),
  // État vide — un soleil qui patiente, pas une simple absence.
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

// Une couleur par catégorie d'événement — retour Bryan : "les points, un
// fond différent chacun pour attirer l'œil" — pas juste positif/négatif.
const TEINTE_EVENEMENT: Record<string, string> = {
  rdv_complete: OR,
  rdv_no_show: ROSE_SOURDE,
  demarche_completed: TEAL,
  profil_complete: INDIGO_MOYEN,
  identite_verifiee: INDIGO_MOYEN,
  document_fourni: INDIGO_MOYEN,
  parrainage_active: VIOLET,
};

function teinteEvenement(code: string | null, delta: number): string {
  if (code && TEINTE_EVENEMENT[code]) return TEINTE_EVENEMENT[code];
  return delta < 0 ? ROSE_SOURDE : OR;
}

function iconeEvenement(code: string | null, delta: number): React.ReactNode {
  if (code === "rdv_no_show" || delta < 0) return <Ic.Absence/>;
  if (code === "rdv_complete") return <Ic.Spark/>;
  if (code?.startsWith("demarche")) return <Ic.CheckRay/>;
  return <Ic.Point/>;
}

const CTA_ACTIVITE = [
  { href: "/compte/mes-demarches", titre: "Mes démarches", desc: "Suivez vos démarches personnelles.", icone: <Ic.Liste/> },
  { href: "/recherche", titre: "Trouver un rendez-vous", desc: "Réservez auprès d'une institution pour gagner des points.", icone: <Ic.Loupe/> },
  { href: "/menu/depenses", titre: "Mes dépenses", desc: "Suivez votre activité financière sur Yelen.", icone: <Ic.Portefeuille/> },
];

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

  // Palette du bandeau header+hero unifié — même technique que le hero de
  // l'onglet Accueil (app/page.tsx) : couleur UNIE pour le header (évite
  // la couture visible entre deux dégradés recalculés sur des hauteurs
  // différentes), dégradé complet pour le corps du hero juste en dessous,
  // chips translucides pour les boutons. Mode sombre = neutre de l'appli,
  // jamais de noir dédié (retour Bryan).
  const heroUni      = isDark ? bg : "#F5A623";
  const heroDegrade   = isDark ? card : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
  const heroTexte     = isDark ? t1 : "#100D06";
  const heroTexteDim  = isDark ? t2 : "rgba(16,13,6,0.62)";
  const heroChipBg    = isDark ? card2 : "rgba(0,0,0,0.14)";
  const heroChipIcon  = isDark ? heroTexte : "#fff";
  const heroChipBrd   = isDark ? brd : "rgba(255,255,255,0.18)";
  const roseBg        = isDark ? ROSE_SOMBRE_BG : ROSE_CLAIR_BG;
  const roseTxt       = isDark ? ROSE_SOMBRE_TXT : ROSE_CLAIR_TXT;

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState(false);
  const [gainToast, setGainToast] = useState<number | null>(null);
  const [palierDetail, setPalierDetail] = useState<Palier | null>(null);
  const palierRef = useRef<HTMLDivElement>(null);

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
          paliers: json.paliers, historique: json.historique,
        };
        setDonnees(d);

        // Boucle de gain (retour CEO 26/07/2026) : uniquement si ce n'est
        // pas la toute première visite (sinon tout l'historique existant
        // s'afficherait faussement comme "vient d'être gagné").
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
    setUserId(id);
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

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        .tap { transition: transform 0.1s, opacity 0.1s; cursor: pointer !important; touch-action: manipulation; }
        .tap:active { opacity: 0.65; transform: scale(0.97); }
        @keyframes yelenRayPulse { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        @keyframes yelenParticuleDerive { 0% { transform: translate(0,0); opacity: 0 } 18% { opacity: 1 } 100% { transform: translate(var(--dx),var(--dy)); opacity: 0 } }
        @keyframes yelenToastIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes yelenGlow { 0%,100% { box-shadow: 0 0 0 1.5px ${OR}, 0 0 0 rgba(245,166,35,0) } 50% { box-shadow: 0 0 0 1.5px ${OR}, 0 0 14px rgba(245,166,35,0.35) } }
        @keyframes screenIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) {
          .yelen-anim, .yelen-anim * { animation: none !important; }
        }
      `}</style>

      {/* Header + Hero unifiés — une seule zone continue, même technique
          que app/page.tsx (bandeau uni puis dégradé, jamais deux fonds
          disjoints). */}
      <div style={{ background: heroUni, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <button onClick={() => router.push("/?menu=1")} className="tap" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: heroChipBg, border: `1px solid ${heroChipBrd}`, display: "flex", alignItems: "center", justifyContent: "center", color: heroChipIcon, cursor: "pointer" }}>
            <Ic.ChevGauche/>
          </button>
          <div style={{ color: heroTexte, fontSize: "16px", fontWeight: "800" }}>Yelen Rewards</div>
          <Link href="/faq" className="tap" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: heroChipBg, border: `1px solid ${heroChipBrd}`, display: "flex", alignItems: "center", justifyContent: "center", color: heroChipIcon, textDecoration: "none" }}>
            <Ic.Headset/>
          </Link>
        </div>
      </div>

      <div style={{ background: heroDegrade, padding: "8px 20px 28px" }}>
        {loading ? (
          <div style={{ padding: "40px 0 20px", display: "flex", justifyContent: "center" }}>
            <YelenLoader size={36} color={heroTexte} label="Chargement de vos points…" labelColor={heroTexteDim}/>
          </div>
        ) : erreur || !donnees ? (
          <div style={{ padding: "40px 0 20px", textAlign: "center", color: heroTexteDim, fontSize: "14px", fontWeight: "600" }}>Impossible de charger vos points pour le moment.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "4px" }}>
              <HeroIllustration clair={!isDark}/>
              <YelenLogo size={26} color={heroTexte} strokeWidth={2.2}/>
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginTop: "14px" }}>
              <div style={{ background: roseBg, borderRadius: "20px", padding: "14px 30px", textAlign: "center", minWidth: "190px" }}>
                <div style={{ color: roseTxt, fontSize: "40px", fontWeight: "900", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatPoints(donnees.solde)}</div>
                <div style={{ color: roseTxt, opacity: 0.8, fontSize: "12px", fontWeight: "800", letterSpacing: "0.03em", textTransform: "uppercase", marginTop: "4px" }}>Points Yelen</div>
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: "10px" }}>
              {semaineDelta !== 0 ? (
                <div style={{ color: heroTexte, fontSize: "13px", fontWeight: "700" }}>{semaineDelta > 0 ? `+${semaineDelta}` : semaineDelta} cette semaine</div>
              ) : (
                <div style={{ color: heroTexteDim, fontSize: "12.5px", fontWeight: "600" }}>Aucune activité cette semaine</div>
              )}
            </div>

            {prochainPalier && (
              <div style={{ marginTop: "18px" }}>
                <div style={{ height: "8px", borderRadius: "4px", background: isDark ? card2 : "rgba(16,13,6,0.14)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progressionPct}%`, background: isDark ? `linear-gradient(90deg, ${OR}, ${OR_VIF})` : "#100D06", borderRadius: "4px" }}/>
                </div>
                <div style={{ color: heroTexteDim, fontSize: "12px", fontWeight: "600", marginTop: "8px", textAlign: "center" }}>
                  {formatPoints(Math.max(0, prochainPalier.seuil_points - donnees.gagne_a_vie))} pts → {prochainPalier.label}
                </div>
              </div>
            )}

            <button
              onClick={() => palierRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="tap"
              style={{ display: "block", margin: "18px auto 0", borderRadius: "999px", padding: "10px 20px", fontSize: "12.5px", fontWeight: "800", cursor: "pointer", background: heroChipBg, border: `1px solid ${heroChipBrd}`, color: heroChipIcon }}
            >
              Voir ma progression →
            </button>
          </>
        )}
      </div>

      {!loading && donnees && (
      <div style={{ padding: "16px", maxWidth: "560px", margin: "0 auto" }} className="yelen-anim">
        <>
            {gainToast !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: card, border: `1px solid ${OR}`, borderRadius: "14px", padding: "10px 14px", marginBottom: "12px", animation: "yelenToastIn 0.3s ease" }}>
                <Ic.Spark color={OR}/>
                <span style={{ color: t1, fontSize: "13px", fontWeight: "700" }}>Vous venez de gagner {gainToast >= 0 ? `+${gainToast}` : gainToast} point{Math.abs(gainToast) > 1 ? "s" : ""} Yelen</span>
              </div>
            )}

            {/* Cette semaine */}
            {(semaineDelta !== 0 || semaineComparaison) && (
              <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: rgba(OR, 0.12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic.Montee/></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{semaineDelta >= 0 ? `+${semaineDelta}` : semaineDelta} points cette semaine</div>
                  {semaineComparaison && <div style={{ color: t2, fontSize: "12px", marginTop: "2px" }}>{semaineComparaison}</div>}
                </div>
                <Link href="/menu/recompenses/historique" style={{ color: t2, fontSize: "12px", fontWeight: "700", textDecoration: "none", flexShrink: 0 }}>Voir mon activité →</Link>
              </div>
            )}

            {/* Vos récompenses — chaque carte est cliquable (popup détail) */}
            <div ref={palierRef} style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "10px", scrollMarginTop: "20px" }}>Vos récompenses</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              {donnees.paliers.map((p) => {
                const ratio = donnees.gagne_a_vie / p.seuil_points;
                const enPreparation = p.debloque && p.statut_disponibilite === "a_venir";
                const debloqueLivrable = p.debloque && p.statut_disponibilite === "disponible";
                const presDebloque = !p.debloque && ratio >= NEAR_UNLOCK_RATIO;
                const estProchain = !p.debloque && prochainPalier?.code === p.code;
                const teintePalier = TEINTE_PALIER[p.type_recompense];
                const Icone = ICONE_PALIER[p.type_recompense];
                const bordure = p.debloque || presDebloque ? OR : brd;
                const mentionBientot = p.type_recompense === "offre_partenaire" && p.statut_disponibilite === "a_venir" && !p.debloque;

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
                      {debloqueLivrable ? <Icone color={OR}/> : enPreparation ? <Ic.Clock/> : presDebloque ? <Icone color={OR}/> : <Ic.Lock color={teintePalier}/>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700" }}>{p.label}</div>
                        <span style={{ color: p.debloque ? OR : t2, fontSize: "10.5px", fontWeight: "700" }}>{formatPoints(p.seuil_points)} pts</span>
                        {mentionBientot && <span style={{ color: teintePalier, fontSize: "10px", fontWeight: "700" }}>· mécanisme à venir</span>}
                      </div>
                      {debloqueLivrable && <div style={{ color: OR, fontSize: "12px", fontWeight: "700", marginTop: "2px" }}>Débloqué</div>}
                      {enPreparation && (
                        <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5, marginTop: "3px" }}>
                          Vous avez atteint {formatPoints(p.seuil_points)} points. Cette récompense arrive bientôt — contactez Yelen pour la réclamer dès maintenant. Elle reste acquise, elle n'expire pas.
                        </div>
                      )}
                      {!p.debloque && presDebloque && (
                        <div style={{ color: OR, fontSize: "12px", fontWeight: "700", marginTop: "2px" }}>Presque débloqué — plus que {formatPoints(Math.max(0, p.seuil_points - donnees.gagne_a_vie))} pts</div>
                      )}
                      {!p.debloque && !presDebloque && (
                        <div style={{ color: t2, fontSize: "12px", marginTop: "2px" }}>{formatPoints(Math.max(0, p.seuil_points - donnees.gagne_a_vie))} points restants</div>
                      )}
                    </div>
                    <span style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></span>
                  </div>
                );
              })}
            </div>

            {/* Comment ça marche */}
            <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800", marginBottom: "12px" }}>Comment ça marche</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "14px" }}>
                {["Actions utiles", "Points", "Récompenses"].map((label, i) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ background: card2, color: t1, fontSize: "11px", fontWeight: "700", padding: "6px 10px", borderRadius: "999px" }}>{label}</span>
                    {i < 2 && <span style={{ color: t3 }}><Ic.Chev/></span>}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: card2, color: t1, fontSize: "11px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>1</div>
                <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5 }}>Honorez un rendez-vous (présence confirmée sur place) : <strong style={{ color: t1 }}>+15 points</strong>.</div>
              </div>
              <div style={{ color: t3, fontSize: "12px", marginTop: "8px" }}>D'autres façons de gagner des points arriveront progressivement.</div>
            </div>

            {/* Créer de l'activité */}
            <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "10px" }}>Créer de l'activité</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              {CTA_ACTIVITE.map((c) => (
                <Link key={c.href} href={c.href} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "14px 16px", textDecoration: "none" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: rgba(OR, 0.12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.icone}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700" }}>{c.titre}</div>
                    <div style={{ color: t2, fontSize: "12px", marginTop: "2px" }}>{c.desc}</div>
                  </div>
                  <span style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></span>
                </Link>
              ))}
            </div>

            {/* Votre activité Yelen */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ color: t1, fontSize: "15px", fontWeight: "800" }}>Votre activité Yelen</div>
              <Link href="/menu/recompenses/historique" style={{ color: t2, fontSize: "12.5px", fontWeight: "700", display: "flex", alignItems: "center", gap: "2px", textDecoration: "none" }}>
                Voir tout <Ic.Chev/>
              </Link>
            </div>
            {donnees.historique.length === 0 ? (
              <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "32px 20px", textAlign: "center" }}>
                <Ic.Attente/>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700", marginTop: "14px" }}>Rien à afficher pour l'instant</div>
                <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.6, marginTop: "4px", maxWidth: "280px", marginLeft: "auto", marginRight: "auto" }}>
                  Vos points apparaîtront ici dès que vous aurez honoré votre premier rendez-vous sur Yelen.
                </div>
              </div>
            ) : (
              <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", overflow: "hidden" }}>
                {donnees.historique.slice(0, 5).map((h, i) => {
                  const teinte = teinteEvenement(h.rule_code, h.points_delta);
                  return (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${brd}` }}>
                      <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: rgba(teinte, 0.14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{iconeEvenement(h.rule_code, h.points_delta)}</div>
                      <div style={{ flex: 1, minWidth: 0, color: t1, fontSize: "13px", fontWeight: "600" }}>{h.raison}</div>
                      <div style={{ flexShrink: 0, background: rgba(teinte, 0.14), color: teinte, fontSize: "13px", fontWeight: "800", padding: "4px 10px", borderRadius: "20px" }}>{h.points_delta >= 0 ? `+${h.points_delta}` : h.points_delta}</div>
                    </div>
                  );
                })}
              </div>
            )}
        </>
      </div>
      )}

      {/* Popup plein écran — détail d'une récompense, même pattern que les
          autres écrans du projet (header X + titre, fond de l'app). */}
      {palierDetail && donnees && (() => {
        const p = palierDetail;
        const ratio = donnees.gagne_a_vie / p.seuil_points;
        const enPreparation = p.debloque && p.statut_disponibilite === "a_venir";
        const debloqueLivrable = p.debloque && p.statut_disponibilite === "disponible";
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

              <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: "700", marginBottom: "6px" }}>{texte.intro}</div>
                <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>{texte.detail}</div>
              </div>

              <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px" }}>
                {debloqueLivrable && <div style={{ color: OR, fontSize: "13px", fontWeight: "800" }}>Débloqué — récompense disponible.</div>}
                {enPreparation && <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>Débloqué. La récompense arrive bientôt — contactez Yelen pour la réclamer dès maintenant. Elle reste acquise, elle n'expire pas.</div>}
                {!p.debloque && (
                  <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>
                    Il vous manque <strong style={{ color: t1 }}>{formatPoints(Math.max(0, p.seuil_points - donnees.gagne_a_vie))} points</strong> pour débloquer cette récompense.
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
