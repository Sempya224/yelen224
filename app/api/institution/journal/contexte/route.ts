import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Événements liés (Lot E, 24/07/2026) — 3 événements précédents et 3
// suivants autour d'une entrée du journal, pour reconstituer le fil de
// l'histoire (ex. connexion → création client → création RDV → paiement).
// Même garde d'accès que /api/institution/journal (journal.read).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SELECT = "id,audit_id,membre_id,membre_nom,action,categorie,niveau,cible_table,cible_id,details,ancienne_valeur,nouvelle_valeur,ip,user_agent,navigateur,os,plateforme,created_at";

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "journal.read")) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });

  const entryId = new URL(req.url).searchParams.get("entry_id");
  if (!entryId) return NextResponse.json({ error: "entry_id requis" }, { status: 400 });

  const { data: ref } = await sb
    .from("journal_activite")
    .select("id,created_at")
    .eq("id", entryId)
    .eq("institution_id", membre.institutionId)
    .maybeSingle();
  if (!ref) return NextResponse.json({ error: "Entrée introuvable pour cette institution" }, { status: 404 });

  const [{ data: avantRaw, error: e1 }, { data: apresRaw, error: e2 }] = await Promise.all([
    sb.from("journal_activite").select(SELECT)
      .eq("institution_id", membre.institutionId)
      .lt("created_at", ref.created_at)
      .order("created_at", { ascending: false })
      .limit(3),
    sb.from("journal_activite").select(SELECT)
      .eq("institution_id", membre.institutionId)
      .gt("created_at", ref.created_at)
      .order("created_at", { ascending: true })
      .limit(3),
  ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({
    avant: (avantRaw ?? []).reverse(),
    apres: apresRaw ?? [],
  });
}
