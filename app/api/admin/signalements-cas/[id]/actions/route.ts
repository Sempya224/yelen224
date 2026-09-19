import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import {
  changerPriorite, changerStatut, resoudreSignalement,
  cloturerSignalement, reouvrirSignalement, escaladerSignalement, marquerDoublon,
} from "@/lib/signalements";
import {
  isSignalementStatut, isSignalementPriorite,
  isSignalementResolutionAction, isSignalementEscaladeNiveau,
  SIGNALEMENT_RESOLUTION_ACTION_LABELS, SIGNALEMENT_STATUT_LABELS,
} from "@/lib/signalementsConstants";

// Arbitrage Yelen (chantier 15/08/2026) : Yelen (admin) est désormais seul
// juge des dossiers institution <-> citoyen — l'institution a perdu ces
// mêmes actions (voir app/api/institution/signalements/[id]/actions/route.ts,
// ne garde plus que "assigner"). Même forme de route (un POST discriminé
// par `action`) que son équivalent institution, mais chaque décision
// notifie les DEUX parties (citoyen ET institution) — c'est le mécanisme
// qui manquait pour "transmettre la décision aux 2 côtés".
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function notifierDecision(signalementId: string, titre: string, message: string) {
  const { data: sig } = await sb.from("signalements").select("citoyen_id, institution_id").eq("id", signalementId).maybeSingle();
  if (!sig) return;
  await sb.from("notifications").insert([
    { destinataire_id: sig.citoyen_id, destinataire_type: "citoyen", type: "signalement", titre, message },
    { destinataire_id: sig.institution_id, destinataire_type: "institution", type: "signalement", titre, message },
  ]);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(req, "signalements.moderate");
    const { id } = await params;

    const { data: signalement } = await sb.from("signalements").select("id").eq("id", id).in("type_signaleur", ["institution", "citoyen"]).maybeSingle();
    if (!signalement) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const parMembre = { id: admin.adminId, nom: admin.nom, isAdminYelen: true as const };

    if (action === "changer_priorite") {
      const nouvellePriorite = body?.priorite;
      if (typeof nouvellePriorite !== "string" || !isSignalementPriorite(nouvellePriorite)) return NextResponse.json({ error: "priorite invalide" }, { status: 400 });
      const { data: sigPriorite } = await sb.from("signalements").select("institution_id").eq("id", id).maybeSingle();
      const resultat = await changerPriorite({ signalementId: id, institutionId: sigPriorite?.institution_id || "", nouvellePriorite, parMembre, req });
      return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
    }

    if (action === "changer_statut") {
      const nouveauStatut = body?.statut;
      if (typeof nouveauStatut !== "string" || !isSignalementStatut(nouveauStatut)) return NextResponse.json({ error: "statut invalide" }, { status: 400 });
      const resultat = await changerStatut({ signalementId: id, nouveauStatut, acteur: { type: "admin_yelen", id: admin.adminId, nom: admin.nom }, bypassTransitionCheck: true, req });
      if (resultat.ok && nouveauStatut === "rejete") {
        await notifierDecision(id, "Signalement rejeté", `Yelen a examiné ce signalement et l'a rejeté (statut : ${SIGNALEMENT_STATUT_LABELS.rejete}).`);
      }
      return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
    }

    if (action === "resoudre") {
      const resolutionAction = body?.resolutionAction;
      const resolutionExplication = body?.resolutionExplication;
      if (typeof resolutionAction !== "string" || !isSignalementResolutionAction(resolutionAction)) {
        return NextResponse.json({ error: "resolutionAction invalide" }, { status: 400 });
      }
      if (typeof resolutionExplication !== "string" || !resolutionExplication.trim()) {
        return NextResponse.json({ error: "Une explication de résolution est obligatoire" }, { status: 400 });
      }
      const resultat = await resoudreSignalement({ signalementId: id, resolutionAction, resolutionExplication: resolutionExplication.trim(), parMembre, req });
      if (resultat.ok) {
        await notifierDecision(id, "Signalement traité", `Yelen a examiné ce signalement. Décision : ${SIGNALEMENT_RESOLUTION_ACTION_LABELS[resolutionAction]}. ${resolutionExplication.trim()}`);
      }
      return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
    }

    if (action === "cloturer") {
      const resultat = await cloturerSignalement({ signalementId: id, parMembre, req });
      if (resultat.ok) await notifierDecision(id, "Signalement clôturé", "Yelen a clôturé ce dossier.");
      return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
    }

    if (action === "reouvrir") {
      const raison = body?.raison;
      if (typeof raison !== "string" || !raison.trim()) return NextResponse.json({ error: "Une raison de réouverture est obligatoire" }, { status: 400 });
      const resultat = await reouvrirSignalement({ signalementId: id, raison: raison.trim(), parMembre, req });
      if (resultat.ok) await notifierDecision(id, "Signalement rouvert", `Yelen a rouvert ce dossier pour complément d'examen. Raison : ${raison.trim()}`);
      return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
    }

    if (action === "escalader") {
      const nouveauNiveau = body?.niveau;
      if (typeof nouveauNiveau !== "string" || !isSignalementEscaladeNiveau(nouveauNiveau)) {
        return NextResponse.json({ error: "niveau invalide" }, { status: 400 });
      }
      const { data: sig } = await sb.from("signalements").select("institution_id").eq("id", id).maybeSingle();
      const resultat = await escaladerSignalement({
        signalementId: id, institutionId: sig?.institution_id || "", nouveauNiveau,
        parMembre, commentaire: typeof body?.commentaire === "string" ? body.commentaire : null, req,
      });
      return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
    }

    if (action === "marquer_doublon") {
      const principalSignalementId = body?.principalSignalementId;
      if (typeof principalSignalementId !== "string" || !principalSignalementId) return NextResponse.json({ error: "principalSignalementId requis" }, { status: 400 });
      const { data: sig } = await sb.from("signalements").select("institution_id").eq("id", id).maybeSingle();
      const resultat = await marquerDoublon({ signalementId: id, institutionId: sig?.institution_id || "", principalSignalementId, parMembre, req });
      return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
    }

    return NextResponse.json({ error: "action invalide (changer_priorite, changer_statut, resoudre, cloturer, reouvrir, escalader, marquer_doublon)" }, { status: 400 });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
