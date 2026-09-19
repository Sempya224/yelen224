"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/locale";
import { setLocale } from "@/app/compte/langue/actions";

const P = { pointerEvents: "none" as const };
const Ic = {
  Check: () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Clock: () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
};

// Drapeau affiché dans l'avatar de chaque ligne — retour Bryan 24/08/2026,
// exception assumée à la convention "zéro emoji" (le drapeau porte un sens
// que l'icône ne remplace pas ici). Arabe : aucun pays unique associé à la
// langue, drapeau saoudien retenu par convention (choix le plus courant
// dans les sélecteurs de langue) — à ajuster si Bryan préfère un autre
// drapeau.
const FLAG: Record<string, string> = { fr: "🇫🇷", en: "🇬🇧", ar: "🇸🇦" };

// N'affiche fr/en comme réellement sélectionnables (brief CEO §19 —
// l'arabe n'est pas exposé tant qu'il n'est pas réellement traduit, voir
// i18n/locale.ts). L'arabe est ajouté ci-dessous en ligne purement
// visuelle "Bientôt disponible", hors de SUPPORTED_LOCALES/AppLocale —
// ne pas l'ajouter à ces deux-là avant que messages/ar.json existe
// réellement. `lang="ar" dir="rtl"` posé dès maintenant sur son nom natif
// pour préparer le rendu RTL, sans toucher à la direction globale de
// l'app (hors périmètre de ce chantier, uniquement visuel sur cet écran).
export function LanguageSwitcher({ currentLocale }: { currentLocale: AppLocale }) {
  const t = useTranslations("navigation.language");
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<AppLocale>(currentLocale);

  function choisir(locale: AppLocale) {
    if (locale === selected || pending) return;
    setSelected(locale);
    startTransition(async () => {
      const res = await setLocale(locale);
      if (res.ok) router.refresh();
      else setSelected(currentLocale);
    });
  }

  const badgeNeutral = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: "24px", padding: "0 4px" }}>
        <h1 style={{ color: C.text, fontSize: "19px", fontWeight: 800, letterSpacing: "-0.2px", margin: "0 0 6px" }}>{t("intro")}</h1>
        <p style={{ color: C.textSubtle, fontSize: "13.5px", lineHeight: 1.5, margin: 0 }}>{t("description")}</p>
      </div>

      <div style={{ color: C.textSubtle, fontSize: "12px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>
        {t("available")}
      </div>

      <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "16px", overflow: "hidden" }}>
        {SUPPORTED_LOCALES.map((locale, i) => {
          const actif = selected === locale;
          return (
            <button
              key={locale}
              onClick={() => choisir(locale)}
              disabled={pending}
              className="tap"
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "14px",
                padding: "15px 16px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${C.borderCard}`,
                background: actif ? "rgba(245,166,35,0.08)" : "transparent",
                cursor: pending ? "not-allowed" : "pointer", textAlign: "left",
              }}
            >
              <div style={{
                width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: badgeNeutral, fontSize: "19px", lineHeight: 1,
                boxShadow: actif ? "0 0 0 2px #F5A623" : "none",
              }}>
                <span aria-hidden="true">{FLAG[locale]}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0, color: actif ? "#F5A623" : C.text, fontSize: "15px", fontWeight: 700 }}>
                {t(`options.${locale}`)}
              </div>
              {actif && (
                <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ic.Check/>
                </div>
              )}
            </button>
          );
        })}

        <div aria-disabled="true" style={{
          display: "flex", alignItems: "center", gap: "14px", padding: "15px 16px",
          borderTop: `1px solid ${C.borderCard}`, opacity: 0.55, cursor: "not-allowed",
        }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: badgeNeutral, fontSize: "19px", lineHeight: 1 }}>
            <span aria-hidden="true">{FLAG.ar}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, color: C.text, fontSize: "15px", fontWeight: 700 }} lang="ar" dir="rtl">
            {t("options.ar")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, background: badgeNeutral, color: C.textSubtle, fontSize: "11px", fontWeight: 700, padding: "5px 9px", borderRadius: "8px" }}>
            <Ic.Clock/> {t("comingSoon")}
          </div>
        </div>
      </div>
    </div>
  );
}
