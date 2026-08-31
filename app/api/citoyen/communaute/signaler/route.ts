import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Signalements — Lot 1 (08/08/2026). `signalements` passe en RLS activé
// zéro policy (migration 20260808000004) — ce seul insert (Communauté
// Yelen, hors périmètre fonctionnel du case management mais partage la
// même table physique) devait donc bouger côté serveur pour ne pas casser.
// Même payload exact que l'ancien insert direct anon-client dans
// SignalerCommunauteModal.tsx — zéro changement de forme/UI/écran admin.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// IDOR corrigé (12/08/2026, trouvé lors de l'audit séparation Citizen/Web) —
// auteurId était accepté tel quel depuis le body, n'importe qui pouvait
// créer un signalement au nom de n'importe quel citoyen. Dérivé du token de
// session Supabase vérifié, même pattern que app/api/citoyen/favoris/route.ts.
async function getAuthenticatedCitoyenId(req: NextRequest): Promise<string | null> {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const { data: { user }, error } = await sb.auth.getUser(accessToken);
  if (error || !user) return null;
  return user.id;
}

export async function POST(req: NextRequest) {
  const auteurId = await getAuthenticatedCitoyenId(req);
  if (!auteurId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { type, description, cibleType, cibleId } = body ?? {};

  if (typeof type !== "string" || !type) return NextResponse.json({ error: "type requis" }, { status: 400 });
  if (typeof description !== "string" || !description) return NextResponse.json({ error: "description requise" }, { status: 400 });
  if (cibleType !== "communaute_post" && cibleType !== "communaute_auteur") return NextResponse.json({ error: "cibleType invalide" }, { status: 400 });
  if (typeof cibleId !== "string" || !cibleId) return NextResponse.json({ error: "cibleId requis" }, { status: 400 });

  const { error } = await sb.from("signalements").insert({
    type,
    description,
    statut: "en_cours",
    cible_type: cibleType,
    cible_id: cibleId,
    auteur_id: auteurId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
