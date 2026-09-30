import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Contourne RLS via service role — preparations_semaine n'a volontairement
// aucune policy publique (voir migration 20260926000001), accès
// exclusivement via cette route. Espace strictement personnel au membre
// authentifié : jamais un autre membre_id que celui du JWT, même pour un
// admin (contrairement à taches/route.ts où "chacun ne gère que le sien"
// admet une exception admin — ici, pas d'exception, "Ma semaine" n'est pas
// un domaine métier supervisable).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const STATUTS = ["en_preparation", "active", "terminee"] as const;
const MAX_PRIORITES = 3;

// Guinée = UTC+0 toute l'année (même hypothèse documentée que le job
// nocturne Clock In Shift) — lundi ISO de la semaine contenant `date`.
function lundiDeLaSemaine(date: Date): string {
  const jour = date.getUTCDay(); // 0=dimanche..6=samedi
  const decalage = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + decalage));
  return lundi.toISOString().slice(0, 10);
}

function parsePriorites(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_PRIORITES) return null;
  const items: string[] = [];
  for (const it of input) {
    if (typeof it !== "string") return null;
    const trimmed = it.trim();
    if (trimmed) items.push(trimmed);
  }
  return items;
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "ma-semaine") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const semaineDebut = searchParams.get("semaine_debut") || lundiDeLaSemaine(new Date());

  const { data, error } = await sb
    .from("preparations_semaine")
    .select("id,semaine_debut,priorites,statut,bilan,created_at,termine_le")
    .eq("institution_id", membre.institutionId)
    .eq("membre_id", membre.membreId)
    .eq("semaine_debut", semaineDebut)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ preparation: data ?? { semaine_debut: semaineDebut, priorites: [], statut: "en_preparation", bilan: null } });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "ma-semaine") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const semaineDebut = typeof body?.semaine_debut === "string" ? body.semaine_debut : lundiDeLaSemaine(new Date());
  const priorites = body?.priorites !== undefined ? parsePriorites(body.priorites) : [];
  if (priorites === null) return NextResponse.json({ error: "priorites invalide (3 maximum)" }, { status: 400 });

  const { data, error } = await sb
    .from("preparations_semaine")
    .upsert(
      { institution_id: membre.institutionId, membre_id: membre.membreId, semaine_debut: semaineDebut, priorites },
      { onConflict: "membre_id,semaine_debut" }
    )
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "preparation_semaine_creee",
    cibleTable: "preparations_semaine",
    cibleId: data.id,
    details: { semaine_debut: semaineDebut },
    req,
  });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "ma-semaine") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  // Espace strictement personnel — jamais d'exception admin ici (voir
  // commentaire en tête de fichier).
  const { data: existante } = await sb.from("preparations_semaine").select("membre_id").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!existante) return NextResponse.json({ error: "Préparation introuvable pour cette institution" }, { status: 404 });
  if (existante.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez modifier que votre propre préparation de semaine" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (body?.priorites !== undefined) {
    const priorites = parsePriorites(body.priorites);
    if (!priorites) return NextResponse.json({ error: "priorites invalide (3 maximum)" }, { status: 400 });
    updates.priorites = priorites;
  }
  if (STATUTS.includes(body?.statut)) {
    updates.statut = body.statut;
    if (body.statut === "terminee") updates.termine_le = new Date().toISOString();
  }
  if (body?.bilan !== undefined) {
    if (typeof body.bilan !== "object" || body.bilan === null || Array.isArray(body.bilan)) {
      return NextResponse.json({ error: "bilan invalide" }, { status: 400 });
    }
    updates.bilan = body.bilan;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Aucune modification fournie" }, { status: 400 });

  const { error } = await sb.from("preparations_semaine").update(updates).eq("id", id).eq("institution_id", membre.institutionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "preparation_semaine_modifiee",
    cibleTable: "preparations_semaine",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
