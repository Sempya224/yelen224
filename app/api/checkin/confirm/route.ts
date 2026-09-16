import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { can } from "@/lib/institutionPermissions";
import { getEtatSessionCheckin, chargerMembreCheckinActif, toucherActiviteCheckin } from "@/lib/checkinAuth";
import { confirmerPresenceRdv, effetsBordConfirmationPresente, effetsBordConfirmationAbsente } from "@/lib/qrValidation";
import { getMembreNomPourJournal } from "@/lib/journalActivite";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PUT → confirmer présent/absent depuis YELEN Accueil. Mêmes règles que le
// dashboard (lib/qrValidation.ts), réponse minimale (arbitrage Bryan
// 13/09/2026) : jamais de téléphone/nom complet dans la confirmation.
export async function PUT(req: NextRequest) {
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
  const rdvId = body?.rdv_id;
  const action = body?.action;
  const motif = typeof body?.motif === "string" ? body.motif.trim() : undefined;

  if (!rdvId || !action) return NextResponse.json({ error: "Informations manquantes. Réessayez." }, { status: 400 });
  if (!["present", "absent"].includes(action)) return NextResponse.json({ error: "Action non reconnue. Réessayez." }, { status: 400 });

  try {
    const resultat = await confirmerPresenceRdv(supabase, { rdvId, action, institutionId: etat.ctx.institutionId, motif });
    if (!resultat.ok) return NextResponse.json(resultat.body, { status: resultat.status });

    const membreNom = await getMembreNomPourJournal(etat.ctx.membreId);
    if (resultat.action === "present") {
      await effetsBordConfirmationPresente({ confirmation: resultat, membreId: etat.ctx.membreId, membreNom, req });
    } else {
      await effetsBordConfirmationAbsente({ confirmation: resultat, motif: motif!, membreId: etat.ctx.membreId, membreNom, req });
    }

    return NextResponse.json({ success: true, status: resultat.action });
  } catch {
    return NextResponse.json({ error: "Une erreur est survenue. Réessayez dans un instant." }, { status: 500 });
  }
}
