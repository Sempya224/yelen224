import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { conversationFermee } from "@/lib/messagerie";
import { envoyerNotification } from "@/lib/notifications";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { validateUpload } from "@/lib/uploadSecurity";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

  const { data: rdv } = await sb.from("rdv").select("id,citoyen_id,institution_id,statut").eq("id", rdvId).maybeSingle();
  if (!rdv || rdv.institution_id !== authInstId) {
    return NextResponse.json({ error: "Rendez-vous introuvable pour cette institution" }, { status: 404 });
  }
  if (conversationFermee(rdv.statut as string)) {
    return NextResponse.json({ error: "Ce rendez-vous est terminé — la conversation est fermée." }, { status: 409 });
  }

  // Restriction messagerie institution → citoyen pendant une suspension —
  // même garde-fou que POST /api/institution/messages, vérifié avant
  // l'upload pour ne pas consommer de stockage inutilement.
  const { data: inst } = await sb.from("institutions").select("name,statut").eq("id", authInstId).maybeSingle();
  if (inst?.statut === "suspendue") {
    return NextResponse.json({ error: "Votre établissement est suspendu — vous ne pouvez pas envoyer de nouveaux messages aux citoyens pour le moment. Besoin de parler à un agent ? Contactez le support Yelen ou demandez une révision depuis l'écran d'accueil." }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "MESSAGE_IMAGE", MAX_IMAGE_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });
  const path = `${rdvId}/${authInstId}/${crypto.randomUUID()}.${verif.extension}`;
  const { error: upErr } = await sb.storage.from("messagerie-images").upload(path, buffer, { contentType: verif.detectedType });
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
