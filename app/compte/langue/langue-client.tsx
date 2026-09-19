"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type { AppLocale } from "@/i18n/locale";

export function LangueClient({ currentLocale }: { currentLocale: AppLocale }) {
  const t = useTranslations("navigation.language");
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg = isDark ? "#0A0A0F" : "#F2F2F7";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg }}>
      <CompteHeader titre={t("title")}/>
      <LanguageSwitcher currentLocale={currentLocale}/>
    </div>
  );
}
