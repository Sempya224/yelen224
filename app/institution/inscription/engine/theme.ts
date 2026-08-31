"use client";

import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

// ═══════════════════════════════════════════════════════════
// ACCENT DE MARQUE — fixe, jamais dérivé du thème clair/sombre. Une seule
// valeur, jamais une deuxième nuance de doré (retour Bryan 14/08/2026 :
// une variante plus foncée utilisée sur du texte se lisait comme "une autre
// couleur" à côté du doré réel — supprimée délibérément, ne pas la
// réintroduire pour du texte/icônes "sur fond clair").
// ═══════════════════════════════════════════════════════════
const GOLD = { gold: "#F5A623" };

// Jetons de design partagés par toutes les étapes du moteur — évite de
// redéfinir la même palette dans chaque fichier d'étape (8 fichiers sinon).
export function useSignupTheme() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = T[theme];
  return {
    isDark,
    gold: GOLD.gold,
    goldBg2: isDark ? "rgba(245,166,35,0.12)" : "#FEF3C7",
    bg: t.pageBg,
    card: t.cardBg,
    dark: t.text,
    dark2: t.textMuted,
    gray: t.textSubtle,
    gray2: t.textFaint,
    gray3: isDark ? "rgba(255,255,255,0.08)" : "#EDE8D8",
    border: isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.14)",
    // Fond assombri des popups desktop (ActiviteSelectModal/StatutSelectModal,
    // chantier adaptation desktop du wizard, 20/08/2026) — jeton partagé,
    // jamais une couleur codée en dur dans un composant individuel.
    overlay: isDark ? "rgba(0,0,0,0.65)" : "rgba(15,23,42,0.45)",
    red: "#DC2626",
    redL: isDark ? "rgba(220,38,38,0.14)" : "#FEF2F2",
    green: "#16A34A",
    shadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(20,20,30,0.09)",
  };
}

export type SignupThemeTokens = ReturnType<typeof useSignupTheme>;
