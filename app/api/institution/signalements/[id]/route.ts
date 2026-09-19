import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";

// Signalements — Lot 1 (case management, 08/08/2026). Socle backend pour
// le futur écran détail (Lot UI, pas commencé) : cas + historique
// d'événements + notes internes (si autorisé) + pièces jointes.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "signalements") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }
  const { id } = await params;

  const { data: signalement, error } = await sb.from("signalements")
    .select("*").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!signalement) return NextResponse.json({ error: "Signalement introuvable pour cette institution" }, { status: 404 });

  const [{ data: events }, { data: attachments }, notesResult] = await Promise.all([
    sb.from("signalement_events").select("*").eq("signalement_id", id).order("created_at", { ascending: true }),
    sb.from("signalement_attachments").select("id, nom_original, type_mime, taille, ajoute_par_nom, created_at").eq("signalement_id", id).order("created_at", { ascending: false }),
    can(membre.role, "signalements.notes_read")
      ? sb.from("signalement_notes").select("*").eq("signalement_id", id).order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    signalement,
    events: events ?? [],
    attachments: attachments ?? [],
    notes: notesResult.data ?? null, // null = non autorisé (pas juste vide), distingué côté client
  });
}
