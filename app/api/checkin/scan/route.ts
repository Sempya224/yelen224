import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { can } from "@/lib/institutionPermissions";
import { getEtatSessionCheckin, chargerMembreCheckinActif, toucherActiviteCheckin } from "@/lib/checkinAuth";
import { validerScanQr, resoudreCodeManuel, type RdvScanne } from "@/lib/qrValidation";
import { extraireIpClient } from "@/lib/edgeSecurity";
import { resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative, enregistrerTentative, messageSecurite } from "@/lib/security/authSecurity";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Réponse volontairement minimale (arbitrage Bryan 13/09/2026) : prénom +
// initiale du nom, heure, service, statut — jamais téléphone, nom complet,
// historique ou document. Le dashboard classique (app/api/qr/validate)
// garde sa réponse complète, ce n'est pas le même contexte d'usage.
function reponseMinimale(rdv: RdvScanne) {
  const initiale = rdv.citoyen_nom ? `${rdv.citoyen_nom.trim().charAt(0).toUpperCase()}.` : "";
  return {
    success: true,
    rdv: {
      id: rdv.id,
      heure_rdv: rdv.heure_rdv,
      service: rdv.objet,
      citoyen_affichage: `${rdv.citoyen_prenom ?? "Citoyen"} ${initiale}`.trim(),
      statut: rdv.statut,
    },
  };
}

// POST → scan caméra (qr_payload) OU code manuel de secours (code_manuel).
// Les deux chemins convergent vers la même vérification (lib/qrValidation.ts)
// — un seul jeu de règles, que l'entrée vienne d'une caméra ou d'une saisie.
export async function POST(req: NextRequest) {
  const etat = await getEtatSessionCheckin(req);
  if (etat.etat === "absente" || etat.etat === "invalide") {
    return NextResponse.json({ error: "Session expirée, reconnectez-vous.", code: "SESSION_EXPIRED" }, { status: 401 });
  }
  if (etat.etat === "verrouillee") {
    return NextResponse.json({ error: "Session verrouillée, ressaisissez votre PIN.", code: "SESSION_LOCKED" }, { status: 423 });
  }

  const membre = await chargerMembreCheckinActif({ membreId: etat.ctx.membreId, institutionId: etat.ctx.institutionId });
  if (!membre || !can(membre.role, "appointment.check_in")) {
    return NextResponse.json({ error: "Vous n'avez pas les droits nécessaires pour cette action." }, { status: 403 });
  }
  await toucherActiviteCheckin(etat.ctx.sid);

  const body = await req.json().catch(() => null);
  const qrPayload = body?.qr_payload;
  const codeManuel = body?.code_manuel;

  try {
    let rdvId: string;
    let qrToken: string;

    if (typeof codeManuel === "string" && codeManuel.trim()) {
      const { deviceId, estNouveau } = resoudreDeviceId(req);
      const ip = extraireIpClient(req);
      const porte = await evaluerTentative(supabase, { deviceId, ip });
      if (porte.state === "blocked" || porte.state === "support_only") {
        const reponse = NextResponse.json({ error: messageSecurite(porte.state), code: "AUTH_SECURITY_BLOCKED" }, { status: 423 });
        poserCookieDeviceSiNecessaire(reponse, deviceId, estNouveau);
        return reponse;
      }

      const code = codeManuel.trim().toUpperCase();
      const resolu = await resoudreCodeManuel(supabase, { code, institutionId: etat.ctx.institutionId });
      const etatTentative = await enregistrerTentative(supabase, {
        endpointCategory: "checkin_code_manuel", deviceId, ip, outcome: resolu ? "code_correct" : "code_incorrect", userAgent: req.headers.get("user-agent"),
      });
      if (!resolu) {
        const reponse = NextResponse.json({ error: "Ce code n'est pas valide ou a expiré. Vérifiez-le auprès du client, ou scannez son QR.", security: etatTentative }, { status: 404 });
        poserCookieDeviceSiNecessaire(reponse, deviceId, estNouveau);
        return reponse;
      }
      rdvId = resolu.rdvId;
      qrToken = resolu.qrToken;
    } else if (typeof qrPayload === "string" && qrPayload) {
      let parsed: { t: string; r: string; i: string };
      try {
        parsed = JSON.parse(qrPayload);
      } catch {
        return NextResponse.json({ error: "Ce QR code n'est pas reconnu. Réessayez de le scanner." }, { status: 400 });
      }
      if (parsed.i !== etat.ctx.institutionId) {
        return NextResponse.json({ error: "Ce QR appartient à un autre établissement — vérifiez qu'il s'agit du bon client." }, { status: 403 });
      }
      rdvId = parsed.r;
      qrToken = parsed.t;
    } else {
      return NextResponse.json({ error: "Scannez un QR ou saisissez un code." }, { status: 400 });
    }

    const resultat = await validerScanQr(supabase, { rdvId, qrToken, institutionId: etat.ctx.institutionId });
    if (!resultat.ok) return NextResponse.json(resultat.body, { status: resultat.status });

    return NextResponse.json(reponseMinimale(resultat.rdv));
  } catch {
    return NextResponse.json({ error: "Une erreur est survenue. Réessayez dans un instant." }, { status: 500 });
  }
}
