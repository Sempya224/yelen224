import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre, revoquerSessionsMembre } from "@/lib/institutionAuth";
import { permissionsDuRole, ROLE_LABELS, type DomaineKey } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { notifierMembrePremiereConnexion } from "@/lib/notificationEngine";
import { SECTEUR_LABELS } from "@/lib/institutionTaxonomy";

// Sas de confiance de première connexion (16/09/2026) — inséré entre le
// changement de PIN obligatoire (doit_changer_pin) et l'ouverture du
// dashboard, jamais à une reconnexion normale (le flag redevient false dès
// le premier changement de PIN, donc ce sas ne peut structurellement
// apparaître qu'une fois). Session déjà établie à ce stade (le cookie est
// posé dès la connexion réussie, avant la vérification de doit_changer_pin).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const [{ data: institution }, { data: moi }] = await Promise.all([
    sb.from("institutions").select("name,logo,secteur,ville,adresse,pays,email,phone").eq("id", membre.institutionId).maybeSingle(),
    sb.from("institution_membres").select("prenom,nom,role,fonction,invite_par_membre_id,acces_restreints").eq("id", membre.membreId).maybeSingle(),
  ]);
  if (!institution || !moi) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  // Absent pour tout membre créé avant cette fonctionnalité — jamais de
  // valeur fabriquée, la ligne "Invité par" n'apparaît simplement pas.
  const { data: inviteur } = moi.invite_par_membre_id
    ? await sb.from("institution_membres").select("prenom,nom,role").eq("id", moi.invite_par_membre_id).maybeSingle()
    : { data: null };

  const permissions = permissionsDuRole(moi.role, (moi.acces_restreints as DomaineKey[] | null) ?? [])
    .filter(p => p.accorde && !p.retire)
    .map(p => p.label);

  return NextResponse.json({
    institution: {
      name: institution.name,
      logo: institution.logo,
      secteurLabel: institution.secteur ? (SECTEUR_LABELS[institution.secteur] ?? institution.secteur) : null,
      ville: institution.ville,
      adresse: institution.adresse,
      pays: institution.pays,
      email: institution.email,
      phone: institution.phone,
    },
    inviteur: inviteur ? { prenom: inviteur.prenom, nom: inviteur.nom, role: inviteur.role } : null,
    moi: { prenom: moi.prenom, nom: moi.nom, role: moi.role, fonction: moi.fonction },
    permissions,
  });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "confirmer") {
    const now = new Date().toISOString();
    const { error } = await sb.from("institution_membres")
      .update({ relation_confirmee_le: now, cgu_acceptee_le: now })
      .eq("id", membre.membreId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notification institution (16/09/2026) — best-effort, ne doit jamais
    // faire échouer la confirmation elle-même si l'envoi rate.
    try {
      const [{ data: moi }, { data: institution }] = await Promise.all([
        sb.from("institution_membres").select("prenom,nom").eq("id", membre.membreId).maybeSingle(),
        sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle(),
      ]);
      if (moi) {
        await notifierMembrePremiereConnexion({
          institutionId: membre.institutionId,
          institutionNom: institution?.name ?? null,
          membrePrenom: moi.prenom,
          membreNom: moi.nom,
          roleLabel: ROLE_LABELS[membre.role],
        });
      }
    } catch (err) {
      console.error("[PREMIERE CONNEXION] Erreur notification:", err);
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "non_reconnu") {
    await enregistrerAction({
      institutionId: membre.institutionId,
      membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "invitation_non_reconnue",
      cibleTable: "institution_membres",
      cibleId: membre.membreId,
      niveau: "critique",
      req,
    });
    await revoquerSessionsMembre(sb, membre.membreId, "invitation_non_reconnue");
    const response = NextResponse.json({ ok: true });
    response.cookies.delete("yelen224_institution_session");
    return response;
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
