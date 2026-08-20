import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { getRequiredDocuments, MAX_DOCUMENT_SIZE } from "@/lib/documentsInstitution";
import { validateUpload } from "@/lib/uploadSecurity";
import { createHash } from "crypto";

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
    .eq("institution_id", authInstId)
    .eq("statut_actif", true);
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

  // Renvoi libre interdit tant que le document est en cours d'examen ou déjà
  // validé — seul un complément demandé ou un rejet débloque un nouvel envoi.
  // Filtré sur statut_actif : depuis le versionnement (Trust Lot 2.4),
  // plusieurs lignes historiques peuvent exister pour ce (institution_id,
  // type), une seule active à la fois.
  const { data: existing } = await sb
    .from("documents_institution")
    .select("statut")
    .eq("institution_id", authInstId)
    .eq("type", type)
    .eq("statut_actif", true)
    .maybeSingle();
  if (existing && (existing.statut === "recu" || existing.statut === "valide")) {
    return NextResponse.json(
      { error: "Ce document est déjà en cours d'examen ou validé — aucun renvoi possible pour l'instant." },
      { status: 409 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "DOCUMENT_KYC", MAX_DOCUMENT_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });

  // Chemin versionné (id généré côté serveur avant l'upload) — plus jamais
  // un chemin fixe par type : aucune resoumission ne peut désormais écraser
  // un fichier déjà référencé par une décision de vérification. Voir
  // docs/product/YELEN_TRUST_VERIFICATION_DATA_MODEL.md section F.
  const documentId = crypto.randomUUID();
  const path = `${authInstId}/${type}/${documentId}.${verif.extension}`;

  const { error: upErr } = await sb.storage.from("documents").upload(path, buffer, {
    upsert: false,
    contentType: verif.detectedType,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const hashIntegrite = createHash("sha256").update(buffer).digest("hex");

  // Écriture atomique (nouvelle version créée + ancienne désactivée) via la
  // fonction transactionnelle dédiée — jamais un upsert/update direct sur
  // documents_institution. Règle d'architecture non négociable, voir
  // migration 20260816000002_verification_expand_rpc_deposer_version.sql.
  const { error: rpcErr } = await sb.rpc("deposer_nouvelle_version_document", {
    p_institution_id: authInstId,
    p_type: type,
    p_nom: file.name,
    p_storage_path: path,
    p_hash_integrite: hashIntegrite,
    p_soumis_par_membre_id: membre.membreId,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
