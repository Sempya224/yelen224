import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { conversationFermee } from "@/lib/messagerie";
import { envoyerNotification } from "@/lib/notifications";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

// Upload d'image côté institution pour l'écran Messagerie dédié (Lot 2) —
// mirroring app/api/citoyen/messagerie/upload-image/route.ts, adapté à
// l'auth institution (JWT custom via getAuthenticatedMembre, pas de
// session Supabase Auth). Même bucket privé "messagerie-images".
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "mes_clients.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const rdvId = form.get("rdv_id");
  const legende = form.get("legende");
  const file = form.get("file");

  if (typeof rdvId !== "string" || !rdvId) return NextResponse.json({ error: "Rendez-vous manquant" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  if (!IMAGE_MIME.includes(file.type)) return NextResponse.json({ error: "Format non accepté (JPG, PNG, WEBP uniquement)" }, { status: 400 });
  if (file.size > MAX_IMAGE_SIZE) return NextResponse.json({ error: "Image trop volumineuse (10 Mo max)" }, { status: 400 });

  const { data: rdv } = await sb.from("rdv").select("id,citoyen_id,institution_id,statut").eq("id", rdvId).maybeSingle();
  if (!rdv || rdv.institution_id !== authInstId) {
    return NextResponse.json({ error: "Rendez-vous introuvable pour cette institution" }, { status: 404 });
  }
  if (conversationFermee(rdv.statut as string)) {
    return NextResponse.json({ error: "Ce rendez-vous est terminé — la conversation est fermée." }, { status: 409 });
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${rdvId}/${authInstId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from("messagerie-images").upload(path, buffer, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const legendeTexte = typeof legende === "string" && legende.trim() ? legende.trim() : null;
  const { error: insErr } = await sb.from("messages").insert({
    expediteur_institution_id: authInstId,
    destinataire_citoyen_id: rdv.citoyen_id,
    rdv_id: rdvId,
    contenu: legendeTexte,
    image_url: path,
    type: "image",
    lu: false,
  });
  if (insErr) {
    await sb.storage.from("messagerie-images").remove([path]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { data: inst } = await sb.from("institutions").select("name").eq("id", authInstId).maybeSingle();
  await envoyerNotification({
    destinataire_id: rdv.citoyen_id, destinataire_type: "citoyen", rdv_id: rdvId,
    type: "message", titre: "Nouveau message", message: `${inst?.name ?? "Votre établissement"} a envoyé une image`,
  });

  const { data: citoyen } = await sb.from("users").select("nom,prenom,phone").eq("id", rdv.citoyen_id).maybeSingle();
  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "message_envoye",
    cibleTable: "messages",
    cibleId: rdv.citoyen_id,
    details: { client_id: rdv.citoyen_id, client_nom: buildNom(citoyen ?? undefined) },
    req,
  });

  const { data: signed } = await sb.storage.from("messagerie-images").createSignedUrl(path, 3600);
  return NextResponse.json({ success: true, path, url: signed?.signedUrl ?? null });
}
