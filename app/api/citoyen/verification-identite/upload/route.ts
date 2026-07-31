import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const CIN_ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_CIN_SIZE = 10 * 1024 * 1024;

// Vérification d'identité citoyen (chantier Hero "état vivant", 23/07/2026)
// — auto-vérifié dès soumission d'une pièce (CIN), décision Bryan : pas de
// file d'attente admin pour démarrer. Réutilise le bucket privé existant
// "documents-citoyens" (déjà créé par Bryan, RLS sans policy, accès
// service_role uniquement) sous un préfixe dédié plutôt que de demander un
// nouveau bucket.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const accessToken = form.get("accessToken");
    const file = form.get("file");

    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier requis", code: "MISSING_FILE" }, { status: 400 });
    }
    if (!CIN_ACCEPTED_MIME.includes(file.type)) {
      return NextResponse.json({ error: "Format non accepté (PDF, JPG, PNG uniquement)", code: "INVALID_FORMAT" }, { status: 400 });
    }
    if (file.size > MAX_CIN_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)", code: "TOO_LARGE" }, { status: 400 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });

    const ext = file.name.split(".").pop() || "bin";
    const path = `identite/${user.id}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from("documents-citoyens").upload(path, buffer, { contentType: file.type });
    if (upErr) return NextResponse.json({ error: upErr.message, code: "UPLOAD_ERROR" }, { status: 500 });

    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({ cin_document_url: path, cin_soumis_le: new Date().toISOString(), identite_verifiee: true })
      .eq("id", user.id);
    if (updateErr) {
      await supabaseAdmin.storage.from("documents-citoyens").remove([path]);
      return NextResponse.json({ error: updateErr.message, code: "UPDATE_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN VERIFICATION IDENTITE UPLOAD ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
