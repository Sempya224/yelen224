import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Signe en lot les chemins d'images de messagerie (bucket privé
// "messagerie-images") côté institution — mirroring
// app/api/citoyen/messagerie/image-url/route.ts. Vérifie que chaque
// chemin appartient bien à un message de cette institution avant de
// signer, pour ne jamais faire confiance à un chemin fourni tel quel.
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const paths = body?.paths;
  if (!Array.isArray(paths) || paths.length === 0 || paths.some((p) => typeof p !== "string")) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { data: ownMsgs } = await sb
    .from("messages")
    .select("image_url")
    .in("image_url", paths)
    .or(`expediteur_institution_id.eq.${authInstId},destinataire_institution_id.eq.${authInstId}`);
  const validPaths = new Set((ownMsgs ?? []).map((m) => m.image_url).filter(Boolean));

  const { data: ownYelenMsgs } = await sb
    .from("messages_yelen_institution")
    .select("image_url")
    .in("image_url", paths)
    .eq("institution_id", authInstId);
  for (const m of ownYelenMsgs ?? []) if (m.image_url) validPaths.add(m.image_url);

  const urls: Record<string, string> = {};
  for (const path of paths as string[]) {
    if (!validPaths.has(path)) continue;
    const { data: signed } = await sb.storage.from("messagerie-images").createSignedUrl(path, 3600);
    if (signed?.signedUrl) urls[path] = signed.signedUrl;
  }

  return NextResponse.json({ success: true, urls });
}
