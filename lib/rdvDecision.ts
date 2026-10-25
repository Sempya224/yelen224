import {
  MINUTES_AVANT_AUTORISE,
  MINUTES_GRACE_NON_TRAITE,
  absenceDeclarable,
  combinerDateHeureRdv,
  creneauEstOuvert,
  rdvNonTraite,
} from "./rdvGating";

// Décision d'affichage de la fiche « Détails du RDV » (refonte phase 1, étape 1)
// — fonction PURE, sans UI ni accès réseau : à partir de ce que le dashboard
// a déjà en mémoire, elle dit où en est le rendez-vous, quelle est l'urgence
// et quelles actions le serveur acceptera réellement. Elle ne réécrit aucune
// règle : elle consomme celles de rdvGating.ts et reproduit celles de
// app/api/institution/rdv/statut/route.ts (voir « Règles serveur reproduites »
// ci-dessous). Si le serveur change, ce fichier doit changer avec lui.
//
// Règles serveur reproduites (statut/route.ts, qrValidation.ts) :
//  1. Toute action de traitement exige la permission `rdv.write`.
//  2. Établissement suspendu : accepter / refuser / terminer / absent /
//     check-in refusés (403). « Préparer la venue » n'est pas bloquée par la
//     suspension côté serveur (preparer-visite ne la vérifie pas).
//  3. `termine` exige presence_status = 'present'.
//  4. `absent` exige : fenêtre de présence ouverte (10 min avant l'heure),
//     RDV pas « non traité » (30 min de grâce dépassées), motif >= 5 car.
//  5. Confirmer la présence (scan / code) exige la permission
//     `appointment.check_in` et un créneau ouvert (creneauEstOuvert).
//  6. Le serveur ne contrôle PAS le statut de départ pour accepter/refuser :
//     c'est ce fichier qui décide de ce qui est raisonnable de proposer.

export const MOTIF_ABSENT_MIN_CARACTERES = 5;

export type RdvDecisionPermission = "rdv.write" | "appointment.check_in";

export type RdvDecisionPhase =
  | "nouveau_a_venir"
  | "nouveau_en_retard"
  | "accepte_a_venir"
  | "reporte"
  | "presence_ouverte"
  | "en_retard_grace"
  | "non_traite"
  | "present"
  | "termine"
  | "absent"
  | "annule"
  | "refuse"
  | "inconnu";

export type RdvDecisionUrgence = "info" | "attention" | "critique";

export type RdvDecisionActionId = "accepter" | "refuser" | "terminer" | "absent" | "confirmer_presence" | "preparer";

export type RdvDecisionAction = {
  id: RdvDecisionActionId;
  label: string;
  disabled: boolean;
  // Renseignée dès que disabled est vrai : texte affiché à côté du bouton.
  raison?: string;
  // Motif demandé dans la confirmation (absent = aucune saisie).
  motif?: "optionnel" | "obligatoire";
  motifMinCaracteres?: number;
};

export type RdvDecisionBlocage = { action: RdvDecisionActionId | "toutes"; raison: string };

export type RdvDecision = {
  phase: RdvDecisionPhase;
  urgence: RdvDecisionUrgence;
  titre: string;
  detail: string;
  // Texte intégral du motif d'annulation (le bandeau n'en montre que 2 lignes).
  motifComplet?: string;
  echeance?: Date;
  actionPrincipale?: RdvDecisionAction;
  actionsSecondaires: RdvDecisionAction[];
  blocages: RdvDecisionBlocage[];
  lectureSeule: boolean;
};

// Sous-ensemble du type RDV du dashboard — seuls champs lus ici.
export type RdvDecisionInput = {
  statut: string;
  date_rdv: string;
  heure_rdv: string;
  presence_status?: string | null;
  motif_report?: string | null;
  motif_annulation?: string | null;
  annule_par?: string | null;
  guichet?: string | null;
  instructions_accueil?: string | null;
  preparation_confirmee_le?: string | null;
};

// Sous-ensemble de rdv_events renvoyé par GET /api/institution/rdv/events.
export type RdvDecisionEvent = {
  action: string;
  auteur_type: string;
  motif: string | null;
  created_at: string;
};

export type RdvDecisionContext = {
  can: (permission: RdvDecisionPermission) => boolean;
  suspendu: boolean;
  events: readonly RdvDecisionEvent[];
};

const RAISON_LECTURE_SEULE = "Lecture seule : votre rôle ne permet pas de traiter les rendez-vous.";
const RAISON_SUSPENDU = "Votre établissement est suspendu : aucun rendez-vous ne peut être traité tant que la mesure n'est pas levée.";
const RAISON_PRESENCE_D_ABORD = "Confirmez d'abord la présence du client.";
const RAISON_ABSENT_TROP_TOT = "Disponible une fois l'heure du rendez-vous passée.";
const RAISON_ROLE_CHECKIN = "Seuls l'admin et l'agent d'accueil peuvent confirmer la présence.";
const RAISON_CRENEAU_FERME = "La confirmation de présence n'est plus possible : la journée du rendez-vous est terminée.";

function action(id: RdvDecisionActionId, label: string, extra: Partial<RdvDecisionAction> = {}): RdvDecisionAction {
  return { id, label, disabled: false, ...extra };
}

const accepter = () => action("accepter", "Accepter");
const refuser = () => action("refuser", "Refuser", { motif: "optionnel" });
const terminer = (presenceConfirmee: boolean) =>
  presenceConfirmee
    ? action("terminer", "Marquer terminé")
    : action("terminer", "Marquer terminé", { disabled: true, raison: RAISON_PRESENCE_D_ABORD });
const absent = (disponible: boolean) =>
  disponible
    ? action("absent", "Client absent", { motif: "obligatoire", motifMinCaracteres: MOTIF_ABSENT_MIN_CARACTERES })
    : action("absent", "Client absent", { motif: "obligatoire", motifMinCaracteres: MOTIF_ABSENT_MIN_CARACTERES, disabled: true, raison: RAISON_ABSENT_TROP_TOT });

function confirmerPresence(rdv: RdvDecisionInput, now: Date, peutPointer: boolean): RdvDecisionAction {
  if (!peutPointer) return action("confirmer_presence", "Confirmer la présence", { disabled: true, raison: RAISON_ROLE_CHECKIN });
  if (!creneauEstOuvert(rdv.date_rdv, rdv.heure_rdv, now)) {
    return action("confirmer_presence", "Confirmer la présence", { disabled: true, raison: RAISON_CRENEAU_FERME });
  }
  return action("confirmer_presence", "Confirmer la présence");
}

// Valeurs d'auteur reconnues, alignées sur rdv.annule_par / rdv_events.auteur_type.
type AuteurAnnulation = "citoyen" | "institution" | "system";
function estAuteur(v: unknown): v is AuteurAnnulation {
  return v === "citoyen" || v === "institution" || v === "system";
}

// rdv_events en premier (décision Bryan : annule_par est NULL pour les RDV
// historiques), annule_par uniquement en repli.
function origineAnnulation(rdv: RdvDecisionInput, events: readonly RdvDecisionEvent[]): { auteur: AuteurAnnulation | null; motif: string | null } {
  const dernier = events
    .filter((e) => e.action === "annulation")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const brut = dernier?.auteur_type ?? rdv.annule_par ?? null;
  const motif = (dernier?.motif ?? rdv.motif_annulation ?? "").trim();
  return { auteur: estAuteur(brut) ? brut : null, motif: motif || null };
}

function decisionAnnulation(rdv: RdvDecisionInput, events: readonly RdvDecisionEvent[]): Pick<RdvDecision, "titre" | "detail" | "motifComplet" | "urgence"> {
  const { auteur, motif } = origineAnnulation(rdv, events);
  const motifComplet = motif ?? undefined;
  if (auteur === "citoyen") {
    return { urgence: "info", titre: "Annulé par le citoyen", detail: motif ? `Motif indiqué : « ${motif} »` : "Aucun motif n'a été indiqué.", motifComplet };
  }
  if (auteur === "institution") {
    return { urgence: "info", titre: "Annulé par votre établissement", detail: motif ? `Motif indiqué : « ${motif} »` : "Aucun motif n'a été enregistré.", motifComplet };
  }
  if (auteur === "system") {
    if (motif && /suspen/i.test(motif)) {
      return { urgence: "attention", titre: "Annulé automatiquement : établissement suspendu", detail: "Yelen a annulé ce rendez-vous car votre établissement était suspendu. Le client en a été informé.", motifComplet };
    }
    return { urgence: "attention", titre: "Annulé automatiquement par Yelen", detail: "Ce rendez-vous a été annulé automatiquement.", motifComplet };
  }
  return { urgence: "info", titre: "Annulé", detail: motif ? `Motif indiqué : « ${motif} »` : "L'origine de l'annulation n'est pas enregistrée.", motifComplet };
}

function actionsPreparation(rdv: RdvDecisionInput): { principale?: RdvDecisionAction; secondaires: RdvDecisionAction[]; informe: boolean } {
  const renseignee = !!(rdv.guichet || rdv.instructions_accueil);
  const informe = !!rdv.preparation_confirmee_le;
  if (informe) return { secondaires: [action("preparer", "Modifier la préparation")], informe };
  return { principale: action("preparer", renseignee ? "Informer le client" : "Préparer la venue"), secondaires: [], informe };
}

type Brouillon = Omit<RdvDecision, "blocages" | "lectureSeule" | "actionsSecondaires"> & { actionsSecondaires?: RdvDecisionAction[] };

function finaliser(brouillon: Brouillon, ctx: RdvDecisionContext): RdvDecision {
  const peutEcrire = ctx.can("rdv.write");
  if (!peutEcrire) {
    return {
      ...brouillon,
      actionPrincipale: undefined,
      actionsSecondaires: [],
      blocages: [{ action: "toutes", raison: RAISON_LECTURE_SEULE }],
      lectureSeule: true,
    };
  }

  // La suspension bloque tout sauf « Préparer la venue » (voir en-tête).
  const appliquerSuspension = (a: RdvDecisionAction): RdvDecisionAction =>
    ctx.suspendu && a.id !== "preparer" ? { ...a, disabled: true, raison: RAISON_SUSPENDU } : a;

  const principale = brouillon.actionPrincipale ? appliquerSuspension(brouillon.actionPrincipale) : undefined;
  const secondaires = (brouillon.actionsSecondaires ?? []).map(appliquerSuspension);

  const blocages: RdvDecisionBlocage[] = [];
  const aUneActionSuspendue = [principale, ...secondaires].some((a) => a && a.id !== "preparer");
  if (ctx.suspendu && aUneActionSuspendue) blocages.push({ action: "toutes", raison: RAISON_SUSPENDU });
  for (const a of [principale, ...secondaires]) {
    if (a?.disabled && a.raison && !(ctx.suspendu && a.raison === RAISON_SUSPENDU)) blocages.push({ action: a.id, raison: a.raison });
  }

  return { ...brouillon, actionPrincipale: principale, actionsSecondaires: secondaires, blocages, lectureSeule: false };
}

export function getRdvDecision(rdv: RdvDecisionInput, now: Date, ctx: RdvDecisionContext): RdvDecision {
  const debut = combinerDateHeureRdv(rdv.date_rdv, rdv.heure_rdv);
  const finGrace = new Date(debut);
  finGrace.setMinutes(finGrace.getMinutes() + MINUTES_GRACE_NON_TRAITE);
  const seuilPresence = new Date(debut);
  seuilPresence.setMinutes(seuilPresence.getMinutes() - MINUTES_AVANT_AUTORISE);

  const presenceConfirmee = rdv.presence_status === "present";
  const peutPointer = ctx.can("appointment.check_in");

  // 1) États terminaux. « absent » prime toujours sur statut (l'action ne
  // touche jamais statut — un RDV annulé puis marqué absent reste « annule »).
  if (rdv.presence_status === "absent") {
    return finaliser({ phase: "absent", urgence: "attention", titre: "Client absent", detail: "Le client ne s'est pas présenté à son rendez-vous.", actionsSecondaires: [] }, ctx);
  }
  if (rdv.statut === "termine") {
    return finaliser({ phase: "termine", urgence: "info", titre: "Rendez-vous terminé", detail: "La prestation a été honorée.", actionsSecondaires: [] }, ctx);
  }
  if (rdv.statut === "annule") {
    return finaliser({ phase: "annule", ...decisionAnnulation(rdv, ctx.events), actionsSecondaires: [] }, ctx);
  }
  if (rdv.statut === "refuse") {
    const motif = (rdv.motif_annulation ?? "").trim();
    return finaliser({ phase: "refuse", urgence: "info", titre: "Rendez-vous refusé", detail: motif ? `Motif indiqué : « ${motif} »` : "Aucun motif n'a été enregistré.", motifComplet: motif || undefined, actionsSecondaires: [] }, ctx);
  }

  const vivant = rdv.statut === "nouveau" || rdv.statut === "en_attente" || rdv.statut === "confirme";
  if (!vivant) {
    return finaliser({ phase: "inconnu", urgence: "info", titre: "Statut non reconnu", detail: "Ce rendez-vous a un statut que Yelen ne sait pas encore afficher.", actionsSecondaires: [] }, ctx);
  }

  // 2) Présence confirmée : seule suite possible, terminer.
  if (presenceConfirmee) {
    return finaliser({
      phase: "present",
      urgence: "info",
      titre: "Client présent",
      detail: "Sa présence est confirmée. Vous pouvez marquer le rendez-vous comme terminé.",
      actionPrincipale: terminer(true),
      actionsSecondaires: [],
    }, ctx);
  }

  const nonTraite = rdvNonTraite(rdv.statut, rdv.presence_status, rdv.date_rdv, rdv.heure_rdv, now);
  const enRetard = now >= debut;

  // 3) Demandes non encore acceptées.
  if (rdv.statut === "nouveau") {
    if (nonTraite) {
      return finaliser({
        phase: "non_traite",
        urgence: "attention",
        titre: "Non traité à temps",
        detail: `L'heure prévue est dépassée de plus de ${MINUTES_GRACE_NON_TRAITE} minutes sans réponse de votre part. Vous pouvez encore refuser cette demande.`,
        actionsSecondaires: [refuser()],
      }, ctx);
    }
    if (enRetard) {
      return finaliser({
        phase: "nouveau_en_retard",
        urgence: "critique",
        titre: "Demande en retard : répondez maintenant",
        detail: "L'heure prévue est passée et le citoyen attend toujours votre réponse.",
        echeance: finGrace,
        actionPrincipale: accepter(),
        actionsSecondaires: [refuser()],
      }, ctx);
    }
    return finaliser({
      phase: "nouveau_a_venir",
      urgence: "attention",
      titre: "Nouvelle demande à traiter",
      detail: "Ce citoyen attend votre réponse : acceptez ou refusez sa demande.",
      echeance: finGrace,
      actionPrincipale: accepter(),
      actionsSecondaires: [refuser()],
    }, ctx);
  }

  // 4) Accepté (en_attente) ou confirmé sans présence enregistrée (donnée
  // historique) : même traitement.
  if (nonTraite) {
    return finaliser({
      phase: "non_traite",
      urgence: "attention",
      titre: "Non traité à temps",
      detail: `L'heure prévue est dépassée de plus de ${MINUTES_GRACE_NON_TRAITE} minutes sans que la présence ait été confirmée. Il n'est plus possible de marquer le client absent : ce retard vous incombe, pas au citoyen.`,
      actionsSecondaires: [],
    }, ctx);
  }
  if (enRetard) {
    return finaliser({
      phase: "en_retard_grace",
      urgence: "critique",
      titre: "Rendez-vous en retard",
      detail: "L'heure prévue est passée et la présence n'est pas confirmée. Confirmez-la si le client arrive, sinon marquez-le absent.",
      echeance: finGrace,
      actionPrincipale: confirmerPresence(rdv, now, peutPointer),
      actionsSecondaires: [absent(absenceDeclarable(rdv.date_rdv, rdv.heure_rdv, now)), terminer(false)],
    }, ctx);
  }
  if (now >= seuilPresence) {
    return finaliser({
      phase: "presence_ouverte",
      urgence: "attention",
      titre: "Le client peut arriver",
      detail: "La confirmation de présence est ouverte. Confirmez-la à l'arrivée du client.",
      actionPrincipale: confirmerPresence(rdv, now, peutPointer),
      actionsSecondaires: [terminer(false), absent(false)],
    }, ctx);
  }

  const prep = actionsPreparation(rdv);
  if (rdv.motif_report && rdv.statut === "en_attente") {
    return finaliser({
      phase: "reporte",
      urgence: "info",
      titre: "Reporté par le citoyen",
      detail: `Motif indiqué : « ${rdv.motif_report.trim()} »`,
      actionPrincipale: prep.principale,
      actionsSecondaires: prep.secondaires,
    }, ctx);
  }
  return finaliser({
    phase: "accepte_a_venir",
    urgence: "info",
    titre: "Rendez-vous accepté",
    detail: prep.informe ? "Le client a été informé du lieu d'accueil. Scannez son QR code à son arrivée." : "En attente du jour J. Indiquez au client où l'accueillir.",
    actionPrincipale: prep.principale,
    actionsSecondaires: prep.secondaires,
  }, ctx);
}
