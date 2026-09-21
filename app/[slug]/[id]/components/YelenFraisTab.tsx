"use client";

// Yelen Business → Frais & commissions (18/09/2026) — 7e écran de la
// section. Distinct de Transactions (mouvements) et Réconciliation
// (correspondance) : ici, combien chaque mouvement coûte et quel montant
// net reste après déduction (lib/yelenFrais.ts).
//
// Audit préalable : ni transaction Yelen-side ni modèle de frais défini
// n'existent aujourd'hui — pas seulement une absence de données, une
// absence de MODÈLE (Yelen facture-t-elle "frais de traitement" +
// "commission" + "conversion" séparément, ou autrement ?). Le brief
// prévient explicitement (§4) : ne jamais afficher une formule qui ne
// correspond pas réellement au modèle commercial Yelen — la section
// pédagogique "Comprendre vos frais" reste donc en "Bientôt disponible"
// plutôt que de présenter la décomposition du brief comme un fait acquis.
// Section "Devises et conversion" non affichée du tout (§11 : "ne montrer
// que si pertinente pour le compte" — tous les comptes Yelen sont
// aujourd'hui en GNF uniquement).
//
// Volontairement pas construits (code inatteignable sans donnée réelle,
// même raison qu'aux 2 écrans précédents) : drawer de détail, règle de
// remboursement des frais, anomalies.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import type { InstCompte } from "@/lib/compteYelenDisplay";
import { can, type MembreRole } from "@/lib/institutionPermissions";
import { fournisseursPourPays } from "@/lib/paymentProviders";

const PERIODES = ["Aujourd'hui", "7 derniers jours", "30 derniers jours", "3 derniers mois", "12 derniers mois", "Personnalisée"] as const;
const PAYS_YELEN_ACTUEL = "Guinée";

function IllustrationFrais({ C }: { C: ThemeTokens }) {
  return (
    <svg width="76" height="76" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="48" cy="48" r="20" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <path d="M48 40v16M43 44a5 5 0 0 1 5-3c3 0 5 1.5 5 3.5s-2 3-5 3.5c-3 .5-5 1.5-5 3.5s2 3.5 5 3.5a5 5 0 0 0 5-3" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="70" cy="66" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M65 66h10M70 61v10" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

function EmptyState({ C, titre, texte }: { C: ThemeTokens; titre: string; texte: string }) {
  return (
    <div style={{ textAlign: "center", padding: "26px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><IllustrationFrais C={C}/></div>
      <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "6px" }}>{titre}</div>
      <div style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6, maxWidth: "300px", margin: "0 auto" }}>{texte}</div>
    </div>
  );
}

function ChampBientotSimple({ label, C }: { label: string; C: ThemeTokens }) {
  return (
    <div>
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
      <div style={{ color: C.t3, fontSize: "13px", fontWeight: 600 }}>— <span style={{ fontSize: "10px", fontWeight: 700, backgroundColor: C.bg3, padding: "2px 7px", borderRadius: "8px", marginLeft: "4px" }}>Bientôt disponible</span></div>
    </div>
  );
}

export function YelenFraisTab({ inst, onToast, membreRole }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
  membreRole: MembreRole | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [periode, setPeriode] = useState<typeof PERIODES[number]>("30 derniers jours");

  if (!inst) return null;

  const peutExporter = membreRole !== null && can(membreRole, "yelen_frais.exporter");
  const peutVoirConditions = membreRole !== null && can(membreRole, "yelen_frais.voir_conditions_tarifaires");
  const fournisseurs = fournisseursPourPays(PAYS_YELEN_ACTUEL);

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "6px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Frais &amp; commissions</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "500px" }}>Consultez les frais appliqués à vos transactions et comprenez leur impact sur les montants nets reçus ou réglés.</p>
        </div>
        {peutExporter && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Rien à exporter pour l'instant — aucun frais n'est encore enregistré.")}>Exporter</Button>
        )}
      </div>
      <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "18px" }}>Compte : <span style={{ fontWeight: 700, color: C.t2 }}>{inst.name}</span> · <span style={{ fontFamily: "monospace" }}>YEL-{inst.id.slice(0, 8).toUpperCase()}</span></div>

      <div style={{ marginBottom: "14px" }}>
        <select value={periode} onChange={e => setPeriode(e.target.value as typeof PERIODES[number])} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "7px 10px", color: C.t1, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
          {PERIODES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* ── Synthèse (réellement zéro) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px", marginBottom: "18px" }}>
        {[
          { label: "Volume traité", valeur: "0 GNF", couleur: C.t1 },
          { label: "Frais", valeur: "0 GNF", couleur: C.orange },
          { label: "Net", valeur: "0 GNF", couleur: C.green },
          { label: "Taux moyen", valeur: "—", couleur: C.t3 },
        ].map(k => (
          <Card key={k.label} tokens={toCardTokens(C)} padding="12px 14px">
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>{k.label}</div>
            <div style={{ color: k.couleur, fontSize: "17px", fontWeight: 800 }}>{k.valeur}</div>
          </Card>
        ))}
      </div>

      {/* ── Comprendre vos frais (modèle non défini, jamais présenté comme un fait) ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <SectionHeader label="Comprendre vos frais" accent={C.t3}/>
          <span style={{ fontSize: "9px", fontWeight: 800, backgroundColor: C.bg3, color: C.t3, padding: "2px 8px", borderRadius: "10px", textTransform: "uppercase", letterSpacing: "0.3px" }}>Bientôt disponible</span>
        </div>
        <p style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6 }}>Le détail du calcul de vos frais (traitement, commission Yelen, conversion) s&apos;affichera ici une fois votre modèle tarifaire défini avec votre interlocuteur commercial.</p>
      </Card>

      {/* ── Frais par moyen de paiement (registre réel, réellement à zéro) ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Frais par moyen de paiement" accent={C.blue}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "14px", lineHeight: 1.5 }}>Chaque moyen de paiement est suivi individuellement — jamais regroupé sous une catégorie générique.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", minWidth: "480px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Moyen", "Volume", "Frais", "Taux effectif", "Net"].map(h => (
                  <th key={h} style={{ textAlign: h === "Moyen" ? "left" : "right", color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", padding: "8px 6px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fournisseurs.map(p => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 700 }}>{p.label}</td>
                  <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right" }}>0 GNF</td>
                  <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right" }}>0 GNF</td>
                  <td style={{ padding: "8px 6px", color: C.t3, textAlign: "right" }}>—</td>
                  <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right" }}>0 GNF</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Détail des frais ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Détail des frais" accent={C.purple}/>
        <EmptyState C={C} titre="Aucun frais enregistré" texte="Le détail de chaque frais (date, transaction, type, base, taux, net) apparaîtra ici dès votre premier règlement."/>
      </Card>

      {/* ── Conditions tarifaires ── */}
      {peutVoirConditions && (
        <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
          <SectionHeader label="Conditions tarifaires" accent={C.gold}/>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "14px", marginBottom: "14px" }}>
            <ChampBientotSimple label="Frais de traitement" C={C}/>
            <ChampBientotSimple label="Commission Yelen" C={C}/>
            <ChampBientotSimple label="Dernière mise à jour" C={C}/>
          </div>
          <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>Les conditions tarifaires détaillées ne sont pas disponibles dans votre espace. Contactez votre interlocuteur commercial Yelen.</p>
        </Card>
      )}

      {/* ── Anomalies ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Frais nécessitant votre attention" accent={C.orange}/>
        <p style={{ color: C.t3, fontSize: "12px" }}>Aucune anomalie détectée pour l&apos;instant.</p>
      </Card>

      {/* ── Historique ── */}
      <Card tokens={toCardTokens(C)} padding="16px">
        <SectionHeader label="Historique des frais" accent={C.t3}/>
        <p style={{ color: C.t3, fontSize: "12px" }}>Aucun événement enregistré pour l&apos;instant.</p>
      </Card>
    </div>
  );
}
