import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { extraireIpClient } from "@/lib/edgeSecurity";
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from "@/lib/security/authSecurity";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const JWT_SECRET = new TextEncoder().encode(process.env.EMPLOYEE_JWT_SECRET!);

// Verrouillage persisté en base (employee_credentials.failed_attempts/
// locked_until) — protège CE compte employé précis, quel que soit
// l'appareil d'origine (décision du 05/08/2026 : un kiosque de pointage
// partagé a besoin d'un verrouillage qui survit à un redémarrage/
// multi-instance). Complété (Lot 2 sécurité, 30/08/2026) par le throttle
// device+IP partagé de lib/security/authSecurity.ts (catégorie
// 'employee_login') — protège contre l'énumération de plusieurs
// `identifiant` différents depuis un même kiosque/IP, un angle que le
// verrouillage par compte ne couvre pas seul.
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request: NextRequest) {
  const { deviceId, estNouveau } = resoudreDeviceId(request);
  const ip = extraireIpClient(request);
  const userAgent = request.headers.get("user-agent");

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status });
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau);
    return response;
  };

  try {
    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip });
    if (porte.state === "blocked" || porte.state === "support_only") {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === "blocked" ? "AUTH_SECURITY_BLOCKED" : "AUTH_SECURITY_SUPPORT_ONLY", security: porte },
        423
      );
    }

    const body = await request.json().catch(() => null);
    const slug = body?.slug;
    const identifiant = body?.identifiant;
    const pin = body?.pin;

    if (
      typeof slug !== "string" || !slug.trim() ||
      typeof identifiant !== "string" || !identifiant.trim() ||
      typeof pin !== "string" || !pin
    ) {
      return finaliser({ error: "Entreprise, identifiant et PIN requis", code: "MISSING_FIELDS" }, 400);
    }

    const identifiantJournal = `${slug.trim()}/${identifiant.trim()}`;

    const { data: institution } = await supabaseAdmin
      .from("institutions")
      .select("id")
      .eq("slug", slug.trim())
      .maybeSingle();

    if (!institution) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "employee_login", deviceId, ip, identifiant: identifiantJournal, outcome: "institution_not_found", userAgent,
      });
      return finaliser({ error: "Entreprise introuvable", code: "INSTITUTION_NOT_FOUND", security: etat }, 404);
    }

    // identifiant n'est unique que PAR institution (employee_credentials),
    // contrairement à institution_membres.identifiant (unique globalement)
    // — la résolution du slug ci-dessus est donc une étape obligatoire, pas
    // une simple commodité d'URL.
    const { data: credentials } = await supabaseAdmin
      .from("employee_credentials")
      .select("id,employee_id,pin_hash,doit_changer_pin,failed_attempts,locked_until")
      .eq("institution_id", institution.id)
      .eq("identifiant", identifiant.trim())
      .maybeSingle();

    if (!credentials) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "employee_login", deviceId, ip, identifiant: identifiantJournal, outcome: "not_found", userAgent,
      });
      return finaliser({ error: "Identifiant ou PIN incorrect", code: "INVALID_CREDENTIALS", security: etat }, 401);
    }

    if (credentials.locked_until && new Date(credentials.locked_until).getTime() > Date.now()) {
      return finaliser({ error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "LOCKED" }, 429);
    }

    const valid = await bcrypt.compare(pin, credentials.pin_hash);
    if (!valid) {
      const failedAttempts = credentials.failed_attempts + 1;
      const lockedUntil = failedAttempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
        : null;
      await supabaseAdmin
        .from("employee_credentials")
        .update({ failed_attempts: failedAttempts, locked_until: lockedUntil })
        .eq("id", credentials.id);
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "employee_login", deviceId, ip, identifiant: identifiantJournal, outcome: "code_incorrect", userAgent,
      });
      return finaliser({ error: "Identifiant ou PIN incorrect", code: "INVALID_CREDENTIALS", security: etat }, 401);
    }

    const etatVerifie = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: "employee_login", deviceId, ip, identifiant: identifiantJournal, outcome: "code_correct", userAgent,
    });

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("id,role,statut,nom,prenom")
      .eq("id", credentials.employee_id)
      .single();

    if (!employee || employee.statut !== "actif") {
      return finaliser({ error: "Compte employé inactif", code: "EMPLOYEE_INACTIVE", security: etatVerifie }, 403);
    }

    await supabaseAdmin
      .from("employee_credentials")
      .update({
        failed_attempts: 0,
        locked_until: null,
        derniere_connexion: new Date().toISOString(),
      })
      .eq("id", credentials.id);

    const token = await new SignJWT({
      institutionId: institution.id,
      employeeId: employee.id,
      role: employee.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(employee.id)
      .setIssuedAt()
      .setExpirationTime("12h")
      .setIssuer("yelen224-clock-in-shift")
      .setAudience("yelen224-clock-in-shift-portal")
      .sign(JWT_SECRET);

    const response = finaliser({
      success: true,
      employeeId: employee.id,
      role: employee.role,
      nom: employee.nom,
      prenom: employee.prenom,
      doitChangerPin: credentials.doit_changer_pin,
      security: etatVerifie,
    }, 200);

    response.cookies.set("yelen224_employee_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 12,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[EMPLOYEE LOGIN ERROR]", error);
    return finaliser({ error: "Erreur serveur", code: "SERVER_ERROR" }, 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
