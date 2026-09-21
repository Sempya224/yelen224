"use client";

// Yelen Business → Documents Yelen (18/09/2026) — 9e écran de la section.
// Coffre documentaire officiel agrégeant les pièces des autres modules
// Yelen Business (voir lib/yelenDocuments.ts) — pas un espace de stockage
// indépendant, chaque document reste rattaché à son module source.
//
// Audit préalable : aucun des modules sources (Contrat, Facturation,
// Transactions, Réconciliation, Frais & commissions) n'émet aujourd'hui
// de document réel — confirmé à chaque écran Yelen Business précédent.
// L'écran est donc construit dans son état réel actuel : l'état vide,
// avec le texte donné explicitement par Bryan (§12), jamais un "Aucun
// fichier"/"Upload your first file" qui ferait passer ceci pour un espace
// de stockage personnel.
//
// Volontairement pas construits (code inatteignable sans document réel,
// même raison qu'aux écrans précédents) : drawer de détail, viewer PDF,
// sélection multiple/téléchargement groupé, notification "Nouveau
// document".
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import type { InstCompte } from "@/lib/compteYelenDisplay";
import { can, type MembreRole } from "@/lib/institutionPermissions";

const CATEGORIES_NAV = ["Tous", "Contrats", "Factures", "Paiements", "Réconciliation", "Frais & commissions", "Relevés", "Documents fiscaux", "Autres"] as const;

function IllustrationCoffre({ C }: { C: ThemeTokens }) {
  return (
    <svg width="80" height="80" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="24" y="30" width="48" height="38" rx="4" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <circle cx="48" cy="49" r="6" stroke={C.t3} strokeWidth="2"/>
      <path d="M48 49v6" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="70" cy="66" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M65 66h10M70 61v10" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export function YelenDocumentsTab({ inst, onToast, membreRole }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
  membreRole: MembreRole | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [categorie, setCategorie] = useState<typeof CATEGORIES_NAV[number]>("Tous");
  const [recherche, setRecherche] = useState("");

  if (!inst) return null;

  const peutExporter = membreRole !== null && can(membreRole, "yelen_documents.exporter");

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "18px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Documents Yelen</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "520px" }}>Retrouvez ici vos contrats, factures, relevés et autres documents officiels liés à votre compte Yelen.</p>
        </div>
        {peutExporter && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Rien à exporter pour l'instant — aucun document n'est encore disponible.")}>Exporter</Button>
        )}
      </div>

      {/* ── Synthèse (réellement zéro, servent aussi de filtres) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px", marginBottom: "18px" }}>
        {[
          { key: "Tous" as const, label: "Tous les documents" },
          { key: "Factures" as const, label: "Factures" },
          { key: "Contrats" as const, label: "Contrats" },
          { key: "Autres" as const, label: "Autres documents" },
        ].map(k => (
          <button key={k.key} onClick={() => setCategorie(k.key)} className="tap" style={{ textAlign: "left", cursor: "pointer" }}>
            <Card tokens={toCardTokens(C)} padding="12px 14px" style={{ border: categorie === k.key ? `1px solid ${C.gold}60` : undefined }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>{k.label}</div>
              <div style={{ color: C.t1, fontSize: "17px", fontWeight: 800 }}>0</div>
            </Card>
          </button>
        ))}
      </div>

      {/* ── Navigation catégories (correspond aux modules Yelen Business — pas une nouvelle logique financière) ── */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
        {CATEGORIES_NAV.map(c => (
          <button key={c} onClick={() => setCategorie(c)} className="tap" style={{ backgroundColor: categorie === c ? `${C.purple}20` : C.bgCard, border: `1px solid ${categorie === c ? C.purple + "40" : C.border}`, borderRadius: "10px", padding: "7px 12px", color: categorie === c ? C.purple : C.t2, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>{c}</button>
        ))}
      </div>

      {/* ── Recherche ── */}
      <Card tokens={toCardTokens(C)} padding="0 12px" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un document…" style={{ flex: 1, padding: "11px 0", fontSize: "13px", background: "none", border: "none", color: C.t1 }}/>
      </Card>

      {/* ── Tableau principal (état vide, copie donnée explicitement par Bryan §12) ── */}
      <Card tokens={toCardTokens(C)} padding="16px">
        <SectionHeader label="Documents" accent={C.t3}/>
        <div style={{ textAlign: "center", padding: "30px 20px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><IllustrationCoffre C={C}/></div>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "6px" }}>Vos documents Yelen apparaîtront ici</div>
          <div style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "340px", margin: "0 auto" }}>Les contrats, factures, reçus et autres documents officiels liés à votre compte Yelen seront automatiquement disponibles dans cet espace.</div>
        </div>
      </Card>
    </div>
  );
}
