import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Upload d'image pour la conversation institution ↔ support Yelen —
// mirroring app/api/institution/messages/upload-image/route.ts, sans
// notion de rdv (conversation permanente, un seul fil par institution).
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const legende = form.get("legende");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  if (!IMAGE_MIME.includes(file.type)) return NextResponse.json({ error: "Format non accepté (JPG, PNG, WEBP uniquement)" }, { status: 400 });
  if (file.size > MAX_IMAGE_SIZE) return NextResponse.json({ error: "Image trop volumineuse (10 Mo max)" }, { status: 400 });

  const ext = file.name.split(".").pop() || "jpg";
  const path = `yelen-institution/${authInstId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from("messagerie-images").upload(path, buffer, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const legendeTexte = typeof legende === "string" && legende.trim() ? legende.trim() : null;
  const { error: insErr } = await sb.from("messages_yelen_institution").insert({
    institution_id: authInstId,
    membre_id: membre.membreId,
    expediteur: "institution",
    contenu: legendeTexte,
    image_url: path,
    type: "image",
    lu: false,
  });
  if (insErr) {
    await sb.storage.from("messagerie-images").remove([path]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { data: signed } = await sb.storage.from("messagerie-images").createSignedUrl(path, 3600);
  return NextResponse.json({ success: true, path, url: signed?.signedUrl ?? null });
}
