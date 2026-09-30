"use client";

// Vue d'ensemble du Centre légal Yelen (/legal) — nouvelle route créée
// pour donner une vraie destination à l'entrée "Vue d'ensemble" de la
// sidebar (chantier Legal Yelen, 23/09/2026). Contenu volontairement
// minimal : aucun texte juridique ici, seulement un point d'entrée vers
// les documents réels. Hero repris exactement du Help Center (retour
// Bryan 23/09/2026, voir app/guide-prestataire/page.tsx::.hc-hero) :
// carte teintée dorée centrée, eyebrow/titre/sous-titre + recherche
// intégrée (LegalSearchForm, opère sur les 5 documents réels).
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { LEGAL_NAV_GROUPS } from "@/lib/legalNav";
import { LegalSearchForm } from "../_components/LegalSearchForm";
import Link from "next/link";

export default function LegalOverviewPage() {
  const { theme } = useTheme();
  const C = T[theme];

  const groupesDocuments = LEGAL_NAV_GROUPS.filter(g => g.titre !== "Centre légal");

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "24px 24px 80px" }}>
      {/* HERO — même carte que .hc-hero (Help Center) */}
      <section style={{
        backgroundColor: "rgba(245,166,35,0.08)",
        border: "1px solid rgba(245,166,35,0.18)",
        borderRadius: "22px",
        padding: "36px 24px 30px",
        textAlign: "center",
        marginBottom: "28px",
      }}>
        <p style={{ fontSize: "11.5px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#F5A623", margin: "0 0 10px" }}>
          Centre légal Yelen
        </p>
        <h1 style={{ fontSize: "clamp(26px, 4.5vw, 34px)", fontWeight: 900, color: C.text, lineHeight: 1.15, margin: "0 0 10px" }}>
          Confidentialité et conditions
        </h1>
        <p style={{ fontSize: "14px", color: C.textSubtle, lineHeight: 1.5, margin: "0 0 22px" }}>
          Retrouvez l&apos;ensemble des règles, engagements et documents qui encadrent l&apos;utilisation de Yelen et la protection de vos données.
        </p>

        <LegalSearchForm />
      </section>

      {groupesDocuments.map(group => (
        <div key={group.titre} style={{ marginBottom: "24px" }}>
          <div style={{ color: C.textFaint, fontSize: "10px", fontWeight: "700", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "10px" }}>{group.titre}</div>
          <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", overflow: "hidden" }}>
            {group.items.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: i < group.items.length - 1 ? `1px solid ${C.borderSubtle}` : "none", textDecoration: "none" }}
              >
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.textSubtle, flexShrink: 0 }}/>
                <span style={{ flex: 1, color: C.text, fontSize: "14px", fontWeight: 600 }}>{item.label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
