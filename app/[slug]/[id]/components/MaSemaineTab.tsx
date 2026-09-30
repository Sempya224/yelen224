"use client";

// « Préparer ma semaine » — Phase 1 fondations (décision CEO 26/09/2026).
// Réutilise le moteur taches/evenements_agenda existant (Espace de travail)
// plutôt que de dupliquer un système parallèle (décision actée avec Bryan,
// voir le plan approuvé) — une tâche créée ici apparaît aussi dans Espace de
// travail → Tâches, et inversement. Pas d'`instId` en prop : comme
// CollaborationTab, l'institution est toujours dérivée du JWT côté serveur,
// jamais du client.
//
// Tranche 1 : capture libre ("À organiser") + 3 priorités de la semaine.
// Tranche 2 : grille des 7 jours — engagements (evenements_agenda) + tâches
// planifiées (taches.echeance), indicateur de capacité simple.
// Tranche 3 : "Aujourd'hui" (fusion engagements+tâches du jour, votre
// priorité) + boucle de replanification (réutilise le même
// calendrier-picker que "À organiser" pour reporter une tâche déjà datée) +
// bilan de fin de semaine (compteurs réels terminées/ouvertes, notes,
// clôture de `preparations_semaine`).
// Phase 4 lot 1 (26/09/2026) : première brique de la "couche d'intégration
// Yelen" (brief §17) — suggestions déterministes issues de signaux Yelen
// déjà réels (GET /api/institution/ma-semaine/suggestions, RDV manqués non
// encore suivis), jamais auto-créées : le membre choisit d'accepter ou non.
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";
import { PRIORITES, prioriteColor, prioriteLabel, toISODate } from "../espace-travail/components/TachesOverlays";

type TacheSemaine = {
  id: string; titre: string; priorite: string; statut: string;
  echeance: string | null; duree_estimee_minutes: number | null;
};
type EvenementJour = {
  id: string; titre: string; date: string; heure_debut: string | null; heure_fin: string | null; membre_id: string | null;
};
type Suggestion = {
  id: string; type: "rdv_absent" | "document_attente" | "signalement_assigne";
  titre: string; citoyen_id: string | null; rdv_id: string | null;
};
// Mappe chaque type de suggestion vers l'origine réelle de `taches`
// (voir migration 20260926000001) — "client" pour un document (le suivi
// concerne la relation citoyen, pas le RDV lui-même), "manuel" pour un
// signalement (aucune colonne `signalement_id` sur `taches`, donc pas de
// lien structurel possible, seulement le numéro dans le titre).
const ORIGINE_PAR_TYPE_SUGGESTION: Record<Suggestion["type"], string> = {
  rdv_absent: "rdv", document_attente: "client", signalement_assigne: "manuel",
};

const JOURS_LABEL = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
// Capacité fixe par défaut (8h) — aucun réglage d'horaires personnalisés
// par membre n'existe aujourd'hui dans Yelen, en inventer un serait hors
// périmètre de cette tranche (voir le plan : "on ne branche/n'invente rien
// au-delà de ce qui est demandé"). Purement indicatif, jamais persisté.
const CAPACITE_JOUR_MINUTES = 8 * 60;

// Guinée = UTC+0 toute l'année (même hypothèse que le job Clock In Shift) —
// affichage seulement ici, la vraie référence "semaine" côté serveur est
// calculée dans app/api/institution/preparations-semaine/route.ts.
function lundiDeLaSemaine(d: Date): Date {
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(d);
  lundi.setDate(d.getDate() + decalage);
  lundi.setHours(0, 0, 0, 0);
  return lundi;
}

function dureeMinutes(debut: string | null, fin: string | null): number {
  if (!debut || !fin) return 0;
  const [hD, mD] = debut.split(":").map(Number);
  const [hF, mF] = fin.split(":").map(Number);
  const minutes = (hF * 60 + mF) - (hD * 60 + mD);
  return minutes > 0 ? minutes : 0;
}

function formatDuree(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

// Ligne de tâche partagée par "À organiser" et "Aujourd'hui" — au niveau
// module (pas défini dans MaSemaineTab) : un composant redéfini à chaque
// rendu du parent perdrait son identité React à chaque interaction, piège
// déjà documenté sur ce projet (voir CLAUDE.md).
function TacheRow({ t, C, planificationOuverte, jours, onToggle, onPlanifier, onSupprimer, onTogglePicker }: {
  t: TacheSemaine; C: ThemeTokens; planificationOuverte: boolean; jours: Date[];
  onToggle: () => void; onPlanifier: (dateIso: string) => void; onSupprimer: () => void; onTogglePicker: () => void;
}) {
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 4px" }}>
        <button onClick={onToggle} className="tap" aria-label="Marquer comme terminé"
          style={{ width: "18px", height: "18px", borderRadius: "5px", border: `1.5px solid ${C.border2}`, background: "transparent", cursor: "pointer", flexShrink: 0 }}/>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: prioriteColor(t.priorite, C), flexShrink: 0 }} title={prioriteLabel(t.priorite)}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.t1, fontSize: "13px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titre}</div>
          {t.duree_estimee_minutes ? <div style={{ color: C.t3, fontSize: "11px" }}>{formatDuree(t.duree_estimee_minutes)}</div> : null}
        </div>
        <button onClick={onTogglePicker} className="tap" aria-label="Planifier sur un jour" title="Planifier sur un jour"
          style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, padding: "4px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        <button onClick={onSupprimer} className="tap" aria-label="Supprimer" style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, padding: "4px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {planificationOuverte && (
        <div style={{ display: "flex", gap: "6px", padding: "0 4px 10px" }}>
          {jours.map((j, i) => (
            <button key={i} onClick={() => onPlanifier(toISODate(j))} className="tap"
              style={{ flex: 1, background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "7px", padding: "6px 0", color: C.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
              {JOURS_LABEL[i]} {j.getDate()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MaSemaineTab({ onToast }: { onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const btnTokens = toUiTokens(C);
  const cardTokens = toCardTokens(C);

  const [lundi] = useState(() => lundiDeLaSemaine(new Date()));
  const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
  const semaineDebut = toISODate(lundi);
  const jours = Array.from({ length: 7 }, (_, i) => { const d = new Date(lundi); d.setDate(lundi.getDate() + i); return d; });
  const aujourdhuiIso = toISODate(new Date());

  const [loading, setLoading] = useState(true);
  const [taches, setTaches] = useState<TacheSemaine[]>([]);
  const [evenements, setEvenements] = useState<EvenementJour[]>([]);
  const [priorites, setPriorites] = useState<string[]>(["", "", ""]);
  const [savingPriorites, setSavingPriorites] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [titre, setTitre] = useState("");
  const [priorite, setPriorite] = useState<string>("normale");
  const [echeance, setEcheance] = useState("");
  const [duree, setDuree] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [planificationOuverte, setPlanificationOuverte] = useState<string | null>(null);

  const [preparationId, setPreparationId] = useState<string | null>(null);
  const [semaineTerminee, setSemaineTerminee] = useState(false);
  const [bilanOuvert, setBilanOuvert] = useState(false);
  const [bilanCounts, setBilanCounts] = useState<{ terminees: number; ouvertes: number } | null>(null);
  const [bilanNotes, setBilanNotes] = useState("");
  const [chargementBilan, setChargementBilan] = useState(false);
  const [cloturing, setCloturing] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const debutDate = new Date(`${semaineDebut}T00:00:00`);
    const finDate = new Date(debutDate); finDate.setDate(debutDate.getDate() + 6);
    const semaineFin = toISODate(finDate);
    const [tRes, pRes, mRes, aRes, sRes] = await Promise.all([
      fetch("/api/institution/taches?membre_id=moi"),
      fetch(`/api/institution/preparations-semaine?semaine_debut=${semaineDebut}`),
      fetch("/api/institution/membres"),
      fetch(`/api/institution/agenda?date_from=${semaineDebut}&date_to=${semaineFin}`),
      fetch("/api/institution/ma-semaine/suggestions"),
    ]);
    if (sRes.ok) { const j = await sRes.json(); setSuggestions(j.suggestions ?? []); }
    if (tRes.ok) {
      const j = await tRes.json();
      setTaches((j.taches as TacheSemaine[]).filter(t => t.statut !== "termine"));
    }
    if (pRes.ok) {
      const j = await pRes.json();
      const prep = j.preparation as { id?: string; priorites?: string[]; statut?: string } | undefined;
      const p = prep?.priorites ?? [];
      setPriorites([p[0] ?? "", p[1] ?? "", p[2] ?? ""]);
      setPreparationId(prep?.id ?? null);
      setSemaineTerminee(prep?.statut === "terminee");
    }
    let moiId: string | null = null;
    if (mRes.ok) { const j = await mRes.json(); moiId = j.membreId ?? null; }
    if (aRes.ok) {
      const j = await aRes.json();
      setEvenements((j.evenements as EvenementJour[]).filter(e => e.membre_id === moiId));
    }
    setLoading(false);
  }, [semaineDebut]);

  useEffect(() => { load(); }, [load]);

  async function enregistrerPriorites() {
    setSavingPriorites(true);
    const res = await fetch("/api/institution/preparations-semaine", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semaine_debut: semaineDebut, priorites: priorites.filter(p => p.trim()) }),
    });
    setSavingPriorites(false);
    onToast(res.ok ? "Priorités enregistrées" : "Erreur — priorités non enregistrées", res.ok ? C.green : C.red);
  }

  async function ajouterTache() {
    if (!titre.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/institution/taches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titre: titre.trim(), priorite, echeance: echeance || null, duree_estimee_minutes: duree ? Number(duree) : undefined }),
    });
    setSubmitting(false);
    if (!res.ok) { onToast("Erreur — tâche non créée", C.red); return; }
    setTitre(""); setPriorite("normale"); setEcheance(""); setDuree(""); setFormOpen(false);
    load();
  }

  async function toggleFait(t: TacheSemaine) {
    setTaches(prev => prev.filter(x => x.id !== t.id));
    const res = await fetch("/api/institution/taches", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, statut: "termine" }),
    });
    if (!res.ok) { onToast("Erreur — statut non enregistré", C.red); load(); }
  }

  async function supprimer(id: string) {
    setTaches(prev => prev.filter(x => x.id !== id));
    const res = await fetch(`/api/institution/taches?id=${id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur — suppression impossible", C.red); load(); }
  }

  // Assigne/retire une date fixe — c'est ça, "planifier" une tâche du panier
  // "À organiser" vers un jour précis (brief §4/§6), ou l'y faire revenir.
  async function planifier(id: string, dateIso: string | null) {
    setTaches(prev => prev.map(x => x.id === id ? { ...x, echeance: dateIso } : x));
    setPlanificationOuverte(null);
    const res = await fetch("/api/institution/taches", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, echeance: dateIso }),
    });
    if (!res.ok) { onToast("Erreur — planification non enregistrée", C.red); load(); }
  }

  // Transforme une suggestion en vraie tâche personnelle ("À organiser",
  // sans échéance) — jamais auto-créée, toujours un choix explicite du
  // membre (brief §12/§17 : Yelen propose, ne décide jamais à sa place).
  async function accepterSuggestion(s: Suggestion) {
    setAcceptingId(s.id);
    const res = await fetch("/api/institution/taches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titre: s.titre, priorite: "haute", origine: ORIGINE_PAR_TYPE_SUGGESTION[s.type], citoyen_id: s.citoyen_id, rdv_id: s.rdv_id }),
    });
    setAcceptingId(null);
    if (!res.ok) { onToast("Erreur — suggestion non convertie", C.red); return; }
    setSuggestions(prev => prev.filter(x => x.id !== s.id));
    onToast("Ajoutée à votre semaine", C.green);
    load();
  }

  // Ignorer est purement local (pas de "suggestion rejetée" persistée) —
  // elle réapparaîtra au prochain chargement tant qu'aucune tâche liée au
  // même rdv_id n'existe, ce qui est le comportement voulu pour ce lot 1.
  function ignorerSuggestion(id: string) {
    setSuggestions(prev => prev.filter(x => x.id !== id));
  }

  // Bilan de fin de semaine (brief §16) — compteurs réels uniquement :
  // "terminées" vs "encore ouvertes" (a_faire/en_cours), aucune catégorie
  // "annulée" fabriquée — cette valeur n'existe pas dans `taches.statut`.
  // Refetch complet (sans filtre statut) car `taches` en état local exclut
  // déjà les tâches terminées (voir load()).
  async function voirBilan() {
    setChargementBilan(true);
    const res = await fetch("/api/institution/taches?membre_id=moi");
    setChargementBilan(false);
    if (!res.ok) { onToast("Erreur — bilan indisponible", C.red); return; }
    const j = await res.json();
    const debutDate = new Date(`${semaineDebut}T00:00:00`);
    const finDate = new Date(debutDate); finDate.setDate(debutDate.getDate() + 6);
    const semaineFin = toISODate(finDate);
    const cetteSemaine = (j.taches as TacheSemaine[]).filter(t => t.echeance && t.echeance >= semaineDebut && t.echeance <= semaineFin);
    const terminees = cetteSemaine.filter(t => t.statut === "termine").length;
    setBilanCounts({ terminees, ouvertes: cetteSemaine.length - terminees });
    setBilanOuvert(true);
  }

  async function cloturerSemaine() {
    if (!bilanCounts) return;
    setCloturing(true);
    let id = preparationId;
    if (!id) {
      const resCreate = await fetch("/api/institution/preparations-semaine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine_debut: semaineDebut, priorites: priorites.filter(p => p.trim()) }),
      });
      if (resCreate.ok) { const j = await resCreate.json(); id = j.id; setPreparationId(id); }
    }
    if (!id) { setCloturing(false); onToast("Erreur — impossible de clôturer", C.red); return; }
    const res = await fetch("/api/institution/preparations-semaine", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, statut: "terminee", bilan: { ...bilanCounts, notes: bilanNotes.trim() || undefined } }),
    });
    setCloturing(false);
    if (!res.ok) { onToast("Erreur — clôture non enregistrée", C.red); return; }
    setSemaineTerminee(true);
    onToast("Semaine clôturée", C.green);
  }

  const rangeLabel = `${lundi.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → ${dimanche.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  const inputStyle: React.CSSProperties = { background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "10px 12px", color: C.t1, fontSize: "13px", fontFamily: "inherit" };
  const aOrganiser = taches.filter(t => !t.echeance);
  const evAujourdhui = evenements.filter(e => e.date === aujourdhuiIso).sort((a, b) => (a.heure_debut ?? "99:99").localeCompare(b.heure_debut ?? "99:99"));
  const tAujourdhui = taches.filter(t => t.echeance === aujourdhuiIso);
  const premierePriorite = priorites.find(p => p.trim());

  return (
    <div style={{ padding: "16px", paddingBottom: "40px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "4px" }}>Préparer ma semaine</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "4px" }}>Organisez ce qui compte avant que la semaine commence.</p>
      <p style={{ color: C.t3, fontSize: "12px", fontWeight: "700", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{rangeLabel}</p>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><YelenLoader size={28} color={C.gold}/></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "560px" }}>
            <Card tokens={cardTokens}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "4px" }}>Aujourd&apos;hui</div>
              <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px" }}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>

              {premierePriorite && (
                <div style={{ background: C.goldL, borderRadius: "8px", padding: "10px 12px", marginBottom: "14px" }}>
                  <div style={{ color: C.goldD, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "2px" }}>Votre priorité</div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>{premierePriorite}</div>
                </div>
              )}

              {evAujourdhui.length === 0 && tAujourdhui.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "13px", padding: "12px 0", textAlign: "center" }}>Rien de prévu pour l&apos;instant.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                  {evAujourdhui.map(e => (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 4px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: C.blue, fontSize: "12px", fontWeight: "800", width: "44px", flexShrink: 0 }}>{e.heure_debut ? e.heure_debut.slice(0, 5) : "—"}</span>
                      <span style={{ color: C.t1, fontSize: "13px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.titre}</span>
                    </div>
                  ))}
                  {tAujourdhui.map(t => (
                    <TacheRow key={t.id} t={t} C={C} jours={jours} planificationOuverte={planificationOuverte === t.id}
                      onToggle={() => toggleFait(t)} onSupprimer={() => supprimer(t.id)}
                      onTogglePicker={() => setPlanificationOuverte(o => o === t.id ? null : t.id)}
                      onPlanifier={dateIso => planifier(t.id, dateIso)}/>
                  ))}
                </div>
              )}

              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                <Button tokens={btnTokens} size="sm" variant="secondary" onClick={() => { setEcheance(aujourdhuiIso); setFormOpen(true); }}>+ Ajouter pour aujourd&apos;hui</Button>
              </div>
            </Card>

            {suggestions.length > 0 && (
              <Card tokens={cardTokens}>
                <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "4px" }}>Suggestions</div>
                <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px" }}>Des signaux Yelen déjà réels — à vous de décider si ça mérite une place dans votre semaine.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {suggestions.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: C.bgCard2, borderRadius: "8px", padding: "10px 12px" }}>
                      <span style={{ color: C.t1, fontSize: "13px", fontWeight: "600", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.titre}</span>
                      <Button tokens={btnTokens} size="sm" loading={acceptingId === s.id} onClick={() => accepterSuggestion(s)}>Ajouter</Button>
                      <button onClick={() => ignorerSuggestion(s.id)} className="tap" aria-label="Ignorer" title="Ignorer"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, padding: "4px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card tokens={cardTokens}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "4px" }}>Mes 3 priorités</div>
              <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px" }}>Que voulez-vous absolument avoir accompli d&apos;ici vendredi ?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {priorites.map((p, i) => (
                  <input key={i} value={p} placeholder={`Priorité ${i + 1}`} style={inputStyle}
                    onChange={e => setPriorites(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                  />
                ))}
              </div>
              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                <Button tokens={btnTokens} size="sm" loading={savingPriorites} onClick={enregistrerPriorites}>Enregistrer</Button>
              </div>
            </Card>

            <Card tokens={cardTokens}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>À organiser</div>
                <Button tokens={btnTokens} size="sm" variant="secondary" onClick={() => setFormOpen(o => !o)}>{formOpen ? "Annuler" : "+ Ajouter"}</Button>
              </div>
              <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px" }}>Ce qu&apos;il reste à planifier — pas encore une date fixe.</div>

              {formOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px", padding: "12px", background: C.bgCard2, borderRadius: "10px" }}>
                  <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Que devez-vous faire ?" style={{ ...inputStyle, background: C.bgCard }}/>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <select value={priorite} onChange={e => setPriorite(e.target.value)} style={{ ...inputStyle, background: C.bgCard, flex: 1 }}>
                      {PRIORITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} style={{ ...inputStyle, background: C.bgCard, flex: 1 }}/>
                    <input type="number" min="0" value={duree} onChange={e => setDuree(e.target.value)} placeholder="Durée (min)" style={{ ...inputStyle, background: C.bgCard, width: "110px" }}/>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button tokens={btnTokens} size="sm" loading={submitting} disabled={!titre.trim()} onClick={ajouterTache}>Ajouter</Button>
                  </div>
                </div>
              )}

              {aOrganiser.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "13px", padding: "20px 0", textAlign: "center" }}>Rien à organiser pour l&apos;instant.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {aOrganiser.map(t => (
                    <TacheRow key={t.id} t={t} C={C} jours={jours} planificationOuverte={planificationOuverte === t.id}
                      onToggle={() => toggleFait(t)} onSupprimer={() => supprimer(t.id)}
                      onTogglePicker={() => setPlanificationOuverte(o => o === t.id ? null : t.id)}
                      onPlanifier={dateIso => planifier(t.id, dateIso)}/>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card tokens={cardTokens} noPadding>
            <div style={{ padding: "18px 18px 4px" }}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "4px" }}>Cette semaine</div>
              <div style={{ color: C.t3, fontSize: "12px", marginBottom: "10px" }}>Vos engagements et tâches déjà planifiés, jour par jour.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(140px, 1fr))", gap: "1px", background: C.border, overflowX: "auto" }}>
              {jours.map((j, i) => {
                const iso = toISODate(j);
                const estAujourdhui = iso === aujourdhuiIso;
                const evJour = evenements.filter(e => e.date === iso);
                const tJour = taches.filter(t => t.echeance === iso);
                const minutesEngage = evJour.reduce((sum, e) => sum + dureeMinutes(e.heure_debut, e.heure_fin), 0);
                const minutesPlanifie = tJour.reduce((sum, t) => sum + (t.duree_estimee_minutes ?? 0), 0);
                const marge = CAPACITE_JOUR_MINUTES - minutesEngage - minutesPlanifie;
                return (
                  <div key={i} style={{ background: estAujourdhui ? C.bgCard2 : C.bgCard, padding: "12px 10px", display: "flex", flexDirection: "column", gap: "8px", minHeight: "160px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                      <span style={{ color: estAujourdhui ? C.gold : C.t2, fontSize: "11px", fontWeight: "800", textTransform: "uppercase" }}>{JOURS_LABEL[i]}</span>
                      <span style={{ color: estAujourdhui ? C.gold : C.t1, fontSize: "13px", fontWeight: "800" }}>{j.getDate()}</span>
                    </div>

                    {evJour.map(e => (
                      <div key={e.id} style={{ background: C.blueL, borderRadius: "6px", padding: "5px 7px" }}>
                        <div style={{ color: C.blue, fontSize: "10px", fontWeight: "800" }}>{e.heure_debut ? e.heure_debut.slice(0, 5) : "Engagement"}</div>
                        <div style={{ color: C.t1, fontSize: "11.5px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.titre}</div>
                      </div>
                    ))}
                    {tJour.map(t => (
                      <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <button onClick={() => toggleFait(t)} className="tap" aria-label="Marquer comme terminé"
                          style={{ marginTop: "2px", width: "14px", height: "14px", borderRadius: "4px", border: `1.5px solid ${C.border2}`, background: "transparent", cursor: "pointer", flexShrink: 0 }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.t1, fontSize: "11.5px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titre}</div>
                        </div>
                        <button onClick={() => planifier(t.id, null)} className="tap" aria-label="Retirer de ce jour" title="Retirer de ce jour"
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, padding: 0, flexShrink: 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                    {evJour.length === 0 && tJour.length === 0 && (
                      <div style={{ color: C.t3, fontSize: "11px", flex: 1 }}>Rien de prévu</div>
                    )}

                    <div style={{ marginTop: "auto", paddingTop: "6px", borderTop: `1px solid ${C.border}` }}>
                      <div style={{ color: marge < 0 ? C.red : C.t3, fontSize: "10px", fontWeight: "700" }}>
                        {marge < 0 ? "Journée chargée" : `${formatDuree(marge)} de marge`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card tokens={cardTokens} style={{ maxWidth: "560px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Bilan de la semaine</div>
              {semaineTerminee && <span style={{ color: C.green, fontSize: "11px", fontWeight: "800" }}>Clôturée</span>}
            </div>
            <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px" }}>Ce qui a avancé, ce qui reste — avant de préparer la semaine prochaine.</div>

            {!bilanOuvert ? (
              <Button tokens={btnTokens} size="sm" variant="secondary" loading={chargementBilan} onClick={voirBilan}>Voir mon bilan</Button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", gap: "12px" }}>
                  <div style={{ flex: 1, background: C.greenL, borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                    <div style={{ color: C.green, fontSize: "20px", fontWeight: "800" }}>{bilanCounts?.terminees ?? 0}</div>
                    <div style={{ color: C.t2, fontSize: "11px", fontWeight: "700" }}>Terminées</div>
                  </div>
                  <div style={{ flex: 1, background: C.bgCard2, borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                    <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800" }}>{bilanCounts?.ouvertes ?? 0}</div>
                    <div style={{ color: C.t2, fontSize: "11px", fontWeight: "700" }}>Encore ouvertes</div>
                  </div>
                </div>
                <textarea value={bilanNotes} onChange={e => setBilanNotes(e.target.value)} placeholder="Pour la semaine prochaine…" rows={2}
                  style={{ ...inputStyle, resize: "vertical" }}/>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button tokens={btnTokens} size="sm" loading={cloturing} disabled={semaineTerminee} onClick={cloturerSemaine}>
                    {semaineTerminee ? "Semaine clôturée" : "Clôturer cette semaine"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
