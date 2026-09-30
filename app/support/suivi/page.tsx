import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { obtenirTicketParToken } from "@/lib/supportTickets";
import { SUPPORT_SUIVI_COOKIE_NAME } from "@/lib/supportTicketsConstants";
import { SuiviConversation } from "./SuiviConversation";

export const metadata: Metadata = { title: "Suivre votre demande — Yelen" };

// Server Component — lecture directe du cookie httpOnly posé exclusivement
// par GET /api/support/public/suivi/session (jamais par cette page). Le
// chargement initial passe par obtenirTicketParToken() en direct, pas par
// un fetch vers /api/support/public/suivi (réservé au rafraîchissement
// côté client, voir docs/support-center/public-support-technical-design.md
// §8). Aucun useSearchParams()/token en query ici — le seul paramètre
// accepté par ce chantier pour la lecture est le cookie (§7 architecture).
export default async function SuiviPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUPPORT_SUIVI_COOKIE_NAME)?.value ?? "";
  const ticket = token ? await obtenirTicketParToken(token) : null;

  if (!ticket) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 380 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: "#1a1200" }}>Session de suivi expirée</h1>
          <p style={{ color: "#6b5000", marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
            Ce lien de suivi n&apos;est plus valide — il a peut-être expiré, ou votre conversation a été clôturée. Redemandez un lien depuis l&apos;email que nous vous avons envoyé, ou écrivez-nous à nouveau.
          </p>
          <Link href="/contact" style={{ color: "#F5A623", fontWeight: 700, textDecoration: "none" }}>
            Nous écrire à nouveau →
          </Link>
        </div>
      </div>
    );
  }

  return <SuiviConversation ticketInitial={ticket} />;
}
