// Tokens de couleur partagés par le dashboard institution et tous ses
// composants d'onglet (components/*Tab.tsx). Source unique — ne pas
// redéfinir localement dans un composant d'onglet.
//
// Deux palettes (dark/light), même structure que lib/theme.ts côté citoyen.
// Consommation : `const { theme } = useTheme(); const C = T[theme];` puis
// C.xxx partout — jamais T.xxx directement (T est maintenant {dark,light},
// pas une palette plate). Les couleurs sémantiques (green/red/blue/purple/
// orange/teal) sont volontairement assombries en light pour rester lisibles
// sur fond blanc (les valeurs dark, calibrées pour un fond quasi noir,
// tombent sous 3:1 de contraste sur blanc).
// gold = #F5A623, la teinte de marque Yelen224 exacte utilisée partout sur
// le site public (lib/theme.ts ne la tokenise même pas, elle y est écrite en
// dur, identique en dark et en light — jamais assombrie). Avait dérivé vers
// #D4A017/#BF7808 pendant le refactor T→C — corrigé le 12/07/2026 : même
// valeur #F5A623 dans les deux modes, par cohérence avec le reste du site.
export const T = {
  dark: {
    gold: "#F5A623", goldL: "#F8C165", goldD: "#B87D1A",
    bg: "#0A0A0F", bgCard: "#111118", bgCard2: "#16161F", bg3: "#1C1C28",
    border: "rgba(255,255,255,0.07)", border2: "rgba(255,255,255,0.12)",
    shadow: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
    t1: "#FFFFFF", t2: "#9999B3", t3: "#55556A",
    green: "#00C896", greenL: "rgba(0,200,150,0.12)",
    red: "#FF4757", redL: "rgba(255,71,87,0.12)",
    blue: "#4F8EF7", blueL: "rgba(79,142,247,0.12)",
    purple: "#9B6DFF", purpleL: "rgba(155,109,255,0.12)",
    orange: "#FF8C42", orangeL: "rgba(255,140,66,0.12)",
    teal: "#00D4C8", tealL: "rgba(0,212,200,0.12)",
  },
  light: {
    gold: "#F5A623", goldL: "#F8C165", goldD: "#B87D1A",
    bg: "#F5F5F8", bgCard: "#FFFFFF", bgCard2: "#F0F0F5", bg3: "#EAEAF0",
    border: "rgba(10,10,18,0.08)", border2: "rgba(10,10,18,0.14)",
    shadow: "0 1px 3px rgba(20,20,40,0.05), 0 1px 2px rgba(20,20,40,0.04)",
    t1: "#0A0A12", t2: "#47475C", t3: "#767686",
    green: "#00966F", greenL: "rgba(0,150,111,0.10)",
    red: "#D62839", redL: "rgba(214,40,57,0.10)",
    blue: "#2F6FE0", blueL: "rgba(47,111,224,0.10)",
    purple: "#7C4FDB", purpleL: "rgba(124,79,219,0.10)",
    orange: "#D9660F", orangeL: "rgba(217,102,15,0.10)",
    teal: "#00968C", tealL: "rgba(0,150,140,0.10)",
  },
} as const;

export type ThemeTokens = typeof T.dark;
