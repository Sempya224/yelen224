import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifierDocumentTeleverse } from "@/lib/notificationEngine";
import { validateUpload } from "@/lib/uploadSecurity";
import { enregistrerReception } from "@/lib/citoyenDocuments";
import { accorderPoints } from "@/lib/rewardsEngine";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

// Lot D (chantier "Activités passées") — le citoyen répond à une "demande"
// de document (sens='demande', statut='en_attente') en téléversant un
// fichier. Ne peut jamais cibler un document appartenant à un autre
// citoyen (vérifié via accessToken, pas un id fourni tel quel), ni un
// document qui n'est pas réellement en attente de sa part.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const accessToken = form.get("accessToken");
    const documentId = form.get("documentId");
    const file = form.get("file");

    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (typeof documentId !== "string" || !documentId) {
      return NextResponse.json({ error: "Identifiant de document manquant", code: "MISSING_FIELDS" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier requis", code: "MISSING_FILE" }, { status: 400 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });

    const { data: doc } = await supabaseAdmin
      .from("citoyen_documents")
      .select("id, institution_id, rdv_id, sens, statut, label")
      .eq("id", documentId)
      .eq("citoyen_id", user.id)
      .maybeSingle();
    if (!doc) return NextResponse.json({ error: "Demande introuvable", code: "NOT_FOUND" }, { status: 404 });
    if (doc.sens !== "demande" || doc.statut !== "en_attente") {
      return NextResponse.json({ error: "Cette demande n'est plus en attente", code: "ALREADY_HANDLED" }, { status: 409 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const verif = await validateUpload(buffer, "DOCUMENT_KYC", MAX_DOCUMENT_SIZE, file.name);
    if (!verif.valid) return NextResponse.json({ error: verif.reason, code: "INVALID_FORMAT" }, { status: 400 });
    const path = `${doc.institution_id}/${user.id}/${crypto.randomUUID()}.${verif.extension}`;
    const { error: upErr } = await supabaseAdmin.storage.from("documents-citoyens").upload(path, buffer, { contentType: verif.detectedType });
    if (upErr) return NextResponse.json({ error: upErr.message, code: "UPLOAD_ERROR" }, { status: 500 });

    const reception = await enregistrerReception({
      documentId, url: path, typeMime: verif.detectedType, taille: file.size,
      acteur: { type: "citoyen", id: user.id, nom: null }, req: request,
    });
    if (!reception.ok) {
      await supabaseAdmin.storage.from("documents-citoyens").remove([path]);
      return NextResponse.json({ error: reception.error, code: "UPDATE_ERROR" }, { status: 500 });
    }

    // Yelen Rewards Phase 2 (22/08/2026) — +25 points, une fois par
    // document (idempotence via source_id=documentId). Répétable, jamais
    // contrôlé par le citoyen (la demande initiale vient toujours de
    // l'institution) — pas de risque de farming identifié.
    await accorderPoints({ citoyenId: user.id, sourceType: "document", sourceId: documentId, eventType: "document_envoye" });

    // Notification institution (plan rétention v2, item 1) — best-effort,
    // ne fait jamais échouer l'upload si la notification échoue.
    const [{ data: citoyenRow }, { data: instRow }] = await Promise.all([
      supabaseAdmin.from("users").select("prenom").eq("id", user.id).maybeSingle(),
      supabaseAdmin.from("institutions").select("name").eq("id", doc.institution_id).maybeSingle(),
    ]);
    await notifierDocumentTeleverse({
      institutionId: doc.institution_id,
      institutionNom: instRow?.name ?? null,
      citoyenPrenom: citoyenRow?.prenom || "Un citoyen",
      label: doc.label,
      rdvId: doc.rdv_id,
    }).catch((err) => console.error("[citoyen documents upload] notification error:", err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN DOCUMENTS UPLOAD ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
