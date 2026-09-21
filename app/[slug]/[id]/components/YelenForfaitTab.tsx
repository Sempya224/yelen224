"use client";

// Yelen Business → Forfait (18/09/2026) — 3e écran de la section, même
// discipline que YelenCompteTab.tsx/YelenContratTab.tsx. Audit préalable :
// institutions.plan (essentiel/pro/entreprise) n'est référencé nulle part
// dans le dashboard institution pour restreindre une fonctionnalité — seul
// le rôle du membre (MembreRole) gate l'accès aux écrans (voir
// lib/institutionPermissions.ts). Il n'existe donc AUCUNE différenciation
// réelle de fonctionnalités par plan aujourd'hui, ni grille tarifaire, ni
// limites (membres/publications/stockage), ni facturation, ni moyen de
// paiement, ni historique de changement de plan. Retour explicite de
// Bryan (18/09/2026) sur ce chantier précis : ne jamais fabriquer un prix,
// une limite ou une comparaison de forfaits tant que la grille commerciale
// Yelen n'est pas définie — la liste "Fonctionnalités disponibles" reste
// donc volontairement présentée comme un état de compte actuel, pas comme
// un avantage exclusif à ce palier.
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import { STATUT_META, PLAN_LABELS, formatDateLongue, type InstCompte } from "@/lib/compteYelenDisplay";
import { SectionBientot, MenuActions, StatusDot } from "./YelenBusinessShared";

const PLAN_DESCRIPTIONS: Record<string, string> = {
  essentiel: "L'essentiel pour démarrer sur Yelen.",
  pro: "Pour développer votre établissement sur Yelen.",
  entreprise: "Pour les organisations aux besoins avancés.",
};

const FONCTIONNALITES_CATEGORIES: { titre: string; items: string[] }[] = [
  { titre: "Gestion de l'établissement", items: ["Profil établissement", "Services", "Disponibilités", "Rendez-vous"] },
  { titre: "Relation citoyenne", items: ["Messagerie", "Communication", "Yelen Community", "Avis et réputation"] },
  { titre: "Pilotage", items: ["Centre d'analyse"] },
  { titre: "Équipe", items: ["Membres", "Rôles et permissions"] },
];

export function YelenForfaitTab({ inst, onToast, onContacterSupport }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
  onContacterSupport?: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  if (!inst) return null;

  const statutMeta = inst.statut ? STATUT_META[inst.statut] : undefined;
  const planLabel = inst.plan ? PLAN_LABELS[inst.plan] ?? inst.plan : null;
  const planDescription = inst.plan ? PLAN_DESCRIPTIONS[inst.plan] : null;
  const clientDepuis = formatDateLongue(inst.created_at);

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "6px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Forfaits Yelen</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "480px" }}>Découvrez ce que comprend votre compte Yelen et gérez l&apos;évolution de votre offre.</p>
        </div>
        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Bientôt disponible — l'historique de facturation arrive dans un prochain chantier.")}>Voir les factures</Button>
      </div>
      <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "16px" }}>Compte : <span style={{ color: C.t2, fontWeight: 700 }}>{inst.name}</span></div>

      {/* ── Votre forfait actuel ── */}
      <Card tokens={toCardTokens(C)} padding="18px" style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", marginBottom: "6px" }}>
          <SectionHeader label="Votre forfait actuel" accent={C.gold}/>
          {statutMeta && <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", fontWeight: 800, backgroundColor: `${statutMeta.couleur}18`, color: statutMeta.couleur, padding: "4px 10px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: "0.3px" }}><StatusDot couleur={statutMeta.couleur}/>{statutMeta.label}</span>}
        </div>
        <div style={{ color: C.t1, fontSize: "22px", fontWeight: 800, marginTop: "6px" }}>{planLabel ?? "—"}</div>
        {planDescription && <p style={{ color: C.t3, fontSize: "12.5px", marginTop: "4px" }}>{planDescription}</p>}
        <div style={{ display: "flex", gap: "28px", flexWrap: "wrap", marginTop: "18px", marginBottom: "18px" }}>
          <div>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Prix</div>
            <div style={{ color: C.t3, fontSize: "13px", fontWeight: 600 }}>— <span style={{ fontSize: "10px", fontWeight: 700, backgroundColor: C.bg3, padding: "2px 7px", borderRadius: "8px", marginLeft: "4px" }}>Non défini</span></div>
          </div>
          <div>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Prochaine facturation</div>
            <div style={{ color: C.t3, fontSize: "13px", fontWeight: 600 }}>— <span style={{ fontSize: "10px", fontWeight: 700, backgroundColor: C.bg3, padding: "2px 7px", borderRadius: "8px", marginLeft: "4px" }}>Non défini</span></div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onToast("Bientôt disponible — la gestion du forfait en libre-service arrive dans un prochain chantier.")}>Gérer mon forfait</Button>
          <MenuActions C={C} items={[
            { label: "Voir les factures", onClick: () => onToast("Bientôt disponible.") },
            { label: "Comparer les forfaits", onClick: () => onToast("Bientôt disponible — la grille commerciale Yelen n'est pas encore définie.") },
            ...(onContacterSupport ? [{ label: "Contacter Yelen", onClick: onContacterSupport }] : []),
          ]}/>
        </div>
      </Card>

      {/* ── Fonctionnalités disponibles (réel, sans fausse différenciation par plan) ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
        <SectionHeader label="Fonctionnalités disponibles sur votre compte" accent={C.blue}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>La différenciation par forfait n&apos;est pas encore appliquée — les fonctionnalités ci-dessous sont actuellement accessibles à votre compte, selon les rôles de votre équipe.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "18px" }}>
          {FONCTIONNALITES_CATEGORIES.map(cat => (
            <div key={cat.titre}>
              <div style={{ color: C.t1, fontSize: "12px", fontWeight: 800, marginBottom: "8px" }}>{cat.titre}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {cat.items.map(item => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ color: C.t2, fontSize: "12px", fontWeight: 600 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SectionBientot titre="Votre utilisation" C={C} accent={C.orange}
        sousTitre="Équipe, publications et stockage utilisés sur votre compte."
        texte="Le suivi d'utilisation par rapport à des limites de forfait n'est pas encore disponible — aucune limite n'est aujourd'hui définie dans la grille commerciale Yelen pour votre compte."/>

      <SectionBientot titre="Découvrez les forfaits Yelen" C={C} accent={C.gold}
        sousTitre="Comparez les niveaux d'offre Yelen."
        texte="La grille commerciale des forfaits Yelen (Essentiel, Pro, Entreprise — noms provisoires) n'est pas encore publiée. Cette section permettra de comparer les niveaux d'offre dès qu'elle sera définie."/>

      <SectionBientot titre="Comparer les fonctionnalités" C={C} accent={C.blue}
        sousTitre="Détail fonctionnalité par fonctionnalité entre les forfaits."
        texte="Ce comparatif détaillé arrivera une fois la grille commerciale des forfaits Yelen définie."/>

      <SectionBientot titre="Facturation" C={C} accent={C.teal}
        sousTitre="Prix, cycle et moyen de paiement de votre forfait."
        texte="Les informations de facturation de votre forfait (prix, cycle, prochaine échéance, moyen de paiement) arrivent dans un prochain chantier."/>

      {/* ── Historique du forfait ── */}
      <Card tokens={toCardTokens(C)} padding="16px">
        <SectionHeader label="Historique du forfait" accent={C.t3}/>
        {clientDepuis ? (
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: C.gold, marginTop: "3px", flexShrink: 0 }}/>
            <div>
              <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>Compte Yelen créé</div>
              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{clientDepuis}</div>
            </div>
          </div>
        ) : null}
        <p style={{ color: C.t3, fontSize: "11.5px", marginTop: clientDepuis ? "10px" : 0, fontStyle: "italic" }}>Les changements de forfait (activation, renouvellement, passage à un autre palier) apparaîtront ici au fil de votre relation avec Yelen.</p>
      </Card>
    </div>
  );
}
