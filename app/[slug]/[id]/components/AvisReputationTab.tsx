"use client";

// Avis & Réputation — écran "Santé du compte" (Lot C : score, niveau,
// évolution 30j, avis du mois, répartition par étoiles, services,
// citations, recommandations "IA Yelen"). Tableau de bord qualité de
// l'établissement, pas un système de sanction — combine plusieurs signaux
// (voir lib/reputationScore.ts), pas uniquement la note moyenne des avis.
// Aucune fermeture automatique : "alerteAdmin" ne fait que signaler, la
// décision reste toujours humaine (admin Yelen).
//
// Lot D : liste "Avis détaillés" filtrée + "Réponses" (réutilise POST
// /api/institution/avis/repondre déjà existant, même pattern visuel que la
// section avis de MesClientsTab.tsx).
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { POIDS, SEUILS, type NiveauReputation } from "@/lib/reputationScore";
import { HelpCenterGuide } from "./HelpCenterGuide";
import {
  HealthStyles, HealthHeader, HealthTabs, ScoreSummary, ScoreTrendChart, ReviewsSummary, ReviewsToolbar, ReviewCard,
  ReviewsSkeleton, HealthSkeleton, Stars, nomPropre, type ScoreComposante,
} from "./AvisReputationUi";

type Signaux = { tNote: number; tReponseNegatifs: number; tAnnulation: number; tReclamations: number };
type StatService = { service: string; nbAvis: number; nbNegatifs: number; noteMoyenne: number };
type Citation = { note: number; commentaire: string | null; created_at: string; client: string; service: string | null };

type StatusPayload = {
  score: number | null;
  niveau: NiveauReputation | null;
  phrase: string;
  alerteAdmin: boolean;
  signaux: Signaux | null;
  evolution: { date: string; score: number; nbAvis: number }[];
  mois: { positifs: number; negatifs: number; sansCommentaire: number; total: number };
  distribution: Record<"5" | "4" | "3" | "2" | "1", number>;
  services: StatService[];
  recommandations: string[];
  citations: Citation[];
  avisCount?: number;
  minAvisRequis?: number;
};

const NIVEAU_LABEL: Record<NiveauReputation, string> = {
  platinum: "Platinum", gold: "Gold", silver: "Silver", danger: "Danger",
};

function couleurNiveau(C: ThemeTokens, niveau: NiveauReputation | null, alerteAdmin: boolean): string {
  if (niveau === "platinum") return C.blue;
  if (niveau === "gold") return C.gold;
  if (niveau === "silver") return C.teal;
  if (niveau === "danger") return alerteAdmin ? C.red : C.orange;
  return C.t3;
}

// État vide (moins de MIN_AVIS_POUR_SCORE avis publiés) — illustration +
// texte explicatif de ce que l'écran affichera, pas un simple message sur
// fond vide (retour explicite de Bryan, cf. /regles-ux-ui : un état vide
// doit être conçu, jamais juste "vierge").
function EtatVideSante({ C, avisCount, minAvisRequis }: { C: ThemeTokens; avisCount: number; minAvisRequis: number }) {
  const pct = Math.min(100, (avisCount / minAvisRequis) * 100);
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "12px", padding: "36px 24px", border: `1px solid ${C.border}`, textAlign: "center" }}>
      <div style={{ width: "72px", height: "72px", borderRadius: "50%", backgroundColor: `${C.gold}12`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      </div>
      <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "8px" }}>Pas encore assez d&apos;avis</div>
      <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "420px", margin: "0 auto 20px" }}>
        Dès que votre établissement aura reçu <strong style={{ color: C.t1 }}>{minAvisRequis} avis publiés</strong>, cet
        écran affichera votre score de qualité (Platinum/Gold/Silver), son évolution sur 30 jours, la répartition de
        vos avis par service, et des recommandations automatiques pour progresser.
      </p>
      <div style={{ maxWidth: "260px", margin: "0 auto" }}>
        <div style={{ height: "8px", borderRadius: "4px", backgroundColor: C.bg3, overflow: "hidden", marginBottom: "8px" }}>
          <div style={{ width: `${pct}%`, height: "100%", backgroundColor: C.gold, borderRadius: "4px" }}/>
        </div>
        <div style={{ color: C.t3, fontSize: "11.5px", fontWeight: "700" }}>{avisCount} avis reçu{avisCount > 1 ? "s" : ""} sur {minAvisRequis} nécessaires</div>
      </div>
    </div>
  );
}

function Section({ title, sub, C, children }: { title: string; sub?: string; C: ThemeTokens; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "12px", padding: "20px", border: `1px solid ${C.border}`, marginBottom: "24px" }}>
      <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: sub ? "0 0 2px" : "0 0 14px" }}>{title}</h2>
      {sub && <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>{sub}</div>}
      {children}
    </div>
  );
}

// Bouton "i" + popover expliquant la composition du score — remplace
// l'ancien encart bleu permanent (note T11-A) : au clic plutôt qu'affiché
// en permanence, même pattern que HelpCenterGuide.tsx (popover, clic
// extérieur + Échap pour fermer), module-level pour les mêmes raisons.
function ScoreCompositionInfo({ C }: { C: ThemeTokens }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const composantes = [
    { pct: "60 %", label: "La note moyenne de vos avis" },
    { pct: "15 %", label: "Votre taux de réponse aux avis négatifs" },
    { pct: "15 %", label: "Votre taux d'annulation à votre initiative" },
    { pct: "10 %", label: "Les réclamations résolues par l'équipe Yelen" },
  ];

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="yelen-focus-ring"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Comment ce score est calculé"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "32px", height: "32px", borderRadius: "7px",
          border: `1px solid ${C.border2}`, backgroundColor: C.bgCard2,
          color: C.t2, cursor: "pointer", flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.5" x2="12.01" y2="7.5"/>
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Comment votre score de santé du compte est calculé"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
            width: "300px", backgroundColor: C.bgCard,
            border: `1px solid ${C.border2}`, borderRadius: "14px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "16px",
          }}
        >
          <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>Comment ce score est calculé</div>
          <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.55, margin: "0 0 12px" }}>
            Votre score de santé du compte est recalculé en continu sur la base de vos <strong style={{ color: C.t1 }}>30 derniers avis reçus</strong>. Il combine quatre indicateurs réels de votre activité, pas uniquement votre note moyenne :
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {composantes.map(c => (
              <div key={c.label} style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                <span style={{ color: C.gold, fontSize: "12.5px", fontWeight: "800", width: "40px", flexShrink: 0 }}>{c.pct}</span>
                <span style={{ color: C.t2, fontSize: "12px", lineHeight: 1.4 }}>{c.label}</span>
              </div>
            ))}
          </div>
          <p style={{ color: C.t3, fontSize: "11px", lineHeight: 1.5, margin: "12px 0 0" }}>
            Aucune fermeture automatique de compte n&apos;est liée à ce score : une baisse marquée déclenche un signalement, mais la décision reste toujours humaine, examinée par l&apos;équipe Yelen.
          </p>
        </div>
      )}
    </div>
  );
}

type AvisListItem = {
  id: string; note: number; commentaire: string | null; titre: string | null;
  reponse_institution: string | null; reponse_le: string | null; rdv_id: string | null;
  created_at: string; service: string | null; client: string;
};

type FiltreType = "tous" | "positif" | "negatif" | "sans_reponse" | "avec_reponse";

const FILTRES_TYPE: { value: FiltreType; label: string }[] = [
  { value: "tous", label: "Tous" },
  { value: "positif", label: "Positifs" },
  { value: "negatif", label: "Négatifs" },
  { value: "sans_reponse", label: "Sans réponse" },
  { value: "avec_reponse", label: "Avec réponse" },
];

const LIMITE_PAGE = 20;

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function dayLabelShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Section indépendante (état/fetch propres) — module-level pour éviter le
// piège déjà rencontré sur l'écran Sécurité citoyen (un composant défini à
// l'intérieur d'un parent perd le focus de ses <input> à chaque frappe).
function AvisDetaillesSection({ C, onToast, readOnly, active }: { C: ThemeTokens; onToast: (msg: string, color?: string) => void; readOnly: boolean; active: boolean }) {
  const [avis, setAvis] = useState<AvisListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [servicesDisponibles, setServicesDisponibles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const [filtreType, setFiltreType] = useState<FiltreType>("tous");
  const [filtreService, setFiltreService] = useState<string>("tous");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [reponseOuverte, setReponseOuverte] = useState<string | null>(null);
  const [reponseTexte, setReponseTexte] = useState("");
  const [savingReponse, setSavingReponse] = useState(false);
  const [maintenant] = useState(() => Date.now());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      (async () => {
        setLoading(true);
        setErreur(false);
        const params = new URLSearchParams({ limit: String(LIMITE_PAGE), offset: String(offset) });
        if (filtreType !== "tous") params.set("type", filtreType);
        if (filtreService !== "tous") params.set("service", filtreService);
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/institution/avis-reputation/liste?${params.toString()}`).catch(() => null);
        const j = res ? await res.json().catch(() => null) : null;
        if (!res || !res.ok) { if (res) onToast(j?.error || "Erreur de chargement", C.red); setErreur(true); setLoading(false); return; }
        setAvis(j.avis ?? []);
        setTotal(j.total ?? 0);
        setServicesDisponibles(j.servicesDisponibles ?? []);
        setLoading(false);
      })();
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreType, filtreService, q, offset, essai]);

  async function envoyerReponse(avisId: string) {
    if (!reponseTexte.trim()) return;
    setSavingReponse(true);
    const res = await fetch("/api/institution/avis/repondre", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avisId, reponse: reponseTexte.trim() }),
    });
    const j = await res.json().catch(() => null);
    setSavingReponse(false);
    if (!res.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    const reponseLe = new Date().toISOString();
    setAvis(prev => prev.map(a => a.id === avisId ? { ...a, reponse_institution: reponseTexte.trim(), reponse_le: reponseLe } : a));
    setReponseOuverte(null);
    setReponseTexte("");
    onToast("Réponse envoyée", C.gold);
  }

  const filtreActif = filtreType !== "tous" || filtreService !== "tous" || q.trim() !== "";
  function reinitialiser() { setFiltreType("tous"); setFiltreService("tous"); setQ(""); setOffset(0); }
  const chips = [
    ...(q.trim() ? [{ key: "q", label: `Recherche : ${q.trim()}`, onRemove: () => { setQ(""); setOffset(0); } }] : []),
    ...(filtreType !== "tous" ? [{ key: "t", label: FILTRES_TYPE.find(f => f.value === filtreType)?.label ?? filtreType, onRemove: () => { setFiltreType("tous"); setOffset(0); } }] : []),
    ...(filtreService !== "tous" ? [{ key: "s", label: `Service : ${filtreService}`, onRemove: () => { setFiltreService("tous"); setOffset(0); } }] : []),
  ];

  return (
    <section style={{ marginBottom: "24px" }}>
      <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 12px" }}>Avis détaillés</h2>
      <ReviewsToolbar C={C} active={active} q={q} onQ={v => { setQ(v); setOffset(0); }}
        types={FILTRES_TYPE} typeActif={filtreType}
        onType={v => { const f = FILTRES_TYPE.find(x => x.value === v); if (f) { setFiltreType(f.value); setOffset(0); } }}
        services={servicesDisponibles} serviceActif={filtreService} onService={v => { setFiltreService(v); setOffset(0); }}
        chips={chips} onReset={reinitialiser} total={total} filtreActif={filtreActif}/>

      {loading ? (
        <ReviewsSkeleton/>
      ) : erreur ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
          <div role="alert" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Impossible de charger les avis</div>
          <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Vérifiez votre connexion puis réessayez.</div>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setEssai(n => n + 1)}>Réessayer</Button>
        </div>
      ) : avis.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "36px 20px", textAlign: "center" }}>
          {filtreActif ? (
            <>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun résultat</div>
              <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Aucun avis ne correspond à ces filtres.</div>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={reinitialiser}>Réinitialiser les filtres</Button>
            </>
          ) : (
            <>
              <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 10px", display: "block" }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun avis pour le moment</div>
              <div style={{ color: C.t2, fontSize: "13px" }}>Les avis des citoyens apparaîtront ici après leurs rendez-vous.</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {avis.map(a => (
            <ReviewCard key={a.id} C={C} avis={a} maintenant={maintenant} readOnly={readOnly}
              replyOpen={reponseOuverte === a.id} replyText={reponseTexte} saving={savingReponse}
              onOpenReply={() => { setReponseOuverte(a.id); setReponseTexte(""); }}
              onChangeReply={setReponseTexte}
              onCancelReply={() => { setReponseOuverte(null); setReponseTexte(""); }}
              onSendReply={() => envoyerReponse(a.id)}/>
          ))}
        </div>
      )}

      {!loading && !erreur && total > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "14px" }}>
          <span style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{offset + 1}–{Math.min(offset + LIMITE_PAGE, total)} sur {total}</span>
          {total > LIMITE_PAGE && (
            <div style={{ display: "flex", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMITE_PAGE))}>Précédent</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" disabled={offset + LIMITE_PAGE >= total} onClick={() => setOffset(o => o + LIMITE_PAGE)}>Suivant</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function AvisReputationTab({ instId, onToast, access = "full" }: { instId: string; onToast: (msg: string, color?: string) => void; access?: "full" | "read" }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const [onglet, setOnglet] = useState<"ensemble" | "avis">("ensemble");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErreur(false);
      const res = await fetch("/api/institution/avis-reputation/status").catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (!res || !res.ok) { if (res) onToast(j?.error || "Erreur de chargement", C.red); setErreur(true); setLoading(false); return; }
      setData(j);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instId, essai]);

  // Onglet synchronisé avec l'URL (?avis=liste), sans Suspense : lecture
  // unique au montage + history.replaceState à chaque changement.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        if (new URLSearchParams(window.location.search).get("avis") === "liste") setOnglet("avis");
      } catch {}
    });
  }, []);
  function changerOnglet(k: string) {
    const key = k === "avis" ? "avis" : "ensemble";
    setOnglet(key);
    try {
      const u = new URL(window.location.href);
      if (key === "avis") u.searchParams.set("avis", "liste"); else u.searchParams.delete("avis");
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {}
  }

  const entete = (actions: React.ReactNode) => (
    <>
      <HealthStyles C={C}/>
      <HealthHeader C={C} actions={actions}/>
    </>
  );

  if (loading) {
    return (
      <div className="hlx-page">
        {entete(<HelpCenterGuide tab="avis-reputation" />)}
        <HealthSkeleton/>
      </div>
    );
  }

  if (erreur && !data) {
    return (
      <div className="hlx-page">
        {entete(<HelpCenterGuide tab="avis-reputation" />)}
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
          <div role="alert" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Impossible de charger la santé du compte</div>
          <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Vérifiez votre connexion puis réessayez.</div>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setEssai(n => n + 1)}>Réessayer</Button>
        </div>
      </div>
    );
  }

  if (!data || data.score === null || !data.niveau) {
    return (
      <div className="hlx-page" style={{ animation: "fadeUp 0.2s ease" }}>
        {entete(<HelpCenterGuide tab="avis-reputation" />)}
        <div style={{ marginBottom: "24px" }}>
          <EtatVideSante C={C} avisCount={data?.avisCount ?? 0} minAvisRequis={data?.minAvisRequis ?? 3}/>
        </div>
        <AvisDetaillesSection C={C} onToast={onToast} readOnly={access === "read"} active/>
      </div>
    );
  }

  const couleur = couleurNiveau(C, data.niveau, data.alerteAdmin);
  const totalDistribution = Object.values(data.distribution).reduce((a, b) => a + b, 0);
  const moisEnCours = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const composantes: ScoreComposante[] | null = data.signaux ? [
    { label: "Note moyenne", poids: `${Math.round(POIDS.note * 100)} %`, valeur: data.signaux.tNote, desc: "La note moyenne de vos avis" },
    { label: "Réponse aux avis négatifs", poids: `${Math.round(POIDS.reponseNegatifs * 100)} %`, valeur: data.signaux.tReponseNegatifs, desc: "Votre taux de réponse aux avis négatifs" },
    { label: "Annulations à votre initiative", poids: `${Math.round(POIDS.annulationInstitution * 100)} %`, valeur: data.signaux.tAnnulation, desc: "Votre taux d'annulation à votre initiative" },
    { label: "Réclamations résolues", poids: `${Math.round(POIDS.reclamations * 100)} %`, valeur: data.signaux.tReclamations, desc: "Les réclamations résolues par l'équipe Yelen" },
  ] : null;

  // Prochain palier, calculé à partir des seuils réels de reputationScore.ts.
  const palier = data.score < SEUILS.silver ? { label: "Silver", seuil: SEUILS.silver }
    : data.score < SEUILS.gold ? { label: "Gold", seuil: SEUILS.gold }
    : data.score < SEUILS.platinum ? { label: "Platinum", seuil: SEUILS.platinum }
    : null;
  const prochain = palier ? { label: palier.label, points: Math.ceil(palier.seuil - data.score) } : null;

  return (
    <div className="hlx-page" style={{ animation: "fadeUp 0.2s ease" }}>
      {entete(<><ScoreCompositionInfo C={C} /><HelpCenterGuide tab="avis-reputation" /></>)}

      {data.alerteAdmin && (
        <div role="alert" style={{ backgroundColor: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: "12px", padding: "14px 18px", marginBottom: "20px" }}>
          <div style={{ color: C.red, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Votre qualité de service est en forte baisse</div>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.55, margin: 0 }}>
            Merci de mettre en place un plan d&apos;amélioration. Votre compte est actuellement surveillé par l&apos;équipe Yelen — aucune fermeture automatique, une décision humaine sera prise après examen.
          </p>
        </div>
      )}

      <HealthTabs C={C} active={onglet} onChange={changerOnglet}
        tabs={[{ key: "ensemble", label: "Vue d'ensemble" }, { key: "avis", label: "Avis", count: totalDistribution }]}/>

      {onglet === "ensemble" && (
        <div role="tabpanel" id="hlx-panel-ensemble" aria-labelledby="hlx-tab-ensemble">
          <ScoreSummary C={C} score={data.score} color={couleur} niveauLabel={NIVEAU_LABEL[data.niveau]} phrase={data.phrase} composantes={composantes} prochain={prochain}/>
          <ScoreTrendChart C={C} evolution={data.evolution} color={couleur}/>

          {/* Recommandations IA Yelen */}
          <Section title="Recommandations" sub="Analyse automatique des tendances récentes" C={C}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {data.recommandations.map((r, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard2, borderLeft: `2px solid ${C.gold}`, borderRadius: "0 8px 8px 0", padding: "10px 14px", color: C.t2, fontSize: "14px", lineHeight: 1.5 }}>{r}</div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {onglet === "avis" && (
        <div role="tabpanel" id="hlx-panel-avis" aria-labelledby="hlx-tab-avis">
          <ReviewsSummary C={C} moisLabel={moisEnCours} mois={data.mois} distribution={data.distribution}/>

          {/* Services */}
          {data.services.length > 0 && (
            <Section title="Services" sub="Note moyenne par service ce mois-ci" C={C}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {data.services.map((s, i) => (
                  <div key={s.service} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 0", borderBottom: i < data.services.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ minWidth: 0 }}>
                      <div title={s.service} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.service}</div>
                      <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{s.nbAvis} avis{s.nbNegatifs > 0 ? ` · ${s.nbNegatifs} négatif${s.nbNegatifs > 1 ? "s" : ""}` : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, color: C.t1, fontSize: "14px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      <Stars note={Math.round(s.noteMoyenne)} size={13}/>{s.noteMoyenne.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Avis détaillés + Réponses */}
          <AvisDetaillesSection C={C} onToast={onToast} readOnly={access === "read"} active={onglet === "avis"}/>

          {/* Citations de clients */}
          {data.citations.length > 0 && (
            <Section title="Ce que disent vos clients" C={C}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {data.citations.map((c, i) => (
                  <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <span style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomPropre(c.client)}</span>
                        <Stars note={c.note} size={14}/>
                      </div>
                      <span title={dayLabel(c.created_at)} style={{ color: C.t3, fontSize: "13px", flexShrink: 0 }}>{dayLabelShort(c.created_at)}</span>
                    </div>
                    <p style={{ color: C.t2, fontSize: "14px", lineHeight: 1.55, margin: 0 }}>« {c.commentaire} »</p>
                    {c.service && <div style={{ color: C.t3, fontSize: "12px", marginTop: "6px" }}>Service : {c.service}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {access === "read" && (
        <p style={{ color: C.t3, fontSize: "12px", textAlign: "center", marginTop: "8px" }}>Vue en lecture seule.</p>
      )}
    </div>
  );
}
