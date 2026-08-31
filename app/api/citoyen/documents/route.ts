import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enregistrerConsultation, enregistrerTelechargement } from "@/lib/citoyenDocuments";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Lot D (chantier "Activités passées") — liste des documents demandés/reçus
// par le citoyen, tous établissements confondus. citoyen_documents n'a
// aucune policy RLS (comme les tables de sécurité) : accès exclusivement
// via cette route, accessToken vérifié.
//
// Documents clients — Lot 1 (09/08/2026) : `?preview=`/`?download=`
// journalisent désormais chacun un événement document_events distinct
// ('viewed'/'downloaded') — un document sensible (pièce d'identité...)
// doit garder trace de chaque consultation, y compris par son propriétaire.
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const download = searchParams.get("download");
    const preview = searchParams.get("preview");
    const targetId = download ?? preview;
    if (targetId) {
      const { data: doc } = await supabaseAdmin.from("citoyen_documents").select("url, institution_id").eq("id", targetId).eq("citoyen_id", user.id).maybeSingle();
      if (!doc?.url) return NextResponse.json({ error: "Document introuvable", code: "NOT_FOUND" }, { status: 404 });
      const { data: signed, error: signErr } = await supabaseAdmin.storage.from("documents-citoyens").createSignedUrl(doc.url, 60);
      if (signErr || !signed) return NextResponse.json({ error: signErr?.message || "Erreur de génération d'URL", code: "SIGN_ERROR" }, { status: 500 });

      const acteur = { type: "citoyen" as const, id: user.id, nom: null };
      if (download) {
        await enregistrerTelechargement({ documentId: download, institutionId: doc.institution_id, citoyenId: user.id, acteur, req: request });
      } else {
        await enregistrerConsultation({ documentId: preview!, institutionId: doc.institution_id, citoyenId: user.id, acteur, req: request });
      }

      return NextResponse.json({ success: true, url: signed.signedUrl });
    }

    const { data, error } = await supabaseAdmin
      .from("citoyen_documents")
      .select("id,institution_id,rdv_id,sens,type,label,description,statut,taille,type_mime,created_at,traite_le,date_limite,motif_refus,motif_refus_detail,institutions(name)")
      .eq("citoyen_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, documents: data ?? [] });
  } catch (error) {
    console.error("[CITOYEN DOCUMENTS GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
