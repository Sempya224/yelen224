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

const HISTORIQUE_LIMITE_DEFAUT = 30;

// Yelen Rewards Phase 1 (26/07/2026) — un seul appel pour peupler l'écran
// /menu/recompenses : solde, historique paginé (curseur `avant`, même
// esprit que les autres écrans de ce projet), et l'état de chaque palier
// (débloqué/verrouillé/disponible ou pas) calculé côté serveur pour que
// le client n'ait jamais à recroiser lui-même balance/milestones/unlocks.
export async function GET(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const avant = request.nextUrl.searchParams.get("avant");
    const limite = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limite")) || HISTORIQUE_LIMITE_DEFAUT, 1), 100);

    let historiqueQuery = supabaseAdmin
      .from("points_transactions")
      .select("id, points_delta, reason, source_type, created_at, reward_rules(code)")
      .eq("citoyen_id", citoyenId)
      .order("created_at", { ascending: false })
      .limit(limite);
    if (avant) historiqueQuery = historiqueQuery.lt("created_at", avant);

    // Fenêtre "cette semaine" / "semaine précédente" (retour CEO 26/07/2026,
    // Hero évolutif + boucle de rétention) — sommée en JS plutôt qu'un
    // agrégat SQL supplémentaire : volume par citoyen trop faible pour
    // justifier une nouvelle fonction, et évite une migration de plus.
    const depuis14j = new Date();
    depuis14j.setDate(depuis14j.getDate() - 14);

    const [{ data: solde }, { data: historique, error: histErr }, { data: milestones, error: mErr }, { data: unlocks, error: uErr }, { data: recents, error: recErr }, { data: reglesActives, error: rgErr }, { data: mesEvents, error: evErr }] = await Promise.all([
      supabaseAdmin
        .from("reward_balances")
        .select("balance, lifetime_earned")
        .eq("citoyen_id", citoyenId)
        .maybeSingle(),
      historiqueQuery,
      supabaseAdmin
        .from("milestones")
        .select("id, code, seuil_points, label, type_recompense, statut_disponibilite, ordre")
        .eq("actif", true)
        .order("ordre", { ascending: true }),
      supabaseAdmin
        .from("reward_unlocks")
        .select("milestone_id, unlocked_at, statut")
        .eq("citoyen_id", citoyenId),
      supabaseAdmin
        .from("points_transactions")
        .select("points_delta, created_at")
        .eq("citoyen_id", citoyenId)
        .gte("created_at", depuis14j.toISOString()),
      // Rewards V2 (22/08/2026) — section "Comment progresser" régénérée
      // depuis les vraies règles actives, jamais une liste codée en dur qui
      // re-périme au prochain lot (voir audit : "+15 points" restait affiché
      // après le passage à +45 en Lot 4).
      supabaseAdmin
        .from("reward_rules")
        .select("code, label, points_delta, conditions, description")
        .eq("actif", true),
      supabaseAdmin
        .from("reward_events")
        .select("event_type, created_at")
        .eq("citoyen_id", citoyenId),
    ]);

    if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 });
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
    if (rgErr) return NextResponse.json({ error: rgErr.message }, { status: 500 });
    if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });

    const unlockParMilestone = new Map((unlocks ?? []).map((u) => [u.milestone_id, u]));

    const maintenant = Date.now();
    const SEPT_JOURS_MS = 7 * 24 * 60 * 60 * 1000;
    let semaineCourante = 0;
    let semainePrecedente = 0;
    for (const t of recents ?? []) {
      const age = maintenant - new Date(t.created_at).getTime();
      if (age < SEPT_JOURS_MS) semaineCourante += t.points_delta;
      else if (age < 2 * SEPT_JOURS_MS) semainePrecedente += t.points_delta;
    }

    // "Comment progresser" — une ligne par règle active, avec le vrai
    // nombre de réalisations et, si applicable, le plafond anti-abus réel
    // (conditions.max_par_periode, même lecture que lib/rewardsEngine.ts)
    // plutôt qu'un texte statique. Le client décide localement quels codes
    // sont "à réaliser une fois" (profil_complete/identite_verifiee) —
    // aucun flag dédié en base pour cette distinction, cohérent avec le
    // schéma existant.
    type Conditions = { max_par_periode?: { count: number; jours: number } };
    const regles = (reglesActives ?? [])
      .map((r) => {
        const evenementsRegle = (mesEvents ?? []).filter((e) => e.event_type === r.code);
        const conditions = (r.conditions ?? {}) as Conditions;
        let plafond: { limite: number; jours: number; realise_periode: number; restant: number } | null = null;
        if (conditions.max_par_periode) {
          const depuisMs = Date.now() - conditions.max_par_periode.jours * 86400000;
          const dansFenetre = evenementsRegle.filter((e) => new Date(e.created_at).getTime() >= depuisMs).length;
          plafond = {
            limite: conditions.max_par_periode.count,
            jours: conditions.max_par_periode.jours,
            realise_periode: dansFenetre,
            restant: Math.max(0, conditions.max_par_periode.count - dansFenetre),
          };
        }
        return {
          code: r.code,
          label: r.label,
          points_delta: r.points_delta,
          description: r.description,
          nb_realisations: evenementsRegle.length,
          derniere_realisation: evenementsRegle.length > 0
            ? evenementsRegle.map((e) => e.created_at).sort().slice(-1)[0]
            : null,
          plafond,
        };
      })
      .sort((a, b) => b.points_delta - a.points_delta);

    return NextResponse.json({
      success: true,
      solde: solde?.balance ?? 0,
      gagne_a_vie: solde?.lifetime_earned ?? 0,
      semaine_courante: semaineCourante,
      semaine_precedente: semainePrecedente,
      paliers: (milestones ?? []).map((m) => {
        const unlock = unlockParMilestone.get(m.id);
        return {
          code: m.code,
          seuil_points: m.seuil_points,
          label: m.label,
          type_recompense: m.type_recompense,
          statut_disponibilite: m.statut_disponibilite,
          debloque: !!unlock,
          debloque_le: unlock?.unlocked_at ?? null,
        };
      }),
      historique: (historique ?? []).map((h) => {
        const regle = h.reward_rules as unknown as { code: string } | { code: string }[] | null;
        const ruleCode = Array.isArray(regle) ? regle[0]?.code : regle?.code;
        return {
          id: h.id,
          points_delta: h.points_delta,
          raison: h.reason,
          source_type: h.source_type,
          rule_code: ruleCode ?? null,
          created_at: h.created_at,
        };
      }),
      historique_curseur_suivant: historique && historique.length === limite ? historique[historique.length - 1].created_at : null,
      regles,
    });
  } catch (error) {
    console.error("[CITOYEN REWARDS GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

// Pas de POST ici en Phase 1 — aucun endpoint "réclamer des points"
// n'existe volontairement (voir lib/rewardsEngine.ts et le plan Phase 1) :
// les points sont toujours un effet de bord d'une transition d'état déjà
// de confiance, jamais une action citoyen directe.
