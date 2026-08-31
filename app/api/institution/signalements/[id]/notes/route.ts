import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { ajouterNote } from "@/lib/signalements";

// Signalements — Lot 1. Notes internes, jamais visibles du citoyen
// (gardées par signalements.notes_write, distinct de la visibilité tab).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "signalements.notes_write")) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  const { id } = await params;

  const { data: signalement } = await sb.from("signalements").select("id").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!signalement) return NextResponse.json({ error: "Signalement introuvable pour cette institution" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const contenu = body?.contenu;
  if (typeof contenu !== "string" || !contenu.trim()) return NextResponse.json({ error: "Le contenu de la note ne peut pas être vide." }, { status: 400 });

  const { data: membreRow } = await sb.from("institution_membres").select("prenom, nom").eq("id", membre.membreId).maybeSingle();
  const resultat = await ajouterNote({
    signalementId: id, institutionId: membre.institutionId, contenu,
    auteur: { membreId: membre.membreId, nom: membreRow ? `${membreRow.prenom} ${membreRow.nom}` : "Membre" },
    req,
  });
  return resultat.ok ? NextResponse.json({ ok: true, id: resultat.id }) : NextResponse.json({ error: resultat.error }, { status: 400 });
}
