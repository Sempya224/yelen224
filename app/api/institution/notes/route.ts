import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { TYPES_NOTE } from "@/lib/projetsNotes";

// Contourne RLS via service role — notes n'a aucune policy publique
// (migration 20260720000001), accès exclusivement via cette route.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TYPE_VALUES = TYPES_NOTE.map((t) => t.value);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  // Lecture ouverte à toute l'équipe (décision Bryan/CEO) — seule
  // l'écriture est restreinte à l'auteur (voir PATCH/DELETE ci-dessous).
  const { data, error } = await sb
    .from("notes")
    .select("id,titre,contenu,type,membre_id,created_at,updated_at")
    .eq("institution_id", authInstId)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const titre = body?.titre;
  if (typeof titre !== "string" || !titre.trim()) {
    return NextResponse.json({ error: "Titre requis" }, { status: 400 });
  }
  const contenu = typeof body?.contenu === "string" ? body.contenu : "";
  const type = TYPE_VALUES.includes(body?.type) ? body.type : "info_importante";

  const { data, error } = await sb
    .from("notes")
    .insert({ institution_id: authInstId, titre: titre.trim(), contenu, type, membre_id: membre.membreId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "note_creee",
    cibleTable: "notes",
    cibleId: data.id,
    details: { titre: titre.trim() },
    req,
  });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  // Modification réservée à l'auteur ou à un admin — lecture ouverte à
  // toute l'équipe, mais écriture protégée (décision Bryan/CEO).
  const { data: existante } = await sb.from("notes").select("membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existante) return NextResponse.json({ error: "Note introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && existante.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez modifier que les notes que vous avez créées" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.titre === "string" && body.titre.trim()) updates.titre = body.titre.trim();
  if (typeof body?.contenu === "string") updates.contenu = body.contenu;
  if (TYPE_VALUES.includes(body?.type)) updates.type = body.type;

  const { data, error } = await sb
    .from("notes")
    .update(updates)
    .eq("id", id)
    .eq("institution_id", authInstId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Note introuvable pour cette institution" }, { status: 404 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "note_modifiee",
    cibleTable: "notes",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: existante } = await sb.from("notes").select("membre_id,titre").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existante) return NextResponse.json({ error: "Note introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && existante.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez supprimer que les notes que vous avez créées" }, { status: 403 });
  }

  const { error } = await sb.from("notes").delete().eq("id", id).eq("institution_id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "note_supprimee",
    cibleTable: "notes",
    cibleId: id,
    details: { titre: existante.titre },
    req,
  });

  return NextResponse.json({ ok: true });
}
