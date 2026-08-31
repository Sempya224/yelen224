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
import { YelenLoader } from "@/components/YelenLoader";
import { T, type ThemeTokens } from "../theme";
import type { NiveauReputation } from "@/lib/reputationScore";

type Signaux = { tNote: number; tReponseNegatifs: number; tAnnulation: number; tReclamations: number };
type StatService = { service: string; nbAvis: number; nbNegatifs: number; noteMoyenne: number };
type Citation = { note: number; commentaire: string | null; created_at: string };

type StatusPayload = {
  score: number | null;
  niveau: NiveauReputation | null;
  phrase: string;
  alerteAdmin: boolean;
  signaux: Signaux | null;
  evolution: { date: string; score: number }[];
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
  if (niveau === "silver") return C.t2;
  if (niveau === "danger") return alerteAdmin ? C.red : C.orange;
  return C.t3;
}

function ScoreRing({ score, color, C }: { score: number; color: string; C: ThemeTokens }) {
  const size = 168, strokeW = 12;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.bg3} strokeWidth={strokeW}/>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeW}
          strokeDasharray={`${pct * circ} ${circ - pct * circ}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: C.t1, fontSize: "40px", fontWeight: "900", letterSpacing: "-1px", lineHeight: 1 }}>{score}</span>
        <span style={{ color: C.t3, fontSize: "12px", fontWeight: "700" }}>/ 100</span>
      </div>
    </div>
  );
}

// État vide (moins de MIN_AVIS_POUR_SCORE avis publiés) — illustration +
// texte explicatif de ce que l'écran affichera, pas un simple message sur
// fond vide (retour explicite de Bryan, cf. /regles-ux-ui : un état vide
// doit être conçu, jamais juste "vierge").
function EtatVideSante({ C, avisCount, minAvisRequis }: { C: ThemeTokens; avisCount: number; minAvisRequis: number }) {
  const pct = Math.min(100, (avisCount / minAvisRequis) * 100);
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "24px", padding: "36px 24px", border: `1px solid ${C.border}`, boxShadow: C.shadow, textAlign: "center" }}>
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
    <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, marginBottom: "16px" }}>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: sub ? "2px" : "14px" }}>{title}</div>
      {sub && <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "14px" }}>{sub}</div>}
      {children}
    </div>
  );
}

function chipStyle(C: ThemeTokens, selected: boolean, accent: string): React.CSSProperties {
  return {
    flexShrink: 0,
    backgroundColor: selected ? `${accent}1F` : C.bgCard2,
    border: `1.5px solid ${selected ? accent : C.border}`,
    borderRadius: "20px",
    padding: "7px 13px",
    color: selected ? accent : C.t2,
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

type AvisListItem = {
  id: string; note: number; commentaire: string | null; titre: string | null;
  reponse_institution: string | null; reponse_le: string | null; rdv_id: string | null;
  created_at: string; service: string | null;
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

// Section indépendante (état/fetch propres) — module-level pour éviter le
// piège déjà rencontré sur l'écran Sécurité citoyen (un composant défini à
// l'intérieur d'un parent perd le focus de ses <input> à chaque frappe).
function AvisDetaillesSection({ C, onToast, readOnly }: { C: ThemeTokens; onToast: (msg: string, color?: string) => void; readOnly: boolean }) {
  const [avis, setAvis] = useState<AvisListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [servicesDisponibles, setServicesDisponibles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreType, setFiltreType] = useState<FiltreType>("tous");
  const [filtreService, setFiltreService] = useState<string>("tous");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [reponseOuverte, setReponseOuverte] = useState<string | null>(null);
  const [reponseTexte, setReponseTexte] = useState("");
  const [savingReponse, setSavingReponse] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      (async () => {
        setLoading(true);
        const params = new URLSearchParams({ limit: String(LIMITE_PAGE), offset: String(offset) });
        if (filtreType !== "tous") params.set("type", filtreType);
        if (filtreService !== "tous") params.set("service", filtreService);
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/institution/avis-reputation/liste?${params.toString()}`);
        const j = await res.json().catch(() => null);
        if (!res.ok) { onToast(j?.error || "Erreur de chargement", C.red); setLoading(false); return; }
        setAvis(j.avis ?? []);
        setTotal(j.total ?? 0);
        setServicesDisponibles(j.servicesDisponibles ?? []);
        setLoading(false);
      })();
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreType, filtreService, q, offset]);

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

  return (
    <Section title="Avis détaillés" sub={`${total} avis${filtreType !== "tous" || filtreService !== "tous" || q.trim() ? " (filtrés)" : ""}`} C={C}>
      <input
        value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} placeholder="Rechercher dans les commentaires..."
        style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px 12px", fontSize: "12.5px", color: C.t1, marginBottom: "12px" }}
      />
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "10px", paddingBottom: "2px" }}>
        {FILTRES_TYPE.map(f => (
          <button key={f.value} onClick={() => { setFiltreType(f.value); setOffset(0); }} className="tap" style={chipStyle(C, filtreType === f.value, C.gold)}>{f.label}</button>
        ))}
      </div>
      {servicesDisponibles.length > 0 && (
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "14px", paddingBottom: "2px" }}>
          <button onClick={() => { setFiltreService("tous"); setOffset(0); }} className="tap" style={chipStyle(C, filtreService === "tous", C.blue)}>Tous les services</button>
          {servicesDisponibles.map(s => (
            <button key={s} onClick={() => { setFiltreService(s); setOffset(0); }} className="tap" style={chipStyle(C, filtreService === s, C.blue)}>{s}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "32px 16px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={24}/>
        </div>
      ) : avis.length === 0 ? (
        <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "28px 16px", textAlign: "center", color: C.t2, fontSize: "12.5px" }}>Aucun avis ne correspond à ces filtres.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {avis.map(a => (
            <div key={a.id} style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: C.gold, fontSize: "13px" }}>{"★".repeat(a.note)}{"☆".repeat(5 - a.note)}</span>
                <span style={{ color: C.t3, fontSize: "10.5px" }}>{dayLabel(a.created_at)}</span>
              </div>
              {a.service && <div style={{ color: C.blue, fontSize: "10.5px", fontWeight: "700", marginBottom: "4px" }}>{a.service}</div>}
              {a.titre && <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>{a.titre}</div>}
              {a.commentaire && <div style={{ color: C.t1, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "8px" }}>{a.commentaire}</div>}

              {a.reponse_institution ? (
                <div style={{ background: `${C.gold}12`, border: `1px solid ${C.gold}25`, borderRadius: "10px", padding: "8px 10px" }}>
                  <div style={{ color: C.gold, fontSize: "10px", fontWeight: "800", marginBottom: "3px" }}>Votre réponse{a.reponse_le ? ` · ${dayLabel(a.reponse_le)}` : ""}</div>
                  <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.4 }}>{a.reponse_institution}</div>
                </div>
              ) : reponseOuverte === a.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <textarea
                    value={reponseTexte} onChange={e => setReponseTexte(e.target.value)} rows={2} placeholder="Votre réponse..."
                    style={{ width: "100%", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", color: C.t1, resize: "none" }}
                  />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => envoyerReponse(a.id)} disabled={!reponseTexte.trim() || savingReponse} className="tap" style={{ flex: 1, background: C.gold, color: "#080812", border: "none", borderRadius: "8px", padding: "7px", fontSize: "11.5px", fontWeight: "800", cursor: "pointer" }}>
                      {savingReponse ? "..." : "Envoyer"}
                    </button>
                    <button onClick={() => { setReponseOuverte(null); setReponseTexte(""); }} className="tap" style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "7px 10px", fontSize: "11.5px", color: C.t2, cursor: "pointer" }}>Annuler</button>
                  </div>
                </div>
              ) : !readOnly && (
                <button onClick={() => { setReponseOuverte(a.id); setReponseTexte(""); }} className="tap" style={{ background: "none", border: `1px solid ${C.gold}40`, color: C.gold, borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: "700", cursor: "pointer" }}>Répondre</button>
              )}
            </div>
          ))}
        </div>
      )}

      {total > LIMITE_PAGE && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "14px" }}>
          <button onClick={() => setOffset(o => Math.max(0, o - LIMITE_PAGE))} disabled={offset === 0} className="tap" style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "7px 12px", fontSize: "11.5px", color: offset === 0 ? C.t3 : C.t1, cursor: offset === 0 ? "default" : "pointer" }}>Précédent</button>
          <span style={{ color: C.t3, fontSize: "11px" }}>{offset + 1}–{Math.min(offset + LIMITE_PAGE, total)} sur {total}</span>
          <button onClick={() => setOffset(o => o + LIMITE_PAGE)} disabled={offset + LIMITE_PAGE >= total} className="tap" style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "7px 12px", fontSize: "11.5px", color: offset + LIMITE_PAGE >= total ? C.t3 : C.t1, cursor: offset + LIMITE_PAGE >= total ? "default" : "pointer" }}>Suivant</button>
        </div>
      )}
    </Section>
  );
}

export function AvisReputationTab({ instId, onToast, access = "full" }: { instId: string; onToast: (msg: string, color?: string) => void; access?: "full" | "read" }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/institution/avis-reputation/status");
      const j = await res.json().catch(() => null);
      if (!res.ok) { onToast(j?.error || "Erreur de chargement", C.red); setLoading(false); return; }
      setData(j);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instId]);

  if (loading) {
    return (
      <div>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "4px" }}>Santé du compte</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "20px" }}>Suivez la qualité de service de votre établissement et améliorez votre réputation sur Yelen.</p>
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={28}/>
        </div>
      </div>
    );
  }

  if (!data || data.score === null || !data.niveau) {
    return (
      <div style={{ animation: "fadeUp 0.2s ease" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "4px" }}>Santé du compte</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "20px" }}>Suivez la qualité de service de votre établissement et améliorez votre réputation sur Yelen.</p>
        <div style={{ marginBottom: "16px" }}>
          <EtatVideSante C={C} avisCount={data?.avisCount ?? 0} minAvisRequis={data?.minAvisRequis ?? 3}/>
        </div>
        <AvisDetaillesSection C={C} onToast={onToast} readOnly={access === "read"}/>
      </div>
    );
  }

  const couleur = couleurNiveau(C, data.niveau, data.alerteAdmin);
  const maxDist = Math.max(...Object.values(data.distribution), 1);

  const evoPts = (() => {
    const W = 100, H = 34, pad = 3;
    if (data.evolution.length === 0) return [];
    return data.evolution.map((d, i) => ({
      x: pad + (i / Math.max(data.evolution.length - 1, 1)) * (W - 2 * pad),
      y: H - pad - (Math.max(0, Math.min(100, d.score)) / 100) * (H - 2 * pad),
    }));
  })();

  return (
    <div style={{ animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "4px" }}>Santé du compte</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "20px" }}>Suivez la qualité de service de votre établissement et améliorez votre réputation sur Yelen.</p>

      {data.alerteAdmin && (
        <div style={{ backgroundColor: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: "16px", padding: "16px 18px", marginBottom: "16px" }}>
          <div style={{ color: C.red, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>Votre qualité de service est en forte baisse</div>
          <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>
            Merci de mettre en place un plan d&apos;amélioration. Votre compte est actuellement surveillé par l&apos;équipe Yelen — aucune fermeture automatique, une décision humaine sera prise après examen.
          </p>
        </div>
      )}

      {/* Carte principale : score + niveau */}
      <div style={{ backgroundColor: C.bgCard, borderRadius: "24px", padding: "28px 20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, marginBottom: "16px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <ScoreRing score={data.score} color={couleur} C={C}/>
        <div style={{ marginTop: "16px", color: couleur, fontSize: "18px", fontWeight: "900", letterSpacing: "0.3px" }}>{NIVEAU_LABEL[data.niveau]}</div>
        <div style={{ color: C.t2, fontSize: "13px", marginTop: "4px" }}>{data.phrase}</div>
      </div>

      {/* Évolution 30 jours */}
      {evoPts.length > 1 && (
        <Section title="Évolution" sub="Score sur les 30 derniers jours" C={C}>
          <svg viewBox="0 0 100 34" width="100%" height="90" preserveAspectRatio="none">
            {[0.25, 0.5, 0.75].map(f => <line key={f} x1="3" x2="97" y1={34 - 3 - f * 28} y2={34 - 3 - f * 28} stroke={C.border} strokeWidth="0.4"/>)}
            <path d={evoPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")} fill="none" stroke={couleur} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Section>
      )}

      {/* Avis du mois + répartition par étoiles */}
      <Section title="Avis du mois" C={C}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
          {[
            { label: "Positifs", value: data.mois.positifs, color: C.green },
            { label: "Négatifs", value: data.mois.negatifs, color: C.red },
            { label: "Sans commentaire", value: data.mois.sansCommentaire, color: C.t3 },
          ].map(k => (
            <div key={k.label} style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px" }}>
              <div style={{ color: k.color, fontSize: "20px", fontWeight: "900", lineHeight: 1 }}>{k.value}</div>
              <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: "700", marginTop: "6px" }}>{k.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {(["5", "4", "3", "2", "1"] as const).map(n => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: C.t2, fontSize: "11px", fontWeight: "700", width: "14px" }}>{n}★</span>
              <div style={{ flex: 1, height: "8px", borderRadius: "4px", backgroundColor: C.bg3, overflow: "hidden" }}>
                <div style={{ width: `${(data.distribution[n] / maxDist) * 100}%`, height: "100%", backgroundColor: C.gold, borderRadius: "4px" }}/>
              </div>
              <span style={{ color: C.t3, fontSize: "10.5px", width: "20px", textAlign: "right" }}>{data.distribution[n]}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Services */}
      {data.services.length > 0 && (
        <Section title="Services" sub="Note moyenne par service ce mois-ci" C={C}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.services.map(s => (
              <div key={s.service} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.service}</div>
                  <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>{s.nbAvis} avis{s.nbNegatifs > 0 ? ` · ${s.nbNegatifs} négatif${s.nbNegatifs > 1 ? "s" : ""}` : ""}</div>
                </div>
                <div style={{ color: C.gold, fontSize: "14px", fontWeight: "800", flexShrink: 0 }}>★ {s.noteMoyenne.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recommandations IA Yelen */}
      <Section title="Recommandations" sub="Analyse automatique des tendances récentes" C={C}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {data.recommandations.map((r, i) => (
            <div key={i} style={{ backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}25`, borderRadius: "10px", padding: "10px 12px", color: C.t2, fontSize: "12.5px", lineHeight: 1.5 }}>{r}</div>
          ))}
        </div>
      </Section>

      {/* Citations de citoyens */}
      {data.citations.length > 0 && (
        <Section title="Ce que disent les citoyens" C={C}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {data.citations.map((c, i) => (
              <div key={i} style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px" }}>
                <div style={{ color: C.gold, fontSize: "12px", marginBottom: "4px" }}>{"★".repeat(c.note)}{"☆".repeat(5 - c.note)}</div>
                <p style={{ color: C.t1, fontSize: "12.5px", lineHeight: 1.5, margin: 0 }}>« {c.commentaire} »</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Avis détaillés + Réponses */}
      <AvisDetaillesSection C={C} onToast={onToast} readOnly={access === "read"}/>

      {access === "read" && (
        <p style={{ color: C.t3, fontSize: "11px", textAlign: "center", marginTop: "8px" }}>Vue en lecture seule.</p>
      )}
    </div>
  );
}
