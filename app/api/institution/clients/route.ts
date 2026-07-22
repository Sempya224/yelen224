import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Contourne RLS via service role — notes_clients n'a volontairement aucune
// policy publique (voir migration 20260712000003), accès exclusivement via
// cette route. institution_id vient toujours du JWT vérifié, jamais du
// client, pour empêcher une institution de lire/noter les clients d'une autre.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "mes-clients") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { data: rdvRaw, error: rdvErr } = await sb
    .from("rdv")
    .select("id,objet,date_rdv,heure_rdv,statut,citoyen_id,notes,qr_token,presence_status,presence_confirmed_at")
    .eq("institution_id", authInstId)
    .order("date_rdv", { ascending: false });
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });

  if (!rdvRaw?.length) return NextResponse.json({ clients: [] });

  const citoyenIds = [...new Set(rdvRaw.map((r) => r.citoyen_id).filter(Boolean))];

  const [{ data: usersD }, { data: notesD }, { data: avisD }, { data: signalementsD }, { data: bookingsD }, { data: tachesD }, { data: partageD }] = await Promise.all([
    sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds),
    sb.from("notes_clients").select("citoyen_id,note").eq("institution_id", authInstId).in("citoyen_id", citoyenIds),
    // brouillon=false — un avis non publié (Lot G, chantier Avis + Favoris
    // citoyen) ne doit jamais être visible côté institution.
    sb.from("avis").select("id,citoyen_id,note,commentaire,reponse_institution,reponse_le,created_at").eq("institution_id", authInstId).eq("brouillon", false).in("citoyen_id", citoyenIds),
    sb.from("signalements").select("citoyen_id,titre,motif,statut,created_at").eq("institution_id", authInstId).eq("type_signaleur", "citoyen").in("citoyen_id", citoyenIds),
    // paid_bookings n'a aucune policy publique (verrouillé volontairement,
    // migration 20260709000013) — lecture via service role uniquement,
    // même pattern que le reste de cette route. Jointure paid_services
    // pour le nom/prix affichés dans l'historique du client.
    sb.from("paid_bookings").select("confirmation_code,statut,paid_services(nom,prix)").eq("institution_id", authInstId).in("citoyen_id", citoyenIds),
    sb.from("taches").select("id,citoyen_id,titre,statut,created_at").eq("institution_id", authInstId).in("citoyen_id", citoyenIds),
    // Confidentialité citoyen (Lot B, migration 20260724000002) — absence
    // de ligne = valeurs par défaut de la table (true/true), même
    // comportement qu'avant ce lot pour un citoyen qui n'a jamais réglé
    // ses préférences.
    sb.from("citoyen_prefs_partage").select("citoyen_id,partage_historique_rdv,partage_historique_services").in("citoyen_id", citoyenIds),
  ]);

  const uMap = new Map((usersD ?? []).map((u) => [u.id, u]));
  const partageMap = new Map((partageD ?? []).map((p) => [p.citoyen_id, p]));
  const noteMap = new Map((notesD ?? []).map((n) => [n.citoyen_id, n.note as string]));

  type Avis = { id: string; note: number; commentaire: string; reponse_institution: string | null; reponse_le: string | null; created_at: string };
  const avisMap = new Map<string, Avis[]>();
  for (const a of avisD ?? []) {
    if (!avisMap.has(a.citoyen_id)) avisMap.set(a.citoyen_id, []);
    avisMap.get(a.citoyen_id)!.push({ id: a.id, note: a.note, commentaire: a.commentaire, reponse_institution: a.reponse_institution, reponse_le: a.reponse_le, created_at: a.created_at });
  }

  type Signalement = { titre: string; motif: string; statut: string; created_at: string };
  const signalementsMap = new Map<string, Signalement[]>();
  for (const s of signalementsD ?? []) {
    if (!signalementsMap.has(s.citoyen_id)) signalementsMap.set(s.citoyen_id, []);
    signalementsMap.get(s.citoyen_id)!.push({ titre: s.titre, motif: s.motif, statut: s.statut, created_at: s.created_at });
  }

  type Paiement = { service_nom: string; prix: number; statut: string };
  const bookingMap = new Map<string, Paiement>();
  for (const b of (bookingsD ?? []) as unknown as { confirmation_code: string; statut: string; paid_services: { nom: string; prix: number } | null }[]) {
    if (b.paid_services) bookingMap.set(b.confirmation_code, { service_nom: b.paid_services.nom, prix: b.paid_services.prix, statut: b.statut });
  }

  type Tache = { id: string; titre: string; statut: string; created_at: string };
  const tachesMap = new Map<string, Tache[]>();
  for (const t of tachesD ?? []) {
    if (!t.citoyen_id) continue;
    if (!tachesMap.has(t.citoyen_id)) tachesMap.set(t.citoyen_id, []);
    tachesMap.get(t.citoyen_id)!.push({ id: t.id, titre: t.titre, statut: t.statut, created_at: t.created_at });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  type Historique = { id: string; date_rdv: string; heure_rdv: string; objet: string | null; statut: string; notes: string | null; paiement: Paiement | null; presence_status: string | null; presence_confirmed_at: string | null };
  const clientMap = new Map<string, {
    id: string; nom: string; phone: string; nb_rdv: number;
    dernier_rdv: string; premiere_visite: string; est_nouveau: boolean;
    note: string; historique: Historique[]; avis: Avis[]; signalements: Signalement[]; taches: Tache[];
  }>();

  for (const r of rdvRaw) {
    if (!r.citoyen_id) continue;
    let c = clientMap.get(r.citoyen_id);
    if (!c) {
      const u = uMap.get(r.citoyen_id);
      c = {
        id: r.citoyen_id,
        nom: buildNom(u),
        phone: u?.phone ?? "",
        nb_rdv: 0,
        dernier_rdv: r.date_rdv,
        premiere_visite: r.date_rdv,
        est_nouveau: false,
        note: noteMap.get(r.citoyen_id) ?? "",
        historique: [],
        avis: avisMap.get(r.citoyen_id) ?? [],
        signalements: signalementsMap.get(r.citoyen_id) ?? [],
        taches: tachesMap.get(r.citoyen_id) ?? [],
      };
      clientMap.set(r.citoyen_id, c);
    }
    c.nb_rdv++;
    if (new Date(r.date_rdv) > new Date(c.dernier_rdv)) c.dernier_rdv = r.date_rdv;
    if (new Date(r.date_rdv) < new Date(c.premiere_visite)) c.premiere_visite = r.date_rdv;
    c.historique.push({ id: r.id, date_rdv: r.date_rdv, heure_rdv: r.heure_rdv, objet: r.objet, statut: r.statut, notes: r.notes, paiement: r.qr_token ? bookingMap.get(r.qr_token) ?? null : null, presence_status: r.presence_status, presence_confirmed_at: r.presence_confirmed_at });
  }

  // Confidentialité citoyen (Lot B) — l'aggregat (nb_rdv/dernier_rdv/
  // premiere_visite) reste toujours visible, indispensable à "Mes
  // clients" (savoir si c'est un client existant, quand le prochain RDV
  // a lieu — "Informations de réservation" du brief, toujours actif).
  // Seul le détail par visite est concerné :
  // - partage_historique_rdv=false → ne garder que la visite la plus
  //   récente (déjà en tête, historique trié desc par date_rdv) plutôt
  //   que tout l'historique.
  // - partage_historique_services=false → masquer le détail du service
  //   payé rattaché à chaque visite restante.
  const clients = [...clientMap.values()].map((c) => {
    const prefs = partageMap.get(c.id);
    const partageRdv = prefs?.partage_historique_rdv ?? true;
    const partageServices = prefs?.partage_historique_services ?? true;

    let historique = c.historique;
    if (!partageRdv) historique = historique.slice(0, 1);
    if (!partageServices) historique = historique.map((h) => ({ ...h, paiement: null }));

    return {
      ...c,
      historique,
      est_nouveau: new Date(c.premiere_visite) >= thirtyDaysAgo,
    };
  });

  return NextResponse.json({ clients });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "mes_clients.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const citoyenId = body?.citoyen_id;
  const note = body?.note;
  if (typeof citoyenId !== "string" || typeof note !== "string") {
    return NextResponse.json({ error: "citoyen_id et note requis" }, { status: 400 });
  }

  // N'autorise une note que sur un citoyen ayant réellement eu au moins un
  // RDV avec cette institution — empêche d'attacher une note à un citoyen
  // arbitraire jamais rencontré.
  const { data: existingRdv } = await sb
    .from("rdv")
    .select("id")
    .eq("institution_id", authInstId)
    .eq("citoyen_id", citoyenId)
    .limit(1)
    .maybeSingle();
  if (!existingRdv) return NextResponse.json({ error: "Client introuvable pour cette institution" }, { status: 404 });

  const { error } = await sb.from("notes_clients").upsert(
    { institution_id: authInstId, citoyen_id: citoyenId, note, mis_a_jour_le: new Date().toISOString() },
    { onConflict: "institution_id,citoyen_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "note_client_modifiee",
    cibleTable: "notes_clients",
    cibleId: citoyenId,
    req,
  });

  return NextResponse.json({ ok: true });
}
