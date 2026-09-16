import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Support Yelen institution — réception live (même solution que
// app/api/institution/conversations/[id]/stream/route.ts, voir ce fichier
// pour l'explication complète) : le serveur (service_role) s'abonne à
// Realtime sur support_tickets/support_ticket_messages et relaie un signal
// au navigateur via Server-Sent Events — institution n'a jamais de session
// Supabase Auth, donc jamais de Realtime direct possible sans ouvrir ces
// tables en lecture publique (refusé).

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return new Response("Non authentifié", { status: 401 });
  const { id } = await params;

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: ticket } = await sb.from("support_tickets").select("id").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!ticket) return new Response("Conversation introuvable", { status: 404 });

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const signal = (event: string) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`)); } catch {}
      };

      const channel = sb
        .channel(`support-ticket-stream-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${id}` }, () => signal("changed"))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${id}` }, () => signal("changed"))
        .subscribe();

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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
