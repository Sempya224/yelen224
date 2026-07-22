import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Upload d'images (logo, bannière, photo responsable) via service role —
// storage.objects n'a pas de policy RLS pour les institutions (pas de
// session Supabase Auth, JWT custom, cf. CLAUDE.md /auth), donc un upload
// direct depuis le client échoue avec "new row violates row-level security
// policy". Même pattern que api/institution/profile : la route serveur
// contourne RLS, l'authentification se fait via le cookie JWT institution.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const KIND_PREFIXES: Record<string, string> = {
  logo: "logos",
  banniere: "bannieres",
  responsable_photo: "responsables",
};

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "profil_entreprise.write") && !can(membre.role, "profil_responsable.write")) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const kind = form.get("kind");
  const file = form.get("file");

  if (typeof kind !== "string" || !(kind in KIND_PREFIXES)) {
    return NextResponse.json({ error: "Type de fichier invalide" }, { status: 400 });
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

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${KIND_PREFIXES[kind]}/${authInstId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from("avatars").upload(path, buffer, {
    upsert: true,
    contentType: file.type,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
