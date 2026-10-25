import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";
import { composerMessageExamen } from "@/lib/changementsProfilAffichage";
import { generateInstitutionSlug } from "@/lib/institutionSlug";

// Décision sur une demande d'examen de changement de profil — publication
// différée (docs/product/YELEN_REVERIFICATION_POLICY.md). Écriture
// exclusivement via decider_changement_profil (migration 20261020000001) :
// transition d'état, PUBLICATION de la proposition à l'approbation (conforme),
// ligne admin_logs et verrouillage optimiste dans UNE transaction. Un refus
// (a_corriger) laisse la valeur publiée inchangée. L'administrateur vient de la
// session, jamais du corps de la requête.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(req, "institutions.verify");
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Identifiant de demande invalide" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    const { decision, commentaire, statut_vu } = body as { decision?: unknown; commentaire?: unknown; statut_vu?: unknown };

    if (decision !== "conforme" && decision !== "a_corriger") {
      return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
    }
    if (commentaire !== undefined && commentaire !== null && typeof commentaire !== "string") {
      return NextResponse.json({ error: "Commentaire invalide" }, { status: 400 });
    }
    if (decision === "a_corriger" && (typeof commentaire !== "string" || !commentaire.trim())) {
      return NextResponse.json({ error: "Un commentaire est obligatoire pour refuser une proposition." }, { status: 400 });
    }
    if (typeof statut_vu !== "string") {
      return NextResponse.json({ error: "Statut vu requis" }, { status: 400 });
    }

    // Slug : racine des URLs /{slug}/{id}/… du tableau de bord, dérivé du nom.
    // Il n'est regénéré qu'au moment où un NOUVEAU NOM est publié (approbation).
    // La proposition (champ, valeur, établissement) est lue en base — jamais
    // fournie par le client.
    let slug: string | null = null;
    if (decision === "conforme") {
      const { data: demande, error: lectureError } = await sb
        .from("institution_change_requests")
        .select("institution_id,champ,nouvelle_valeur")
        .eq("id", id)
        .maybeSingle();
      if (lectureError) {
        console.error("[ADMIN CHANGEMENTS PROFIL] lecture demande:", lectureError.code);
        return NextResponse.json({ error: "Erreur lors de l'enregistrement de la décision." }, { status: 500 });
      }
      if (demande && demande.champ === "name" && typeof demande.nouvelle_valeur === "string" && demande.nouvelle_valeur.trim()) {
        slug = await generateInstitutionSlug(sb, demande.nouvelle_valeur, demande.institution_id);
      }
    }

    const { data, error } = await sb.rpc("decider_changement_profil", {
      p_demande_id: id,
      p_decision: decision,
      p_commentaire: typeof commentaire === "string" ? commentaire : null,
      p_examinateur_admin_id: admin.adminId,
      p_statut_vu: statut_vu,
      p_slug: slug,
    });

    if (error) {
      if (error.message.includes("deja ete traitee entretemps") || error.message.includes("n'est plus a l'etat a_examiner")) {
        return NextResponse.json({ error: "Cette demande a déjà été traitée entretemps.", code: "CONFLIT_CONCURRENCE" }, { status: 409 });
      }
      console.error("[ADMIN CHANGEMENTS PROFIL] decider_changement_profil:", error.code);
      return NextResponse.json({ error: "Erreur lors de l'enregistrement de la décision." }, { status: 500 });
    }

    // L'établissement est prévenu de la réponse de l'équipe Yelen (notification
    // dans sa cloche + push). Best-effort : la décision est déjà enregistrée
    // (transaction SQL terminée), un échec de notification ne doit jamais la
    // faire passer pour échouée — il est seulement journalisé côté serveur.
    const notifie = await notifierEtablissement(data, decision, typeof commentaire === "string" ? commentaire : null);

    return NextResponse.json({ ok: true, decision: data, notifie });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}

// Destinataire et champ viennent de la réponse de la fonction SQL (donc de la
// demande en base), jamais du corps de la requête : un administrateur ne peut
// pas diriger la notification ailleurs.
async function notifierEtablissement(resultat: unknown, decision: "conforme" | "a_corriger", commentaire: string | null): Promise<boolean> {
  try {
    const r = (typeof resultat === "object" && resultat !== null ? resultat : {}) as { institution_id?: unknown; champ?: unknown };
    if (typeof r.institution_id !== "string" || typeof r.champ !== "string") throw new Error("réponse de décision incomplète");

    const { data: institution } = await sb.from("institutions").select("name").eq("id", r.institution_id).maybeSingle();

    await envoyerNotification({
      destinataireId: r.institution_id,
      destinataireType: "institution",
      rdvId: null,
      type: "changement_profil_examine",
      titre: salutation(institution?.name || "votre équipe"),
      message: composerMessageExamen(r.champ, decision, commentaire),
    });
    return true;
  } catch (e) {
    console.error("[ADMIN CHANGEMENTS PROFIL] notification établissement:", e instanceof Error ? e.message : "erreur inconnue");
    return false;
  }
}
