"use client";

// Écran "Recommandations" (Phase 4, architecture validée CEO 13/10/2026) —
// écran dédié URL propre /{slug}/{id}/recommandations, ouvert dans un
// NOUVEL ONGLET NAVIGATEUR depuis l'icône header dédiée, même patron que
// SupportYelenTab (tab "support"). Consomme exclusivement
// POST /api/institution/recommandations/actualiser (recalcul + lecture en
// un aller-retour, toujours frais à l'ouverture et au changement de
// période) et PATCH /api/institution/recommandations/:id (marquer
// consultée/traitée). Zéro LLM — tout le texte ici est écrit à la main côté
// serveur (lib/recommandationsInstitution.ts), ce composant ne fait
// qu'afficher les constats déjà rédigés.
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { YelenLoader } from "@/components/YelenLoader";
import { YelenLogo } from "@/components/YelenLogo";
import { SectionHeader } from "../dashboardShared";
import { can, type MembreRole } from "@/lib/institutionPermissions";
import { heureDepuisHorodatage } from "@/lib/heure";

type Priorite = "critique" | "attention";
type StatutRecommandation = "nouvelle" | "consultee" | "traitee" | "expiree";
type PeriodeJours = 7 | 30 | 90 | 365;

type RecommandationItem = {
  id: string;
  type: string;
  priorite: Priorite;
  constat: string;
  donnees_json: Record<string, unknown>;
  periode_jours: number;
  action_label: string | null;
  action_cible: string | null;
  statut: StatutRecommandation;
  created_at: string;
  actualisee_le: string;
  consultee_le: string | null;
  traitee_le: string | null;
  expiree_le: string | null;
};

const Ic = {
  X: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
};

function libellePriorite(p: Priorite): string { return p === "critique" ? "Critique" : "À surveiller"; }
function couleurPriorite(p: Priorite, C: ThemeTokens): string { return p === "critique" ? C.red : C.orange; }
function fondPriorite(p: Priorite, C: ThemeTokens): string { return p === "critique" ? C.redL : C.orangeL; }

function libellePeriodeLongue(jours: PeriodeJours): string {
  if (jours === 7) return "les 7 derniers jours";
  if (jours === 30) return "les 30 derniers jours";
  if (jours === 90) return "les 90 derniers jours";
  return "l'année en cours";
}
function formatHeure(d: Date): string {
  return heureDepuisHorodatage(d);
}

// Mêmes presets que le sélecteur du Centre d'Analyse (PeriodeSelector,
// CentreAnalyseTab.tsx) — dupliqué volontairement (petit composant local,
// pas partagé entre fichiers dans ce dashboard).
function PeriodeSelector({ periodeJours, onChange, C }: { periodeJours: PeriodeJours; onChange: (j: PeriodeJours) => void; C: ThemeTokens }) {
  return (
    <select value={periodeJours} onChange={e => onChange(Number(e.target.value) as PeriodeJours)} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "7px 10px", color: C.t1, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
      <option value={7}>7 derniers jours</option>
      <option value={30}>30 derniers jours</option>
      <option value={90}>90 derniers jours</option>
      <option value={365}>Cette année</option>
    </select>
  );
}

// Les "données qui justifient le constat" (CEO section 4) rendues comme une
// phrase courte plutôt qu'un tableau brut de clés techniques — ne couvre
// que les clés que le moteur produit réellement (recommandationsInstitution.ts),
// jamais une clé devinée.
function donneesJustification(d: Record<string, unknown>): string | null {
  if (typeof d.nbRdvNonTraites === "number") return `Basé sur ${d.nbRdvNonTraites} rendez-vous non traités actuellement.`;
  if (typeof d.rdvGeneres === "number" && typeof d.tauxConversionActuel === "number") return `Basé sur ${d.rdvGeneres} rendez-vous sur la période, taux actuel ${d.tauxConversionActuel}%.`;
  if (typeof d.demandes === "number" && typeof d.perteCount === "number") return `Basé sur ${d.demandes} demandes, ${d.perteCount} perdues à cette étape.`;
  return null;
}

function RecommandationCard({ item, membreRole, onAction, onMarquerConsultee, onMarquerTraitee, enCours, C }: {
  item: RecommandationItem;
  membreRole: MembreRole | null;
  onAction: (cible: string) => void;
  onMarquerConsultee: (id: string) => void;
  onMarquerTraitee: (id: string) => void;
  enCours: boolean;
  C: ThemeTokens;
}) {
  const couleur = couleurPriorite(item.priorite, C);
  const justification = donneesJustification(item.donnees_json);
  const peutTraiter = membreRole !== null && can(membreRole, "recommandations.marquer_traitee");
  const estTraitee = item.statut === "traitee";

  return (
    <div style={{ background: C.bgCard2, border: `1px solid ${estTraitee ? C.border : couleur + "35"}`, borderRadius: "14px", padding: "14px 16px", opacity: estTraitee ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
        <Badge label={libellePriorite(item.priorite)} color={couleur} bg={fondPriorite(item.priorite, C)}/>
        {estTraitee && <Badge label="Traitée" color={C.t3} bg={C.bg3}/>}
        {item.statut === "nouvelle" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, flexShrink: 0 }} title="Nouvelle"/>}
      </div>
      <p style={{ color: C.t1, fontSize: "13px", lineHeight: 1.55, margin: 0, fontWeight: 600 }}>{item.constat}</p>
      {justification && <p style={{ color: C.t3, fontSize: "11px", margin: "6px 0 0" }}>{justification}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "12px", flexWrap: "wrap" }}>
        {item.action_cible && item.action_label && !estTraitee && (
          <button onClick={() => onAction(item.action_cible!)} className="tap" style={{ background: "none", border: "none", color: couleur, fontSize: "11.5px", fontWeight: 800, padding: 0, cursor: "pointer" }}>{item.action_label} →</button>
        )}
        {!estTraitee && item.statut === "nouvelle" && (
          <button onClick={() => onMarquerConsultee(item.id)} disabled={enCours} className="tap" style={{ background: "none", border: "none", color: C.t3, fontSize: "11px", fontWeight: 700, padding: 0, cursor: "pointer" }}>Marquer comme vue</button>
        )}
        {!estTraitee && peutTraiter && (
          <button onClick={() => onMarquerTraitee(item.id)} disabled={enCours} className="tap" style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: C.green, fontSize: "11px", fontWeight: 700, padding: 0, cursor: "pointer" }}>{Ic.Check()} Marquer comme traitée</button>
        )}
      </div>
    </div>
  );
}

export function RecommandationsTab({ onClose, onNavigate, onToast, membreRole, instName }: {
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onToast: (msg: string, color?: string) => void;
  membreRole: MembreRole | null;
  instName?: string | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [periodeJours, setPeriodeJours] = useState<PeriodeJours>(30);
  const [recommandations, setRecommandations] = useState<RecommandationItem[] | null>(null);
  const [volumeSuffisant, setVolumeSuffisant] = useState<boolean | null>(null);
  const [actualising, setActualising] = useState(false);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  // Distinct du spinner de premier chargement (recommandations === null) —
  // une erreur technique (API en panne, réseau coupé) ne doit jamais
  // ressembler à un chargement qui ne finit jamais (retour Bryan
  // 13/10/2026 : "l'écran doit distinguer le manque de données, le
  // chargement et une erreur technique").
  const [erreur, setErreur] = useState<string | null>(null);
  const [derniereActualisationLe, setDerniereActualisationLe] = useState<Date | null>(null);

  const actualiser = useCallback(async (jours: PeriodeJours) => {
    setActualising(true);
    try {
      const res = await fetch(`/api/institution/recommandations/actualiser?jours=${jours}`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = j?.error || "Impossible de calculer les recommandations.";
        setErreur(msg);
        onToast(msg, C.red);
        return;
      }
      setErreur(null);
      setDerniereActualisationLe(new Date());
      setRecommandations(j?.recommandations ?? []);
      setVolumeSuffisant(j?.volumeSuffisant ?? null);
    } catch {
      const msg = "Impossible de contacter le serveur. Vérifiez votre connexion.";
      setErreur(msg);
      onToast(msg, C.red);
    } finally {
      setActualising(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { actualiser(periodeJours); }, [periodeJours, actualiser]);

  async function changerStatut(id: string, statut: "consultee" | "traitee") {
    if (patchingId) return;
    setPatchingId(id);
    try {
      const res = await fetch(`/api/institution/recommandations/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { onToast(j?.error || "Action impossible.", C.red); return; }
      setRecommandations(prev => prev?.map(r => r.id === id ? { ...r, statut, consultee_le: statut === "consultee" || statut === "traitee" ? new Date().toISOString() : r.consultee_le, traitee_le: statut === "traitee" ? new Date().toISOString() : r.traitee_le } : r) ?? null);
    } catch {
      onToast("Action impossible.", C.red);
    } finally {
      setPatchingId(null);
    }
  }

  const actives = (recommandations ?? []).filter(r => r.statut === "nouvelle" || r.statut === "consultee")
    .sort((a, b) => (a.priorite === b.priorite ? 0 : a.priorite === "critique" ? -1 : 1));
  const traitees = (recommandations ?? []).filter(r => r.statut === "traitee");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: C.bg, display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", flexShrink: 0 }}>
          <YelenLogo size={19} color="#000" strokeWidth={2.3}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.t1, fontSize: 14.5, fontWeight: 800 }}>Recommandations</div>
          <div style={{ color: C.t3, fontSize: 11, fontWeight: 600, marginTop: 1 }}>{instName ? `${instName} · ` : ""}Constats déterministes sur vos indicateurs réels — aucune intelligence artificielle générative.</div>
        </div>
        <button onClick={onClose} className="tap" style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, cursor: "pointer", flexShrink: 0 }}>{Ic.X()}</button>
      </div>

      <div style={{ padding: "20px", maxWidth: "720px", width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <PeriodeSelector periodeJours={periodeJours} onChange={setPeriodeJours} C={C}/>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {!actualising && derniereActualisationLe && (
                <span style={{ color: C.t3, fontSize: 10.5, fontWeight: 600 }}>Actualisé à {formatHeure(derniereActualisationLe)}</span>
              )}
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" loading={actualising} onClick={() => actualiser(periodeJours)}>
                {actualising ? "Actualisation…" : "Actualiser"}
              </Button>
            </div>
          </div>
          {/* Clarifie la fenêtre réellement analysée (retour Bryan 13/10/2026) —
              les règles B/C comparent à la même durée précédente (voir
              calculerVueEnsemble/calculerAnalyseTunnel), jamais un autre repère. */}
          <div style={{ color: C.t3, fontSize: 10.5, marginTop: 6 }}>Analysé sur {libellePeriodeLongue(periodeJours)}, comparé à la période équivalente précédente.</div>
        </div>

        {recommandations === null && erreur === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><YelenLoader size={24}/></div>
        ) : recommandations === null && erreur !== null ? (
          // Erreur technique — jamais confondue avec un chargement qui ne
          // finit jamais ni avec "pas assez de données" (états distincts,
          // retour Bryan 13/10/2026).
          <Card tokens={toCardTokens(C)} padding="24px" style={{ textAlign: "center" }}>
            <div style={{ color: C.red, fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Impossible de charger les recommandations</div>
            <div style={{ color: C.t3, fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>{erreur}</div>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" loading={actualising} onClick={() => actualiser(periodeJours)}>Réessayer</Button>
          </Card>
        ) : actives.length === 0 && traitees.length === 0 ? (
          <Card tokens={toCardTokens(C)} padding="24px" style={{ textAlign: "center" }}>
            {volumeSuffisant === false ? (
              <>
                <div style={{ color: C.t1, fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Pas encore assez de données</div>
                <div style={{ color: C.t3, fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>Le volume de rendez-vous sur {libellePeriodeLongue(periodeJours)} est trop faible pour générer des recommandations fiables. Les recommandations apparaîtront automatiquement dès que votre activité sera suffisante.</div>
                <button onClick={() => onNavigate("rdv")} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "11.5px", fontWeight: 800, padding: 0, cursor: "pointer" }}>Voir mes rendez-vous →</button>
              </>
            ) : (
              <>
                <div style={{ color: C.t1, fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Aucune recommandation pour le moment</div>
                <div style={{ color: C.t3, fontSize: 12, lineHeight: 1.6 }}>Vos indicateurs sont stables sur {libellePeriodeLongue(periodeJours)}.</div>
              </>
            )}
          </Card>
        ) : (
          <>
            {actives.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: traitees.length > 0 ? "22px" : 0 }}>
                {actives.map(item => (
                  <RecommandationCard key={item.id} item={item} membreRole={membreRole} C={C}
                    enCours={patchingId === item.id}
                    onAction={cible => onNavigate(cible)}
                    onMarquerConsultee={id => changerStatut(id, "consultee")}
                    onMarquerTraitee={id => changerStatut(id, "traitee")}
                  />
                ))}
              </div>
            )}
            {traitees.length > 0 && (
              <div>
                <SectionHeader label="Traitées récemment" accent={C.t3}/>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
                  {traitees.map(item => (
                    <RecommandationCard key={item.id} item={item} membreRole={membreRole} C={C}
                      enCours={false}
                      onAction={cible => onNavigate(cible)}
                      onMarquerConsultee={() => {}}
                      onMarquerTraitee={() => {}}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
