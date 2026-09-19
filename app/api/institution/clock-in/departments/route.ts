import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Même pattern que app/api/institution/clock-in/employees/route.ts.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.read_full")) {
    return NextResponse.json({ error: "Accès réservé à ce module" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("departments")
    .select("id,nom,description,actif,responsable_id,created_at")
    .eq("institution_id", membre.institutionId)
    .order("nom", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ departments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const nom = body?.nom;
  if (typeof nom !== "string" || !nom.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });

  const { data: existant } = await sb
    .from("departments")
    .select("id")
    .eq("institution_id", membre.institutionId)
    .eq("nom", nom.trim())
    .maybeSingle();
  if (existant) return NextResponse.json({ error: "Ce département existe déjà" }, { status: 409 });

  const { data, error } = await sb
    .from("departments")
    .insert({
      institution_id: membre.institutionId,
      nom: nom.trim(),
      description: typeof body?.description === "string" && body.description.trim() ? body.description.trim() : null,
      responsable_id: typeof body?.responsableId === "string" ? body.responsableId : null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "departement_cree",
    cibleTable: "departments",
    cibleId: data.id,
    details: { nom: nom.trim() },
    req,
  });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("departments").select("id,institution_id").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Département introuvable pour cette institution" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.nom === "string" && body.nom.trim()) updates.nom = body.nom.trim();
  if (typeof body?.description === "string") updates.description = body.description.trim() || null;
  if (typeof body?.actif === "boolean") updates.actif = body.actif;
  if (typeof body?.responsableId === "string" || body?.responsableId === null) updates.responsable_id = body.responsableId;

  const { error } = await sb.from("departments").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "departement_modifie",
    cibleTable: "departments",
    cibleId: id,
    details: { champs: Object.keys(updates).filter((k) => k !== "updated_at") },
    req,
  });

  return NextResponse.json({ ok: true });
}

// Suppression réelle possible : employees.department_id est ON DELETE SET
// NULL (migration 20260805000002) — supprimer un département ne bloque
// jamais, ça détache juste les employés concernés.
export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("departments").select("id,institution_id,nom").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Département introuvable pour cette institution" }, { status: 404 });
  }

  const { error } = await sb.from("departments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "departement_supprime",
    cibleTable: "departments",
    cibleId: id,
    details: { nom: cible.nom },
    req,
  });

  return NextResponse.json({ ok: true });
}
