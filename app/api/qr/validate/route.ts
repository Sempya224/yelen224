import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { creneauEstOuvert, RDV_HORS_CRENEAU_MESSAGE } from "@/lib/rdvGating";
import { notifierArrivee, notifierPriseEnCharge } from "@/lib/notificationEngine";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST → Valider un QR scanné
export async function POST(req: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(req);
    if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { qr_payload } = await req.json();
    if (!qr_payload)
      return NextResponse.json({ error: "qr_payload requis" }, { status: 400 });

    // Parser le payload
    let parsed: { t: string; r: string; i: string; d: string };
    try {
      parsed = JSON.parse(qr_payload);
    } catch {
      return NextResponse.json({ error: "QR invalide" }, { status: 400 });
    }

    const { t: qr_token, r: rdv_id, i: inst_id } = parsed;

    // Vérifier que ce QR appartient bien à cette institution
    if (inst_id !== membre.institutionId)
      return NextResponse.json(
        { error: "QR appartient à une autre institution" },
        { status: 403 }
      );

    // Récupérer le RDV avec infos citoyen
    const { data: rdv, error: rdvErr } = await supabase
      .from("rdv")
      .select(`
        id, date_rdv, heure_rdv, statut, presence_status,
        institution_id, citoyen_id, objet,
        qr_token, qr_expires_at,
        users!rdv_citoyen_id_fkey (nom, prenom, phone)
      `)
      .eq("id", rdv_id)
      .single();

    if (rdvErr || !rdv)
      return NextResponse.json({ error: "RDV introuvable" }, { status: 404 });

    // Vérifications métier
    if (rdv.statut === "annule")
      return NextResponse.json({ error: "RDV annulé" }, { status: 400 });

    if (rdv.presence_status === "present")
      return NextResponse.json({ error: "Déjà confirmé" }, { status: 400 });

    // Vérifier le token
    if (rdv.qr_token !== qr_token)
      return NextResponse.json({ error: "Token QR invalide" }, { status: 401 });

    // Vérifier l'expiration
    if (rdv.qr_expires_at && new Date() > new Date(rdv.qr_expires_at))
      return NextResponse.json({ error: "QR expiré" }, { status: 401 });

    // Lot A (16/07/2026) — la confirmation de présence n'est autorisée que le
    // jour du RDV, à partir de 10 min avant l'heure prévue. Vérifié ici en
    // plus du bouton "Prendre en charge" côté client (défense en profondeur).
    if (!creneauEstOuvert(rdv.date_rdv, rdv.heure_rdv)) {
      return NextResponse.json({ error: RDV_HORS_CRENEAU_MESSAGE.message, hors_creneau: true, titre: RDV_HORS_CRENEAU_MESSAGE.titre }, { status: 403 });
    }

    const citoyen = rdv.users as any;

    return NextResponse.json({
      success: true,
      rdv: {
        id: rdv.id,
        date_rdv: rdv.date_rdv,
        heure_rdv: rdv.heure_rdv,
        objet: rdv.objet,
        citoyen_nom: citoyen
          ? `${citoyen.prenom ?? ""} ${citoyen.nom ?? ""}`.trim() || "Citoyen"
          : "Citoyen",
        citoyen_phone: citoyen?.phone || "",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Erreur serveur", details: err.message },
      { status: 500 }
    );
  }
}

// PUT → Confirmer présent ou absent
export async function PUT(req: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(req);
    if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { rdv_id, action } = await req.json();

    if (!rdv_id || !action)
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

    if (!["present", "absent"].includes(action))
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });

    // Vérifier que le RDV appartient à cette institution
    const { data: rdv, error } = await supabase
      .from("rdv")
      .select("id, institution_id, citoyen_id, date_rdv, heure_rdv, statut, institutions!rdv_institution_id_fkey(name), users!rdv_citoyen_id_fkey(prenom,nom,phone)")
      .eq("id", rdv_id)
      .eq("institution_id", membre.institutionId)
      .single();

    if (error || !rdv)
      return NextResponse.json({ error: "RDV introuvable" }, { status: 404 });

    // Lot A (16/07/2026) — même règle temporelle qu'à l'étape POST : ne
    // jamais faire confiance uniquement au bouton "Prendre en charge" côté
    // client, revérifier ici où l'état change réellement.
    if (!creneauEstOuvert(rdv.date_rdv, rdv.heure_rdv)) {
      return NextResponse.json({ error: RDV_HORS_CRENEAU_MESSAGE.message, hors_creneau: true, titre: RDV_HORS_CRENEAU_MESSAGE.titre }, { status: 403 });
    }

    // "Confirmé" = présence prouvée (scan QR gratuit ici, validation
    // paiement+présence côté payant ailleurs) — jamais un simple PATCH de
    // statut libre. On ne transitionne que depuis en_attente, jamais depuis
    // nouveau/annule/confirme/termine.
    const updates: Record<string, unknown> = {
      presence_status: action,
      presence_confirmed_at: new Date().toISOString(),
    };
    if (action === "present" && rdv.statut === "en_attente") {
      updates.statut = "confirme";
    }

    const { error: updateErr } = await supabase
      .from("rdv")
      .update(updates)
      .eq("id", rdv_id);

    if (updateErr)
      return NextResponse.json({ error: "Mise à jour échouée" }, { status: 500 });

    if (action === "present" && rdv.statut === "en_attente") {
      await enregistrerAction({
        institutionId: membre.institutionId,
        membreId: membre.membreId,
        membreNom: await getMembreNomPourJournal(membre.membreId),
        action: "rdv_confirme",
        cibleTable: "rdv",
        cibleId: rdv_id,
        req,
      });
    }

    // Chantier "Yelen Assistant" (20/07/2026) — Phases 6 (arrivée détectée)
    // et 7 (début de prise en charge) : même trigger réel, le scan QR
    // (confirmé par Bryan) — envoyées l'une après l'autre depuis ce même
    // point de code. Jamais pour "absent" (hors des 8 phases du chantier).
    if (action === "present") {
      const institutionsRel = rdv.institutions as unknown as { name: string } | { name: string }[] | null;
      const usersRel = rdv.users as unknown as { prenom: string | null; nom: string | null; phone: string | null } | { prenom: string | null; nom: string | null; phone: string | null }[] | null;
      const instRow = Array.isArray(institutionsRel) ? institutionsRel[0] : institutionsRel;
      const userRow = Array.isArray(usersRel) ? usersRel[0] : usersRel;
      const ctx = {
        rdvId: rdv.id,
        citoyenId: rdv.citoyen_id,
        citoyenPrenom: userRow?.prenom || userRow?.nom || "Citoyen",
        institutionId: rdv.institution_id,
        institutionNom: instRow?.name ?? "l'établissement",
        dateRdv: rdv.date_rdv,
        heureRdv: rdv.heure_rdv,
      };
      await notifierArrivee(ctx);
      await notifierPriseEnCharge(ctx);
    }

    return NextResponse.json({ success: true, status: action });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Erreur serveur", details: err.message },
      { status: 500 }
    );
  }
}