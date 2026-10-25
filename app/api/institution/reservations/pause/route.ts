import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Booking Governance, Lot 1 (docs/product/YELEN_BOOKING_GOVERNANCE.md §3) —
// pause volontaire établissement. Emplacement proposé par la vision CEO :
// "Réservations → Disponibilité → Pause des réservations", donc même onglet
// (et même ActionKey d'écriture, disponibilites.write) que
// /api/institution/disponibilites.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TYPES = ["immediate", "jusqu_a_date", "periode"] as const;
type PauseType = (typeof TYPES)[number];
function isPauseType(v: unknown): v is PauseType {
  return typeof v === "string" && (TYPES as readonly string[]).includes(v);
}

const MOTIF_MAX_LENGTH = 500;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "disponibilites") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("institution_reservation_pauses")
    .select("id, type, debut_le, fin_le, motif, cree_le")
    .eq("institution_id", membre.institutionId)
    .is("levee_le", null)
    .order("cree_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ pause: null });

  const maintenant = Date.now();
  const debut = new Date(data.debut_le).getTime();
  const fin = data.fin_le ? new Date(data.fin_le).getTime() : null;
  const active = debut <= maintenant && (fin === null || fin > maintenant);

  return NextResponse.json({
    pause: {
      id: data.id,
      type: data.type,
      debutLe: data.debut_le,
      finLe: data.fin_le,
      motif: data.motif,
      creeLe: data.cree_le,
      active,
    },
  });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "disponibilites.write")) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const type = body?.type;
  if (!isPauseType(type)) {
    return NextResponse.json({ error: "Type de pause invalide" }, { status: 400 });
  }

  const motifBrut = typeof body?.motif === "string" ? body.motif.trim() : "";
  if (motifBrut.length > MOTIF_MAX_LENGTH) {
    return NextResponse.json({ error: `Motif trop long (${MOTIF_MAX_LENGTH} caractères maximum)` }, { status: 400 });
  }
  const motif = motifBrut || null;

  const maintenant = new Date();
  let debutLe = maintenant;
  let finLe: Date | null = null;

  if (type === "jusqu_a_date") {
    const finBrut = typeof body?.finLe === "string" ? new Date(body.finLe) : null;
    if (!finBrut || isNaN(finBrut.getTime()) || finBrut <= maintenant) {
      return NextResponse.json({ error: "Date de fin requise et doit être dans le futur" }, { status: 400 });
    }
    finLe = finBrut;
  } else if (type === "periode") {
    const debutBrut = typeof body?.debutLe === "string" ? new Date(body.debutLe) : null;
    const finBrut = typeof body?.finLe === "string" ? new Date(body.finLe) : null;
    if (!debutBrut || isNaN(debutBrut.getTime()) || !finBrut || isNaN(finBrut.getTime())) {
      return NextResponse.json({ error: "Dates de début et de fin requises" }, { status: 400 });
    }
    if (finBrut <= debutBrut) {
      return NextResponse.json({ error: "La date de fin doit être après la date de début" }, { status: 400 });
    }
    debutLe = debutBrut;
    finLe = finBrut;
  }
  // type === "immediate" : debutLe = maintenant, finLe = null (levée manuelle requise).

  // Lève toute pause déjà ouverte avant d'en créer une nouvelle — invariant
  // "une seule pause ouverte à la fois" porté par l'application, pas par
  // une contrainte DB (fréquence d'usage trop faible pour justifier un
  // index unique partiel, cf. plan).
  const { error: errLift } = await sb
    .from("institution_reservation_pauses")
    .update({ levee_le: maintenant.toISOString(), levee_par: membre.membreId })
    .eq("institution_id", membre.institutionId)
    .is("levee_le", null);
  if (errLift) return NextResponse.json({ error: errLift.message }, { status: 500 });

  const { data: nouvelle, error: errInsert } = await sb
    .from("institution_reservation_pauses")
    .insert({
      institution_id: membre.institutionId,
      type,
      debut_le: debutLe.toISOString(),
      fin_le: finLe ? finLe.toISOString() : null,
      motif,
      cree_par: membre.membreId,
    })
    .select("id")
    .single();
  if (errInsert) return NextResponse.json({ error: errInsert.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "pause_reservations_activee",
    cibleTable: "institution_reservation_pauses",
    cibleId: nouvelle.id,
    details: { type, debutLe: debutLe.toISOString(), finLe: finLe ? finLe.toISOString() : null },
    req,
  });

  return NextResponse.json({ ok: true, id: nouvelle.id });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "disponibilites.write")) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const maintenant = new Date().toISOString();
  const { data, error } = await sb
    .from("institution_reservation_pauses")
    .update({ levee_le: maintenant, levee_par: membre.membreId })
    .eq("institution_id", membre.institutionId)
    .is("levee_le", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Aucune pause active à lever" }, { status: 404 });
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "pause_reservations_levee",
    cibleTable: "institution_reservation_pauses",
    cibleId: data[0].id,
    req,
  });

  return NextResponse.json({ ok: true });
}
