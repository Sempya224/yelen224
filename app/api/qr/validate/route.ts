import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST → Valider un QR scanné
export async function POST(req: NextRequest) {
  try {
    const { qr_payload, institution_id } = await req.json();

    if (!qr_payload || !institution_id)
      return NextResponse.json(
        { error: "qr_payload et institution_id requis" },
        { status: 400 }
      );

    // Parser le payload
    let parsed: { t: string; r: string; i: string; d: string };
    try {
      parsed = JSON.parse(qr_payload);
    } catch {
      return NextResponse.json({ error: "QR invalide" }, { status: 400 });
    }

    const { t: qr_token, r: rdv_id, i: inst_id } = parsed;

    // Vérifier que ce QR appartient bien à cette institution
    if (inst_id !== institution_id)
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
        users!rdv_citoyen_id_fkey (nom, prenom, telephone)
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

    const citoyen = rdv.users as any;

    return NextResponse.json({
      success: true,
      rdv: {
        id: rdv.id,
        date_rdv: rdv.date_rdv,
        heure_rdv: rdv.heure_rdv,
        objet: rdv.objet,
        citoyen_nom: citoyen
          ? `${citoyen.prenom} ${citoyen.nom}`
          : "Citoyen",
        citoyen_phone: citoyen?.telephone || "",
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
    const { rdv_id, action, institution_id } = await req.json();

    if (!rdv_id || !action || !institution_id)
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

    if (!["present", "absent"].includes(action))
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });

    // Vérifier que le RDV appartient à cette institution
    const { data: rdv, error } = await supabase
      .from("rdv")
      .select("id, institution_id")
      .eq("id", rdv_id)
      .eq("institution_id", institution_id)
      .single();

    if (error || !rdv)
      return NextResponse.json({ error: "RDV introuvable" }, { status: 404 });

    // Mettre à jour
    const { error: updateErr } = await supabase
      .from("rdv")
      .update({
        presence_status: action,
        presence_confirmed_at: new Date().toISOString(),
      })
      .eq("id", rdv_id);

    if (updateErr)
      return NextResponse.json({ error: "Mise à jour échouée" }, { status: 500 });

    return NextResponse.json({ success: true, status: action });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Erreur serveur", details: err.message },
      { status: 500 }
    );
  }
}