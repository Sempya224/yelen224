import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

// Fiche détail d'un dossier institution <-> citoyen, côté admin (chantier
// arbitrage Yelen, 15/08/2026). Même forme que
// app/api/institution/signalements/[id]/route.ts, sans la restriction
// institution_id (l'admin voit tous les dossiers) et avec les pièces
// jointes déjà résolues en URL signée (fiche admin = lecture directe,
// pas de round-trip supplémentaire par pièce jointe).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeAdmin(req, "signalements.moderate");
    const { id } = await params;

    const { data: signalement, error } = await sb.from("signalements").select("*")
      .eq("id", id).in("type_signaleur", ["institution", "citoyen"]).maybeSingle();
    if (error) throw error;
    if (!signalement) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

    const [citoyenRow, institutionRow, eventsRes, notesRes, attachmentsRes] = await Promise.all([
      sb.from("users").select("nom, prenom, phone").eq("id", signalement.citoyen_id).maybeSingle(),
      sb.from("institutions").select("name").eq("id", signalement.institution_id).maybeSingle(),
      // Colonnes explicites (pas select("*")) : ip/user_agent sont des
      // données d'audit interne, jamais nécessaires à l'affichage d'une
      // fiche — même correctif que Documents clients Lot 5 (12/08/2026).
      sb.from("signalement_events").select("id, audit_id, type, acteur_type, membre_nom, ancienne_valeur, nouvelle_valeur, commentaire, created_at").eq("signalement_id", id).order("created_at", { ascending: true }),
      sb.from("signalement_notes").select("id, auteur_nom, contenu, created_at").eq("signalement_id", id).order("created_at", { ascending: false }),
      sb.from("signalement_attachments").select("id, storage_path, nom_original, type_mime, taille, ajoute_par_nom, created_at").eq("signalement_id", id).order("created_at", { ascending: false }),
    ]);

    const attachments = await Promise.all((attachmentsRes.data ?? []).map(async a => {
      const { data: signed } = await sb.storage.from("signalements-preuves").createSignedUrl(a.storage_path, 60);
      return { id: a.id, nom_original: a.nom_original, type_mime: a.type_mime, taille: a.taille, ajoute_par_nom: a.ajoute_par_nom, created_at: a.created_at, url: signed?.signedUrl || null };
    }));

    const citoyen = citoyenRow.data;
    const citoyen_name = citoyen ? [citoyen.prenom, citoyen.nom].filter(Boolean).join(" ") || citoyen.phone || "Citoyen" : "Citoyen";

    return NextResponse.json({
      signalement: { ...signalement, citoyen_name, institution_name: institutionRow.data?.name || "Institution" },
      events: eventsRes.data ?? [],
      notes: notesRes.data ?? [],
      attachments,
    });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
