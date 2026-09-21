import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { rdvNonTraite } from "@/lib/rdvGating";

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

// Séparé en deux modes (09/09/2026, Bryan : "Mes clients" nettement plus
// lent que tout le reste du dashboard) :
// - Liste (par défaut) : uniquement ce qu'affiche la carte résumé (nom,
//   téléphone, nb_rdv, dernier statut pour le badge, note) — avant ce
//   correctif, cette route rapatriait ET renvoyait l'historique complet
//   (objet/notes/paiement par visite) ET tous les avis/signalements/
//   tâches de CHAQUE client dès le chargement initial, alors que la liste
//   n'affiche que la toute dernière visite. Le scan complet de `rdv` de
//   l'institution reste nécessaire (nb_rdv/dernier_rdv/premiere_visite
//   sont des agrégats sur tout l'historique — voir CLAUDE.md "Dette
//   requêtes non bornées", un .limit() casserait ces agrégats), mais les
//   6 requêtes IN(citoyen_ids) supplémentaires (avis/signalements/
//   paid_bookings/taches/citoyen_prefs_partage + le détail de chaque
//   visite) ne sont plus faites pour cette liste.
// - Détail (`?citoyen_id=`) : même logique qu'avant, mais bornée à UN SEUL
//   citoyen — chargée à la demande, exactement quand la fiche est ouverte
//   (même pattern déjà en place pour messages/journal/notes-client dans
//   MesClientsTab.tsx).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  // Facturation clients V3 (18/09/2026) : le comptable n'a pas l'onglet
  // "Mes clients" (TAB_MATRIX.comptable = "none") mais doit pouvoir
  // rechercher un client existant pour lui créer une facture — accès
  // élargi ici uniquement pour ce besoin précis, pas un accès CRM complet.
  const accesFacturation = can(membre.role, "facturation.write", membre.accesRestreints);
  if (canAccessTab(membre.role, "mes-clients", membre.accesRestreints) === "none" && !accesFacturation) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;
  const citoyenIdParam = req.nextUrl.searchParams.get("citoyen_id");

  if (citoyenIdParam) return chargerDetailClient(authInstId, citoyenIdParam);
  return chargerListeClients(authInstId);
}

async function chargerListeClients(authInstId: string) {
  const { data: rdvRaw, error: rdvErr } = await sb
    .from("rdv")
    .select("date_rdv,heure_rdv,statut,presence_status,citoyen_id")
    .eq("institution_id", authInstId)
    .order("date_rdv", { ascending: false });
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });

  if (!rdvRaw?.length) return NextResponse.json({ clients: [] });

  const citoyenIds = [...new Set(rdvRaw.map((r) => r.citoyen_id).filter(Boolean))];

  const [{ data: usersD }, { data: notesD }] = await Promise.all([
    sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds),
    sb.from("notes_clients").select("citoyen_id,note").eq("institution_id", authInstId).in("citoyen_id", citoyenIds),
  ]);

  const uMap = new Map((usersD ?? []).map((u) => [u.id, u]));
  const noteMap = new Map((notesD ?? []).map((n) => [n.citoyen_id, n.note as string]));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const clientMap = new Map<string, {
    id: string; nom: string; phone: string; nb_rdv: number;
    dernier_rdv: string; dernier_heure_rdv: string | null; dernier_statut_brut: string; dernier_presence_status: string | null;
    premiere_visite: string;
  }>();

  for (const r of rdvRaw) {
    if (!r.citoyen_id) continue;
    let c = clientMap.get(r.citoyen_id);
    if (!c) {
      const u = uMap.get(r.citoyen_id);
      c = { id: r.citoyen_id, nom: buildNom(u), phone: u?.phone ?? "", nb_rdv: 0, dernier_rdv: r.date_rdv, dernier_heure_rdv: r.heure_rdv, dernier_statut_brut: r.statut, dernier_presence_status: r.presence_status, premiere_visite: r.date_rdv };
      clientMap.set(r.citoyen_id, c);
    }
    c.nb_rdv++;
    if (new Date(r.date_rdv) > new Date(c.dernier_rdv)) { c.dernier_rdv = r.date_rdv; c.dernier_heure_rdv = r.heure_rdv; c.dernier_statut_brut = r.statut; c.dernier_presence_status = r.presence_status; }
    if (new Date(r.date_rdv) < new Date(c.premiere_visite)) c.premiere_visite = r.date_rdv;
  }

  // Badge de la liste — même règle exacte que le badge du dashboard RDV
  // (app/[slug]/[id]/layout.tsx) : "Absent" prime toujours, sinon "Non
  // traité" (rdvNonTraite) si la dernière visite a dépassé son heure sans
  // résolution, sinon le statut brut. Corrige un vrai bug signalé par
  // Bryan 09/09/2026 : la liste affichait "En attente" figé sur le statut
  // brut, y compris pour des visites vieilles d'un mois jamais traitées ou
  // déjà marquées absentes (presence_status, colonne différente de statut).
  const clients = [...clientMap.values()].map((c) => {
    const dernier_statut = c.dernier_presence_status === "absent"
      ? "absent"
      : rdvNonTraite(c.dernier_statut_brut, c.dernier_presence_status, c.dernier_rdv, c.dernier_heure_rdv ?? "00:00")
      ? "en_retard"
      : c.dernier_statut_brut;
    return {
      id: c.id, nom: c.nom, phone: c.phone, nb_rdv: c.nb_rdv,
      dernier_rdv: c.dernier_rdv, dernier_statut, premiere_visite: c.premiere_visite,
      note: noteMap.get(c.id) ?? "",
      est_nouveau: new Date(c.premiere_visite) >= thirtyDaysAgo,
      // Toujours présents (même forme que la fiche détail) — hydratés
      // uniquement quand la fiche de CE client est ouverte.
      historique: [] as unknown[], avis: [] as unknown[], signalements: [] as unknown[], taches: [] as unknown[],
    };
  });

  return NextResponse.json({ clients });
}

async function chargerDetailClient(authInstId: string, citoyenId: string) {
  const { data: rdvRaw, error: rdvErr } = await sb
    .from("rdv")
    .select("id,objet,date_rdv,heure_rdv,statut,citoyen_id,notes,qr_token,presence_status,presence_confirmed_at")
    .eq("institution_id", authInstId)
    .eq("citoyen_id", citoyenId)
    .order("date_rdv", { ascending: false });
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });
  if (!rdvRaw?.length) return NextResponse.json({ error: "Client introuvable pour cette institution" }, { status: 404 });

  const [{ data: usersD }, { data: notesD }, { data: avisD }, { data: signalementsD }, { data: bookingsD }, { data: tachesD }, { data: partageD }, { data: facturesD }] = await Promise.all([
    sb.from("users").select("id,nom,prenom,phone").eq("id", citoyenId).maybeSingle(),
    sb.from("notes_clients").select("note").eq("institution_id", authInstId).eq("citoyen_id", citoyenId).maybeSingle(),
    // brouillon=false — un avis non publié (Lot G, chantier Avis + Favoris
    // citoyen) ne doit jamais être visible côté institution.
    sb.from("avis").select("id,citoyen_id,note,commentaire,reponse_institution,reponse_le,created_at").eq("institution_id", authInstId).eq("brouillon", false).eq("citoyen_id", citoyenId),
    sb.from("signalements").select("citoyen_id,titre,motif,statut,created_at").eq("institution_id", authInstId).eq("type_signaleur", "citoyen").eq("citoyen_id", citoyenId),
    // paid_bookings n'a aucune policy publique (verrouillé volontairement,
    // migration 20260709000013) — lecture via service role uniquement,
    // même pattern que le reste de cette route. Jointure paid_services
    // pour le nom/prix affichés dans l'historique du client.
    sb.from("paid_bookings").select("confirmation_code,statut,paid_services(nom,prix)").eq("institution_id", authInstId).eq("citoyen_id", citoyenId),
    sb.from("taches").select("id,citoyen_id,titre,statut,created_at").eq("institution_id", authInstId).eq("citoyen_id", citoyenId),
    // Confidentialité citoyen (Lot B, migration 20260724000002) — absence
    // de ligne = valeurs par défaut de la table (true/true), même
    // comportement qu'avant ce lot pour un citoyen qui n'a jamais réglé
    // ses préférences.
    sb.from("citoyen_prefs_partage").select("partage_historique_rdv,partage_historique_services").eq("citoyen_id", citoyenId).maybeSingle(),
    // Facturation clients V3 (18/09/2026) — résumé pour le lien croisé
    // fiche client -> Facturation clients.
    sb.from("factures").select("statut,montant_ttc,montant_paye").eq("institution_id", authInstId).eq("citoyen_id", citoyenId),
  ]);

  const u = usersD as { nom: string | null; prenom: string | null; phone: string | null } | null;

  type Paiement = { service_nom: string; prix: number; statut: string };
  const bookingMap = new Map<string, Paiement>();
  for (const b of (bookingsD ?? []) as unknown as { confirmation_code: string; statut: string; paid_services: { nom: string; prix: number } | null }[]) {
    if (b.paid_services) bookingMap.set(b.confirmation_code, { service_nom: b.paid_services.nom, prix: b.paid_services.prix, statut: b.statut });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let historique = rdvRaw.map((r) => ({
    id: r.id, date_rdv: r.date_rdv, heure_rdv: r.heure_rdv, objet: r.objet, statut: r.statut, notes: r.notes,
    paiement: r.qr_token ? bookingMap.get(r.qr_token) ?? null : null,
    presence_status: r.presence_status, presence_confirmed_at: r.presence_confirmed_at,
  }));
  // rdvRaw est trié desc par date_rdv (requête ci-dessus) — le premier est
  // donc déjà le plus récent, le dernier le plus ancien.
  const dernier_rdv = rdvRaw[0].date_rdv;
  const premiere_visite = rdvRaw[rdvRaw.length - 1].date_rdv;

  // Confidentialité citoyen (Lot B) — l'agrégat (nb_rdv/dernier_rdv/
  // premiere_visite) reste toujours visible, indispensable à "Mes
  // clients" (savoir si c'est un client existant, quand le prochain RDV
  // a lieu — "Informations de réservation" du brief, toujours actif).
  // Seul le détail par visite est concerné :
  // - partage_historique_rdv=false → ne garder que la visite la plus
  //   récente (déjà en tête, historique trié desc par date_rdv) plutôt
  //   que tout l'historique.
  // - partage_historique_services=false → masquer le détail du service
  //   payé rattaché à chaque visite restante.
  const partageRdv = (partageD as { partage_historique_rdv: boolean } | null)?.partage_historique_rdv ?? true;
  const partageServices = (partageD as { partage_historique_services: boolean } | null)?.partage_historique_services ?? true;
  if (!partageRdv) historique = historique.slice(0, 1);
  if (!partageServices) historique = historique.map((h) => ({ ...h, paiement: null }));

  const client = {
    id: citoyenId,
    nom: buildNom(u ?? undefined),
    phone: u?.phone ?? "",
    nb_rdv: rdvRaw.length,
    dernier_rdv,
    // Même règle que chargerListeClients ci-dessus — voir son commentaire.
    dernier_statut: rdvRaw[0].presence_status === "absent"
      ? "absent"
      : rdvNonTraite(rdvRaw[0].statut, rdvRaw[0].presence_status, rdvRaw[0].date_rdv, rdvRaw[0].heure_rdv ?? "00:00")
      ? "en_retard"
      : rdvRaw[0].statut,
    premiere_visite,
    est_nouveau: new Date(premiere_visite) >= thirtyDaysAgo,
    note: (notesD as { note: string } | null)?.note ?? "",
    historique,
    avis: (avisD ?? []).map((a) => ({ id: a.id, note: a.note, commentaire: a.commentaire, reponse_institution: a.reponse_institution, reponse_le: a.reponse_le, created_at: a.created_at })),
    signalements: (signalementsD ?? []).map((s) => ({ titre: s.titre, motif: s.motif, statut: s.statut, created_at: s.created_at })),
    taches: (tachesD ?? []).map((t) => ({ id: t.id, titre: t.titre, statut: t.statut, created_at: t.created_at })),
    factures_resume: (() => {
      const liste = (facturesD ?? []) as { statut: string; montant_ttc: number; montant_paye: number }[];
      const payees = liste.filter((f) => f.statut === "payee" || f.statut === "emise").length;
      const enAttente = liste.filter((f) => f.statut !== "payee" && f.statut !== "emise" && f.statut !== "annulee" && f.statut !== "brouillon").length;
      const aEncaisser = liste.filter((f) => f.statut !== "annulee" && f.statut !== "brouillon").reduce((s, f) => s + Math.max(0, f.montant_ttc - f.montant_paye), 0);
      return { total: liste.length, payees, en_attente: enAttente, a_encaisser: aEncaisser };
    })(),
  };

  return NextResponse.json({ client });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "mes_clients.write", membre.accesRestreints)) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
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
