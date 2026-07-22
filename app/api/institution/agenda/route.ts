import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Contourne RLS via service role — evenements_agenda n'a aucune policy
// publique (migration 20260713000001), accès exclusivement via cette route.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TYPES = ["rappel", "reunion", "bloque", "autre"] as const;
const RECURRENCES = ["aucune", "quotidien", "hebdomadaire", "mensuel"] as const;

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

// Génère les dates d'occurrence d'un événement (récurrent ou non) qui
// tombent dans la fenêtre [dateFrom, dateTo] demandée par le calendrier.
// Aucune occurrence n'est matérialisée en base — recalculée à chaque GET.
// Garde anti-boucle (400) : largement suffisant pour une fenêtre semaine
// (7 jours) ou mois (42 jours), même en quotidien.
function genererOccurrences(dateDebut: string, recurrence: string, recurrenceFin: string | null, dateFrom: string, dateTo: string): string[] {
  if (recurrence === "aucune") {
    return dateDebut >= dateFrom && dateDebut <= dateTo ? [dateDebut] : [];
  }
  const borneSup = recurrenceFin && recurrenceFin < dateTo ? recurrenceFin : dateTo;
  const out: string[] = [];
  const cur = new Date(`${dateDebut}T00:00:00Z`);
  const finD = new Date(`${borneSup}T00:00:00Z`);
  const fromD = new Date(`${dateFrom}T00:00:00Z`);
  let guard = 0;
  while (cur.getTime() <= finD.getTime() && guard < 400) {
    guard++;
    if (cur.getTime() >= fromD.getTime()) out.push(cur.toISOString().slice(0, 10));
    if (recurrence === "quotidien") cur.setUTCDate(cur.getUTCDate() + 1);
    else if (recurrence === "hebdomadaire") cur.setUTCDate(cur.getUTCDate() + 7);
    else if (recurrence === "mensuel") cur.setUTCMonth(cur.getUTCMonth() + 1);
    else break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  if (!dateFrom || !dateTo) return NextResponse.json({ error: "date_from et date_to requis" }, { status: 400 });

  const [{ data: evenementsRaw, error: evErr }, { data: rdvRaw, error: rdvErr }] = await Promise.all([
    // Pas de filtre de date ici : un événement récurrent créé avant
    // dateFrom doit quand même générer des occurrences dans la fenêtre
    // demandée (voir genererOccurrences ci-dessus).
    sb.from("evenements_agenda").select("id,titre,description,type,date,heure_debut,heure_fin,membre_id,cree_par_membre_id,recurrence,recurrence_fin,created_at")
      .eq("institution_id", authInstId).order("date", { ascending: true }),
    sb.from("rdv").select("id,objet,date_rdv,heure_rdv,statut,citoyen_id")
      .eq("institution_id", authInstId).gte("date_rdv", dateFrom).lte("date_rdv", dateTo).order("date_rdv", { ascending: true }),
  ]);
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });

  const citoyenIds = [...new Set((rdvRaw ?? []).map(r => r.citoyen_id).filter(Boolean))];
  const { data: usersD } = citoyenIds.length
    ? await sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds)
    : { data: [] as { id: string; nom: string | null; prenom: string | null; phone: string | null }[] };
  const uMap = new Map((usersD ?? []).map(u => [u.id, u]));

  // citoyen_phone ajouté pour le popup "Détail du RDV" de l'Agenda (bouton
  // appeler/copier, même pattern que rdv-historique/route.ts).
  const rdv = (rdvRaw ?? []).map(r => ({ ...r, citoyen_nom: buildNom(uMap.get(r.citoyen_id)), citoyen_phone: uMap.get(r.citoyen_id)?.phone ?? null }));

  const evenements = (evenementsRaw ?? []).flatMap(ev =>
    genererOccurrences(ev.date, ev.recurrence, ev.recurrence_fin, dateFrom, dateTo).map(occDate => ({ ...ev, date: occDate, date_originale: ev.date }))
  );

  return NextResponse.json({ evenements, rdv });
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
  const date = body?.date;
  if (typeof titre !== "string" || !titre.trim()) return NextResponse.json({ error: "Titre requis" }, { status: 400 });
  if (typeof date !== "string") return NextResponse.json({ error: "date requise" }, { status: 400 });
  const type = TYPES.includes(body?.type) ? body.type : "rappel";
  const description = typeof body?.description === "string" ? body.description : null;
  const heureDebut = typeof body?.heure_debut === "string" ? body.heure_debut : null;
  const heureFin = typeof body?.heure_fin === "string" ? body.heure_fin : null;
  const membreAssigneId = typeof body?.membre_id === "string" ? body.membre_id : null;
  const recurrence = RECURRENCES.includes(body?.recurrence) ? body.recurrence : "aucune";
  const recurrenceFin = typeof body?.recurrence_fin === "string" ? body.recurrence_fin : null;

  if (membreAssigneId) {
    const { data: membreExists } = await sb.from("institution_membres").select("id").eq("institution_id", authInstId).eq("id", membreAssigneId).maybeSingle();
    if (!membreExists) return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("evenements_agenda")
    .insert({ institution_id: authInstId, titre: titre.trim(), description, type, date, heure_debut: heureDebut, heure_fin: heureFin, membre_id: membreAssigneId, cree_par_membre_id: membre.membreId, recurrence, recurrence_fin: recurrence === "aucune" ? null : recurrenceFin })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "evenement_cree",
    cibleTable: "evenements_agenda",
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
  const { data: existant } = await sb.from("evenements_agenda").select("cree_par_membre_id,membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existant) return NextResponse.json({ error: "Événement introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && existant.cree_par_membre_id !== membre.membreId && existant.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez modifier que les événements que vous avez créés ou qui vous sont assignés" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body?.titre === "string" && body.titre.trim()) updates.titre = body.titre.trim();
  if (typeof body?.description === "string") updates.description = body.description;
  if (TYPES.includes(body?.type)) updates.type = body.type;
  if (typeof body?.date === "string") updates.date = body.date;
  if (typeof body?.heure_debut === "string" || body?.heure_debut === null) updates.heure_debut = body.heure_debut;
  if (typeof body?.heure_fin === "string" || body?.heure_fin === null) updates.heure_fin = body.heure_fin;
  if (typeof body?.membre_id === "string" || body?.membre_id === null) {
    if (typeof body.membre_id === "string") {
      const { data: membreExists } = await sb.from("institution_membres").select("id").eq("institution_id", authInstId).eq("id", body.membre_id).maybeSingle();
      if (!membreExists) return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
    }
    updates.membre_id = body.membre_id;
  }
  if (RECURRENCES.includes(body?.recurrence)) updates.recurrence = body.recurrence;
  if (typeof body?.recurrence_fin === "string" || body?.recurrence_fin === null) updates.recurrence_fin = body.recurrence_fin;
  if (updates.recurrence === "aucune") updates.recurrence_fin = null;

  const { data, error } = await sb
    .from("evenements_agenda")
    .update(updates)
    .eq("id", id)
    .eq("institution_id", authInstId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Événement introuvable pour cette institution" }, { status: 404 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "evenement_modifie",
    cibleTable: "evenements_agenda",
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

  const { data: existant } = await sb.from("evenements_agenda").select("cree_par_membre_id,membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!existant) return NextResponse.json({ error: "Événement introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && existant.cree_par_membre_id !== membre.membreId && existant.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez supprimer que les événements que vous avez créés ou qui vous sont assignés" }, { status: 403 });
  }

  const { error } = await sb.from("evenements_agenda").delete().eq("id", id).eq("institution_id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "evenement_supprime",
    cibleTable: "evenements_agenda",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
