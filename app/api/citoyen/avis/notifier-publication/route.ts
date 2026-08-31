import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";

// Chantier notifications (04/08/2026) — l'insert dans `avis` reste
// client-direct (voir app/mes-rdv/page.tsx), cette route ne fait qu'envoyer
// la notification à l'institution après coup, via service_role. Revérifie
// tout depuis la base (citoyen_id + brouillon=false) plutôt que de faire
// confiance à un institutionId fourni par le client.
//
// ⚠️ Corrigé le 15/08/2026 (bug réel signalé par Bryan) : cette route remet
// aussi `rdv.avis_demande = false` — la policy RLS du citoyen sur `rdv` est
// lecture seule (voir CLAUDE.md /securite), donc l'UPDATE client-direct
// équivalent dans app/mes-rdv/page.tsx et
// app/compte/mes-avis/mes-avis-client.tsx échouait silencieusement (0 ligne
// modifiée, aucune erreur — le code n'y vérifiait jamais `{error}`). "Mon
// Assistant"/Mes RDV redemandaient donc indéfiniment un avis déjà publié.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { avisId } = await request.json();
    if (!avisId) return NextResponse.json({ error: "avisId requis" }, { status: 400 });

    const { data: avis } = await supabaseAdmin
      .from("avis")
      .select("id, institution_id, rdv_id, note, titre, brouillon")
      .eq("id", avisId)
      .eq("citoyen_id", user.id)
      .eq("brouillon", false)
      .maybeSingle();
    if (!avis) return NextResponse.json({ error: "Avis introuvable" }, { status: 404 });

    if (avis.rdv_id) {
      await supabaseAdmin.from("rdv").update({ avis_demande: false }).eq("id", avis.rdv_id);
    }

    const [{ data: citoyen }, { data: institution }] = await Promise.all([
      supabaseAdmin.from("users").select("prenom").eq("id", user.id).maybeSingle(),
      supabaseAdmin.from("institutions").select("name").eq("id", avis.institution_id).maybeSingle(),
    ]);

    await envoyerNotification({
      destinataireId: avis.institution_id,
      destinataireType: "institution",
      rdvId: avis.rdv_id,
      type: "avis_publie",
      titre: salutation(institution?.name || "votre équipe"),
      message: `${citoyen?.prenom || "Un citoyen"} a publié un avis (${avis.note}/5)${avis.titre ? ` — « ${avis.titre} »` : ""}. Vous pouvez y répondre depuis Avis & réputation.`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN AVIS NOTIFIER-PUBLICATION ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
