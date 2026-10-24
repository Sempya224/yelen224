import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { extraireIpClient, logSecurite } from "@/lib/edgeSecurity";
import { ACQUISITION_EVENT_TYPES, ACQUISITION_SOURCES } from "@/lib/acquisitionSource";

// ─────────────────────────────────────────────────────────────────────────
// GAP-17-01 (23/10/2026) — seul point d'écriture de acquisition_events.
// Remplace l'insert navigateur → Supabase direct (policy anon retirée par
// supabase/migrations/20261023000001_acquisition_events_insert_serveur.sql).
//
// Route publique (la majorité du trafic des fiches institution n'est pas
// connectée) : aucune authentification exigée, mais
//   1. payload strictement validé (zod, champs inconnus refusés —
//      `citoyen_id` n'est plus jamais accepté du client) ;
//   2. rate limiting persistant par IP et par institution (compteurs en
//      base, partagés entre instances serverless) ;
//   3. institution existante ET `validee` ;
//   4. `citoyen_id` dérivé du jeton Supabase vérifié côté serveur.
// ─────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Seuils par minute (fenêtre fixe, voir acquisition_incrementer_compteurs).
// Une visite réelle émet 1 profile_view + quelques actions : 30/min/IP laisse
// une large marge (plusieurs fiches ouvertes d'affilée, NAT partagé).
const LIMITE_PAR_IP_MINUTE = 30;
const LIMITE_PAR_INSTITUTION_MINUTE = 300;

const schemaEvenement = z.strictObject({
  institution_id: z.uuid(),
  event_type: z.enum(ACQUISITION_EVENT_TYPES),
  source: z.enum(ACQUISITION_SOURCES),
  visiteur_id: z.uuid().nullable().optional(),
});

function extraireBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length).trim() || null;
}

export async function POST(req: NextRequest) {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide", code: "PAYLOAD_INVALIDE" }, { status: 400 });
  }

  const parse = schemaEvenement.safeParse(brut);
  if (!parse.success) {
    return NextResponse.json({ error: "Événement invalide", code: "PAYLOAD_INVALIDE" }, { status: 400 });
  }
  const evt = parse.data;

  // Rate limiting avant toute lecture métier (contrôle avant l'opération
  // coûteuse, même ordre que lib/security/authSecurity.ts).
  const ip = extraireIpClient(req);
  const cleIp = `ip:${ip}`;
  const cleInstitution = `inst:${evt.institution_id}`;
  const { data: compteurs, error: erreurCompteurs } = await supabaseAdmin.rpc("acquisition_incrementer_compteurs", {
    p_cles: [cleIp, cleInstitution],
  });
  if (erreurCompteurs || !Array.isArray(compteurs)) {
    // Fail-closed : sans compteur fiable, on n'écrit pas (best-effort
    // analytics, jamais d'impact sur la navigation du citoyen).
    return NextResponse.json({ error: "Service indisponible", code: "RATE_LIMIT_INDISPONIBLE" }, { status: 503 });
  }
  const compteurDe = (cle: string) =>
    (compteurs as { cle: string; compteur: number }[]).find((c) => c.cle === cle)?.compteur ?? 0;
  if (compteurDe(cleIp) > LIMITE_PAR_IP_MINUTE || compteurDe(cleInstitution) > LIMITE_PAR_INSTITUTION_MINUTE) {
    logSecurite("acquisition_rate_limited", { institution_id: evt.institution_id });
    return NextResponse.json(
      { error: "Trop d'événements, réessayez plus tard", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { data: institution, error: erreurInstitution } = await supabaseAdmin
    .from("institutions")
    .select("id,statut")
    .eq("id", evt.institution_id)
    .maybeSingle();
  if (erreurInstitution) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
  if (!institution || institution.statut !== "validee") {
    // Même réponse pour inexistante et non active : ne révèle pas l'état
    // d'une institution non publique.
    return NextResponse.json({ error: "Institution introuvable", code: "INSTITUTION_INCONNUE" }, { status: 404 });
  }

  // Jeton absent ou invalide = visiteur anonyme, jamais un refus.
  const citoyen = await verifierCitoyenToken(extraireBearer(req));

  const { error: erreurInsert } = await supabaseAdmin.from("acquisition_events").insert({
    institution_id: evt.institution_id,
    event_type: evt.event_type,
    source: evt.source,
    citoyen_id: citoyen?.id ?? null,
    visiteur_id: evt.visiteur_id ?? null,
  });
  if (erreurInsert) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
