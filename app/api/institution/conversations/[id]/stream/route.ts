import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Messagerie V2 — réception live (retour Bryan 06/09/2026, "arrange ça au
// niveau US" après refus explicite d'ouvrir messages/conversations en
// lecture publique juste pour permettre à Supabase Realtime de fonctionner
// depuis le navigateur institution, qui n'a jamais de session Supabase Auth
// — cf. /auth dans CLAUDE.md). Solution retenue : le serveur (ce route
// handler, service_role, donc jamais bloqué par RLS) s'abonne lui-même à
// Realtime et relaie un simple signal "changed" au navigateur via
// Server-Sent Events sur la connexion déjà authentifiée par le cookie JWT
// institution — jamais de clé Supabase exposée côté client, jamais de
// policy RLS élargie. Le navigateur réagit au signal en rappelant
// GET /api/institution/conversations/[id] (déjà correct : mapping des
// messages + marquage lu), pas de duplication de logique ici.
//
// ⚠️ Point non vérifiable depuis cet environnement : le comportement réel
// d'une réponse en streaming longue durée sur Netlify (limite d'exécution
// des functions) n'a pas pu être testé. Dégradation attendue si la
// connexion est coupée par la plateforme : EventSource se reconnecte
// automatiquement côté navigateur (comportement natif, ~3s de délai par
// défaut) — au pire un comportement proche du polling, jamais une panne
// silencieuse. À confirmer par Bryan en conditions réelles après déploiement.
//
// ⚠️ Prérequis DB : messages/conversations doivent faire partie de la
// publication `supabase_realtime` (migration
// 20260906000003_messagerie_v2_realtime_publication.sql, idempotente).

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return new Response("Non authentifié", { status: 401 });
  const { id } = await params;

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: conv } = await sb.from("conversations").select("id").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!conv) return new Response("Conversation introuvable pour cette institution", { status: 404 });

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const signal = (event: string) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`)); } catch {}
      };

      const channel = sb
        .channel(`conv-stream-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, () => signal("changed"))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${id}` }, () => signal("changed"))
        .subscribe();

      // Garde la connexion ouverte à travers les proxys/CDN (pattern SSE
      // standard) — un commentaire (ligne préfixée ":") n'est pas un event,
      // ignoré par EventSource, sert uniquement à empêcher un timeout idle.
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); } catch {}
      }, 20000);

      req.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        sb.removeChannel(channel);
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
