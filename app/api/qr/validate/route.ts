import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { getMembreNomPourJournal } from "@/lib/journalActivite";
import { validerScanQr, confirmerPresenceRdv, effetsBordConfirmationPresente, effetsBordConfirmationAbsente } from "@/lib/qrValidation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST → Valider un QR scanné (dashboard institution). Règles de
// validation centralisées dans lib/qrValidation.ts (partagées avec YELEN
// Accueil, app/api/checkin/scan) — ne pas les redupliquer ici.
export async function POST(req: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(req);
    if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // GAP-05-01 (13/09/2026) — jusqu'ici cette route ne vérifiait aucune
    // autorisation métier, seulement l'authentification : un membre
    // comptable/superviseur/dirigeant pouvait valider une présence en
    // appelant la route directement, le masquage de l'onglet "scanner"
    // côté client n'étant pas une barrière de sécurité. Vérifié avant
    // toute lecture du RDV, pour ne jamais divulguer d'information sur un
    // rendez-vous à un rôle non autorisé.
    if (!can(membre.role, "appointment.check_in"))
      return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });

    // Même correctif que app/api/institution/rdv/statut/route.ts et
    // paid-bookings/valider/route.ts (trouvé en conditions réelles le
    // 15/09/2026) — une institution suspendue ne doit plus pouvoir traiter
    // de présence non plus.
    const { data: institutionSuspendue } = await supabase.from("institutions").select("statut").eq("id", membre.institutionId).maybeSingle();
    if (institutionSuspendue?.statut === "suspendue") {
      return NextResponse.json({ error: "Votre établissement est actuellement suspendu — vous ne pouvez plus traiter de présence tant que cette mesure n'est pas levée." }, { status: 403 });
    }

    const { qr_payload } = await req.json();
    if (!qr_payload)
      return NextResponse.json({ error: "qr_payload requis" }, { status: 400 });

    let parsed: { t: string; r: string; i: string; d: string };
    try {
      parsed = JSON.parse(qr_payload);
    } catch {
      return NextResponse.json({ error: "QR invalide" }, { status: 400 });
    }

    const { t: qr_token, r: rdv_id, i: inst_id } = parsed;

    // Filtre rapide côté payload (client, falsifiable) — la vraie barrière
    // est le `.eq("institution_id", ...)` dans validerScanQr (GAP-07-01).
    if (inst_id !== membre.institutionId)
      return NextResponse.json({ error: "QR appartient à une autre institution" }, { status: 403 });

    const resultat = await validerScanQr(supabase, { rdvId: rdv_id, qrToken: qr_token, institutionId: membre.institutionId });
    if (!resultat.ok) return NextResponse.json(resultat.body, { status: resultat.status });

    const { rdv } = resultat;
    return NextResponse.json({
      success: true,
      rdv: {
        id: rdv.id,
        date_rdv: rdv.date_rdv,
        heure_rdv: rdv.heure_rdv,
        objet: rdv.objet,
        citoyen_nom: `${rdv.citoyen_prenom ?? ""} ${rdv.citoyen_nom ?? ""}`.trim() || "Citoyen",
        citoyen_phone: rdv.citoyen_phone || "",
      },
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT → Confirmer présent ou absent (dashboard institution).
export async function PUT(req: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(req);
    if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // GAP-05-01 — même vérification que sur le POST ci-dessus.
    if (!can(membre.role, "appointment.check_in"))
      return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });

    const { data: institutionSuspendue } = await supabase.from("institutions").select("statut").eq("id", membre.institutionId).maybeSingle();
    if (institutionSuspendue?.statut === "suspendue") {
      return NextResponse.json({ error: "Votre établissement est actuellement suspendu — vous ne pouvez plus traiter de présence tant que cette mesure n'est pas levée." }, { status: 403 });
    }

    const { rdv_id, action, motif: motifBrut } = await req.json();
    const motif = typeof motifBrut === "string" ? motifBrut.trim() : undefined;

    if (!rdv_id || !action)
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

    if (!["present", "absent"].includes(action))
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });

    const resultat = await confirmerPresenceRdv(supabase, { rdvId: rdv_id, action, institutionId: membre.institutionId, motif });
    if (!resultat.ok) return NextResponse.json(resultat.body, { status: resultat.status });

    const membreNom = await getMembreNomPourJournal(membre.membreId);
    if (resultat.action === "present") {
      await effetsBordConfirmationPresente({ confirmation: resultat, membreId: membre.membreId, membreNom, req });
    } else {
      await effetsBordConfirmationAbsente({ confirmation: resultat, motif: motif!, membreId: membre.membreId, membreNom, req });
    }

    return NextResponse.json({ success: true, status: resultat.action });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
