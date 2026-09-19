import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { validateUpload } from "@/lib/uploadSecurity";

// Module Collaboration — Lot D (16/09/2026). Fichier joint = un nouveau
// message (contenu = légende optionnelle, jamais fabriquée). Bucket privé
// "collaboration-fichiers" — à créer manuellement (voir CLAUDE.md
// /actions-manuelles-en-attente), même convention que les autres buckets
// institution (documents-employes, signalements-preuves...).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MAX_FICHIER_SIZE = 15 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "collaboration.upload_file", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id } = await params;

  const { data: participation } = await sb.from("collab_conversation_membres").select("id").eq("conversation_id", id).eq("membre_id", membre.membreId).eq("statut", "active").maybeSingle();
  if (!participation) return NextResponse.json({ error: "Cette conversation est introuvable ou vous n'y avez plus accès." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  const file = form.get("file");
  const legende = form.get("legende");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choisissez un fichier à envoyer." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "COLLAB_FICHIER", MAX_FICHIER_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });

  const path = `${id}/${crypto.randomUUID()}.${verif.extension}`;
  const { error: upErr } = await sb.storage.from("collaboration-fichiers").upload(path, buffer, { contentType: verif.detectedType });
  if (upErr) return NextResponse.json({ error: "L'envoi du fichier a échoué. Réessayez." }, { status: 500 });

  const legendeTexte = typeof legende === "string" && legende.trim() ? legende.trim() : null;
  const { data: message, error } = await sb
    .from("collab_messages")
    .insert({
      conversation_id: id, auteur_membre_id: membre.membreId, contenu: legendeTexte,
      fichier_path: path, fichier_nom: file.name.slice(0, 255), fichier_taille: buffer.byteLength, fichier_type: verif.detectedType,
    })
    .select("id,cree_le")
    .single();
  if (error) {
    await sb.storage.from("collaboration-fichiers").remove([path]).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await sb.from("collab_conversations").update({ mis_a_jour_le: message.cree_le }).eq("id", id);
  await sb.from("collab_conversation_membres").update({ dernier_lu_le: message.cree_le }).eq("id", participation.id);

  return NextResponse.json({ id: message.id, cree_le: message.cree_le });
}
