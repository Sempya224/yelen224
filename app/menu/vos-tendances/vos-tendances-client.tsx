"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { YelenLoaderEcran } from "@/components/YelenLoader";

// "Vos tendances" — chantier engagement du 25/07/2026, refonte V2
// UI/UX du 21/09/2026 (retour Bryan, inspiré des recommandations Apple sur
// les interfaces de données mobiles : l'info principale doit rester
// lisible sans interaction, les graphiques ont besoin d'un titre explicite,
// une distinction ne doit jamais reposer sur la seule couleur). Refonte
// strictement visuelle/hiérarchie : les calculs déjà en place (totaux,
// "top" par comptage, seuil de 3 RDV avant d'afficher un "préféré") restent
// exactement les mêmes — les deux seuls ajouts de données sont la
// répartition mensuelle de favoris/avis (pour le détail au tap sur le
// graphique, §5 du brief) et l'id de l'établissement le plus consulté
// (pour en faire un vrai lien, pas juste un chevron décoratif) — dans les
// deux cas, des colonnes déjà réelles (created_at, institution_id), jamais
// une donnée inventée. Zéro score composite affiché (décision actée le
// 21/07/2026 dans le plan rétention) — uniquement des comptages et
// tendances factuels.
const MOIS_LABEL = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const MOIS_LABEL_COMPLET = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const JOURS_LABEL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

type RdvRow = { id: string; institution_id: string; date_rdv: string; statut: string; institutions: { id: string; name: string; secteur: string | null } | null };
type MoisActivite = { key: string; label: string; rdv: number; favoris: number; avis: number };

const Illu = {
  hero: (size = 56) => (
    <svg viewBox="0 0 88 88" width={size} height={size}>
      <circle cx="44" cy="44" r="44" fill="#EDE9FE"/>
      <rect x="24" y="46" width="9" height="20" rx="2" fill="#C4B5FD"/>
      <rect x="37" y="36" width="9" height="30" rx="2" fill="#A78BFA"/>
      <rect x="50" y="24" width="9" height="42" rx="2" fill="#7C3AED"/>
      <path d="M24 32l10-9 8 6 12-14" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M46 9h8v8" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  rdv: (size = 44) => (<svg viewBox="0 0 44 44" width={size} height={size}><circle cx="22" cy="22" r="22" fill="#E0E7FF"/><rect x="12" y="11" width="20" height="20" rx="3" fill="#4F46E5"/><rect x="16" y="8" width="3" height="6" rx="1.5" fill="#4F46E5"/><rect x="25" y="8" width="3" height="6" rx="1.5" fill="#4F46E5"/><rect x="15" y="19" width="14" height="2.4" rx="1.2" fill="#C7D2FE"/></svg>),
  favoris: (size = 44) => (<svg viewBox="0 0 44 44" width={size} height={size}><circle cx="22" cy="22" r="22" fill="#FFE4E6"/><path d="M22 31s-9-5.5-9-12.5A5.5 5.5 0 0 1 22 15a5.5 5.5 0 0 1 9 3.5C31 25.5 22 31 22 31z" fill="#E11D48"/></svg>),
  avis: (size = 44) => (<svg viewBox="0 0 44 44" width={size} height={size}><circle cx="22" cy="22" r="22" fill="#FEF3C7"/><polygon points="22,10 25.5,18 34,19 27.5,24.5 29.5,33 22,28.5 14.5,33 16.5,24.5 10,19 18.5,18" fill="#F5A623"/></svg>),
  demarches: (size = 44) => (<svg viewBox="0 0 44 44" width={size} height={size}><circle cx="22" cy="22" r="22" fill="#D1FAE5"/><rect x="13" y="10" width="18" height="24" rx="3" fill="#0F766E"/><path d="M18 21l3 3 6-7" stroke="#D1FAE5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>),
  secteur: (size = 44) => (<svg viewBox="0 0 44 44" width={size} height={size}><circle cx="22" cy="22" r="22" fill="#CFFAFE"/><path d="M22 10l11 6v10c0 8-5 12-11 14-6-2-11-6-11-14V16z" fill="#0891B2"/></svg>),
  etablissement: (size = 44) => (<svg viewBox="0 0 44 44" width={size} height={size}><circle cx="22" cy="22" r="22" fill="#FDE68A"/><path d="M12 34V17l10-7 10 7v17z" fill="#92400E"/><rect x="19" y="24" width="6" height="10" fill="#FDE68A"/></svg>),
  jour: (size = 44) => (<svg viewBox="0 0 44 44" width={size} height={size}><circle cx="22" cy="22" r="22" fill="#FCE7F3"/><circle cx="22" cy="23" r="11" fill="none" stroke="#DB2777" strokeWidth="2.6"/><line x1="22" y1="23" x2="22" y2="16" stroke="#DB2777" strokeWidth="2.6" strokeLinecap="round"/><line x1="22" y1="23" x2="27" y2="26" stroke="#DB2777" strokeWidth="2.6" strokeLinecap="round"/></svg>),
};

function IconInfo({ color }: { color: string }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}
function IconChevron({ color }: { color: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
}
function IconX({ color }: { color: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

const SECTEUR_LABEL: Record<string, string> = {
  "santé": "Santé", "administratif": "Administratif", "financier": "Institutions financières",
  "juridique": "Juridique", "beauté_bien_etre": "Beauté & bien-être", "commerce": "Commerce",
  "artisanat": "Artisanat", "services_divers": "Services divers",
};

// Ligne d'info compacte ("Ce qui revient le plus", §6 du brief) — chevron
// affiché seulement quand `href` est fourni : jamais une flèche décorative
// qui ne mène nulle part (seul "l'établissement où vous allez le plus" a
// une vraie destination, sa fiche — secteur/jour n'ont aucun écran filtré
// équivalent aujourd'hui, donc restent de simples lignes d'information).
function InfoRow({ icon, label, valeur, card, isDark, t1, t2, href, capitalize }: {
  icon: () => React.ReactElement; label: string; valeur: string;
  card: string; isDark: boolean; t1: string; t2: string; href?: string; capitalize?: boolean;
}) {
  const contenu = (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: card, borderRadius: "16px", padding: "14px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)" }}>
      {icon()}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: t2, fontSize: "11px", fontWeight: "700" }}>{label}</div>
        <div style={{ color: t1, fontSize: "14.5px", fontWeight: "800", textTransform: capitalize ? "capitalize" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{valeur}</div>
      </div>
      {href && <div style={{ flexShrink: 0 }}><IconChevron color={t2}/></div>}
    </div>
  );
  if (!href) return contenu;
  return <Link href={href} style={{ textDecoration: "none", display: "block" }}>{contenu}</Link>;
}

export function VosTendancesClient() {
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
  const [totalRdv, setTotalRdv] = useState(0);
  const [activiteParMois, setActiviteParMois] = useState<MoisActivite[]>([]);
  const [moisSelectionne, setMoisSelectionne] = useState<string | null>(null);
  const [totalFavoris, setTotalFavoris] = useState(0);
  const [totalAvis, setTotalAvis] = useState(0);
  const [noteMoyenne, setNoteMoyenne] = useState<number | null>(null);
  const [demarchesEnCours, setDemarchesEnCours] = useState(0);
  const [secteurTop, setSecteurTop] = useState<string | null>(null);
  const [etablissementTop, setEtablissementTop] = useState<string | null>(null);
  const [etablissementTopId, setEtablissementTopId] = useState<string | null>(null);
  const [jourTop, setJourTop] = useState<string | null>(null);
  const [membreDepuis, setMembreDepuis] = useState<string | null>(null);
  const [aProposOuvert, setAProposOuvert] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let userId: string | null = null;
    try { userId = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!userId) { router.replace("/inscription"); return; }

    void (async () => {
      setLoading(true);
      const [rdvRes, favRes, avisRes, demRes, userRes] = await Promise.all([
        supabase.from("rdv").select("id,institution_id,date_rdv,statut,institutions!rdv_institution_id_fkey(id,name,secteur)").eq("citoyen_id", userId),
        supabase.from("citoyen_favoris").select("created_at").eq("citoyen_id", userId),
        supabase.from("avis").select("note,created_at").eq("citoyen_id", userId).eq("brouillon", false),
        supabase.from("citoyen_demarches").select("id", { count: "exact", head: true }).eq("citoyen_id", userId).eq("statut", "en_cours"),
        supabase.from("users").select("created_at").eq("id", userId).maybeSingle(),
      ]);

      const rdvs = (rdvRes.data ?? []) as unknown as RdvRow[];
      setTotalRdv(rdvs.length);
      const favoris = (favRes.data ?? []) as { created_at: string }[];
      setTotalFavoris(favoris.length);
      setDemarchesEnCours(demRes.count ?? 0);

      const avis = (avisRes.data ?? []) as { note: number; created_at: string }[];
      setTotalAvis(avis.length);
      if (avis.length > 0) setNoteMoyenne(avis.reduce((s, a) => s + (a.note ?? 0), 0) / avis.length);

      // 6 derniers mois — mêmes comptages réels qu'avant (aucun calcul
      // changé), simplement enrichis de favoris/avis du mois pour le détail
      // au tap (§5 du brief V2) : jamais dessinés comme séries
      // supplémentaires sur le graphique, seulement révélés à la demande.
      const maintenant = new Date();
      const buckets: MoisActivite[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
        buckets.push({ label: MOIS_LABEL[d.getMonth()], key: `${d.getFullYear()}-${d.getMonth()}`, rdv: 0, favoris: 0, avis: 0 });
      }
      const bucketDe = (iso: string) => {
        const d = new Date(iso);
        return buckets.find(b => b.key === `${d.getFullYear()}-${d.getMonth()}`);
      };
      for (const r of rdvs) { if (r.date_rdv) { const b = bucketDe(r.date_rdv); if (b) b.rdv += 1; } }
      for (const f of favoris) { if (f.created_at) { const b = bucketDe(f.created_at); if (b) b.favoris += 1; } }
      for (const a of avis) { if (a.created_at) { const b = bucketDe(a.created_at); if (b) b.avis += 1; } }
      setActiviteParMois(buckets);

      if (rdvs.length >= 3) {
        const parSecteur = new Map<string, number>();
        const parEtablissement = new Map<string, number>();
        const nomParEtablissementId = new Map<string, string>();
        const parJour = new Map<number, number>();
        for (const r of rdvs) {
          const secteur = r.institutions?.secteur;
          if (secteur) parSecteur.set(secteur, (parSecteur.get(secteur) ?? 0) + 1);
          const nom = r.institutions?.name;
          if (r.institution_id && nom) {
            parEtablissement.set(r.institution_id, (parEtablissement.get(r.institution_id) ?? 0) + 1);
            nomParEtablissementId.set(r.institution_id, nom);
          }
          if (r.date_rdv) {
            const jour = new Date(r.date_rdv).getDay();
            parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
          }
        }
        const top = <K,>(m: Map<K, number>): K | null => {
          let meilleur: K | null = null, max = 0;
          for (const [k, v] of m) if (v > max) { max = v; meilleur = k; }
          return meilleur;
        };
        const secteur = top(parSecteur);
        setSecteurTop(secteur ? (SECTEUR_LABEL[secteur] ?? secteur) : null);
        const etabId = top(parEtablissement);
        setEtablissementTopId(etabId);
        setEtablissementTop(etabId ? nomParEtablissementId.get(etabId) ?? null : null);
        const jour = top(parJour);
        setJourTop(jour !== null ? JOURS_LABEL[jour] : null);
      }

      const createdAt = userRes.data?.created_at as string | undefined;
      if (createdAt) {
        const mois = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)));
        setMembreDepuis(mois < 1 ? "moins d'un mois" : mois === 1 ? "1 mois" : mois < 24 ? `${mois} mois` : `${Math.round(mois / 12)} ans`);
      }

      setLoading(false);
    })();
  }, [router]);

  const maxMois = Math.max(1, ...activiteParMois.map(m => m.rdv));
  const moisDetail = useMemo(() => activiteParMois.find(m => m.key === moisSelectionne) ?? null, [activiteParMois, moisSelectionne]);
  const moisDetailLabel = useMemo(() => {
    if (!moisDetail) return "";
    const [annee, indexMois] = moisDetail.key.split("-").map(Number);
    return `${MOIS_LABEL_COMPLET[indexMois]} ${annee}`;
  }, [moisDetail]);

  const STATS = [
    { icon: Illu.rdv, valeur: totalRdv, label: "Rendez-vous" },
    { icon: Illu.favoris, valeur: totalFavoris, label: "Favoris" },
    { icon: Illu.avis, valeur: totalAvis, label: noteMoyenne ? `Avis (${noteMoyenne.toFixed(1)}★)` : "Avis" },
    { icon: Illu.demarches, valeur: demarchesEnCours, label: "Démarches en cours" },
  ];

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        @keyframes screenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes barGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
      `}</style>
      <CompteHeader titre="Vos tendances" fondNeutre retourHref="/?menu=1"/>

      {/* ── Hero compact (section 2 du brief) — illustration réduite, sous-titre
          court ; la phrase "Rien d'inventé, rien de deviné" vit désormais dans
          le disclosure "À propos de ces données" plutôt qu'en permanence ici. ── */}
      <div style={{ padding: "18px 20px 2px", textAlign: "center", animation: "screenIn 0.35s ease" }}>
        <div style={{ margin: "0 auto 10px", width: "56px" }}>{Illu.hero(56)}</div>
        <div style={{ color: t1, fontSize: "19px", fontWeight: "900", marginBottom: "3px" }}>Vos tendances</div>
        <div style={{ color: t2, fontSize: "12.5px" }}>Vos chiffres réels sur Yelen</div>
      </div>

      {loading ? (
        <YelenLoaderEcran labelColor={t3}/>
      ) : totalRdv === 0 ? (
        <div style={{ padding: "50px 20px", textAlign: "center", color: t3, fontSize: "13.5px", lineHeight: "1.6" }}>
          Rien à montrer pour l&apos;instant. Prenez votre premier RDV, et on vous montre vos tendances ici.
        </div>
      ) : (
        <div style={{ padding: "14px 20px 40px" }}>

          {/* ── Votre activité — 2×2 compact dans une seule carte (section 3) ── */}
          <div style={{ color: t2, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px", paddingLeft: "4px" }}>Votre activité</div>
          <div style={{ backgroundColor: card, borderRadius: "20px", padding: "18px", marginBottom: "18px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)", animation: "cardIn 0.35s ease both" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: "18px", columnGap: "10px" }}>
              {STATS.map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <div style={{ flexShrink: 0 }}>{s.icon(32)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "18px", fontWeight: "900", lineHeight: 1 }}>{s.valeur}</div>
                    <div style={{ color: t2, fontSize: "10.5px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Votre activité dans le temps — graphique + détail au tap (sections 4 et 5) ── */}
          <div style={{ color: t2, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px", paddingLeft: "4px" }}>Votre activité dans le temps</div>
          <div style={{ backgroundColor: card, borderRadius: "20px", padding: "18px", marginBottom: "18px", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)", animation: "cardIn 0.35s ease 0.06s both" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>Rendez-vous par mois</div>
              {/* Période fixe (retour Bryan 21/09/2026, honnêteté) — un
                  seul intervalle calculé aujourd'hui (6 derniers mois),
                  donc affiché comme une simple étiquette de contexte, sans
                  chevron de menu déroulant qui laisserait croire à d'autres
                  options inexistantes. */}
              <span style={{ color: t3, fontSize: "11px", fontWeight: "700" }}>6 derniers mois</span>
            </div>
            <div style={{ position: "relative", height: "86px" }}>
              <div aria-hidden style={{ position: "absolute", inset: "0 0 22px 0", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {[0, 1, 2].map(i => <div key={i} style={{ borderTop: `1px dashed ${brd}` }}/>)}
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: "100%", gap: "6px" }}>
                {activiteParMois.map((m, i) => {
                  const selectionnable = m.rdv > 0 || m.favoris > 0 || m.avis > 0;
                  const selectionne = moisSelectionne === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => selectionnable && setMoisSelectionne(prev => prev === m.key ? null : m.key)}
                      className={selectionnable ? "tap" : ""}
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", height: "100%", justifyContent: "flex-end", background: "none", border: "none", padding: 0, cursor: selectionnable ? "pointer" : "default" }}
                    >
                      {/* Marqueur de sélection non-couleur (recommandation
                          Apple : jamais une distinction reposant sur la
                          seule couleur) — un point plein au-dessus de la
                          barre active, pas seulement un changement de teinte. */}
                      <span style={{ width: "5px", height: "5px", borderRadius: "3px", background: selectionne ? "#F5A623" : "transparent" }}/>
                      <div style={{ width: "100%", maxWidth: "26px", height: `${Math.max(6, (m.rdv / maxMois) * 60)}px`, borderRadius: "6px", backgroundColor: m.rdv > 0 ? (selectionne ? "#F5A623" : "#7C3AED") : card2, transformOrigin: "bottom", animation: `barGrow 0.5s cubic-bezier(.34,1.56,.64,1) ${0.15 + i * 0.05}s both` }}/>
                      <span style={{ color: selectionne ? t1 : t3, fontSize: "10px", fontWeight: selectionne ? "800" : "700" }}>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Détail au tap (section 5) — niveau d'information
                supplémentaire uniquement : le graphique reste entièrement
                lisible sans cette interaction. */}
            {moisDetail && (
              <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${brd}` }}>
                <div style={{ color: t1, fontSize: "12.5px", fontWeight: "800", marginBottom: "6px" }}>{moisDetailLabel}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                  <span style={{ color: t2, fontSize: "11.5px", fontWeight: "700" }}>{moisDetail.rdv} rendez-vous</span>
                  <span style={{ color: t2, fontSize: "11.5px", fontWeight: "700" }}>{moisDetail.favoris} favori{moisDetail.favoris !== 1 ? "s" : ""}</span>
                  <span style={{ color: t2, fontSize: "11.5px", fontWeight: "700" }}>{moisDetail.avis} avis</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Ce qui revient le plus (section 6) ── */}
          {(secteurTop || etablissementTop || jourTop) && (
            <>
              <div style={{ color: t2, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px", paddingLeft: "4px" }}>Ce qui revient le plus</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
                {secteurTop && (
                  <div style={{ animation: "cardIn 0.35s ease 0.12s both" }}>
                    <InfoRow icon={Illu.secteur} label="Votre secteur préféré" valeur={secteurTop} card={card} isDark={isDark} t1={t1} t2={t2}/>
                  </div>
                )}
                {etablissementTop && (
                  <div style={{ animation: "cardIn 0.35s ease 0.18s both" }}>
                    <InfoRow icon={Illu.etablissement} label="Là où vous allez le plus" valeur={etablissementTop} card={card} isDark={isDark} t1={t1} t2={t2} href={etablissementTopId ? `/institution/${etablissementTopId}?source=tendances` : undefined}/>
                  </div>
                )}
                {jourTop && (
                  <div style={{ animation: "cardIn 0.35s ease 0.24s both" }}>
                    <InfoRow icon={Illu.jour} label="Le jour où vous venez le plus" valeur={jourTop} card={card} isDark={isDark} t1={t1} t2={t2} capitalize/>
                  </div>
                )}
              </div>
            </>
          )}

          {membreDepuis && (
            <div style={{ textAlign: "center", color: t3, fontSize: "12px", marginBottom: "18px" }}>Sur Yelen depuis {membreDepuis}</div>
          )}

          {/* ── À propos de ces données (section 8) — compact, ouvre le détail
              complet en bottom sheet plutôt que de l'imposer dans le flux. ── */}
          <button onClick={() => setAProposOuvert(true)} className="tap" style={{ width: "100%", textAlign: "left", backgroundColor: card, border: "none", borderRadius: "16px", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)" }}>
            <div style={{ flexShrink: 0, marginTop: "1px" }}><IconInfo color={t2}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: t1, fontSize: "13px", fontWeight: "800", marginBottom: "3px" }}>Comment sont calculées vos tendances ?</div>
              <div style={{ color: t2, fontSize: "11.5px", lineHeight: 1.45, marginBottom: "7px" }}>Vos tendances sont basées sur votre activité réelle sur Yelen.</div>
              <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "4px" }}>Voir les détails <IconChevron color="#F5A623"/></div>
            </div>
          </button>
        </div>
      )}

      {/* ── Bottom sheet "À propos de ces données" — même texte réel
          qu'avant, seulement déplacé hors du flux principal. ── */}
      {aProposOuvert && (
        <div onClick={() => setAProposOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: card, borderRadius: "24px 24px 0 0", paddingBottom: "env(safe-area-inset-bottom)", maxHeight: "82vh", overflowY: "auto", animation: "sheetUp 0.28s cubic-bezier(0.34,1.2,0.64,1)", boxShadow: "0 -12px 40px rgba(0,0,0,0.22)" }}>
            <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.14)", margin: "10px auto 0" }}/>
            <div style={{ padding: "16px 22px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ color: t1, fontSize: "16px", fontWeight: "900" }}>D&apos;où viennent ces chiffres</div>
                <button onClick={() => setAProposOuvert(false)} aria-label="Fermer" className="tap" style={{ width: "32px", height: "32px", borderRadius: "50%", border: "none", background: card2, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}>
                  <IconX color={t1}/>
                </button>
              </div>
              <div style={{ color: t2, fontSize: "13px", lineHeight: "1.7" }}>
                On compte. C&apos;est tout. Vos RDV, vos favoris, vos avis, vos démarches : ce sont les vrais chiffres de votre compte, pas une estimation.
                <br/><br/>
                Le graphique, c&apos;est le nombre de RDV que vous avez pris chaque mois, sur les 6 derniers mois. Rien de plus.
                <br/><br/>
                Votre secteur, votre établissement et votre jour &quot;préférés&quot; ? On regarde simplement ce qui revient le plus souvent chez vous. On attend que vous ayez au moins 3 RDV avant de vous le dire — un seul rendez-vous, ça ne fait pas une habitude.
                <br/><br/>
                Pas d&apos;IA ici. Pas de note sur 100. Et on ne vous compare à personne — juste vous, et vos chiffres.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
