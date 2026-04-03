// yelen224/lib/theme.ts

export const T = {
    dark: {
      pageBg:       "#080812",
      sectionAlt:   "#0A0A15",
      cardBg:       "#0D0D1A",
      footerBg:     "#050508",
      text:         "#ffffff",
      textMuted:    "#999",
      textSubtle:   "#666",
      textDim:      "#555",
      textFaint:    "#444",
      border:       "rgba(255,255,255,0.06)",
      borderSubtle: "rgba(255,255,255,0.04)",
      borderCard:   "rgba(255,255,255,0.05)",
      headerBg:     "rgba(8,8,18,0.96)",
    },
    light: {
      pageBg:       "#f8f8fb",
      sectionAlt:   "#f0f0f5",
      cardBg:       "#ffffff",
      footerBg:     "#e8e8f0",
      text:         "#111111",
      textMuted:    "#444444",
      textSubtle:   "#666666",
      textDim:      "#555555",
      textFaint:    "#888888",
      border:       "rgba(0,0,0,0.08)",
      borderSubtle: "rgba(0,0,0,0.05)",
      borderCard:   "rgba(0,0,0,0.07)",
      headerBg:     "rgba(248,248,251,0.96)",
    },
  } as const;
  
  export type ThemeTokens = typeof T.dark;