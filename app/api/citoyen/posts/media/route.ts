import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateUpload } from "@/lib/uploadSecurity";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

// Upload d'image de post citoyen — mirroring exact de
// app/api/citoyen/profil/photo/route.ts (l'upload direct client vers
// Supabase Storage ne suffit pas en pratique pour ce projet, cf.
// commentaire d'origine dans ce fichier). Identité vérifiée via
// sb.auth.getUser(accessToken), jamais un id fourni tel quel.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const accessToken = form.get("accessToken");
  const file = form.get("file");

  if (typeof accessToken !== "string" || !accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const user = await verifierCitoyenToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "PUBLIC_IMAGE", MAX_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });
  const path = `${user.id}/post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${verif.extension}`;

  const { error: upErr } = await sb.storage.from("post-images").upload(path, buffer, {
    upsert: true,
    contentType: verif.detectedType,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data } = sb.storage.from("post-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
