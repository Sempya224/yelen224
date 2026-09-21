import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { validateUpload } from "@/lib/uploadSecurity";
import { ajouterPieceJointe } from "@/lib/signalements";

// Signalements — Lot 1. Pièces jointes multiples (remplace preuve_url pour
// tout nouveau signalement), bucket privé "signalements-preuves", jamais
// une URL publique directe — GET ?download= renvoie une URL signée 60s.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MAX_PREUVE_SIZE = 10 * 1024 * 1024;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  const download = req.nextUrl.searchParams.get("download");

  if (download) {
    const { data: att } = await sb.from("signalement_attachments").select("storage_path")
      .eq("id", download).eq("signalement_id", id).eq("institution_id", membre.institutionId).maybeSingle();
    if (!att) return NextResponse.json({ error: "Pièce jointe introuvable pour cette institution" }, { status: 404 });
    const { data: signed, error: signErr } = await sb.storage.from("signalements-preuves").createSignedUrl(att.storage_path, 60);
    if (signErr || !signed) return NextResponse.json({ error: signErr?.message || "Erreur de génération d'URL" }, { status: 500 });
    return NextResponse.json({ url: signed.signedUrl });
  }

  const { data, error } = await sb.from("signalement_attachments")
    .select("id, nom_original, type_mime, taille, ajoute_par_nom, created_at")
    .eq("signalement_id", id).eq("institution_id", membre.institutionId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attachments: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "signalements.attachments_write")) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  const { id } = await params;

  const { data: signalement } = await sb.from("signalements").select("id").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!signalement) return NextResponse.json({ error: "Signalement introuvable pour cette institution" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "SIGNALEMENT_PREUVE", MAX_PREUVE_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });

  const path = `${membre.institutionId}/${id}/${crypto.randomUUID()}.${verif.extension}`;
  const { error: upErr } = await sb.storage.from("signalements-preuves").upload(path, buffer, { contentType: verif.detectedType });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: membreRow } = await sb.from("institution_membres").select("prenom, nom").eq("id", membre.membreId).maybeSingle();
  const resultat = await ajouterPieceJointe({
    signalementId: id, institutionId: membre.institutionId, storagePath: path,
    nomOriginal: file.name, typeMime: verif.detectedType, taille: file.size,
    auteur: { membreId: membre.membreId, nom: membreRow ? `${membreRow.prenom} ${membreRow.nom}` : "Membre" },
    req,
  });
  if (!resultat.ok) {
    await sb.storage.from("signalements-preuves").remove([path]);
    return NextResponse.json({ error: resultat.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: resultat.id });
}
