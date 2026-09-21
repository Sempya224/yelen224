"use client";

// Yelen Business → Moyens de paiement (18/09/2026) — 4e écran de la
// section, même discipline que YelenCompteTab/YelenContratTab/
// YelenForfaitTab.tsx. Concerne EXCLUSIVEMENT le règlement de
// l'abonnement Yelen Business par l'établissement — jamais les moyens de
// paiement que l'établissement accepte de ses propres clients
// (PaiementsTab.tsx, paid_bookings.methode_paiement, écran distinct du
// menu Finance). Distinction rappelée explicitement à l'écran (retour
// Bryan §11).
//
// Audit préalable : aucune intégration de passerelle de paiement
// (Orange Money, MTN MoMo, NimbaPay, carte bancaire) n'existe dans le
// projet pour la facturation Yelen — voir lib/paymentProviders.ts pour le
// détail. Tous les moyens affichés ici sont donc réellement à l'état
// "non configuré" ; les actions ("Configurer", "+ Ajouter") ouvrent un
// message honnête plutôt qu'un flux de connexion qui n'existe pas encore
// (éviter un formulaire qui ne mène nulle part, même piège que "fake
// affordance" déjà évité sur les 3 écrans précédents).
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "../dashboardShared";
import type { InstCompte } from "@/lib/compteYelenDisplay";
import { PAYMENT_STATE_META, fournisseursPourPays, type PaymentProvider } from "@/lib/paymentProviders";
import { StatusDot } from "./YelenBusinessShared";

const PAYS_YELEN_ACTUEL = "Guinée";

function LocalPaymentMethodCard({ provider, C, onToast }: { provider: PaymentProvider; C: ThemeTokens; onToast: (msg: string) => void }) {
  const etat = PAYMENT_STATE_META.not_configured;
  return (
    <Card tokens={toCardTokens(C)} padding="14px">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
        <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800 }}>{provider.label}</div>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", fontWeight: 700, color: etat.couleur }}><StatusDot couleur={etat.couleur}/>{etat.label}</span>
      </div>
      <p style={{ color: C.t3, fontSize: "11px", lineHeight: 1.5, marginBottom: "12px" }}>{provider.description}</p>
      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => onToast(`Bientôt disponible — la connexion à ${provider.label} arrive dans un prochain chantier.`)}>Configurer</Button>
    </Card>
  );
}

function NimbaPayCard({ provider, C }: { provider: PaymentProvider; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="14px" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800 }}>{provider.label}</div>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", fontWeight: 800, backgroundColor: "#d9770618", color: "#d97706", padding: "3px 9px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: "0.3px" }}><StatusDot couleur="#d97706"/>Bientôt disponible sur Yelen</span>
      </div>
      <p style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.5 }}>{provider.description}</p>
    </Card>
  );
}

function MoyenNonConfigureCard({ titre, texte, boutonLabel, C, onClick }: { titre: string; texte: string; boutonLabel: string; C: ThemeTokens; onClick: () => void }) {
  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800 }}>{titre}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", fontWeight: 700, color: PAYMENT_STATE_META.not_configured.couleur }}><StatusDot couleur={PAYMENT_STATE_META.not_configured.couleur}/>{PAYMENT_STATE_META.not_configured.label}</span>
        </div>
        <p style={{ color: C.t3, fontSize: "11.5px" }}>{texte}</p>
      </div>
      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={onClick}>{boutonLabel}</Button>
    </Card>
  );
}

export function YelenPaiementsTab({ inst, onToast }: {
  inst: InstCompte | null;
  onToast: (msg: string, color?: string) => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  if (!inst) return null;

  const fournisseursLocaux = fournisseursPourPays(PAYS_YELEN_ACTUEL);
  const nimbapay = fournisseursLocaux.find(p => p.id === "nimbapay");
  const mobileMoney = fournisseursLocaux.filter(p => p.type === "mobile_money" && p.id !== "nimbapay");

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "6px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "19px", fontWeight: 800 }}>Moyens de paiement</div>
          <p style={{ color: C.t3, fontSize: "12px", marginTop: "4px", maxWidth: "480px" }}>Gérez les moyens utilisés pour régler vos services et votre abonnement Yelen Business.</p>
        </div>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => onToast("Bientôt disponible — la connexion d'un moyen de paiement arrive dans un prochain chantier.")}>+ Ajouter un moyen de paiement</Button>
      </div>
      <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px", marginBottom: "18px" }}>
        <p style={{ color: C.t2, fontSize: "11px", lineHeight: 1.5, margin: 0 }}>Cet écran concerne uniquement le règlement de votre abonnement Yelen Business — pas les moyens de paiement que <span style={{ fontWeight: 700 }}>{inst.name}</span> accepte de ses propres clients (voir l&apos;écran Paiements du menu Finance).</p>
      </div>

      {/* ── Moyen principal ── */}
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        <SectionHeader label="Moyen de paiement principal" accent={C.gold}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "12px", lineHeight: 1.5 }}>Yelen utilisera ce moyen en priorité pour vos prochains règlements.</p>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <StatusDot couleur={PAYMENT_STATE_META.not_configured.couleur}/>
          <span style={{ color: C.t3, fontSize: "12.5px" }}>Aucun moyen de paiement principal configuré pour l&apos;instant.</span>
        </div>
      </Card>

      {/* ── Paiements locaux ── */}
      <div style={{ marginBottom: "18px" }}>
        <SectionHeader label="Paiements locaux" accent={C.blue}/>
        <p style={{ color: C.t3, fontSize: "11px", marginBottom: "12px", lineHeight: 1.5 }}>Les moyens de paiement disponibles pour votre établissement en fonction de son pays ({PAYS_YELEN_ACTUEL}).</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px", marginBottom: "14px" }}>
          {mobileMoney.map(p => <LocalPaymentMethodCard key={p.id} provider={p} C={C} onToast={onToast}/>)}
        </div>
        {nimbapay && <NimbaPayCard provider={nimbapay} C={C}/>}
      </div>

      {/* ── Compte bancaire ── */}
      <div style={{ marginBottom: "18px" }}>
        <SectionHeader label="Compte bancaire" accent={C.purple}/>
        <MoyenNonConfigureCard C={C} titre="Compte principal"
          texte="Utilisez un compte bancaire pour vos règlements Yelen."
          boutonLabel="+ Ajouter un compte bancaire"
          onClick={() => onToast("Bientôt disponible — l'ajout d'un compte bancaire arrive dans un prochain chantier.")}/>
      </div>

      {/* ── Cartes ── */}
      <div style={{ marginBottom: "18px" }}>
        <SectionHeader label="Cartes de paiement" accent={C.teal}/>
        <MoyenNonConfigureCard C={C} titre="Aucune carte enregistrée"
          texte="Ajoutez une carte Visa ou Mastercard pour régler votre abonnement Yelen."
          boutonLabel="+ Ajouter une carte"
          onClick={() => onToast("Bientôt disponible — l'ajout d'une carte arrive dans un prochain chantier.")}/>
      </div>

      {/* ── Sécurité ── */}
      <Card tokens={toCardTokens(C)} padding="16px">
        <SectionHeader label="Sécurité des paiements" accent={C.t3}/>
        <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, marginBottom: "12px" }}>Vos informations de paiement sont protégées. Les données sensibles (numéro complet, code, jeton) ne sont jamais affichées dans Yelen — seuls des identifiants masqués apparaissent une fois un moyen configuré.</p>
        <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Dernière modification</div>
        <div style={{ color: C.t3, fontSize: "12px" }}>Aucune modification enregistrée pour l&apos;instant.</div>
      </Card>
    </div>
  );
}
