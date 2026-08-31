import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";

// Chantier notifications (04/08/2026) — l'insert dans citoyen_demarches
// reste client-direct (RLS auth.uid()=citoyen_id, voir mes-demarches-client.tsx),
// cette route ne fait qu'envoyer la notification de confirmation après coup,
// via service_role (notificationEngine ne peut pas être importé côté client).
// Revérifie tout depuis la base plutôt que de faire confiance à un titre
// fourni par le client — jamais de texte libre client dans la notification.
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

    const { demarcheId } = await request.json();
    if (!demarcheId) return NextResponse.json({ error: "demarcheId requis" }, { status: 400 });

    const { data: demarche } = await supabaseAdmin
      .from("citoyen_demarches")
      .select("id, titre, date_cible")
      .eq("id", demarcheId)
      .eq("citoyen_id", user.id)
      .maybeSingle();
    if (!demarche) return NextResponse.json({ error: "Démarche introuvable" }, { status: 404 });

    const { data: citoyen } = await supabaseAdmin.from("users").select("prenom").eq("id", user.id).maybeSingle();

    // Date cible réellement renseignée uniquement — jamais de délai
    // inventé quand la démarche n'a qu'un titre (cf. règle "zéro donnée
    // inventée").
    const dateLabel = demarche.date_cible
      ? new Date(demarche.date_cible).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
      : null;

    await envoyerNotification({
      destinataireId: user.id,
      destinataireType: "citoyen",
      rdvId: null,
      demarcheId: demarche.id,
      type: "demarche_creee",
      titre: salutation(citoyen?.prenom || "cher client"),
      message: dateLabel
        ? `Votre démarche « ${demarche.titre} » a été ajoutée à votre suivi pour le ${dateLabel}.`
        : `Votre démarche « ${demarche.titre} » a été ajoutée à votre suivi.`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN DEMARCHES NOTIFIER-CREATION ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
