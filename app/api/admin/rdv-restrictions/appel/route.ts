import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envoyerNotification } from "@/lib/notificationEngine";
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from "@/lib/adminAuth";

// Décision admin sur une demande "Faire appel" (clôture no-show, décision
// CEO 03/09/2026) — copie quasi exacte de
// app/api/admin/suspension-revisions/route.ts (accepter réactive, rejeter
// exige un motif, une seule révision en_attente à la fois déjà garantie en
// base par l'index unique partiel).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function PATCH(request: NextRequest) {
  try {
    const admin = await authorizeAdmin(request, "citoyens.rdv_restrictions");

    const body = await request.json().catch(() => null);
    const id = body?.id;
    const action = body?.action;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const { data: appel } = await supabaseAdmin
      .from("citoyen_rdv_appels")
      .select("id, restriction_id, citoyen_id, statut")
      .eq("id", id)
      .maybeSingle();
    if (!appel) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    if (appel.statut !== "en_attente") {
      return NextResponse.json({ error: "Cette demande a déjà été traitée" }, { status: 409 });
    }

    const { data: citoyen } = await supabaseAdmin.from("users").select("prenom, nom").eq("id", appel.citoyen_id).maybeSingle();
    const prenomCitoyen = citoyen?.prenom || citoyen?.nom || "Citoyen";

    if (action === "accepter") {
      await supabaseAdmin
        .from("citoyen_rdv_restrictions")
        .update({ statut: "levee", levee_par: "revision", levee_le: new Date().toISOString(), levee_admin_id: admin.adminId as string })
        .eq("id", appel.restriction_id)
        .eq("statut", "active");
      await supabaseAdmin
        .from("citoyen_rdv_appels")
        .update({ statut: "acceptee", traite_par_admin_id: admin.adminId as string, decision_le: new Date().toISOString() })
        .eq("id", id);

      await envoyerNotification({
        destinataireId: appel.citoyen_id,
        destinataireType: "citoyen",
        rdvId: null,
        type: "rdv_appel_accepte",
        titre: `Bonjour, ${prenomCitoyen}`,
        message: "Votre demande d'appel a été acceptée. Votre accès aux rendez-vous et réservations est de nouveau disponible.",
      });
    } else if (action === "rejeter") {
      const motif = typeof body?.motif === "string" ? body.motif.trim() : "";
      if (!motif) return NextResponse.json({ error: "Motif de rejet requis" }, { status: 400 });

      await supabaseAdmin
        .from("citoyen_rdv_appels")
        .update({ statut: "rejetee", traite_par_admin_id: admin.adminId as string, decision_motif: motif, decision_le: new Date().toISOString() })
        .eq("id", id);

      await envoyerNotification({
        destinataireId: appel.citoyen_id,
        destinataireType: "citoyen",
        rdvId: null,
        type: "rdv_appel_rejete",
        titre: `Bonjour, ${prenomCitoyen}`,
        message: `Votre demande d'appel a été examinée et refusée. Motif : « ${motif} ». Vous pouvez soumettre une nouvelle demande si vous disposez d'informations complémentaires.`,
      });
    } else {
      return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    }

    await supabaseAdmin.from("admin_logs").insert({
      admin_id: admin.adminId as string,
      action: action === "accepter" ? "RDV_APPEL_ACCEPTE" : "RDV_APPEL_REJETE",
      cible_table: "citoyen_rdv_appels",
      cible_id: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminAuthError) return adminAuthErrorResponse(error);
    console.error("[ADMIN RDV RESTRICTIONS APPEL PATCH ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
