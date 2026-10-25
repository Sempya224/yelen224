import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";
import { composerMessageComplement } from "@/lib/changementsProfilAffichage";
import { estTypeDocument, LIBELLE_TYPE_DOCUMENT } from "@/lib/documentsInstitution";

// Demande de complément sur une proposition de changement de profil encore en
// cours d'examen (Lot 2, docs/product/YELEN_REVERIFICATION_POLICY.md) : l'admin
// estime, après vérification, que les documents Yelen ne correspondent pas à la
// modification. Répétable. La proposition reste ouverte, la valeur publiée ne
// change pas. Écriture exclusivement via demander_complement_changement_profil
// (événement immuable + admin_logs dans une seule transaction). L'administrateur
// vient de la session ; le destinataire de la notification, de la demande en base.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOTIF_MAX = 1000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(req, "institutions.verify");
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Identifiant de demande invalide" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    const { motif, types_documents } = body as { motif?: unknown; types_documents?: unknown };

    if (typeof motif !== "string" || !motif.trim()) {
      return NextResponse.json({ error: "Un motif est obligatoire pour demander un complément." }, { status: 400 });
    }
    if (motif.trim().length > MOTIF_MAX) {
      return NextResponse.json({ error: `Le motif ne doit pas dépasser ${MOTIF_MAX} caractères.` }, { status: 400 });
    }
    let types: string[] = [];
    if (types_documents !== undefined && types_documents !== null) {
      if (!Array.isArray(types_documents) || types_documents.length > 6 || !types_documents.every(estTypeDocument)) {
        return NextResponse.json({ error: "Types de documents invalides" }, { status: 400 });
      }
      types = [...new Set(types_documents as string[])];
    }

    const { data, error } = await sb.rpc("demander_complement_changement_profil", {
      p_demande_id: id,
      p_admin_id: admin.adminId,
      p_motif: motif.trim(),
      p_types_documents: types,
    });
    if (error) {
      if (error.message.includes("n'est plus a l'etat a_examiner")) {
        return NextResponse.json({ error: "Cette demande a déjà été traitée entretemps.", code: "CONFLIT_CONCURRENCE" }, { status: 409 });
      }
      console.error("[ADMIN CHANGEMENTS PROFIL] demander_complement:", error.code);
      return NextResponse.json({ error: "Erreur lors de l'enregistrement de la demande de complément." }, { status: 500 });
    }

    const notifie = await notifierComplement(data, motif.trim(), types);
    return NextResponse.json({ ok: true, notifie });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}

// Best-effort : la demande est déjà enregistrée, un échec d'envoi est seulement journalisé.
async function notifierComplement(resultat: unknown, motif: string, types: readonly string[]): Promise<boolean> {
  try {
    const r = (typeof resultat === "object" && resultat !== null ? resultat : {}) as { institution_id?: unknown; champ?: unknown };
    if (typeof r.institution_id !== "string" || typeof r.champ !== "string") throw new Error("réponse incomplète");
    const { data: institution } = await sb.from("institutions").select("name").eq("id", r.institution_id).maybeSingle();
    await envoyerNotification({
      destinataireId: r.institution_id,
      destinataireType: "institution",
      rdvId: null,
      type: "changement_profil_complement",
      titre: salutation(institution?.name || "votre équipe"),
      message: composerMessageComplement(r.champ, motif, types.map(t => LIBELLE_TYPE_DOCUMENT[t as keyof typeof LIBELLE_TYPE_DOCUMENT] ?? t)),
    });
    return true;
  } catch (e) {
    console.error("[ADMIN CHANGEMENTS PROFIL] notification complément:", e instanceof Error ? e.message : "erreur inconnue");
    return false;
  }
}
