"use client";

// Yelen Business → Facturation (18/09/2026) — 8e écran de la section.
// Distinct de Transactions/Frais & commissions/Réconciliation (voir
// lib/yelenFacturation.ts) : répond à "qu'est-ce que Yelen me facture, et
// quand dois-je payer ?", pas "quel mouvement a eu lieu" ni "combien ça
// coûte" ni "est-ce que ça correspond".
//
// Audit préalable : aucun cycle de facturation Yelen n'est configuré
// aujourd'hui (même constat que les 6 écrans Yelen Business précédents)
// — zéro facture ne peut exister pour aucun établissement. Le bandeau
// d'état du brief ("🟢 Compte à jour") est remplacé par un ton neutre
// ("Aucune facture pour l'instant") : un badge vert de succès impliquerait
// qu'une relation de facturation active a été vérifiée, alors qu'il n'y a
// simplement encore rien eu.
//
// Volontairement pas construits (code inatteignable sans facture réelle,
// même raison qu'aux écrans précédents) : drawer de détail facture, vues
// payée/partiellement payée/en retard.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import type { InstCompte } from "@/lib/compteYelenDisplay";
import { PLAN_LABELS } from "@/lib/compteYelenDisplay";
import { can, type MembreRole } from "@/lib/institutionPermissions";
import { Champ, ChampBientot } from "./YelenBusinessShared";

const PERIODES = ["Aujourd'hui", "7 derniers jours", "30 derniers jours", "3 derniers mois", "12 derniers mois", "Personnalisée"] as const;
const FILTRES_STATUT = ["Toutes", "Payées", "À payer", "En retard", "Annulées", "Remboursées"] as const;

function IllustrationFacture({ C }: { C: ThemeTokens }) {
  return (
    <svg width="76" height="76" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="30" y="24" width="36" height="46" rx="4" stroke={C.t3} strokeWidth="2" strokeDasharray="3 5"/>
      <line x1="38" y1="36" x2="58" y2="36" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <line x1="38" y1="45" x2="58" y2="45" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <line x1="38" y1="54" x2="50" y2="54" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="70" cy="66" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M65 66h10M70 61v10" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

function EmptyState({ C, titre, texte }: { C: ThemeTokens; titre: string; texte: string }) {
  return (
    <div style={{ textAlign: "center", padding: "26px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><IllustrationFacture C={C}/></div>
      <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "6px" }}>{titre}</div>
      <div style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6, maxWidth: "300px", margin: "0 auto" }}>{texte}</div>
    </div>
  );
}

export function YelenFacturationTab({ inst, onToast, membreRole, onVoirForfait }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
  membreRole: MembreRole | null;
  onVoirForfait?: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [periode, setPeriode] = useState<typeof PERIODES[number]>("30 derniers jours");
  const [filtreStatut, setFiltreStatut] = useState<typeof FILTRES_STATUT[number]>("Toutes");
  const [recherche, setRecherche] = useState("");

  if (!inst) return null;

  const planLabel = inst.plan ? PLAN_LABELS[inst.plan] ?? inst.plan : null;
  const peutTelecharger = membreRole !== null && can(membreRole, "yelen_facturation.telecharger_factures");
  const peutExporter = membreRole !== null && can(membreRole, "yelen_facturation.exporter_historique");
  const peutVoirInfosFacturation = membreRole !== null && can(membreRole, "yelen_facturation.voir_informations_facturation");
  const peutGererForfait = membreRole !== null && can(membreRole, "yelen_facturation.gerer_forfait");

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "6px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Facturation</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "500px" }}>Gérez vos factures Yelen, vos échéances et votre historique de facturation.</p>
        </div>
        {peutTelecharger && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Bientôt disponible — aucun relevé n'est encore disponible pour votre compte.")}>Télécharger un relevé</Button>
        )}
      </div>
      <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "18px" }}>{inst.name} · Compte Yelen</div>

      {/* ── État de facturation (ton neutre, pas un badge de succès fabriqué) ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "4px" }}>Aucune facture pour l&apos;instant</div>
        <p style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6, marginBottom: "14px" }}>Votre première facture Yelen apparaîtra ici dès l&apos;activation de votre cycle de facturation.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "14px" }}>
          <ChampBientot label="Prochaine échéance" C={C} texte="Non défini"/>
          <ChampBientot label="Montant prévu" C={C} texte="Non défini"/>
          <ChampBientot label="Moyen de paiement" C={C} texte="Non configuré"/>
        </div>
      </Card>

      <div style={{ marginBottom: "14px" }}>
        <select value={periode} onChange={e => setPeriode(e.target.value as typeof PERIODES[number])} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "7px 10px", color: C.t1, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
          {PERIODES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* ── KPI (réellement zéro) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px", marginBottom: "18px" }}>
        {[
          { label: "Facturé ce mois", valeur: "0 GNF", couleur: C.t1 },
          { label: "À payer", valeur: "0 GNF", couleur: C.orange },
          { label: "Prochaine échéance", valeur: "—", couleur: C.t3 },
          { label: "Historique", valeur: "0 facture", couleur: C.t1 },
        ].map(k => (
          <Card key={k.label} tokens={toCardTokens(C)} padding="12px 14px">
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>{k.label}</div>
            <div style={{ color: k.couleur, fontSize: "17px", fontWeight: 800 }}>{k.valeur}</div>
          </Card>
        ))}
      </div>

      {/* ── Facture actuelle ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Facture actuelle" accent={C.blue}/>
        <EmptyState C={C} titre="Aucune facture en cours" texte="Votre facture du cycle en cours apparaîtra ici une fois votre facturation Yelen activée."/>
      </Card>

      {/* ── Prochaine facturation (forfait réel, reste non défini) ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Prochaine facturation" accent={C.gold}/>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "14px", marginBottom: peutGererForfait ? "14px" : 0 }}>
          {planLabel ? <Champ label="Forfait" C={C} valeur={planLabel}/> : <ChampBientot label="Forfait" C={C}/>}
          <ChampBientot label="Cycle" C={C} texte="Non défini"/>
          <ChampBientot label="Prochaine échéance" C={C} texte="Non défini"/>
          <ChampBientot label="Montant prévu" C={C} texte="Non défini"/>
        </div>
        {peutGererForfait && onVoirForfait && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={onVoirForfait}>Gérer mon forfait</Button>
        )}
      </Card>

      {/* ── Historique de facturation ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Historique de facturation" accent={C.purple}/>
        <Card tokens={toCardTokens(C)} padding="0 12px" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher une facture…" style={{ flex: 1, padding: "11px 0", fontSize: "13px", background: "none", border: "none", color: C.t1 }}/>
        </Card>
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
          {FILTRES_STATUT.map(f => (
            <button key={f} onClick={() => setFiltreStatut(f)} className="tap" style={{ backgroundColor: filtreStatut === f ? `${C.purple}20` : C.bgCard, border: `1px solid ${filtreStatut === f ? C.purple + "40" : C.border}`, borderRadius: "10px", padding: "7px 12px", color: filtreStatut === f ? C.purple : C.t2, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>{f}</button>
          ))}
        </div>
        <EmptyState C={C} titre="Aucune facture" texte="L'historique de vos factures Yelen (période, échéance, montant, statut) apparaîtra ici."/>
        {peutExporter && (
          <div style={{ textAlign: "center", marginTop: "10px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => onToast("Rien à exporter pour l'instant — aucune facture n'est encore enregistrée.")}>Exporter l&apos;historique</Button>
          </div>
        )}
      </Card>

      {/* ── Profil de facturation ── */}
      {peutVoirInfosFacturation && (
        <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
          <SectionHeader label="Profil de facturation" accent={C.teal}/>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "14px" }}>
            <ChampBientot label="Nom légal" C={C}/>
            <Champ label="ID établissement" C={C} mono valeur={inst.id}/>
            <ChampBientot label="Adresse de facturation" C={C}/>
            <ChampBientot label="Pays" C={C}/>
            <Champ label="Devise de facturation" C={C} valeur="GNF"/>
            <ChampBientot label="Identifiant fiscal" C={C}/>
          </div>
        </Card>
      )}

      {/* ── Documents ── */}
      <Card tokens={toCardTokens(C)} padding="16px">
        <SectionHeader label="Documents de facturation" accent={C.t3}/>
        <EmptyState C={C} titre="Aucun document" texte="Factures, relevés, avoirs et reçus de paiement apparaîtront ici dès qu'ils existeront."/>
      </Card>
    </div>
  );
}
