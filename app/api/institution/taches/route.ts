import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Contourne RLS via service role — taches n'a volontairement aucune policy
// publique (voir migration 20260713000001), accès exclusivement via cette
// route. institution_id toujours dérivé du JWT, jamais du client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PRIORITES = ["basse", "normale", "haute"] as const;
const STATUTS = ["a_faire", "en_cours", "termine"] as const;

type ChecklistItem = { label: string; fait: boolean };

function parseChecklist(input: unknown): ChecklistItem[] | null {
  if (!Array.isArray(input)) return null;
  const items: ChecklistItem[] = [];
  for (const it of input) {
    if (typeof it !== "object" || it === null) return null;
    const label = (it as Record<string, unknown>).label;
    const fait = (it as Record<string, unknown>).fait;
    if (typeof label !== "string" || typeof fait !== "boolean") return null;
    items.push({ label, fait });
  }
  return items;
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);
  const statut = searchParams.get("statut");
  const projetId = searchParams.get("projet_id");
  let query = sb
    .from("taches")
    .select("id,titre,description,priorite,statut,echeance,checklist,citoyen_id,rdv_id,membre_id,cree_par_membre_id,projet_id,created_at,updated_at")
    .eq("institution_id", authInstId)
    .order("echeance", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (statut && (STATUTS as readonly string[]).includes(statut)) query = query.eq("statut", statut);
  // V3 Projets (20/09/2026, validé avec Bryan) — "même donnée, deux
  // contextes" (item 11) : filtre additif, aucun changement pour les
  // appelants existants (TachesSection.tsx n'envoie jamais ce paramètre).
  if (projetId) query = query.eq("projet_id", projetId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ taches: data ?? [] });
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
  const priorite = PRIORITES.includes(body?.priorite) ? body.priorite : "normale";
  const echeance = typeof body?.echeance === "string" ? body.echeance : null;
  const description = typeof body?.description === "string" ? body.description : null;
  const citoyenId = typeof body?.citoyen_id === "string" ? body.citoyen_id : null;
  const rdvId = typeof body?.rdv_id === "string" ? body.rdv_id : null;
  const membreAssigneId = typeof body?.membre_id === "string" ? body.membre_id : null;
  const projetId = typeof body?.projet_id === "string" ? body.projet_id : null;
  let checklist: ChecklistItem[] = [];
  if (body?.checklist !== undefined) {
    const parsed = parseChecklist(body.checklist);
    if (!parsed) return NextResponse.json({ error: "checklist invalide" }, { status: 400 });
    checklist = parsed;
  }

  if (citoyenId) {
    const { data: rdvExists } = await sb.from("rdv").select("id").eq("institution_id", authInstId).eq("citoyen_id", citoyenId).limit(1).maybeSingle();
    if (!rdvExists) return NextResponse.json({ error: "Client introuvable pour cette institution" }, { status: 404 });
  }
  if (rdvId) {
    const { data: rdvExists } = await sb.from("rdv").select("id").eq("institution_id", authInstId).eq("id", rdvId).maybeSingle();
    if (!rdvExists) return NextResponse.json({ error: "RDV introuvable pour cette institution" }, { status: 404 });
  }
  if (membreAssigneId) {
    const { data: membreExists } = await sb.from("institution_membres").select("id").eq("institution_id", authInstId).eq("id", membreAssigneId).maybeSingle();
    if (!membreExists) return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
  }
  if (projetId) {
    const { data: projetExists } = await sb.from("projets").select("id").eq("institution_id", authInstId).eq("id", projetId).maybeSingle();
    if (!projetExists) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("taches")
    .insert({ institution_id: authInstId, titre: titre.trim(), description, priorite, echeance, checklist, citoyen_id: citoyenId, rdv_id: rdvId, membre_id: membreAssigneId, projet_id: projetId, cree_par_membre_id: membre.membreId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "tache_creee",
    cibleTable: "taches",
    cibleId: data.id,
    details: { titre: titre.trim() },
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

  // Permissions par rôle : "chacun ne gère que le sien" — un non-admin ne
  // peut modifier que ce qu'il a créé ou ce qui lui est assigné.
  const { data: existante } = await sb.from("taches").select("cree_par_membre_id,membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existante) return NextResponse.json({ error: "Tâche introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && existante.cree_par_membre_id !== membre.membreId && existante.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez modifier que les tâches que vous avez créées ou qui vous sont assignées" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.titre === "string" && body.titre.trim()) updates.titre = body.titre.trim();
  if (typeof body?.description === "string") updates.description = body.description;
  if (PRIORITES.includes(body?.priorite)) updates.priorite = body.priorite;
  if (STATUTS.includes(body?.statut)) updates.statut = body.statut;
  if (typeof body?.echeance === "string" || body?.echeance === null) updates.echeance = body.echeance;
  if (body?.checklist !== undefined) {
    const checklist = parseChecklist(body.checklist);
    if (!checklist) return NextResponse.json({ error: "checklist invalide" }, { status: 400 });
    updates.checklist = checklist;
  }
  if (typeof body?.membre_id === "string" || body?.membre_id === null) {
    if (typeof body.membre_id === "string") {
      const { data: membreExists } = await sb.from("institution_membres").select("id").eq("institution_id", authInstId).eq("id", body.membre_id).maybeSingle();
      if (!membreExists) return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
    }
    updates.membre_id = body.membre_id;
  }
  if (typeof body?.projet_id === "string" || body?.projet_id === null) {
    if (typeof body.projet_id === "string") {
      const { data: projetExists } = await sb.from("projets").select("id").eq("institution_id", authInstId).eq("id", body.projet_id).maybeSingle();
      if (!projetExists) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });
    }
    updates.projet_id = body.projet_id;
  }

  const { data, error } = await sb
    .from("taches")
    .update(updates)
    .eq("id", id)
    .eq("institution_id", authInstId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Tâche introuvable pour cette institution" }, { status: 404 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "tache_modifiee",
    cibleTable: "taches",
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

  const { data: existante } = await sb.from("taches").select("cree_par_membre_id,membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existante) return NextResponse.json({ error: "Tâche introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && existante.cree_par_membre_id !== membre.membreId && existante.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez supprimer que les tâches que vous avez créées ou qui vous sont assignées" }, { status: 403 });
  }

  const { error } = await sb.from("taches").delete().eq("id", id).eq("institution_id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "tache_supprimee",
    cibleTable: "taches",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
