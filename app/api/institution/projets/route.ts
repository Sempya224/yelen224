import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { STATUTS_PROJET, PRIORITES_PROJET, SANTES_PROJET } from "@/lib/projetsNotes";

// Contourne RLS via service role — projets n'a aucune policy publique
// (migration 20260720000001), accès exclusivement via cette route.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const STATUT_VALUES = STATUTS_PROJET.map((s) => s.value);
const PRIORITE_VALUES = PRIORITES_PROJET.map((p) => p.value);
const SANTE_VALUES = SANTES_PROJET.map((s) => s.value);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { data, error } = await sb
    .from("projets")
    .select("id,nom,description,responsable_membre_id,date_debut,date_fin_prevue,statut,priorite,sante,cree_par_membre_id,created_at,updated_at")
    .eq("institution_id", authInstId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "espace_travail.write_projet")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const nom = body?.nom;
  if (typeof nom !== "string" || !nom.trim()) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }
  const description = typeof body?.description === "string" ? body.description : null;
  const dateDebut = typeof body?.date_debut === "string" ? body.date_debut : null;
  const dateFinPrevue = typeof body?.date_fin_prevue === "string" ? body.date_fin_prevue : null;
  const statut = STATUT_VALUES.includes(body?.statut) ? body.statut : "a_venir";
  const priorite = PRIORITE_VALUES.includes(body?.priorite) ? body.priorite : "normale";
  const responsableMembreId = typeof body?.responsable_membre_id === "string" ? body.responsable_membre_id : null;

  if (responsableMembreId) {
    const { data: membreExists } = await sb.from("institution_membres").select("id").eq("institution_id", authInstId).eq("id", responsableMembreId).maybeSingle();
    if (!membreExists) return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("projets")
    .insert({ institution_id: authInstId, nom: nom.trim(), description, responsable_membre_id: responsableMembreId, date_debut: dateDebut, date_fin_prevue: dateFinPrevue, statut, priorite, cree_par_membre_id: membre.membreId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "projet_cree",
    cibleTable: "projets",
    cibleId: data.id,
    details: { nom: nom.trim() },
    req,
  });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  // Permissions par rôle : "chacun ne gère que le sien" — même règle que
  // taches/route.ts. Un non-admin ne peut modifier que ce qu'il a créé ou
  // le projet dont il est responsable.
  const { data: existant } = await sb.from("projets").select("cree_par_membre_id,responsable_membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existant) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && existant.cree_par_membre_id !== membre.membreId && existant.responsable_membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez modifier que les projets que vous avez créés ou dont vous êtes responsable" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.nom === "string" && body.nom.trim()) updates.nom = body.nom.trim();
  if (typeof body?.description === "string" || body?.description === null) updates.description = body.description;
  if (typeof body?.date_debut === "string" || body?.date_debut === null) updates.date_debut = body.date_debut;
  if (typeof body?.date_fin_prevue === "string" || body?.date_fin_prevue === null) updates.date_fin_prevue = body.date_fin_prevue;
  if (STATUT_VALUES.includes(body?.statut)) updates.statut = body.statut;
  if (PRIORITE_VALUES.includes(body?.priorite)) updates.priorite = body.priorite;
  // sante : jamais calculée, renseignée explicitement (ou effacée avec
  // null = "non renseignée") — item 10 du brief.
  if (SANTE_VALUES.includes(body?.sante) || body?.sante === null) updates.sante = body.sante;
  if (typeof body?.responsable_membre_id === "string" || body?.responsable_membre_id === null) {
    if (typeof body.responsable_membre_id === "string") {
      const { data: membreExists } = await sb.from("institution_membres").select("id").eq("institution_id", authInstId).eq("id", body.responsable_membre_id).maybeSingle();
      if (!membreExists) return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
    }
    updates.responsable_membre_id = body.responsable_membre_id;
  }

  const { data, error } = await sb
    .from("projets")
    .update(updates)
    .eq("id", id)
    .eq("institution_id", authInstId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "projet_modifie",
    cibleTable: "projets",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: existant } = await sb.from("projets").select("cree_par_membre_id,responsable_membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existant) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && existant.cree_par_membre_id !== membre.membreId && existant.responsable_membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez supprimer que les projets que vous avez créés ou dont vous êtes responsable" }, { status: 403 });
  }

  const { error } = await sb.from("projets").delete().eq("id", id).eq("institution_id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "projet_supprime",
    cibleTable: "projets",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
