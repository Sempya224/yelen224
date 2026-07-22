import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Contrairement à l'institution, le PIN citoyen n'est pas un mécanisme de
// login (le citoyen a déjà une session Supabase Auth) — c'est un verrou
// local secondaire (déverrouillage rapide, comme la biométrie). Cette
// route confirme juste que le code est correct ; elle n'émet ni cookie ni
// session, le client se contente de lever son propre état "déverrouillé"
// (même logique que authenticateBiometrie() dans app/page.tsx).
const ipAttempts = new Map<string, { count: number; resetAt: number }>();
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

function lockedMsRemaining(userId: string): number {
  const entry = failedAttempts.get(userId);
  if (!entry) return 0;
  const remaining = entry.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

function registerFailure(userId: string) {
  const now = Date.now();
  const entry = failedAttempts.get(userId);
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1;
  const lockedUntil = count >= 5 ? now + 15 * 60 * 1000 : 0;
  failedAttempts.set(userId, { count, lockedUntil });
}

function clearFailures(userId: string) {
  failedAttempts.delete(userId);
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    if (!checkIpRateLimit(ip)) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 15 minutes.", code: "RATE_LIMITED" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, pin } = body;
    if (typeof accessToken !== "string" || !accessToken || !pin || typeof pin !== "string") {
      return NextResponse.json({ error: "Requête incomplète", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const lockedMs = lockedMsRemaining(user.id);
    if (lockedMs > 0) {
      return NextResponse.json({ error: `Trop de tentatives. Réessayez dans ${Math.ceil(lockedMs / 60000)} minute(s).`, code: "LOCKED" }, { status: 429 });
    }

    const { data: citoyen } = await supabaseAdmin.from("users").select("pin_hash").eq("id", user.id).single();

    if (!citoyen?.pin_hash) {
      return NextResponse.json({ error: "Aucun code configuré", code: "NOT_CONFIGURED" }, { status: 404 });
    }

    const valid = await bcrypt.compare(pin, citoyen.pin_hash);
    if (!valid) {
      registerFailure(user.id);
      return NextResponse.json({ error: "Code incorrect", code: "INVALID_PIN" }, { status: 401 });
    }

    clearFailures(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN PIN VERIFY ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
