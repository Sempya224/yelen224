import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthenticatedCitoyenId(request: NextRequest): Promise<string | null> {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const user = await verifierCitoyenToken(accessToken);
  return user?.id ?? null;
}

// "Info produit"/"Info prix" — détail du service réellement réservé
// (chantier "Objet → détails explicites", 26/09/2026, retour Bryan :
// "regarde comment DoorDash structure son checkout"). `rdv` ne stocke
// aucun service_id (voir migration 20260925000001) : le seul pont vers
// paid_services passe par paid_bookings.confirmation_code === rdv.qr_token,
// même rapprochement déjà utilisé par /api/citoyen/paiements. Un rdv
// gratuit/général (pas de paid_booking correspondant) renvoie
// service: null — l'écran retombe alors sur l'ancien bloc "Objet" texte
// brut, inchangé.
export async function GET(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const qrToken = request.nextUrl.searchParams.get("qr_token")?.trim();
    if (!qrToken) return NextResponse.json({ error: "qr_token requis" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("paid_bookings")
      .select(
        "montant_paye,montant_declare_citoyen," +
        "paid_services(nom,description,description_courte,prix,unite_prix,taux_taxe,photos,est_chambre," +
        "capacite_max,capacite_adultes,capacite_enfants,superficie_m2,inclus,non_inclus,a_savoir,equipements_chambre)"
      )
      .eq("confirmation_code", qrToken)
      .eq("citoyen_id", citoyenId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type ServiceRow = {
      nom: string; description: string | null; description_courte: string | null;
      prix: number; unite_prix: string | null; taux_taxe: number | null; photos: string[] | null;
      est_chambre: boolean | null; capacite_max: number | null; capacite_adultes: number | null;
      capacite_enfants: number | null; superficie_m2: number | null;
      inclus: string[] | null; non_inclus: string[] | null; a_savoir: string | null;
      equipements_chambre: string[] | null;
    };
    const row = data as unknown as { montant_paye: number | null; montant_declare_citoyen: number | null; paid_services: ServiceRow | null } | null;
    if (!row?.paid_services) return NextResponse.json({ success: true, service: null });

    const s = row.paid_services;
    return NextResponse.json({
      success: true,
      service: {
        nom: s.nom,
        description: s.description,
        description_courte: s.description_courte,
        prix: s.prix,
        unite_prix: s.unite_prix,
        taux_taxe: s.taux_taxe,
        photos: s.photos ?? [],
        est_chambre: !!s.est_chambre,
        capacite_max: s.capacite_max,
        capacite_adultes: s.capacite_adultes,
        capacite_enfants: s.capacite_enfants,
        superficie_m2: s.superficie_m2,
        inclus: s.inclus ?? [],
        non_inclus: s.non_inclus ?? [],
        a_savoir: s.a_savoir,
        equipements_chambre: s.equipements_chambre ?? [],
        montant_paye: row.montant_paye,
        montant_declare_citoyen: row.montant_declare_citoyen,
      },
    });
  } catch (error) {
    console.error("[CITOYEN RDV SERVICE GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
