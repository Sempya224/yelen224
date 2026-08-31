import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enregistrerAction } from "@/lib/journalActivite";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Lot E (vérification publique, décision CEO 05/08/2026) — route SANS
// authentification (le QR du reçu est scanné par n'importe qui : un
// employeur, une banque, un tiers). Aucune donnée personnelle exposée
// (ni nom, ni téléphone, ni photo du citoyen) — uniquement de quoi
// confirmer l'authenticité : institution, montant, date, heure,
// référence, statut. Rate-limité par IP (même pattern que les routes
// WebAuthn) : un point d'accès public sans session est la cible la plus
// facile à scraper.
const ipAttempts = new Map<string, { count: number; resetAt: number }>();
function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  if (!checkIpRateLimit(ip)) {
    return NextResponse.json({ error: "Trop de vérifications depuis cette adresse. Réessayez dans 15 minutes.", code: "RATE_LIMITED" }, { status: 429 });
  }

  const { id } = await params;
  const { data: recu, error } = await sb
    .from("recus")
    .select("id,receipt_id,montant,statut,verifie_le,institution_id,paid_booking_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Reçu introuvable — jamais "faux/frauduleux" affirmé (un ID mal
  // recopié n'est pas une fraude prouvée), juste "introuvable".
  if (!recu) return NextResponse.json({ found: false });

  const [{ data: booking }, { data: institution }] = await Promise.all([
    sb.from("paid_bookings").select("confirmation_code,date_rdv,heure_rdv,traite_le").eq("id", recu.paid_booking_id).maybeSingle(),
    sb.from("institutions").select("name").eq("id", recu.institution_id).maybeSingle(),
  ]);

  // "statut" du reçu reste 'disponible' en régime normal (voir
  // lib/recuPdf.ts) — 'verifie' n'écrase jamais 'disponible' pour ne pas
  // casser les filtres `.eq('statut','disponible')` des écrans Paiements
  // citoyen/institution. verifie_le est un simple horodatage "vu au moins
  // une fois", indépendant du statut affiché.
  if (!recu.verifie_le) {
    await sb.from("recus").update({ verifie_le: new Date().toISOString() }).eq("id", recu.id);
  }

  // Journalisé côté institution — "chaque événement du cycle de vie du
  // reçu est enregistré dans le journal d'audit" (décision CEO). membreId
  // null : l'action n'est initiée par aucun membre de l'institution, même
  // convention que message_recu (voir lib/journalActivite.ts).
  await enregistrerAction({
    institutionId: recu.institution_id,
    membreId: null,
    membreNom: "Vérification publique",
    action: "recu_verifie",
    cibleTable: "recus",
    cibleId: recu.id,
    req,
  });

  return NextResponse.json({
    found: true,
    authentique: recu.statut !== "archive",
    statut: recu.statut,
    receipt_id: recu.receipt_id,
    montant: recu.montant,
    institution_nom: institution?.name ?? "Institution",
    reference: booking?.confirmation_code ?? "",
    date: booking?.traite_le ?? booking?.date_rdv ?? null,
  });
}
