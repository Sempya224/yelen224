import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { validateUpload } from "@/lib/uploadSecurity";

// Upload d'image pour une publication institution "Yelen Community"
// (22/08/2026) — mirroring exact de app/api/institution/annonces/media :
// service_role obligatoire, les institutions n'ont pas de session Supabase
// Auth (JWT custom), un upload direct depuis le navigateur échoue toujours
// contre storage.objects. Même bucket "post-images" que les posts citoyens
// (app/api/citoyen/posts/media) — un seul bucket pour le fil Communauté,
// peu importe le type d'auteur.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communaute_pro.publish")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "PUBLIC_IMAGE", MAX_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });
  const path = `${membre.institutionId}/post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${verif.extension}`;

  const { error: upErr } = await sb.storage.from("post-images").upload(path, buffer, {
    upsert: true,
    contentType: verif.detectedType,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data } = sb.storage.from("post-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
