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
  // V3 Projets/Notes (20/09/2026, validé avec Bryan) : filtre additif
  // projet_id, aucun changement pour les appelants existants.
  const projetId = new URL(req.url).searchParams.get("projet_id");
  let query = sb
    .from("notes")
    .select("id,titre,contenu,type,tags,projet_id,document_ids,membre_id,created_at,updated_at")
    .eq("institution_id", authInstId)
    .order("updated_at", { ascending: false });
  if (projetId) query = query.eq("projet_id", projetId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

async function validateDocumentIds(authInstId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const { data } = await sb.from("documents_travail").select("id").eq("institution_id", authInstId).in("id", ids);
  return (data?.length ?? 0) === ids.length;
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
  const tags = Array.isArray(body?.tags) && body.tags.every((t: unknown) => typeof t === "string") ? body.tags : [];
  const projetId = typeof body?.projet_id === "string" ? body.projet_id : null;
  const documentIds = Array.isArray(body?.document_ids) && body.document_ids.every((d: unknown) => typeof d === "string") ? body.document_ids : [];

  if (projetId) {
    const { data: projetExists } = await sb.from("projets").select("id").eq("institution_id", authInstId).eq("id", projetId).maybeSingle();
    if (!projetExists) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });
  }
  if (!(await validateDocumentIds(authInstId, documentIds))) {
    return NextResponse.json({ error: "Un ou plusieurs documents introuvables pour cette institution" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("notes")
    .insert({ institution_id: authInstId, titre: titre.trim(), contenu, type, tags, projet_id: projetId, document_ids: documentIds, membre_id: membre.membreId })
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
  // Gate manquant trouvé à l'audit V3 (20/09/2026) — présent sur GET/POST
  // mais pas ici : un membre sans accès à l'Espace de travail pouvait
  // théoriquement modifier une note s'il en connaissait l'id et en était
  // l'auteur. Corrigé, même garde que partout ailleurs dans ce fichier.
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
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
  if (Array.isArray(body?.tags) && body.tags.every((t: unknown) => typeof t === "string")) updates.tags = body.tags;
  if (typeof body?.projet_id === "string" || body?.projet_id === null) {
    if (typeof body.projet_id === "string") {
      const { data: projetExists } = await sb.from("projets").select("id").eq("institution_id", authInstId).eq("id", body.projet_id).maybeSingle();
      if (!projetExists) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });
    }
    updates.projet_id = body.projet_id;
  }
  if (Array.isArray(body?.document_ids) && body.document_ids.every((d: unknown) => typeof d === "string")) {
    if (!(await validateDocumentIds(authInstId, body.document_ids))) {
      return NextResponse.json({ error: "Un ou plusieurs documents introuvables pour cette institution" }, { status: 404 });
    }
    updates.document_ids = body.document_ids;
  }

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
  // Même correctif que PATCH (gate manquant trouvé à l'audit V3, 20/09/2026).
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
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
