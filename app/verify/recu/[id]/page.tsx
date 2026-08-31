import type { Metadata } from "next";
import { getLocale, getMessages } from "next-intl/server";
import { IntlClientProvider } from "@/components/IntlClientProvider";
import { VerifyRecuClient } from "./verify-client";
import type { AppLocale } from "@/i18n/locale";

export const metadata: Metadata = {
  title: "Vérification de reçu — Yelen224",
  description: "Vérifiez l'authenticité d'un reçu de paiement Yelen.",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = (await getLocale()) as AppLocale;
  const messages = await getMessages();

  return (
    <IntlClientProvider locale={locale} messages={messages}>
      <VerifyRecuClient id={id}/>
    </IntlClientProvider>
  );
}
