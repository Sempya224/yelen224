import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateUpload, type UploadCategory } from "@/lib/uploadSecurity";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const MAX_TAILLE = 10 * 1024 * 1024;

// Vérification d'identité citoyen — flux complet recto + verso + selfie
// (28/08/2026, retour Bryan — remplace le flux recto seul du même jour).
// Toujours un vrai pipeline : passe en "en_attente", jamais d'auto-
// vérification ici. Réutilise le bucket privé existant "documents-citoyens"
// (déjà créé par Bryan, RLS sans policy, accès service_role uniquement).
const CHAMPS: { champ: "recto" | "verso" | "selfie"; categorie: UploadCategory }[] = [
  { champ: "recto", categorie: "DOCUMENT_KYC" },
  { champ: "verso", categorie: "DOCUMENT_KYC" },
  { champ: "selfie", categorie: "SELFIE_IDENTITE" },
];

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const accessToken = form.get("accessToken");
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });

    const fichiers: Record<string, { buffer: Buffer; extension: string; detectedType: string }> = {};

    for (const { champ, categorie } of CHAMPS) {
      const f = form.get(champ);
      if (!(f instanceof File)) {
        return NextResponse.json({ error: `Fichier "${champ}" requis`, code: "MISSING_FILE", champ }, { status: 400 });
      }
      const buffer = Buffer.from(await f.arrayBuffer());
      const verif = await validateUpload(buffer, categorie, MAX_TAILLE, f.name);
      if (!verif.valid) return NextResponse.json({ error: verif.reason, code: "INVALID_FORMAT", champ }, { status: 400 });
      fichiers[champ] = { buffer, extension: verif.extension, detectedType: verif.detectedType };
    }

    const uploadedPaths: string[] = [];
    try {
      const paths: Record<string, string> = {};
      for (const champ of Object.keys(fichiers)) {
        const { buffer, extension, detectedType } = fichiers[champ];
        const path = `identite/${user.id}/${champ}-${crypto.randomUUID()}.${extension}`;
        const { error: upErr } = await supabaseAdmin.storage.from("documents-citoyens").upload(path, buffer, { contentType: detectedType });
        if (upErr) throw upErr;
        uploadedPaths.push(path);
        paths[champ] = path;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("users")
        .update({
          cin_document_url: paths.recto,
          cin_verso_document_url: paths.verso,
          cin_selfie_url: paths.selfie,
          cin_soumis_le: new Date().toISOString(),
          cin_statut: "en_attente",
          cin_motif_refus: null,
          cin_examine_le: null,
        })
        .eq("id", user.id);
      if (updateErr) throw updateErr;

      return NextResponse.json({ success: true });
    } catch (e) {
      if (uploadedPaths.length) await supabaseAdmin.storage.from("documents-citoyens").remove(uploadedPaths);
      throw e;
    }
  } catch (error) {
    console.error("[CITOYEN VERIFICATION IDENTITE UPLOAD ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
