import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Zone de travail géolocalisée — V1 une seule zone par institution
// (contrainte UNIQUE institution_id, migration 20260921000003). Même
// pattern que les autres routes app/api/institution/clock-in/*.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.read_full")) {
    return NextResponse.json({ error: "Accès réservé à ce module" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("work_zones")
    .select("id,latitude,longitude,rayon_metres,actif,updated_at")
    .eq("institution_id", membre.institutionId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ zone: data ?? null });
}

// Upsert — une institution ne gère qu'une seule zone en V1, POST crée ou
// remplace la zone existante (jamais un second enregistrement).
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const latitude = body?.latitude;
  const longitude = body?.longitude;
  const rayonMetres = body?.rayonMetres;

  if (typeof latitude !== "number" || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    return NextResponse.json({ error: "Latitude invalide" }, { status: 400 });
  }
  if (typeof longitude !== "number" || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Longitude invalide" }, { status: 400 });
  }
  if (!Number.isInteger(rayonMetres) || rayonMetres < 20 || rayonMetres > 5000) {
    return NextResponse.json({ error: "Le rayon doit être entre 20 et 5000 mètres" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("work_zones")
    .upsert(
      {
        institution_id: membre.institutionId,
        latitude, longitude, rayon_metres: rayonMetres,
        membre_id: membre.membreId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "institution_id" },
    )
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "zone_travail_definie",
    cibleTable: "work_zones",
    cibleId: data.id,
    details: { latitude, longitude, rayonMetres },
    req,
  });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.actif !== "boolean") return NextResponse.json({ error: "actif requis" }, { status: 400 });

  const { error } = await sb
    .from("work_zones")
    .update({ actif: body.actif, updated_at: new Date().toISOString() })
    .eq("institution_id", membre.institutionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: body.actif ? "zone_travail_activee" : "zone_travail_desactivee",
    cibleTable: "work_zones",
    req,
  });

  return NextResponse.json({ ok: true });
}
