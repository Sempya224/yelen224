import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Upload des médias d'annonce (couverture, carrousel, PDF, vidéo) via
// service_role — même contournement RLS storage.objects que
// api/institution/upload : les institutions n'ont pas de session Supabase
// Auth (JWT custom, cf. CLAUDE.md /auth), un upload direct depuis le
// navigateur échoue avec "new row violates row-level security policy".
// CommunicationTab.tsx uploadait jusqu'ici directement depuis le client
// (uploadUn) — l'échec était catché silencieusement (url retournée null),
// d'où l'absence totale d'image/vidéo affichée, côté institution comme sur
// la fiche publique.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_MEDIA_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const ACCEPTED: Record<string, string> = {
  cover: "image/",
  carrousel: "image/",
  pdf: "application/pdf",
  video: "video/",
};

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communication.publish_annonce")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const prefix = form.get("prefix");
  const file = form.get("file");
  if (typeof prefix !== "string" || !(prefix in ACCEPTED)) {
    return NextResponse.json({ error: "Type de média invalide" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }
  if (!file.type.startsWith(ACCEPTED[prefix])) {
    return NextResponse.json({ error: "Format de fichier non accepté" }, { status: 400 });
  }

  const maxSize = prefix === "video" ? MAX_VIDEO_SIZE : MAX_MEDIA_SIZE;
  if (file.size > maxSize) {
    return NextResponse.json({ error: "Fichier trop volumineux" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "bin";
  const path = `${membre.institutionId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Bucket dédié "annonces" (public) — le bucket "documents" est et doit
  // rester privé (documents de conformité institutionnelle), confirmé par
  // Bryan dans Supabase Dashboard le 16/07/2026 : une image uploadée dedans
  // ne s'affichait ni côté institution ni côté fiche publique malgré un
  // upload réussi (RLS OK côté écriture service_role, mais l'URL générée
  // n'est pas servie publiquement pour un bucket privé).
  const { error: upErr } = await sb.storage.from("annonces").upload(path, buffer, {
    upsert: true,
    contentType: file.type,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data } = sb.storage.from("annonces").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
