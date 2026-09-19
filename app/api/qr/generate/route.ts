import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { calculerEtatQr, combinerDateHeureRdv, QR_MINUTES_APRES_RDV, QR_MINUTES_REGENERATION_FINALE, RDV_QR_EXPIRE_DEFINITIF_MESSAGE } from "@/lib/rdvGating";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Audit de consolidation (07/08/2026) : cette route acceptait auparavant un
// citoyen_id fourni tel quel par le client, sans vérifier qu'il correspondait
// à un appelant réellement authentifié — un attaquant connaissant une paire
// (rdv_id, citoyen_id) pouvait générer/regénérer le QR de présence d'un
// citoyen qui n'est pas lui (ex. une institution voyant ces IDs dans son
// propre dashboard). Corrigé avec le même pattern que
// app/api/citoyen/favoris/route.ts : citoyen_id dérivé du token Supabase
// vérifié, jamais du corps de la requête.
async function getAuthenticatedCitoyenId(req: NextRequest): Promise<string | null> {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;
  return user.id;
}

export async function POST(req: NextRequest) {
  try {
    const citoyen_id = await getAuthenticatedCitoyenId(req);
    if (!citoyen_id)
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { rdv_id } = await req.json();

    if (!rdv_id)
      return NextResponse.json({ error: "rdv_id requis" }, { status: 400 });

    const { data: rdv, error: rdvErr } = await supabase
      .from("rdv")
      .select("id,date_rdv,heure_rdv,statut,presence_status,institution_id,citoyen_id,qr_token,qr_expires_at,qr_regenere_le,code_secours")
      .eq("id", rdv_id)
      .eq("citoyen_id", citoyen_id)
      .single();

    if (rdvErr || !rdv)
      return NextResponse.json({ error: "RDV introuvable" }, { status: 404 });

    if (rdv.statut === "annule")
      return NextResponse.json({ error: "RDV annulé" }, { status: 400 });

    if (rdv.presence_status === "present")
      return NextResponse.json({ error: "Déjà confirmé" }, { status: 400 });

    const maintenant = new Date();
    const etat = calculerEtatQr(rdv.qr_expires_at, rdv.qr_regenere_le, maintenant);

    // Cycle borné (décision CEO 01/09/2026, voir lib/rdvGating.ts) — plus de
    // régénération illimitée à expiration 7 jours sans rapport avec l'heure
    // réelle du RDV. Une fois "expire_definitif", le système refuse
    // structurellement toute nouvelle génération : aucune ligne écrite,
    // jamais de statut/message inventé ailleurs, la même règle protège le
    // scan côté validate/route.ts.
    if (etat === "expire_definitif") {
      return NextResponse.json({
        success: true,
        etat: "expire_definitif",
        titre: RDV_QR_EXPIRE_DEFINITIF_MESSAGE.titre,
        message: RDV_QR_EXPIRE_DEFINITIF_MESSAGE.message,
      });
    }

    let qr_token = rdv.qr_token;
    let qr_expires_at = rdv.qr_expires_at;
    let derniere_chance = !!rdv.qr_regenere_le;
    let code_secours = rdv.code_secours;

    if (etat === "aucun" || etat === "expire_regenerable") {
      // Correctif sécurité (01/09/2026) : plus de secret de repli codé en
      // dur ("yelen224-secret") — si QR_SECRET_KEY est absente, la clé HMAC
      // signant les tokens de présence serait une chaîne publique connue
      // (visible dans ce fichier), permettant de forger un qr_token valide
      // pour n'importe quel rdv_id/citoyen_id. Échec explicite plutôt qu'un
      // repli devinable, même discipline que INSTITUTION_OTP_FALLBACK.
      const qrSecret = process.env.QR_SECRET_KEY;
      if (!qrSecret) {
        console.error("[QR GENERATE] QR_SECRET_KEY manquante — génération de token refusée.");
        return NextResponse.json(
          { error: "Configuration serveur incomplète. Contactez le support." },
          { status: 500 }
        );
      }

      const rawToken = `${rdv_id}:${citoyen_id}:${rdv.date_rdv}:${maintenant.getTime()}`;
      qr_token = crypto
        .createHmac("sha256", qrSecret)
        .update(rawToken)
        .digest("hex");

      // Code manuel de secours (chantier YELEN Accueil, 13/09/2026) —
      // même cycle de vie que qr_token (régénéré en même temps, même
      // expiration), pour le citoyen dont la caméra/l'écran ne
      // fonctionne pas. Alphabet sans caractères ambigus (0/O/1/I/L),
      // `crypto.randomInt` par caractère (pas de biais modulo).
      const ALPHABET_CODE_SECOURS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      code_secours = "";
      for (let i = 0; i < 8; i++) {
        code_secours += ALPHABET_CODE_SECOURS[crypto.randomInt(ALPHABET_CODE_SECOURS.length)];
      }

      const updates: Record<string, unknown> = { qr_token, code_secours };

      // Génération initiale : expiration alignée sur l'heure réelle du RDV,
      // jamais sur l'instant de génération. Si le citoyen ouvre l'écran pour
      // la toute première fois après que cette fenêtre naturelle soit déjà
      // dépassée (jamais généré avant le jour J), on lui accorde directement
      // sa seule chance de régénération finale plutôt que de créer un QR déjà
      // mort à la création.
      const expirationNaturelle = new Date(combinerDateHeureRdv(rdv.date_rdv, rdv.heure_rdv).getTime() + QR_MINUTES_APRES_RDV * 60000);
      if (etat === "aucun" && expirationNaturelle > maintenant) {
        qr_expires_at = expirationNaturelle.toISOString();
      } else {
        qr_expires_at = new Date(maintenant.getTime() + QR_MINUTES_REGENERATION_FINALE * 60000).toISOString();
        updates.qr_regenere_le = maintenant.toISOString();
        derniere_chance = true;
      }
      updates.qr_expires_at = qr_expires_at;
      updates.code_secours_expires_at = qr_expires_at;

      await supabase
        .from("rdv")
        .update(updates)
        .eq("id", rdv_id);
    }
    // etat === "actif" : token déjà valide, réutilisé tel quel — aucune
    // écriture, aucune nouvelle valeur (répond à la demande CEO "une seule
    // génération", plus de régénération à chaque entrée sur l'écran).

    const qrPayload = JSON.stringify({
      t: qr_token,
      r: rdv_id,
      i: rdv.institution_id,
      d: rdv.date_rdv,
    });

    return NextResponse.json({
      success: true,
      etat: "actif",
      qr_payload: qrPayload,
      qr_token,
      code_secours,
      expires_at: qr_expires_at,
      derniere_chance,
    });

  } catch {
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}