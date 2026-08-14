import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { IntlErrorCode } from "next-intl";
import { LOCALE_COOKIE_NAME, DEFAULT_LOCALE, DEFAULT_TIME_ZONE, isSupportedLocale } from "@/i18n/locale";
import { readByPath } from "@/i18n/readByPath";
import frMessages from "@/messages/fr.json";

// Mode "without i18n routing" de next-intl (décision CEO 08/08/2026) :
// la locale est résolue ici via un cookie, jamais via un segment d'URL.
// fr.json est toujours importé — c'est la référence utilisée par le
// fallback ci-dessous, pas seulement la locale par défaut.
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE_NAME)?.value;
  const locale = isSupportedLocale(raw) ? raw : DEFAULT_LOCALE;

  const messages = locale === "fr" ? frMessages : (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: DEFAULT_TIME_ZONE,
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        console.error("[i18n] clé manquante:", error.message);
      } else {
        console.error(error);
      }
    },
    // Exigence brief CEO §20-21 : une traduction manquante retombe sur le
    // français, jamais la clé brute affichée à l'utilisateur.
    getMessageFallback({ namespace, key, error }) {
      const path = [namespace, key].filter(Boolean).join(".");
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        const fr = readByPath(frMessages, namespace, key);
        if (typeof fr === "string") return fr;
      }
      return path;
    },
  };
});
