import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { validateUpload } from "@/lib/uploadSecurity";

// Documents rattachés à un employé (section "Documents" du drawer, refonte
// Employés 05/08/2026) — bucket privé "documents-employes" (à créer
// manuellement par Bryan, voir 20260805000013_clock_in_employee_documents.sql),
// mêmes conventions que app/api/citoyen/documents/upload/route.ts (URLs
// signées à durée limitée, jamais d'URL publique directe).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_SIZE = 10 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.read_full")) {
    return NextResponse.json({ error: "Accès réservé à ce module" }, { status: 403 });
  }

  const employeeId = new URL(req.url).searchParams.get("employeeId");
  if (!employeeId) return NextResponse.json({ error: "employeeId requis" }, { status: 400 });

  const { data, error } = await sb
    .from("employee_documents")
    .select("id,label,type,url,type_mime,taille,created_at")
    .eq("institution_id", membre.institutionId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const documents = await Promise.all(
    (data ?? []).map(async (doc) => {
      const { data: signed } = await sb.storage.from("documents-employes").createSignedUrl(doc.url, 60);
      return { ...doc, signedUrl: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const employeeId = form.get("employeeId");
  const label = form.get("label");
  const type = form.get("type");
  const file = form.get("file");

  if (typeof employeeId !== "string" || !employeeId) return NextResponse.json({ error: "employeeId requis" }, { status: 400 });
  if (typeof label !== "string" || !label.trim()) return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

  const { data: employe } = await sb.from("employees").select("id").eq("id", employeeId).eq("institution_id", membre.institutionId).maybeSingle();
  if (!employe) return NextResponse.json({ error: "Employé introuvable pour cette institution" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const verif = await validateUpload(buffer, "DOCUMENT_KYC", MAX_SIZE, file.name);
  if (!verif.valid) return NextResponse.json({ error: verif.reason }, { status: 400 });
  const path = `${membre.institutionId}/${employeeId}/${crypto.randomUUID()}.${verif.extension}`;
  const { error: upErr } = await sb.storage.from("documents-employes").upload(path, buffer, { contentType: verif.detectedType });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await sb
    .from("employee_documents")
    .insert({
      institution_id: membre.institutionId,
      employee_id: employeeId,
      label: label.trim(),
      type: typeof type === "string" && type.trim() ? type.trim() : "autre",
      url: path,
      type_mime: verif.detectedType,
      taille: file.size,
      televerse_par_membre_id: membre.membreId,
    })
    .select("id")
    .single();
  if (error) {
    await sb.storage.from("documents-employes").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: doc } = await sb.from("employee_documents").select("id,institution_id,url").eq("id", id).maybeSingle();
  if (!doc || doc.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });
  }

  const { error } = await sb.from("employee_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.storage.from("documents-employes").remove([doc.url]);

  return NextResponse.json({ ok: true });
}
