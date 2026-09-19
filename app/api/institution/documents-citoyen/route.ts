import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { accesUrgenceAdminDebloque } from "@/lib/comptableProtection";
import { notifierDocumentDemande, notifierDocumentEnvoye } from "@/lib/notificationEngine";
import { validateUpload } from "@/lib/uploadSecurity";
import { creerDemande, creerEnvoi, enregistrerConsultation, enregistrerTelechargement } from "@/lib/citoyenDocuments";

// Lot A (chantier "Activités passées") — demande de document à un citoyen
// ("demande", le citoyen téléverse plus tard) ou envoi direct ("envoi",
// facture/rapport/reçu). Toujours rattaché à un RDV réel entre les deux,
// n'importe lequel (pas seulement en cours/à venir — un établissement doit
// pouvoir facturer ou redemander un document après un RDV déjà passé,
// décision explicite de Bryan pour ne pas bloquer ce cas d'usage courant).
//
// Documents clients — Lot 1 (09/08/2026) : POST passe désormais par
// lib/citoyenDocuments.ts (seul point d'écriture, garantit qu'aucun
// événement d'audit document_events n'est oublié). `?download=`/`?preview=`
// journalisent chacun un événement distinct.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents-clients") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const download = searchParams.get("download");
  const preview = searchParams.get("preview");
  const targetId = download ?? preview;
  if (targetId) {
    const { data: doc } = await sb.from("citoyen_documents").select("url, citoyen_id").eq("id", targetId).eq("institution_id", membre.institutionId).maybeSingle();
    if (!doc?.url) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });
    const { data: signed, error: signErr } = await sb.storage.from("documents-citoyens").createSignedUrl(doc.url, 60);
    if (signErr || !signed) return NextResponse.json({ error: signErr?.message || "Erreur de génération d'URL" }, { status: 500 });

    const membreNom = await getMembreNomPourEvenement(membre.membreId);
    const acteur = { type: "membre" as const, id: membre.membreId, nom: membreNom };
    if (download) {
      await enregistrerTelechargement({ documentId: download, institutionId: membre.institutionId, citoyenId: doc.citoyen_id, acteur, req });
    } else {
      await enregistrerConsultation({ documentId: preview!, institutionId: membre.institutionId, citoyenId: doc.citoyen_id, acteur, req });
    }

    return NextResponse.json({ url: signed.signedUrl });
  }

  const citoyenId = searchParams.get("citoyen_id");
  // Documents clients — Lot 2 (09/08/2026) : pagination retirée, mêmes
  // raisons que GET /api/institution/signalements (KPI/filtres ont besoin
  // du jeu complet pour être exacts, volume actuel trivial) — réversion
  // assumée de la pagination posée au Lot 1, à revoir si le volume grossit
  // (même esprit que /dette-requetes-non-bornees).
  let query = sb
    .from("citoyen_documents")
    .select("id,citoyen_id,rdv_id,sens,type,label,description,statut,taille,type_mime,created_at,traite_le,date_limite,motif_refus,motif_refus_detail,remplace_document_id,demande_par_membre_id,rdv(date_rdv,objet)")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false });
  if (citoyenId) query = query.eq("citoyen_id", citoyenId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const citoyenIds = [...new Set((data ?? []).map((d) => d.citoyen_id))];
  const { data: usersD } = citoyenIds.length
    ? await sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds)
    : { data: [] };
  const uMap = new Map((usersD ?? []).map((u) => [u.id, u]));

  const documents = (data ?? []).map((d) => {
    const u = uMap.get(d.citoyen_id);
    const nom = u ? [u.prenom, u.nom].filter(Boolean).join(" ") || u.phone : "Citoyen";
    return { ...d, citoyen_nom: nom };
  });

  return NextResponse.json({ documents });
}

async function getMembreNomPourEvenement(membreId: string): Promise<string> {
  const { data } = await sb.from("institution_membres").select("prenom, nom").eq("id", membreId).maybeSingle();
  return data ? `${data.prenom} ${data.nom}` : "Membre";
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "documents_clients.write")) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  // Domaine réservé comptable (même protection que paiements.rembourser,
  // décision CEO 22/07/2026) : l'admin ne peut créer une demande/un envoi
  // de document lui-même que si aucun comptable actif n'existe (suspendu
  // ou désactivé) — sinon cette action revient au comptable.
  if (membre.role === "admin" && !(await accesUrgenceAdminDebloque(membre.institutionId))) {
    return NextResponse.json({ error: "Un comptable actif existe — cette action lui revient. Accès admin débloqué uniquement s'il est suspendu." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const citoyenId = form.get("citoyenId");
  const rdvId = form.get("rdvId");
  const type = form.get("type");
  const label = form.get("label");
  const description = form.get("description");
  const dateLimite = form.get("dateLimite");
  const file = form.get("file"); // présent = "envoi" direct, absent = "demande"

  if (typeof citoyenId !== "string" || typeof rdvId !== "string" || typeof label !== "string" || !label.trim()) {
    return NextResponse.json({ error: "citoyenId, rdvId et label requis" }, { status: 400 });
  }

  // Le RDV doit réellement lier ce citoyen à cette institution — n'importe
  // quel statut/date (pas seulement en_attente/confirme), sinon impossible
  // de facturer ou redemander un document après un RDV déjà passé.
  const { data: rdvRow } = await sb
    .from("rdv")
    .select("id")
    .eq("id", rdvId)
    .eq("citoyen_id", citoyenId)
    .eq("institution_id", membre.institutionId)
    .maybeSingle();
  if (!rdvRow) return NextResponse.json({ error: "Ce RDV ne correspond pas à ce client pour votre institution" }, { status: 404 });

  const membreNom = await getMembreNomPourEvenement(membre.membreId);
  const acteur = { type: "membre" as const, id: membre.membreId, nom: membreNom };
  const typeVal = typeof type === "string" && type.trim() ? type.trim() : "autre";
  const labelVal = label.trim();
  const descriptionVal = typeof description === "string" && description.trim() ? description.trim() : null;

  let resultat: { ok: true; id: string } | { ok: false; error: string };
  let sens: "demande" | "envoi";

  if (file instanceof File) {
    sens = "envoi";
    const buffer = Buffer.from(await file.arrayBuffer());
    const verif = await validateUpload(buffer, "DOCUMENT_KYC", MAX_DOCUMENT_SIZE, file.name);
    if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });
    const path = `${membre.institutionId}/${citoyenId}/${crypto.randomUUID()}.${verif.extension}`;
    const { error: upErr } = await sb.storage.from("documents-citoyens").upload(path, buffer, { contentType: verif.detectedType });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    resultat = await creerEnvoi({
      institutionId: membre.institutionId, citoyenId, rdvId, type: typeVal, label: labelVal, description: descriptionVal,
      url: path, typeMime: verif.detectedType, taille: file.size, demandeParMembreId: membre.membreId, acteur, req,
    });
    if (!resultat.ok) await sb.storage.from("documents-citoyens").remove([path]);
  } else {
    sens = "demande";
    const dateLimiteVal = typeof dateLimite === "string" && dateLimite.trim() ? new Date(dateLimite).toISOString() : null;
    resultat = await creerDemande({
      institutionId: membre.institutionId, citoyenId, rdvId, type: typeVal, label: labelVal, description: descriptionVal,
      dateLimite: dateLimiteVal, demandeParMembreId: membre.membreId, acteur, req,
    });
  }

  if (!resultat.ok) return NextResponse.json({ error: resultat.error }, { status: 500 });

  // Notification citoyen (plan rétention v2, item 1) — best-effort, ne
  // fait jamais échouer la création si la notification échoue.
  const [{ data: citoyenRow }, { data: instRow }] = await Promise.all([
    sb.from("users").select("prenom").eq("id", citoyenId).maybeSingle(),
    sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle(),
  ]);
  const institutionNom = instRow?.name ?? "Votre établissement";
  const notifierDocument = sens === "envoi" ? notifierDocumentEnvoye : notifierDocumentDemande;
  await notifierDocument({ citoyenId, citoyenPrenom: citoyenRow?.prenom ?? null, institutionNom, label: labelVal, rdvId }).catch((err) => {
    console.error("[documents-citoyen] notification error:", err);
  });

  return NextResponse.json({ ok: true, id: resultat.id });
}
