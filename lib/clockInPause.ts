// Clock In Shift — logique partagée de la pause comme cycle réel (brief
// Bryan 21/09/2026). Fonctions pures uniquement : aucun accès base ici,
// pour rester testables/lisibles et réutilisables entre les routes
// app/api/clock/* (Next.js). L'Edge Function clock-in-pause-trigger tourne
// sous Deno et ne peut pas importer ce module — sa propre copie de
// fenetrePauseProgrammee() est dupliquée volontairement, même convention
// déjà en place pour clock-in-daily-attendance (voir son en-tête).
//
// Modèle validé : la pause est un événement IMBRIQUÉ dans un entree/sortie
// qui reste ouvert (un seul Clock In / Clock Out par shift) — distincte
// des "segments" de work_schedules.pattern qui restent des shifts
// séparés. V1 = une seule pause par shift (décision Bryan 21/09/2026,
// §11 du brief — plusieurs pauses/jour explicitement différé).

export type DernierType = "entree" | "sortie" | "pause_debut" | "pause_fin" | null;
export type VerifResultat = { ok: true } | { ok: false; raison: string };

// ── Validation des transitions (utilisée par app/api/clock/pointage) ──

export function determinerProchaineActionEntreeSortie(dernierType: DernierType): "entree" | "sortie" {
  return dernierType === null || dernierType === "sortie" ? "entree" : "sortie";
}

// Cas d'erreur §10 du brief : "Clock Out alors que l'utilisateur est
// encore en pause" — jamais fabriquer une reprise implicite, l'employé
// doit reprendre explicitement avant de pouvoir clôturer son shift.
export function verifierEntreeSortieAutorisee(dernierType: DernierType): VerifResultat {
  if (dernierType === "pause_debut") {
    return { ok: false, raison: "Vous êtes en pause — reprenez votre activité avant de pointer votre départ." };
  }
  return { ok: true };
}

export function verifierPauseDebutAutorisee(dernierType: DernierType, pauseDejaPriseCeShift: boolean): VerifResultat {
  if (dernierType === "pause_debut") return { ok: false, raison: "Une pause est déjà en cours." };
  if (dernierType !== "entree") return { ok: false, raison: "Vous devez être en service pour démarrer une pause." };
  if (pauseDejaPriseCeShift) return { ok: false, raison: "Une seule pause est autorisée par shift." };
  return { ok: true };
}

export function verifierPauseFinAutorisee(dernierType: DernierType): VerifResultat {
  if (dernierType !== "pause_debut") return { ok: false, raison: "Aucune pause en cours à terminer." };
  return { ok: true };
}

// ── Fenêtre de pause programmée (utilisée par /api/clock/auth/me pour la
//    bannière employé, et par le job de calcul pour heures_travaillees/
//    dépassement) ──

export type Segment = { debut: string; fin: string; traverse_minuit?: boolean };
export type JourPattern = { repos: boolean; segments: Segment[] };
export type FenetrePause = { debut: string; fin: string; debutMin: number; finMin: number };

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minutesVersHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// Deux sources possibles, jamais codées en dur (brief §11) :
// - Horaire à 2+ segments ("fractionné"/"variable") : la fenêtre se déduit
//   de l'écart entre la fin du 1er segment et le début du 2e — déjà présent
//   dans le pattern, aucune config supplémentaire nécessaire.
// - Horaire à 1 segment ("fixe") : nécessite work_schedules.pause_heure_debut
//   (20260921000005) ET pause_obligatoire_minutes > 0 — sinon la pause de
//   cet horaire reste manuelle uniquement (jamais programmée/suggérée),
//   pas une pause inventée.
export function fenetrePauseProgrammee(
  jourConfig: JourPattern | null | undefined,
  pauseObligatoireMinutes: number,
  pauseHeureDebut: string | null,
): FenetrePause | null {
  if (!jourConfig || jourConfig.repos || !jourConfig.segments || jourConfig.segments.length === 0) return null;

  if (jourConfig.segments.length >= 2) {
    const debut = jourConfig.segments[0].fin;
    const fin = jourConfig.segments[1].debut;
    const debutMin = toMinutes(debut);
    let finMin = toMinutes(fin);
    if (finMin <= debutMin) finMin += 24 * 60;
    return { debut, fin, debutMin, finMin };
  }

  if (pauseHeureDebut && pauseObligatoireMinutes > 0) {
    const debutMin = toMinutes(pauseHeureDebut);
    const finMin = debutMin + pauseObligatoireMinutes;
    return { debut: pauseHeureDebut, fin: minutesVersHHMM(finMin), debutMin, finMin };
  }

  return null;
}
