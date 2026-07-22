import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { DOCUMENT_TRAVAIL_ACCEPTED_MIME, MAX_DOCUMENT_TRAVAIL_SIZE, CATEGORIES_FINANCIERES } from "@/lib/documentsTravail";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Documents financiers du comptable — même table/bucket que documents-travail
// (espace de travail), filtré aux catégories financières. Route dédiée
// (plutôt qu'élargir documents-travail/route.ts) : le comptable n'a pas
// accès à l'espace de travail (canAccessTab "espace-travail" = none), ses
// documents financiers restent un monde séparé, cohérent avec le reste du
// chantier comptable (menu strictement financier).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents-financiers") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const download = new URL(req.url).searchParams.get("download");
  if (download) {
    const { data: doc } = await sb.from("documents_travail").select("url").eq("id", download).eq("institution_id", membre.institutionId).maybeSingle();
    if (!doc) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });
    const { data: signed, error: signErr } = await sb.storage.from("documents-travail").createSignedUrl(doc.url, 60);
    if (signErr || !signed) return NextResponse.json({ error: signErr?.message || "Erreur de génération d'URL" }, { status: 500 });
    return NextResponse.json({ url: signed.signedUrl });
  }

  const { data, error } = await sb
    .from("documents_travail")
    .select("id,nom,description,categorie,taille,type_mime,membre_id,uploaded_at")
    .eq("institution_id", membre.institutionId)
    .in("categorie", CATEGORIES_FINANCIERES)
    .order("uploaded_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents-financiers") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const file = form.get("file");
  const nom = form.get("nom");
  const categorie = form.get("categorie");
  const description = form.get("description");

  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  if (!DOCUMENT_TRAVAIL_ACCEPTED_MIME.includes(file.type)) {
    return NextResponse.json({ error: "Format non accepté (PDF, Word, Excel, JPG, PNG uniquement)" }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_TRAVAIL_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (20 Mo max)" }, { status: 400 });
  }
  if (typeof categorie !== "string" || !CATEGORIES_FINANCIERES.includes(categorie as (typeof CATEGORIES_FINANCIERES)[number])) {
    return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
  }

  const displayName = typeof nom === "string" && nom.trim() ? nom.trim() : file.name;
  const ext = file.name.split(".").pop() || "bin";
  const path = `${membre.institutionId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from("documents-travail").upload(path, buffer, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: inserted, error: insertErr } = await sb.from("documents_travail").insert({
    institution_id: membre.institutionId,
    nom: displayName,
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    categorie,
    url: path,
    taille: file.size,
    type_mime: file.type,
    membre_id: membre.membreId,
  }).select("id").single();
  if (insertErr) {
    await sb.storage.from("documents-travail").remove([path]);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "document_ajoute",
    cibleTable: "documents_travail",
    cibleId: inserted.id,
    details: { nom: displayName },
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents-financiers") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: doc } = await sb.from("documents_travail").select("url,nom,membre_id").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });
  if (membre.role !== "admin" && doc.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez supprimer que les documents que vous avez ajoutés" }, { status: 403 });
  }

  await sb.storage.from("documents-travail").remove([doc.url]);
  const { error } = await sb.from("documents_travail").delete().eq("id", id).eq("institution_id", membre.institutionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "document_supprime",
    cibleTable: "documents_travail",
    cibleId: id,
    details: { nom: doc.nom },
    req,
  });

  return NextResponse.json({ ok: true });
}
