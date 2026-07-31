import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Contourne RLS via service role — institution utilise un JWT custom, pas
// de session Supabase Auth, même pattern que messages/route.ts.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

// GET ?compte=1 : uniquement le nombre de questions non répondues (badge
// en-tête). GET sans paramètre : liste complète pour l'écran "Questions
// des clients" (Mon compte).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);

  if (searchParams.get("compte") === "1") {
    const { count, error } = await sb
      .from("questions_institution")
      .select("id", { count: "exact", head: true })
      .eq("institution_id", authInstId)
      .is("reponse", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ non_repondues: count ?? 0 });
  }

  const { data, error } = await sb
    .from("questions_institution")
    .select("id, citoyen_id, question, reponse, reponse_le, lu, created_at")
    .eq("institution_id", authInstId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const citoyenIds = [...new Set((data ?? []).map(q => q.citoyen_id))];
  const { data: users } = citoyenIds.length
    ? await sb.from("users").select("id, nom, prenom, phone").in("id", citoyenIds)
    : { data: [] as { id: string; nom: string | null; prenom: string | null; phone: string | null }[] };
  const uMap = new Map((users ?? []).map(u => [u.id, u]));

  const questions = (data ?? []).map(q => ({ ...q, citoyen_nom: buildNom(uMap.get(q.citoyen_id)) }));

  return NextResponse.json({ questions });
}

// PATCH : répondre à une question. reponse_le/lu mis à jour côté serveur,
// jamais fournis par le client.
export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "questions.repondre")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  const reponse = typeof body?.reponse === "string" ? body.reponse.trim() : "";
  if (typeof id !== "string" || !reponse) {
    return NextResponse.json({ error: "id et reponse requis" }, { status: 400 });
  }

  const { data: question } = await sb.from("questions_institution").select("id, institution_id, citoyen_id").eq("id", id).maybeSingle();
  if (!question || question.institution_id !== authInstId) {
    return NextResponse.json({ error: "Question introuvable pour cette institution" }, { status: 404 });
  }

  const { error } = await sb
    .from("questions_institution")
    .update({ reponse, reponse_le: new Date().toISOString(), lu: true })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "question_repondue",
    cibleTable: "questions_institution",
    cibleId: id,
    details: { citoyen_id: question.citoyen_id },
    req,
  });

  return NextResponse.json({ ok: true });
}
