"use client";

// Yelen Business → Contrat (18/09/2026) — 2e écran de la section (voir
// YelenCompteTab.tsx pour le 1er, même discipline zéro-donnée-inventée).
// Audit préalable : aucune table "contrat" n'existe en base — ni statut
// contractuel distinct du statut de compte, ni dates d'activation/
// échéance/renouvellement, ni documents, ni historique d'événements
// contractuels (signature, envoi, consultation). Retour explicite de
// Bryan sur ce chantier précis : afficher "Non défini"/"À venir" plutôt
// que d'emprunter institutions.statut ou institutions.created_at comme
// s'ils étaient des faits contractuels vérifiés — un contrat reste une
// donnée commerciale distincte du compte/forfait (même principe déjà posé
// sur l'écran Compte Yelen). Seul le bloc "Votre compte Yelen" réutilise
// des données réelles, à l'identique de YelenCompteTab.tsx.
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import { SECTEUR_LABELS } from "@/lib/institutionTaxonomy";
import { STATUT_META, PLAN_LABELS, formatDateLongue, type InstCompte } from "@/lib/compteYelenDisplay";
import { Champ, ChampBientot, SectionBientot, MenuActions, StatusDot } from "./YelenBusinessShared";

function aujourdHui(): string {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function YelenContratTab({ inst, onToast, onContacterSupport }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
  onContacterSupport?: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  if (!inst) return null;

  const statutMeta = inst.statut ? STATUT_META[inst.statut] : undefined;
  const secteurLabel = inst.secteur ? SECTEUR_LABELS[inst.secteur] ?? inst.category : inst.category;
  const planLabel = inst.plan ? PLAN_LABELS[inst.plan] ?? inst.plan : null;
  const clientDepuis = formatDateLongue(inst.created_at);

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Contrat Yelen</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "480px" }}>Gérez votre relation contractuelle avec Yelen.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Bientôt disponible — le document n'est pas encore numérisé pour votre compte.")}>Télécharger le contrat</Button>
          <MenuActions C={C} items={[
            { label: "Télécharger le contrat", onClick: () => onToast("Bientôt disponible — le document n'est pas encore numérisé pour votre compte.") },
            { label: "Voir le contrat", onClick: () => onToast("Bientôt disponible — le document n'est pas encore numérisé pour votre compte.") },
            { label: "Télécharger tous les documents", onClick: () => onToast("Bientôt disponible.") },
            ...(onContacterSupport ? [{ label: "Contacter Yelen", onClick: onContacterSupport }] : []),
            { label: "Voir l'historique", onClick: () => onToast("Bientôt disponible — l'historique détaillé de votre contrat arrive dans un prochain chantier.") },
            ...(onContacterSupport ? [{ label: "Signaler un problème", onClick: onContacterSupport }] : []),
          ]}/>
        </div>
      </div>

      {/* ── État global (honnête : aucun statut contractuel distinct n'existe encore) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", fontWeight: 800, backgroundColor: C.bg3, color: C.t3, padding: "4px 10px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: "0.3px" }}><StatusDot couleur={C.t3}/>Statut du contrat — Non défini</span>
        <span style={{ color: C.t3, fontSize: "11px" }}>{inst.name}</span>
      </div>

      {/* ── Bloc principal — État du contrat ── */}
      <Card tokens={toCardTokens(C)} padding="18px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Contrat Yelen" accent={C.t3}/>
        <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, marginBottom: "2px" }}>{inst.name}</div>
        <p style={{ color: C.t3, fontSize: "11.5px", marginBottom: "18px" }}>Les informations contractuelles spécifiques à votre compte ne sont pas encore numérisées — elles s&apos;afficheront ici dès qu&apos;elles seront rattachées à votre dossier.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "16px", marginBottom: "22px" }}>
          <ChampBientot label="Statut" C={C} texte="Non défini"/>
          <ChampBientot label="Type" C={C} texte="Non défini"/>
          <ChampBientot label="Date d'activation" C={C} texte="Non défini"/>
          <ChampBientot label="Date de début" C={C} texte="Non défini"/>
          <ChampBientot label="Date d'échéance" C={C} texte="Non défini"/>
          <ChampBientot label="Durée" C={C} texte="Non défini"/>
          <ChampBientot label="Renouvellement" C={C} texte="Non défini"/>
        </div>

        {/* Timeline — seul "aujourd'hui" est un fait vérifiable */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: C.t3, margin: "0 0 6px" }}/>
            <div style={{ color: C.t2, fontSize: "11px", fontWeight: 700 }}>Activation</div>
            <div style={{ color: C.t3, fontSize: "10.5px" }}>Non défini</div>
          </div>
          <div style={{ flex: 2, height: "2px", backgroundColor: C.border, marginBottom: "38px" }}/>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: C.gold, margin: "0 auto 6px" }}/>
            <div style={{ color: C.t2, fontSize: "11px", fontWeight: 700 }}>Aujourd&apos;hui</div>
            <div style={{ color: C.t3, fontSize: "10.5px" }}>{aujourdHui()}</div>
          </div>
          <div style={{ flex: 2, height: "2px", backgroundColor: C.border, marginBottom: "38px" }}/>
          <div style={{ flex: 1, textAlign: "right" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: C.t3, margin: "0 0 6px auto" }}/>
            <div style={{ color: C.t2, fontSize: "11px", fontWeight: 700 }}>Échéance</div>
            <div style={{ color: C.t3, fontSize: "10.5px" }}>Non défini</div>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "14px", marginBottom: "14px" }}>
        {/* ── Votre compte Yelen (réel, identique à YelenCompteTab) ── */}
        <Card tokens={toCardTokens(C)} padding="16px">
          <SectionHeader label="Votre compte Yelen" accent={C.blue}/>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "2px" }}>{inst.name}</div>
          <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "16px" }}>{secteurLabel}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "14px" }}>
            <Champ label="ID établissement" C={C} mono valeur={inst.id}/>
            <Champ label="Statut du compte" C={C} valeur={statutMeta ? <span style={{ display: "flex", alignItems: "center", gap: "6px", color: statutMeta.couleur }}><StatusDot couleur={statutMeta.couleur}/>{statutMeta.label}</span> : "—"}/>
            {planLabel ? <Champ label="Forfait actuel" C={C} valeur={planLabel}/> : <ChampBientot label="Forfait actuel" C={C}/>}
            {clientDepuis ? <Champ label="Depuis" C={C} valeur={clientDepuis}/> : <ChampBientot label="Depuis" C={C}/>}
            <Champ label="Établissement" C={C} valeur={inst.name}/>
            <ChampBientot label="Type de compte" C={C}/>
          </div>
        </Card>

        {/* ── Relation commerciale ── */}
        <Card tokens={toCardTokens(C)} padding="16px">
          <SectionHeader label="Relation commerciale" accent={C.purple}/>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "14px" }}>
            <ChampBientot label="Responsable du compte" C={C}/>
            <ChampBientot label="Contact commercial" C={C}/>
            <ChampBientot label="Téléphone" C={C}/>
            <ChampBientot label="Dernier échange" C={C}/>
          </div>
          {onContacterSupport && <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onContacterSupport}>Contacter Yelen</Button>}
        </Card>
      </div>

      <SectionBientot titre="Documents contractuels" C={C} accent={C.teal}
        sousTitre="Contrat, conditions commerciales et annexes applicables à votre compte."
        texte="Aucun document contractuel n'est encore numérisé pour votre compte. Cette section deviendra le référentiel centralisé de vos documents Yelen (contrat, conditions commerciales, annexes) dans un prochain chantier."/>

      <SectionBientot titre="Échéances importantes" C={C} accent={C.orange}
        sousTitre="Dates clés à ne pas manquer sur votre contrat."
        texte="Aucune échéance contractuelle n'est encore suivie pour votre compte — activation, renouvellement et échéances apparaîtront ici dès qu'elles seront définies."/>

      <SectionBientot titre="Ce que couvre votre contrat" C={C} accent={C.green}
        sousTitre="Services et périmètre inclus dans votre relation avec Yelen."
        texte="Le périmètre contractuel de votre compte (services inclus, établissement concerné) n'est pas encore détaillé ici."/>

      <SectionBientot titre="Historique du contrat" C={C} accent={C.t3}
        sousTitre="Les événements de votre relation contractuelle avec Yelen."
        texte="Aucun événement contractuel n'est encore tracé (signature, activation, consultation) — cet historique se construira au fil de votre relation avec Yelen."/>
    </div>
  );
}
