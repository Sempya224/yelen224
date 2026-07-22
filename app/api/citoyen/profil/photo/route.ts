import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Upload photo de profil citoyen via service_role. La policy RLS ajoutée sur
// storage.objects (migration 20260720000011) n'a pas suffi en pratique — le
// JWT du citoyen vérifié correspond pourtant exactement au dossier ciblé
// (sub == premier segment du chemin), l'origine exacte du rejet RLS reste
// non identifiée côté client. Plutôt que de continuer à deviner sur les
// internals de Supabase Storage, même contournement que pour les
// institutions (api/institution/upload, api/institution/annonces/media) :
// l'identité est vérifiée ici via sb.auth.getUser(accessToken) — jamais un
// id fourni tel quel par le client — puis l'upload se fait en service_role.
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
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Seules les images sont acceptées" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image trop volumineuse (5 Mo max)" }, { status: 400 });
  }

  const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
  if (authErr || !user) {
    return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from("avatars").upload(path, buffer, {
    upsert: true,
    contentType: file.type,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
