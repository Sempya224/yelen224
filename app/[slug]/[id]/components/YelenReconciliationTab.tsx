"use client";

// Yelen Business → Réconciliation (18/09/2026) — 6e écran de la section.
// Distinct de Transactions (voir lib/yelenReconciliation.ts) : ici on
// rapproche les transactions Yelen des confirmations prestataire — ce qui
// suppose DEUX sources de données réelles, alors qu'aucune des deux
// n'existe aujourd'hui (zéro passerelle de paiement intégrée, confirmé
// aux 2 écrans précédents). L'écran est donc construit dans son état réel
// actuel : rien à rapprocher, pas une démonstration avec des
// correspondances fabriquées. Le message d'état global du brief ("🟢
// Réconciliation à jour") impliquerait qu'un vrai rapprochement a eu
// lieu — remplacé par un ton neutre "rien à rapprocher pour l'instant",
// plus honnête tant qu'aucune donnée n'existe.
//
// Volontairement PAS construits dans cette passe (même raison qu'à
// Transactions — code inatteignable sans donnée réelle) : la carte de
// correspondance automatique avec pourcentage de confiance, le drawer de
// détail d'écart, la clôture de période. Les types de la forme cible sont
// prêts dans lib/yelenReconciliation.ts.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import type { InstCompte } from "@/lib/compteYelenDisplay";
import { can, type MembreRole } from "@/lib/institutionPermissions";
import type { EtatRapprochement } from "@/lib/yelenReconciliation";
import { fournisseursPourPays } from "@/lib/paymentProviders";

const PERIODES = ["Aujourd'hui", "7 derniers jours", "30 derniers jours", "3 derniers mois", "12 derniers mois", "Personnalisée"] as const;
const FILTRES_ETAT: { key: EtatRapprochement | "toutes"; label: string }[] = [
  { key: "toutes", label: "Toutes" },
  { key: "correspondance", label: "Suggestions" },
  { key: "ecart", label: "Écarts" },
  { key: "introuvable", label: "Introuvables" },
  { key: "en_attente", label: "En attente" },
  { key: "exclue", label: "Exclues" },
];
const PAYS_YELEN_ACTUEL = "Guinée";

function IllustrationRapprochement({ C }: { C: ThemeTokens }) {
  return (
    <svg width="76" height="76" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="18" y="30" width="26" height="34" rx="3" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <rect x="52" y="30" width="26" height="34" rx="3" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <path d="M44 47h8" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="68" cy="68" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M63.5 68l3 3 6-6" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function EmptyState({ C, titre, texte, cta }: { C: ThemeTokens; titre: string; texte: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ textAlign: "center", padding: "26px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><IllustrationRapprochement C={C}/></div>
      <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "6px" }}>{titre}</div>
      <div style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6, maxWidth: "300px", margin: "0 auto" }}>{texte}</div>
      {cta && <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ marginTop: "14px" }} onClick={cta.onClick}>{cta.label}</Button>}
    </div>
  );
}

export function YelenReconciliationTab({ inst, onToast, membreRole }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
  membreRole: MembreRole | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [periode, setPeriode] = useState<typeof PERIODES[number]>("30 derniers jours");
  const [filtreEtat, setFiltreEtat] = useState<EtatRapprochement | "toutes">("toutes");

  if (!inst) return null;

  // Rien à rapprocher aujourd'hui — aucune passerelle de paiement
  // intégrée, donc ni transaction Yelen ni confirmation prestataire.
  const aRapprocher = 0, rapprochees = 0, ecartMontant = 0;
  const peutExporter = membreRole !== null && can(membreRole, "yelen_reconciliation.exporter_rapport");
  const peutVoirEcarts = membreRole !== null && can(membreRole, "yelen_reconciliation.voir_ecarts");
  const fournisseurs = fournisseursPourPays(PAYS_YELEN_ACTUEL);

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "6px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Réconciliation</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "500px" }}>Vérifiez que les transactions enregistrées dans Yelen correspondent aux mouvements confirmés par vos moyens de paiement.</p>
        </div>
        {peutExporter && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Rien à exporter pour l'instant — aucune transaction n'est encore rapprochée.")}>Exporter le rapport</Button>
        )}
      </div>
      <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "18px" }}>Compte : <span style={{ fontWeight: 700, color: C.t2 }}>{inst.name}</span></div>

      <div style={{ marginBottom: "14px" }}>
        <select value={periode} onChange={e => setPeriode(e.target.value as typeof PERIODES[number])} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "7px 10px", color: C.t1, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
          {PERIODES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* ── Synthèse (réellement zéro) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px", marginBottom: "14px" }}>
        {[
          { label: "À rapprocher", valeur: String(aRapprocher), couleur: C.orange },
          { label: "Rapprochées", valeur: String(rapprochees), couleur: C.green },
          { label: "Écart", valeur: `${ecartMontant.toLocaleString("fr-FR")} GNF`, couleur: C.t1 },
          { label: "Taux de rapprochement", valeur: "—", couleur: C.t3 },
        ].map(k => (
          <Card key={k.label} tokens={toCardTokens(C)} padding="12px 14px">
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>{k.label}</div>
            <div style={{ color: k.couleur, fontSize: "17px", fontWeight: 800 }}>{k.valeur}</div>
          </Card>
        ))}
      </div>

      {/* ── État global (ton neutre — rien n'a encore été rapproché, ni positif ni négatif) ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "4px" }}>Rien à rapprocher pour l&apos;instant</div>
        <p style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6 }}>Aucune transaction Yelen ni confirmation de prestataire n&apos;est encore enregistrée pour votre compte. Cette section s&apos;activera dès votre premier règlement.</p>
      </Card>

      {/* ── Transactions à rapprocher ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Transactions à rapprocher" accent={C.blue}/>
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          {FILTRES_ETAT.map(f => (
            <button key={f.key} onClick={() => setFiltreEtat(f.key)} className="tap" style={{ backgroundColor: filtreEtat === f.key ? `${C.purple}20` : C.bgCard, border: `1px solid ${filtreEtat === f.key ? C.purple + "40" : C.border}`, borderRadius: "10px", padding: "7px 12px", color: filtreEtat === f.key ? C.purple : C.t2, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>{f.label}</button>
          ))}
        </div>
        <EmptyState C={C} titre="Aucune transaction à rapprocher" texte="Yelen comparera automatiquement vos transactions aux confirmations reçues des prestataires dès qu'il y en aura."/>
      </Card>

      {/* ── Écarts à résoudre ── */}
      {peutVoirEcarts && (
        <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
          <SectionHeader label="Écarts à résoudre" accent={C.orange}/>
          <EmptyState C={C} titre="Aucun écart détecté" texte="Les écarts entre Yelen et vos prestataires de paiement (montant, date, frais, doublon...) apparaîtront ici s'il y en a."/>
        </Card>
      )}

      {/* ── Rapprochement des moyens locaux (registre réel, compteurs réellement à zéro) ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Rapprochement par moyen de paiement" accent={C.teal}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Chaque moyen de paiement est suivi individuellement — jamais regroupé sous une catégorie générique.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" }}>
          {fournisseurs.map(p => (
            <div key={p.id} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
              <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 800, marginBottom: "6px" }}>{p.label}</div>
              <div style={{ color: C.t3, fontSize: "11px" }}>0 transaction</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Périodes de rapprochement ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Périodes de rapprochement" accent={C.purple}/>
        <EmptyState C={C} titre="Aucune période rapprochée" texte="L'historique de vos périodes de rapprochement (transactions, écarts, clôture) apparaîtra ici dès votre premier cycle de réconciliation."/>
      </Card>

      {/* ── Journal ── */}
      <Card tokens={toCardTokens(C)} padding="16px">
        <SectionHeader label="Historique de réconciliation" accent={C.t3}/>
        <p style={{ color: C.t3, fontSize: "12px" }}>Aucun événement enregistré pour l&apos;instant.</p>
      </Card>
    </div>
  );
}
