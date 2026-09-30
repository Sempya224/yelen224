import { NextRequest, NextResponse } from "next/server";
import { verifierAuthPostmarkWebhook, enregistrerSignalPostmark } from "@/lib/supportTickets";

// Support Public Yelen (24/09/2026) — webhook Postmark spam complaint.
// Champs Email/MessageID confirmés contre la documentation officielle
// (postmarkapp.com/developer/webhooks/spam-complaint-webhook, RecordType
// attendu "SpamComplaint") au moment de ce chantier. Signal anti-abus
// uniquement (§11 technical design) — aucune action automatique sur un
// ticket.
export async function POST(request: NextRequest) {
  if (!verifierAuthPostmarkWebhook(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.Email === "string" ? body.Email : "";
  const messageId = typeof body?.MessageID === "string" ? body.MessageID : "";
  if (!email || !messageId) return NextResponse.json({ ok: true });

  await enregistrerSignalPostmark({ type: "spam", email, postmarkMessageId: messageId });
  return NextResponse.json({ ok: true });
}
