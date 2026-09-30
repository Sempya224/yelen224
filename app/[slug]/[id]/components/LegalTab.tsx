"use client";

// Écran dédié "Légal & confidentialité" — extrait du bloc "Support & Légal"
// de page.tsx (chantier éclatement de Paramètres, 14/09/2026), enrichi
// (chantier Légal & Confidentialité, Lot 3 Surface 2, 23/09/2026) : 3
// documents ajoutés (Cookies, Mentions légales, CGP), statut de
// l'acceptation CGP (lecture seule de conditions_prestataire_acceptees_le,
// déjà chargée par le parent — zéro fetch, zéro nouvelle API) et un
// raccourci vers Paramètres (où vit déjà la suppression de compte, jamais
// dupliquée ici).
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { LEGAL_VERSION } from "@/lib/legalVersions";
import { LEGAL_NAV_GROUPS } from "@/lib/legalNav";

// Correction 23/09/2026 : dérivé de lib/legalNav.ts ("Documents généraux" +
// "Documents professionnels") au lieu d'une liste propre. Offres & programmes
// volontairement exclu ici tant que le critère "institution concernée par
// les offres" n'est pas défini (point ouvert, pas traité dans ce lot).
const DOCUMENTS = LEGAL_NAV_GROUPS
  .filter(g => g.titre === "Documents généraux" || g.titre === "Documents professionnels")
  .flatMap(g => g.items);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function SectionLabel({ C, children }: { C: ThemeTokens; children: React.ReactNode }) {
  return <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{children}</div>;
}

export function LegalTab({ conditionsAccepteesLe, onGererCompte }: {
  conditionsAccepteesLe: string | null;
  onGererCompte: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "16px" }}>Légal &amp; confidentialité</h1>

        <div style={{ marginBottom: "20px" }}>
          <SectionLabel C={C}>Documents légaux</SectionLabel>
          <Card tokens={toCardTokens(C)} noPadding>
            {DOCUMENTS.map((item, i) => (
              <Link key={item.href} href={item.href} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", borderBottom: i < DOCUMENTS.length - 1 ? `1px solid ${C.border}` : "none", textDecoration: "none", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.t2, flexShrink: 0 }}/>
                <span style={{ flex: 1, color: C.t1, fontSize: "13px", fontWeight: "600" }}>{item.label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            ))}
          </Card>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <SectionLabel C={C}>Votre engagement</SectionLabel>
          <Card tokens={toCardTokens(C)} noPadding>
            <div style={{ padding: "13px 16px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "600", marginBottom: "2px" }}>Conditions Générales Prestataires</div>
              <div style={{ color: C.t2, fontSize: "12px" }}>
                {conditionsAccepteesLe
                  ? `Version ${LEGAL_VERSION} — Acceptées le ${formatDate(conditionsAccepteesLe)}`
                  : "Acceptation non enregistrée"}
              </div>
            </div>
          </Card>
        </div>

        <div>
          <SectionLabel C={C}>Compte</SectionLabel>
          <Card tokens={toCardTokens(C)} noPadding>
            <button type="button" onClick={onGererCompte} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span style={{ flex: 1, color: C.t1, fontSize: "13px", fontWeight: "600" }}>Gérer mon compte</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
