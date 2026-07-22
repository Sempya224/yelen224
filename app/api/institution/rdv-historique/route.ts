import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { envoyerNotification } from "@/lib/notifications";

// Contourne RLS via service role, même pattern que rdv-jour/route.ts —
// institution_id vient toujours du JWT vérifié, jamais du client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

// Libellé humain de la dernière action journalisée — même convention que
// lib/journalActivite.ts (action: "rdv_accepte", "rdv_confirme", ...).
const LABEL_ACTION: Record<string, string> = {
  rdv_accepte: "Accepté",
  rdv_confirme: "Présence confirmée",
  rdv_termine: "Marqué terminé",
  rdv_refuse: "Refusé",
  rdv_absent: "Marqué absent",
};

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rdv-historique") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const statut = searchParams.get("statut"); // "termine" | "annule" | "absent" | null (tous)
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  let query = sb
    .from("rdv")
    .select("id,objet,date_rdv,heure_rdv,statut,citoyen_id,notes,motif_annulation,presence_status,created_at,institution_id")
    .eq("institution_id", authInstId)
    .lte("date_rdv", dateTo || new Date().toISOString().slice(0, 10))
    .order("date_rdv", { ascending: false })
    .order("heure_rdv", { ascending: false });

  if (dateFrom) query = query.gte("date_rdv", dateFrom);
  // "absent" est un constat de présence (presence_status), jamais un statut
  // de cycle de vie (même règle que partout ailleurs cette session).
  if (statut === "absent") query = query.eq("presence_status", "absent");
  else if (statut) query = query.eq("statut", statut);

  const { data: rdvRaw, error: rdvErr } = await query;
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });

  if (!rdvRaw?.length) return NextResponse.json({ rdvs: [] });

  const citoyenIds = [...new Set(rdvRaw.map((r) => r.citoyen_id).filter(Boolean))];
  const { data: usersD } = await sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds);
  const uMap = new Map((usersD ?? []).map((u) => [u.id, u]));

  // Service payant éventuel — même rattachement par créneau que l'écran RDV.
  const { data: paidRaw } = await sb
    .from("paid_bookings")
    .select("date_rdv,heure_rdv,paid_services(nom,prix,duree_minutes)")
    .eq("institution_id", authInstId)
    .neq("statut", "annule");
  const paidMap = new Map<string, { nom: string; prix: number; duree_minutes: number }>();
  (paidRaw ?? []).forEach((b: any) => {
    if (!b.paid_services) return;
    paidMap.set(`${b.date_rdv}|${b.heure_rdv}`, b.paid_services);
  });

  // Traçabilité — dernière action journalisée pour ce RDV (Lots A-D :
  // rdv_accepte/rdv_confirme/rdv_termine/rdv_refuse/rdv_absent, "Agent" =
  // membre_nom réel). Une seule requête pour tous les RDV de la page.
  const rdvIds = rdvRaw.map((r) => r.id);
  const { data: journalRaw } = await sb
    .from("journal_activite")
    .select("cible_id,action,membre_nom,created_at")
    .eq("institution_id", authInstId)
    .eq("cible_table", "rdv")
    .in("cible_id", rdvIds)
    .order("created_at", { ascending: false });
  const traceMap = new Map<string, { action: string; membre_nom: string; created_at: string }>();
  (journalRaw ?? []).forEach((j) => { if (j.cible_id && !traceMap.has(j.cible_id)) traceMap.set(j.cible_id, j); });

  // Référence Yelen — YL-{année}-{MMJJ}-{séquence du jour, stable, calculée
  // sur TOUS les RDV de ce jour pour cette institution, pas seulement ceux
  // de la page filtrée, pour qu'elle ne change jamais selon les filtres.
  const datesUniques = [...new Set(rdvRaw.map((r) => r.date_rdv))];
  const rangMap = new Map<string, number>();
  for (const date of datesUniques) {
    const { data: jourRaw } = await sb
      .from("rdv").select("id,created_at")
      .eq("institution_id", authInstId).eq("date_rdv", date)
      .order("created_at", { ascending: true });
    (jourRaw ?? []).forEach((r, i) => rangMap.set(r.id, i + 1));
  }
  function reference(r: { id: string; date_rdv: string }): string {
    const rang = rangMap.get(r.id) ?? 1;
    const [y, m, d] = r.date_rdv.split("-");
    return `YL-${y}-${m}${d}-${String(rang).padStart(4, "0")}`;
  }

  let rdvs = rdvRaw.map((r) => {
    const u = uMap.get(r.citoyen_id);
    const paid = paidMap.get(`${r.date_rdv}|${r.heure_rdv}`);
    const trace = traceMap.get(r.id);
    return {
      ...r,
      citoyen_nom: buildNom(u), citoyen_phone: u?.phone ?? "",
      reference: reference(r),
      service_nom: paid?.nom ?? null, service_prix: paid?.prix ?? null,
      derniere_action: trace ? (LABEL_ACTION[trace.action] ?? trace.action) : null,
      agent_nom: trace?.membre_nom ?? null,
      derniere_action_le: trace?.created_at ?? null,
    };
  });

  if (q) {
    rdvs = rdvs.filter((r) =>
      r.citoyen_nom.toLowerCase().includes(q) ||
      r.citoyen_phone.includes(q) ||
      r.reference.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({ rdvs });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rdv-historique") !== "full") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const rdvId = body?.rdv_id;
  const notes = body?.notes;
  if (typeof rdvId !== "string" || typeof notes !== "string") {
    return NextResponse.json({ error: "rdv_id et notes requis" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("rdv")
    .update({ notes })
    .eq("id", rdvId)
    .eq("institution_id", authInstId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "RDV introuvable pour cette institution" }, { status: 404 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "suivi_rdv_modifie",
    cibleTable: "rdv",
    cibleId: rdvId,
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rdv-historique") !== "full") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const rdvId = body?.rdv_id;
  if (typeof rdvId !== "string") return NextResponse.json({ error: "rdv_id requis" }, { status: 400 });

  const { data: rdv, error: rdvErr } = await sb
    .from("rdv")
    .select("id,citoyen_id,objet,date_rdv,heure_rdv,institution:institutions!rdv_institution_id_fkey(name)")
    .eq("id", rdvId)
    .eq("institution_id", authInstId)
    .maybeSingle();
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });
  if (!rdv) return NextResponse.json({ error: "RDV introuvable pour cette institution" }, { status: 404 });

  const instName = (rdv.institution as unknown as { name: string } | null)?.name ?? "l'établissement";

  await envoyerNotification({
    destinataire_id: rdv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: rdv.id,
    type: "rappel_manuel",
    titre: "📅 Rappel de rendez-vous",
    message: `${instName} vous invite à reprendre rendez-vous${rdv.objet ? ` pour : ${rdv.objet}` : ""}.`,
  });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "rappel_envoye",
    cibleTable: "rdv",
    cibleId: rdvId,
    req,
  });

  return NextResponse.json({ ok: true });
}
