import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { accorderPoints } from "@/lib/rewardsEngine";
import { envoyerNotification } from "@/lib/notificationEngine";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Décision d'examen — approuver ou refuser un dossier d'identité citoyen
// (pipeline réel, 28/08/2026). Ne traite que les dossiers "en_attente" —
// pas de révocation ni de ré-examen d'un dossier déjà décidé ici (hors
// périmètre de ce chantier, contrairement au système institution
// versionné). Sur approbation : accorderPoints (idempotent, voir
// lib/rewardsEngine.ts) et notification citoyen ; sur refus : motif
// obligatoire, transmis tel quel au citoyen.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authorizeAdmin(req, "citoyens.verify");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const decision = body?.decision;
    const motif = typeof body?.motif === "string" ? body.motif.trim() : "";

    if (decision !== "verifiee" && decision !== "refusee") {
      return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
    }
    if (decision === "refusee" && !motif) {
      return NextResponse.json({ error: "Motif de refus requis" }, { status: 400 });
    }

    const { data: citoyen, error: fetchErr } = await sb
      .from("users")
      .select("id, prenom, cin_statut")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!citoyen) return NextResponse.json({ error: "Citoyen introuvable" }, { status: 404 });
    if (citoyen.cin_statut !== "en_attente") {
      return NextResponse.json({ error: "Ce dossier n'est plus en attente d'examen" }, { status: 409 });
    }

    const { error: updateErr } = await sb
      .from("users")
      .update({
        cin_statut: decision,
        identite_verifiee: decision === "verifiee",
        cin_motif_refus: decision === "refusee" ? motif : null,
        cin_examine_le: new Date().toISOString(),
        cin_examine_par: session.adminId,
      })
      .eq("id", id);
    if (updateErr) throw updateErr;

    if (decision === "verifiee") {
      await envoyerNotification({
        destinataireId: id,
        destinataireType: "citoyen",
        rdvId: null,
        type: "identite_verifiee",
        titre: "Identité vérifiée",
        message: `Votre identité a été vérifiée. Le badge « Vérifié » est maintenant visible sur votre Yelen ID.`,
      });
      await accorderPoints({ citoyenId: id, sourceType: "identite", sourceId: id, eventType: "identite_verifiee" });
    } else {
      await envoyerNotification({
        destinataireId: id,
        destinataireType: "citoyen",
        rdvId: null,
        type: "identite_refusee",
        titre: "Vérification d'identité",
        message: `Votre document n'a pas pu être validé : ${motif}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
