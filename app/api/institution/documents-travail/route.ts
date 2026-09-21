import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { MAX_DOCUMENT_TRAVAIL_SIZE, CATEGORIES_DOCUMENT_TRAVAIL } from "@/lib/documentsTravail";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { validateUpload } from "@/lib/uploadSecurity";

// Contourne RLS via service role — documents_travail n'a aucune policy
// publique (migration 20260713000001), accès exclusivement via cette route.
// Bucket Storage "documents-travail" privé (jamais d'URL publique) — le
// téléchargement passe toujours par une URL signée à courte durée de vie.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const CATEGORIE_VALUES = CATEGORIES_DOCUMENT_TRAVAIL.map((c) => c.value);
const SIGNED_URL_EXPIRES_IN = 60;
// Aperçu (V3 Documents, 20/09/2026) : l'URL signée existante (60s) était
// pensée pour un téléchargement ponctuel, pas pour rester ouverte dans un
// visualiseur — fenêtre dédiée plus longue, sans toucher au téléchargement
// classique (décision validée avec Bryan).
const PREVIEW_URL_EXPIRES_IN = 300;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);
  const download = searchParams.get("download");
  const preview = searchParams.get("preview");
  if (download || preview) {
    const targetId = download || preview;
    const { data: doc } = await sb.from("documents_travail").select("url").eq("id", targetId!).eq("institution_id", authInstId).maybeSingle();
    if (!doc) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });
    const { data: signed, error: signErr } = await sb.storage.from("documents-travail").createSignedUrl(doc.url, preview ? PREVIEW_URL_EXPIRES_IN : SIGNED_URL_EXPIRES_IN);
    if (signErr || !signed) return NextResponse.json({ error: signErr?.message || "Erreur de génération d'URL" }, { status: 500 });
    return NextResponse.json({ url: signed.signedUrl });
  }

  // V3 Projets (20/09/2026, validé avec Bryan) — "même donnée, deux
  // contextes" (item 11) : filtre additif, aucun changement pour les
  // appelants existants (DocumentsSection.tsx n'envoie jamais ce paramètre).
  const projetId = searchParams.get("projet_id");
  let query = sb
    .from("documents_travail")
    .select("id,nom,description,categorie,taille,type_mime,membre_id,projet_id,uploaded_at")
    .eq("institution_id", authInstId)
    .order("uploaded_at", { ascending: false });
  if (projetId) query = query.eq("projet_id", projetId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const file = form.get("file");
  const nom = form.get("nom");
  const categorie = form.get("categorie");
  const description = form.get("description");
  const projetIdRaw = form.get("projet_id");
  const projetId = typeof projetIdRaw === "string" && projetIdRaw ? projetIdRaw : null;

  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  if (typeof categorie !== "string" || !CATEGORIE_VALUES.includes(categorie as (typeof CATEGORIE_VALUES)[number])) {
    return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
  }
  if (projetId) {
    const { data: projetExists } = await sb.from("projets").select("id").eq("institution_id", authInstId).eq("id", projetId).maybeSingle();
    if (!projetExists) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });
  }

  const displayName = typeof nom === "string" && nom.trim() ? nom.trim() : file.name;
  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "DOCUMENT_TRAVAIL", MAX_DOCUMENT_TRAVAIL_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });
  const path = `${authInstId}/${crypto.randomUUID()}.${verif.extension}`;

  const { error: upErr } = await sb.storage.from("documents-travail").upload(path, buffer, { contentType: verif.detectedType });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: inserted, error: insertErr } = await sb.from("documents_travail").insert({
    institution_id: authInstId,
    nom: displayName,
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    categorie,
    url: path,
    taille: file.size,
    type_mime: verif.detectedType,
    membre_id: membre.membreId,
    projet_id: projetId,
  }).select("id").single();
  if (insertErr) {
    await sb.storage.from("documents-travail").remove([path]);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await enregistrerAction({
    institutionId: authInstId,
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

// V3 Documents (20/09/2026, validé avec Bryan) : jusqu'ici aucune route ne
// permettait de corriger le nom/la catégorie/la description après upload
// ("Modifier" du brief était impossible à honorer). Ajout minimal, même
// patron que taches/route.ts::PATCH — jamais le fichier lui-même (rename
// uniquement les métadonnées, le binaire en Storage reste inchangé).
export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: doc } = await sb.from("documents_travail").select("membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });
  // Permissions par rôle : même règle que DELETE — "chacun gère le sien".
  if (membre.role !== "admin" && doc.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez modifier que les documents que vous avez ajoutés" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body?.nom === "string" && body.nom.trim()) updates.nom = body.nom.trim();
  if (typeof body?.categorie === "string") {
    if (!CATEGORIE_VALUES.includes(body.categorie as (typeof CATEGORIE_VALUES)[number])) return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
    updates.categorie = body.categorie;
  }
  if (typeof body?.description === "string" || body?.description === null) updates.description = body.description;
  if (typeof body?.projet_id === "string" || body?.projet_id === null) {
    if (typeof body.projet_id === "string") {
      const { data: projetExists } = await sb.from("projets").select("id").eq("institution_id", authInstId).eq("id", body.projet_id).maybeSingle();
      if (!projetExists) return NextResponse.json({ error: "Projet introuvable pour cette institution" }, { status: 404 });
    }
    updates.projet_id = body.projet_id;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Aucune modification fournie" }, { status: 400 });

  const { data, error } = await sb.from("documents_travail").update(updates).eq("id", id).eq("institution_id", authInstId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "document_modifie",
    cibleTable: "documents_travail",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "espace-travail") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: doc } = await sb.from("documents_travail").select("url,nom,membre_id").eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });
  // Permissions par rôle : "chacun ne gère que le sien" — un document n'a
  // pas de notion d'assignation, seulement d'auteur (membre_id = uploadé
  // par). Un non-admin ne peut supprimer que ce qu'il a lui-même uploadé.
  if (membre.role !== "admin" && doc.membre_id !== membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez supprimer que les documents que vous avez ajoutés" }, { status: 403 });
  }

  await sb.storage.from("documents-travail").remove([doc.url]);
  const { error } = await sb.from("documents_travail").delete().eq("id", id).eq("institution_id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
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
