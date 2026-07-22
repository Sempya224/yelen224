import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Lots D+E fusionnés (chantier "Activités passées" citoyen, 18/07/2026) —
// agrège tout ce qui a été confirmé réel lors de l'audit (voir CLAUDE.md
// /chantier-activites-passees-citoyen) : compte, connexions, cycle de vie
// RDV (table rdv_events, jusqu'ici accessible seulement en service_role),
// présence QR/RDV manqué (dérivé de rdv, pas de second scan), paiements,
// favoris, avis + réponses, biométrie, documents citoyen. Remplace
// entièrement "Historique des scans QR" (le QR n'est plus qu'un type
// d'activité parmi d'autres).
export type Activite = {
  id: string;
  type: string;
  categorie: "rdv" | "qr" | "paiement" | "avis" | "favori" | "document" | "compte";
  titre: string;
  description: string | null;
  institution_nom: string | null;
  institution_id: string | null;
  date: string;
  statut: "succes" | "attente" | "annule" | "echec";
  statut_label: string;
  meta: Record<string, unknown>;
};

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    const citoyenId = user.id;

    const [
      { data: profil },
      { data: appareils },
      { data: rdvRows },
      { data: bookings },
      { data: favoris },
      { data: avisRows },
      { data: credentials },
      { data: documents },
    ] = await Promise.all([
      supabaseAdmin.from("users").select("created_at").eq("id", citoyenId).single(),
      supabaseAdmin.from("citoyen_remember_tokens").select("device_label,created_at").eq("citoyen_id", citoyenId),
      supabaseAdmin.from("rdv").select("id,institution_id,date_rdv,heure_rdv,objet,statut,presence_status,presence_confirmed_at,created_at").eq("citoyen_id", citoyenId),
      supabaseAdmin.from("paid_bookings").select("id,institution_id,statut,montant_paye,methode_paiement,created_at,paid_services(nom)").eq("citoyen_id", citoyenId),
      supabaseAdmin.from("citoyen_favoris").select("institution_id,created_at").eq("citoyen_id", citoyenId),
      supabaseAdmin.from("avis").select("id,institution_id,note,titre,commentaire,created_at,reponse_institution,reponse_le").eq("citoyen_id", citoyenId).eq("brouillon", false),
      supabaseAdmin.from("citoyen_webauthn_credentials").select("device_label,created_at").eq("citoyen_id", citoyenId),
      supabaseAdmin.from("citoyen_documents").select("id,institution_id,sens,type,label,statut,created_at,traite_le").eq("citoyen_id", citoyenId),
    ]);

    const rdvIds = (rdvRows ?? []).map((r) => r.id);
    const { data: rdvEvents } = rdvIds.length
      ? await supabaseAdmin
          .from("rdv_events")
          .select("rdv_id,action,ancien_statut,nouveau_statut,motif,created_at")
          .in("rdv_id", rdvIds)
          .in("action", ["creation", "report", "annulation", "termine", "absent"])
      : { data: [] };

    const rdvMap = new Map((rdvRows ?? []).map((r) => [r.id, r]));

    // Noms d'établissement — batch unique sur tous les institution_id rencontrés.
    const institutionIds = new Set<string>();
    for (const r of rdvRows ?? []) institutionIds.add(r.institution_id);
    for (const b of bookings ?? []) institutionIds.add(b.institution_id);
    for (const f of favoris ?? []) institutionIds.add(f.institution_id);
    for (const a of avisRows ?? []) institutionIds.add(a.institution_id);
    for (const d of documents ?? []) institutionIds.add(d.institution_id);
    const { data: institutions } = institutionIds.size
      ? await supabaseAdmin.from("institutions").select("id,name").in("id", [...institutionIds])
      : { data: [] };
    const instMap = new Map((institutions ?? []).map((i) => [i.id, i.name]));

    const activites: Activite[] = [];

    if (profil?.created_at) {
      activites.push({
        id: "compte-creation", type: "compte_cree", categorie: "compte",
        titre: "Compte créé", description: "Bienvenue sur Yelen", institution_nom: null, institution_id: null,
        date: profil.created_at, statut: "succes", statut_label: "Créé", meta: {},
      });
    }

    for (const a of appareils ?? []) {
      activites.push({
        id: `connexion-${a.created_at}`, type: "connexion", categorie: "compte",
        titre: "Nouvel appareil connecté", description: a.device_label ?? "Appareil", institution_nom: null, institution_id: null,
        date: a.created_at, statut: "succes", statut_label: "Connecté", meta: {},
      });
    }

    for (const c of credentials ?? []) {
      activites.push({
        id: `biometrie-${c.created_at}`, type: "biometrie", categorie: "compte",
        titre: "Biométrie activée", description: c.device_label ?? "Appareil", institution_nom: null, institution_id: null,
        date: c.created_at, statut: "succes", statut_label: "Activée", meta: {},
      });
    }

    const RDV_EVENT_INFO: Record<string, { titre: string; statut: Activite["statut"]; label: string }> = {
      creation:  { titre: "Rendez-vous réservé",  statut: "succes", label: "Réservé" },
      report:    { titre: "Rendez-vous reporté",  statut: "attente", label: "Reporté" },
      annulation:{ titre: "Rendez-vous annulé",   statut: "annule", label: "Annulé" },
      termine:   { titre: "Rendez-vous terminé",  statut: "succes", label: "Terminé" },
      absent:    { titre: "Absence constatée",    statut: "echec", label: "Absent" },
    };
    for (const e of rdvEvents ?? []) {
      const rdv = rdvMap.get(e.rdv_id);
      const info = RDV_EVENT_INFO[e.action];
      if (!rdv || !info) continue;
      activites.push({
        id: `rdv-event-${e.rdv_id}-${e.action}-${e.created_at}`, type: `rdv_${e.action}`, categorie: "rdv",
        titre: info.titre, description: rdv.objet, institution_nom: instMap.get(rdv.institution_id) ?? null, institution_id: rdv.institution_id,
        date: e.created_at, statut: info.statut, statut_label: info.label,
        meta: { rdv_id: rdv.id, date_rdv: rdv.date_rdv, heure_rdv: rdv.heure_rdv, motif: e.motif },
      });
    }

    const now = new Date();
    for (const r of rdvRows ?? []) {
      if (r.presence_confirmed_at) {
        activites.push({
          id: `qr-${r.id}`, type: "qr_presence", categorie: "qr",
          titre: "Présence confirmée", description: r.objet, institution_nom: instMap.get(r.institution_id) ?? null, institution_id: r.institution_id,
          date: r.presence_confirmed_at, statut: "succes", statut_label: "Succès",
          meta: { rdv_id: r.id, date_rdv: r.date_rdv, heure_rdv: r.heure_rdv },
        });
      } else if (r.statut !== "annule" && new Date(`${r.date_rdv}T${r.heure_rdv || "00:00"}`) < now) {
        // "RDV manqué" — dérivé de l'absence de scan, pas un second scan de
        // sortie (décision de Bryan : "on dit RDV manqué si pas scanner
        // présence confirmée", aucune nouvelle donnée nécessaire).
        activites.push({
          id: `rdv-manque-${r.id}`, type: "rdv_manque", categorie: "qr",
          titre: "Rendez-vous manqué", description: r.objet, institution_nom: instMap.get(r.institution_id) ?? null, institution_id: r.institution_id,
          date: `${r.date_rdv}T${r.heure_rdv || "00:00"}`, statut: "echec", statut_label: "Manqué",
          meta: { rdv_id: r.id, date_rdv: r.date_rdv, heure_rdv: r.heure_rdv },
        });
      }
    }

    const PAIEMENT_STATUT: Record<string, { statut: Activite["statut"]; label: string }> = {
      confirme: { statut: "succes", label: "Réussi" }, paye: { statut: "succes", label: "Réussi" },
      en_attente: { statut: "attente", label: "En attente" }, annule: { statut: "annule", label: "Annulé" },
      rembourse: { statut: "succes", label: "Remboursé" },
    };
    for (const b of bookings ?? []) {
      const info = PAIEMENT_STATUT[b.statut] ?? { statut: "attente" as const, label: b.statut };
      const service = (b.paid_services as unknown as { nom: string } | null)?.nom;
      activites.push({
        id: `paiement-${b.id}`, type: "paiement", categorie: "paiement",
        titre: b.statut === "rembourse" ? "Remboursement" : "Paiement effectué",
        description: [service, b.montant_paye ? `${b.montant_paye.toLocaleString("fr-FR")} GNF` : null].filter(Boolean).join(" · ") || null,
        institution_nom: instMap.get(b.institution_id) ?? null, institution_id: b.institution_id,
        date: b.created_at, statut: info.statut, statut_label: info.label,
        meta: { montant: b.montant_paye, methode: b.methode_paiement },
      });
    }

    for (const f of favoris ?? []) {
      activites.push({
        id: `favori-${f.institution_id}-${f.created_at}`, type: "favori", categorie: "favori",
        titre: "Ajouté aux favoris", description: null, institution_nom: instMap.get(f.institution_id) ?? null, institution_id: f.institution_id,
        date: f.created_at, statut: "succes", statut_label: "Ajouté", meta: {},
      });
    }

    for (const a of avisRows ?? []) {
      activites.push({
        id: `avis-${a.id}`, type: "avis_publie", categorie: "avis",
        titre: "Avis publié", description: a.titre ?? a.commentaire, institution_nom: instMap.get(a.institution_id) ?? null, institution_id: a.institution_id,
        date: a.created_at, statut: "succes", statut_label: "Publié", meta: { note: a.note },
      });
      if (a.reponse_institution && a.reponse_le) {
        activites.push({
          id: `avis-reponse-${a.id}`, type: "avis_reponse", categorie: "avis",
          titre: "Réponse reçue à votre avis", description: a.reponse_institution, institution_nom: instMap.get(a.institution_id) ?? null, institution_id: a.institution_id,
          date: a.reponse_le, statut: "succes", statut_label: "Reçue", meta: { note: a.note },
        });
      }
    }

    const DOC_STATUT: Record<string, { statut: Activite["statut"]; label: string }> = {
      en_attente: { statut: "attente", label: "En attente" }, televerse: { statut: "succes", label: "Reçu" },
      envoye: { statut: "succes", label: "Envoyé" }, annule: { statut: "annule", label: "Annulé" },
    };
    for (const d of documents ?? []) {
      const info = DOC_STATUT[d.statut] ?? { statut: "attente" as const, label: d.statut };
      activites.push({
        id: `document-${d.id}`, type: d.sens === "demande" ? "document_demande" : "document_envoye", categorie: "document",
        titre: d.sens === "demande" ? "Document demandé" : "Document reçu",
        description: d.label, institution_nom: instMap.get(d.institution_id) ?? null, institution_id: d.institution_id,
        date: d.created_at, statut: info.statut, statut_label: info.label,
        meta: { document_id: d.id, sens: d.sens, type: d.type },
      });
    }

    activites.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ success: true, activites });
  } catch (error) {
    console.error("[CITOYEN ACTIVITES ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
