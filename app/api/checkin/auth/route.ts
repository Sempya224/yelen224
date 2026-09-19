import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { can } from "@/lib/institutionPermissions";
import { extraireIpClient } from "@/lib/edgeSecurity";
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from "@/lib/security/authSecurity";
import { creerSessionCheckin, signerJetonCheckin, verifierDefiCheckin, CHECKIN_COOKIE_NAME, CHECKIN_SESSION_TTL_MS } from "@/lib/checkinAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Étape 2 (PIN) — revirement produit 13/09/2026 : le 1er accès est
// désormais badge QR (app/api/checkin/agent/identify) PUIS PIN, jamais
// un identifiant tapé au clavier. Le badge seul ne prouve rien
// (challengeToken 2 min, jamais une session) — c'est bien ce PIN qui
// authentifie réellement, même credential/verrouillage que le dashboard
// (institution_membres.pin_hash/failed_attempts/locked_until), seuils
// volontairement plus stricts ici (30 min vs 5 min sur membre/login).
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

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
    const challengeToken = body?.challengeToken;
    const pin = body?.pin;

    if (typeof challengeToken !== "string" || !challengeToken || typeof pin !== "string" || !pin) {
      return finaliser({ error: "Scannez votre badge et saisissez votre PIN.", code: "MISSING_FIELDS" }, 400);
    }

    const defi = await verifierDefiCheckin(challengeToken);
    if (!defi) {
      return finaliser({ error: "Badge expiré, rescannez-le.", code: "CHALLENGE_EXPIRED" }, 401);
    }

    const { data: membre } = await supabaseAdmin
      .from("institution_membres")
      .select("id,institution_id,pin_hash,role,actif,prenom,failed_attempts,locked_until,checkin_qr_revoked_at")
      .eq("id", defi.membreId)
      .maybeSingle();

    // Le badge a pu être révoqué / le compte désactivé entre le scan et la
    // saisie du PIN — revérifié ici, jamais fait confiance au seul
    // challengeToken déjà signé.
    if (!membre || !membre.actif || !membre.pin_hash || membre.checkin_qr_revoked_at || membre.institution_id !== defi.institutionId) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "checkin_login", deviceId, ip, outcome: "not_found", userAgent,
      });
      return finaliser({ error: "Badge expiré, rescannez-le.", code: "CHALLENGE_EXPIRED", security: etat }, 401);
    }

    if (membre.locked_until && new Date(membre.locked_until).getTime() > Date.now()) {
      return finaliser({ error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "LOCKED" }, 429);
    }

    const valid = await bcrypt.compare(pin, membre.pin_hash);
    if (!valid) {
      const failedAttempts = membre.failed_attempts + 1;
      const lockedUntil = failedAttempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
        : null;
      await supabaseAdmin.from("institution_membres").update({ failed_attempts: failedAttempts, locked_until: lockedUntil }).eq("id", membre.id);
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "checkin_login", deviceId, ip, outcome: "code_incorrect", userAgent,
      });
      return finaliser({ error: "PIN incorrect. Réessayez.", code: "INVALID_PIN", security: etat }, 401);
    }

    // Le PIN est correct, mais ce compte n'a pas nécessairement le droit
    // d'utiliser YELEN Accueil (rôle changé après génération du badge) —
    // message distinct : la possession du badge + la preuve du PIN
    // viennent d'être données, ce n'est pas une surface d'énumération.
    if (!can(membre.role, "appointment.check_in")) {
      await supabaseAdmin.from("institution_membres").update({ failed_attempts: 0, locked_until: null }).eq("id", membre.id);
      return finaliser({ error: "Ce compte n'a pas accès à YELEN Accueil.", code: "FORBIDDEN_ROLE" }, 403);
    }

    const { data: instStatut } = await supabaseAdmin.from("institutions").select("statut").eq("id", membre.institution_id).maybeSingle();
    if (instStatut?.statut === "suspendue") {
      return finaliser({ error: "Cet établissement est suspendu. Connexion à YELEN Accueil bloquée.", code: "INSTITUTION_SUSPENDED" }, 403);
    }

    const etatVerifie = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: "checkin_login", deviceId, ip, outcome: "code_correct", userAgent,
    });

    await supabaseAdmin.from("institution_membres").update({ failed_attempts: 0, locked_until: null }).eq("id", membre.id);

    const sid = await creerSessionCheckin({ membreId: membre.id, institutionId: membre.institution_id, userAgent, ip });
    if (!sid) return finaliser({ error: "Une erreur est survenue. Réessayez dans un instant.", code: "SERVER_ERROR" }, 500);

    const token = await signerJetonCheckin({ institutionId: membre.institution_id, membreId: membre.id, sid });

    const response = finaliser({ success: true, prenom: membre.prenom, security: etatVerifie }, 200);
    response.cookies.set(CHECKIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: CHECKIN_SESSION_TTL_MS / 1000,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("[CHECKIN AUTH ERROR]", error);
    return finaliser({ error: "Une erreur est survenue. Réessayez dans un instant.", code: "SERVER_ERROR" }, 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
