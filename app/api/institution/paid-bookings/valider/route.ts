import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { enregistrerTransaction } from "@/lib/transactionsFinancieres";
import { creneauEstOuvert, RDV_HORS_CRENEAU_MESSAGE, absenceDeclarable, RDV_ABSENT_TROP_TOT_MESSAGE } from "@/lib/rdvGating";
import { chargerDonneesRecu, genererRecuPdf } from "@/lib/recuPdf";
import { notifierArrivee, notifierPriseEnCharge } from "@/lib/notificationEngine";
import { chargerRestrictionActive, notifierSiEscalade } from "@/lib/rdvRestrictions";

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

// "Historique Yelen" (refonte fiche de validation, 05/08/2026) — total réel
// de rendez-vous avec CETTE institution où une présence a été constatée
// (rdv.presence_status non nul, même table que le rdv jumeau "pour_autre"
// ci-dessous : couvre payant ET gratuit). Contexte rapide pour l'agent,
// jamais un CRM complet — pas de citoyen_id exposé au client, uniquement
// les compteurs agrégés.
async function chargerHistoriqueCitoyen(citoyenId: string, institutionId: string) {
  const { data } = await sb
    .from("rdv")
    .select("presence_status,date_rdv")
    .eq("institution_id", institutionId)
    .eq("citoyen_id", citoyenId)
    .not("presence_status", "is", null);
  const rows = data ?? [];
  const honores = rows.filter(r => r.presence_status === "present").length;
  const absents = rows.filter(r => r.presence_status === "absent").length;
  const derniereVisite = rows.filter(r => r.presence_status === "present").map(r => r.date_rdv).sort().pop() ?? null;
  return { total: rows.length, honores, absents, derniereVisite };
}

async function chargerBooking(filtre: { id: string } | { code: string }, institutionId: string) {
  let query = sb
    .from("paid_bookings")
    .select(`
      id, confirmation_code, statut, date_rdv, heure_rdv, institution_id, traite_le, citoyen_id,
      montant_declare_citoyen, declare_le,
      paid_services(nom, prix, duree_minutes),
      users!paid_bookings_citoyen_id_fkey(prenom, nom, phone, photo_url, date_naissance, sexe)
    `)
    .eq("institution_id", institutionId);
  query = "id" in filtre ? query.eq("id", filtre.id) : query.eq("confirmation_code", filtre.code);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  // Le bénéficiaire "pour un tiers" vit sur la ligne rdv jumelle (créée en
  // même temps que la réservation payante), pas sur paid_bookings — jointe
  // par créneau, même convention que le badge "Payant" côté écran RDV.
  const [{ data: rdvJumeau }, historique, { data: recu }] = await Promise.all([
    sb.from("rdv").select("pour_autre,nom_autre,phone_autre")
      .eq("institution_id", institutionId).eq("date_rdv", data.date_rdv).eq("heure_rdv", data.heure_rdv).maybeSingle(),
    chargerHistoriqueCitoyen(data.citoyen_id, institutionId),
    // Décision CEO 06/08/2026 — "activer le reçu aussi côté institution" :
    // la fiche de validation doit pouvoir proposer le téléchargement du
    // reçu directement, pas seulement depuis l'onglet Paiements séparé.
    sb.from("recus").select("id").eq("paid_booking_id", data.id).eq("statut", "disponible").maybeSingle(),
  ]);

  const svc = data.paid_services as unknown as { nom: string | null; prix: number | null; duree_minutes: number | null } | null;
  const u = data.users as unknown as { prenom: string | null; nom: string | null; phone: string | null; photo_url: string | null; date_naissance: string | null; sexe: string | null } | null;
  return {
    id: data.id,
    confirmation_code: data.confirmation_code,
    statut: data.statut,
    date_rdv: data.date_rdv,
    heure_rdv: data.heure_rdv,
    traite_le: data.traite_le,
    montant_declare_citoyen: data.montant_declare_citoyen ?? null,
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
    // La date de naissance réelle n'est jamais transmise — la fiche ne
    // l'affiche que masquée (••••••), seule sa présence importe côté agent.
    citoyen_date_naissance_renseignee: !!u?.date_naissance,
    citoyen_sexe: u?.sexe === "homme" || u?.sexe === "femme" ? u.sexe : null,
    historique,
    recu_id: recu?.id ?? null,
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

  const booking = await chargerBooking(id ? { id } : { code: code! }, membre.institutionId);
  if (!booking) return NextResponse.json({ error: "Aucune réservation trouvée pour cette institution." }, { status: 404 });
  return NextResponse.json({ booking });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Même correctif que app/api/institution/rdv/statut/route.ts (trouvé en
  // conditions réelles le 15/09/2026) — une institution suspendue ne doit
  // plus pouvoir traiter de réservation payante non plus (confirmer, no-show,
  // annuler, annuler une validation).
  const { data: institutionSuspension } = await sb.from("institutions").select("statut").eq("id", membre.institutionId).maybeSingle();
  if (institutionSuspension?.statut === "suspendue") {
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
      id,institution_id,citoyen_id,date_rdv,heure_rdv,statut,montant_paye,montant_declare_citoyen,declare_le,traite_le,service_id,
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

  if (action === "annuler_validation") return handleAnnulerValidation(req, membre, booking, typeof body?.motif === "string" ? body.motif : "");

  if (!can(membre.role, "rdv.write", membre.accesRestreints)) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  // "Confirmé" = preuve de présence (paiement encaissé + présence validée en
  // une seule action ici, pas de scan séparé pour le payant) — jamais
  // atteignable hors du créneau autorisé, même via une recherche manuelle par
  // code plutôt que "Prendre en charge".
  if (action === "confirme" && !creneauEstOuvert(booking.date_rdv, booking.heure_rdv)) {
    return NextResponse.json({ error: RDV_HORS_CRENEAU_MESSAGE.message, hors_creneau: true, titre: RDV_HORS_CRENEAU_MESSAGE.titre }, { status: 403 });
  }

  // Même règle que rdv/statut/route.ts (trou trouvé 08/09/2026) : une
  // absence ne peut jamais être déclarée avant l'ouverture de la fenêtre de
  // confirmation de présence elle-même.
  if (action === "no_show" && !absenceDeclarable(booking.date_rdv, booking.heure_rdv)) {
    return NextResponse.json({ error: RDV_ABSENT_TROP_TOT_MESSAGE }, { status: 403 });
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
  const montantAFiger = booking.montant_paye ?? (booking.paid_services as unknown as { prix: number } | null)?.prix ?? null;

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

  const bookingUpdate: Record<string, unknown> = { statut: action, traite_le: new Date().toISOString() };
  if (action === "confirme" && booking.montant_paye == null && montantAFiger != null) bookingUpdate.montant_paye = montantAFiger;

  // Renseigné plus bas si un reçu est réellement généré avec succès —
  // renvoyé au frontend pour proposer le téléchargement immédiatement,
  // sans round-trip GET supplémentaire (décision CEO 06/08/2026).
  let recuIdDisponible: string | null = null;

  const { error: bkErr } = await sb.from("paid_bookings").update(bookingUpdate).eq("id", id);
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });

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
    : { statut: "annule" };

  // Restriction automatique des rendez-vous (no-show, décision CEO
  // 03/09/2026) — même pont que rdv/statut/route.ts, capturé AVANT l'update
  // pour détecter une éventuelle escalade juste après.
  const restrictionAvant = action === "no_show" ? await chargerRestrictionActive(sb, booking.citoyen_id) : null;

  const { data: rdvJumeau } = await sb.from("rdv").update(rdvUpdates)
    .eq("institution_id", membre.institutionId).eq("date_rdv", booking.date_rdv).eq("heure_rdv", booking.heure_rdv)
    .select("id").maybeSingle();

  if (action === "no_show") {
    await notifierSiEscalade(sb, booking.citoyen_id, restrictionAvant?.id ?? null);
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
    const notifCtx = {
      rdvId: rdvJumeau?.id ?? id,
      citoyenId: booking.citoyen_id,
      citoyenPrenom: userRow?.prenom || userRow?.nom || "Citoyen",
      institutionId: booking.institution_id,
      institutionNom: instRow?.name ?? "l'établissement",
      dateRdv: booking.date_rdv,
      heureRdv: booking.heure_rdv,
    };
    await notifierArrivee(notifCtx);
    await notifierPriseEnCharge(notifCtx);

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
        if (recuErr) console.error("[paid-bookings/valider] Erreur création reçu:", recuErr.message);

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
  }

  return NextResponse.json({ ok: true, statut: action, recu_id: recuIdDisponible });
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
  membre: { institutionId: string; membreId: string; role: import("@/lib/institutionPermissions").MembreRole },
  booking: { id: string; date_rdv: string; heure_rdv: string; statut: string; montant_paye: number | null; traite_le: string | null },
  motifBrut: string,
) {
  if (booking.statut === "en_attente") {
    return NextResponse.json({ error: "Cette réservation n'a pas encore été traitée, rien à annuler." }, { status: 400 });
  }

  const estFinancier = booking.statut === "confirme";
  const permissionRequise = estFinancier ? "paiements.rembourser" : "rdv.write";
  if (!can(membre.role, permissionRequise)) {
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

  const { error: bkErr } = await sb.from("paid_bookings")
    .update({ statut: "en_attente", traite_le: null })
    .eq("id", booking.id);
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });

  // Inverse exact de ce que chaque action avait posé sur le rdv jumeau —
  // jamais de "statut" touché pour confirme/no_show (on ne connaît pas sa
  // valeur d'avant sans risque de mal la deviner), seulement les champs de
  // présence qui viennent bien de cette action. "annule" restaure "nouveau"
  // (file d'attente accepter/refuser), seul état actif cohérent disponible.
  const rdvRevert: Record<string, unknown> =
    ancienStatut === "annule" ? { statut: "nouveau" } : { presence_status: null, presence_confirmed_at: null };

  const { data: rdvJumeau } = await sb.from("rdv").update(rdvRevert)
    .eq("institution_id", membre.institutionId).eq("date_rdv", booking.date_rdv).eq("heure_rdv", booking.heure_rdv)
    .select("id").maybeSingle();

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

  return NextResponse.json({ ok: true, statut: "en_attente" });
}
