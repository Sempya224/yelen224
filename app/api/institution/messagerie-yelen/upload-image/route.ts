import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { validateUpload } from "@/lib/uploadSecurity";
import { trouverOuCreerConversationActive } from "@/lib/messagerieYelenInstitution";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "MESSAGE_IMAGE", MAX_IMAGE_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });
  const path = `yelen-institution/${authInstId}/${crypto.randomUUID()}.${verif.extension}`;
  const { error: upErr } = await sb.storage.from("messagerie-images").upload(path, buffer, { contentType: verif.detectedType });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const conv = await trouverOuCreerConversationActive(sb, authInstId).catch(() => null);
  if (!conv) { await sb.storage.from("messagerie-images").remove([path]); return NextResponse.json({ error: "Impossible d'ouvrir la conversation." }, { status: 500 }); }

  const legendeTexte = typeof legende === "string" && legende.trim() ? legende.trim() : null;
  const { error: insErr } = await sb.from("messages_yelen_institution").insert({
    institution_id: authInstId,
    conversation_id: conv.id,
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
