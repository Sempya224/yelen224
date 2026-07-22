import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthenticatedCitoyenId(request: NextRequest): Promise<string | null> {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) return null;
  return user.id;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Lot A (chantier "Mon Assistant") — un seul appel agrégeant tout ce que le
// bandeau affiche : RDV à venir, RDV terminés en attente d'avis
// (avis_demande=true, même règle que app/mes-rdv/page.tsx), et les annonces
// publiées par les établissements "concernés" (union des institutions avec
// lesquelles le citoyen a un historique de RDV et de ses favoris). Les
// annonces n'ont pas de policy RLS publique (voir app/api/annonces-publiques/
// route.ts, déjà en service_role) — d'où une route dédiée plutôt qu'un fetch
// direct client comme pour rdv/citoyen_favoris.
//
// Étendu le 22/07/2026 (plan rétention v2, item 5 — "Résumé de mon espace")
// : plutôt que de construire un second bandeau redondant, ce widget déjà en
// place est le bon endroit pour faire remonter démarches en retard/à
// échéance proche et documents en attente — mêmes règles déterministes,
// zéro appel LLM, cohérent avec le reste du projet.
export async function GET(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const todayISO = toISODate(new Date());
    const INSTITUTION_FIELDS = "id, name, category, logo";

    const [{ data: upcomingRows }, { data: avisAttenteRows }, { data: rdvHistorique }, { data: favorisRows }, { data: demarchesRows }, { data: documentsRows }] = await Promise.all([
      supabaseAdmin
        .from("rdv")
        .select(`id, date_rdv, heure_rdv, objet, statut, institutions!rdv_institution_id_fkey ( ${INSTITUTION_FIELDS} )`)
        .eq("citoyen_id", citoyenId)
        .in("statut", ["en_attente", "confirme"])
        .gte("date_rdv", todayISO)
        .order("date_rdv", { ascending: true }),
      supabaseAdmin
        .from("rdv")
        .select(`id, date_rdv, heure_rdv, objet, statut, institutions!rdv_institution_id_fkey ( ${INSTITUTION_FIELDS} )`)
        .eq("citoyen_id", citoyenId)
        .eq("statut", "termine")
        .eq("avis_demande", true)
        .order("date_rdv", { ascending: false }),
      supabaseAdmin
        .from("rdv")
        .select("institution_id")
        .eq("citoyen_id", citoyenId),
      supabaseAdmin
        .from("citoyen_favoris")
        .select("institution_id")
        .eq("citoyen_id", citoyenId),
      supabaseAdmin
        .from("citoyen_demarches")
        .select("id, titre, statut, date_cible")
        .eq("citoyen_id", citoyenId)
        .eq("statut", "en_cours"),
      supabaseAdmin
        .from("citoyen_documents")
        .select(`id, label, institution_id, institutions ( ${INSTITUTION_FIELDS} )`)
        .eq("citoyen_id", citoyenId)
        .eq("sens", "demande")
        .eq("statut", "en_attente"),
    ]);

    const institutionIds = Array.from(new Set([
      ...(rdvHistorique ?? []).map((r) => r.institution_id),
      ...(favorisRows ?? []).map((f) => f.institution_id),
    ]));

    // Démarches en retard / à échéance proche (7 jours) — même logique que
    // estEnRetard() côté client (app/compte/mes-demarches), dupliquée ici
    // volontairement (petite fonction pure, pas de module partagé
    // client/serveur existant pour ça, cohérent avec le reste du projet —
    // ex. l'Edge Function rappels-rdv duplique aussi ses templates).
    const demarcheIds = (demarchesRows ?? []).map((d) => d.id);
    const { data: etapesRows } = demarcheIds.length
      ? await supabaseAdmin.from("citoyen_demarche_etapes").select("demarche_id, fait, date_echeance").in("demarche_id", demarcheIds)
      : { data: [] };
    const etapesParDemarche = new Map<string, { fait: boolean; date_echeance: string | null }[]>();
    for (const e of etapesRows ?? []) {
      if (!etapesParDemarche.has(e.demarche_id)) etapesParDemarche.set(e.demarche_id, []);
      etapesParDemarche.get(e.demarche_id)!.push({ fait: e.fait, date_echeance: e.date_echeance });
    }
    const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
    const dansSeptJours = new Date(aujourdHui); dansSeptJours.setDate(dansSeptJours.getDate() + 7);
    const demarchesEnRetard: { id: string; titre: string }[] = [];
    const demarchesEcheanceProche: { id: string; titre: string }[] = [];
    for (const d of demarchesRows ?? []) {
      const mesEtapes = etapesParDemarche.get(d.id) ?? [];
      const dates = mesEtapes.length > 0
        ? mesEtapes.filter((e) => !e.fait && e.date_echeance).map((e) => new Date(e.date_echeance as string))
        : d.date_cible ? [new Date(d.date_cible)] : [];
      if (dates.length === 0) continue;
      if (dates.some((dt) => dt < aujourdHui)) demarchesEnRetard.push({ id: d.id, titre: d.titre });
      else if (dates.some((dt) => dt >= aujourdHui && dt <= dansSeptJours)) demarchesEcheanceProche.push({ id: d.id, titre: d.titre });
    }

    let annonces: Record<string, unknown>[] = [];
    if (institutionIds.length > 0) {
      const { data: annonceRows } = await supabaseAdmin
        .from("annonces")
        .select(`id, titre, contenu, type, format, media_urls, image_url, created_at, date_expiration, institution_id, institutions ( ${INSTITUTION_FIELDS} )`)
        .in("institution_id", institutionIds)
        .eq("statut", "publiee")
        .order("created_at", { ascending: false })
        .limit(10);

      const now = new Date();
      annonces = (annonceRows ?? []).filter(
        (a) => !a.date_expiration || new Date(a.date_expiration as string) > now
      );
    }

    return NextResponse.json({
      success: true,
      upcoming: upcomingRows ?? [],
      avisAttente: avisAttenteRows ?? [],
      annonces,
      demarchesEnRetard,
      demarchesEcheanceProche,
      documentsAttente: documentsRows ?? [],
    });
  } catch (error) {
    console.error("[CITOYEN ASSISTANT GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
