import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";
import { composerMessageRestriction } from "@/lib/changementsProfilAffichage";

// Restriction de l'accès citoyen à la suite de l'examen d'une proposition de
// changement de profil (Lot 3, docs/product/YELEN_REVERIFICATION_POLICY.md) :
// l'admin a vérifié et les documents Yelen ne correspondent pas. Réutilise la
// SUSPENSION existante (statut « suspendue », référence SUS-…, annulation des RDV
// imminents, écran « Espace suspendu » avec droit de révision, levée automatique
// ou manuelle) — aucune seconde mécanique. Écriture exclusivement via
// restreindre_acces_changement_profil : statut, suspension, événement du journal
// de la demande et admin_logs dans UNE transaction. Permission institutions.manage
// (comme la suspension), pas institutions.verify : restreindre un établissement est
// une action de gestion, pas de simple vérification. L'administrateur vient de la
// session ; l'établissement, de la demande en base.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOTIF_MAX = 1000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(req, "institutions.manage");
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Identifiant de demande invalide" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    const { motif, duree_jours, confirme } = body as { motif?: unknown; duree_jours?: unknown; confirme?: unknown };

    // Action lourde (l'établissement disparaît pour les citoyens, les RDV imminents
    // sont annulés) : confirmation explicite exigée côté serveur, pas seulement dans l'interface.
    if (confirme !== true) {
      return NextResponse.json({ error: "Confirmation requise pour restreindre l'accès citoyen." }, { status: 400 });
    }
    if (typeof motif !== "string" || !motif.trim()) {
      return NextResponse.json({ error: "Un motif est obligatoire pour restreindre l'accès." }, { status: 400 });
    }
    if (motif.trim().length > MOTIF_MAX) {
      return NextResponse.json({ error: `Le motif ne doit pas dépasser ${MOTIF_MAX} caractères.` }, { status: 400 });
    }
    let duree: number | null = null;
    if (duree_jours !== undefined && duree_jours !== null) {
      if (typeof duree_jours !== "number" || !Number.isInteger(duree_jours) || duree_jours < 1 || duree_jours > 365) {
        return NextResponse.json({ error: "Durée invalide (1 à 365 jours)" }, { status: 400 });
      }
      duree = duree_jours;
    }

    const { data, error } = await sb.rpc("restreindre_acces_changement_profil", {
      p_demande_id: id,
      p_admin_id: admin.adminId,
      p_motif: motif.trim(),
      p_duree_jours: duree,
    });
    if (error) {
      if (error.message.includes("n'est plus a l'etat a_examiner")) {
        return NextResponse.json({ error: "Cette demande a déjà été traitée entretemps.", code: "CONFLIT_CONCURRENCE" }, { status: 409 });
      }
      if (error.message.includes("deja restreint ou non public")) {
        return NextResponse.json({ error: "Cet établissement est déjà restreint ou n'est pas public.", code: "DEJA_RESTREINT" }, { status: 409 });
      }
      console.error("[ADMIN CHANGEMENTS PROFIL] restreindre_acces:", error.code);
      return NextResponse.json({ error: "Erreur lors de la restriction d'accès." }, { status: 500 });
    }

    const r = (typeof data === "object" && data !== null ? data : {}) as { reference?: unknown; jusqu_au?: unknown };
    const notifie = await notifierRestriction(data, motif.trim());
    return NextResponse.json({ ok: true, reference: typeof r.reference === "string" ? r.reference : null, notifie });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}

// Best-effort : la restriction est déjà enregistrée (transaction terminée), un échec
// d'envoi est seulement journalisé — il ne doit jamais la faire passer pour échouée.
async function notifierRestriction(resultat: unknown, motif: string): Promise<boolean> {
  try {
    const r = (typeof resultat === "object" && resultat !== null ? resultat : {}) as {
      institution_id?: unknown; champ?: unknown; reference?: unknown; jusqu_au?: unknown; name?: unknown;
    };
    if (typeof r.institution_id !== "string" || typeof r.champ !== "string" || typeof r.reference !== "string") throw new Error("réponse incomplète");
    await envoyerNotification({
      destinataireId: r.institution_id,
      destinataireType: "institution",
      rdvId: null,
      type: "institution_suspendue",
      titre: salutation(typeof r.name === "string" && r.name ? r.name : "votre équipe"),
      message: composerMessageRestriction(r.champ, motif, r.reference, typeof r.jusqu_au === "string" ? r.jusqu_au : null),
    });
    return true;
  } catch (e) {
    console.error("[ADMIN CHANGEMENTS PROFIL] notification restriction:", e instanceof Error ? e.message : "erreur inconnue");
    return false;
  }
}
