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

// Valeurs widened en `string` (pas les littéraux exacts de `dark`) : sinon
// tout composant typé `C: ThemeTokens` rejette la palette `light` au
// type-check dès qu'elle est passée sans cast (bug réel rencontré le
// 05/08/2026 sur DisponibilitesTab.tsx — DayTimeline/HistoriqueModal/
// ApercuCitoyenModal recevaient `T[theme]`, union dark|light, jamais
// assignable à `typeof T.dark` seul).
export type ThemeTokens = { readonly [K in keyof typeof T.dark]: string };

// Adaptateur vers la primitive partagée components/ui/Button.tsx — ne
// change aucune couleur, ne fait que reformer les tokens C existants dans
// la forme générique attendue par Button/ConfirmModal (chantier
// gouvernance des actions et confirmation, 16/08/2026).
//
// radius/radiusSm alignés sur app/admin/adminTheme.ts::uiTokens (10px/7px)
// le 01/09/2026 (mission "Design System partagé Admin → Institution") —
// avant ce correctif, les deux adaptateurs du même composant Button
// n'avaient jamais convergé sur la même échelle (12px/10px côté
// institution), personne ne l'avait remarqué faute de comparaison
// pixel-level. Admin reste la référence visuelle, jamais l'inverse.
import type { ButtonTokens } from "@/components/ui/Button";
export function toUiTokens(C: ThemeTokens): ButtonTokens {
  return {
    accent: C.gold, accentText: "#000",
    surface: C.bgCard2, border: C.border2,
    text: C.t1, textMuted: C.t3,
    danger: C.red, dangerBg: C.redL, dangerBorder: `${C.red}30`,
    radius: "10px", radiusSm: "7px",
  };
}

// Adaptateur vers components/ui/Card.tsx (mission "Design System partagé
// Admin → Institution", 01/09/2026) — radius aligné sur l'échelle Admin
// (10px, cf. app/admin/adminTheme.ts::cardTokens) plutôt que sur l'un des
// 10 radius différents déjà utilisés côté institution (2px→20px, aucun
// converti pour le moment). Couleurs (surface/border) restent 100% celles
// d'Institution — seule la dimension converge vers Admin, jamais la teinte.
import type { CardTokens } from "@/components/ui/Card";
export function toCardTokens(C: ThemeTokens): CardTokens {
  return { surface: C.bgCard, border: C.border, radius: "10px" };
}
