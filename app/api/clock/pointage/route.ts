import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedEmployee } from "@/lib/employeeAuth";
import {
  determinerProchaineActionEntreeSortie, verifierEntreeSortieAutorisee,
  verifierPauseDebutAutorisee, verifierPauseFinAutorisee, type DernierType,
} from "@/lib/clockInPause";

// Écrit dans attendance_logs (jamais dans daily_attendance — table
// résumée, recalculée par le job nocturne hors périmètre de cette route,
// voir CLAUDE.md /chantier-clock-in-shift). Un seul bouton "Pointer" côté
// portail employé : la direction (entree/sortie) est déduite du dernier
// pointage ACTIF de cet employé, pas envoyée par le client — évite un état
// désynchronisé si le portail a été fermé/rouvert entre deux actions.
//
// "Actif" = exclut les lignes marquées comme remplacées dans
// attendance_audit_logs.attendance_log_id_origine (mécanisme de correction
// 100% insert-only, attendance_logs est immuable au niveau base — voir
// 20260805000007_clock_in_attendance_logs.sql). Sans ce filtre, une
// correction historique fausserait la détection du prochain sens de
// pointage.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DUPLICATE_TAP_MS = 5000;

// Arrivée/départ (pas les pauses, décision Bryan 10/09/2026) passent par le
// scan du QR déjà affiché/imprimé par l'institution — voir
// ClockInShiftTab.tsx::clockPortalUrl, même contenu ("<APP_URL>/clock/<slug>").
// Parsing par pathname, jamais par host : reste valide que l'URL soit le
// lien de test local actuel ou APP_URL en prod.
function extraireSlugDepuisQr(payload: string): string | null {
  try {
    const url = new URL(payload);
    const match = url.pathname.match(/\/clock\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function messagePourType(typeAction: string): string {
  if (typeAction === "entree") return "Arrivée enregistrée";
  if (typeAction === "sortie") return "Départ enregistré";
  if (typeAction === "pause_debut") return "Pause démarrée";
  return "Reprise enregistrée"; // pause_fin
}

export async function POST(req: NextRequest) {
  const employee = await getAuthenticatedEmployee(req);
  if (!employee) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Re-vérifié ici (pas seulement au login) : une session dure jusqu'à 12h,
  // un admin a pu suspendre/archiver l'employé entre-temps.
  const { data: fiche } = await sb
    .from("employees")
    .select("statut")
    .eq("id", employee.employeeId)
    .maybeSingle();
  if (!fiche || fiche.statut !== "actif") {
    return NextResponse.json({ error: "Compte employé inactif", code: "EMPLOYEE_INACTIVE" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const qrPayload: string | undefined = typeof body?.qr_payload === "string" ? body.qr_payload : undefined;
  const clientToken: string | undefined = typeof body?.clientToken === "string" && body.clientToken ? body.clientToken : undefined;
  // Pause imbriquée dans un entree/sortie qui reste ouvert (brief Bryan
  // 21/09/2026, voir lib/clockInPause.ts) — "entree_sortie" reste le
  // comportement historique (direction déduite serveur), pause_debut/
  // pause_fin sont désormais des intentions explicites du client, jamais
  // déduites (après "entree", pause_debut ET sortie sont deux actions
  // valides, une simple bascule ne suffit plus à décider).
  const typeDemande: "entree_sortie" | "pause_debut" | "pause_fin" =
    body?.type === "pause_debut" || body?.type === "pause_fin" ? body.type : "entree_sortie";
  // Géolocalisation (Phase 2 roadmap §5.6) — purement du stockage ici,
  // aucune validation/blocage : décision Bryan 21/09/2026, un pointage
  // hors-zone se SIGNALE (calculé à la lecture, dashboard institution),
  // il ne bloque jamais l'action de l'employé.
  const latitude: number | null = typeof body?.latitude === "number" && !Number.isNaN(body.latitude) ? body.latitude : null;
  const longitude: number | null = typeof body?.longitude === "number" && !Number.isNaN(body.longitude) ? body.longitude : null;

  // Idempotence (file d'attente offline du portail, voir migration
  // 20260921000002_clock_in_attendance_logs_client_token.sql) — vérifié AVANT
  // le garde-fou anti-double-tap ci-dessous : un rejeu légitime après une
  // coupure réseau peut survenir bien après DUPLICATE_TAP_MS, ce n'est pas
  // la même situation qu'un utilisateur qui tape deux fois de suite.
  if (clientToken) {
    const { data: existant } = await sb
      .from("attendance_logs")
      .select("type_action,horodatage")
      .eq("employee_id", employee.employeeId)
      .eq("client_token", clientToken)
      .maybeSingle();
    if (existant) {
      return NextResponse.json({
        success: true,
        typeAction: existant.type_action,
        horodatage: existant.horodatage,
        message: messagePourType(existant.type_action),
        replay: true,
      });
    }
  }

  let methode: "pin" | "qr" = "pin";
  if (qrPayload !== undefined) {
    const slugScanne = extraireSlugDepuisQr(qrPayload);
    if (!slugScanne) {
      return NextResponse.json({ error: "QR invalide, réessayez.", code: "QR_INVALID" }, { status: 400 });
    }
    const { data: inst } = await sb
      .from("institutions")
      .select("slug")
      .eq("id", employee.institutionId)
      .maybeSingle();
    if (!inst || inst.slug !== slugScanne) {
      return NextResponse.json({ error: "Ce QR ne correspond pas à votre établissement.", code: "QR_MISMATCH" }, { status: 400 });
    }
    methode = "qr";
  }

  const { data: audits } = await sb
    .from("attendance_audit_logs")
    .select("attendance_log_id_origine")
    .eq("employee_id", employee.employeeId)
    .not("attendance_log_id_origine", "is", null);
  const supersededIds = (audits ?? [])
    .map((a) => a.attendance_log_id_origine)
    .filter((id): id is string => typeof id === "string");

  let dernierQuery = sb
    .from("attendance_logs")
    .select("id,type_action,horodatage")
    .eq("employee_id", employee.employeeId)
    .order("horodatage", { ascending: false })
    .limit(1);
  if (supersededIds.length > 0) {
    dernierQuery = dernierQuery.not("id", "in", `(${supersededIds.join(",")})`);
  }
  const { data: dernier } = await dernierQuery.maybeSingle();

  if (dernier && Date.now() - new Date(dernier.horodatage).getTime() < DUPLICATE_TAP_MS) {
    return NextResponse.json(
      { error: "Pointage déjà enregistré il y a quelques secondes.", code: "DUPLICATE_TAP" },
      { status: 429 }
    );
  }

  const dernierType: DernierType = dernier?.type_action as DernierType ?? null;
  let typeAction: "entree" | "sortie" | "pause_debut" | "pause_fin";

  if (typeDemande === "pause_debut") {
    // "Une seule pause par shift" (V1, décision Bryan 21/09/2026) : borné
    // au shift OUVERT en cours (depuis la dernière "entree" active), pas au
    // jour calendaire — reste correct pour un shift de nuit qui traverse
    // minuit (§10 du brief).
    let derniereEntreeQuery = sb
      .from("attendance_logs")
      .select("horodatage")
      .eq("employee_id", employee.employeeId)
      .eq("type_action", "entree")
      .order("horodatage", { ascending: false })
      .limit(1);
    if (supersededIds.length > 0) derniereEntreeQuery = derniereEntreeQuery.not("id", "in", `(${supersededIds.join(",")})`);
    const { data: derniereEntree } = await derniereEntreeQuery.maybeSingle();

    let pauseDejaPriseCeShift = false;
    if (derniereEntree) {
      let pauseCountQuery = sb
        .from("attendance_logs")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", employee.employeeId)
        .eq("type_action", "pause_debut")
        .gte("horodatage", derniereEntree.horodatage);
      if (supersededIds.length > 0) pauseCountQuery = pauseCountQuery.not("id", "in", `(${supersededIds.join(",")})`);
      const { count } = await pauseCountQuery;
      pauseDejaPriseCeShift = (count ?? 0) > 0;
    }

    const verif = verifierPauseDebutAutorisee(dernierType, pauseDejaPriseCeShift);
    if (!verif.ok) return NextResponse.json({ error: verif.raison, code: "PAUSE_INVALID" }, { status: 409 });
    typeAction = "pause_debut";
  } else if (typeDemande === "pause_fin") {
    const verif = verifierPauseFinAutorisee(dernierType);
    if (!verif.ok) return NextResponse.json({ error: verif.raison, code: "PAUSE_INVALID" }, { status: 409 });
    typeAction = "pause_fin";
  } else {
    const garde = verifierEntreeSortieAutorisee(dernierType);
    if (!garde.ok) return NextResponse.json({ error: garde.raison, code: "PAUSE_OPEN" }, { status: 409 });
    typeAction = determinerProchaineActionEntreeSortie(dernierType);
  }

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || req.headers.get("x-real-ip") || null;

  const { data: nouveauLog, error } = await sb
    .from("attendance_logs")
    .insert({
      institution_id: employee.institutionId,
      employee_id: employee.employeeId,
      type_action: typeAction,
      methode,
      ip,
      client_token: clientToken ?? null,
      latitude,
      longitude,
    })
    .select("id,type_action,horodatage")
    .single();
  if (error) {
    // 23505 = violation de l'index unique sur client_token — deux tentatives
    // concurrentes du même rejeu offline (rare mais possible) se sont
    // chevauchées avant que la vérification d'idempotence ci-dessus ne voie
    // le résultat de l'autre. Celle qui a gagné la course a déjà inséré la
    // vraie ligne : on la relit et on répond comme un rejeu normal plutôt
    // que de renvoyer une erreur 500 au client pour une action qui, en
    // réalité, a réussi.
    if (error.code === "23505" && clientToken) {
      const { data: existant } = await sb
        .from("attendance_logs")
        .select("type_action,horodatage")
        .eq("employee_id", employee.employeeId)
        .eq("client_token", clientToken)
        .maybeSingle();
      if (existant) {
        return NextResponse.json({
          success: true,
          typeAction: existant.type_action,
          horodatage: existant.horodatage,
          message: messagePourType(existant.type_action),
          replay: true,
        });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    typeAction: nouveauLog.type_action,
    horodatage: nouveauLog.horodatage,
    message: messagePourType(nouveauLog.type_action),
  });
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
