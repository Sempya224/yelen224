import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { enregistrerTransaction } from "@/lib/transactionsFinancieres";
import { creneauEstOuvert, calculerCheckInStatus, RDV_HORS_CRENEAU_MESSAGE, RDV_EXPIRE_MESSAGE, absenceDeclarable, RDV_ABSENT_TROP_TOT_MESSAGE, depasseFenetreGraceNonTraite, RDV_NON_TRAITE_ABSENT_INTERDIT_MESSAGE } from "@/lib/rdvGating";
import { chargerDonneesRecu, genererRecuPdf } from "@/lib/recuPdf";
import { notifierArrivee, notifierPriseEnCharge, envoyerNotification, formatDateLongue, formatHeureCourte, salutation } from "@/lib/notificationEngine";
import { chargerRestrictionActive, notifierSiEscalade } from "@/lib/rdvRestrictions";
import { toucherActiviteInstitution } from "@/lib/activiteInstitution";
import { getBookingAccess, bloqueTraitementExistant } from "@/lib/bookingAccess";
import { peutVoirDemande, statsClient, type RdvStat } from "@/lib/rdvFiche";
import { calculerMontantReservation } from "@/lib/montantReservation";

// URL de vérification publique — jamais un sous-domaine dédié (décision
// CEO 05/08/2026 : "zéro complexité DNS" pour la V2), une route interne de
// l'app existante. Même convention NEXT_PUBLIC_APP_URL que les routes
// WebAuthn (repli sur l'origine de la requête si absent en dev).
function construireVerifyUrl(req: NextRequest, recuId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/verify/recu/${recuId}`;
}

// Lot B (refonte cycle de vie RDV, décision CEO 16/07/2026) — remplace les
// writes directs cassés de ValiderRdvTab.tsx (paid_bookings/rdv n'ont que des
// policies citoyen, auth.uid()=citoyen_id ; une session institution n'a pas
// de session Supabase Auth, ces .update() échouaient silencieusement ou en
// erreur RLS). Corrige aussi un bug trouvé au passage : l'ancien code écrivait
// rdv.statut = "no_show", valeur absente de l'enum statut_rdv — "absent" est
// un constat de présence (presence_status), jamais un statut de cycle de vie
// (même règle déjà appliquée au scan QR gratuit, voir rdv/statut/route.ts).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// "Historique Yelen" (refonte fiche de validation, Mission B) — mêmes compteurs
// que la fiche « Détails du RDV » : calculés par la MÊME fonction
// (lib/rdvFiche.ts::statsClient) sur les RDV de CE citoyen chez CETTE
// institution (payant ET gratuit). Pour une réservation faite pour un tiers,
// c'est l'historique du titulaire du compte. Écart connu avec la fiche « Détails
// du RDV » : celle-ci calcule sur les 300 derniers RDV de l'établissement (tous
// clients confondus, LIMITE_LISTE_RDV) ; ici le calcul porte sur tous les RDV du
// citoyen (plafond HISTORIQUE_MAX_RDV). Les deux écrans divergent donc seulement
// pour un client dont des RDV sortent de la fenêtre de 300 de la liste.
// Lecture impossible : null (l'écran affiche « Historique indisponible », jamais
// « Premier rendez-vous » par défaut). Aucun citoyen_id exposé.
const HISTORIQUE_MAX_RDV = 1000;
async function chargerHistoriqueCitoyen(citoyenId: string, institutionId: string) {
  const { data, error } = await sb
    .from("rdv")
    .select("id,citoyen_id,statut,date_rdv,presence_status,annule_par")
    .eq("institution_id", institutionId)
    .eq("citoyen_id", citoyenId)
    .limit(HISTORIQUE_MAX_RDV);
  if (error || !data) { logAnomalie("lecture de l'historique du citoyen", { erreur: error?.message ?? null }); return null; }
  const stats = statsClient(data as RdvStat[], citoyenId);
  if (!stats) return null;
  return {
    total: stats.total, termines: stats.termines, absences: stats.absences,
    annulations_citoyen: stats.annulationsCitoyen, premier_rdv: stats.premierRdv,
    tronque: data.length >= HISTORIQUE_MAX_RDV,
  };
}

// Badge « Client vérifié » : lu séparément (jamais dans le select principal) pour
// qu'une colonne absente ou illisible ne fasse pas échouer toute la fiche. Valeur
// non booléenne ou erreur : null (badge masqué).
async function chargerIdentiteVerifiee(citoyenId: string): Promise<boolean | null> {
  const { data, error } = await sb.from("users").select("identite_verifiee").eq("id", citoyenId).maybeSingle();
  if (error || !data) return null;
  return typeof data.identite_verifiee === "boolean" ? data.identite_verifiee : null;
}

// Détails du RDV lié affichés sur la fiche (référence, guichet, instructions,
// demande du client). Lecture à part, sans effet sur le ciblage d'écriture
// (trouverRdvLie reste inchangé). Erreur : null, la fiche s'affiche sans.
async function chargerDetailsRdv(rdvId: string, institutionId: string) {
  const { data, error } = await sb.from("rdv")
    .select("reference,guichet,instructions_accueil,description_besoin,champs_complementaires_reponses")
    .eq("id", rdvId).eq("institution_id", institutionId).maybeSingle();
  if (error) { logAnomalie("lecture des détails du rdv lié", { rdv_id: rdvId, erreur: error.message }); return null; }
  return data ?? null;
}

// Même test de suspension que le PATCH (getBookingAccess + bloqueTraitementExistant).
// Lecture impossible : null (inconnu), le serveur refusera de toute façon à l'écriture.
async function etablissementSuspendu(institutionId: string): Promise<boolean | null> {
  try {
    const acces = await getBookingAccess(sb, institutionId);
    return bloqueTraitementExistant(acces.etat);
  } catch (e) {
    logAnomalie("lecture de l'état de l'établissement", { erreur: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// ─── RDV « jumeau » d'une réservation payante (Mission A, 22/10/2026) ───
// Avant ce correctif, le jumeau était retrouvé par institution + date + heure,
// SANS citoyen, et l'update s'appliquait à TOUS les RDV du créneau : valider,
// marquer absent ou annuler une réservation pouvait modifier le RDV d'un autre
// citoyen au même horaire (et déclencher une restriction no-show à tort).
// Clé de ciblage, par ordre : paid_bookings.rdv_id (migration
// 20261022000001) ; à défaut seulement, rdv.qr_token = confirmation_code ET
// citoyen_id ET institution_id, à condition qu'UN SEUL RDV corresponde.
// Aucun repli par date et heure. Sans RDV identifié de façon certaine, on
// n'écrit rien dans `rdv` et la réponse porte `rdv_lie: false`.
type RdvLie = { id: string; pour_autre: boolean | null; nom_autre: string | null; phone_autre: string | null };
type RefReservation = { id: string; rdv_id?: string | null; confirmation_code: string; citoyen_id: string; institution_id: string };

function logAnomalie(contexte: string, details: Record<string, unknown>) {
  console.error(`[paid-bookings/valider] ${contexte}`, JSON.stringify(details));
}

// ─── Limiteur de tentatives sur la saisie du code (Mission A, P1-4) ───
// Le code de confirmation a 6 chiffres et aucune limite n'existait : un agent
// pouvait énumérer les codes. Fenêtre glissante (table
// validation_code_tentatives, migration 20261022000002) : seuls les ÉCHECS
// (code inconnu) comptent, par agent ET par institution. Message volontairement
// neutre (ne dit pas quel seuil a été atteint). Si la table n'existe pas encore
// (migration non appliquée) ou si sa lecture échoue, on laisse passer (fail-open)
// en loggeant : un défaut du limiteur ne doit jamais bloquer le guichet.
const FENETRE_TENTATIVES_MS = 10 * 60 * 1000;
const MAX_ECHECS_PAR_AGENT = 10;
const MAX_ECHECS_PAR_INSTITUTION = 30;
const MESSAGE_TROP_DE_TENTATIVES = "Trop de tentatives. Réessayez dans quelques minutes.";

async function tentativesBloquees(institutionId: string, membreId: string): Promise<boolean> {
  const depuis = new Date(Date.now() - FENETRE_TENTATIVES_MS).toISOString();
  const [agent, institution] = await Promise.all([
    sb.from("validation_code_tentatives").select("id").eq("membre_id", membreId).eq("reussie", false).gte("tentee_le", depuis).limit(MAX_ECHECS_PAR_AGENT),
    sb.from("validation_code_tentatives").select("id").eq("institution_id", institutionId).eq("reussie", false).gte("tentee_le", depuis).limit(MAX_ECHECS_PAR_INSTITUTION),
  ]);
  if (agent.error || institution.error) {
    logAnomalie("limiteur de tentatives indisponible (migration appliquée ?)", { institution_id: institutionId, membre_id: membreId, erreur: (agent.error ?? institution.error)?.message ?? null });
    return false;
  }
  return (agent.data?.length ?? 0) >= MAX_ECHECS_PAR_AGENT || (institution.data?.length ?? 0) >= MAX_ECHECS_PAR_INSTITUTION;
}

async function enregistrerEchecCode(institutionId: string, membreId: string) {
  const { error } = await sb.from("validation_code_tentatives").insert({ institution_id: institutionId, membre_id: membreId, reussie: false });
  if (error) logAnomalie("échec de saisie de code non enregistré", { institution_id: institutionId, membre_id: membreId, erreur: error.message });
}

async function trouverRdvLie(b: RefReservation): Promise<RdvLie | null> {
  if (b.rdv_id) {
    const { data, error } = await sb.from("rdv").select("id,pour_autre,nom_autre,phone_autre")
      .eq("id", b.rdv_id).eq("institution_id", b.institution_id).maybeSingle();
    if (error) { logAnomalie("lecture rdv lié par rdv_id", { paid_booking_id: b.id, erreur: error.message }); return null; }
    return data ?? null;
  }
  const { data, error } = await sb.from("rdv").select("id,pour_autre,nom_autre,phone_autre")
    .eq("qr_token", b.confirmation_code).eq("citoyen_id", b.citoyen_id).eq("institution_id", b.institution_id)
    .limit(2);
  if (error) { logAnomalie("lecture rdv lié par qr_token", { paid_booking_id: b.id, erreur: error.message }); return null; }
  if (!data || data.length !== 1) {
    if (data && data.length > 1) logAnomalie("plusieurs RDV pour ce code : aucun ciblé", { paid_booking_id: b.id, nb: data.length });
    return null;
  }
  return data[0];
}

// Écrit dans UN rdv, par id, et vérifie que exactement une ligne est touchée.
async function ecrireRdvLie(rdvId: string, institutionId: string, updates: Record<string, unknown>, paidBookingId: string): Promise<boolean> {
  const { data, error } = await sb.from("rdv").update(updates).eq("id", rdvId).eq("institution_id", institutionId).select("id");
  if (error || !data || data.length !== 1) {
    logAnomalie("écriture rdv non appliquée", { paid_booking_id: paidBookingId, rdv_id: rdvId, lignes: data?.length ?? null, erreur: error?.message ?? null });
    return false;
  }
  return true;
}

// Message P1-7 : refus d'une revalidation quand un reçu archivé existe (la
// table recus est UNIQUE par réservation et ses champs de preuve sont
// immuables : un nouveau reçu ne peut pas être produit pour cette réservation).
const MESSAGE_REVALIDATION_REFUSEE = "Cette réservation a déjà été validée puis annulée. Un reçu est archivé : créez une nouvelle réservation.";

// 409 commun aux refus de transition (statut de départ non autorisé) : le
// statut actuel est toujours renvoyé pour que l'écran puisse se resynchroniser.
function reponseDejaTraitee(statutActuel: string, action: string) {
  if (action === "annule" && statutActuel === "confirme") {
    return NextResponse.json({
      error: "Cette réservation est déjà payée : utilisez « Annuler la validation » pour reverser le paiement avant de l'annuler.",
      code: "ANNULATION_PAYEE", statut_actuel: statutActuel,
    }, { status: 409 });
  }
  return NextResponse.json({ error: "Réservation déjà traitée", code: "DEJA_TRAITEE", statut_actuel: statutActuel }, { status: 409 });
}

type MembreAuth = NonNullable<Awaited<ReturnType<typeof getAuthenticatedMembre>>>;

async function chargerBooking(filtre: { id: string } | { code: string }, membre: MembreAuth) {
  const institutionId = membre.institutionId;
  let query = sb
    .from("paid_bookings")
    .select(`
      id, confirmation_code, statut, date_rdv, heure_rdv, date_depart, institution_id, traite_le, citoyen_id, rdv_id,
      montant_declare_citoyen, declare_le,
      paid_services(nom, prix, duree_minutes),
      users!paid_bookings_citoyen_id_fkey(prenom, nom, phone, photo_url)
    `)
    .eq("institution_id", institutionId);
  query = "id" in filtre ? query.eq("id", filtre.id) : query.eq("confirmation_code", filtre.code);
  // Recherche par code : aucune contrainte d'unicité n'existe en base. Avec
  // .maybeSingle(), deux réservations de même code faisaient échouer la
  // requête, indistinguable d'un « introuvable ». On lit 2 lignes au plus pour
  // détecter le doublon et le signaler explicitement (Mission A, P1-4).
  const { data: lignes, error } = await query.limit(2);
  if (error || !lignes || lignes.length === 0) return null;
  // L'identifiant est une clé primaire : seul le filtre par code peut ramener 2 lignes.
  if (lignes.length > 1) return "CODE_EN_DOUBLE" as const;
  const data = lignes[0];

  // Le bénéficiaire "pour un tiers" vit sur la ligne rdv jumelle (créée en
  // même temps que la réservation payante), pas sur paid_bookings — retrouvée
  // par rdv_id ou, à défaut, par code + citoyen + institution (voir
  // trouverRdvLie). Jamais par créneau : sans RDV lié certain, `pour_autre`
  // reste faux et `rdv_lie` vaut false.
  const [rdvJumeau, historique, { data: recu }, identiteVerifiee, suspendu] = await Promise.all([
    trouverRdvLie({ id: data.id, rdv_id: data.rdv_id, confirmation_code: data.confirmation_code, citoyen_id: data.citoyen_id, institution_id: institutionId }),
    chargerHistoriqueCitoyen(data.citoyen_id, institutionId),
    // Décision CEO 06/08/2026 — "activer le reçu aussi côté institution" :
    // la fiche de validation doit pouvoir proposer le téléchargement du
    // reçu directement, pas seulement depuis l'onglet Paiements séparé.
    sb.from("recus").select("id").eq("paid_booking_id", data.id).eq("statut", "disponible").maybeSingle(),
    chargerIdentiteVerifiee(data.citoyen_id),
    etablissementSuspendu(institutionId),
  ]);
  const details = rdvJumeau ? await chargerDetailsRdv(rdvJumeau.id, institutionId) : null;

  const svc = data.paid_services as unknown as { nom: string | null; prix: number | null; duree_minutes: number | null } | null;
  const u = data.users as unknown as { prenom: string | null; nom: string | null; phone: string | null; photo_url: string | null } | null;
  return {
    id: data.id,
    confirmation_code: data.confirmation_code,
    // Statut renvoyé TEL QUEL depuis paid_bookings (y compris "rembourse",
    // posé par api/institution/paiements) : le serveur ne le normalise pas ;
    // le repli d'affichage pour un statut inconnu relève de l'écran.
    statut: data.statut,
    rdv_lie: !!rdvJumeau,
    date_rdv: data.date_rdv,
    heure_rdv: data.heure_rdv,
    date_depart: data.date_depart ?? null,
    traite_le: data.traite_le,
    montant_declare_citoyen: data.montant_declare_citoyen ?? null,
    // Écart prix / déclaration (Mission A, P1-3) : `montant_declare` est le
    // montant figé à la déclaration du citoyen, `prix_courant` le tarif
    // ACTUEL du service (service_prix, inchangé, vaut la même chose). Les
    // deux peuvent différer si le tarif a changé après la déclaration.
    montant_declare: data.montant_declare_citoyen ?? null,
    prix_courant: svc?.prix ?? null,
    declare_le: data.declare_le ?? null,
    pour_autre: !!rdvJumeau?.pour_autre,
    nom_autre: rdvJumeau?.nom_autre ?? null,
    phone_autre: rdvJumeau?.phone_autre ?? null,
    service_nom: svc?.nom ?? "Service",
    service_prix: svc?.prix ?? 0,
    service_duree: svc?.duree_minutes ?? 0,
    citoyen_prenom: u?.prenom ?? null,
    citoyen_nom: u?.nom ?? null,
    citoyen_phone: u?.phone ?? null,
    citoyen_photo_url: u?.photo_url ?? null,
    // Date de naissance et sexe ne sont plus renvoyés (Mission B, décision
    // produit) : la fiche de validation n'en a pas besoin pour identifier la
    // personne au guichet.
    identite_verifiee: identiteVerifiee,
    historique,
    recu_id: recu?.id ?? null,
    reference: details?.reference ?? null,
    guichet: details?.guichet ?? null,
    instructions_accueil: details?.instructions_accueil ?? null,
    // Demande du client (peut contenir des données sensibles) : clés ABSENTES
    // (pas vides) pour les rôles non autorisés, même règle que la fiche RDV.
    ...(peutVoirDemande(membre.role)
      ? { description_besoin: details?.description_besoin ?? null, champs_complementaires: details?.champs_complementaires_reponses ?? null }
      : {}),
    // Droits calculés par les MÊMES tests que le PATCH : traiter (valider, absent,
    // annuler) = rdv.write ; annuler une validation = paiements.rembourser si le
    // paiement a été encaissé, rdv.write sinon.
    droits: {
      traiter: can(membre.role, "rdv.write", membre.accesRestreints),
      annuler_validation: can(membre.role, data.statut === "confirme" ? "paiements.rembourser" : "rdv.write", membre.accesRestreints),
    },
    etablissement_suspendu: suspendu,
  };
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "valider-rdv") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  if (searchParams.get("history") === "1") {
    // "Traités aujourd'hui" = traite_le tombe aujourd'hui — PAS date_rdv
    // (le créneau prévu). Bug réel trouvé le 05/08/2026 (signalé par
    // Bryan) : un RDV prévu un jour mais confirmé/marqué absent un autre
    // jour disparaissait silencieusement de la Timeline et des 3 KPI
    // (Paiements validés, Chiffre du jour, Temps moyen), tout en restant
    // visible sur l'onglet Paiements (app/api/institution/paiements/route.ts,
    // qui ne filtre par aucune date). date_rdv n'a jamais de composante
    // horaire fiable pour borner une journée ; traite_le est un vrai
    // timestamptz, on borne sur la journée locale du serveur.
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
    const finJour = new Date(); finJour.setHours(23, 59, 59, 999);
    const { data, error } = await sb
      .from("paid_bookings")
      .select(`id, confirmation_code, statut, date_rdv, heure_rdv, traite_le, paid_services(nom, prix), users!paid_bookings_citoyen_id_fkey(prenom, nom, photo_url)`)
      .eq("institution_id", membre.institutionId)
      .gte("traite_le", debutJour.toISOString())
      .lte("traite_le", finJour.toISOString())
      .neq("statut", "en_attente")
      .order("traite_le", { ascending: false, nullsFirst: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    type HistoryRow = {
      id: string; confirmation_code: string; statut: string; date_rdv: string; heure_rdv: string; traite_le: string | null;
      paid_services: { nom: string | null; prix: number | null } | null;
      users: { prenom: string | null; nom: string | null; photo_url: string | null } | null;
    };
    const history = ((data ?? []) as unknown as HistoryRow[]).map((row) => ({
      id: row.id, confirmation_code: row.confirmation_code, statut: row.statut,
      date_rdv: row.date_rdv, heure_rdv: row.heure_rdv, traite_le: row.traite_le,
      service_nom: row.paid_services?.nom ?? "Service", service_prix: row.paid_services?.prix ?? 0,
      citoyen_nom: row.users ? `${row.users.prenom ?? ""} ${row.users.nom ?? ""}`.trim() || null : null,
      citoyen_photo_url: row.users?.photo_url ?? null,
    }));
    return NextResponse.json({ history });
  }

  const id = searchParams.get("id");
  const code = searchParams.get("code");
  if (!id && !code) return NextResponse.json({ error: "id ou code requis" }, { status: 400 });

  // Recherche par CODE uniquement (la recherche par id vient d'une fiche déjà
  // ouverte, pas d'une saisie à deviner) : verrou avant toute lecture.
  const parCode = !id && !!code;
  if (parCode && await tentativesBloquees(membre.institutionId, membre.membreId)) {
    return NextResponse.json({ error: MESSAGE_TROP_DE_TENTATIVES, code: "TROP_DE_TENTATIVES" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const booking = await chargerBooking(id ? { id } : { code: code! }, membre);
  if (booking === null && parCode) await enregistrerEchecCode(membre.institutionId, membre.membreId);
  if (booking === "CODE_EN_DOUBLE") {
    return NextResponse.json({
      error: "Plusieurs réservations portent ce code dans votre établissement. Ouvrez la fiche depuis l'onglet Rendez-vous (« Prendre en charge »).",
      code: "CODE_EN_DOUBLE",
    }, { status: 409 });
  }
  if (!booking) return NextResponse.json({ error: "Aucune réservation trouvée pour cette institution." }, { status: 404 });
  return NextResponse.json({ booking });
}

// État final de la réservation, relu en base (Mission A, P1-6) : joint à toute
// réponse du PATCH une fois la réservation identifiée (succès comme refus
// métier 403/409), pour que l'écran puisse se resynchroniser, y compris après
// une coupure réseau (le GET ?id= permet aussi de le relire à tout moment).
// Absent (null) des réponses antérieures à l'identification de la réservation
// (401, 400 de format, 404). Aucun identifiant d'opération : la garde de
// statut sert d'idempotence.
async function chargerEtat(bookingId: string, institutionId: string) {
  const { data } = await sb.from("paid_bookings")
    .select("statut,traite_le,montant_paye,montant_declare_citoyen,declare_le,rdv_id")
    .eq("id", bookingId).eq("institution_id", institutionId).maybeSingle();
  if (!data) return null;
  return {
    statut: data.statut as string, traite_le: (data.traite_le as string | null) ?? null,
    montant_paye: (data.montant_paye as number | null) ?? null,
    montant_declare: (data.montant_declare_citoyen as number | null) ?? null,
    declare_le: (data.declare_le as string | null) ?? null,
    rdv_id: (data.rdv_id as string | null) ?? null,
  };
}

export async function PATCH(req: NextRequest) {
  const ctx: { bookingId?: string; institutionId?: string } = {};
  const res = await traiterPatch(req, ctx);
  if (!ctx.bookingId || !ctx.institutionId) return res;
  const corps: unknown = await res.clone().json().catch(() => null);
  if (!corps || typeof corps !== "object") return res;
  return NextResponse.json({ ...(corps as Record<string, unknown>), etat: await chargerEtat(ctx.bookingId, ctx.institutionId) }, { status: res.status });
}

async function traiterPatch(req: NextRequest, ctx: { bookingId?: string; institutionId?: string }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Vérification centralisée depuis le 19/10/2026 (Booking Governance
  // Lot 3, docs/product/YELEN_BOOKING_GOVERNANCE.md §13) — une
  // institution suspendue ne doit plus pouvoir traiter de réservation
  // payante non plus (confirmer, no-show, annuler, annuler une validation).
  const bookingAccess = await getBookingAccess(sb, membre.institutionId);
  if (bloqueTraitementExistant(bookingAccess.etat)) {
    return NextResponse.json(
      { error: "Votre établissement est actuellement suspendu — vous ne pouvez plus traiter de réservation tant que cette mesure n'est pas levée. Consultez l'écran « Espace suspendu » pour comprendre pourquoi et, si besoin, demander une révision." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  const action = body?.action;
  if (typeof id !== "string" || !["confirme", "no_show", "annule", "annuler_validation"].includes(action)) {
    return NextResponse.json({ error: "id et action valides requis" }, { status: 400 });
  }

  const { data: booking, error: lookupErr } = await sb
    .from("paid_bookings").select(`
      id,institution_id,citoyen_id,date_rdv,date_depart,heure_rdv,statut,montant_paye,montant_total_reserve,montant_declare_citoyen,declare_le,traite_le,service_id,rdv_id,confirmation_code,
      paid_services(prix),
      institutions(name),
      users!paid_bookings_citoyen_id_fkey(prenom,nom)
    `)
    .eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  // Erreur de requête (colonne, connexion...) distinguée d'un vrai 404 —
  // avant ce correctif, une erreur ici était mal rapportée "introuvable" au
  // lieu du vrai message Postgres, invisible au diagnostic (signalé par
  // Bryan 05/08/2026 : "Annuler la réservation" affichait "introuvable" sur
  // une réservation qui venait pourtant d'être trouvée par la recherche).
  if (lookupErr) { console.error("[paid-bookings/valider PATCH] lookup:", lookupErr.message); return NextResponse.json({ error: lookupErr.message }, { status: 500 }); }
  if (!booking) return NextResponse.json({ error: "Réservation introuvable pour cette institution" }, { status: 404 });
  ctx.bookingId = id;
  ctx.institutionId = membre.institutionId;

  if (action === "annuler_validation") return handleAnnulerValidation(req, membre, booking, typeof body?.motif === "string" ? body.motif : "");

  if (!can(membre.role, "rdv.write", membre.accesRestreints)) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  // Garde de statut (Mission A, P0-2/P1-1) : confirmer, marquer absent ou
  // annuler ne s'applique QU'À une réservation encore "en_attente". Avant ce
  // correctif le serveur ne vérifiait pas le statut de départ : rejouer
  // "valider" créait un second encaissement, et une réservation déjà payée
  // pouvait être annulée par appel direct sans reversement. Le contrôle
  // atomique est refait sur l'update lui-même plus bas (concurrence).
  if (booking.statut !== "en_attente") {
    return reponseDejaTraitee(booking.statut as string, action);
  }

  // P1-7 : une validation annulée puis rejouée ne pourrait produire aucun
  // nouveau reçu (recus UNIQUE par réservation, champs de preuve immuables) —
  // on refuse AVANT d'encaisser plutôt que de créer un encaissement sans reçu.
  if (action === "confirme") {
    const { data: recuArchive, error: recuLookupErr } = await sb.from("recus").select("id").eq("paid_booking_id", id).eq("statut", "archive").maybeSingle();
    if (recuLookupErr) { logAnomalie("lecture reçu archivé", { paid_booking_id: id, membre_id: membre.membreId, erreur: recuLookupErr.message }); return NextResponse.json({ error: "Vérification impossible, réessayez." }, { status: 500 }); }
    if (recuArchive) return NextResponse.json({ error: MESSAGE_REVALIDATION_REFUSEE, code: "RECU_ARCHIVE_EXISTANT" }, { status: 409 });
  }

  // "Confirmé" = preuve de présence (paiement encaissé + présence validée en
  // une seule action ici, pas de scan séparé pour le payant) — jamais
  // atteignable hors du créneau autorisé, même via une recherche manuelle par
  // code plutôt que "Prendre en charge".
  if (action === "confirme" && !creneauEstOuvert(booking.date_rdv, booking.heure_rdv)) {
    // Deux causes distinctes derrière le même verrou : trop tôt (la fenêtre
    // s'ouvrira d'elle-même) ou la journée du rendez-vous est entièrement
    // passée (la fenêtre ne se rouvrira jamais) — un seul message générique
    // invitait auparavant à "patienter" même dans ce second cas.
    const expire = calculerCheckInStatus(booking.date_rdv, booking.heure_rdv) === "CHECK_IN_EXPIRED";
    const msg = expire ? RDV_EXPIRE_MESSAGE : RDV_HORS_CRENEAU_MESSAGE;
    return NextResponse.json({ error: msg.message, hors_creneau: true, titre: msg.titre }, { status: 403 });
  }

  // Même règle que rdv/statut/route.ts (trou trouvé 08/09/2026) : une
  // absence ne peut jamais être déclarée avant l'ouverture de la fenêtre de
  // confirmation de présence elle-même.
  if (action === "no_show" && !absenceDeclarable(booking.date_rdv, booking.heure_rdv)) {
    return NextResponse.json({ error: RDV_ABSENT_TROP_TOT_MESSAGE }, { status: 403 });
  }

  // Même durcissement que rdv/statut/route.ts (13/10/2026) : une réservation
  // encore "en_attente" (jamais traitée par l'établissement) passée la
  // fenêtre de grâce ne peut plus être close en "no_show" — ce serait
  // imputer au citoyen le retard de traitement de l'établissement.
  // "en_attente" est ici l'équivalent exact de nouveau/en_attente non résolu
  // côté rdv (paid_bookings n'a pas de presence_status séparé).
  if (action === "no_show" && booking.statut === "en_attente" && depasseFenetreGraceNonTraite(booking.date_rdv, booking.heure_rdv)) {
    return NextResponse.json({ error: RDV_NON_TRAITE_ABSENT_INTERDIT_MESSAGE }, { status: 403 });
  }

  // Décision CEO 15/10/2026 — une réservation jamais traitée (en_attente)
  // dont la journée est entièrement passée ne peut plus être annulée depuis
  // cet écran non plus (jusqu'ici seul "confirme" était bloqué par
  // creneauEstOuvert ; "annule" n'avait aucun verrou temporel, un agent
  // pouvait annuler un rendez-vous vieux de plusieurs jours sans aucune
  // restriction). Reste une réservation consultable telle quelle, non
  // modifiable.
  if (action === "annule" && booking.statut === "en_attente" && calculerCheckInStatus(booking.date_rdv, booking.heure_rdv) === "CHECK_IN_EXPIRED") {
    return NextResponse.json({ error: RDV_EXPIRE_MESSAGE.message, titre: RDV_EXPIRE_MESSAGE.titre }, { status: 403 });
  }

  // Motif obligatoire pour "annule" (signalé par Bryan 05/08/2026 : le
  // bouton déclenchait l'annulation sans aucune confirmation ni motif,
  // "pas normal" pour une action qui annule le rendez-vous du citoyen) ET
  // pour "no_show" (décision CEO 08/09/2026, revenant sur le choix initial
  // du 05/08/2026 qui l'excluait volontairement — un no-show déclenche
  // désormais une mécanique de restriction citoyen potentiellement lourde,
  // l'accountability l'exige). Pas exigé pour "confirme".
  const motifSaisi = typeof body?.motif === "string" ? body.motif.trim() : "";
  if (action === "annule" && motifSaisi.length < 5) {
    return NextResponse.json({ error: "Un motif (au moins 5 caractères) est requis pour annuler une réservation." }, { status: 400 });
  }
  if (action === "no_show" && motifSaisi.length < 5) {
    return NextResponse.json({ error: "Un motif (au moins 5 caractères) est requis pour marquer ce client absent." }, { status: 400 });
  }

  // montant_paye figé à la confirmation si pas déjà fait (module financier,
  // migration 20260722000001) — c'est le seul moment où on sait avec
  // certitude que le paiement a réellement eu lieu. En pratique déjà figé
  // par la déclaration citoyen (app/api/citoyen/paid-bookings/declarer-paiement,
  // Lot A) pour tout service payant — ce fallback ne joue plus que pour les
  // services gratuits ou les réservations antérieures à ce lot.
  //
  // Lot 1a : montant courant = prix × nuits pour un séjour hôtel (helper
  // calculerMontantReservation, même calcul que declarer-paiement). Jamais
  // appliqué à un montant_paye déjà figé. Si les dates du séjour sont
  // invalides, le montant courant est inconnu : on n'invente rien — le
  // blocage ne vaut que si on devrait justement le figer.
  const prixService = (booking.paid_services as unknown as { prix: number } | null)?.prix ?? null;
  const calculMontant = prixService === null
    ? null
    : calculerMontantReservation({ prix: prixService, dateRdv: booking.date_rdv as string, dateDepart: (booking.date_depart as string | null | undefined) ?? null });
  // Priorité au montant FIGÉ à la réservation (migration 20261025000001,
  // paid_bookings.montant_total_reserve) : c'est ce que le citoyen doit réellement,
  // indépendamment d'un changement de prix du service depuis. NULL pour les
  // réservations antérieures à cette migration et les services gratuits : repli
  // sur le calcul au prix actuel.
  const montantReserve = (booking.montant_total_reserve as number | null | undefined) ?? null;
  const montantCourant = montantReserve ?? (calculMontant?.ok ? calculMontant.montant : null);
  if (booking.montant_paye == null && montantReserve === null && calculMontant && !calculMontant.ok) {
    console.error("[paid-bookings/valider] calcul du montant impossible:", calculMontant.code, JSON.stringify({ paid_booking_id: id }));
    return NextResponse.json({ error: "Les dates du séjour sont invalides — impossible de calculer le montant à encaisser.", code: calculMontant.code }, { status: 409 });
  }
  const montantAFiger = booking.montant_paye ?? montantCourant;

  // Double confirmation obligatoire (Lot B, décision CEO 05/08/2026) —
  // uniquement pour les services PAYANTS : "aucune des deux parties ne
  // peut générer seule un reçu officiel". Ne s'applique pas à
  // "Confirmer gratuitement" (montantAFiger === 0), qui n'implique aucun
  // encaissement à déclarer.
  if (action === "confirme" && montantAFiger != null && montantAFiger > 0) {
    if (!booking.declare_le) {
      return NextResponse.json({
        error: "Le citoyen n'a pas encore déclaré remettre ce paiement — demandez-lui de confirmer depuis son écran (Mon QR) avant de valider.",
        code: "DECLARATION_MANQUANTE",
      }, { status: 409 });
    }
    if (booking.montant_declare_citoyen != null && booking.montant_declare_citoyen !== montantAFiger) {
      return NextResponse.json({
        error: "Montants incohérents. Le paiement ne peut pas être confirmé. Merci de vérifier le montant avec le citoyen.",
        code: "MONTANTS_INCOHERENTS",
      }, { status: 409 });
    }
  }

  // Montant vu par l'agent (Mission A, P1-3), optionnel côté serveur pour rester
  // compatible avec un écran qui ne l'envoie pas encore : s'il est fourni, il
  // doit être égal au prix COURANT du service, sinon 409 — l'agent est sur le
  // point d'encaisser un montant différent de celui qu'il a sous les yeux
  // (tarif modifié entre l'ouverture de la fiche et la validation). Absent :
  // validation inchangée, avertissement loggé.
  //
  // montant_vu_base (Mission B), optionnel : "prix" (ou absent) = comparaison au
  // prix courant ci-dessus ; "declare" = comparaison au montant figé à la
  // déclaration du citoyen (montant_declare_citoyen, sinon montant_paye) quand
  // la déclaration existe, sinon retombe sur le prix courant. Un écart avec
  // "declare" renvoie MONTANT_VU_DIFFERENT et n'écrit rien.
  if (action === "confirme") {
    const corps = body as { montant_vu?: unknown; montant_vu_base?: unknown } | null;
    const brut = corps?.montant_vu;
    const base = corps?.montant_vu_base;
    if (base !== undefined && base !== null && base !== "prix" && base !== "declare") {
      return NextResponse.json({ error: "montant_vu_base invalide" }, { status: 400 });
    }
    if (brut === undefined || brut === null) {
      console.warn("[paid-bookings/valider] montant_vu absent : contrôle du prix vu par l'agent ignoré", JSON.stringify({ paid_booking_id: id, membre_id: membre.membreId }));
    } else if (typeof brut !== "number" || !Number.isFinite(brut)) {
      return NextResponse.json({ error: "montant_vu invalide" }, { status: 400 });
    } else {
      // Montant courant (prix × nuits pour un séjour), pas le prix unitaire.
      // La clé de réponse reste `prix_courant` (contrat inchangé pour l'écran).
      const prixCourant = montantCourant;
      const montantFige = base === "declare" && booking.declare_le ? (booking.montant_declare_citoyen ?? booking.montant_paye ?? null) : null;
      if (montantFige !== null) {
        if (brut !== montantFige) {
          return NextResponse.json({
            error: "Le montant affiché à l'écran ne correspond pas au montant déclaré par le citoyen. Rouvrez la fiche pour vérifier le montant avant de valider.",
            code: "MONTANT_VU_DIFFERENT", montant_vu: brut, montant_declare: montantFige, prix_courant: prixCourant,
          }, { status: 409 });
        }
      } else if (prixCourant !== null && brut !== prixCourant) {
        return NextResponse.json({
          error: "Le prix du service a changé depuis l'ouverture de cette fiche. Rouvrez la fiche pour vérifier le montant avant de valider.",
          code: "PRIX_MODIFIE", prix_courant: prixCourant, montant_vu: brut, montant_declare: booking.montant_declare_citoyen ?? null,
        }, { status: 409 });
      }
    }
  }

  const bookingUpdate: Record<string, unknown> = { statut: action, traite_le: new Date().toISOString() };
  if (action === "confirme" && booking.montant_paye == null && montantAFiger != null) bookingUpdate.montant_paye = montantAFiger;

  // Renseigné plus bas si un reçu est réellement généré avec succès —
  // renvoyé au frontend pour proposer le téléchargement immédiatement,
  // sans round-trip GET supplémentaire (décision CEO 06/08/2026).
  let recuIdDisponible: string | null = null;
  // Anomalies non bloquantes à signaler à l'appelant (jamais silencieuses).
  let ledgerOk = true;
  let recuOk = true;

  // RDV lié, résolu AVANT d'écrire (lecture seule) : rdv_id d'abord, repli
  // code + citoyen + institution si rdv_id est vide, sinon null (aucune
  // écriture dans rdv, `rdv_lie: false`). Voir trouverRdvLie.
  const rdvLie = await trouverRdvLie({ id, rdv_id: booking.rdv_id, confirmation_code: booking.confirmation_code, citoyen_id: booking.citoyen_id, institution_id: membre.institutionId });

  // Écriture gardée sur le statut de départ (P0-2) : si deux requêtes arrivent
  // en même temps (double clic, deux agents), une seule voit encore
  // "en_attente" ; l'autre ne touche aucune ligne et reçoit 409 AVANT tout
  // effet de bord (encaissement, reçu, journal, notification). C'est ce qui
  // garantit qu'un double envoi ne crée jamais un second encaissement.
  const { data: ligneMiseAJour, error: bkErr } = await sb.from("paid_bookings").update(bookingUpdate)
    .eq("id", id).eq("institution_id", membre.institutionId).eq("statut", "en_attente").select("id");
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });
  if (!ligneMiseAJour || ligneMiseAJour.length === 0) {
    const { data: actuel } = await sb.from("paid_bookings").select("statut").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
    return reponseDejaTraitee((actuel?.statut as string | undefined) ?? "inconnu", action);
  }

  // Action métier qualifiante (chantier COMPTES-INACTIFS.md, Phase 3).
  await toucherActiviteInstitution(sb, membre.institutionId);

  // "confirme" ici = paiement encaissé ET présence validée (pas de scan
  // séparé pour le payant) — mais ne clôt PAS le rendez-vous. Revert du
  // 26/08/2026 (demande explicite de Bryan) : un rdv payant marchait
  // auparavant directement en "termine" dès la confirmation, sautant
  // l'étape "Marquer terminé" — faux en pratique, le paiement se fait
  // souvent APRÈS la prestation en Afrique (aucun lien entre paiement
  // confirmé et prestation terminée). Le rdv jumeau passe donc à "confirme",
  // exactement comme un RDV gratuit après scan QR (voir qr/validate PUT) :
  // il redevient actionnable dans l'onglet Rendez-vous ("Marquer terminé"),
  // qui journalise, notifie la fin de prestation et accorde les points
  // Yelen Rewards — aucun de ces effets n'avait lieu tant que le rdv payant
  // sautait directement à "termine" ici. paid_bookings.statut reste
  // "confirme" (bookingUpdate ci-dessus, enum statut_paid_booking séparé,
  // n'a pas de valeur "termine" à ce jour) — seul le rdv jumeau change.
  const rdvUpdates: Record<string, unknown> =
    action === "confirme" ? { statut: "confirme", presence_status: "present", presence_confirmed_at: new Date().toISOString() }
    : action === "no_show" ? { presence_status: "absent", presence_confirmed_at: new Date().toISOString() }
    // motif_annulation n'était jamais écrit sur le rdv jumeau ici (seul le
    // journal interne gardait motifSaisi) — la fiche RDV institution n'avait
    // donc jamais de bandeau "Annulé" à afficher pour un refus de réservation
    // payante. Corrigé au passage, même annule_par (13/10/2026) que les 3
    // autres points d'écriture.
    : { statut: "annule", motif_annulation: motifSaisi, annule_par: "institution" };

  // Restriction automatique des rendez-vous (no-show, décision CEO
  // 03/09/2026) — même pont que rdv/statut/route.ts, capturé AVANT l'update
  // pour détecter une éventuelle escalade juste après.
  const restrictionAvant = action === "no_show" && rdvLie ? await chargerRestrictionActive(sb, booking.citoyen_id) : null;

  // Écriture dans UN seul rdv (par id), vérifiée à exactement 1 ligne. Sans RDV
  // lié certain ou si l'écriture échoue : on n'écrit rien d'autre dans rdv,
  // rdv_lie vaut false dans la réponse. v1 sans transaction : paid_bookings est
  // déjà écrit à ce stade (risque consigné, fonction SQL transactionnelle =
  // ticket séparé).
  const rdvEcrit = rdvLie ? await ecrireRdvLie(rdvLie.id, membre.institutionId, rdvUpdates, id) : false;
  const rdvJumeau = rdvEcrit && rdvLie ? { id: rdvLie.id } : null;

  if (action === "no_show") {
    // Le trigger de restriction (rdv.presence_status -> absent) ne se déclenche
    // que si le rdv lié a réellement été écrit ; sinon rien à escalader.
    if (rdvEcrit) await notifierSiEscalade(sb, booking.citoyen_id, restrictionAvant?.id ?? null);
    // Pas de journalisation avant ce correctif (trou pré-existant, distinct
    // de la demande en cours) — ajoutée ici pour que le motif désormais
    // obligatoire soit réellement conservé quelque part, même chose que
    // "annule" juste en dessous.
    await enregistrerAction({
      institutionId: membre.institutionId,
      membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "rdv_absent",
      cibleTable: "rdv",
      cibleId: rdvJumeau?.id ?? id,
      details: { motif: motifSaisi },
      req,
    });
  }

  if (action === "confirme") {
    const membreNom = await getMembreNomPourJournal(membre.membreId);
    // cible_table: "rdv" (pas "paid_bookings") pour que cette action
    // apparaisse dans la traçabilité de l'écran Rendez-vous passés, qui ne
    // regarde que les entrées journalisées sur "rdv" (Lots A-D).
    await enregistrerAction({
      institutionId: membre.institutionId,
      membreId: membre.membreId,
      membreNom,
      action: "rdv_confirme",
      cibleTable: "rdv",
      cibleId: rdvJumeau?.id ?? id,
      req,
    });

    // Même paire de notifications que la présence confirmée par scan QR
    // gratuit (Phases 6-7, qr/validate PUT) — jusqu'ici le citoyen ne
    // recevait strictement rien sur un rdv payant tant que "confirme"
    // sautait directement à "termine" (Phase 8 seule, jamais atteinte
    // puisqu'aucune action "Marquer terminé" ne pouvait plus s'appliquer).
    const instRel = booking.institutions as unknown as { name: string } | { name: string }[] | null;
    const userRel = booking.users as unknown as { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null;
    const instRow = Array.isArray(instRel) ? instRel[0] : instRel;
    const userRow = Array.isArray(userRel) ? userRel[0] : userRel;
    // Ces notifications portent un rdvId : sans RDV lié certain (rdv_lie
    // false), on ne les envoie pas plutôt que de les rattacher à l'id d'une
    // réservation payante (ce qui était l'ancien repli, faux).
    if (rdvJumeau) {
      const notifCtx = {
        rdvId: rdvJumeau.id,
        citoyenId: booking.citoyen_id,
        citoyenPrenom: userRow?.prenom || userRow?.nom || "Citoyen",
        institutionId: booking.institution_id,
        institutionNom: instRow?.name ?? "l'établissement",
        dateRdv: booking.date_rdv,
        heureRdv: booking.heure_rdv,
      };
      await notifierArrivee(notifCtx);
      await notifierPriseEnCharge(notifCtx);
    } else {
      logAnomalie("notifications arrivée/prise en charge ignorées : aucun RDV lié", { paid_booking_id: id, membre_id: membre.membreId });
    }

    if (montantAFiger != null) {
      const transactionId = await enregistrerTransaction({
        institutionId: membre.institutionId,
        paidBookingId: id,
        typeTransaction: "encaissement",
        montant: montantAFiger,
        nouvelleValeur: { statut: "confirme" },
        membreId: membre.membreId,
        membreNom,
        req,
      });
      // enregistrerTransaction renvoie null si l'insertion échoue : l'encaissement
      // existe alors sans écriture au registre. Cas géré : loggé avec son
      // contexte et signalé dans la réponse (ledger_ok), jamais silencieux.
      if (!transactionId) {
        ledgerOk = false;
        logAnomalie("encaissement non enregistré au registre financier", { paid_booking_id: id, membre_id: membre.membreId, montant: montantAFiger });
      }

      // Reçu Yelen (Lot B, décision CEO 05/08/2026) — créé automatiquement
      // dès la confirmation, jamais par une action séparée ("aucune des
      // deux parties ne peut générer seule un reçu officiel"). Uniquement
      // pour les services payants — pas de reçu pour "Confirmer
      // gratuitement". Insert non-bloquant, même philosophie que
      // transactions_financieres/journal_activite : une erreur ici ne doit
      // jamais faire échouer une confirmation de paiement déjà encaissé.
      if (montantAFiger > 0) {
        const { data: recuCree, error: recuErr } = await sb.from("recus").insert({
          paid_booking_id: id,
          institution_id: membre.institutionId,
          citoyen_id: booking.citoyen_id,
          transaction_id: transactionId,
          montant: montantAFiger,
          montant_declare_citoyen: booking.montant_declare_citoyen ?? montantAFiger,
          membre_id: membre.membreId,
          membre_nom: membreNom,
        }).select("id").single();
        if (recuErr) {
          recuOk = false;
          logAnomalie("création du reçu échouée", { paid_booking_id: id, membre_id: membre.membreId, code: recuErr.code ?? null, erreur: recuErr.message });
        }

        // Lot C (décision CEO 05/08/2026) — PDF serveur officiel, généré
        // automatiquement dès la création du reçu. Bucket privé
        // "recus-paiement" (à créer manuellement par Bryan). Échec non
        // bloquant : le reçu existe déjà en base (preuve du paiement), un
        // PDF manquant peut être régénéré plus tard (Lot D/E) — jamais
        // une raison de faire échouer une confirmation de paiement déjà
        // encaissé.
        if (recuCree) {
          try {
            const donneesRecu = await chargerDonneesRecu(recuCree.id);
            if (donneesRecu) {
              const verifyUrl = construireVerifyUrl(req, recuCree.id);
              const pdfBuffer = await genererRecuPdf(donneesRecu, verifyUrl);
              const pdfPath = `${membre.institutionId}/${recuCree.id}.pdf`;
              const { error: uploadErr } = await sb.storage.from("recus-paiement").upload(pdfPath, pdfBuffer, { contentType: "application/pdf" });
              if (uploadErr) {
                console.error("[paid-bookings/valider] Erreur upload PDF reçu:", uploadErr.message);
                await sb.from("recus").update({ erreur_generation: `upload: ${uploadErr.message}` }).eq("id", recuCree.id);
              } else {
                const maintenant = new Date().toISOString();
                await sb.from("recus").update({
                  pdf_storage_path: pdfPath,
                  pdf_genere_le: maintenant,
                  statut: "disponible",
                  disponible_le: maintenant,
                }).eq("id", recuCree.id);
                recuIdDisponible = recuCree.id;
              }
            }
          } catch (pdfErr) {
            console.error("[paid-bookings/valider] Erreur génération PDF reçu:", pdfErr);
            const message = pdfErr instanceof Error ? `${pdfErr.message}\n${pdfErr.stack ?? ""}` : String(pdfErr);
            await sb.from("recus").update({ erreur_generation: message.slice(0, 2000) }).eq("id", recuCree.id);
          }
        }
      }
    }
  }

  if (action === "annule") {
    await enregistrerAction({
      institutionId: membre.institutionId,
      membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "rdv_annule",
      cibleTable: "rdv",
      cibleId: rdvJumeau?.id ?? id,
      details: { motif: motifSaisi },
      req,
    });

    // Refus/annulation d'une réservation payante par l'établissement
    // (13/10/2026) — même trou que rdv/statut/route.ts, comblé en même
    // temps : le citoyen n'était notifié d'aucune façon.
    const instRelAnnule = booking.institutions as unknown as { name: string } | { name: string }[] | null;
    const userRelAnnule = booking.users as unknown as { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null;
    const instRowAnnule = Array.isArray(instRelAnnule) ? instRelAnnule[0] : instRelAnnule;
    const userRowAnnule = Array.isArray(userRelAnnule) ? userRelAnnule[0] : userRelAnnule;
    await envoyerNotification({
      destinataireId: booking.citoyen_id,
      destinataireType: "citoyen",
      rdvId: rdvJumeau?.id ?? null,
      type: "rdv_refuse",
      titre: salutation(userRowAnnule?.prenom || userRowAnnule?.nom || "Citoyen"),
      message: `Votre rendez-vous du ${formatDateLongue(booking.date_rdv)} à ${formatHeureCourte(booking.heure_rdv)} chez ${instRowAnnule?.name ?? "l'établissement"} a été refusé. « ${motifSaisi} ». Vous pouvez réserver un nouveau créneau dès maintenant.`,
    });
  }

  return NextResponse.json({
    ok: true, statut: action, recu_id: recuIdDisponible,
    // false : aucun RDV certain n'a été trouvé (ou son écriture a échoué) —
    // rien n'a été écrit dans rdv, seul paid_bookings a été traité.
    rdv_lie: rdvJumeau !== null,
    ...(ledgerOk ? {} : { ledger_ok: false }),
    ...(recuOk ? {} : { recu_ok: false }),
  });
}

// "Annuler la validation" (fiche de validation, refonte 05/08/2026) —
// reverse une confirmation/absence/annulation déjà traitée, pour corriger
// une erreur de manipulation de l'agent. Séparée du bloc principal ci-dessus
// car ses règles diffèrent sur trois points : permission dépendante du
// statut actuel (reverser un paiement encaissé exige paiements.rembourser,
// pas simplement rdv.write), fenêtre de correction bornée à la journée en
// cours (pas de réécriture d'un historique ancien), et motif obligatoire
// (accountability sur une action qui défait une action déjà journalisée).
// Ne mute jamais transactions_financieres : l'encaissement d'origine reste
// intact, une ligne "annulation" est insérée à côté (ledger insert-only,
// même philosophie que journal_activite/attendance_logs).
async function handleAnnulerValidation(
  req: NextRequest,
  membre: { institutionId: string; membreId: string; role: import("@/lib/institutionPermissions").MembreRole; accesRestreints?: readonly string[] | null },
  booking: { id: string; date_rdv: string; heure_rdv: string; statut: string; montant_paye: number | null; traite_le: string | null; rdv_id?: string | null; confirmation_code: string; citoyen_id: string },
  motifBrut: string,
) {
  if (booking.statut === "en_attente") {
    return NextResponse.json({ error: "Cette réservation n'a pas encore été traitée, rien à annuler." }, { status: 400 });
  }

  const estFinancier = booking.statut === "confirme";
  const permissionRequise = estFinancier ? "paiements.rembourser" : "rdv.write";
  // accesRestreints transmis comme dans les autres branches (Mission A, P1-2) :
  // sans lui, une restriction de domaine posée sur le membre était ignorée ici.
  if (!can(membre.role, permissionRequise, membre.accesRestreints)) {
    return NextResponse.json({ error: estFinancier ? "Reverser un paiement encaissé est réservé à l'administrateur ou au comptable." : "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  // Fenêtre bornée à la journée en cours — évite de rouvrir un historique
  // ancien depuis une simple recherche par code, corrige uniquement une
  // erreur de manipulation récente.
  const traiteLe = booking.traite_le ? new Date(booking.traite_le) : null;
  const memeJour = traiteLe && traiteLe.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  if (!memeJour) {
    return NextResponse.json({ error: "Cette validation date de plus d'aujourd'hui — elle ne peut plus être annulée depuis cet écran." }, { status: 403 });
  }

  const motif = motifBrut.trim();
  if (motif.length < 5) {
    return NextResponse.json({ error: "Un motif (au moins 5 caractères) est requis pour annuler une validation." }, { status: 400 });
  }

  const ancienStatut = booking.statut;

  // Écriture gardée sur le statut de départ (P0-2) : deux "annuler la
  // validation" simultanés ne produisent qu'un seul reversement.
  const rdvLie = await trouverRdvLie({ id: booking.id, rdv_id: booking.rdv_id, confirmation_code: booking.confirmation_code, citoyen_id: booking.citoyen_id, institution_id: membre.institutionId });
  const { data: ligneRevert, error: bkErr } = await sb.from("paid_bookings")
    .update({ statut: "en_attente", traite_le: null })
    .eq("id", booking.id).eq("institution_id", membre.institutionId).eq("statut", ancienStatut).select("id");
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });
  if (!ligneRevert || ligneRevert.length === 0) {
    const { data: actuel } = await sb.from("paid_bookings").select("statut").eq("id", booking.id).eq("institution_id", membre.institutionId).maybeSingle();
    return NextResponse.json({ error: "Réservation déjà traitée", code: "DEJA_TRAITEE", statut_actuel: (actuel?.statut as string | undefined) ?? "inconnu" }, { status: 409 });
  }

  // Inverse exact de ce que chaque action avait posé sur le rdv jumeau —
  // jamais de "statut" touché pour confirme/no_show (on ne connaît pas sa
  // valeur d'avant sans risque de mal la deviner), seulement les champs de
  // présence qui viennent bien de cette action. "annule" restaure "nouveau"
  // (file d'attente accepter/refuser), seul état actif cohérent disponible.
  const rdvRevert: Record<string, unknown> =
    ancienStatut === "annule" ? { statut: "nouveau" } : { presence_status: null, presence_confirmed_at: null };

  // Un seul rdv (lié par rdv_id / code + citoyen + institution), jamais tout un créneau.
  const rdvEcrit = rdvLie ? await ecrireRdvLie(rdvLie.id, membre.institutionId, rdvRevert, booking.id) : false;
  const rdvJumeau = rdvEcrit && rdvLie ? { id: rdvLie.id } : null;

  const membreNom = await getMembreNomPourJournal(membre.membreId);
  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom,
    action: "rdv_validation_annulee",
    cibleTable: "rdv",
    cibleId: rdvJumeau?.id ?? booking.id,
    details: { ancien_statut: ancienStatut, motif },
    req,
  });

  if (estFinancier && booking.montant_paye != null) {
    await enregistrerTransaction({
      institutionId: membre.institutionId,
      paidBookingId: booking.id,
      typeTransaction: "annulation",
      montant: booking.montant_paye,
      ancienneValeur: { statut: "confirme", montant_paye: booking.montant_paye },
      nouvelleValeur: { statut: "en_attente" },
      motif,
      membreId: membre.membreId,
      membreNom,
      req,
    });

    // Le reçu associé n'a plus lieu d'être "confirmé" une fois la
    // validation reversée — jamais supprimé (recus_immuable interdit le
    // DELETE), seulement archivé. Insert non-bloquant : voir commentaire
    // équivalent au moment de la création du reçu, plus haut dans ce fichier.
    const { error: recuArchiveErr } = await sb.from("recus")
      .update({ statut: "archive", archive_le: new Date().toISOString() })
      .eq("paid_booking_id", booking.id);
    if (recuArchiveErr) console.error("[paid-bookings/valider] Erreur archivage reçu:", recuArchiveErr.message);
  }

  return NextResponse.json({ ok: true, statut: "en_attente", rdv_lie: rdvJumeau !== null });
}
