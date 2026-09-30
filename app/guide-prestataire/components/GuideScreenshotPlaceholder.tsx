import type { ScreenshotPlaceholder } from "@/lib/helpCenter/types";

// Emplacement éditorial pour une future capture d'écran réelle (standard
// v2 du Help Center, §2 — docs/product/YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md).
// N'affiche JAMAIS une fausse capture ni un contenu destiné au prestataire
// final : uniquement une carte clairement identifiable comme un repère de
// chantier documentaire, à remplacer progressivement par la vraie image
// (§2/§10 du standard — alt text descriptif à fournir à ce moment-là, pas
// avant). Le texte de l'article reste compréhensible sans cette carte
// (§3 du standard).
export function GuideScreenshotPlaceholder({ ecran, zone, montrer }: ScreenshotPlaceholder) {
  return (
    <figure
      className="hc-screenshot-placeholder"
      role="note"
      aria-label={`Emplacement de capture d'écran à ajouter — écran ${ecran}, zone ${zone}`}
    >
      <div className="hc-screenshot-placeholder__tag">Contenu éditorial — à remplacer</div>
      <div className="hc-screenshot-placeholder__body">
        <div className="hc-screenshot-placeholder__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10.5" r="1.6" />
            <path d="M21 16.5 15.5 11 6 19" />
          </svg>
        </div>
        <p className="hc-screenshot-placeholder__label">Capture d&apos;écran à ajouter</p>
        <dl className="hc-screenshot-placeholder__meta">
          <div>
            <dt>Écran</dt>
            <dd>{ecran}</dd>
          </div>
          <div>
            <dt>Zone</dt>
            <dd>{zone}</dd>
          </div>
        </dl>
        {montrer.length > 0 && (
          <>
            <p className="hc-screenshot-placeholder__montrer-label">Montrer :</p>
            <ul className="hc-screenshot-placeholder__montrer">
              {montrer.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </>
        )}
      </div>
    </figure>
  );
}
