import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAUT_CHAMPS_VISIBLES, DEFAUT_PROFIL_PUBLIC, DEFAUT_PARTAGE, DEFAUT_COMMUNICATION } from "@/lib/citoyenConfidentialite";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Un seul appel pour peupler l'écran Confidentialité (Lot D) — mirroring
// api/citoyen/securite/status. Absence de ligne dans une table de prefs =
// valeurs par défaut (comportement actuel inchangé), pas une erreur.
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const [{ data: profil }, { data: visibilite }, { data: partage }, { data: communication }] = await Promise.all([
      supabaseAdmin.from("users").select("cgu_acceptee_le,confidentialite_acceptee_le").eq("id", user.id).single(),
      supabaseAdmin.from("citoyen_prefs_visibilite").select("champs_visibles,profil_public").eq("citoyen_id", user.id).maybeSingle(),
      supabaseAdmin.from("citoyen_prefs_partage").select("partage_historique_rdv,partage_historique_services").eq("citoyen_id", user.id).maybeSingle(),
      supabaseAdmin.from("citoyen_communication_prefs").select("communications_yelen,communications_etablissements,personnalisation").eq("citoyen_id", user.id).maybeSingle(),
    ]);

    return NextResponse.json({
      success: true,
      cgu_acceptee_le: profil?.cgu_acceptee_le ?? null,
      confidentialite_acceptee_le: profil?.confidentialite_acceptee_le ?? null,
      champs_visibles: visibilite?.champs_visibles ?? DEFAUT_CHAMPS_VISIBLES,
      profil_public: visibilite?.profil_public ?? DEFAUT_PROFIL_PUBLIC,
      partage_historique_rdv: partage?.partage_historique_rdv ?? DEFAUT_PARTAGE.partage_historique_rdv,
      partage_historique_services: partage?.partage_historique_services ?? DEFAUT_PARTAGE.partage_historique_services,
      communications_yelen: communication?.communications_yelen ?? DEFAUT_COMMUNICATION.communications_yelen,
      communications_etablissements: communication?.communications_etablissements ?? DEFAUT_COMMUNICATION.communications_etablissements,
      personnalisation: communication?.personnalisation ?? DEFAUT_COMMUNICATION.personnalisation,
    });
  } catch (error) {
    console.error("[CITOYEN CONFIDENTIALITE STATUS ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
