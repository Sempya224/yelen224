import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { rdv_id, citoyen_id } = await req.json();

    if (!rdv_id || !citoyen_id)
      return NextResponse.json({ error: "rdv_id et citoyen_id requis" }, { status: 400 });

    const { data: rdv, error: rdvErr } = await supabase
      .from("rdv")
      .select("id,date_rdv,heure_rdv,statut,presence_status,institution_id,citoyen_id,qr_token,qr_expires_at")
      .eq("id", rdv_id)
      .eq("citoyen_id", citoyen_id)
      .single();

    if (rdvErr || !rdv)
      return NextResponse.json({ error: "RDV introuvable" }, { status: 404 });

    if (rdv.statut === "annule")
      return NextResponse.json({ error: "RDV annulé" }, { status: 400 });

    if (rdv.presence_status === "present")
      return NextResponse.json({ error: "Déjà confirmé" }, { status: 400 });

    // Réutiliser le token existant s'il est encore valide
    const tokenValide =
      rdv.qr_token &&
      rdv.qr_expires_at &&
      new Date(rdv.qr_expires_at) > new Date();

    let qr_token = rdv.qr_token;
    let qr_expires_at = rdv.qr_expires_at;

    if (!tokenValide) {
      // Générer un nouveau token
      const rawToken = `${rdv_id}:${citoyen_id}:${rdv.date_rdv}:${Date.now()}`;
      qr_token = crypto
        .createHmac("sha256", process.env.QR_SECRET_KEY || "yelen224-secret")
        .update(rawToken)
        .digest("hex");

      // Expire 7 jours à partir de maintenant
      qr_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await supabase
        .from("rdv")
        .update({ qr_token, qr_expires_at })
        .eq("id", rdv_id);
    }

    const qrPayload = JSON.stringify({
      t: qr_token,
      r: rdv_id,
      i: rdv.institution_id,
      d: rdv.date_rdv,
    });

    return NextResponse.json({
      success: true,
      qr_payload: qrPayload,
      qr_token,
      expires_at: qr_expires_at,
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: "Erreur serveur", details: err.message },
      { status: 500 }
    );
  }
}