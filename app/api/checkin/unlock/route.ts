import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getEtatSessionCheckin, toucherActiviteCheckin, revoquerSessionCheckin, checkinSupabaseAdmin } from "@/lib/checkinAuth";

// POST → déverrouillage par PIN seul après le verrou d'inactivité (2 min) —
// pas de re-scan, la session serveur (8h) est toujours valide. Mêmes
// seuils que la connexion (5 essais / 30 min), mêmes colonnes
// failed_attempts/locked_until que app/api/checkin/auth (même credential).
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

export async function POST(req: NextRequest) {
  const etat = await getEtatSessionCheckin(req);
  if (etat.etat === "absente" || etat.etat === "invalide") {
    return NextResponse.json({ error: "Session expirée, reconnectez-vous.", code: "SESSION_EXPIRED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const pin = body?.pin;
  if (typeof pin !== "string" || !pin) {
    return NextResponse.json({ error: "Veuillez saisir votre PIN." }, { status: 400 });
  }

  const { data: membre } = await checkinSupabaseAdmin
    .from("institution_membres")
    .select("id, pin_hash, actif, failed_attempts, locked_until")
    .eq("id", etat.ctx.membreId)
    .maybeSingle();

  if (!membre || !membre.actif || !membre.pin_hash) {
    await revoquerSessionCheckin(etat.ctx.sid, "compte_desactive");
    return NextResponse.json({ error: "Session expirée, reconnectez-vous.", code: "SESSION_EXPIRED" }, { status: 401 });
  }

  if (membre.locked_until && new Date(membre.locked_until).getTime() > Date.now()) {
    await revoquerSessionCheckin(etat.ctx.sid, "pin_locked");
    return NextResponse.json({ error: "Trop de tentatives. Reconnectez-vous dans quelques minutes.", code: "LOCKED" }, { status: 429 });
  }

  const valide = await bcrypt.compare(pin, membre.pin_hash);
  if (!valide) {
    const failedAttempts = membre.failed_attempts + 1;
    const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null;
    await checkinSupabaseAdmin.from("institution_membres").update({ failed_attempts: failedAttempts, locked_until: lockedUntil }).eq("id", membre.id);
    if (lockedUntil) {
      await revoquerSessionCheckin(etat.ctx.sid, "pin_unlock_failed_max");
      return NextResponse.json({ error: "Trop de tentatives. Reconnectez-vous dans quelques minutes.", code: "LOCKED" }, { status: 429 });
    }
    return NextResponse.json({ error: "PIN incorrect. Réessayez.", code: "INVALID_PIN" }, { status: 401 });
  }

  await checkinSupabaseAdmin.from("institution_membres").update({ failed_attempts: 0, locked_until: null }).eq("id", membre.id);
  await toucherActiviteCheckin(etat.ctx.sid);
  return NextResponse.json({ success: true });
}
