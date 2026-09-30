import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateUpload } from "@/lib/uploadSecurity";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

// Feedback technique citoyen — écran /compte/feedback (24/08/2026), même
// motivation que app/api/citoyen/signalements/route.ts : authentification
// par vrai accessToken Supabase Auth (pas de policy RLS lisible côté
// storage/service_role sans ça). Fire-and-forget, aucune lecture citoyen
// nécessaire (pas de GET) — analyse faite par Bryan en SQL Editor.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const MAX_CAPTURE_SIZE = 5 * 1024 * 1024;
// Types structurés du sheet d'aide "Tous les projets" (28/09/2026) — absent
// pour les envois depuis /compte/feedback (formulaire libre, sans choix).
const TYPES_VALIDES = new Set(["ne_fonctionne_pas", "incomprehensible", "manque", "difficile", "idee", "autre"]);

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const accessToken = form.get("accessToken");
  const message = form.get("message");
  const file = form.get("file");
  const typeRaw = form.get("type");
  const contexteRaw = form.get("contexte");

  if (typeof accessToken !== "string" || !accessToken) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });

  if (typeof message !== "string" || message.trim().length < 10) {
    return NextResponse.json({ error: "Décrivez le problème en au moins 10 caractères." }, { status: 400 });
  }

  const type = typeof typeRaw === "string" && TYPES_VALIDES.has(typeRaw) ? typeRaw : null;
  // Contexte auto-capturé côté client (écran/filtres/résultats) — jamais
  // saisi par l'utilisateur. Borné en taille et parsé avec repli silencieux
  // sur null : un contexte illisible ne doit jamais faire échouer l'envoi
  // du feedback lui-même.
  let contexte: unknown = null;
  if (typeof contexteRaw === "string" && contexteRaw.length > 0 && contexteRaw.length < 2000) {
    try { contexte = JSON.parse(contexteRaw); } catch { contexte = null; }
  }

  const { data: inserted, error: insertErr } = await sb.from("citoyen_feedback")
    .insert({ citoyen_id: user.id, message: message.trim(), type, contexte })
    .select("id").single();
  if (insertErr || !inserted) return NextResponse.json({ error: "Erreur lors de l'envoi. Réessayez." }, { status: 500 });

  if (file instanceof File) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const verif = await validateUpload(buffer, "FEEDBACK_CAPTURE", MAX_CAPTURE_SIZE, file.name);
    if (verif.valid) {
      const path = `${user.id}/${inserted.id}.${verif.extension}`;
      const { error: upErr } = await sb.storage.from("feedback-captures").upload(path, buffer, { contentType: verif.detectedType });
      if (!upErr) await sb.from("citoyen_feedback").update({ capture_path: path }).eq("id", inserted.id);
    }
    // Fichier invalide ou upload échoué : le feedback reste envoyé sans
    // capture, jamais bloquant (la pièce jointe est optionnelle).
  }

  return NextResponse.json({ success: true });
}
