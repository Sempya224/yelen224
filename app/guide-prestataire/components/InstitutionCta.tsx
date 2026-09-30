import Link from "next/link";

// CTA acquisition (retour Bryan 23/09/2026) — toujours après SupportCallout :
// le visiteur voit d'abord la sortie "support humain", puis seulement
// ensuite l'invitation à rejoindre/se connecter à Yelen224. Réutilise les
// routes existantes (/institution/connexion, /institution/inscription) —
// aucun nouveau flux d'authentification créé ici.
export function InstitutionCta() {
  return (
    <div className="hc-card hc-institution-cta" style={{ marginTop: "16px" }}>
      <div className="hc-institution-cta__body">
        <p className="hc-institution-cta__title">Nouveau sur Yelen224 ?</p>
        <p className="hc-institution-cta__text">
          Créez votre compte pour rejoindre la plateforme.
        </p>
      </div>
      <div className="hc-institution-cta__actions">
        <Link href="/institution/inscription" className="hc-institution-cta__btn hc-institution-cta__btn--primary">
          Créer un compte
        </Link>
        <Link href="/institution/connexion" className="hc-institution-cta__btn">
          J&apos;ai déjà un compte
        </Link>
      </div>
    </div>
  );
}
