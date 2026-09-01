import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseHoraires, isOuvertNow } from "@/lib/horaires";
import { generateSlotsInRange, toISODate } from "@/lib/disponibilites";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const JOURS_FENETRE_CRENEAUX = 28;
const JOURS_FENETRE_ATTENTE = 90;
const ECHANTILLON_MIN_ATTENTE = 3;

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

// Lot B (chantier Favoris citoyen) — un seul appel pour peupler l'écran,
// avec les champs dérivables des données déjà existantes (voir
// CLAUDE.md /chantier-avis-favoris-citoyen) : ouvert/fermé (horaires),
// annonce active (annonces), services actifs (paid_services), dernière
// visite (rdv). Distance non calculée ici — nécessite la position GPS du
// citoyen, disponible seulement côté client (lat/long institution
// renvoyés pour que le client calcule lui-même).
export async function GET(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const { data: favorisRows, error: favErr } = await supabaseAdmin
      .from("citoyen_favoris")
      .select("institution_id, created_at")
      .eq("citoyen_id", citoyenId)
      .order("created_at", { ascending: false });
    if (favErr) return NextResponse.json({ error: favErr.message }, { status: 500 });

    if (!favorisRows?.length) return NextResponse.json({ success: true, favoris: [] });

    const institutionIds = favorisRows.map((f) => f.institution_id);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dateFrom = toISODate(today);
    const dateToCreneaux = new Date(today); dateToCreneaux.setDate(today.getDate() + JOURS_FENETRE_CRENEAUX);
    const dateFromAttente = new Date(today); dateFromAttente.setDate(today.getDate() - JOURS_FENETRE_ATTENTE);

    const [{ data: institutions }, { data: annonces }, { data: services }, { data: rdvHistorique }, { data: rdvCreneaux }, { data: bookingsCreneaux }, { data: rdvAttente }] = await Promise.all([
      supabaseAdmin
        .from("institutions")
        .select("id,name,category,secteur,ville,quartier,logo,banniere,badge_verifie,description,statut,adresse,phone,moyenne_avis,nb_avis,latitude,longitude,horaires,disponibilites,capacite_par_creneau,activite_categorie_id")
        .in("id", institutionIds),
      supabaseAdmin
        .from("annonces")
        .select("institution_id,date_expiration")
        .in("institution_id", institutionIds)
        .eq("statut", "publiee"),
      supabaseAdmin
        .from("paid_services")
        .select("institution_id")
        .in("institution_id", institutionIds)
        .eq("is_active", true),
      supabaseAdmin
        .from("rdv")
        .select("institution_id,date_rdv")
        .eq("citoyen_id", citoyenId)
        .in("institution_id", institutionIds)
        .order("date_rdv", { ascending: false }),
      // Comptage des créneaux déjà réservés (mirroring
      // api/rdv-disponibilite/route.ts, étendu à plusieurs institutions à
      // la fois) — sert à trouver le premier créneau où la capacité n'est
      // pas encore atteinte.
      supabaseAdmin
        .from("rdv")
        .select("institution_id,date_rdv,heure_rdv")
        .in("institution_id", institutionIds)
        .gte("date_rdv", dateFrom).lte("date_rdv", toISODate(dateToCreneaux))
        .neq("statut", "annule"),
      supabaseAdmin
        .from("paid_bookings")
        .select("institution_id,date_rdv,heure_rdv")
        .in("institution_id", institutionIds)
        .gte("date_rdv", dateFrom).lte("date_rdv", toISODate(dateToCreneaux))
        .neq("statut", "annule"),
      // Délai moyen observé entre l'heure prévue et la confirmation de
      // présence (scan QR) — seule donnée réelle disponible pour
      // approcher un "temps d'attente", labellisée honnêtement comme telle
      // plutôt que comme une mesure exacte de salle d'attente.
      supabaseAdmin
        .from("rdv")
        .select("institution_id,date_rdv,heure_rdv,presence_confirmed_at")
        .in("institution_id", institutionIds)
        .eq("presence_status", "present")
        .not("presence_confirmed_at", "is", null)
        .not("heure_rdv", "is", null)
        .gte("date_rdv", toISODate(dateFromAttente)),
    ]);

    const now = new Date();
    const annonceActiveSet = new Set(
      (annonces ?? [])
        .filter((a) => !a.date_expiration || new Date(a.date_expiration) > now)
        .map((a) => a.institution_id)
    );

    const servicesCountMap = new Map<string, number>();
    for (const s of services ?? []) {
      servicesCountMap.set(s.institution_id, (servicesCountMap.get(s.institution_id) ?? 0) + 1);
    }

    const derniereVisiteMap = new Map<string, string>();
    for (const r of rdvHistorique ?? []) {
      if (!derniereVisiteMap.has(r.institution_id)) derniereVisiteMap.set(r.institution_id, r.date_rdv);
    }

    // Comptage par institution+créneau, mirroring api/rdv-disponibilite —
    // clé "date|heure" (heure tronquée à HH:MM comme dans la route source).
    const compteParInstitution = new Map<string, Map<string, number>>();
    const tally = (rows: { institution_id: string; date_rdv: string; heure_rdv: string }[]) => {
      for (const r of rows) {
        if (!compteParInstitution.has(r.institution_id)) compteParInstitution.set(r.institution_id, new Map());
        const m = compteParInstitution.get(r.institution_id)!;
        const key = `${r.date_rdv}|${(r.heure_rdv || "").slice(0, 5)}`;
        m.set(key, (m.get(key) ?? 0) + 1);
      }
    };
    tally(rdvCreneaux ?? []);
    tally(bookingsCreneaux ?? []);

    // Délai moyen observé (minutes) entre l'heure prévue et la confirmation
    // de présence, par institution — seulement si au moins
    // ECHANTILLON_MIN_ATTENTE mesures existent (sinon un seul cas isolé
    // donnerait une fausse impression de précision).
    const attenteParInstitution = new Map<string, number[]>();
    for (const r of rdvAttente ?? []) {
      if (!r.presence_confirmed_at) continue;
      const prevu = new Date(`${r.date_rdv}T${r.heure_rdv}:00`);
      const reel = new Date(r.presence_confirmed_at);
      const diffMinutes = (reel.getTime() - prevu.getTime()) / 60000;
      if (!Number.isFinite(diffMinutes)) continue;
      if (!attenteParInstitution.has(r.institution_id)) attenteParInstitution.set(r.institution_id, []);
      attenteParInstitution.get(r.institution_id)!.push(diffMinutes);
    }
    const tempsAttenteMap = new Map<string, number>();
    for (const [instId, mesures] of attenteParInstitution) {
      if (mesures.length < ECHANTILLON_MIN_ATTENTE) continue;
      const moyenne = mesures.reduce((s, v) => s + v, 0) / mesures.length;
      if (moyenne > 0) tempsAttenteMap.set(instId, Math.round(moyenne));
    }

    const instMap = new Map((institutions ?? []).map((i) => [i.id, i]));

    const favoris = favorisRows
      .map((f) => {
        const inst = instMap.get(f.institution_id);
        if (!inst) return null;
        const { ouvert } = isOuvertNow(parseHoraires(inst.horaires));

        // Premier créneau (28 prochains jours) dont la capacité n'est pas
        // atteinte — même logique que le wizard de réservation
        // (app/rdv/[id]/page.tsx), réutilisée plutôt que redéveloppée.
        const capacite = Number(inst.capacite_par_creneau ?? 1);
        const compteInst = compteParInstitution.get(inst.id);
        const slots = generateSlotsInRange(inst.disponibilites, JOURS_FENETRE_CRENEAUX);
        const prochainSlot = slots.find((s) => (compteInst?.get(`${s.dateRdv}|${s.heureRdv}`) ?? 0) < capacite) ?? null;

        return {
          institution_id: inst.id,
          name: inst.name,
          category: inst.category,
          secteur: inst.secteur,
          ville: inst.ville,
          quartier: inst.quartier,
          logo: inst.logo,
          banniere: inst.banniere,
          badge_verifie: inst.badge_verifie,
          description: inst.description,
          statut: inst.statut,
          adresse: inst.adresse,
          phone: inst.phone,
          horaires: inst.horaires,
          activite_categorie_id: inst.activite_categorie_id,
          moyenne_avis: inst.moyenne_avis,
          prochain_creneau: prochainSlot ? { date_rdv: prochainSlot.dateRdv, heure_rdv: prochainSlot.heureRdv } : null,
          temps_attente_minutes: tempsAttenteMap.get(inst.id) ?? null,
          nb_avis: inst.nb_avis,
          latitude: inst.latitude,
          longitude: inst.longitude,
          ouvert,
          annonce_active: annonceActiveSet.has(inst.id),
          services_actifs: servicesCountMap.get(inst.id) ?? 0,
          derniere_visite: derniereVisiteMap.get(inst.id) ?? null,
          favori_depuis: f.created_at,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return NextResponse.json({ success: true, favoris });
  } catch (error) {
    console.error("[CITOYEN FAVORIS GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

// Pas de DELETE ici — contrairement aux tables de sécurité, l'ajout/retrait
// d'un favori est couvert par la policy RLS `favoris_citoyen_own`
// (auth.uid() = citoyen_id), donc fait directement en client via
// supabase.from("citoyen_favoris").insert/delete(), même pattern déjà
// établi pour annonce_likes (app/institution/[id]/page.tsx) et avis
// (app/mes-rdv/page.tsx). Le POST ci-dessous ne duplique pas cette
// écriture — il ne fait qu'envoyer la notification de confirmation après
// coup (chantier notifications, 04/08/2026), notificationEngine étant
// service_role-only et donc impossible à appeler depuis le client.
export async function POST(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const { institutionId } = await request.json();
    if (!institutionId) return NextResponse.json({ error: "institutionId requis" }, { status: 400 });

    const { data: favori } = await supabaseAdmin
      .from("citoyen_favoris")
      .select("id")
      .eq("citoyen_id", citoyenId)
      .eq("institution_id", institutionId)
      .maybeSingle();
    if (!favori) return NextResponse.json({ error: "Favori introuvable" }, { status: 404 });

    const [{ data: citoyen }, { data: institution }] = await Promise.all([
      supabaseAdmin.from("users").select("prenom").eq("id", citoyenId).maybeSingle(),
      supabaseAdmin.from("institutions").select("name").eq("id", institutionId).maybeSingle(),
    ]);

    await envoyerNotification({
      destinataireId: citoyenId,
      destinataireType: "citoyen",
      rdvId: null,
      type: "favori_ajoute",
      titre: salutation(citoyen?.prenom || "cher client"),
      message: `${institution?.name || "Cet établissement"} a été ajouté à vos favoris. Retrouvez ses prochains créneaux depuis l'onglet Favoris.`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN FAVORIS POST ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
