import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Lot C (chantier Confidentialité citoyen) — "Télécharger mes données".
// Un seul fichier JSON regroupant tout ce qui est rattaché au compte,
// noms de colonnes vérifiés par grep dans le code réel plutôt que dans
// l'audit schéma de CLAUDE.md (périmé sur plusieurs tables — notamment
// `institutions.name`/`logo`, pas `nom`/`logo_url` comme documenté le
// 07/07/2026, et `messages.cree_le`, pas `created_at`). Exclut
// volontairement les secrets (pin_hash, credential_id/public_key,
// token_hash) — jamais exportés, même vers le propriétaire du compte.
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const [
      { data: profil },
      { data: rdvRaw },
      { data: avis },
      { data: signalements },
      { data: messagesRaw },
      { data: notifications },
      { data: credentials },
      { data: appareilsMemorises },
      { data: prefsVisibilite },
      { data: prefsPartage },
      { data: prefsCommunication },
    ] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("nom,prenom,phone,email,ville,date_naissance,sexe,nationalite,profession,adresse,photo_url,created_at,cgu_acceptee_le,confidentialite_acceptee_le")
        .eq("id", user.id)
        .single(),
      supabaseAdmin
        .from("rdv")
        .select("id,date_rdv,heure_rdv,objet,statut,notes,presence_status,institution_id,institutions!rdv_institution_id_fkey(name)")
        .eq("citoyen_id", user.id)
        .order("date_rdv", { ascending: false }),
      // Pas de qualificateur !fkey ici (contrairement à rdv) — non
      // confirmé par grep dans le code existant, laissé à PostgREST de
      // résoudre via l'unique FK avis→institutions plutôt que deviner un
      // nom de contrainte qui casserait toute la requête s'il est faux.
      supabaseAdmin
        .from("avis")
        .select("id,note,commentaire,created_at,institution_id,institutions(name)")
        .eq("citoyen_id", user.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("signalements")
        .select("id,titre,motif,statut,created_at,institution_id")
        .eq("citoyen_id", user.id)
        .eq("type_signaleur", "citoyen")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("messages")
        .select("id,contenu,lu,cree_le,expediteur_citoyen_id,expediteur_institution_id,destinataire_institution_id")
        .or(`expediteur_citoyen_id.eq.${user.id},destinataire_citoyen_id.eq.${user.id}`)
        .order("cree_le", { ascending: true }),
      supabaseAdmin
        .from("notifications")
        .select("id,titre,message,type,lu,created_at")
        .eq("destinataire_id", user.id)
        .eq("destinataire_type", "citoyen")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("citoyen_webauthn_credentials")
        .select("device_label,created_at,last_used_at")
        .eq("citoyen_id", user.id),
      supabaseAdmin
        .from("citoyen_remember_tokens")
        .select("device_label,user_agent,ip,created_at,expires_at,last_used_at")
        .eq("citoyen_id", user.id),
      supabaseAdmin.from("citoyen_prefs_visibilite").select("champs_visibles,profil_public").eq("citoyen_id", user.id).maybeSingle(),
      supabaseAdmin.from("citoyen_prefs_partage").select("partage_historique_rdv,partage_historique_services").eq("citoyen_id", user.id).maybeSingle(),
      supabaseAdmin.from("citoyen_communication_prefs").select("communications_yelen,communications_etablissements,personnalisation").eq("citoyen_id", user.id).maybeSingle(),
    ]);

    const exportData = {
      genere_le: new Date().toISOString(),
      profil,
      rendez_vous: (rdvRaw ?? []).map((r) => ({
        date_rdv: r.date_rdv, heure_rdv: r.heure_rdv, objet: r.objet, statut: r.statut,
        notes: r.notes, presence_status: r.presence_status,
        institution: (r.institutions as unknown as { name: string } | null)?.name ?? null,
      })),
      avis: (avis ?? []).map((a) => ({
        note: a.note, commentaire: a.commentaire, created_at: a.created_at,
        institution: (a.institutions as unknown as { name: string } | null)?.name ?? null,
      })),
      signalements: (signalements ?? []).map((s) => ({ titre: s.titre, motif: s.motif, statut: s.statut, created_at: s.created_at })),
      messages: (messagesRaw ?? []).map((m) => ({
        contenu: m.contenu, lu: m.lu, envoye_le: m.cree_le,
        auteur: m.expediteur_citoyen_id === user.id ? "moi" : "institution",
      })),
      notifications: (notifications ?? []).map((n) => ({ titre: n.titre, message: n.message, type: n.type, lu: n.lu, created_at: n.created_at })),
      securite: {
        appareils_biometriques: (credentials ?? []).map((c) => ({ nom: c.device_label, ajoute_le: c.created_at, derniere_utilisation: c.last_used_at })),
        appareils_memorises: (appareilsMemorises ?? []).map((d) => ({ nom: d.device_label, navigateur: d.user_agent, ip: d.ip, connecte_le: d.created_at, expire_le: d.expires_at, derniere_utilisation: d.last_used_at })),
      },
      preferences_confidentialite: {
        visibilite: prefsVisibilite ?? "non renseigné (valeurs par défaut)",
        partage: prefsPartage ?? "non renseigné (valeurs par défaut)",
        communication: prefsCommunication ?? "non renseigné (valeurs par défaut)",
      },
    };

    const filename = `yelen224-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[CITOYEN DONNEES EXPORT ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
