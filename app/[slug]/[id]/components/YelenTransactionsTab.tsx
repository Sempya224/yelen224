"use client";

// Yelen Business → Transactions (18/09/2026) — 5e écran de la section,
// même discipline que les 4 précédents. Audit préalable (voir
// lib/yelenTransactions.ts) : aucune passerelle de paiement n'est
// intégrée pour la facturation Yelen — zéro transaction Yelen-side ne
// peut exister aujourd'hui, pour aucun établissement. L'écran est donc
// construit dans son état réel actuel : l'état vide (§14 du brief), pas
// une liste avec des lignes d'exemple fabriquées.
//
// Volontairement PAS construits dans cette passe (pas de donnée
// atteignable pour les vérifier, éviterait du code mort) : le drawer de
// détail transaction, les vues échec/attente/remboursement, les filtres
// avancés (Type/Moyen/Forfait/Devise). Les types de la forme cible sont
// prêts dans lib/yelenTransactions.ts — l'écran n'aura pas à changer de
// structure quand l'intégration réelle arrivera.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import type { InstCompte } from "@/lib/compteYelenDisplay";
import { can, type MembreRole } from "@/lib/institutionPermissions";
import type { Transaction, TransactionStatus } from "@/lib/yelenTransactions";

// EmptyState reste un composant local à chaque écran dans ce dossier
// (pas d'export partagé — même constat déjà fait pour CentreAnalyseTab.tsx/
// EquipeTab.tsx/ClockInShiftTab.tsx), avec le même style d'illustration
// sobre (halo doré léger, trait neutre) que le reste de Centre d'Analyse.
function IllustrationRegistre({ C }: { C: ThemeTokens }) {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="28" y="26" width="40" height="44" rx="4" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <line x1="36" y1="38" x2="60" y2="38" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <line x1="36" y1="48" x2="60" y2="48" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="68" cy="66" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M68 61v10M63 66h10" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

function EmptyState({ C, titre, texte, cta }: { C: ThemeTokens; titre: string; texte: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ textAlign: "center", padding: "28px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><IllustrationRegistre C={C}/></div>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "6px" }}>{titre}</div>
      <div style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "300px", margin: "0 auto" }}>{texte}</div>
      {cta && <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ marginTop: "16px" }} onClick={cta.onClick}>{cta.label}</Button>}
    </div>
  );
}

const PERIODES = ["Aujourd'hui", "7 derniers jours", "30 derniers jours", "3 derniers mois", "12 derniers mois", "Personnalisée"] as const;
const FILTRES_STATUT: { key: TransactionStatus | "tous"; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "reussie", label: "Réussies" },
  { key: "en_attente", label: "En attente" },
  { key: "echouee", label: "Échouées" },
  { key: "remboursee", label: "Remboursées" },
];

function formatGNF(montant: number): string {
  return `${montant.toLocaleString("fr-FR")} GNF`;
}

export function YelenTransactionsTab({ inst, onToast, membreRole, onVoirForfait }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
  membreRole: MembreRole | null;
  onVoirForfait?: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [periode, setPeriode] = useState<typeof PERIODES[number]>("30 derniers jours");
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<TransactionStatus | "tous">("tous");

  if (!inst) return null;

  // Aucune transaction Yelen-side ne peut exister aujourd'hui (voir
  // lib/yelenTransactions.ts) — tableau réellement vide, pas un stub.
  const transactions: Transaction[] = [];
  const totalPaye = 0, enAttente = 0, rembourse = 0;

  const peutExporter = membreRole !== null && can(membreRole, "yelen_transactions.exporter");
  const idCourt = inst.id.slice(0, 8).toUpperCase();

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "6px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Transactions</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "480px" }}>Consultez et suivez l&apos;ensemble des mouvements financiers liés à votre compte Yelen.</p>
        </div>
        {peutExporter && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Aucune transaction à exporter pour l'instant.")}>Exporter</Button>
        )}
      </div>
      <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "18px" }}>{inst.name} · <span style={{ fontFamily: "monospace" }}>YEL-{idCourt}</span></div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
        <select value={periode} onChange={e => setPeriode(e.target.value as typeof PERIODES[number])} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "7px 10px", color: C.t1, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
          {PERIODES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* ── KPI (réellement zéro, pas "Bientôt disponible" — le concept est défini, la valeur est juste zéro) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px", marginBottom: "18px" }}>
        {[
          { label: "Total payé", valeur: formatGNF(totalPaye), couleur: C.green },
          { label: "En attente", valeur: formatGNF(enAttente), couleur: C.orange },
          { label: "Remboursé", valeur: formatGNF(rembourse), couleur: C.blue },
          { label: "Transactions", valeur: String(transactions.length), couleur: C.t1 },
        ].map(k => (
          <Card key={k.label} tokens={toCardTokens(C)} padding="12px 14px">
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>{k.label}</div>
            <div style={{ color: k.couleur, fontSize: "17px", fontWeight: 800 }}>{k.valeur}</div>
          </Card>
        ))}
      </div>

      {/* ── Recherche + filtres (mêmes affordances que Mes clients même liste vide, pas une fausse promesse — juste rien à filtrer pour l'instant) ── */}
      <Card tokens={toCardTokens(C)} padding="0 12px" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher une transaction, une facture ou un identifiant…" style={{ flex: 1, padding: "11px 0", fontSize: "13px", background: "none", border: "none", color: C.t1 }}/>
      </Card>
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
        {FILTRES_STATUT.map(f => (
          <button key={f.key} onClick={() => setFiltreStatut(f.key)} className="tap" style={{ backgroundColor: filtreStatut === f.key ? `${C.purple}20` : C.bgCard, border: `1px solid ${filtreStatut === f.key ? C.purple + "40" : C.border}`, borderRadius: "10px", padding: "7px 12px", color: filtreStatut === f.key ? C.purple : C.t2, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>{f.label}</button>
        ))}
      </div>

      {/* ── Tableau (état vide réel, §14) ── */}
      <Card tokens={toCardTokens(C)} padding="16px">
        <SectionHeader label="Transactions" accent={C.t3}/>
        <EmptyState C={C}
          titre="Aucune transaction"
          texte="Les transactions liées à votre compte Yelen apparaîtront ici dès votre premier règlement."
          cta={onVoirForfait ? { label: "Voir votre forfait", onClick: onVoirForfait } : undefined}/>
      </Card>
    </div>
  );
}
