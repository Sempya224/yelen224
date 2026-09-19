"use client";

// Centre de configuration institution (Setup Center post-inscription,
// décision CEO 12/08/2026 ; refonte V2 "parcours d'activation
// professionnel" décision CEO 14/08/2026) — remplace l'onglet "Accueil"
// tant que l'établissement n'est pas entièrement configuré, cf. plan
// tidy-dancing-hennessy.md. Réorganisation de l'existant : chaque item de
// checklist navigue vers un écran dashboard déjà construit (aucune modal,
// aucune duplication d'écran) via `onNavigate`. Aucun rôle RBAC
// "Responsable" distinct n'existe — le Responsable est en pratique
// le/les membre(s) `role: "admin"` créé(s) à l'inscription
// (`institution_membres.compte_principal`), voir CLAUDE.md /auth.
//
// Le groupe "Équipe" compte dans le % global affiché mais ne bloque jamais
// la bascule vers le dashboard KPI (`group.blocking === false`, calculé
// côté serveur) — une institution qui travaille légitimement seule n'est
// jamais bloquée indéfiniment ici. Important : le % global (`pct`) inclut
// ce groupe non bloquant, donc n'atteint pas toujours 100 même quand tout
// ce qui est réellement requis est terminé — la section Vérification/
// Activation ci-dessous se base sur `blockingGroupsDone` (calculé
// localement depuis `groups`), jamais sur `pct === 100`.
//
// Verrouillage par rôle (Lot D) : chaque item est verrouillé visuellement
// (badge cadenas, non cliquable) si tabAllowed() est faux pour le rôle
// courant — jamais assoupli ici, la vraie barrière reste côté route API de
// l'écran cible. Un item verrouillé compte quand même dans le %.
//
// Il n'existe aucune action self-service d'activation côté institution
// (audité : `institutions.statut` n'est modifiable que par 4 routes admin,
// voir plan). Cet écran n'affiche donc jamais de bouton "Activer" — une
// fois les groupes bloquants terminés, il informe que Yelen vérifie le
// dossier. La bascule réelle vers le dashboard KPI + l'écran de
// confirmation "espace activé" sont gérés par le parent (page.tsx) dès que
// `complete` passe à vrai côté serveur (admin a validé entre-temps).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { YelenLoader } from "@/components/YelenLoader";
import { tabAllowed, tabReadOnly, type MembreRole, type TabKey } from "@/lib/institutionPermissions";

type DocSubStatut = "recu" | "valide" | "complement_demande" | "rejete" | null;
type ConfigItem = { id: string; label: string; done: boolean; tab: TabKey; subStatut?: DocSubStatut };
type ConfigGroup = { id: string; label: string; done: boolean; blocking: boolean; items: ConfigItem[] };
type ConfigurationStatus = {
  groups: ConfigGroup[];
  pct: number;
  complete: boolean;
  institutionStatut: string | null;
  badgeVerifie: boolean;
  orgName: string | null;
  responsable: { prenom: string; nom: string } | null;
  counts: { servicesActifs: number; membresEquipe: number };
};

const GROUP_ICONS: Record<string, React.ReactNode> = {
  profil: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  equipe: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  services: <path d="M4 4h16v4H4zM4 12h7v8H4zM15 12h5v8h-5z" />,
  horaires: <path d="M21 12a9 9 0 1 1-9-9M21 3v6h-6M12 7v5l3 3" />,
  profil_public: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.6 9h16.8M3.6 15h16.8M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18Z" />,
  verification: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
};

const GROUP_DESC: Record<string, string> = {
  profil: "Les informations principales qui présentent votre établissement.",
  equipe: "Les personnes autorisées à utiliser l'espace professionnel.",
  services: "Ce que les citoyens peuvent consulter et réserver sur Yelen.",
  horaires: "Les jours et horaires où les citoyens peuvent prendre rendez-vous.",
  profil_public: "Les informations affichées publiquement aux citoyens.",
  verification: "Documents requis pour la vérification de votre établissement.",
};

// Illustration sur mesure Yelen — état d'erreur de chargement du parcours
// d'activation, même langage que EquipeTab/ClockInShiftTab (trait, un seul
// accent doré, fond doux). Une lanterne plutôt qu'une icône d'erreur
// classique (croix/point d'exclamation) — cohérent avec "Yelen" = lumière
// en malinké, message rassurant plutôt qu'alarmant (retour Bryan
// 21/08/2026 : "humaniser" cet écran).
function IllustrationChargementInterrompu({ C }: { C: ThemeTokens }) {
  return (
    <svg width="80" height="80" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M38 40a10 10 0 0 1 20 0v6H38v-6z" stroke={C.t3} strokeWidth="2" strokeLinejoin="round"/>
      <rect x="34" y="46" width="28" height="22" rx="6" stroke={C.t3} strokeWidth="2"/>
      <circle cx="48" cy="57" r="5" fill={C.gold}/>
    </svg>
  );
}

const STATUT_LABEL: Record<string, string> = {
  en_attente: "En attente de vérification Yelen",
  validee: "Établissement vérifié",
  suspendue: "Compte suspendu",
  refusee: "Dossier refusé",
};

// FAQ de fin d'écran (brief CEO 14/08/2026 : "l'utilisateur doit tout
// savoir, il ne doit jamais être surpris") — chaque réponse est vérifiée
// contre le comportement réel (recherche/accueil citoyen filtrent déjà
// sur statut="validee" : app/recherche/RechercheInner.tsx, app/page.tsx ;
// aucun verrou d'édition post-activation trouvé dans les routes profil).
// Zéro délai chiffré inventé (même discipline que le reste du produit,
// cf. CLAUDE.md /pieges-techniques-connus).
const FAQ_ITEMS: { q: string; a: string; ctaLabel?: string; ctaHref?: string; ctaTab?: TabKey }[] = [
  {
    q: "Le pourcentage de préparation doit-il atteindre 100 % pour être activé ?",
    a: "Non. Certaines étapes, comme Équipe et accès, sont facultatives. Votre espace peut être activé dès que toutes les étapes marquées Obligatoire sont terminées, même si la préparation n'affiche pas 100 %.",
  },
  {
    q: "Combien de temps prend la vérification Yelen ?",
    a: "Le délai varie selon le nombre de dossiers en cours de traitement chez Yelen. Vous n'avez rien à faire de plus : votre tableau de bord bascule automatiquement vers l'espace complet dès que votre établissement est vérifié.",
  },
  {
    q: "Mon établissement est-il visible des citoyens avant l'activation ?",
    a: "Non. Tant que votre espace n'est pas activé, votre établissement n'apparaît pas dans les résultats de recherche Yelen et ne peut recevoir aucun rendez-vous.",
  },
  {
    q: "Qui peut consulter les documents que j'envoie pour la vérification ?",
    a: "Uniquement l'équipe Yelen, à des fins de vérification. Ils ne sont jamais visibles publiquement, ni par les citoyens, ni par d'autres institutions.",
    ctaLabel: "Voir mes documents envoyés",
    ctaTab: "documents",
  },
  {
    q: "Puis-je modifier mes informations après l'activation ?",
    a: "Oui. Chaque section — profil, services, disponibilités, équipe — reste modifiable à tout moment depuis votre tableau de bord, avant comme après l'activation.",
    ctaLabel: "Voir le profil de l'organisation",
    ctaTab: "profil-entreprise",
  },
  {
    q: "Mon dossier a été refusé ou mon compte suspendu — que faire ?",
    a: "Le motif s'affiche directement sur cet écran lorsqu'il est disponible. Contactez notre équipe pour comprendre la situation et, si possible, la corriger.",
    ctaLabel: "Contacter le support",
    ctaHref: "mailto:support@yelen224.com",
  },
];

function ScrollLockIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function CentreConfigurationTab({
  instId,
  instName,
  membreRole,
  onNavigate,
  onStatusChange,
}: {
  instId: string;
  instName: string;
  membreRole: MembreRole | null;
  onNavigate: (tab: TabKey) => void;
  onStatusChange: (complete: boolean, pct: number) => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [data, setData] = useState<ConfigurationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const load = async () => {
    setError(false);
    try {
      const res = await fetch("/api/institution/configuration-status");
      if (!res.ok) throw new Error();
      const j = (await res.json()) as ConfigurationStatus;
      setData(j);
      onStatusChange(j.complete, j.pct);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instId]);

  if (loading) {
    return (
      <div style={{ padding: "64px 16px", display: "flex", justifyContent: "center" }}>
        <YelenLoader size={28} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
          <IllustrationChargementInterrompu C={C}/>
        </div>
        <p style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 6px" }}>
          Impossible d&apos;afficher votre parcours d&apos;activation
        </p>
        <p style={{ color: C.t2, fontSize: "12.5px", fontWeight: "600", margin: "0 0 16px" }}>
          Vos informations n&apos;ont pas été perdues — réessayez dans un instant.
        </p>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => { setLoading(true); load(); }}>
          Réessayer
        </Button>
      </div>
    );
  }

  const barColor = data.pct === 100 ? C.green : data.pct >= 60 ? C.gold : C.orange;
  const blockingGroups = data.groups.filter((g) => g.blocking);
  const blockingGroupsDone = blockingGroups.every((g) => g.done);
  const missingBlocking = blockingGroups.filter((g) => !g.done);
  const statut = data.institutionStatut ?? "en_attente";
  const enEchec = statut === "suspendue" || statut === "refusee";

  // Bloc "Vérification Yelen" — mini-timeline dérivée uniquement des
  // champs réels reçus (pct/institutionStatut/complete), jamais d'état
  // inventé. `profilComplet` utilise blockingGroupsDone, pas pct===100,
  // pour ne jamais dépendre du groupe Équipe (non bloquant).
  const profilComplet = blockingGroupsDone;
  const verifStep: "a_venir" | "en_cours" | "faite" | "echec" = enEchec
    ? "echec"
    : !profilComplet
    ? "a_venir"
    : statut === "validee"
    ? "faite"
    : "en_cours";

  const docsAControler = (data.groups.find((g) => g.id === "verification")?.items ?? [])
    .filter((i) => i.subStatut === "rejete" || i.subStatut === "complement_demande");

  // Rail gauche (≥1440px) : même triptyque Configuration/Vérification/
  // Activation que la section B ci-dessous, condensé pour rester visible
  // en scrollant la checklist — jamais une 2e source de vérité, dérivé des
  // mêmes variables (profilComplet/verifStep/data.complete).
  const railStages: { label: string; state: typeof verifStep }[] = [
    { label: "Configuration", state: profilComplet ? "faite" : "en_cours" },
    { label: "Vérification Yelen", state: verifStep },
    { label: "Activation", state: data.complete ? "faite" : "a_venir" },
  ];

  return (
    <div className="cc-layout" style={{ padding: "16px", display: "grid", gridTemplateColumns: "1fr", gap: "0px", alignItems: "start" }}>
      {/* ── Bandeaux fixes PC (container query sur .yelen-page, pas un seuil
          de viewport — cf. commentaire container-type dans dashboard/
          page.tsx : un @media(min-width:1440px) ne se déclenchait jamais en
          conditions réelles, probablement le scaling Windows du laptop de
          Bryan). En dessous du seuil, layout identique à avant. Comble
          l'espace mort entre la checklist (760px) et .yelen-page (1280px
          max) sans élargir la checklist elle-même (lisibilité). Rail
          gauche = repère d'étapes toujours visible ; rail droit = "ce qui
          va se passer" + support, pour qu'aucune surprise n'attende
          l'utilisateur (brief CEO 14/08/2026). display:none par défaut →
          les <aside> ne prennent aucune place dans la grid sous le seuil.
          Seuil abaissé à 1100px (retour Bryan 14/08/2026, "disparu encore")
          : la sidebar bascule entre 76px repliée et 264px dépliée
          (page.tsx, yelen-sidebar) — un seuil calibré sur la sidebar
          repliée retombait sous la barre dès qu'elle est dépliée (état
          normal), faisant disparaître les bandeaux sans changement de
          fenêtre. 760+2×150+2×20 = 1100px pile, marge minimale garantie
          même sidebar dépliée sur un viewport ~1400px+. ── */}
      <style>{`
        @container (min-width: 1100px){
          .cc-layout{grid-template-columns:minmax(150px,1fr) 760px minmax(150px,1fr)!important;gap:20px!important;justify-content:center}
          .cc-rail{display:flex!important}
        }
      `}</style>

      <aside className="cc-rail" style={{ display: "none", flexDirection: "column", gap: "14px", position: "sticky", top: "16px", backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "16px" }}>
        <span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>Votre parcours</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {railStages.map((s, i) => {
            const color = s.state === "faite" ? C.green : s.state === "en_cours" ? C.gold : s.state === "echec" ? C.red : C.t3;
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backgroundColor: s.state === "faite" ? C.green : s.state === "en_cours" ? C.goldL : s.state === "echec" ? C.redL : "transparent",
                    border: `1.5px solid ${color}`,
                  }}>
                    {s.state === "faite" && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    {s.state === "en_cours" && <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: C.gold }} />}
                  </div>
                  {i < railStages.length - 1 && <div style={{ width: "1.5px", flex: 1, minHeight: "20px", backgroundColor: C.border2, margin: "2px 0" }} />}
                </div>
                <span style={{ color: s.state === "a_venir" ? C.t3 : C.t1, fontSize: "12px", fontWeight: s.state === "a_venir" ? "600" : "800", paddingTop: "1px", paddingBottom: "6px" }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </aside>

      <div className="cc-main" style={{ maxWidth: "760px", width: "100%", margin: "0 auto", animation: "fadeUp 0.2s ease" }}>
      {/* ── Header / hero (retour Bryan 14/08/2026 : "modernise, fond
          yelen vraie jaune pas le flote") — fond plat C.gold, jamais de
          dégradé (même discipline que l'aplatissement doré déjà appliqué
          sur Offres/RDV/login, cf. CLAUDE.md /modules-livres). Encre
          foncée fixe (#1A1206, même choix que la FAQ plus bas dans ce
          fichier) : C.t1 passerait en blanc en thème sombre, illisible sur
          fond doré plein. "Bienvenue" personnalisé quand le prénom du
          responsable est déjà connu, jamais un prénom halluciné sinon. ── */}
      <div style={{ marginBottom: "20px", backgroundColor: C.gold, borderRadius: "18px", padding: "24px", position: "relative", overflow: "hidden" }}>
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#1A1206" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: "absolute", top: "-18px", right: "-18px", opacity: 0.12, pointerEvents: "none" }}>
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
        <span style={{ color: "#FFFFFF", fontSize: "11.5px", fontWeight: "800", letterSpacing: "0.4px", textTransform: "uppercase", opacity: 0.92, display: "block", marginBottom: "6px" }}>
          Bienvenue{data.responsable?.prenom ? `, ${data.responsable.prenom}` : ""} !
        </span>
        <h1 style={{ color: "#1A1206", fontSize: "22px", fontWeight: "800", margin: "0 0 6px", letterSpacing: "-0.3px" }}>Votre espace Yelen est presque prêt.</h1>
        <p style={{ color: "#4A3410", fontSize: "13px", fontWeight: "600", margin: 0, maxWidth: "480px", position: "relative" }}>
          Prenez un moment pour vérifier les informations de {instName} et compléter les quelques étapes restantes. Une fois tout finalisé, votre espace pourra être activé.
        </p>
      </div>

      {/* ── Carte "en attente de vérification" — entre le hero et la
          checklist (retour Bryan 14/08/2026). Uniquement quand les étapes
          obligatoires sont terminées et qu'on attend Yelen (verifStep ===
          "en_cours") : jamais pendant la config, jamais en cas d'échec —
          ces cas restent couverts par le reste de l'écran. Ton humain,
          remercie explicitement, aucun délai chiffré inventé (même
          discipline que le reste du produit). Illustration maison
          (document + loupe + rayons façon "Yelen = lumière", cf. logo de
          l'app) — dupliquée volontairement dans DocumentsTab.tsx plutôt
          qu'extraite en composant partagé (juste un SVG décoratif, pas de
          logique à factoriser). ── */}
      {verifStep === "en_cours" && (
        <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "24px", marginBottom: "16px", textAlign: "center" }}>
          <svg width="88" height="88" viewBox="0 0 96 96" fill="none" style={{ margin: "0 auto 12px" }}>
            <rect x="24" y="14" width="40" height="52" rx="4" fill="none" stroke={C.t2} strokeWidth="2" />
            <line x1="32" y1="28" x2="56" y2="28" stroke={C.t3} strokeWidth="2" strokeLinecap="round" />
            <line x1="32" y1="36" x2="56" y2="36" stroke={C.t3} strokeWidth="2" strokeLinecap="round" />
            <line x1="32" y1="44" x2="48" y2="44" stroke={C.t3} strokeWidth="2" strokeLinecap="round" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <line key={a}
                x1={66 + 18 * Math.cos((a * Math.PI) / 180)} y1={58 + 18 * Math.sin((a * Math.PI) / 180)}
                x2={66 + 23 * Math.cos((a * Math.PI) / 180)} y2={58 + 23 * Math.sin((a * Math.PI) / 180)}
                stroke={C.gold} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
            ))}
            <circle cx="66" cy="58" r="14" fill={C.bgCard2} stroke={C.gold} strokeWidth="3" />
            <path d="M60 58l4 4 8-8" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 style={{ color: C.t1, fontSize: "17px", fontWeight: "800", margin: "0 0 4px" }}>Merci pour votre confiance.</h2>
          <div style={{ color: C.gold, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.4px", margin: "0 0 18px" }}>{instName}</div>
          <div style={{ maxWidth: "460px", margin: "0 auto", textAlign: "left" }}>
            <p style={{ color: C.t2, fontSize: "13px", fontWeight: "600", lineHeight: 1.65, margin: "0 0 12px" }}>
              Votre dossier est maintenant en cours de vérification par notre équipe. Nous vous remercions de l&apos;intérêt que vous portez à Yelen et de votre patience pendant l&apos;examen de vos informations et documents.
            </p>
            <p style={{ color: C.t2, fontSize: "13px", fontWeight: "600", lineHeight: 1.65, margin: "0 0 12px" }}>
              Dès que votre espace sera activé, vous pourrez commencer à développer votre activité sur Yelen. Pour le moment, aucune action n&apos;est requise de votre part.
            </p>
            <p style={{ color: C.t2, fontSize: "13px", fontWeight: "600", lineHeight: 1.65, margin: 0 }}>
              Nous vous informerons dès que la vérification sera terminée.
            </p>
          </div>
        </div>
      )}

      {/* ── Statut de préparation ──────────────────────────────────── */}
      <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ color: C.t1, fontSize: "15px", fontWeight: "800" }}>Préparation — {data.pct}%</span>
          <span style={{ color: C.t3, fontSize: "11.5px", fontWeight: "700" }}>
            {missingBlocking.length === 0 ? "Toutes les étapes obligatoires sont terminées" : `${missingBlocking.length} étape${missingBlocking.length > 1 ? "s" : ""} obligatoire${missingBlocking.length > 1 ? "s" : ""} restante${missingBlocking.length > 1 ? "s" : ""}`}
          </span>
        </div>
        <div style={{ height: "7px", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${data.pct}%`, backgroundColor: barColor, borderRadius: "4px", transition: "width 0.4s ease" }} />
        </div>
      </div>

      {/* ── A. Configuration — checklist premium ──────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
        {data.groups.map((g) => (
          <div key={g.id} style={{ backgroundColor: C.bgCard2, border: `1px solid ${g.done ? "rgba(0,200,150,0.25)" : C.border2}`, borderRadius: "14px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: g.done ? "rgba(0,200,150,0.12)" : `${C.gold}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={g.done ? C.green : C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {GROUP_ICONS[g.id]}
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ color: C.t1, fontSize: "14.5px", fontWeight: "800" }}>{g.label}</span>
                  <span style={{
                    fontSize: "9.5px", fontWeight: "800", letterSpacing: "0.3px", padding: "2px 7px", borderRadius: "5px",
                    color: g.blocking ? C.orange : C.t3,
                    backgroundColor: g.blocking ? C.orangeL : C.bg3,
                  }}>
                    {g.blocking ? "OBLIGATOIRE" : "FACULTATIF"}
                  </span>
                </div>
                <p style={{ color: C.t3, fontSize: "12px", fontWeight: "600", margin: "3px 0 0" }}>{GROUP_DESC[g.id]}</p>
              </div>
              {g.done && (
                <span style={{ display: "flex", alignItems: "center", gap: "3px", color: C.green, fontSize: "10px", fontWeight: "800", flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  TERMINÉ
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {g.items.map((item) => {
                const allowed = tabAllowed(membreRole, item.tab);
                const readOnly = tabReadOnly(membreRole, item.tab);
                const alerte = item.subStatut === "rejete" || item.subStatut === "complement_demande";
                const checkCircle = (
                  <div style={{ width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0, backgroundColor: item.done ? C.green : "transparent", border: `1.5px solid ${item.done ? C.green : alerte ? C.red : C.border2}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {item.done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                );
                const rowStyle: React.CSSProperties = {
                  display: "flex", alignItems: "center", gap: "8px", width: "100%",
                  backgroundColor: item.done ? "rgba(0,200,150,0.06)" : alerte ? C.redL : C.bg,
                  border: `1px solid ${item.done ? "rgba(0,200,150,0.18)" : alerte ? "rgba(255,71,87,0.3)" : C.border}`,
                  borderRadius: "9px", padding: "8px 10px", textAlign: "left",
                };
                const statutTag = alerte ? (
                  <span style={{ color: C.red, fontSize: "9.5px", fontWeight: "800", flexShrink: 0 }}>
                    {item.subStatut === "rejete" ? "À CORRIGER" : "COMPLÉMENT DEMANDÉ"}
                  </span>
                ) : item.subStatut === "recu" ? (
                  <span style={{ color: C.blue, fontSize: "9.5px", fontWeight: "800", flexShrink: 0 }}>EN EXAMEN</span>
                ) : null;

                if (!allowed) {
                  return (
                    <div key={item.id} style={{ ...rowStyle, opacity: 0.75 }}>
                      {checkCircle}
                      <span style={{ color: item.done ? C.t2 : C.t1, fontSize: "12.5px", fontWeight: item.done ? "600" : "700", flex: 1 }}>{item.label}</span>
                      {statutTag}
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: C.t3, fontSize: "10px", fontWeight: "800", flexShrink: 0 }}>
                        <ScrollLockIcon color={C.t3} />
                        Réservé
                      </span>
                    </div>
                  );
                }

                return (
                  <button key={item.id} onClick={() => onNavigate(item.tab)} className="tap" style={{ ...rowStyle, cursor: "pointer" }}>
                    {checkCircle}
                    <span style={{ color: item.done ? C.t2 : C.t1, fontSize: "12.5px", fontWeight: item.done ? "600" : "700", flex: 1 }}>{item.label}</span>
                    {statutTag}
                    {readOnly && <span style={{ color: C.orange, fontSize: "9px", fontWeight: "800", flexShrink: 0 }}>LECTURE</span>}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── B. Vérification Yelen ──────────────────────────────────── */}
      <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
        <span style={{ color: C.t1, fontSize: "14.5px", fontWeight: "800", display: "block", marginBottom: "3px" }}>Vérification Yelen</span>
        <p style={{ color: C.t3, fontSize: "12px", fontWeight: "600", margin: "0 0 14px" }}>
          Certaines informations sont vérifiées par Yelen avant l&apos;activation de votre établissement.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "Informations reçues", state: "faite" as const },
            { label: "Profil complété", state: profilComplet ? "faite" as const : "a_venir" as const },
            { label: enEchec ? STATUT_LABEL[statut] : "Vérification Yelen", state: verifStep },
            { label: "Activation", state: data.complete ? "faite" as const : "a_venir" as const },
          ].map((s, i) => {
            const color = s.state === "faite" ? C.green : s.state === "en_cours" ? C.gold : s.state === "echec" ? C.red : C.t3;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: s.state === "faite" ? C.green : s.state === "en_cours" ? C.goldL : s.state === "echec" ? C.redL : "transparent",
                  border: `1.5px solid ${color}`,
                }}>
                  {s.state === "faite" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  {s.state === "en_cours" && <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.gold }} />}
                </div>
                <span style={{ color: s.state === "a_venir" ? C.t3 : C.t1, fontSize: "13px", fontWeight: s.state === "a_venir" ? "600" : "800" }}>{s.label}</span>
              </div>
            );
          })}
        </div>
        {docsAControler.length > 0 && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
            {docsAControler.map((d) => (
              <button key={d.id} onClick={() => onNavigate(d.tab)} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: "4px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: C.red, flexShrink: 0 }} />
                <span style={{ color: C.red, fontSize: "12px", fontWeight: "700" }}>{d.label} — à corriger</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── C. Synthèse finale (dès que les étapes obligatoires sont faites) ── */}
      {profilComplet && (
        <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
          <span style={{ color: C.t1, fontSize: "14.5px", fontWeight: "800", display: "block", marginBottom: "12px" }}>Vérification finale</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { label: "Organisation", value: data.orgName ?? instName, tab: "profil-entreprise" as const },
              { label: "Responsable", value: data.responsable ? `${data.responsable.prenom} ${data.responsable.nom}` : "—", tab: "profil-responsable" as const },
              { label: "Services", value: `${data.counts.servicesActifs} service${data.counts.servicesActifs > 1 ? "s" : ""} actif${data.counts.servicesActifs > 1 ? "s" : ""}`, tab: "services" as const },
              { label: "Disponibilités", value: "Configurées", tab: "disponibilites" as const },
              { label: "Équipe", value: `${data.counts.membresEquipe} membre${data.counts.membresEquipe > 1 ? "s" : ""}`, tab: "equipe" as const },
            ].map((row) => {
              const allowed = tabAllowed(membreRole, row.tab);
              const content = (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: C.t3, fontSize: "11px", fontWeight: "700", display: "block" }}>{row.label}</span>
                    <span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>{row.value}</span>
                  </div>
                  <span style={{ display: "flex", alignItems: "center", gap: "3px", color: C.green, fontSize: "10px", fontWeight: "800", flexShrink: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    COMPLÉTÉ
                  </span>
                </>
              );
              const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "8px 0", borderBottom: `1px solid ${C.border}`, textAlign: "left" };
              return allowed ? (
                <button key={row.label} onClick={() => onNavigate(row.tab)} className="tap" style={{ ...rowStyle, background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>{content}</button>
              ) : (
                <div key={row.label} style={rowStyle}>{content}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Activation ─────────────────────────────────────────────── */}
      {!blockingGroupsDone ? (
        <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <span style={{ color: C.t1, fontSize: "14.5px", fontWeight: "800" }}>Votre espace n&apos;est pas encore prêt</span>
          </div>
          <p style={{ color: C.t3, fontSize: "12.5px", fontWeight: "600", margin: "0 0 12px" }}>
            Complétez les éléments obligatoires ci-dessus avant de pouvoir activer votre établissement.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {missingBlocking.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: "700" }}>{g.label}</span>
                <span style={{ color: C.orange, fontSize: "10.5px", fontWeight: "800" }}>À compléter</span>
              </div>
            ))}
          </div>
        </div>
      ) : enEchec ? (
        <div style={{ backgroundColor: C.redL, border: "1px solid rgba(255,71,87,0.3)", borderRadius: "14px", padding: "18px" }}>
          <span style={{ color: C.red, fontSize: "14.5px", fontWeight: "800", display: "block", marginBottom: "6px" }}>{STATUT_LABEL[statut]}</span>
          <p style={{ color: C.t2, fontSize: "12.5px", fontWeight: "600", margin: 0 }}>
            {statut === "refusee"
              ? "Votre dossier n'a pas été validé par Yelen. Contactez le support pour comprendre les raisons et les corriger."
              : "Votre compte est actuellement suspendu. Contactez le support Yelen pour en connaître la raison."}
          </p>
        </div>
      ) : (
        <div style={{ backgroundColor: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.25)", borderRadius: "14px", padding: "18px" }}>
          <span style={{ color: C.green, fontSize: "14.5px", fontWeight: "800", display: "block", marginBottom: "6px" }}>Configuration terminée</span>
          <p style={{ color: C.t2, fontSize: "12.5px", fontWeight: "600", margin: 0 }}>
            Votre équipe Yelen vérifie votre établissement avant l&apos;activation. Vous serez automatiquement redirigé vers votre tableau de bord dès que ce sera fait.
          </p>
        </div>
      )}

      {/* ── Questions fréquentes — fin d'écran, brief CEO 14/08/2026. Volontairement
          SANS la carte bgCard2/border2 utilisée par la checklist ci-dessus :
          la FAQ n'est pas une étape de configuration de plus, elle doit se
          lire comme une section à part (retour Bryan 14/08/2026 : les deux
          se confondaient). Séparateur horizontal + icône d'en-tête pour
          marquer la rupture. Question / réponse / CTA sont 3 paliers
          visuels distincts : taille+poids+couleur pour la question, retrait
          + filet doré + couleur la plus pâle (C.t3) pour la réponse, bouton
          plein (fond doré) pour le CTA — jamais un simple lien texte. ── */}
      <div style={{ marginTop: "28px", paddingTop: "24px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ color: C.t1, fontSize: "17px", fontWeight: "800", letterSpacing: "-0.2px" }}>Questions fréquentes</span>
        </div>
        <p style={{ color: C.t3, fontSize: "12.5px", fontWeight: "600", margin: "0 0 16px" }}>
          Tout ce qu&apos;il faut savoir sur la préparation et l&apos;activation de votre espace.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openFaq === i;
            const ctaAllowed = !item.ctaTab || tabAllowed(membreRole, item.ctaTab);
            // Retour Bryan 14/08/2026 : "tu as inventé le fond, c'est
            // interdit sur Yelen" — goldL/goldD (variantes que j'avais
            // inventées la fois précédente) supprimées. Fond ouvert = EXACTEMENT
            // C.gold, la même couleur que le hero plus haut dans cet écran,
            // aucune autre nuance. Encre = noir/blanc purs uniquement (pas de
            // brun intermédiaire) : question en noir, réponse en blanc,
            // valable identiquement en thème clair et sombre puisque C.gold
            // ne change pas entre les deux (theme.ts) et que noir/blanc sont
            // des couleurs fixes, pas des tokens de thème.
            return (
              <div key={item.q} style={{ border: `1.5px solid ${isOpen ? "#000000" : C.border}`, backgroundColor: isOpen ? C.gold : "transparent", borderRadius: "12px", overflow: "hidden", transition: "border-color 0.15s ease, background-color 0.15s ease" }}>
                <button
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="tap"
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "none", border: "none", padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ color: isOpen ? "#000000" : C.t1, fontSize: "14.5px", fontWeight: "800", lineHeight: 1.35 }}>{item.q}</span>
                  <span style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: isOpen ? "#000000" : C.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isOpen ? "#FFFFFF" : C.t3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition: "transform 0.2s ease", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <div style={{ borderLeft: "3px solid #000000", paddingLeft: "13px" }}>
                      <p style={{ color: "#FFFFFF", fontSize: "13px", fontWeight: "600", lineHeight: 1.65, margin: item.ctaLabel && ctaAllowed ? "0 0 12px" : 0 }}>
                        {item.a}
                      </p>
                      {item.ctaLabel && ctaAllowed && item.ctaTab && (
                        <button onClick={() => onNavigate(item.ctaTab!)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "#FFFFFF", color: "#000000", border: "none", borderRadius: "9px", padding: "9px 14px", fontSize: "12.5px", fontWeight: "800", cursor: "pointer" }}>
                          {item.ctaLabel}
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </button>
                      )}
                      {item.ctaLabel && item.ctaHref && (
                        <a href={item.ctaHref} style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "#FFFFFF", color: "#000000", borderRadius: "9px", padding: "9px 14px", fontSize: "12.5px", fontWeight: "800", textDecoration: "none" }}>
                          {item.ctaLabel}
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer — même contenu que le footer du dashboard KPI
          (page.tsx), sans "Dernière mise à jour"/"Actualiser" : cet écran
          n'a pas de données live à rafraîchir (retour Bryan 14/08/2026,
          "juste le footer yelen dashboard"). ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", flexWrap: "wrap", padding: "20px 4px 0", marginTop: "12px", borderTop: `1px solid ${C.border}` }}>
        <Link href="/cgu" style={{ color: C.t3, fontSize: "11px", textDecoration: "none" }}>CGU</Link>
        <Link href="/confidentialite" style={{ color: C.t3, fontSize: "11px", textDecoration: "none" }}>Confidentialité</Link>
        <span style={{ color: C.t3, fontSize: "11px", fontWeight: "700" }}>© 2026 Yelen224 by SemPya224</span>
      </div>
      </div>

      <aside className="cc-rail" style={{ display: "none", flexDirection: "column", gap: "16px", position: "sticky", top: "16px" }}>
        <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "16px" }}>
          <span style={{ color: C.t1, fontSize: "13px", fontWeight: "800", display: "block", marginBottom: "8px" }}>
            {enEchec ? STATUT_LABEL[statut] : !profilComplet ? "Ce qui va se passer" : statut !== "validee" ? "Vérification en cours" : "Espace activé"}
          </span>
          {enEchec ? (
            <p style={{ color: C.t2, fontSize: "12px", fontWeight: "600", lineHeight: 1.6, margin: 0 }}>
              {statut === "refusee"
                ? "Votre dossier n'a pas été validé par Yelen. Contactez le support pour comprendre les raisons et les corriger."
                : "Votre compte est actuellement suspendu. Contactez le support Yelen pour en connaître la raison."}
            </p>
          ) : !profilComplet ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
                {[
                  "Terminez les étapes obligatoires ci-contre.",
                  "Yelen vérifie ensuite les informations de votre établissement.",
                  "Votre espace est activé automatiquement, sans action supplémentaire de votre part.",
                ].map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <span style={{ color: C.gold, fontSize: "11px", fontWeight: "800", flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ color: C.t2, fontSize: "12px", fontWeight: "600", lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
              <p style={{ color: C.t3, fontSize: "11px", fontWeight: "600", lineHeight: 1.5, margin: 0, paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
                Atteindre 100% de configuration ne signifie pas que votre espace est activé — la vérification Yelen reste nécessaire.
              </p>
            </>
          ) : statut !== "validee" ? (
            <p style={{ color: C.t2, fontSize: "12px", fontWeight: "600", lineHeight: 1.6, margin: 0 }}>
              Yelen vérifie actuellement les informations et documents de {instName}. Vous serez automatiquement redirigé vers votre tableau de bord dès que votre espace sera activé.
            </p>
          ) : (
            <p style={{ color: C.t2, fontSize: "12px", fontWeight: "600", lineHeight: 1.6, margin: 0 }}>
              {instName} est vérifié et actif sur Yelen.
            </p>
          )}
        </div>

        <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "14px 16px" }}>
          <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "800", display: "block", marginBottom: "4px" }}>Une question ?</span>
          <p style={{ color: C.t3, fontSize: "11.5px", fontWeight: "600", margin: "0 0 10px", lineHeight: 1.5 }}>
            Notre équipe peut vous aider à chaque étape de la préparation de votre espace.
          </p>
          <a href="mailto:support@yelen224.com" style={{ color: C.gold, fontSize: "12px", fontWeight: "800", textDecoration: "none" }}>
            Contacter le support →
          </a>
        </div>
      </aside>
    </div>
  );
}
