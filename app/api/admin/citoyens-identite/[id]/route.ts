import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Dossier de vérification d'identité citoyen — URL signées générées ici
// uniquement (60s, jamais persistées côté client), même principe que
// app/api/admin/institutions/[id]/verification/route.ts et
// app/api/admin/documents-citoyen/route.ts sur ce même bucket privé.
// 3 pièces depuis le flux recto+verso+selfie (28/08/2026).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeAdmin(req, "citoyens.verify");
    const { id } = await params;

    const { data: citoyen, error } = await sb
      .from("users")
      .select("id, nom, prenom, phone, created_at, cin_document_url, cin_verso_document_url, cin_selfie_url, cin_soumis_le, cin_statut, cin_motif_refus, cin_examine_le, identite_verifiee")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!citoyen) return NextResponse.json({ error: "Citoyen introuvable" }, { status: 404 });

    async function signer(path: string | null): Promise<string | null> {
      if (!path) return null;
      const { data: signed } = await sb.storage.from("documents-citoyens").createSignedUrl(path, 60);
      return signed?.signedUrl ?? null;
    }
    const [rectoUrl, versoUrl, selfieUrl] = await Promise.all([
      signer(citoyen.cin_document_url),
      signer(citoyen.cin_verso_document_url),
      signer(citoyen.cin_selfie_url),
    ]);

    return NextResponse.json({
      id: citoyen.id,
      nom: citoyen.nom,
      prenom: citoyen.prenom,
      phone: citoyen.phone,
      created_at: citoyen.created_at,
      cin_soumis_le: citoyen.cin_soumis_le,
      cin_statut: citoyen.cin_statut,
      cin_motif_refus: citoyen.cin_motif_refus,
      cin_examine_le: citoyen.cin_examine_le,
      identite_verifiee: citoyen.identite_verifiee,
      recto_url: rectoUrl,
      verso_url: versoUrl,
      selfie_url: selfieUrl,
    });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
