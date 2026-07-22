import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { getRequiredDocuments, MAX_DOCUMENT_SIZE, DOCUMENT_ACCEPTED_MIME } from "@/lib/documentsInstitution";

// Contourne RLS via service role — documents_institution n'a volontairement
// aucune policy (voir migration 20260711000005), accès exclusivement via
// cette route. Le client ne reçoit jamais `url` : ni ici, ni ailleurs, un
// document soumis reste invisible côté institution une fois envoyé
// (principe non négociable — seul un statut est renvoyé).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { data: inst, error: instErr } = await sb
    .from("institutions")
    .select("statut, statut_juridique")
    .eq("id", authInstId)
    .maybeSingle();
  if (instErr || !inst) return NextResponse.json({ error: "Institution introuvable" }, { status: 404 });

  const required = getRequiredDocuments(inst.statut_juridique);

  const { data: rows, error: rowsErr } = await sb
    .from("documents_institution")
    .select("type, statut, motif_rejet, soumis_le")
    .eq("institution_id", authInstId);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const documents = required.map((doc) => {
    const row = (rows || []).find((r) => r.type === doc.type);
    return {
      type: doc.type,
      label: doc.label,
      description: doc.description,
      formats: doc.formats,
      obligatoire: doc.obligatoire,
      statut: row?.statut ?? null,
      motif_rejet: row?.motif_rejet ?? null,
      soumis_le: row?.soumis_le ?? null,
    };
  });

  return NextResponse.json({
    institution_statut: inst.statut,
    statut_juridique: inst.statut_juridique,
    documents,
  });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "documents_institutionnels.write")) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const type = form.get("type");
  const file = form.get("file");

  const { data: inst, error: instErr } = await sb
    .from("institutions")
    .select("statut_juridique")
    .eq("id", authInstId)
    .maybeSingle();
  if (instErr || !inst) return NextResponse.json({ error: "Institution introuvable" }, { status: 404 });

  const required = getRequiredDocuments(inst.statut_juridique);
  if (typeof type !== "string" || !required.some((r) => r.type === type)) {
    return NextResponse.json({ error: "Type de document invalide pour ce profil" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }
  if (!DOCUMENT_ACCEPTED_MIME.includes(file.type)) {
    return NextResponse.json({ error: "Format non accepté (PDF, JPG, PNG uniquement)" }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)" }, { status: 400 });
  }

  // Renvoi libre interdit tant que le document est en cours d'examen ou déjà
  // validé — seul un complément demandé ou un rejet débloque un nouvel envoi.
  const { data: existing } = await sb
    .from("documents_institution")
    .select("statut")
    .eq("institution_id", authInstId)
    .eq("type", type)
    .maybeSingle();
  if (existing && (existing.statut === "recu" || existing.statut === "valide")) {
    return NextResponse.json(
      { error: "Ce document est déjà en cours d'examen ou validé — aucun renvoi possible pour l'instant." },
      { status: 409 }
    );
  }

  const ext = file.name.split(".").pop() || "pdf";
  const path = `${authInstId}/${type}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from("documents").upload(path, buffer, {
    upsert: true,
    contentType: file.type,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error: upsertErr } = await sb.from("documents_institution").upsert(
    {
      institution_id: authInstId,
      type,
      nom: file.name,
      url: path,
      statut: "recu",
      motif_rejet: null,
      soumis_le: new Date().toISOString(),
      examine_le: null,
      examine_par: null,
    },
    { onConflict: "institution_id,type" }
  );
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
