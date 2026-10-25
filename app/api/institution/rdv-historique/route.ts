import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { envoyerNotification } from "@/lib/notifications";
import { assemblerRdvHistorique, COLONNES_RDV_HISTORIQUE, type RdvBrut } from "@/lib/rdvHistorique";

// Contourne RLS via service role, même pattern que rdv-jour/route.ts —
// institution_id vient toujours du JWT vérifié, jamais du client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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
    .select(COLONNES_RDV_HISTORIQUE)
    .eq("institution_id", authInstId)
    .lte("date_rdv", dateTo || new Date().toISOString().slice(0, 10))
    .order("date_rdv", { ascending: false })
    .order("heure_rdv", { ascending: false })
    // Audit Lot 12 (07/08/2026) : aucune borne avant ce correctif — une
    // institution avec des années d'historique et sans date_from renvoyait
    // TOUT son historique rdv en une requête. Ordre déjà desc, donc ce
    // plafond garde les plus récents ; un date_from explicite reste non
    // borné par choix (l'utilisateur a demandé cette plage précisément).
    .limit(1000);

  if (dateFrom) query = query.gte("date_rdv", dateFrom);
  // "absent" est un constat de présence (presence_status), jamais un statut
  // de cycle de vie (même règle que partout ailleurs cette session).
  if (statut === "absent") query = query.eq("presence_status", "absent");
  else if (statut) query = query.eq("statut", statut);

  const { data: rdvRaw, error: rdvErr } = await query;
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });

  if (!rdvRaw?.length) return NextResponse.json({ rdvs: [] });

  // Assemblage partagé avec l'export serveur (lib/rdvHistorique.ts) : une seule logique.
  const assembles = await assemblerRdvHistorique(sb, authInstId, rdvRaw as unknown as RdvBrut[]);
  let rdvs = assembles.map((a) => a.ligne);

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
