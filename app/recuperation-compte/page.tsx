import { getLocale, getMessages } from "next-intl/server";
import { IntlClientProvider } from "@/components/IntlClientProvider";
import { RecuperationCompteClient } from "./recuperation-client";
import type { AppLocale } from "@/i18n/locale";

export default async function Page() {
  const locale = (await getLocale()) as AppLocale;
  const messages = await getMessages();

  return (
    <IntlClientProvider locale={locale} messages={messages}>
      <RecuperationCompteClient/>
    </IntlClientProvider>
  );
}
