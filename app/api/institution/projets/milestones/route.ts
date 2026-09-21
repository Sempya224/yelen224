import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { STATUTS_MILESTONE } from "@/lib/projetsNotes";

// V3 Projets (20/09/2026, validé avec Bryan) — table absente jusqu'ici
// (migration 20260920000001). Même convention que le reste de l'Espace de
// travail : RLS activé, aucune policy publique, accès exclusivement via
// service_role dans cette route.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const STATUT_VALUES = STATUTS_MILESTONE.map((s) => s.value);

// Une milestone n'a pas son propre "responsable" — permission dérivée du
// projet parent (créateur ou responsable du projet, ou admin), même
// principe que taches/documents_travail vis-à-vis de leur propriétaire.
async function peutGererProjet(authInstId: string, projetId: string, membre: { role: string; membreId: string | null }): Promise<boolean> {
  if (membre.role === "admin") return true;
  const { data: projet } = await sb.from("projets").select("cree_par_membre_id,responsable_membre_id").eq("id", projetId).eq("institution_id", authInstId).maybeSingle();
  if (!projet) return false;
  return projet.cree_par_membre_id === membre.membreId || projet.responsable_membre_id === membre.membreId;
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const projetId = new URL(req.url).searchParams.get("projet_id");
  if (!projetId) return NextResponse.json({ error: "projet_id requis" }, { status: 400 });

  const { data, error } = await sb
    .from("projet_milestones")
    .select("id,projet_id,titre,statut,echeance,ordre,cree_par_membre_id,created_at")
    .eq("institution_id", authInstId)
    .eq("projet_id", projetId)
    .order("ordre", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const projetId = body?.projet_id;
  const titre = body?.titre;
  if (typeof projetId !== "string") return NextResponse.json({ error: "projet_id requis" }, { status: 400 });
  if (typeof titre !== "string" || !titre.trim()) return NextResponse.json({ error: "Titre requis" }, { status: 400 });

  if (!(await peutGererProjet(authInstId, projetId, membre))) {
    return NextResponse.json({ error: "Vous ne pouvez ajouter une milestone qu'aux projets que vous avez créés ou dont vous êtes responsable" }, { status: 403 });
  }

  const echeance = typeof body?.echeance === "string" ? body.echeance : null;
  const { count } = await sb.from("projet_milestones").select("id", { count: "exact", head: true }).eq("projet_id", projetId);
  const ordre = typeof body?.ordre === "number" ? body.ordre : (count ?? 0);

  const { data, error } = await sb
    .from("projet_milestones")
    .insert({ institution_id: authInstId, projet_id: projetId, titre: titre.trim(), echeance, ordre, cree_par_membre_id: membre.membreId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "milestone_creee",
    cibleTable: "projet_milestones",
    cibleId: data.id,
    details: { titre: titre.trim(), projet_id: projetId },
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

  const { data: existante } = await sb.from("projet_milestones").select("projet_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existante) return NextResponse.json({ error: "Milestone introuvable pour cette institution" }, { status: 404 });
  if (!(await peutGererProjet(authInstId, existante.projet_id, membre))) {
    return NextResponse.json({ error: "Vous ne pouvez modifier que les milestones des projets que vous gérez" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.titre === "string" && body.titre.trim()) updates.titre = body.titre.trim();
  if (STATUT_VALUES.includes(body?.statut)) updates.statut = body.statut;
  if (typeof body?.echeance === "string" || body?.echeance === null) updates.echeance = body.echeance;
  if (typeof body?.ordre === "number") updates.ordre = body.ordre;

  const { data, error } = await sb.from("projet_milestones").update(updates).eq("id", id).eq("institution_id", authInstId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Milestone introuvable pour cette institution" }, { status: 404 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "milestone_modifiee",
    cibleTable: "projet_milestones",
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

  const { data: existante } = await sb.from("projet_milestones").select("projet_id,titre").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existante) return NextResponse.json({ error: "Milestone introuvable pour cette institution" }, { status: 404 });
  if (!(await peutGererProjet(authInstId, existante.projet_id, membre))) {
    return NextResponse.json({ error: "Vous ne pouvez supprimer que les milestones des projets que vous gérez" }, { status: 403 });
  }

  const { error } = await sb.from("projet_milestones").delete().eq("id", id).eq("institution_id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "milestone_supprimee",
    cibleTable: "projet_milestones",
    cibleId: id,
    details: { titre: existante.titre },
    req,
  });

  return NextResponse.json({ ok: true });
}
