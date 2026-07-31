import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { notifierFinPrestation } from "@/lib/notificationEngine";
import { accorderPoints } from "@/lib/rewardsEngine";

// Sécurise les 4 actions RDV (accepter/refuser/terminer/absent) —
// auparavant un supabase.from("rdv").update(...) direct depuis le
// navigateur (clé anon), sans policy RLS institution sur `rdv` (vérifié :
// aucune dans les migrations). Cette route applique le contrôle serveur
// qui manquait et journalise chaque action (migration 20260715000001).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const STATUTS = ["en_attente", "annule", "termine"] as const;
type Statut = (typeof STATUTS)[number];
type Action = Statut | "absent";
const ACTIONS = [...STATUTS, "absent"] as const;

const LABEL_PAR_ACTION: Record<Action, string> = {
  en_attente: "rdv_accepte",
  annule: "rdv_refuse",
  termine: "rdv_termine",
  absent: "rdv_absent",
};

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "rdv.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rdvId = body?.rdv_id;
  const action = body?.statut as Action;
  const motif = typeof body?.motif === "string" ? body.motif : null;

  if (typeof rdvId !== "string" || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "rdv_id et statut valides requis" }, { status: 400 });
  }

  const { data: rdvAvant } = await sb
    .from("rdv")
    .select("id,statut,institution_id,presence_status,citoyen_id,date_rdv,heure_rdv,institutions!rdv_institution_id_fkey(name),users!rdv_citoyen_id_fkey(prenom,nom,phone)")
    .eq("id", rdvId)
    .eq("institution_id", membre.institutionId)
    .maybeSingle();
  if (!rdvAvant) return NextResponse.json({ error: "RDV introuvable pour cette institution" }, { status: 404 });

  // Un RDV ne peut jamais être marqué "terminé" sans que la présence du
  // citoyen ait été confirmée (scan QR) — sinon rien ne distingue un rendez-
  // vous honoré d'un rendez-vous jamais honoré. Contrôle serveur en plus du
  // bouton désactivé côté UI, pour ne pas dépendre uniquement du client.
  if (action === "termine" && rdvAvant.presence_status !== "present") {
    return NextResponse.json(
      { error: "Impossible de marquer ce RDV comme terminé sans avoir scanné la présence du citoyen." },
      { status: 400 }
    );
  }

  // "absent" est un constat de présence, pas un état du cycle de vie du RDV
  // → va dans presence_status (même colonne que le scan QR), pas dans statut.
  const updates: Record<string, unknown> =
    action === "absent"
      ? { presence_status: "absent", presence_confirmed_at: new Date().toISOString() }
      : {
          statut: action,
          ...(action === "annule" ? { motif_annulation: motif } : {}),
          ...(action === "termine" ? { termine_at: new Date().toISOString(), termine_par: membre.membreId, avis_demande: true } : {}),
        };

  const { error } = await sb.from("rdv").update(updates).eq("id", rdvId).eq("institution_id", membre.institutionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Yelen Rewards Phase 1 (26/07/2026) — seul point d'intégration de la
  // Phase 1 : rdv_complete (+15) et rdv_no_show (-10), les deux seules
  // valeurs confirmées par le CEO. citoyen_id vient de la ligne relue
  // depuis la base (rdvAvant), jamais d'un champ du corps de la requête —
  // et le montant vient de reward_rules, jamais d'ici. Best-effort :
  // ne doit jamais faire échouer la réponse de cette route.
  if (action === "termine") {
    await accorderPoints({
      citoyenId: rdvAvant.citoyen_id,
      sourceType: "rdv",
      sourceId: rdvId,
      eventType: "rdv_complete",
    });
  } else if (action === "absent") {
    await accorderPoints({
      citoyenId: rdvAvant.citoyen_id,
      sourceType: "rdv",
      sourceId: rdvId,
      eventType: "rdv_no_show",
    });
  }

  // Chantier "Yelen Assistant" (20/07/2026), Phase 8 — remplace l'ancien
  // insert dupliqué (citoyen uniquement, texte générique) par le vrai
  // moteur : notifie aussi l'institution (jamais fait avant), avec le texte
  // exact du brief CEO + salutation.
  if (action === "termine") {
    const institutionsRel = rdvAvant.institutions as unknown as { name: string } | { name: string }[] | null;
    const usersRel = rdvAvant.users as unknown as { prenom: string | null; nom: string | null; phone: string | null } | { prenom: string | null; nom: string | null; phone: string | null }[] | null;
    const instRow = Array.isArray(institutionsRel) ? institutionsRel[0] : institutionsRel;
    const userRow = Array.isArray(usersRel) ? usersRel[0] : usersRel;
    await notifierFinPrestation({
      rdvId,
      citoyenId: rdvAvant.citoyen_id,
      citoyenPrenom: userRow?.prenom || userRow?.nom || "Citoyen",
      institutionId: rdvAvant.institution_id,
      institutionNom: instRow?.name ?? "l'établissement",
      dateRdv: rdvAvant.date_rdv,
      heureRdv: rdvAvant.heure_rdv,
    });
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: LABEL_PAR_ACTION[action],
    cibleTable: "rdv",
    cibleId: rdvId,
    details:
      action === "absent"
        ? { statut_avant: rdvAvant.statut, presence_status_apres: "absent" }
        : { statut_avant: rdvAvant.statut, statut_apres: action, ...(motif ? { motif } : {}) },
    ancienneValeur: action === "absent" ? { presence_status: rdvAvant.presence_status } : { statut: rdvAvant.statut },
    nouvelleValeur: action === "absent" ? { presence_status: "absent" } : { statut: action },
    req,
  });

  return NextResponse.json({ ok: true });
}
