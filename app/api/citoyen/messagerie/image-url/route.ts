import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Signe en lot les chemins d'images de messagerie (bucket privé
// "messagerie-images") pour affichage inline dans une conversation — évite
// un aller-retour par image. Vérifie l'appartenance de chaque chemin avant
// de signer (requête sur messages/messages_yelen_citoyen filtrée par
// user.id) : un chemin ne doit jamais être signé juste parce qu'un citoyen
// authentifié l'a fourni, sans quoi il suffirait de deviner/observer le
// chemin d'une image d'un tiers pour la faire signer.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = body?.accessToken;
    const paths = body?.paths;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (!Array.isArray(paths) || paths.length === 0 || paths.some((p) => typeof p !== "string")) {
      return NextResponse.json({ error: "Requête invalide", code: "BAD_REQUEST" }, { status: 400 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });

    const validPaths = new Set<string>();
    const { data: ownMsgs } = await supabaseAdmin
      .from("messages")
      .select("image_url")
      .in("image_url", paths)
      .or(`expediteur_citoyen_id.eq.${user.id},destinataire_citoyen_id.eq.${user.id}`);
    for (const m of ownMsgs ?? []) if (m.image_url) validPaths.add(m.image_url);

    const { data: ownYelenMsgs } = await supabaseAdmin
      .from("messages_yelen_citoyen")
      .select("image_url")
      .in("image_url", paths)
      .eq("citoyen_id", user.id);
    for (const m of ownYelenMsgs ?? []) if (m.image_url) validPaths.add(m.image_url);

    const urls: Record<string, string> = {};
    for (const path of paths as string[]) {
      if (!validPaths.has(path)) continue;
      const { data: signed } = await supabaseAdmin.storage.from("messagerie-images").createSignedUrl(path, 3600);
      if (signed?.signedUrl) urls[path] = signed.signedUrl;
    }

    return NextResponse.json({ success: true, urls });
  } catch (error) {
    console.error("[MESSAGERIE IMAGE URL ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
