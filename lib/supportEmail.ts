// Support Public Yelen — envoi transactionnel via Postmark (24/09/2026,
// fournisseur verrouillé, voir docs/support-center/public-support-architecture.md
// §6 et docs/support-center/public-support-technical-design.md §9-10).
// Fichier isolé, seul point d'appel Postmark du projet pour ce chantier —
// jamais mélangé à la logique métier de lib/supportTickets.ts.

export type EmailSupportType = "verification" | "confirmation" | "reponse_agent" | "resolution";

// Préfixe support- : isole ces templates de tout futur usage Postmark non
// lié au Support (§10 technical design). reponse_agent couvre à la fois
// "nouvelle réponse" et "demande d'info" (même contenu, pas de distinction
// technique nécessaire) ; resolution couvre à la fois résolution et
// clôture (non distinguées côté visiteur).
const TEMPLATE_ALIAS: Record<EmailSupportType, string> = {
  verification: "support-verification-email",
  confirmation: "support-confirmation-demande",
  reponse_agent: "support-reponse-agent",
  resolution: "support-resolution",
};

type ResultatEnvoi = { ok: true; postmarkMessageId: string } | { ok: false; error: string };

export async function envoyerEmailSupport(params: {
  type: EmailSupportType;
  destinataire: string;
  variables: Record<string, string>;
}): Promise<ResultatEnvoi> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) return { ok: false, error: "POSTMARK_SERVER_TOKEN manquant." };

  try {
    const res = await fetch("https://api.postmarkapp.com/email/withTemplate", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM_EMAIL,
        To: params.destinataire,
        TemplateAlias: TEMPLATE_ALIAS[params.type],
        TemplateModel: params.variables,
        MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
      }),
      // Postmark en panne/lent ne doit jamais bloquer la réponse HTTP au
      // visiteur au-delà de quelques secondes (même ordre de grandeur que
      // lib/edgeSecurity.ts::estIpVpnOuProxy).
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json().catch(() => null) as { MessageID?: string; Message?: string } | null;
    if (!res.ok) return { ok: false, error: json?.Message || `Postmark a répondu ${res.status}.` };
    return { ok: true, postmarkMessageId: json?.MessageID || "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau Postmark." };
  }
}
