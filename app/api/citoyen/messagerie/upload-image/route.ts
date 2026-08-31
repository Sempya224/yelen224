import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { conversationFermee, messageInstitutionSuspendue } from "@/lib/messagerie";
import { envoyerNotification } from "@/lib/notifications";
import { validateUpload } from "@/lib/uploadSecurity";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Upload d'image pour la messagerie citoyen (onglets Yelen et
// Établissements) — passe par service_role car le bucket "messagerie-images"
// est privé (URLs signées uniquement, jamais d'accès public direct à une
// image échangée en conversation). Insère aussi la ligne message
// correspondante dans le même appel (image_url = chemin Storage, pas une
// URL) : pour l'onglet Établissements, ce write contourne volontairement
// messages_valider_rdv_conversation_trigger (exempté pour service_role) —
// cette route revalide donc elle-même que le rdv appartient au citoyen et
// n'est pas dans un état terminal, exactement la règle que le trigger
// applique aux écritures directes du client.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const accessToken = form.get("accessToken");
    const target = form.get("target"); // "yelen" | "etablissement"
    const rdvId = form.get("rdv_id");
    const legende = form.get("legende");
    const file = form.get("file");

    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (target !== "yelen" && target !== "etablissement") {
      return NextResponse.json({ error: "Cible invalide", code: "BAD_REQUEST" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier requis", code: "MISSING_FILE" }, { status: 400 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });

    let finalInstitutionId: string | null = null;
    if (target === "etablissement") {
      if (typeof rdvId !== "string" || !rdvId) {
        return NextResponse.json({ error: "Rendez-vous manquant", code: "MISSING_FIELDS" }, { status: 400 });
      }
      const { data: rdv } = await supabaseAdmin.from("rdv").select("citoyen_id,institution_id,statut").eq("id", rdvId).maybeSingle();
      if (!rdv || rdv.citoyen_id !== user.id) {
        return NextResponse.json({ error: "Rendez-vous introuvable", code: "NOT_FOUND" }, { status: 404 });
      }
      if (conversationFermee(rdv.statut)) {
        return NextResponse.json({ error: "Cette conversation est fermée, ce rendez-vous est terminé.", code: "CONVERSATION_FERMEE" }, { status: 409 });
      }
      finalInstitutionId = rdv.institution_id;

      // Restriction messagerie citoyen → institution suspendue (retour
      // Bryan 17/08/2026) — cette route sert aussi les images, contournée
      // par le blocage UI (bouton caméra masqué avec le reste de la zone
      // de saisie) mais jamais vérifiée côté serveur jusqu'ici, contrairement
      // au texte (lib/messagerie.ts::sendMessageRdv) : trou de sécurité réel
      // comblé ici, même barrière, même message personnalisé.
      const { data: inst } = await supabaseAdmin.from("institutions").select("statut,name").eq("id", finalInstitutionId).maybeSingle();
      if (inst?.statut === "suspendue") {
        return NextResponse.json({ error: messageInstitutionSuspendue(inst.name || "Cet établissement"), code: "INSTITUTION_SUSPENDED" }, { status: 403 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const verif = await validateUpload(buffer, "MESSAGE_IMAGE", MAX_IMAGE_SIZE, file.name);
    if (!verif.valid) return NextResponse.json({ error: verif.reason, code: "INVALID_FORMAT" }, { status: 400 });
    const folder = target === "yelen" ? `yelen/${user.id}` : `${rdvId}/${user.id}`;
    const path = `${folder}/${crypto.randomUUID()}.${verif.extension}`;
    const { error: upErr } = await supabaseAdmin.storage.from("messagerie-images").upload(path, buffer, { contentType: verif.detectedType });
    if (upErr) return NextResponse.json({ error: upErr.message, code: "UPLOAD_ERROR" }, { status: 500 });

    const legendeTexte = typeof legende === "string" && legende.trim() ? legende.trim() : null;

    if (target === "yelen") {
      const { error: insErr } = await supabaseAdmin.from("messages_yelen_citoyen").insert({
        citoyen_id: user.id, expediteur: "citoyen", contenu: legendeTexte, image_url: path, type: "image", lu: false,
      });
      if (insErr) {
        await supabaseAdmin.storage.from("messagerie-images").remove([path]);
        return NextResponse.json({ error: insErr.message, code: "INSERT_ERROR" }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabaseAdmin.from("messages").insert({
        expediteur_citoyen_id: user.id, destinataire_institution_id: finalInstitutionId, rdv_id: rdvId,
        contenu: legendeTexte, image_url: path, type: "image", lu: false,
      });
      if (insErr) {
        await supabaseAdmin.storage.from("messagerie-images").remove([path]);
        return NextResponse.json({ error: insErr.message, code: "INSERT_ERROR" }, { status: 500 });
      }
      const { data: u } = await supabaseAdmin.from("users").select("nom,prenom").eq("id", user.id).maybeSingle();
      const nomCitoyen = [u?.prenom, u?.nom].filter(Boolean).join(" ") || "Un client";
      await envoyerNotification({
        destinataire_id: finalInstitutionId!, destinataire_type: "institution", rdv_id: rdvId as string,
        type: "message", titre: "Nouveau message", message: `${nomCitoyen} a envoyé une image`,
      });
    }

    const { data: signed } = await supabaseAdmin.storage.from("messagerie-images").createSignedUrl(path, 3600);
    return NextResponse.json({ success: true, path, url: signed?.signedUrl ?? null });
  } catch (error) {
    console.error("[MESSAGERIE IMAGE UPLOAD ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
