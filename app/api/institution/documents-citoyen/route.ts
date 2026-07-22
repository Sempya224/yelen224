import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { accesUrgenceAdminDebloque } from "@/lib/comptableProtection";
import { notifierDocumentDemande, notifierDocumentEnvoye } from "@/lib/notificationEngine";

// Lot A (chantier "Activités passées") — demande de document à un citoyen
// ("demande", le citoyen téléverse plus tard) ou envoi direct ("envoi",
// facture/rapport/reçu). Toujours rattaché à un RDV réel entre les deux,
// n'importe lequel (pas seulement en cours/à venir — un établissement doit
// pouvoir facturer ou redemander un document après un RDV déjà passé,
// décision explicite de Bryan pour ne pas bloquer ce cas d'usage courant).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DOCUMENT_ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents-clients") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const download = searchParams.get("download");
  if (download) {
    const { data: doc } = await sb.from("citoyen_documents").select("url").eq("id", download).eq("institution_id", membre.institutionId).maybeSingle();
    if (!doc?.url) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });
    const { data: signed, error: signErr } = await sb.storage.from("documents-citoyens").createSignedUrl(doc.url, 60);
    if (signErr || !signed) return NextResponse.json({ error: signErr?.message || "Erreur de génération d'URL" }, { status: 500 });
    return NextResponse.json({ url: signed.signedUrl });
  }

  const citoyenId = searchParams.get("citoyen_id");
  let query = sb
    .from("citoyen_documents")
    .select("id,citoyen_id,rdv_id,sens,type,label,description,statut,taille,type_mime,created_at,traite_le,rdv(date_rdv,objet)")
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

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents-clients") === "none") {
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

  let url: string | null = null;
  let typeMime: string | null = null;
  let taille: number | null = null;
  const sens = file instanceof File ? "envoi" : "demande";

  if (file instanceof File) {
    if (!DOCUMENT_ACCEPTED_MIME.includes(file.type)) {
      return NextResponse.json({ error: "Format non accepté (PDF, JPG, PNG uniquement)" }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)" }, { status: 400 });
    }
    const ext = file.name.split(".").pop() || "bin";
    const path = `${membre.institutionId}/${citoyenId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await sb.storage.from("documents-citoyens").upload(path, buffer, { contentType: file.type });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    url = path;
    typeMime = file.type;
    taille = file.size;
  }

  const { data: inserted, error: insertErr } = await sb.from("citoyen_documents").insert({
    institution_id: membre.institutionId,
    citoyen_id: citoyenId,
    rdv_id: rdvId,
    sens,
    type: typeof type === "string" && type.trim() ? type.trim() : "autre",
    label: label.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    statut: sens === "envoi" ? "envoye" : "en_attente",
    url,
    type_mime: typeMime,
    taille,
    demande_par_membre_id: membre.membreId,
    traite_le: sens === "envoi" ? new Date().toISOString() : null,
  }).select("id").single();

  if (insertErr) {
    if (url) await sb.storage.from("documents-citoyens").remove([url]);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: sens === "envoi" ? "document_citoyen_envoye" : "document_citoyen_demande",
    cibleTable: "citoyen_documents",
    cibleId: inserted.id,
    details: { citoyen_id: citoyenId, label: label.trim() },
    req,
  });

  // Notification citoyen (plan rétention v2, item 1) — best-effort, ne
  // fait jamais échouer la création si la notification échoue.
  const [{ data: citoyenRow }, { data: instRow }] = await Promise.all([
    sb.from("users").select("prenom").eq("id", citoyenId).maybeSingle(),
    sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle(),
  ]);
  const institutionNom = instRow?.name ?? "Votre établissement";
  const notifierDocument = sens === "envoi" ? notifierDocumentEnvoye : notifierDocumentDemande;
  await notifierDocument({ citoyenId, citoyenPrenom: citoyenRow?.prenom ?? null, institutionNom, label: label.trim(), rdvId }).catch((err) => {
    console.error("[documents-citoyen] notification error:", err);
  });

  return NextResponse.json({ ok: true });
}
