import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EDITABLE_FIELDS = ["titre", "description_courte", "description_longue", "categorie", "genre", "partenaire_logo", "image_url", "cta_label", "cta_url", "date_expiration", "date_publication_prevue", "faits", "avantages", "limites"] as const;

// Modifie/soumet/suspend/archive une offre de sa propre institution.
// Règle non négociable (décision CEO) : toute modification de contenu
// d'une offre déjà `publiee` la repasse en `en_attente_validation` —
// jamais d'édition silencieuse d'une offre en ligne.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;

  const { data: current, error: findErr } = await sb
    .from("offres")
    .select("id, institution_id, statut, titre")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!current || current.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  const action = body.action as string | undefined;

  // Actions instantanées, pas de modération requise.
  if (action === "suspendre") {
    if (!can(membre.role, "offres.submit")) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    if (current.statut !== "publiee") return NextResponse.json({ error: "Seule une offre publiée peut être suspendue" }, { status: 400 });
    const { error } = await sb.from("offres").update({ statut: "suspendue", mis_a_jour_le: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "offre_suspendue", cibleTable: "offres", cibleId: id,
      details: { titre: current.titre }, req: request,
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "archiver") {
    if (!can(membre.role, "offres.submit")) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    const { error } = await sb.from("offres").update({ statut: "archivee", mis_a_jour_le: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "offre_archivee", cibleTable: "offres", cibleId: id,
      details: { titre: current.titre }, req: request,
    });
    return NextResponse.json({ ok: true });
  }

  // Édition de contenu (+ soumission optionnelle).
  if (!can(membre.role, "offres.write")) return NextResponse.json({ error: "Action non autorisée pour votre rôle" }, { status: 403 });

  const payload: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    if (f in body) payload[f] = body[f];
  }
  if (Array.isArray(payload.faits)) payload.faits = (payload.faits as unknown[]).slice(0, 4);

  const doitRepasserEnModeration = action === "soumettre" || current.statut === "publiee";
  if (doitRepasserEnModeration) {
    if (current.statut === "archivee") {
      return NextResponse.json({ error: "Une offre archivée ne peut plus être soumise" }, { status: 400 });
    }
    payload.statut = "en_attente_validation";
    payload.soumis_le = new Date().toISOString();
    payload.motif_refus = null;
    payload.valide_le = null;
    payload.valide_par_admin_id = null;
  }

  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  payload.mis_a_jour_le = new Date().toISOString();

  const { data, error } = await sb.from("offres").update(payload).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId, membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: doitRepasserEnModeration ? "offre_soumise" : "offre_modifiee",
    cibleTable: "offres", cibleId: id,
    details: { titre: current.titre, champs: Object.keys(payload) },
    req: request,
  });

  return NextResponse.json(data);
}

// Suppression : uniquement un brouillon jamais soumis — une offre déjà
// passée en modération/publiée s'archive, elle ne se supprime pas.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "offres.write")) return NextResponse.json({ error: "Action non autorisée pour votre rôle" }, { status: 403 });
  const { id } = await params;

  const { data: current, error: findErr } = await sb.from("offres").select("id, institution_id, statut, titre").eq("id", id).maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!current || current.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }
  if (current.statut !== "brouillon") {
    return NextResponse.json({ error: "Seul un brouillon peut être supprimé — archivez une offre déjà soumise" }, { status: 400 });
  }

  const { error } = await sb.from("offres").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId, membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "offre_supprimee", cibleTable: "offres", cibleId: id,
    details: { titre: current.titre }, req: request,
  });

  return NextResponse.json({ ok: true });
}
