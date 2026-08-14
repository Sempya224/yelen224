"use client";

import { NextIntlClientProvider, IntlErrorCode } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import frMessages from "@/messages/fr.json";
import { readByPath } from "@/i18n/readByPath";
import { DEFAULT_TIME_ZONE } from "@/i18n/locale";

// next-intl ne propage PAS automatiquement le onError/getMessageFallback
// défini côté serveur (i18n/request.ts) jusqu'aux Client Components —
// ce wrapper réexpose le même comportement de repli vers le français
// (brief CEO §20-21) pour tout écran migré qui est "use client".
export function IntlClientProvider({ locale, messages, children }: {
  locale: string;
  messages: AbstractIntlMessages;
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={DEFAULT_TIME_ZONE}
      onError={(error) => {
        if (error.code === IntlErrorCode.MISSING_MESSAGE) console.error("[i18n] clé manquante:", error.message);
        else console.error(error);
      }}
      getMessageFallback={({ namespace, key, error }) => {
        const path = [namespace, key].filter(Boolean).join(".");
        if (error.code === IntlErrorCode.MISSING_MESSAGE) {
          const fr = readByPath(frMessages, namespace, key);
          if (typeof fr === "string") return fr;
        }
        return path;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
