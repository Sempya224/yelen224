import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Contourne RLS via service role — notes_client_entrees n'a aucune
// policy publique (migration 20260719000001), même pattern que le
// reste de ce dossier. institution_id vient toujours du JWT vérifié.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TYPES = ["privee", "publique", "commentaire", "observation", "compte_rendu"] as const;
type TypeNote = (typeof TYPES)[number];

async function citoyenAppartientInstitution(institutionId: string, citoyenId: string): Promise<boolean> {
  const { data } = await sb
    .from("rdv")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("citoyen_id", citoyenId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "mes-clients") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);
  const citoyenId = searchParams.get("citoyen_id");
  if (!citoyenId) return NextResponse.json({ error: "citoyen_id requis" }, { status: 400 });

  if (!(await citoyenAppartientInstitution(authInstId, citoyenId))) {
    return NextResponse.json({ error: "Client introuvable pour cette institution" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("notes_client_entrees")
    .select("id,type,contenu,created_at,auteur_membre_id")
    .eq("institution_id", authInstId)
    .eq("citoyen_id", citoyenId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Une note "privee" n'est visible que par son auteur — même un admin
  // ne voit pas celle d'un autre membre.
  const visibles = (data ?? []).filter((n) => n.type !== "privee" || n.auteur_membre_id === membre.membreId);

  const auteurIds = [...new Set(visibles.map((n) => n.auteur_membre_id).filter(Boolean))];
  const { data: membresD } = auteurIds.length
    ? await sb.from("institution_membres").select("id,prenom,nom").in("id", auteurIds)
    : { data: [] };
  const nomMap = new Map((membresD ?? []).map((m) => [m.id, `${m.prenom} ${m.nom}`]));

  const notes = visibles.map((n) => ({
    id: n.id,
    type: n.type,
    contenu: n.contenu,
    created_at: n.created_at,
    auteur_nom: nomMap.get(n.auteur_membre_id) ?? "Inconnu",
    auteur_moi: n.auteur_membre_id === membre.membreId,
  }));

  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "mes_clients.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const citoyenId = body?.citoyen_id;
  const type = body?.type;
  const contenu = typeof body?.contenu === "string" ? body.contenu.trim() : "";
  if (typeof citoyenId !== "string" || !TYPES.includes(type) || !contenu) {
    return NextResponse.json({ error: "citoyen_id, type valide et contenu requis" }, { status: 400 });
  }

  if (!(await citoyenAppartientInstitution(authInstId, citoyenId))) {
    return NextResponse.json({ error: "Client introuvable pour cette institution" }, { status: 404 });
  }

  const { error } = await sb.from("notes_client_entrees").insert({
    institution_id: authInstId,
    citoyen_id: citoyenId,
    auteur_membre_id: membre.membreId,
    type: type as TypeNote,
    contenu,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "note_client_ajoutee",
    cibleTable: "notes_client_entrees",
    cibleId: citoyenId,
    details: { type },
    req,
  });

  return NextResponse.json({ ok: true });
}
