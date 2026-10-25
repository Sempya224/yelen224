"use client";

// Booking Governance, Lot 1 (docs/product/YELEN_BOOKING_GOVERNANCE.md §3) —
// pause volontaire établissement : bloque uniquement les NOUVELLES
// réservations (verrou réel côté RLS, migration 20261018000006), jamais
// les RDV déjà confirmés. Emplacement proposé par la vision CEO :
// "Réservations → Disponibilité → Pause des réservations" — rendu en tête
// de DisponibilitesTab.tsx. Composant volontairement autonome (son propre
// fetch, sa propre route), pas de dépendance sur le reste de l'onglet.
//
// Refonte "niveau US" (23/10/2026) : skeleton + état d'échec avec
// « Réessayer » (une erreur de lecture n'affiche plus jamais « Réservations
// actives »), 4 états lisibles en texte (ouvertes / en pause / programmée /
// expirée = ouvertes), modale accessible (DialogShell de DisponibilitesUi),
// récapitulatif avant activation. API, RLS et calcul des dates inchangés.
//
// Fuseaux : les champs de date/heure du formulaire restent en heure de
// l'appareil (dateToParts/partsToDate inchangés) ; la carte et le
// récapitulatif affichent en Africa/Conakry (lib/heure.ts).
import { useEffect, useId, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FUSEAU_GUINEE, heureDepuisHorodatage } from "@/lib/heure";
import { DialogShell } from "./DisponibilitesUi";

type PauseType = "immediate" | "jusqu_a_date" | "periode";
type PauseActive = { id: string; type: PauseType; debutLe: string; finLe: string | null; motif: string | null; creeLe?: string; active: boolean };
type EtatChargement = "loading" | "ok" | "erreur";

const MOTIF_MAX = 500;

const TYPE_LABEL: Record<PauseType, string> = {
  immediate: "Pause immédiate",
  jusqu_a_date: "Pause jusqu'à une date",
  periode: "Pause sur une période précise",
};

const NUM = { fontVariantNumeric: "tabular-nums" } as const;

const FORMAT_JOUR_CONAKRY = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, day: "numeric", month: "short" });

// « 28 oct., 6:00 PM » — heure de Conakry.
function formatDateCourt(valeur: string | Date): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return "";
  return `${FORMAT_JOUR_CONAKRY.format(d)}, ${heureDepuisHorodatage(d)}`;
}

// Retour Bryan 18/10/2026 : affichage en 12h AM/PM plutôt que de dépendre
// du format natif (souvent 24h) du input type="datetime-local" selon la
// locale du navigateur — contrôle total sur l'affichage, même esprit "US"
// que le reste du retour produit de cette session.
type DateTimeParts = { date: string; hour: number; minute: number; ampm: "AM" | "PM" };
const MINUTES = [0, 15, 30, 45];

function dateToParts(d: Date): DateTimeParts {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h24 = d.getHours();
  const ampm: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour, minute: d.getMinutes(), ampm };
}

function partsToDate(p: DateTimeParts): Date {
  const [y, m, day] = p.date.split("-").map(Number);
  let h24 = p.hour % 12;
  if (p.ampm === "PM") h24 += 12;
  return new Date(y, (m || 1) - 1, day || 1, h24, p.minute, 0, 0);
}

// Affichage seulement : décalage de l'appareil par rapport à UTC (« UTC+1 »).
function libelleDecalage(minutes: number): string {
  const signe = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60), m = abs % 60;
  return `UTC${signe}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

function DateTimeAmPmField({ C, label, value, minDate, onChange }: { C: ThemeTokens; label: string; value: DateTimeParts; minDate: string; onChange: (p: DateTimeParts) => void }) {
  // Retour Bryan 18/10/2026 : sans colorScheme, le calendrier natif et les
  // listes déroulantes des <select> rendent avec les couleurs par défaut du
  // navigateur (texte noir sur fond sombre, ou inversement) au lieu de
  // suivre le thème — même correctif déjà appliqué partout ailleurs sur les
  // input type="date" du produit (ex. mes-demarches-client.tsx).
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const labelId = useId();
  const selectStyle = { backgroundColor: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 6px", fontSize: "13px", color: C.t1, boxSizing: "border-box" as const, colorScheme: isDark ? "dark" as const : "light" as const, ...NUM };
  return (
    <div role="group" aria-labelledby={labelId}>
      <div id={labelId} style={{ fontSize: "12px", fontWeight: 500, color: C.t2, marginBottom: "6px" }}>{label}</div>
      <div style={{ display: "flex", gap: "6px" }}>
        <input type="date" aria-label={`${label} : date`} min={minDate} value={value.date} onChange={e => onChange({ ...value, date: e.target.value })} className="dispo-select yelen-focus-ring" style={{ ...selectStyle, flex: "1.6", minWidth: 0 }} />
        <select aria-label={`${label} : heure`} value={value.hour} onChange={e => onChange({ ...value, hour: Number(e.target.value) })} className="dispo-select yelen-focus-ring" style={{ ...selectStyle, flex: "1" }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select aria-label={`${label} : minutes`} value={value.minute} onChange={e => onChange({ ...value, minute: Number(e.target.value) })} className="dispo-select yelen-focus-ring" style={{ ...selectStyle, flex: "1" }}>
          {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
        </select>
        <select aria-label={`${label} : AM ou PM`} value={value.ampm} onChange={e => onChange({ ...value, ampm: e.target.value as "AM" | "PM" })} className="dispo-select yelen-focus-ring" style={{ ...selectStyle, flex: "1" }}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

function PauseFormSheet({ C, onCancel, onSaved }: { C: ThemeTokens; onCancel: () => void; onSaved: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [type, setType] = useState<PauseType>("immediate");
  const [finLe, setFinLe] = useState<DateTimeParts>(() => dateToParts(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [debutLe, setDebutLe] = useState<DateTimeParts>(() => dateToParts(new Date()));
  const [periodeFinLe, setPeriodeFinLe] = useState<DateTimeParts>(() => dateToParts(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Affichage seulement : date minimale et décalage de l'appareil, figés à
  // l'ouverture du formulaire. Le serveur reste l'autorité sur les dates.
  const [minDate] = useState(() => dateToParts(new Date()).date);
  const [decalageMin] = useState(() => -new Date().getTimezoneOffset());
  const typeLegendId = useId();
  const motifId = useId();
  const motifAideId = useId();
  const recapId = useId();

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const body: Record<string, string> = { type, motif };
    if (type === "jusqu_a_date") body.finLe = partsToDate(finLe).toISOString();
    if (type === "periode") { body.debutLe = partsToDate(debutLe).toISOString(); body.finLe = partsToDate(periodeFinLe).toISOString(); }

    try {
      const res = await fetch("/api/institution/reservations/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || "Erreur lors de l'activation de la pause.");
        return;
      }
      onSaved();
    } catch {
      setError("Erreur lors de l'activation de la pause.");
    } finally {
      setSaving(false);
    }
  }

  const fmt = (p: DateTimeParts): string => (p.date ? formatDateCourt(partsToDate(p)) : "");
  const suffixe = "Les rendez-vous déjà confirmés ne sont pas modifiés.";
  let recap: string;
  if (type === "immediate") {
    recap = `Les nouvelles réservations seront bloquées dès maintenant, jusqu'à votre reprise. ${suffixe}`;
  } else if (type === "jusqu_a_date") {
    recap = fmt(finLe)
      ? `Les nouvelles réservations seront bloquées dès maintenant, jusqu'au ${fmt(finLe)} (heure de Conakry). ${suffixe}`
      : "Choisissez la date de fin de la pause.";
  } else {
    recap = fmt(debutLe) && fmt(periodeFinLe)
      ? `Les nouvelles réservations seront bloquées du ${fmt(debutLe)} au ${fmt(periodeFinLe)} (heure de Conakry). ${suffixe}`
      : "Choisissez les dates de début et de fin de la période.";
  }
  const appareilDifferent = decalageMin !== 0;

  return (
    <DialogShell titleId="pause-form-titre" title="Mettre en pause les réservations" C={C} onClose={onCancel}>
      <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, margin: "0 0 16px" }}>
        Les citoyens ne pourront plus créer de nouvelle réservation pendant la pause. Les rendez-vous déjà confirmés ne sont jamais affectés.
      </p>

      <div role="radiogroup" aria-labelledby={typeLegendId} style={{ marginBottom: "14px" }}>
        <div id={typeLegendId} style={{ fontSize: "12px", fontWeight: 500, color: C.t2, marginBottom: "6px" }}>Type de pause</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {(Object.keys(TYPE_LABEL) as PauseType[]).map(t => (
            <label key={t} className="dispo-hit" style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: type === t ? C.bg3 : "transparent", border: `1px solid ${type === t ? C.gold : C.border}`, borderRadius: "10px", padding: "10px 12px", cursor: "pointer" }}>
              <input type="radio" name="pause-type" checked={type === t} onChange={() => setType(t)} className="yelen-focus-ring" style={{ accentColor: C.gold, colorScheme: isDark ? "dark" : "light" }} />
              <span style={{ color: C.t1, fontSize: "13px", fontWeight: 600 }}>{TYPE_LABEL[t]}</span>
            </label>
          ))}
        </div>
      </div>

      {type !== "immediate" && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {type === "jusqu_a_date" && <DateTimeAmPmField C={C} label="Jusqu'à" value={finLe} minDate={minDate} onChange={setFinLe} />}
            {type === "periode" && (
              <>
                <DateTimeAmPmField C={C} label="Du" value={debutLe} minDate={minDate} onChange={setDebutLe} />
                <DateTimeAmPmField C={C} label="Au" value={periodeFinLe} minDate={minDate} onChange={setPeriodeFinLe} />
              </>
            )}
          </div>
          <p style={{ color: C.t2, fontSize: "12px", margin: "8px 0 0", ...NUM }}>Heure de votre appareil ({libelleDecalage(decalageMin)})</p>
          {appareilDifferent && (
            <p style={{ color: C.t2, fontSize: "12px", margin: "2px 0 0" }}>Votre appareil n&apos;est pas à l&apos;heure de Conakry : vérifiez les heures saisies.</p>
          )}
        </div>
      )}

      <div style={{ marginBottom: "14px" }}>
        <label htmlFor={motifId} style={{ display: "block", fontSize: "12px", fontWeight: 500, color: C.t2, marginBottom: "6px" }}>Motif (interne, optionnel)</label>
        <textarea id={motifId} aria-describedby={motifAideId} value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. pause déjeuner, personnel sous-effectif..." rows={2} maxLength={MOTIF_MAX} className="yelen-focus-ring"
          style={{ width: "100%", backgroundColor: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: C.t1, resize: "vertical", boxSizing: "border-box" }} />
        <div id={motifAideId} style={{ display: "flex", justifyContent: "space-between", gap: "8px", color: C.t2, fontSize: "12px", marginTop: "4px" }}>
          <span>Jamais visible par les citoyens.</span>
          <span style={NUM}>{motif.length} / {MOTIF_MAX}</span>
        </div>
      </div>

      <div id={recapId} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
        <div style={{ color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Récapitulatif</div>
        <p aria-live="polite" style={{ color: C.t1, fontSize: "13px", lineHeight: 1.5, margin: 0 }}>{recap}</p>
      </div>

      {error && <div role="alert" style={{ color: C.red, fontSize: "12.5px", fontWeight: 600, marginBottom: "10px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "8px" }}>
        <Button tokens={toUiTokens(C)} className="dispo-hit" variant="secondary" size="md" fullWidth onClick={onCancel}>Annuler</Button>
        <Button tokens={toUiTokens(C)} className="dispo-hit" variant="primary" size="md" fullWidth loading={saving} onClick={handleConfirm}>Activer la pause</Button>
      </div>
    </DialogShell>
  );
}

function IconEtat({ nom, color }: { nom: "ouvert" | "pause" | "programmee" | "erreur"; color: string }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (nom === "ouvert") return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>;
  if (nom === "pause") return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="14" y1="9" x2="14" y2="15"/></svg>;
  if (nom === "programmee") return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
}

export function PauseReservationsCard({ C, access }: { C: ThemeTokens; access: "full" | "read" | "none" }) {
  const [pause, setPause] = useState<PauseActive | null>(null);
  const [etat, setEtat] = useState<EtatChargement>("loading");
  // Horloge figée au dernier chargement : sert à distinguer « programmée »
  // (début futur) de « expirée » (fin passée, non levée) sans Date.now() au rendu.
  const [maintenant, setMaintenant] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [confirmLever, setConfirmLever] = useState(false);
  const [leverErreur, setLeverErreur] = useState<string | null>(null);

  // Chaque incrément de `rechargement` relance la lecture (« Réessayer »,
  // après activation ou levée). L'état initial est déjà "loading".
  const [rechargement, setRechargement] = useState(0);
  useEffect(() => {
    let annule = false;
    fetch("/api/institution/reservations/pause")
      .then(res => (res.ok ? res.json().catch(() => null) : null))
      .catch(() => null)
      .then((j: { pause?: PauseActive | null } | null) => {
        if (annule) return;
        if (!j || j.pause === undefined) { setEtat("erreur"); return; }
        setPause(j.pause);
        setMaintenant(Date.now());
        setEtat("ok");
      });
    return () => { annule = true; };
  }, [rechargement]);
  const recharger = () => setRechargement(n => n + 1);

  async function handleLever() {
    setLeverErreur(null);
    try {
      const res = await fetch("/api/institution/reservations/pause", { method: "DELETE" });
      if (!res.ok) { setLeverErreur("Impossible de lever la pause. Réessayez."); return; }
    } catch {
      setLeverErreur("Impossible de lever la pause. Réessayez.");
      return;
    }
    setConfirmLever(false);
    recharger();
  }

  if (access === "none") return null;

  const programmee = !!pause && !pause.active && new Date(pause.debutLe).getTime() > maintenant;
  const enPause = !!pause?.active;
  const fermerConfirm = () => { setConfirmLever(false); setLeverErreur(null); };

  let titreEtat = "Réservations ouvertes";
  if (enPause && pause) titreEtat = pause.finLe ? `Réservations en pause · jusqu'au ${formatDateCourt(pause.finLe)}` : "Réservations en pause · jusqu'à votre reprise";
  else if (programmee && pause) titreEtat = pause.finLe ? `Pause programmée · du ${formatDateCourt(pause.debutLe)} au ${formatDateCourt(pause.finLe)}` : `Pause programmée · à partir du ${formatDateCourt(pause.debutLe)}`;

  return (
    <Card tokens={toCardTokens(C)} padding="16px 18px" style={{ marginBottom: "16px" }}>
      <section aria-label="Pause des réservations">
        {etat === "loading" && (
          <div aria-busy="true" aria-label="Chargement de l'état de la pause" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
              <div style={{ height: "14px", width: "140px", borderRadius: "6px", backgroundColor: C.bg3 }}/>
              <div style={{ height: "12px", width: "min(280px, 80%)", borderRadius: "6px", backgroundColor: C.bg3 }}/>
            </div>
            <div style={{ height: "32px", width: "130px", borderRadius: "8px", backgroundColor: C.bg3 }}/>
          </div>
        )}

        {etat === "erreur" && (
          <div role="alert" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: C.t1, fontSize: "13.5px", fontWeight: 600 }}>
              <IconEtat nom="erreur" color={C.red}/>
              État de la pause indisponible
            </div>
            <Button tokens={toUiTokens(C)} className="dispo-hit" variant="secondary" size="sm" onClick={() => { setEtat("loading"); recharger(); }}>Réessayer</Button>
          </div>
        )}

        {etat === "ok" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ color: C.t2, fontSize: "12px", fontWeight: 500, margin: "0 0 4px" }}>Pause des réservations</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <IconEtat nom={enPause ? "pause" : programmee ? "programmee" : "ouvert"} color={enPause || programmee ? C.gold : C.green}/>
                <span style={{ color: C.t1, fontSize: "13.5px", fontWeight: 600, ...NUM }}>{titreEtat}</span>
              </div>
              {(enPause || programmee) && pause ? (
                <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, ...NUM }}>
                  <div>{TYPE_LABEL[pause.type]}{enPause ? ` · depuis le ${formatDateCourt(pause.debutLe)}` : pause.creeLe ? ` · programmée le ${formatDateCourt(pause.creeLe)}` : ""}</div>
                  {pause.motif && <div>Motif : {pause.motif}</div>}
                  <div>Heures affichées à l&apos;heure de Conakry.</div>
                </div>
              ) : (
                <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5 }}>Les citoyens peuvent créer de nouvelles réservations normalement.</div>
              )}
            </div>
            {access === "full" && (
              enPause || programmee ? (
                <Button tokens={toUiTokens(C)} className="dispo-hit" variant="secondary" size="sm" onClick={() => setConfirmLever(true)}>
                  {programmee ? "Annuler la pause programmée" : "Reprendre les réservations"}
                </Button>
              ) : (
                <Button tokens={toUiTokens(C)} className="dispo-hit" variant="secondary" size="sm" onClick={() => setShowForm(true)}>Mettre en pause</Button>
              )
            )}
          </div>
        )}
      </section>

      {showForm && <PauseFormSheet C={C} onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); recharger(); }} />}

      <ConfirmModal
        open={confirmLever}
        onClose={fermerConfirm}
        onConfirm={handleLever}
        tokens={toUiTokens(C)}
        level={1}
        title={programmee ? "Annuler la pause programmée ?" : "Reprendre les réservations ?"}
        description={programmee ? "La pause programmée sera supprimée. Les réservations restent ouvertes." : "Les citoyens pourront immédiatement créer de nouvelles réservations."}
        reversible
        confirmLabel={programmee ? "Annuler la pause programmée" : "Reprendre les réservations"}
        cancelLabel={programmee ? "Fermer" : "Annuler"}
        errorMessage={leverErreur ?? undefined}
      />
    </Card>
  );
}
