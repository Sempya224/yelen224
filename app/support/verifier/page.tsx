import type { Metadata } from "next";
import Link from "next/link";
import { previsualiserTicketParTokenVerification } from "@/lib/supportTickets";
import { SUPPORT_CATEGORIE_PUBLIC_LABELS, type SupportCategoriePublic } from "@/lib/supportTicketsConstants";
import { ConfirmerVerificationButton } from "./ConfirmerVerificationButton";

export const metadata: Metadata = { title: "Vérifier votre demande — Yelen" };

// Server Component recevant `searchParams` en prop — pas de
// useSearchParams() client, pas de Suspense requis (même pattern que
// app/guide-prestataire/recherche/page.tsx). Lecture SEULE ici (aperçu
// via previsualiserTicketParTokenVerification) — la consommation réelle du
// token se fait uniquement via le clic explicite sur
// ConfirmerVerificationButton (POST /api/support/public/verify), jamais
// par ce simple chargement de page : neutralise le risque de pré-clic
// automatique par un scanner d'email (Outlook Safe Links, passerelles
// antispam d'entreprise). Voir
// docs/support-center/public-support-technical-design.md §7.
export default async function VerifierPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const apercu = token ? await previsualiserTicketParTokenVerification(token) : null;

  if (!token || !apercu) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 380 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: "#1a1200" }}>Lien invalide ou expiré</h1>
          <p style={{ color: "#6b5000", marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
            Ce lien de vérification n&apos;est plus valide — il a peut-être déjà été utilisé, ou plus de 24h se sont écoulées depuis votre demande.
          </p>
          <Link href="/contact" style={{ color: "#F5A623", fontWeight: 700, textDecoration: "none" }}>
            Envoyer une nouvelle demande →
          </Link>
        </div>
      </div>
    );
  }

  const categorieLabel = SUPPORT_CATEGORIE_PUBLIC_LABELS[apercu.categorie as SupportCategoriePublic] ?? apercu.categorie;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8, color: "#1a1200" }}>Confirmer votre demande</h1>
        <p style={{ color: "#8B6914", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{categorieLabel}</p>
        <p style={{ color: "#1a1200", fontWeight: 700, marginBottom: 24, fontSize: 15 }}>{apercu.sujet}</p>
        <ConfirmerVerificationButton token={token} />
      </div>
    </div>
  );
}
