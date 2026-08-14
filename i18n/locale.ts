// Source unique pour le nom du cookie de locale et la liste des locales
// supportées — évite toute duplication entre i18n/request.ts et le
// Server Action du sélecteur de langue (app/compte/langue/actions.ts).
export const LOCALE_COOKIE_NAME = "yelen224_locale";

// 'ar' volontairement absent ici (décision CEO 08/08/2026, Phase 1) :
// architecture prête (getLocaleDirection, AppLocale générique) mais
// traduction arabe pas encore faite — ajouter "ar" ici quand messages/ar.json
// existera réellement, pas avant.
export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export const DEFAULT_LOCALE: AppLocale = "fr";

// Yelen n'opère qu'en République de Guinée (UTC+0 toute l'année, aucune
// heure d'été — même hypothèse déjà actée pour le job Clock In Shift,
// voir CLAUDE.md /chantier-clock-in-shift). Fuseau fixe, pas de détection
// par utilisateur : évite le warning next-intl ENVIRONMENT_FALLBACK et
// les mismatchs d'hydratation serveur/client sur les dates formatées.
export const DEFAULT_TIME_ZONE = "Africa/Conakry";

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string | undefined | null): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? "");
}
