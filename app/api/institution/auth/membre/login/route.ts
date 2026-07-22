import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { enregistrerAction } from "@/lib/journalActivite";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!);

// Même pattern de verrouillage que verify-otp/route.ts (5 échecs → 5 min).
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

function lockedMsRemaining(identifiant: string): number {
  const entry = failedAttempts.get(identifiant);
  if (!entry) return 0;
  const remaining = entry.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

function registerFailure(identifiant: string) {
  const now = Date.now();
  const entry = failedAttempts.get(identifiant);
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1;
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0;
  failedAttempts.set(identifiant, { count, lockedUntil });
}

function clearFailures(identifiant: string) {
  failedAttempts.delete(identifiant);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const identifiant = body?.identifiant;
    const pin = body?.pin;

    if (typeof identifiant !== "string" || !identifiant.trim() || typeof pin !== "string" || !pin) {
      return NextResponse.json({ error: "Identifiant et PIN requis", code: "MISSING_FIELDS" }, { status: 400 });
    }

    if (lockedMsRemaining(identifiant) > 0) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "LOCKED" }, { status: 429 });
    }

    const { data: membre } = await supabaseAdmin
      .from("institution_membres")
      .select("id,institution_id,pin_hash,role,actif,doit_changer_pin,prenom,nom")
      .eq("identifiant", identifiant.trim())
      .maybeSingle();

    if (!membre || !membre.actif || !membre.pin_hash) {
      registerFailure(identifiant);
      return NextResponse.json({ error: "Identifiant ou PIN incorrect", code: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const valid = await bcrypt.compare(pin, membre.pin_hash);
    if (!valid) {
      registerFailure(identifiant);
      return NextResponse.json({ error: "Identifiant ou PIN incorrect", code: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    clearFailures(identifiant);

    await enregistrerAction({
      institutionId: membre.institution_id,
      membreId: membre.id,
      membreNom: `${membre.prenom} ${membre.nom}`,
      action: "connexion",
      cibleTable: "institution_membres",
      cibleId: membre.id,
      req: request,
    });

    const token = await new SignJWT({ institutionId: membre.institution_id, membreId: membre.id, role: membre.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(membre.institution_id)
      .setIssuedAt()
      .setExpirationTime("8h")
      .setIssuer("yelen224-institution")
      .setAudience("yelen224-institution-dashboard")
      .sign(JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      institutionId: membre.institution_id,
      membreId: membre.id,
      role: membre.role,
      doitChangerPin: membre.doit_changer_pin,
    });

    response.cookies.set("yelen224_institution_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[MEMBRE LOGIN ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
