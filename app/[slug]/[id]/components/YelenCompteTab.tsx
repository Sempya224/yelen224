"use client";

// Yelen Business → Compte (17-18/09/2026) — écran "Compte Yelen" : source
// de vérité de la relation COMMERCIALE institution <-> Yelen (distinct du
// profil utilisateur connecté, voir ProfilTab.tsx, et distinct de
// "profil-entreprise"/"Établissement" qui décrit la fiche publique
// citoyenne). Section "Yelen Business" créée le 17/09/2026 (voir
// layout.tsx::YELEN_BUSINESS_SECTIONS/lib/institutionPermissions.ts),
// tous les écrans encore "à l'état vide" — celui-ci est le premier à être
// réellement construit, les autres (yelen-contrat, yelen-forfait,
// yelen-paiements, yelen-transactions, yelen-reconciliation,
// yelen-frais-commissions, yelen-facturation, yelen-documents,
// yelen-support) arrivent dans des chantiers séparés.
//
// Discipline zéro-donnée-inventée : aucune table "compte commercial",
// "contrat", "abonnement facturation Yelen" ou "responsable commercial"
// n'existe en base — seuls institutions.{name,secteur,statut,plan,
// created_at,logo,badge_verifie} sont réels et utilisés ici. Tout le
// reste (raison sociale, ID organisation, type de compte, contrat,
// facturation, documents commerciaux, historique détaillé, responsable
// commercial) est affiché en "Bientôt disponible" plutôt que fabriqué —
// retour explicite de Bryan (18/09/2026) sur ce chantier précis.
import { useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import { SECTEUR_LABELS } from "@/lib/institutionTaxonomy";
import { STATUT_META, PLAN_LABELS, formatDateLongue, type InstCompte } from "@/lib/compteYelenDisplay";
import { Champ, ChampBientot, SectionBientot, StatusDot } from "./YelenBusinessShared";

export function YelenCompteTab({ inst, onToast, onVoirJournal, onContacterSupport }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
  onVoirJournal?: () => void;
  onContacterSupport?: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [copie, setCopie] = useState(false);

  if (!inst) return null;

  const statutMeta = inst.statut ? STATUT_META[inst.statut] : undefined;
  const secteurLabel = inst.secteur ? SECTEUR_LABELS[inst.secteur] ?? inst.category : inst.category;
  const planLabel = inst.plan ? PLAN_LABELS[inst.plan] ?? inst.plan : null;
  const clientDepuis = formatDateLongue(inst.created_at);

  async function copierId() {
    try { await navigator.clipboard.writeText(inst!.id); setCopie(true); setTimeout(() => setCopie(false), 1600); } catch {}
  }

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Compte Yelen</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "480px" }}>Gérez les informations commerciales et contractuelles de votre établissement auprès de Yelen.</p>
        </div>
        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Bientôt disponible — la modification des informations du compte arrive dans un prochain chantier.")}>Modifier les informations</Button>
      </div>

      {/* ── HERO — identité du compte ── */}
      <Card tokens={toCardTokens(C)} padding="18px" style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "14px", overflow: "hidden", flexShrink: 0, backgroundColor: C.bg3, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {inst.logo ? <Image src={inst.logo} alt="" width={56} height={56} style={{ objectFit: "cover", width: "100%", height: "100%" }}/> : <span style={{ color: C.t3, fontSize: "20px", fontWeight: 800 }}>{inst.name.slice(0, 1)}</span>}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: C.t1, fontSize: "17px", fontWeight: 800 }}>{inst.name}</span>
                {statutMeta && <StatusDot couleur={statutMeta.couleur} size={9}/>}
              </div>
              <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{secteurLabel}</div>
              <button onClick={copierId} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "8px", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <span style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>ID établissement</span>
                <span style={{ color: C.t2, fontSize: "11px", fontFamily: "monospace" }}>{inst.id}</span>
                <span style={{ color: C.gold, fontSize: "10px", fontWeight: 700 }}>{copie ? "Copié" : "Copier"}</span>
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: "14px", flex: 1, minWidth: "260px" }}>
            <Champ label="Statut du compte" C={C} valeur={<span style={{ color: statutMeta?.couleur ?? C.t1 }}>{statutMeta?.label ?? "—"}</span>}/>
            {clientDepuis ? <Champ label="Client depuis" C={C} valeur={clientDepuis}/> : <ChampBientot label="Client depuis" C={C}/>}
            {planLabel ? <Champ label="Forfait actuel" C={C} valeur={planLabel}/> : <ChampBientot label="Forfait actuel" C={C}/>}
            <ChampBientot label="Renouvellement" C={C}/>
          </div>
        </div>
      </Card>

      {/* ── Informations du compte ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Informations du compte" accent={C.blue}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>Les informations utilisées par Yelen pour identifier votre organisation.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "16px" }}>
          <Champ label="Nom commercial" C={C} valeur={inst.name}/>
          <ChampBientot label="Raison sociale" C={C}/>
          <ChampBientot label="Type de compte" C={C}/>
          <Champ label="Secteur d'activité" C={C} valeur={secteurLabel}/>
          <Champ label="ID établissement" C={C} mono valeur={inst.id}/>
          <ChampBientot label="ID organisation" C={C}/>
          {clientDepuis ? <Champ label="Date d'activation" C={C} valeur={clientDepuis}/> : <ChampBientot label="Date d'activation" C={C}/>}
          <Champ label="Statut" C={C} valeur={<span style={{ color: statutMeta?.couleur ?? C.t1 }}>{statutMeta?.label ?? "—"}</span>}/>
          <ChampBientot label="Pays" C={C}/>
        </div>
      </Card>

      {/* ── Relation commerciale ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Relation commerciale" accent={C.purple}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>Votre interlocuteur chez Yelen et les canaux de support disponibles.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "16px", marginBottom: "16px" }}>
          <ChampBientot label="Type de relation" C={C}/>
          <ChampBientot label="Niveau de relation" C={C}/>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
          <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>Responsable commercial Yelen</div>
          <div style={{ color: C.t3, fontSize: "12.5px", marginBottom: "14px" }}>Pas encore d&apos;interlocuteur commercial dédié assigné — <span style={{ fontWeight: 700 }}>Bientôt disponible</span>.</div>
          <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>Support Yelen</div>
          <div style={{ color: C.t2, fontSize: "12.5px", marginBottom: "10px" }}>Équipe Yelen Business — disponible pour toute question sur votre compte.</div>
          {onContacterSupport && <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onContacterSupport}>Contacter Yelen</Button>}
        </div>
      </Card>

      {/* ── Votre forfait ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Votre forfait" accent={C.gold}/>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "16px" }}>
          <span style={{ color: C.t1, fontSize: "24px", fontWeight: 800 }}>{planLabel ?? "—"}</span>
          <span style={{ color: C.t3, fontSize: "11px", fontWeight: 700 }}>Forfait actuel</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "14px", marginBottom: "16px" }}>
          <ChampBientot label="Cycle de facturation" C={C}/>
          <ChampBientot label="Date de début" C={C}/>
          <ChampBientot label="Prochaine échéance" C={C}/>
          <Champ label="État" C={C} valeur={statutMeta ? <span style={{ display: "flex", alignItems: "center", gap: "6px", color: statutMeta.couleur }}><StatusDot couleur={statutMeta.couleur}/>{statutMeta.label}</span> : "—"}/>
        </div>
        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => onToast("Bientôt disponible — le détail du forfait arrive dans un prochain chantier.")}>Voir les détails du forfait →</Button>
      </Card>

      <SectionBientot titre="Contrat Yelen" C={C}
        sousTitre="Le cadre contractuel de votre relation avec Yelen."
        texte="Le contrat Yelen (référence, statut, dates, renouvellement) n'est pas encore numérisé pour votre compte. Cette section affichera le contrat en vigueur, avec consultation et téléchargement du document, dans un prochain chantier."/>

      <SectionBientot titre="Facturation" C={C}
        sousTitre="Entité facturée, adresse et contact de facturation."
        texte="Les informations de facturation de votre compte (entité facturée, adresse, devise, contact dédié) arrivent dans un prochain chantier — distinctes du responsable commercial et de votre propre compte utilisateur."/>

      <SectionBientot titre="Documents" C={C}
        sousTitre="Contrats, bons de commande et factures Yelen."
        texte="La liste de vos documents commerciaux Yelen (contrat, bons de commande, factures) n'est pas encore disponible ici."/>

      {/* ── Historique du compte ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Historique du compte" accent={C.teal}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>L&apos;évolution de votre relation avec Yelen.</p>
        {clientDepuis ? (
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: C.gold, marginTop: "3px" }}/>
              <div style={{ width: "2px", flex: 1, backgroundColor: C.border, marginTop: "4px" }}/>
            </div>
            <div style={{ paddingBottom: "8px" }}>
              <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>Compte Yelen activé</div>
              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{clientDepuis}</div>
            </div>
          </div>
        ) : null}
        <p style={{ color: C.t3, fontSize: "11.5px", marginTop: clientDepuis ? "4px" : 0, fontStyle: "italic" }}>D&apos;autres événements (forfait, contrat, informations) apparaîtront ici au fil de votre relation avec Yelen.</p>
      </Card>

      {/* ── Gestion du compte ── */}
      <Card tokens={toCardTokens(C)} padding="16px">
        <SectionHeader label="Gestion du compte" accent={C.t3}/>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "16px", marginBottom: onVoirJournal ? "14px" : 0 }}>
          <ChampBientot label="Administrateurs autorisés" C={C}/>
          <ChampBientot label="Dernière modification" C={C}/>
        </div>
        {onVoirJournal && (
          <button onClick={onVoirJournal} className="tap" style={{ background: "none", border: "none", color: C.blue, fontSize: "12px", fontWeight: 800, padding: 0, cursor: "pointer" }}>Voir le journal d&apos;activité →</button>
        )}
      </Card>
    </div>
  );
}
