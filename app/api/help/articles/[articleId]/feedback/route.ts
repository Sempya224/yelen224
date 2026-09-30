import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getArticle } from "@/lib/helpCenter/data";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const COMMENTAIRE_MAX = 1000;

// Feedback "cet article vous a-t-il aidé ?" du Help Center prestataire
// public (retour Bryan 23/09/2026, ArticleFeedback.tsx). Visiteur public,
// aucune session Supabase Auth possible ici — écriture exclusivement
// service_role sur help_center_article_feedback (RLS activée, zéro
// policy, même convention que recherches_populaires). Le contenu des
// articles reste codé en dur (lib/helpCenter/data.ts) : getArticle()
// sert ici à valider que l'article existe réellement et est publié,
// jamais une FK vers une table d'articles. Le rate limiting générique
// (lib/edgeSecurity.ts::estRateLimite, appliqué à tout le site par
// proxy.ts quand EDGE_RATE_LIMIT_ENABLED est actif) couvre déjà cette
// route — pas de garde dupliquée ici.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ articleId: string }> }
) {
  try {
    const { articleId } = await params;
    const body = await request.json().catch(() => null);

    if (!body || typeof body.domaine !== "string" || typeof body.helpful !== "boolean") {
      return NextResponse.json({ success: false, message: "Requête invalide." }, { status: 400 });
    }

    const article = getArticle(body.domaine, articleId);
    if (!article) {
      return NextResponse.json({ success: false, message: "Article introuvable." }, { status: 404 });
    }

    let comment: string | null = null;
    if (body.comment !== undefined && body.comment !== null) {
      if (typeof body.comment !== "string") {
        return NextResponse.json({ success: false, message: "Requête invalide." }, { status: 400 });
      }
      const propre = body.comment.trim().slice(0, COMMENTAIRE_MAX);
      comment = propre.length > 0 ? propre : null;
    }

    const { error } = await supabaseAdmin.from("help_center_article_feedback").insert({
      article_id: article.id,
      domaine: article.domaine,
      helpful: body.helpful,
      comment,
      article_version: article.derniereVerification,
    });

    if (error) {
      console.error("[HELP FEEDBACK INSERT ERROR]", error);
      return NextResponse.json(
        { success: false, message: "Impossible d'enregistrer votre retour pour le moment." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[HELP FEEDBACK POST ERROR]", error);
    return NextResponse.json(
      { success: false, message: "Impossible d'enregistrer votre retour pour le moment." },
      { status: 500 }
    );
  }
}
