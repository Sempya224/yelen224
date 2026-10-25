import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verify } from "otplib";
import bcrypt from "bcryptjs";
import { verifierOtp } from "@/lib/auth/otp";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Lot B (18/10/2026) — seul point d'exécution réelle de la suppression de
// compte citoyen. Remplace deleteCitoyenAccount (app/profil/actions.ts),
// qui faisait un DELETE via un client lié à la session du citoyen (RLS
// citoyen_own_profile) sans aucune re-vérification — exactement la faille
// documentée dans supabase/migrations/20261018000009.
//
// Identité dérivée EXCLUSIVEMENT de verifierCitoyenToken(accessToken),
// jamais d'un userId fourni par le client (IDOR, même famille que la
// faille QR déjà corrigée — voir CLAUDE.md).
//
// OTP/PIN/TOTP sont ré-vérifiés ICI, au moment même du DELETE, pas dans un
// aller-retour antérieur déconnecté : verifierOtp() consomme le code à
// usage unique (voir lib/auth/otp.ts) — le vérifier plus tôt dans l'écran
// "Confirmez votre identité" puis une seconde fois ici échouerait
// systématiquement à la 2e tentative (code déjà consommé). Le code est
// donc transporté par le client depuis cet écran jusqu'à la confirmation
// finale ("SUPPRIMER") sans jamais être vérifié avant cet appel.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = body?.accessToken;
    const otp = body?.otp;
    const pin = body?.pin;
    const totp = body?.totp;

    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (typeof otp !== "string" || !otp.trim()) {
      return NextResponse.json({ error: "Code SMS requis", code: "MISSING_OTP" }, { status: 400 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: citoyen } = await supabaseAdmin
      .from("users")
      .select("pin_hash, totp_secret, totp_backup_codes")
      .eq("id", user.id)
      .maybeSingle();

    const otpResult = await verifierOtp(supabaseAdmin, user.id, otp.trim());
    if (!otpResult.ok) {
      const messages = { aucun_code: "Aucun code en attente. Renvoyez un code.", expire: "Ce code a expiré. Renvoyez un code.", incorrect: "Code incorrect. Renvoyez un code." };
      return NextResponse.json({ error: messages[otpResult.reason], code: "INVALID_OTP" }, { status: 401 });
    }

    if (citoyen?.pin_hash) {
      if (typeof pin !== "string" || !pin) {
        return NextResponse.json({ error: "Code PIN requis", code: "MISSING_PIN" }, { status: 400 });
      }
      const pinValide = await bcrypt.compare(pin, citoyen.pin_hash);
      if (!pinValide) {
        return NextResponse.json({ error: "Code PIN incorrect", code: "INVALID_PIN" }, { status: 401 });
      }
    }

    if (citoyen?.totp_secret) {
      if (typeof totp !== "string" || !totp.trim()) {
        return NextResponse.json({ error: "Code de double authentification requis", code: "MISSING_TOTP" }, { status: 400 });
      }
      let totpValide = (await verify({ secret: citoyen.totp_secret, token: totp.trim(), epochTolerance: 30 })).valid;
      if (!totpValide && Array.isArray(citoyen.totp_backup_codes)) {
        for (const code of citoyen.totp_backup_codes as string[]) {
          if (await bcrypt.compare(totp.trim(), code)) { totpValide = true; break; }
        }
        // Pas de retrait du code de secours consommé : le compte est
        // supprimé dans la foulée, totp_backup_codes disparaît avec lui.
      }
      if (!totpValide) {
        return NextResponse.json({ error: "Code de double authentification incorrect", code: "INVALID_TOTP" }, { status: 401 });
      }
    }

    const { error: rpcError } = await supabaseAdmin.rpc("citoyen_supprimer_compte", { p_citoyen_id: user.id });
    if (rpcError) {
      const message = rpcError.message ?? "";
      if (message.includes("SUPPRESSION_BLOQUEE_RESTRICTION_ACTIVE")) {
        return NextResponse.json({ error: "Votre compte ne peut pas être supprimé pour le moment en raison d'une restriction active sur vos rendez-vous. Contactez le support pour en savoir plus.", code: "BLOCKED_RESTRICTION" }, { status: 409 });
      }
      if (message.includes("SUPPRESSION_BLOQUEE_FRAUDE_PERTINENTE")) {
        return NextResponse.json({ error: "Votre compte ne peut pas être supprimé pour le moment. Contactez le support pour en savoir plus.", code: "BLOCKED_REVIEW" }, { status: 409 });
      }
      if (message.includes("SUPPRESSION_BLOQUEE_PAIEMENT_CONSERVE")) {
        return NextResponse.json({ error: "Votre compte ne peut pas être supprimé pour le moment : un paiement récent doit être conservé selon nos obligations légales. Réessayez plus tard ou contactez le support.", code: "BLOCKED_PAYMENT" }, { status: 409 });
      }
      console.error("[CITOYEN SUPPRESSION EXECUTER ERROR]", rpcError.message);
      return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
    }

    // Supprime aussi la coquille auth.users — sans ça, l'identité Supabase
    // Auth du citoyen survit indéfiniment sans profil (CLAUDE.md : "une
    // coquille technique sans fonction réelle"). Fait APRÈS le succès du
    // DELETE public.users (déjà bloqué/validé par le RPC ci-dessus) :
    // si cet appel échoue, les données personnelles sont déjà effacées,
    // seule la coquille technique reste à nettoyer manuellement.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (authError) {
      console.error("[CITOYEN SUPPRESSION AUTH CLEANUP ERROR]", authError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN SUPPRESSION EXECUTER ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
