"use client";

// Centre d'Analyse (refonte niveau enterprise, brief CEO 04/08/2026) —
// Lot 1 : coquille (header + sous-navigation) + migration réelle des 4
// widgets qui vivaient inline dans page.tsx (TunnelAcquisition,
// HeatmapActivite, CarteGeographique, MiniCRM) — déplacés ici plutôt que
// dupliqués, car un fichier `page.tsx` de l'App Router Next.js ne peut
// exporter que les noms réservés (default, metadata, generateStaticParams,
// ...) : tout export de fonction supplémentaire fait échouer la
// vérification de type des routes générées (`.next/types/**/page.ts`),
// confirmé en pratique lors de ce chantier. RDV/Client/Stats restent des
// `export type` sur page.tsx (les exports de type n'ont pas ce problème,
// ils n'existent pas à l'exécution).
// "Performances" (répartition par appareil) est un stub honnête : aucune
// donnée device/user-agent n'est capturée sur les vues/clics/RDV nulle
// part dans le projet (audit confirmé), donc rien à y afficher avant un
// chantier de tracking dédié. Idem esprit pour la carte "Conseil
// personnalisé" ci-dessous, conservée telle quelle du Lot 1 — c'est déjà
// une recommandation 100% déterministe sur données réelles (zéro LLM), la
// carte "Insight IA" du brief la remplacera au Lot 6.
import { useEffect, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLogo } from "@/components/YelenLogo";
import { YelenLoader } from "@/components/YelenLoader";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { parseLocalDate, SectionHeader, timeAgo } from "../dashboardShared";
import { DEVISE_LABEL } from "@/lib/devise";
import type { RDV, Stats } from "../layout";
import type { VueEnsemble, KpiMetric, PointEvolution, TopOffre, PeriodeJours, CanalStat, AnalyseGeo, RegionStat, PrefectureStat } from "@/lib/analyseAggregation";
import { genererInsightAnalyse, genererInsightClients, genererPointsAttention, type PointAttention } from "@/lib/analyseInsight";
import { GUINEE_REGIONS_GEO, GUINEE_VIEWBOX, GUINEE_CONTOUR_PATH, type RegionKey } from "@/lib/guineeRegionsGeo";
import { REGIONS_GUINEE_LABELS } from "@/lib/villes";
import type { SegmentCount, FrequenceBucket, RfmSegment, ClientAnalyseStat, EvolutionClientsPoint, AnalyseClients, RetentionSemaine, CohorteRetention } from "@/lib/analyseClients";
import type { AnalyseAcquisition, SourceStat, ApresDecouverteStat, EvolutionAcquisitionPoint } from "@/lib/analyseAcquisition";
import { type AcquisitionSource, ACQUISITION_SOURCE_LABELS } from "@/lib/acquisitionSource";
import { SEGMENT_LABELS, type SegmentClient } from "@/lib/segmentsClients";
import type { AnalyseTunnel, PerteEtape, CauseAbandon } from "@/lib/analyseTunnel";
import type { AnalyseHeatmap, HeatmapCell, CreneauInfo, PerformanceJour } from "@/lib/analyseHeatmap";

type SousOnglet = "vue-ensemble" | "acquisition" | "tunnel" | "heatmap" | "geographie" | "mes-clients" | "performances";

const SOUS_ONGLETS: { key: SousOnglet; label: string; icon: React.ReactNode }[] = [
  { key: "vue-ensemble", label: "Vue d'ensemble", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg> },
  { key: "acquisition", label: "Acquisition", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
  { key: "tunnel", label: "Tunnel", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> },
  { key: "heatmap", label: "Heatmap", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { key: "geographie", label: "Géographie", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> },
  { key: "mes-clients", label: "Mes clients", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { key: "performances", label: "Performances", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
];

// ═══════════════════════════════════════════════════════════════════════
// ÉTATS VIDES — illustrations sur mesure Yelen (retour Bryan 15/08/2026)
// Même grammaire visuelle que ClockInShiftTab.tsx (IllustrationEquipe et
// consorts) : halo doré très léger, trait neutre (t3/border2), un seul
// détail accentué en doré. Pensées pour un compte encore jeune (zéro
// donnée sur la période), pas pour une erreur — ton chaleureux mais
// jamais inventé (les faits réels, ex. date de démarrage du tracking
// canal, restent inchangés). Les 2 états positifs (aucune perte, zéro
// refus) utilisent IllustrationSucces avec un ton de félicitation, pas de
// manque.
function IllustrationEntonnoir({ C }: { C: ThemeTokens }) {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M26 30h44l-15 20v16l-14 6V50z" stroke={C.t3} strokeWidth="2" strokeLinejoin="round" strokeDasharray="3 5"/>
      <circle cx="66" cy="60" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M62 60h8M66 56v8" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}
function IllustrationCarte({ C }: { C: ThemeTokens }) {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M48 24c-9 0-16 7-16 16 0 12 16 28 16 28s16-16 16-28c0-9-7-16-16-16z" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <circle cx="48" cy="40" r="6" stroke={C.t3} strokeWidth="2"/>
      <circle cx="70" cy="66" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M70 61v10M65 66h10" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}
function IllustrationCourbe({ C }: { C: ThemeTokens }) {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M20 62c8 0 8-16 16-16s8 20 16 20 8-24 16-24" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeDasharray="1 6"/>
      <line x1="20" y1="70" x2="76" y2="70" stroke={C.border2} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="68" cy="42" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M63 45l4-6 3 3 4-5" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationDonut({ C }: { C: ThemeTokens }) {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="44" cy="48" r="20" fill="none" stroke={C.t3} strokeWidth="9" strokeDasharray="6 7"/>
      <circle cx="70" cy="62" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M66 62h8M70 58v8" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}
function IllustrationPulse({ C }: { C: ThemeTokens }) {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M22 50h12l6-14 8 24 6-16 5 6h15" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="70" cy="30" r="10" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <circle cx="70" cy="30" r="2" fill={C.gold}/>
    </svg>
  );
}
function IllustrationSucces({ C }: { C: ThemeTokens }) {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M48 22l20 8v16c0 14-9 22-20 28-11-6-20-14-20-28V30z" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M39 48l6 6 12-13" stroke={C.gold} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function EmptyState({ C, illustration, titre, texte }: {
  C: ThemeTokens; illustration: React.ReactNode; titre: string; texte: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: "32px 16px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>{illustration}</div>
      <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "5px" }}>{titre}</div>
      <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6, maxWidth: "300px", margin: "0 auto" }}>{texte}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TUNNEL D'ACQUISITION
// ═══════════════════════════════════════════════════════════════════════
const ICON_CALENDAR = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const ICON_CHECK_CIRCLE = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const ICON_FLAG = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4a1 1 0 0 1 1-1h11.5l-1 5 1 5H6"/></svg>;
const ICON_ARROW_DOWN = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;

// Funnel horizontal façon Amplitude/Mixpanel — largeur de barre proportionnelle
// au volume mais jamais invisible (plancher 6% dès qu'une étape a au moins 1
// résultat, sinon l'ancienne version rendait une barre de ~1px illisible dès
// que l'échantillon était petit, cas réel constaté en local sur ce compte).
// Chaque connecteur affiche la perte réelle (compte + %) entre deux étapes
// plutôt qu'un simple chevron muet.
function TunnelAcquisition({ rdvs }: { rdvs: RDV[] }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const demandes = rdvs.length;
  const refuses = rdvs.filter(r => r.statut === "refuse").length;
  const annules = rdvs.filter(r => r.statut === "annule").length;
  const confirmes = rdvs.filter(r => ["confirme", "effectue", "termine", "honore"].includes(r.statut)).length;
  const termines = rdvs.filter(r => ["effectue", "termine", "honore"].includes(r.statut)).length;
  const etapes = [
    { label: "Demandes RDV", value: demandes, color: C.gold, icon: ICON_CALENDAR, desc: "Citoyens ayant soumis une demande de RDV" },
    { label: "RDV confirmés", value: confirmes, color: C.green, icon: ICON_CHECK_CIRCLE, desc: "Demandes acceptées et confirmées" },
    { label: "RDV terminés", value: termines, color: C.blue, icon: ICON_FLAG, desc: "Consultations effectivement réalisées" },
  ];
  const maxVal = Math.max(demandes, 1);
  const conversionGlobale = demandes > 0 ? Math.round((termines / demandes) * 1000) / 10 : 0;

  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
      <SectionHeader label="Tunnel d'Acquisition" accent={C.blue} />
      <p style={{ color: C.t3, fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>Taux de transformation de vos demandes de RDV, sur la période sélectionnée. Données réelles issues de votre activité.</p>

      {demandes > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "8px", marginBottom: "18px" }}>
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ color: C.t1, fontSize: "17px", fontWeight: 800 }}>{demandes}</div>
            <div style={{ color: C.t3, fontSize: "9.5px", marginTop: "2px" }}>Demandes reçues</div>
          </div>
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ color: conversionGlobale >= 50 ? C.green : conversionGlobale >= 20 ? C.orange : C.red, fontSize: "17px", fontWeight: 800 }}>{conversionGlobale}%</div>
            <div style={{ color: C.t3, fontSize: "9.5px", marginTop: "2px" }}>Conversion globale</div>
          </div>
          {(refuses + annules) > 0 && (
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
              <div style={{ color: C.red, fontSize: "17px", fontWeight: 800 }}>{refuses + annules}</div>
              <div style={{ color: C.t3, fontSize: "9.5px", marginTop: "2px" }}>Refusées / annulées</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {etapes.map((e, i) => {
          const pct = e.value > 0 ? Math.max((e.value / maxVal) * 100, 6) : 0;
          const precedent = i > 0 ? etapes[i - 1].value : e.value;
          const convRate = i > 0 ? (precedent > 0 ? Math.round((e.value / precedent) * 1000) / 10 : 0) : 100;
          const perte = i > 0 ? precedent - e.value : 0;
          return (
            <div key={e.label}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "9px", backgroundColor: `${e.color}18`, color: e.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{e.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "2px", gap: "8px" }}>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{e.label}</span>
                    <span style={{ color: e.color, fontSize: "17px", fontWeight: 800, flexShrink: 0 }}>{e.value.toLocaleString("fr-FR")}</span>
                  </div>
                  <span style={{ color: C.t3, fontSize: "10.5px" }}>{e.desc}</span>
                </div>
              </div>
              <div style={{ height: "10px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "5px", overflow: "hidden", marginLeft: "40px" }}>
                <div style={{ height: "100%", width: `${pct}%`, backgroundColor: e.color, borderRadius: "5px", transition: "width 0.3s ease" }}/>
              </div>
              {i < etapes.length - 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0 8px 40px", color: C.t3 }}>
                  {ICON_ARROW_DOWN}
                  {perte > 0 ? (
                    <span style={{ color: C.red, fontSize: "10.5px", fontWeight: 700 }}>-{perte} perdu{perte > 1 ? "s" : ""} ({100 - convRate}%)</span>
                  ) : (
                    <span style={{ color: C.green, fontSize: "10.5px", fontWeight: 700 }}>Aucune perte à cette étape</span>
                  )}
                  <span style={{ color: C.t3, fontSize: "10.5px" }}>· {convRate}% de conversion</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {demandes === 0 && (
        <EmptyState C={C} illustration={<IllustrationEntonnoir C={C}/>}
          titre="Pas encore de demandes sur cette période"
          texte="Dès qu'un citoyen prendra rendez-vous, vous verrez ici tout le chemin parcouru — de la demande jusqu'au rendez-vous honoré."/>
      )}
    </Card>
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
    <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
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
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CARTE GÉOGRAPHIQUE
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// GÉOGRAPHIE — SIG simplifié (carte interactive réelle + classement)
// ═══════════════════════════════════════════════════════════════════════
// Carte des 8 régions administratives réelles (frontières officielles
// ADM1, geoBoundaries, fournies par Bryan le 04/08/2026 — cf.
// lib/guineeRegionsGeo.ts). Pas de choroplèthe par préfecture : aucune
// frontière ADM2 (33 préfectures) n'est disponible dans le projet, donc
// la carte colore les 8 régions et le classement détaille les préfectures
// en dessous (tableau). "Meilleur établissement" du brief n'a pas de sens
// dans un dashboard mono-institution (une seule institution regarde ses
// propres données) — remplacé par "meilleure préfecture" de la région.
function couleurIntensite(pct: number, C: ThemeTokens): string {
  if (pct <= 0) return C.bg3;
  if (pct < 20) return C.blue;
  if (pct < 45) return C.green;
  if (pct < 70) return C.orange;
  return C.red;
}

function TendanceBadge({ tendance, delta, C }: { tendance: PrefectureStat["tendance"]; delta: number | null; C: ThemeTokens }) {
  if (tendance === "hausse") return <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: C.green, fontSize: "10px", fontWeight: 800 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>+{delta}%</span>;
  if (tendance === "baisse") return <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: C.red, fontSize: "10px", fontWeight: 800 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>{delta}%</span>;
  return <span style={{ color: C.t3, fontSize: "10px", fontWeight: 700 }}>Stable</span>;
}

function GeoKpiCard({ label, valeur, sousLabel, color, C }: { label: string; valeur: string; sousLabel?: string; color: string; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="12px 14px">
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, marginBottom: "6px" }}>{label}</div>
      <div style={{ color, fontSize: "16px", fontWeight: 800, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{valeur}</div>
      {sousLabel && <div style={{ color: C.t3, fontSize: "9.5px", marginTop: "3px" }}>{sousLabel}</div>}
    </Card>
  );
}

function CarteInteractiveGuinee({ regions, prefectures, selected, onSelect, C }: {
  regions: RegionStat[]; prefectures: PrefectureStat[]; selected: string | null; onSelect: (r: string) => void; C: ThemeTokens;
}) {
  const [survol, setSurvol] = useState<string | null>(null);
  const maxRdv = Math.max(1, ...regions.map(r => r.rdv));
  const statParRegion: Record<string, RegionStat> = {};
  regions.forEach(r => { statParRegion[r.region] = r; });
  const actif = survol ?? selected;
  const statActif = actif ? statParRegion[actif] : null;
  const meilleurePrefecture = actif ? prefectures.filter(p => p.region === actif).sort((a, b) => b.rdv - a.rdv)[0] : null;

  return (
    <div>
      <svg viewBox={GUINEE_VIEWBOX} style={{ width: "100%", height: "auto", maxHeight: "320px", display: "block" }}>
        {(Object.keys(GUINEE_REGIONS_GEO) as RegionKey[]).map(key => {
          const geo = GUINEE_REGIONS_GEO[key];
          const stat = statParRegion[key];
          const pct = stat ? (stat.rdv / maxRdv) * 100 : 0;
          const estActif = actif === key;
          return (
            <path key={key} d={geo.path}
              fill={couleurIntensite(pct, C)}
              stroke={estActif ? C.t1 : C.bg}
              strokeWidth={estActif ? 1.6 : 0.6}
              style={{ cursor: "pointer", transition: "fill 0.15s ease" }}
              onMouseEnter={() => setSurvol(key)}
              onMouseLeave={() => setSurvol(null)}
              onClick={() => onSelect(key)}
            />
          );
        })}
        {/* Contour doré Yelen — forme EXACTE de la Guinée (décision CEO
            06/08/2026), tracée depuis le GeoJSON officiel réel
            (geoBoundaries ADM0, fourni par Bryan le 06/08/2026), projeté
            avec la même transformation que les 8 régions ci-dessus donc
            parfaitement aligné avec elles. Jamais interactif
            (pointerEvents none) pour ne pas intercepter le survol/clic des
            régions en dessous. */}
        <path d={GUINEE_CONTOUR_PATH} fill="none" stroke={C.gold} strokeWidth={2} strokeLinejoin="round" pointerEvents="none"/>
      </svg>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
        {[{ l: "Très faible", c: C.bg3 }, { l: "Faible", c: C.blue }, { l: "Moyenne", c: C.green }, { l: "Élevée", c: C.orange }, { l: "Très élevée", c: C.red }].map(s => (
          <span key={s.l} style={{ display: "flex", alignItems: "center", gap: "4px", color: C.t3, fontSize: "9.5px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: s.c, display: "inline-block" }}/>{s.l}
          </span>
        ))}
      </div>

      <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px", marginTop: "12px", minHeight: "76px" }}>
        {!statActif ? (
          <div style={{ color: C.t3, fontSize: "11px", textAlign: "center", padding: "8px 0" }}>Survolez ou cliquez une région pour voir son détail.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>{statActif.label}</span>
              {statActif.delta !== null && <TendanceBadge tendance={statActif.delta > 5 ? "hausse" : statActif.delta < -5 ? "baisse" : "stable"} delta={statActif.delta} C={C}/>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
              <div><div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{statActif.citoyens}</div><div style={{ color: C.t3, fontSize: "9px" }}>Citoyens</div></div>
              <div><div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{statActif.rdv}</div><div style={{ color: C.t3, fontSize: "9px" }}>RDV</div></div>
              <div><div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{statActif.prefecturesCouvertes}</div><div style={{ color: C.t3, fontSize: "9px" }}>Préfectures touchées</div></div>
            </div>
            {meilleurePrefecture && <div style={{ color: C.t3, fontSize: "10.5px" }}>Meilleure préfecture : <strong style={{ color: C.t2 }}>{meilleurePrefecture.ville}</strong> ({meilleurePrefecture.rdv} RDV, {meilleurePrefecture.tauxConfirmation}% conversion)</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ClassementPrefectures({ prefectures, C }: { prefectures: PrefectureStat[]; C: ThemeTokens }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", minWidth: "560px" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["#", "Préfecture", "Région", "Citoyens", "RDV", "Conversion", "Tendance", ""].map(h => (
              <th key={h} style={{ textAlign: h === "Préfecture" ? "left" : "right", color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", padding: "8px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {prefectures.map((p, i) => (
            <tr key={p.ville} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "8px 6px", color: C.t3, fontWeight: 700 }}>{i + 1}</td>
              <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 700, whiteSpace: "nowrap" }}>{p.ville}</td>
              <td style={{ padding: "8px 6px", color: C.t3, textAlign: "right", whiteSpace: "nowrap" }}>{REGIONS_GUINEE_LABELS[p.region] ?? p.region}</td>
              <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right" }}>{p.citoyens}</td>
              <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 800, textAlign: "right" }}>{p.rdv}</td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>
                <span style={{ color: p.tauxConfirmation >= 60 ? C.green : p.tauxConfirmation >= 30 ? C.orange : C.red, fontWeight: 800, backgroundColor: `${p.tauxConfirmation >= 60 ? C.green : p.tauxConfirmation >= 30 ? C.orange : C.red}15`, padding: "1px 6px", borderRadius: "8px" }}>{p.tauxConfirmation}%</span>
              </td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}><TendanceBadge tendance={p.tendance} delta={p.deltaRdv} C={C}/></td>
              <td style={{ padding: "8px 6px", width: "70px" }}><Sparkline serie={p.serie} color={p.tendance === "hausse" ? C.green : p.tendance === "baisse" ? C.red : C.t3}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CarteGeographique({ geo }: { geo: AnalyseGeo | null }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [regionSelectionnee, setRegionSelectionnee] = useState<string | null>(null);

  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
      <SectionHeader label="Géographie" accent={C.teal}/>
      <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Où se trouvent vos citoyens — répartition réelle par région et préfecture (frontières administratives officielles de la Guinée), sur la période sélectionnée.</p>

      {geo === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div>
      ) : geo.prefectures.length === 0 ? (
        <EmptyState C={C} illustration={<IllustrationCarte C={C}/>}
          titre="Aucun rendez-vous à situer sur cette période"
          texte="La carte s'animera dès vos premiers rendez-vous, région par région, pour voir où se trouvent vraiment vos citoyens."/>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px", marginBottom: "16px" }}>
            <GeoKpiCard C={C} color={C.teal} label="Préfectures couvertes" valeur={`${geo.prefecturesCouvertes} / ${geo.prefecturesCouvertesTotal}`} sousLabel={geo.prefecturesCouvertesDeltaAbs !== 0 ? `${geo.prefecturesCouvertesDeltaAbs > 0 ? "+" : ""}${geo.prefecturesCouvertesDeltaAbs} vs période préc.` : undefined}/>
            <GeoKpiCard C={C} color={C.gold} label="Région dominante" valeur={geo.regionDominante?.label ?? "—"} sousLabel={geo.regionDominante ? `${geo.regionDominante.pct}% du trafic` : undefined}/>
            <GeoKpiCard C={C} color={C.purple} label="Nouveaux citoyens" valeur={String(geo.nouveauxCitoyens)} sousLabel="vs période précédente"/>
            <GeoKpiCard C={C} color={geo.croissanceGeo !== null && geo.croissanceGeo >= 0 ? C.green : C.red} label="Croissance géographique" valeur={geo.croissanceGeo !== null ? `${geo.croissanceGeo > 0 ? "+" : ""}${geo.croissanceGeo}%` : "—"}/>
            <GeoKpiCard C={C} color={C.green} label="Préfecture en progression" valeur={geo.prefectureEnProgression?.ville ?? "—"} sousLabel={geo.prefectureEnProgression ? `+${geo.prefectureEnProgression.delta}%` : undefined}/>
            <GeoKpiCard C={C} color={C.orange} label="Préfecture à développer" valeur={geo.prefectureADevelopper?.ville ?? "—"} sousLabel={geo.prefectureADevelopper ? `${geo.prefectureADevelopper.tauxConfirmation}% conversion` : undefined}/>
          </div>

          <CarteInteractiveGuinee regions={geo.regions} prefectures={geo.prefectures} selected={regionSelectionnee} onSelect={r => setRegionSelectionnee(p => p === r ? null : r)} C={C}/>

          <div style={{ marginTop: "16px" }}>
            <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 800, marginBottom: "10px" }}>Classement des préfectures</div>
            <ClassementPrefectures prefectures={regionSelectionnee ? geo.prefectures.filter(p => p.region === regionSelectionnee) : geo.prefectures} C={C}/>
          </div>
        </>
      )}
    </Card>
  );
}

// Mini-sparkline SVG à la MesOffresPerformanceChart.tsx — polyline manuelle,
// aucune librairie de charts dans le projet.
function Sparkline({ serie, color }: { serie: number[]; color: string }) {
  if (serie.length < 2) return null;
  const max = Math.max(...serie, 1);
  const points = serie.map((v, i) => {
    const x = (i / (serie.length - 1)) * 100;
    const y = 28 - (v / max) * 24 - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width: "100%", height: "28px", display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DeltaLabel({ delta, unite, C }: { delta: number | null; unite: "%" | "pts"; C: ThemeTokens }) {
  if (delta === null) return <span style={{ color: C.t3, fontSize: "10px" }}>Pas de comparaison disponible</span>;
  const positif = delta >= 0;
  return (
    <span style={{ color: positif ? C.green : C.red, fontSize: "10px", fontWeight: 700 }}>
      {positif ? "+" : ""}{delta}{unite === "pts" ? " pts" : "%"} vs période précédente
    </span>
  );
}

function KpiCard({ label, icon, color, metric, unite, format, C }: {
  label: string;
  icon: React.ReactNode;
  color: string;
  metric: KpiMetric | null;
  unite: "%" | "pts";
  format?: (v: number) => string;
  C: ThemeTokens;
}) {
  const valeurAffichee = metric === null ? null : metric.valeur === null ? "—" : (format ? format(metric.valeur) : metric.valeur.toLocaleString("fr-FR"));
  return (
    <Card tokens={toCardTokens(C)} padding="14px" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "26px", height: "26px", borderRadius: "8px", backgroundColor: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 700 }}>{label}</span>
      </div>
      {valeurAffichee === null ? (
        <div style={{ display: "flex", alignItems: "center", height: "20px" }}><YelenLoader size={16} color={color}/></div>
      ) : (
        <div style={{ color: C.t1, fontSize: "20px", fontWeight: 800, lineHeight: 1 }}>{valeurAffichee}</div>
      )}
      {metric !== null && metric.valeur !== null && <DeltaLabel delta={metric.delta} unite={unite} C={C}/>}
      {metric !== null && metric.valeur !== null && metric.serie.some(v => v > 0) && <Sparkline serie={metric.serie} color={color}/>}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ÉVOLUTION DES PERFORMANCES (3 courbes)
// ═══════════════════════════════════════════════════════════════════════
const EVOL_WIDTH = 600;
const EVOL_HEIGHT = 220;
const EVOL_PAD = 10;

function toEvolPolyline(data: PointEvolution[], key: "vues" | "clics" | "conversions", maxVal: number): string {
  if (data.length === 0) return "";
  const stepX = data.length > 1 ? (EVOL_WIDTH - EVOL_PAD * 2) / (data.length - 1) : 0;
  return data.map((d, i) => {
    const x = EVOL_PAD + i * stepX;
    const y = EVOL_HEIGHT - EVOL_PAD - (d[key] / maxVal) * (EVOL_HEIGHT - EVOL_PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

const PLAGES_EVOLUTION = [
  { key: 7, label: "7 jours" },
  { key: 30, label: "30 jours" },
  { key: 90, label: "90 jours" },
  { key: 365, label: "1 an" },
] as const;

function EvolutionPerformances({ jours, C }: { jours: PointEvolution[] | null; C: ThemeTokens }) {
  const [range, setRange] = useState<7 | 30 | 90 | 365>(30);
  const data = (jours ?? []).slice(-range);
  const maxVal = Math.max(1, ...data.map(d => Math.max(d.vues, d.clics, d.conversions)));
  const totaux = data.reduce((acc, d) => ({ vues: acc.vues + d.vues, clics: acc.clics + d.clics, conversions: acc.conversions + d.conversions }), { vues: 0, clics: 0, conversions: 0 });
  const vide = jours === null || data.length === 0 || (totaux.vues === 0 && totaux.clics === 0 && totaux.conversions === 0);

  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>Évolution des performances</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {PLAGES_EVOLUTION.map(p => (
            <button key={p.key} onClick={() => setRange(p.key)} className="tap" style={{ backgroundColor: range === p.key ? `${C.blue}15` : C.bgCard2, border: `1px solid ${range === p.key ? C.blue + "50" : C.border}`, borderRadius: "10px", padding: "6px 12px", color: range === p.key ? C.blue : C.t2, fontSize: "11px", fontWeight: range === p.key ? 800 : 600, cursor: "pointer" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "16px", margin: "10px 0" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "11px", fontWeight: 700 }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.purple, display: "inline-block" }}/>Vues ({totaux.vues.toLocaleString("fr-FR")})</span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "11px", fontWeight: 700 }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.orange, display: "inline-block" }}/>Clics ({totaux.clics.toLocaleString("fr-FR")})</span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "11px", fontWeight: 700 }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.green, display: "inline-block" }}/>Conversions ({totaux.conversions.toLocaleString("fr-FR")})</span>
      </div>
      {vide ? (
        <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {jours === null ? <YelenLoader size={26}/> : (
            <EmptyState C={C} illustration={<IllustrationCourbe C={C}/>}
              titre="Rien à tracer pour l'instant"
              texte="Vues, clics et conversions apparaîtront ici jour après jour, dès que votre présence sur Yelen commencera à être consultée."/>
          )}
        </div>
      ) : (
        <svg viewBox={`0 0 ${EVOL_WIDTH} ${EVOL_HEIGHT}`} preserveAspectRatio="none" style={{ width: "100%", height: "220px" }}>
          <polyline points={toEvolPolyline(data, "vues", maxVal)} fill="none" stroke={C.purple} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          <polyline points={toEvolPolyline(data, "clics", maxVal)} fill="none" stroke={C.orange} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          <polyline points={toEvolPolyline(data, "conversions", maxVal)} fill="none" stroke={C.green} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RÉPARTITION PAR CANAL (stub) + TOP OFFRES PERFORMANTES
// ═══════════════════════════════════════════════════════════════════════
// Donut multi-segment fait main (aucune lib de charts dans le projet) —
// un <circle> par canal, stroke-dasharray/dashoffset pour découper le
// cercle en arcs proportionnels. Canal réel capturé depuis le 04/08/2026
// (app/offres/[id]/page.tsx + lib/canalAcquisition.ts) : toute vue
// antérieure tombe dans "Autres" (canal NULL en base), jamais un chiffre
// inventé. État vide honnête tant qu'aucune vue n'a encore été trackée.
const CANAL_COULEURS = (C: ThemeTokens) => [C.blue, C.orange, C.green, C.gold, C.purple, C.teal];

function RepartitionCanal({ canaux, C }: { canaux: CanalStat[] | null; C: ThemeTokens }) {
  const R = 38;
  const CIRC = 2 * Math.PI * R;
  const total = (canaux ?? []).reduce((s, c) => s + c.count, 0);
  const couleurs = CANAL_COULEURS(C);
  // Décalages cumulés du donut précalculés immutablement (pas de variable
  // réassignée pendant le rendu — react-hooks/immutability) : chaque
  // élément est la somme des fractions des segments précédents.
  const cumules = (canaux ?? []).reduce<{ list: number[]; running: number }>((state, c) => (
    { list: [...state.list, state.running], running: state.running + c.count / total }
  ), { list: [], running: 0 }).list;

  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Répartition par canal</div>
      {canaux === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div>
      ) : total === 0 ? (
        <EmptyState C={C} illustration={<IllustrationDonut C={C}/>}
          titre="Pas encore de canal identifié"
          texte="Aucune vue trackée avec canal sur cette période. Le suivi par canal démarre le 04/08/2026 — les visites antérieures n'ont pas cette donnée."/>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
          <svg width="110" height="110" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
            <circle cx="50" cy="50" r={R} fill="none" stroke={C.bg3} strokeWidth="14"/>
            {canaux.map((c, i) => {
              const frac = c.count / total;
              const dash = frac * CIRC;
              const offset = -(cumules[i] * CIRC);
              return (
                <circle key={c.canal} cx="50" cy="50" r={R} fill="none" stroke={couleurs[i % couleurs.length]} strokeWidth="14"
                  strokeDasharray={`${dash} ${CIRC - dash}`} strokeDashoffset={offset} transform="rotate(-90 50 50)"/>
              );
            })}
            <text x="50" y="47" textAnchor="middle" fontSize="15" fontWeight="900" fill={C.t1}>{total.toLocaleString("fr-FR")}</text>
            <text x="50" y="61" textAnchor="middle" fontSize="7" fill={C.t3}>Vues</text>
          </svg>
          <div style={{ flex: 1, minWidth: "160px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {canaux.map((c, i) => (
              <div key={c.canal} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: couleurs[i % couleurs.length], flexShrink: 0 }}/>
                <span style={{ flex: 1, color: C.t2, fontSize: "11.5px", fontWeight: 600 }}>{c.label}</span>
                <span style={{ color: C.t1, fontSize: "11.5px", fontWeight: 800 }}>{c.pct}%</span>
                <span style={{ color: C.t3, fontSize: "10px", width: "36px", textAlign: "right" }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function TopOffresPerformantes({ offres, C }: { offres: TopOffre[] | null; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Top offres performantes</div>
      {offres === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div>
      ) : offres.length === 0 ? (
        <EmptyState C={C} illustration={<IllustrationDonut C={C}/>}
          titre="Vos offres n'ont pas encore d'historique"
          texte="Publiez une offre ou une annonce, et son nombre de vues, de clics et son taux de clic apparaîtront ici pour vous aider à voir ce qui marche."/>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {offres.map(o => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {o.image_url ? (
                <div style={{ position: "relative", width: "40px", height: "40px", borderRadius: "8px", overflow: "hidden", flexShrink: 0 }}><Image src={o.image_url} alt="" fill sizes="40px" style={{ objectFit: "cover" }}/></div>
              ) : (
                <div style={{ width: "40px", height: "40px", borderRadius: "8px", backgroundColor: C.bg3, flexShrink: 0 }}/>
              )}
              <span style={{ flex: 1, minWidth: 0, color: C.t1, fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.titre}</span>
              <span style={{ color: C.t3, fontSize: "11px", flexShrink: 0, width: "56px", textAlign: "right" }}>{o.vues} vues</span>
              <span style={{ color: C.t3, fontSize: "11px", flexShrink: 0, width: "52px", textAlign: "right" }}>{o.clics} clics</span>
              <span style={{ color: C.green, fontSize: "11px", fontWeight: 800, flexShrink: 0, width: "48px", textAlign: "right" }}>{o.ctr}% CTR</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OBJECTIFS ATTEINTS + ACTIVITÉS RÉCENTES
// ═══════════════════════════════════════════════════════════════════════
// Cibles heuristiques — même convention que ObjectifsHebdo (page.tsx,
// écran Accueil) : "battez votre propre volume" pour les RDV, seuils
// ronds pour conversion/satisfaction. Ce ne sont pas des données
// inventées sur l'état réel (l'actuel l'est toujours), juste des objectifs
// de référence déjà utilisés ailleurs dans le produit.
function ObjectifsAtteints({ vueEnsemble, C }: { vueEnsemble: VueEnsemble | null; C: ThemeTokens }) {
  const rdvActuel = vueEnsemble?.rdvGeneres.valeur ?? 0;
  const convActuel = vueEnsemble?.tauxConversion.valeur ?? 0;
  const satisfactionPct = vueEnsemble?.satisfaction.valeur !== null && vueEnsemble?.satisfaction.valeur !== undefined
    ? Math.round((vueEnsemble.satisfaction.valeur / 5) * 100)
    : null;

  const objectifs = [
    { label: "Générer des RDV", actuel: rdvActuel, cible: Math.max(rdvActuel + 3, 10), unite: "", color: C.green },
    { label: "Taux de conversion", actuel: convActuel, cible: 80, unite: "%", color: C.blue },
    ...(satisfactionPct !== null ? [{ label: "Satisfaction clients", actuel: satisfactionPct, cible: 85, unite: "%", color: C.gold }] : []),
  ];

  return (
    <Card tokens={toCardTokens(C)} padding="16px">
      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Objectifs atteints</div>
      {vueEnsemble === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {objectifs.map(obj => {
            const pct = Math.min((obj.actuel / Math.max(obj.cible, 1)) * 100, 100);
            return (
              <div key={obj.label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ color: C.t2, fontSize: "12px", fontWeight: 700 }}>{obj.label}</span>
                  <span style={{ color: obj.color, fontSize: "11px", fontWeight: 800 }}>{obj.actuel}{obj.unite} / {obj.cible}{obj.unite} · {Math.round(pct)}%</span>
                </div>
                <div style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, backgroundColor: obj.color, borderRadius: "3px" }}/>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ActivitesRecentes({ stats, C }: { stats: Stats; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} noPadding>
      <div style={{ padding: "16px 16px 12px" }}>
        <span style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>Activités récentes</span>
      </div>
      {stats.recent_activity.length === 0 ? (
        <EmptyState C={C} illustration={<IllustrationPulse C={C}/>}
          titre="Calme plat pour le moment"
          texte="Un nouvel avis, un rendez-vous confirmé, une action de votre équipe... tout ce qui bouge sur votre espace apparaîtra ici en temps réel."/>
      ) : stats.recent_activity.slice(0, 6).map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: i < Math.min(stats.recent_activity.length, 6) - 1 ? `1px solid ${C.border}` : "none" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: a.color, flexShrink: 0 }}/>
          <div style={{ flex: 1, color: C.t2, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</div>
          <span style={{ color: C.t3, fontSize: "10px", flexShrink: 0 }}>{a.time}</span>
        </div>
      ))}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SÉLECTEUR DE PÉRIODE GLOBAL (en-tête)
// ═══════════════════════════════════════════════════════════════════════
// Pilote les KPI "Vue d'ensemble" + "Top offres performantes" (le
// graphique d'évolution garde son propre sélecteur 7j/30j/90j/1an, déjà
// construit au Lot 3 — même presets, deux contrôles indépendants comme
// dans la maquette). Pas de bouton "Filtres" : aucune dimension réelle à
// filtrer n'existe encore (canal/appareil sont des stubs) — un bouton
// décoratif sans effet aurait été un faux affordance, contraire aux
// règles UI du projet.
function formatDateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function PeriodeSelector({ periodeJours, onChange, C }: { periodeJours: PeriodeJours; onChange: (j: PeriodeJours) => void; C: ThemeTokens }) {
  const [nowTick] = useState(() => Date.now());
  const fin = new Date(nowTick);
  const debut = new Date(nowTick - periodeJours * 86400000);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <span style={{ color: C.t3, fontSize: "10.5px" }}>{formatDateFr(debut)} – {formatDateFr(fin)}</span>
      <select value={periodeJours} onChange={e => onChange(Number(e.target.value) as PeriodeJours)} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "7px 10px", color: C.t1, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
        <option value={7}>7 derniers jours</option>
        <option value={30}>30 derniers jours</option>
        <option value={90}>90 derniers jours</option>
        <option value={365}>Cette année</option>
      </select>
    </div>
  );
}

function PerformancesStub({ C }: { C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Performances par appareil</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "24px 8px", textAlign: "center" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6, maxWidth: "260px" }}>Bientôt disponible — nécessite de capturer le type d&apos;appareil sur les visites, pas encore suivi aujourd&apos;hui.</div>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MES CLIENTS — Customer Analytics (PAS un CRM, décision CEO 04/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// Comprendre le comportement de la clientèle (segments, fidélisation,
// évolution) — jamais gérer une fiche (ça reste MesClientsTab.tsx, écran
// séparé). Lecture seule stricte : aucune note, aucune coordonnée
// détaillée, aucune action de modification ici.
function segmentCouleur(segment: SegmentClient, C: ThemeTokens): string {
  const map: Record<SegmentClient, string> = { nouveau: C.blue, occasionnel: C.teal, fidele: C.green, vip: C.gold, inactif: C.t3 };
  return map[segment];
}

function DonutSegments({ segments, C }: { segments: SegmentCount[]; C: ThemeTokens }) {
  const R = 38, CIRC = 2 * Math.PI * R;
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  if (total === 0) return (
    <EmptyState C={C} illustration={<IllustrationDonut C={C}/>}
      titre="Pas encore de clients à segmenter"
      texte="Dès vos premiers rendez-vous honorés, vos clients seront classés ici — nouveaux, fidèles, VIP — pour mieux comprendre qui vous fait confiance."/>
  );
  // Décalages cumulés précalculés immutablement (voir RepartitionCanal ci-dessus).
  const cumules = segments.reduce<{ list: number[]; running: number }>((state, seg) => (
    { list: [...state.list, state.running], running: state.running + seg.count / total }
  ), { list: [], running: 0 }).list;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
      <svg width="110" height="110" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke={C.bg3} strokeWidth="14"/>
        {segments.map((seg, i) => {
          const frac = seg.count / total;
          const dash = frac * CIRC;
          const offset = -(cumules[i] * CIRC);
          return <circle key={seg.segment} cx="50" cy="50" r={R} fill="none" stroke={segmentCouleur(seg.segment, C)} strokeWidth="14" strokeDasharray={`${dash} ${CIRC - dash}`} strokeDashoffset={offset} transform="rotate(-90 50 50)"/>;
        })}
        <text x="50" y="47" textAnchor="middle" fontSize="15" fontWeight="900" fill={C.t1}>{total}</text>
        <text x="50" y="61" textAnchor="middle" fontSize="7" fill={C.t3}>Clients</text>
      </svg>
      <div style={{ flex: 1, minWidth: "160px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {segments.map(seg => (
          <div key={seg.segment} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: segmentCouleur(seg.segment, C), flexShrink: 0 }}/>
            <span style={{ flex: 1, color: C.t2, fontSize: "11.5px", fontWeight: 600 }}>{seg.label}</span>
            <span style={{ color: C.t1, fontSize: "11.5px", fontWeight: 800 }}>{seg.pct}%</span>
            <span style={{ color: C.t3, fontSize: "10px", width: "30px", textAlign: "right" }}>{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FidelisationHisto({ fidelisation, C }: { fidelisation: FrequenceBucket[]; C: ThemeTokens }) {
  const max = Math.max(1, ...fidelisation.map(b => b.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {fidelisation.map(b => (
        <div key={b.label}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ color: C.t2, fontSize: "12px", fontWeight: 700 }}>{b.label}</span>
            <span style={{ color: C.t1, fontSize: "11px", fontWeight: 800 }}>{b.pct}% · {b.count}</span>
          </div>
          <div style={{ height: "8px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max((b.count / max) * 100, b.count > 0 ? 4 : 0)}%`, backgroundColor: C.purple, borderRadius: "4px" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function rfmCouleur(cle: RfmSegment["cle"], C: ThemeTokens): string {
  const map: Record<RfmSegment["cle"], string> = { tres_recents: C.blue, actifs: C.teal, vip: C.gold, a_risque: C.orange, perdus: C.red };
  return map[cle];
}

function AnalyseRfm({ rfm, C }: { rfm: RfmSegment[]; C: ThemeTokens }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "8px" }}>
      {rfm.map(seg => (
        <div key={seg.cle} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px", borderLeft: `3px solid ${rfmCouleur(seg.cle, C)}` }}>
          <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800 }}>{seg.count}</div>
          <div style={{ color: rfmCouleur(seg.cle, C), fontSize: "10.5px", fontWeight: 800, marginTop: "2px" }}>{seg.label}</div>
          <div style={{ color: C.t3, fontSize: "9.5px", marginTop: "3px", lineHeight: 1.4 }}>{seg.description}</div>
        </div>
      ))}
    </div>
  );
}

function TopClientsTable({ topClients, C }: { topClients: ClientAnalyseStat[]; C: ThemeTokens }) {
  if (topClients.length === 0) return (
    <EmptyState C={C} illustration={<IllustrationDonut C={C}/>}
      titre="Votre classement clients est encore vide"
      texte="Vos meilleurs clients — les plus fidèles, ceux qui reviennent le plus souvent — apparaîtront ici dès que l'historique commencera à se construire."/>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", minWidth: "520px" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["", "Client", "Segment", "Score fidélité", "Visites", "Dernière visite", "Valeur générée"].map(h => (
              <th key={h} style={{ textAlign: h === "Client" || h === "" ? "left" : "right", color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", padding: "8px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topClients.map(c => (
            <tr key={c.citoyenId} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "8px 6px" }}>
                <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: `linear-gradient(135deg, ${C.purple}30, ${C.purple}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800, color: C.purple }}>{c.nom.slice(0, 2).toUpperCase()}</div>
              </td>
              <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 700, whiteSpace: "nowrap" }}>{c.nom}</td>
              <td style={{ padding: "8px 6px" }}><span style={{ color: segmentCouleur(c.segment, C), fontSize: "10px", fontWeight: 800, backgroundColor: `${segmentCouleur(c.segment, C)}15`, padding: "1px 7px", borderRadius: "8px" }}>{SEGMENT_LABELS[c.segment]}</span></td>
              <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 800, textAlign: "right" }}>{c.scoreFidelite}</td>
              <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right" }}>{c.nbRdv}</td>
              <td style={{ padding: "8px 6px", color: C.t3, textAlign: "right", whiteSpace: "nowrap" }}>{timeAgo(c.derniereVisite)}</td>
              <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{c.valeurGeneree > 0 ? `${c.valeurGeneree.toLocaleString("fr-FR")} ${DEVISE_LABEL}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EVOL_CLIENTS_W = 600, EVOL_CLIENTS_H = 180, EVOL_CLIENTS_PAD = 10;
function toEvolClientsPolyline(data: EvolutionClientsPoint[], key: "nouveaux" | "recurrents" | "perdus", maxVal: number): string {
  if (data.length === 0) return "";
  const stepX = data.length > 1 ? (EVOL_CLIENTS_W - EVOL_CLIENTS_PAD * 2) / (data.length - 1) : 0;
  return data.map((d, i) => {
    const x = EVOL_CLIENTS_PAD + i * stepX;
    const y = EVOL_CLIENTS_H - EVOL_CLIENTS_PAD - (d[key] / maxVal) * (EVOL_CLIENTS_H - EVOL_CLIENTS_PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function EvolutionClients({ evolution, C }: { evolution: EvolutionClientsPoint[]; C: ThemeTokens }) {
  const totaux = evolution.reduce((acc, d) => ({ nouveaux: acc.nouveaux + d.nouveaux, recurrents: acc.recurrents + d.recurrents, perdus: acc.perdus + d.perdus }), { nouveaux: 0, recurrents: 0, perdus: 0 });
  const maxVal = Math.max(1, ...evolution.map(d => Math.max(d.nouveaux, d.recurrents, d.perdus)));
  const vide = evolution.length === 0 || (totaux.nouveaux === 0 && totaux.recurrents === 0 && totaux.perdus === 0);
  return (
    <div>
      <div style={{ display: "flex", gap: "16px", marginBottom: "10px", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "11px", fontWeight: 700 }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.blue, display: "inline-block" }}/>Nouveaux ({totaux.nouveaux})</span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "11px", fontWeight: 700 }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.green, display: "inline-block" }}/>Récurrents ({totaux.recurrents})</span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "11px", fontWeight: 700 }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.red, display: "inline-block" }}/>Perdus ({totaux.perdus})</span>
      </div>
      {vide ? (
        <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState C={C} illustration={<IllustrationCourbe C={C}/>}
            titre="Rien à afficher sur cette période"
            texte="L'évolution de vos nouveaux clients, de vos habitués et des départs se dessinera ici au fil de votre activité."/>
        </div>
      ) : (
        <svg viewBox={`0 0 ${EVOL_CLIENTS_W} ${EVOL_CLIENTS_H}`} preserveAspectRatio="none" style={{ width: "100%", height: "180px" }}>
          <polyline points={toEvolClientsPolyline(evolution, "nouveaux", maxVal)} fill="none" stroke={C.blue} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          <polyline points={toEvolClientsPolyline(evolution, "recurrents", maxVal)} fill="none" stroke={C.green} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          <polyline points={toEvolClientsPolyline(evolution, "perdus", maxVal)} fill="none" stroke={C.red} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ACQUISITION — comment les citoyens découvrent la fiche + ce qu'ils font
// ensuite. Présente des données, ne recommande jamais une source plutôt
// qu'une autre (brief §13) — contrairement à "Insight IA" ailleurs dans
// cet écran, qui recommande explicitement. Aucun événement "service_view"
// distinct : dans le parcours réel, cliquer un service démarre
// directement le flux RDV (appointment_started), voir
// lib/analyseAcquisition.ts pour le détail de cette décision.
// ═══════════════════════════════════════════════════════════════════════
const METRIQUES_EVOLUTION_ACQ = [
  { key: "visiteurs", label: "Visiteurs" },
  { key: "nouveaux", label: "Nouveaux visiteurs" },
  { key: "recurrents", label: "Visiteurs récurrents" },
  { key: "actions", label: "Actions" },
] as const;
type MetriqueEvolutionAcq = typeof METRIQUES_EVOLUTION_ACQ[number]["key"];

const FILTRE_SOURCES_ACQ: { key: AcquisitionSource | "toutes"; label: string }[] = [
  { key: "toutes", label: "Toutes les sources" },
  { key: "yelen_search", label: ACQUISITION_SOURCE_LABELS.yelen_search },
  { key: "nearby", label: ACQUISITION_SOURCE_LABELS.nearby },
  { key: "qr_code", label: ACQUISITION_SOURCE_LABELS.qr_code },
  { key: "community", label: ACQUISITION_SOURCE_LABELS.community },
  { key: "announcement", label: ACQUISITION_SOURCE_LABELS.announcement },
  { key: "share", label: ACQUISITION_SOURCE_LABELS.share },
  { key: "external", label: ACQUISITION_SOURCE_LABELS.external },
  { key: "direct", label: ACQUISITION_SOURCE_LABELS.direct },
  { key: "unknown", label: ACQUISITION_SOURCE_LABELS.unknown },
];

function IllustrationBoussole({ C }: { C: ThemeTokens }) {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="48" cy="48" r="22" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <path d="M48 34l6 14-6 14-6-14z" stroke={C.t3} strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="70" cy="66" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M65 66h10M70 61v10" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

function SourcesTableAcq({ sources, C, triPar, onCliquerSource }: { sources: SourceStat[]; C: ThemeTokens; triPar: "visiteurs" | "actions"; onCliquerSource?: (s: AcquisitionSource) => void }) {
  const lignes = sources.slice().sort((a, b) => b[triPar] - a[triPar]);
  if (lignes.length === 0) return (
    <EmptyState C={C} illustration={<IllustrationBoussole C={C}/>}
      titre="Pas encore de source à afficher"
      texte="Dès que des citoyens découvriront votre fiche, leurs parcours apparaîtront ici."/>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", minWidth: "460px" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["Source", "Visiteurs", "Part", "Actions", "Taux d'action"].map(h => (
              <th key={h} style={{ textAlign: h === "Source" ? "left" : "right", color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", padding: "8px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map(s => (
            <tr key={s.source} onClick={onCliquerSource ? () => onCliquerSource(s.source) : undefined} style={{ borderBottom: `1px solid ${C.border}`, cursor: onCliquerSource ? "pointer" : "default" }}>
              <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 700, whiteSpace: "nowrap" }}>{s.label}</td>
              <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 800, textAlign: "right" }}>{s.visiteurs}</td>
              <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right" }}>{s.part}%</td>
              <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right" }}>{s.actions}</td>
              <td style={{ padding: "8px 6px", color: s.tauxAction !== null ? C.gold : C.t3, fontWeight: 700, textAlign: "right" }}>{s.tauxAction !== null ? `${s.tauxAction}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApresDecouverteCard({ stats, C }: { stats: ApresDecouverteStat[]; C: ThemeTokens }) {
  if (stats.length === 0) return (
    <EmptyState C={C} illustration={<IllustrationPulse C={C}/>}
      titre="Rien à afficher pour l'instant"
      texte="Les actions réalisées après une visite de fiche (RDV démarré, contact, partage...) apparaîtront ici."/>
  );
  const max = Math.max(1, ...stats.map(s => s.count));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px", flexWrap: "wrap", color: C.t3, fontSize: "11px", fontWeight: 700 }}>
        Découverte <span style={{ color: C.t2 }}>→</span> Fiche consultée <span style={{ color: C.t2 }}>→</span> Action
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {stats.map(s => (
          <div key={s.eventType}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ color: C.t2, fontSize: "12px", fontWeight: 700 }}>{s.label}</span>
              <span style={{ color: C.t1, fontSize: "11px", fontWeight: 800 }}>{s.count}</span>
            </div>
            <div style={{ height: "8px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max((s.count / max) * 100, 4)}%`, backgroundColor: C.purple, borderRadius: "4px" }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const EVOL_ACQ_W = 600, EVOL_ACQ_H = 180, EVOL_ACQ_PAD = 10;
function toEvolAcqPolyline(data: EvolutionAcquisitionPoint[], key: MetriqueEvolutionAcq, maxVal: number): string {
  if (data.length === 0) return "";
  const stepX = data.length > 1 ? (EVOL_ACQ_W - EVOL_ACQ_PAD * 2) / (data.length - 1) : 0;
  return data.map((d, i) => {
    const x = EVOL_ACQ_PAD + i * stepX;
    const y = EVOL_ACQ_H - EVOL_ACQ_PAD - (d[key] / maxVal) * (EVOL_ACQ_H - EVOL_ACQ_PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function EvolutionAcquisitionChart({ evolution, C, metrique }: { evolution: EvolutionAcquisitionPoint[]; C: ThemeTokens; metrique: MetriqueEvolutionAcq }) {
  const total = evolution.reduce((s, d) => s + d[metrique], 0);
  const maxVal = Math.max(1, ...evolution.map(d => d[metrique]));
  if (evolution.length === 0 || total === 0) return (
    <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <EmptyState C={C} illustration={<IllustrationCourbe C={C}/>}
        titre="Rien à afficher sur cette période"
        texte="L'évolution de vos découvertes se dessinera ici au fil de votre activité."/>
    </div>
  );
  return (
    <svg viewBox={`0 0 ${EVOL_ACQ_W} ${EVOL_ACQ_H}`} preserveAspectRatio="none" style={{ width: "100%", height: "180px" }}>
      <polyline points={toEvolAcqPolyline(evolution, metrique, maxVal)} fill="none" stroke={C.gold} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

function AcquisitionTab({ data, C, sourceFiltre, onChangeSourceFiltre, onVoirSourceDetail }: {
  data: AnalyseAcquisition | null; C: ThemeTokens;
  sourceFiltre: AcquisitionSource | undefined; onChangeSourceFiltre: (s: AcquisitionSource | undefined) => void;
  onVoirSourceDetail?: (s: AcquisitionSource) => void;
}) {
  const [metrique, setMetrique] = useState<MetriqueEvolutionAcq>("visiteurs");
  const vide = data !== null && data.visiteurs.valeur === 0 && data.sources.length === 0;
  const selectStyle: React.CSSProperties = { backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "7px 10px", color: C.t1, fontSize: "11px", fontWeight: 700, cursor: "pointer" };

  return (
    <div>
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Acquisition" accent={C.blue}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Comprenez comment les citoyens découvrent votre établissement sur Yelen et ce qu&apos;ils font ensuite.</p>
        {data === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div>
        ) : vide ? (
          <EmptyState C={C} illustration={<IllustrationBoussole C={C}/>}
            titre="Votre acquisition commencera ici"
            texte="Lorsque des citoyens commenceront à découvrir votre établissement sur Yelen, vous verrez ici d'où ils viennent, combien consultent votre fiche et quelles actions ils réalisent."/>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px" }}>
            <KpiCard label="Visiteurs de la fiche" unite="%" C={C} color={C.purple} metric={data.visiteurs} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}/>
            <KpiCard label="Nouveaux visiteurs" unite="%" C={C} color={C.blue} metric={data.nouveauxVisiteurs} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>}/>
            <KpiCard label="Visiteurs récurrents" unite="%" C={C} color={C.green} metric={data.visiteursRecurrents} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>}/>
            <KpiCard label="Actions générées" unite="%" C={C} color={C.teal} metric={data.actionsGenerees} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>}/>
            <KpiCard label="Taux d'action" unite="pts" C={C} color={C.gold} metric={data.tauxAction} format={v => `${v}%`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}/>
          </div>
        )}
      </Card>

      {data !== null && !vide && (
        <>
          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <SectionHeader label="Comment les citoyens vous découvrent" accent={C.blue}/>
            <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Les principales sources qui amènent des citoyens vers votre fiche Yelen.</p>
            <SourcesTableAcq sources={data.sources} C={C} triPar="visiteurs"/>
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <SectionHeader label="Après la découverte" accent={C.purple}/>
            <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Découvrez les actions réalisées après l&apos;arrivée sur votre fiche.</p>
            <ApresDecouverteCard stats={data.apresDecouverte} C={C}/>
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>Évolution des découvertes</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <select value={metrique} onChange={e => setMetrique(e.target.value as MetriqueEvolutionAcq)} className="tap" style={selectStyle}>
                  {METRIQUES_EVOLUTION_ACQ.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <select value={sourceFiltre ?? "toutes"} onChange={e => onChangeSourceFiltre(e.target.value === "toutes" ? undefined : e.target.value as AcquisitionSource)} className="tap" style={selectStyle}>
                  {FILTRE_SOURCES_ACQ.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <EvolutionAcquisitionChart evolution={data.evolution} C={C} metrique={metrique}/>
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>Quelles sources génèrent le plus d&apos;actions ?</div>
            <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "14px" }}>{onVoirSourceDetail ? "Cliquez sur une source pour voir son détail." : "Lecture seule."}</p>
            <SourcesTableAcq sources={data.sources} C={C} triPar="actions" onCliquerSource={onVoirSourceDetail}/>
          </Card>

          {data.sources.length > 0 && (
            <Card tokens={toCardTokens(C)} padding="16px">
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>Ce qui amène vos visiteurs</div>
              <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "14px" }}>Répartition réelle de vos sources de découverte sur la période.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {data.sources.slice(0, 5).map(s => (
                  <div key={s.source} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.t2, fontSize: "12px", fontWeight: 700 }}>{s.label}</span>
                    <span style={{ color: C.t1, fontSize: "12px", fontWeight: 800 }}>{s.part}% de vos découvertes</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// Drill-down par source (Lot G) — fetch dédié avec ?source=, indépendant
// du filtre d'évolution de l'écran principal (deux besoins différents :
// "filtrer le graphique" vs "détailler une source précise").
function AcquisitionSourceDrawer({ instId, periodeJours, source, onClose, C }: { instId: string; periodeJours: PeriodeJours; source: AcquisitionSource; onClose: () => void; C: ThemeTokens }) {
  const [detail, setDetail] = useState<AnalyseAcquisition | null>(null);
  const [metrique, setMetrique] = useState<MetriqueEvolutionAcq>("visiteurs");

  useEffect(() => {
    setDetail(null);
    (async () => {
      const res = await fetch(`/api/institution/analyse/acquisition?jours=${periodeJours}&source=${source}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setDetail(j);
    })();
  }, [instId, periodeJours, source]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <style>{`@media(min-width:1024px){.acq-drawer-panel{align-items:center!important;max-width:560px!important;border-radius:20px!important;max-height:86svh!important}}`}</style>
      <div onClick={e => e.stopPropagation()} className="acq-drawer-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border}`, borderBottom: "none" }}>
        <button onClick={onClose} className="tap" aria-label="Fermer" style={{ position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div style={{ color: C.t1, fontSize: "17px", fontWeight: 800, marginBottom: "4px" }}>{ACQUISITION_SOURCE_LABELS[source]}</div>
        {detail === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={22}/></div>
        ) : (
          <>
            <div style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>{detail.visiteurs.valeur ?? 0} visiteurs sur la période</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "8px", marginBottom: "18px" }}>
              <KpiCard label="Nouveaux" unite="%" C={C} color={C.blue} metric={detail.nouveauxVisiteurs} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>}/>
              <KpiCard label="Récurrents" unite="%" C={C} color={C.green} metric={detail.visiteursRecurrents} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>}/>
              <KpiCard label="Actions" unite="%" C={C} color={C.teal} metric={detail.actionsGenerees} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>}/>
              <KpiCard label="Taux d'action" unite="pts" C={C} color={C.gold} metric={detail.tauxAction} format={v => `${v}%`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}/>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>Évolution</div>
              <select value={metrique} onChange={e => setMetrique(e.target.value as MetriqueEvolutionAcq)} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "6px 9px", color: C.t1, fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }}>
                {METRIQUES_EVOLUTION_ACQ.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <EvolutionAcquisitionChart evolution={detail.evolution} C={C} metrique={metrique}/>

            <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", color: C.t3, fontSize: "11px", fontWeight: 700 }}>
              <span style={{ color: C.t1 }}>{ACQUISITION_SOURCE_LABELS[source]}</span> <span>→</span> Fiche <span>→</span> Service <span>→</span> Action
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RetentionBars({ tauxRetour, C }: { tauxRetour: RetentionSemaine[]; C: ThemeTokens }) {
  const donnees = tauxRetour.filter(s => s.pct !== null);
  if (donnees.length === 0) return (
    <EmptyState C={C} illustration={<IllustrationCourbe C={C}/>}
      titre="Pas encore assez de recul"
      texte="Le taux de retour par semaine s'affichera dès qu'au moins une semaine complète se sera écoulée après les premières visites."/>
  );
  const max = Math.max(1, ...donnees.map(s => s.pct ?? 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {tauxRetour.map(s => (
        <div key={s.semaine}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ color: C.t2, fontSize: "12px", fontWeight: 700 }}>{s.label}</span>
            <span style={{ color: C.t1, fontSize: "11px", fontWeight: 800 }}>{s.pct !== null ? `${s.pct}%` : "—"}</span>
          </div>
          <div style={{ height: "8px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: s.pct !== null ? `${Math.max((s.pct / max) * 100, 4)}%` : "0%", backgroundColor: C.teal, borderRadius: "4px" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function celluleCouleur(pct: number, C: ThemeTokens): string {
  if (pct >= 60) return C.green;
  if (pct >= 35) return C.gold;
  if (pct >= 15) return C.orange;
  return C.red;
}

function CohorteHeatmap({ cohortes, C }: { cohortes: CohorteRetention[]; C: ThemeTokens }) {
  if (cohortes.length === 0) return (
    <EmptyState C={C} illustration={<IllustrationDonut C={C}/>}
      titre="Pas encore de cohorte complète"
      texte="Dès qu'un groupe de nouveaux clients aura au moins une semaine d'historique, sa rétention apparaîtra ici semaine par semaine."/>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", minWidth: "440px" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["Cohorte", "Taille", "S1", "S2", "S3", "S4"].map(h => (
              <th key={h} style={{ textAlign: h === "Cohorte" ? "left" : "right", color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", padding: "8px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohortes.map(co => (
            <tr key={co.cohorteLabel} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 700, whiteSpace: "nowrap" }}>{co.cohorteLabel}</td>
              <td style={{ padding: "8px 6px", color: C.t3, textAlign: "right" }}>{co.taille}</td>
              {[co.s1, co.s2, co.s3, co.s4].map((v, i) => (
                <td key={i} style={{ padding: "8px 6px", textAlign: "right" }}>
                  <span style={{ color: v !== null ? C.t1 : C.t3, fontWeight: v !== null ? 800 : 400, backgroundColor: v !== null ? `${celluleCouleur(v, C)}20` : "transparent", padding: "2px 7px", borderRadius: "6px" }}>{v !== null ? `${v}%` : "—"}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SegmentFiltre = "fideles" | "nouveaux" | "occasionnels" | "a_reactiver";
const SEGMENT_CARD_META: { key: SegmentFiltre; label: string; couleur: (c: ThemeTokens) => string; sousTitre: string }[] = [
  { key: "fideles", label: "Clients fidèles", couleur: c => c.green, sousTitre: "Reviennent régulièrement" },
  { key: "nouveaux", label: "Nouveaux clients", couleur: c => c.blue, sousTitre: "Première visite récente" },
  { key: "occasionnels", label: "Clients occasionnels", couleur: c => c.orange, sousTitre: "Reviennent rarement" },
  { key: "a_reactiver", label: "Clients à réactiver", couleur: c => c.red, sousTitre: "Absents depuis longtemps" },
];

function segmentsToCounts(data: AnalyseClients): Record<SegmentFiltre, number> {
  const fideles = (data.segments.find(s => s.segment === "fidele")?.count ?? 0) + (data.segments.find(s => s.segment === "vip")?.count ?? 0);
  return {
    fideles,
    nouveaux: data.segments.find(s => s.segment === "nouveau")?.count ?? 0,
    occasionnels: data.segments.find(s => s.segment === "occasionnel")?.count ?? 0,
    a_reactiver: data.segments.find(s => s.segment === "inactif")?.count ?? 0,
  };
}

function SegmentCards({ data, C, onVoirSegment }: { data: AnalyseClients; C: ThemeTokens; onVoirSegment?: (filtre: SegmentFiltre) => void }) {
  const counts = segmentsToCounts(data);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" }}>
      {SEGMENT_CARD_META.map(m => (
        <div key={m.key} style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "14px", borderLeft: `3px solid ${m.couleur(C)}` }}>
          <div style={{ color: C.t1, fontSize: "20px", fontWeight: 800 }}>{counts[m.key]}</div>
          <div style={{ color: C.t1, fontSize: "12px", fontWeight: 700, marginTop: "4px" }}>{m.label}</div>
          <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>{m.sousTitre}</div>
          {onVoirSegment && counts[m.key] > 0 && (
            <button onClick={() => onVoirSegment(m.key)} className="tap" style={{ background: "none", border: "none", color: m.couleur(C), fontSize: "10.5px", fontWeight: 800, padding: 0, marginTop: "10px", cursor: "pointer" }}>Voir le segment →</button>
          )}
        </div>
      ))}
    </div>
  );
}

const TON_COULEUR: Record<PointAttention["ton"], (c: ThemeTokens) => string> = { alerte: c => c.orange, positif: c => c.green, info: c => c.blue };
const CIBLE_META: Partial<Record<NonNullable<PointAttention["cible"]>, { label: string; filtre: SegmentFiltre }>> = {
  "clients-inactifs": { label: "Voir ces clients", filtre: "a_reactiver" },
  "nouveaux-clients": { label: "Voir le segment", filtre: "nouveaux" },
};

function PointsAttentionList({ points, C, onVoirClients }: { points: PointAttention[]; C: ThemeTokens; onVoirClients?: (filtre?: SegmentFiltre) => void }) {
  if (points.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {points.map((p, i) => {
        const couleur = TON_COULEUR[p.ton](C);
        const cta = p.cible ? CIBLE_META[p.cible] : undefined;
        return (
          <div key={i} style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px", borderLeft: `3px solid ${couleur}` }}>
            <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>{p.message}</p>
            {cta && onVoirClients && (
              <button onClick={() => onVoirClients(cta.filtre)} className="tap" style={{ background: "none", border: "none", color: couleur, fontSize: "10.5px", fontWeight: 800, padding: 0, marginTop: "8px", cursor: "pointer" }}>{cta.label} →</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnalyseClientsTab({ data, C, geo, onVoirGeographie, onVoirClients }: { data: AnalyseClients | null; C: ThemeTokens; geo: AnalyseGeo | null; onVoirGeographie?: () => void; onVoirClients?: (filtre?: SegmentFiltre, texte?: string) => void }) {
  const [rechercheTexte, setRechercheTexte] = useState("");
  return (
    <div>
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Analyse de la clientèle" accent={C.purple}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Comprenez votre clientèle — acquisition, fidélité, fréquence et évolution. Pour gérer une fiche client, utilisez l&apos;écran &quot;Mes clients&quot; du menu principal.</p>
        {data === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px" }}>
            <KpiCard label="Clients uniques" unite="%" C={C} color={C.purple} metric={data.clientsUniques} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}/>
            <KpiCard label="Nouveaux clients" unite="%" C={C} color={C.blue} metric={data.nouveauxClients} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>}/>
            <KpiCard label="Clients récurrents" unite="%" C={C} color={C.green} metric={data.clientsRecurrents} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>}/>
            <KpiCard label="Taux de fidélité" unite="pts" C={C} color={C.gold} metric={data.tauxFidelite} format={v => `${v}%`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}/>
            <KpiCard label="Fréquence moyenne" unite="pts" C={C} color={C.teal} metric={data.frequenceMoyenne} format={v => `${v} visites`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}/>
            <KpiCard label="Satisfaction" unite="%" C={C} color={C.orange} metric={data.satisfaction} format={v => `${v}/5`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}/>
          </div>
        )}
      </Card>

      {data !== null && data.topClients.length > 0 && (
        <>
          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <SectionHeader label="Comprendre votre clientèle" accent={C.blue}/>
            <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Voyez comment votre clientèle évolue et identifiez les habitudes qui comptent.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
              <div>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Évolution de la clientèle</div>
                <EvolutionClients evolution={data.evolution} C={C}/>
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Votre clientèle aujourd&apos;hui</div>
                <DonutSegments segments={data.segments} C={C}/>
                {data.clientsRecurrents.valeur !== null && data.clientsRecurrents.valeur > 0 && (
                  <div style={{ marginTop: "12px" }}>
                    <p style={{ color: C.t2, fontSize: "11.5px", fontWeight: 700, margin: 0 }}>{data.clientsRecurrents.valeur} clients reviennent régulièrement</p>
                    {onVoirClients && (
                      <button onClick={() => onVoirClients("fideles")} className="tap" style={{ background: "none", border: "none", color: C.blue, fontSize: "11px", fontWeight: 800, padding: 0, marginTop: "6px", cursor: "pointer" }}>Voir les clients →</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <SectionHeader label="Fidélité & rétention" accent={C.teal}/>
            <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Comprenez combien de clients reviennent et à quel rythme.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
              <div>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Taux de retour {data.tauxFidelite.valeur !== null ? `— ${data.tauxFidelite.valeur}%` : ""}</div>
                <RetentionBars tauxRetour={data.tauxRetour} C={C}/>
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Rétention par cohorte</div>
                <CohorteHeatmap cohortes={data.cohortes} C={C}/>
              </div>
            </div>
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <SectionHeader label="Segments de clientèle" accent={C.gold}/>
            <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Identifiez les différents profils qui composent votre clientèle.</p>
            <SegmentCards data={data} C={C} onVoirSegment={onVoirClients ? (f) => onVoirClients(f) : undefined}/>
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <SectionHeader label="Comportement des clients" accent={C.purple}/>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px", margin: "14px 0 16px" }}>
              {[
                { label: "Fréquence", valeur: data.frequenceMoyenne.valeur !== null ? `${data.frequenceMoyenne.valeur} visites` : "—", sousTitre: "fréquence moyenne" },
                { label: "Temps entre deux visites", valeur: data.intervalleMoyenVisites !== null ? `${data.intervalleMoyenVisites} jours` : "—", sousTitre: "intervalle moyen" },
                { label: "Clients récurrents", valeur: data.tauxFidelite.valeur !== null ? `${data.tauxFidelite.valeur}%` : "—", sousTitre: "reviennent après leur première visite" },
              ].map(b => (
                <div key={b.label} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
                  <div style={{ color: C.t1, fontSize: "18px", fontWeight: 800 }}>{b.valeur}</div>
                  <div style={{ color: C.t2, fontSize: "11px", fontWeight: 700, marginTop: "4px" }}>{b.label}</div>
                  <div style={{ color: C.t3, fontSize: "10px", marginTop: "2px" }}>{b.sousTitre}</div>
                </div>
              ))}
            </div>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Fréquence des visites</div>
            <FidelisationHisto fidelisation={data.fidelisation} C={C}/>
          </Card>

          {geo !== null && geo.prefectures.length > 0 && (() => {
            const totalRdvGeo = geo.prefectures.reduce((s, p) => s + p.rdv, 0);
            return (
              <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
                <SectionHeader label="D'où viennent vos clients ?" accent={C.teal}/>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "14px 0 12px" }}>
                  {geo.prefectures.slice(0, 5).map(p => {
                    const pct = totalRdvGeo > 0 ? Math.round((p.rdv / totalRdvGeo) * 100) : 0;
                    return (
                      <div key={p.ville}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ color: C.t2, fontSize: "12px", fontWeight: 700 }}>{p.ville}</span>
                          <span style={{ color: C.t1, fontSize: "11px", fontWeight: 800 }}>{pct}%</span>
                        </div>
                        <div style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, backgroundColor: C.teal, borderRadius: "3px" }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {onVoirGeographie && (
                  <button onClick={onVoirGeographie} className="tap" style={{ background: "none", border: "none", color: C.teal, fontSize: "11px", fontWeight: 800, padding: 0, cursor: "pointer" }}>Voir la géographie →</button>
                )}
              </Card>
            );
          })()}

          {genererPointsAttention(data).length > 0 && (
            <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
              <SectionHeader label="Points d'attention" accent={C.orange}/>
              <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Observations générées automatiquement à partir de vos données.</p>
              <PointsAttentionList points={genererPointsAttention(data)} C={C} onVoirClients={onVoirClients}/>
            </Card>
          )}

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Analyse RFM simplifiée</div>
            <AnalyseRfm rfm={data.rfm} C={C}/>
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>Top clients</div>
            <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "14px" }}>Lecture seule — pour gérer un client, utilisez l&apos;écran CRM dédié.</p>
            <TopClientsTable topClients={data.topClients} C={C}/>
          </Card>

          {data.commentairesRecents.length > 0 && (
            <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Avis récents</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {data.commentairesRecents.map((a, i) => (
                  <div key={i} style={{ borderBottom: i < data.commentairesRecents.length - 1 ? `1px solid ${C.border}` : "none", paddingBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ color: C.gold, fontSize: "11px", fontWeight: 800 }}>{a.note}/5</span>
                      <span style={{ color: C.t3, fontSize: "10px" }}>{timeAgo(a.date)}</span>
                    </div>
                    <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5 }}>{a.commentaire}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${C.gold}20` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
              <span style={{ color: C.gold, fontSize: "13px", fontWeight: "800" }}>Insight IA</span>
              <span style={{ backgroundColor: `${C.gold}20`, color: C.gold, fontSize: "9px", fontWeight: 800, padding: "2px 7px", borderRadius: "10px", textTransform: "uppercase", letterSpacing: "0.3px" }}>Recommandation</span>
            </div>
            <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.7 }}>{genererInsightClients(data)}</p>
          </Card>

          {onVoirClients && (
            <Card tokens={toCardTokens(C)} padding="16px" style={{ marginTop: "14px" }}>
              <SectionHeader label="Explorer votre clientèle" accent={C.purple}/>
              <p style={{ color: C.t3, fontSize: "11px", marginBottom: "12px", lineHeight: 1.5 }}>Recherchez et filtrez pour retrouver un client précis — bascule vers l&apos;écran de gestion dédié.</p>
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <input value={rechercheTexte} onChange={e => setRechercheTexte(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onVoirClients(undefined, rechercheTexte || undefined); }} placeholder="Rechercher un client…" style={{ flex: 1, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", color: C.t1, fontSize: "12.5px" }}/>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => onVoirClients(undefined, rechercheTexte || undefined)}>Rechercher</Button>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                {([{ key: undefined, label: "Tous" }, { key: "nouveaux", label: "Nouveaux" }, { key: "fideles", label: "Fidèles" }, { key: "occasionnels", label: "Occasionnels" }, { key: "a_reactiver", label: "À réactiver" }] as const).map(f => (
                  <button key={f.label} onClick={() => onVoirClients(f.key, undefined)} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 12px", color: C.t2, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>{f.label}</button>
                ))}
              </div>
              <button onClick={() => onVoirClients(undefined, undefined)} className="tap" style={{ background: "none", border: "none", color: C.purple, fontSize: "12px", fontWeight: 800, padding: 0, cursor: "pointer" }}>Voir tous les clients →</button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TUNNEL DÉTAILLÉ — KPIs + panel des pertes + causes d'abandon réelles
// ═══════════════════════════════════════════════════════════════════════
function NiveauBadge({ niveau, C }: { niveau: PerteEtape["niveau"]; C: ThemeTokens }) {
  const map = { critique: { c: C.red, l: "Très critique" }, moyen: { c: C.orange, l: "Moyen" }, faible: { c: C.green, l: "Faible" } };
  const m = map[niveau];
  return <span style={{ color: m.c, fontSize: "9.5px", fontWeight: 800, backgroundColor: `${m.c}15`, padding: "2px 8px", borderRadius: "8px" }}>{m.l}</span>;
}

function PanelPertes({ pertes, C }: { pertes: PerteEtape[]; C: ThemeTokens }) {
  if (pertes.every(p => p.perteCount === 0)) {
    return (
      <EmptyState C={C} illustration={<IllustrationSucces C={C}/>}
        titre="Aucune perte détectée"
        texte="Toutes les demandes de cette période ont progressé jusqu'au bout, sans abandon à aucune étape. Continuez ainsi."/>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {pertes.map(p => (
        <div key={p.etape} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700 }}>{p.label}</span>
            <NiveauBadge niveau={p.niveau} C={C}/>
          </div>
          <div style={{ color: C.red, fontSize: "13px", fontWeight: 800 }}>-{p.deltaPct}% <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 600 }}>({p.perteCount} perdu{p.perteCount > 1 ? "s" : ""})</span></div>
        </div>
      ))}
    </div>
  );
}

const CAUSE_COULEURS = (C: ThemeTokens) => [C.red, C.orange, C.gold, C.purple, C.blue, C.t3];
function CausesAbandon({ causes, C }: { causes: CauseAbandon[]; C: ThemeTokens }) {
  const R = 34, CIRC = 2 * Math.PI * R;
  const total = causes.reduce((s, c) => s + c.count, 0);
  const couleurs = CAUSE_COULEURS(C);
  if (total === 0) return (
    <EmptyState C={C} illustration={<IllustrationSucces C={C}/>}
      titre="Zéro refus, zéro annulation"
      texte="Sur cette période, aucune demande n'a été refusée ni annulée. Un signe clair que votre organisation fonctionne bien."/>
  );
  // Décalages cumulés précalculés immutablement (voir RepartitionCanal ci-dessus).
  const cumules = causes.reduce<{ list: number[]; running: number }>((state, c) => (
    { list: [...state.list, state.running], running: state.running + c.count / total }
  ), { list: [], running: 0 }).list;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
      <svg width="96" height="96" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke={C.bg3} strokeWidth="13"/>
        {causes.map((c, i) => {
          const frac = c.count / total;
          const dash = frac * CIRC;
          const offset = -(cumules[i] * CIRC);
          return <circle key={`${c.type}-${c.motif}`} cx="50" cy="50" r={R} fill="none" stroke={couleurs[i % couleurs.length]} strokeWidth="13" strokeDasharray={`${dash} ${CIRC - dash}`} strokeDashoffset={offset} transform="rotate(-90 50 50)"/>;
        })}
        <text x="50" y="47" textAnchor="middle" fontSize="14" fontWeight="900" fill={C.t1}>{total}</text>
        <text x="50" y="60" textAnchor="middle" fontSize="6.5" fill={C.t3}>Abandons</text>
      </svg>
      <div style={{ flex: 1, minWidth: "180px", display: "flex", flexDirection: "column", gap: "7px" }}>
        {causes.map((c, i) => (
          <div key={`${c.type}-${c.motif}`} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: couleurs[i % couleurs.length], flexShrink: 0 }}/>
            <span style={{ flex: 1, color: C.t2, fontSize: "11px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.motif} <span style={{ color: C.t3 }}>({c.type === "refus" ? "refus" : "annulation"})</span></span>
            <span style={{ color: C.t1, fontSize: "11px", fontWeight: 800 }}>{c.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TunnelComplet({ rdvsPeriode, tunnel, C }: { rdvsPeriode: RDV[]; tunnel: AnalyseTunnel | null; C: ThemeTokens }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px", marginBottom: "14px" }}>
        <KpiCard label="Demandes initiées" unite="%" C={C} color={C.gold} metric={tunnel?.demandes ?? null} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}/>
        <KpiCard label="RDV confirmés" unite="%" C={C} color={C.green} metric={tunnel?.confirmes ?? null} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}/>
        <KpiCard label="Services terminés" unite="%" C={C} color={C.blue} metric={tunnel?.termines ?? null} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4a1 1 0 0 1 1-1h11.5l-1 5 1 5H6"/></svg>}/>
        <KpiCard label="En attente" unite="%" C={C} color={C.orange} metric={tunnel?.enAttente ?? null} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}/>
        <KpiCard label="Conversion globale" unite="pts" C={C} color={C.teal} metric={tunnel?.conversionGlobale ?? null} format={v => `${v}%`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}/>
        <KpiCard label="Perte totale" unite="pts" C={C} color={C.red} metric={tunnel?.perteTotale ?? null} format={v => `${v}%`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 6 8.5 13.5 13.5 8.5 23 18"/><polyline points="17 18 23 18 23 12"/></svg>}/>
      </div>

      <TunnelAcquisition rdvs={rdvsPeriode}/>

      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>Où perdons-nous les citoyens ?</div>
        <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "14px" }}>Classement des étapes du tunnel par taux de perte, sur la période sélectionnée.</p>
        {tunnel === null ? <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div> : <PanelPertes pertes={tunnel.pertes} C={C}/>}
      </Card>

      <Card tokens={toCardTokens(C)} padding="16px">
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>Causes d&apos;abandon</div>
        <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "14px" }}>Motifs réels saisis par votre équipe (refus) et par les citoyens (annulation) — jamais reclassés, affichés tels quels.</p>
        {tunnel === null ? <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div> : <CausesAbandon causes={tunnel.causesAbandon} C={C}/>}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HEATMAP DÉTAILLÉE — occupation réelle (créneaux configurés × capacité)
// ═══════════════════════════════════════════════════════════════════════
function couleurOccupation(occupation: number | null, C: ThemeTokens): string {
  if (occupation === null) return C.bg3;
  if (occupation === 0) return `${C.green}18`;
  if (occupation <= 30) return `${C.green}60`;
  if (occupation <= 60) return `${C.gold}60`;
  if (occupation <= 85) return `${C.orange}75`;
  return C.red;
}

function HeatmapGrilleReelle({ matrice, C }: { matrice: HeatmapCell[][]; C: ThemeTokens }) {
  const [survol, setSurvol] = useState<HeatmapCell | null>(null);
  return (
    <div>
      <div style={{ display: "flex", gap: "3px", marginBottom: "4px", paddingLeft: "32px" }}>
        {matrice[0]?.map(c => (<div key={c.tranche} style={{ flex: 1, textAlign: "center", color: C.t3, fontSize: "8px", fontWeight: "700" }}>{c.tranche}</div>))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {matrice.map((row, ji) => (
          <div key={row[0]?.jour ?? ji} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <div style={{ width: "28px", color: C.t3, fontSize: "9px", fontWeight: "700", flexShrink: 0 }}>{row[0]?.jour}</div>
            {row.map((cell, ti) => (
              <div key={ti} onMouseEnter={() => setSurvol(cell)} onMouseLeave={() => setSurvol(null)}
                style={{ flex: 1, height: "26px", borderRadius: "5px", backgroundColor: couleurOccupation(cell.occupation, C), display: "flex", alignItems: "center", justifyContent: "center", cursor: cell.occupation !== null ? "pointer" : "default" }}>
                {cell.occupation !== null && cell.rdv > 0 && <span style={{ color: cell.occupation > 60 ? "#fff" : C.t1, fontSize: "8.5px", fontWeight: "800" }}>{cell.rdv}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
        <span style={{ color: C.t3, fontSize: "9px" }}>Fermé</span>
        {[C.bg3, `${C.green}60`, `${C.gold}60`, `${C.orange}75`, C.red].map((c, i) => (<div key={i} style={{ width: "14px", height: "10px", borderRadius: "3px", backgroundColor: c }}/>))}
        <span style={{ color: C.t3, fontSize: "9px" }}>Saturé</span>
      </div>
      <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px", marginTop: "10px", minHeight: "40px" }}>
        {!survol ? (
          <div style={{ color: C.t3, fontSize: "10.5px", textAlign: "center" }}>Survolez une case pour le détail.</div>
        ) : survol.occupation === null ? (
          <div style={{ color: C.t3, fontSize: "11px" }}><strong style={{ color: C.t1 }}>{survol.jour} {survol.tranche}</strong> — Fermé (aucun créneau configuré).</div>
        ) : (
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "11px" }}>
            <span style={{ color: C.t1, fontWeight: 800 }}>{survol.jour} {survol.tranche}</span>
            <span style={{ color: C.t2 }}>{survol.rdv} RDV / {survol.capacite} places</span>
            <span style={{ color: survol.occupation >= 86 ? C.red : survol.occupation >= 61 ? C.orange : C.green, fontWeight: 800 }}>{survol.occupation}% occupation</span>
            {survol.annulations > 0 && <span style={{ color: C.t3 }}>{survol.annulations} annulation{survol.annulations > 1 ? "s" : ""}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ResumeCreneaux({ critiques, disponibles, C }: { critiques: CreneauInfo[]; disponibles: CreneauInfo[]; C: ThemeTokens }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px" }}>
      <div>
        <div style={{ color: C.red, fontSize: "11px", fontWeight: 800, marginBottom: "8px" }}>Créneaux critiques</div>
        {critiques.length === 0 ? <div style={{ color: C.t3, fontSize: "11px" }}>Aucun créneau saturé sur cette période — votre capacité suit bien la demande.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {critiques.map((c, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: C.t2 }}>{c.jour} — {c.tranche}</span><span style={{ color: C.red, fontWeight: 800 }}>{c.occupation}%</span></div>))}
          </div>
        )}
      </div>
      <div>
        <div style={{ color: C.green, fontSize: "11px", fontWeight: 800, marginBottom: "8px" }}>Créneaux disponibles</div>
        {disponibles.length === 0 ? <div style={{ color: C.t3, fontSize: "11px" }}>Aucun créneau à faible occupation — votre activité tourne à plein régime sur cette période.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {disponibles.map((c, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: C.t2 }}>{c.jour} — {c.tranche}</span><span style={{ color: C.green, fontWeight: 800 }}>{c.occupation}%</span></div>))}
          </div>
        )}
      </div>
    </div>
  );
}

function EvolutionHebdoBar({ evolutionHebdo, C }: { evolutionHebdo: { jour: string; count: number }[]; C: ThemeTokens }) {
  const max = Math.max(1, ...evolutionHebdo.map(d => d.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {evolutionHebdo.map(d => (
        <div key={d.jour} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "66px", color: C.t2, fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>{d.jour}</span>
          <div style={{ flex: 1, height: "8px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max((d.count / max) * 100, d.count > 0 ? 3 : 0)}%`, backgroundColor: C.blue, borderRadius: "4px" }}/>
          </div>
          <span style={{ width: "34px", color: C.t1, fontSize: "11px", fontWeight: 800, textAlign: "right" }}>{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function PerformanceParJourTable({ rows, C }: { rows: PerformanceJour[]; C: ThemeTokens }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", minWidth: "460px" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["Jour", "RDV", "Annulation", "Non traités", "Occupation"].map(h => (
              <th key={h} style={{ textAlign: h === "Jour" ? "left" : "right", color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", padding: "8px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.jour} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 700 }}>{r.jour}</td>
              <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right" }}>{r.rdv}</td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}><span style={{ color: r.tauxAnnulation > 10 ? C.red : C.t2 }}>{r.tauxAnnulation}%</span></td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}><span style={{ color: r.nonTraites > 0 ? C.orange : C.t2 }}>{r.nonTraites}</span></td>
              <td style={{ padding: "8px 6px", textAlign: "right", color: r.occupation === null ? C.t3 : r.occupation >= 86 ? C.red : r.occupation >= 61 ? C.orange : C.green, fontWeight: 800 }}>{r.occupation === null ? "Fermé" : `${r.occupation}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeatmapComplete({ heatmap, C }: { heatmap: AnalyseHeatmap | null; C: ThemeTokens }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "8px", marginBottom: "14px" }}>
        <KpiCard label="Total RDV" unite="%" C={C} color={C.gold} metric={heatmap?.totalRdv ?? null} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}/>
        <GeoKpiCard label="Heure la + fréquentée" valeur={heatmap?.heurePointe ?? "—"} C={C} color={C.blue}/>
        <GeoKpiCard label="Jour le + chargé" valeur={heatmap?.jourPointe ?? "—"} C={C} color={C.purple}/>
        <KpiCard label="Occupation moyenne" unite="pts" C={C} color={C.teal} metric={heatmap?.tauxOccupationMoyen ?? null} format={v => `${v}%`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>}/>
        <KpiCard label="Créneaux saturés" unite="%" C={C} color={C.red} metric={heatmap?.creneauxSatures ?? null} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}/>
        <KpiCard label="Créneaux sous-utilisés" unite="%" C={C} color={C.green} metric={heatmap?.creneauxSousUtilises ?? null} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>}/>
      </div>

      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Heatmap d'Activité" accent={C.orange}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px" }}>Occupation réelle : RDV pris vs créneaux configurés × capacité par créneau.</p>
        {heatmap === null ? <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}><YelenLoader size={22}/></div> : <HeatmapGrilleReelle matrice={heatmap.matrice} C={C}/>}
      </Card>

      {heatmap !== null && (
        <>
          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Résumé automatique</div>
            <ResumeCreneaux critiques={heatmap.creneauxCritiques} disponibles={heatmap.creneauxDisponibles} C={C}/>
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Évolution hebdomadaire</div>
            <EvolutionHebdoBar evolutionHebdo={heatmap.evolutionHebdo} C={C}/>
          </Card>

          {heatmap.annulationsParTranche.length > 0 && (
            <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Annulations par période de la journée</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {heatmap.annulationsParTranche.map(t => (
                  <div key={t.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}><span style={{ color: C.t2, fontSize: "11.5px", fontWeight: 700 }}>{t.label}</span><span style={{ color: C.t1, fontSize: "11px", fontWeight: 800 }}>{t.pct}% · {t.count}</span></div>
                    <div style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}><div style={{ height: "100%", width: `${t.pct}%`, backgroundColor: C.red, borderRadius: "3px" }}/></div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card tokens={toCardTokens(C)} padding="16px">
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Performance par jour</div>
            <PerformanceParJourTable rows={heatmap.performanceParJour} C={C}/>
          </Card>
        </>
      )}
    </div>
  );
}

export function CentreAnalyseTab({ instId, rdvs, stats, onOpenGuide, active = true, onVoirClients }: {
  instId: string;
  rdvs: RDV[];
  stats: Stats;
  onOpenGuide: () => void;
  active?: boolean;
  onVoirClients?: (filtre?: "fideles" | "nouveaux" | "occasionnels" | "a_reactiver", texte?: string) => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [sousOnglet, setSousOnglet] = useState<SousOnglet>("vue-ensemble");
  const [periodeJours, setPeriodeJours] = useState<PeriodeJours>(30);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, [active]);
  // Sous-onglet Tunnel : respecte le sélecteur de période global (visible
  // sur tous les sous-onglets) plutôt que la liste brute des ~300 derniers
  // RDV — sinon le sélecteur affiché en en-tête n'aurait aucun effet visible
  // sur cet écran. Heatmap/Géographie restent sur `rdvs` brut pour l'instant
  // (hors scope de cette passe, chantier Tunnel uniquement).
  const debutPeriode = new Date(nowTick - periodeJours * 86400000);
  const rdvsPeriode = rdvs.filter(r => r.created_at && new Date(r.created_at) >= debutPeriode);
  const [vueEnsemble, setVueEnsemble] = useState<VueEnsemble | null>(null);
  const [evolution, setEvolution] = useState<PointEvolution[] | null>(null);
  const [topOffres, setTopOffres] = useState<TopOffre[] | null>(null);
  const [canaux, setCanaux] = useState<CanalStat[] | null>(null);
  const [geo, setGeo] = useState<AnalyseGeo | null>(null);
  const [analyseClients, setAnalyseClients] = useState<AnalyseClients | null>(null);
  const [tunnel, setTunnel] = useState<AnalyseTunnel | null>(null);
  const [heatmap, setHeatmap] = useState<AnalyseHeatmap | null>(null);
  const [acquisition, setAcquisition] = useState<AnalyseAcquisition | null>(null);
  const [acquisitionSourceFiltre, setAcquisitionSourceFiltre] = useState<AcquisitionSource | undefined>(undefined);
  const [acquisitionDrillDown, setAcquisitionDrillDown] = useState<AcquisitionSource | null>(null);

  useEffect(() => {
    // queueMicrotask (même convention qu'ailleurs dans ce dossier, ex.
    // EquipeTab.tsx) : évite react-hooks/set-state-in-effect sur ces resets
    // synchrones en tête d'effet — s'exécute bien avant que le fetch
    // ci-dessous ait la moindre chance d'aboutir (I/O réseau, jamais plus
    // rapide qu'un tick de microtâche), donc aucun risque d'écraser une
    // donnée fraîchement reçue.
    queueMicrotask(() => {
      setVueEnsemble(null);
      setTopOffres(null);
      setCanaux(null);
      setGeo(null);
      setAnalyseClients(null);
      setTunnel(null);
      setHeatmap(null);
    });
    (async () => {
      const res = await fetch(`/api/institution/analyse/vue-ensemble?jours=${periodeJours}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setVueEnsemble(j);
    })();
    (async () => {
      const res = await fetch(`/api/institution/analyse/top-offres?jours=${periodeJours}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setTopOffres(j.offres);
    })();
    (async () => {
      const res = await fetch(`/api/institution/analyse/canal?jours=${periodeJours}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setCanaux(j.canaux);
    })();
    (async () => {
      const res = await fetch(`/api/institution/analyse/clients?jours=${periodeJours}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setAnalyseClients(j);
    })();
    (async () => {
      const res = await fetch(`/api/institution/analyse/tunnel?jours=${periodeJours}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setTunnel(j);
    })();
    (async () => {
      const res = await fetch(`/api/institution/analyse/heatmap?jours=${periodeJours}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setHeatmap(j);
    })();
    (async () => {
      const res = await fetch(`/api/institution/analyse/villes?jours=${periodeJours}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setGeo(j);
    })();
  }, [instId, periodeJours]);

  // Fetch séparé (paramètre "source" en plus, filtrable sans re-déclencher
  // les 6 autres requêtes ci-dessus).
  useEffect(() => {
    setAcquisition(null);
    (async () => {
      const qs = new URLSearchParams({ jours: String(periodeJours) });
      if (acquisitionSourceFiltre) qs.set("source", acquisitionSourceFiltre);
      const res = await fetch(`/api/institution/analyse/acquisition?${qs.toString()}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setAcquisition(j);
    })();
  }, [instId, periodeJours, acquisitionSourceFiltre]);

  // Le graphique d'évolution garde son propre sélecteur 7j/30j/90j/1an
  // (Lot 3) — un seul fetch large, indépendant du sélecteur global.
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/institution/analyse/evolution");
      const j = await res.json().catch(() => null);
      if (res.ok && j) setEvolution(j.jours);
    })();
  }, [instId]);

  return (
    <div style={{ animation: "fadeUp 0.2s ease" }}>
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", marginBottom: "14px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.blue}30, ${C.blue}10)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <div>
              <h1 style={{ color: C.t1, fontSize: "20px", fontWeight: "800", letterSpacing: "-0.4px" }}>Centre d&apos;Analyse</h1>
              <p style={{ color: C.t3, fontSize: "10px" }}>Prenez des décisions éclairées grâce à des données fiables et en temps réel.</p>
            </div>
          </div>
          <PeriodeSelector periodeJours={periodeJours} onChange={setPeriodeJours} C={C}/>
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", overflowX: "auto", paddingBottom: "2px" }}>
          {SOUS_ONGLETS.map(t => (
            <button key={t.key} onClick={() => setSousOnglet(t.key)} className="tap" style={{ flexShrink: 0, backgroundColor: sousOnglet === t.key ? `${C.blue}20` : C.bgCard, border: `1px solid ${sousOnglet === t.key ? C.blue + "40" : C.border}`, borderRadius: "20px", padding: "7px 14px", color: sousOnglet === t.key ? C.blue : C.t2, fontSize: "11px", fontWeight: sousOnglet === t.key ? 800 : 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        {sousOnglet === "vue-ensemble" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px", marginBottom: "14px" }}>
              <KpiCard label="Vues totales" unite="%" C={C} color={C.purple} metric={vueEnsemble?.vues ?? null}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}/>
              <KpiCard label="Clics totaux" unite="%" C={C} color={C.orange} metric={vueEnsemble?.clics ?? null}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>}/>
              <KpiCard label="RDV générés" unite="%" C={C} color={C.green} metric={vueEnsemble?.rdvGeneres ?? null}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}/>
              <KpiCard label="Taux de conversion" unite="pts" C={C} color={C.blue} metric={vueEnsemble?.tauxConversion ?? null} format={v => `${v}%`}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}/>
              <KpiCard label="Citoyens atteints" unite="%" C={C} color={C.purple} metric={vueEnsemble?.citoyensAtteints ?? null}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}/>
              <KpiCard label="Satisfaction" unite="%" C={C} color={C.gold} metric={vueEnsemble?.satisfaction ?? null} format={v => `${v}/5`}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}/>
            </div>
            <EvolutionPerformances jours={evolution} C={C}/>
            <RepartitionCanal canaux={canaux} C={C}/>
            <TopOffresPerformantes offres={topOffres} C={C}/>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "10px", marginBottom: "14px" }}>
              <PerformancesStub C={C}/>
              <HeatmapActivite rdvs={rdvs}/>
              <ObjectifsAtteints vueEnsemble={vueEnsemble} C={C}/>
              <ActivitesRecentes stats={stats} C={C}/>
            </div>
            <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${C.gold}20` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                <span style={{ color: C.gold, fontSize: "13px", fontWeight: "800" }}>Insight IA</span>
                <span style={{ backgroundColor: `${C.gold}20`, color: C.gold, fontSize: "9px", fontWeight: 800, padding: "2px 7px", borderRadius: "10px", textTransform: "uppercase", letterSpacing: "0.3px" }}>Recommandation</span>
              </div>
              <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.7 }}>{genererInsightAnalyse(vueEnsemble, periodeJours)}</p>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" style={{ marginTop: "12px" }} icon={<YelenLogo size={14} color="#000" />} onClick={onOpenGuide}>Guide complet pour scaler</Button>
            </Card>
          </>
        )}
        {sousOnglet === "acquisition" && <AcquisitionTab data={acquisition} C={C} sourceFiltre={acquisitionSourceFiltre} onChangeSourceFiltre={setAcquisitionSourceFiltre} onVoirSourceDetail={s => setAcquisitionDrillDown(s)}/>}
        {sousOnglet === "tunnel" && <TunnelComplet rdvsPeriode={rdvsPeriode} tunnel={tunnel} C={C}/>}
        {sousOnglet === "heatmap" && <HeatmapComplete heatmap={heatmap} C={C}/>}
        {sousOnglet === "geographie" && <CarteGeographique geo={geo}/>}
        {sousOnglet === "mes-clients" && <AnalyseClientsTab data={analyseClients} C={C} geo={geo} onVoirGeographie={() => setSousOnglet("geographie")} onVoirClients={onVoirClients}/>}
        {sousOnglet === "performances" && <PerformancesStub C={C}/>}
      </div>
      {acquisitionDrillDown && (
        <AcquisitionSourceDrawer instId={instId} periodeJours={periodeJours} source={acquisitionDrillDown} onClose={() => setAcquisitionDrillDown(null)} C={C}/>
      )}
    </div>
  );
}
