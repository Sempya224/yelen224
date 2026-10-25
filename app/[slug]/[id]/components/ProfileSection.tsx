"use client";

// Pattern "label à gauche / carte à droite" façon Stripe/Cloudflare
// (refonte ProfilEntrepriseTab, 19/10/2026) — titre + description courte en
// colonne gauche fixe (≥1024px), contenu dans une Card à droite. Empilé en
// dessous de 1024px (titre au-dessus de la carte). Purement layout : ne
// porte aucune logique de formulaire, consommé par ProfilEntrepriseTab.tsx
// section par section. La règle de grille (.profil-section) vit dans le
// <style> du fichier appelant pour éviter d'injecter un <style> dupliqué à
// chaque instance (une section par bloc du formulaire).
import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens } from "../theme";
import { Card } from "@/components/ui/Card";

export function ProfileSection({ title, description, children, cardPadding = "24px", style }: {
  title: string;
  description?: string;
  children: ReactNode;
  cardPadding?: string;
  style?: CSSProperties;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div className="profil-section" style={style}>
      <div>
        <div style={{ color: C.t1, fontSize: "16px", fontWeight: "700" }}>{title}</div>
        {description && (
          <div style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.5, marginTop: "4px" }}>{description}</div>
        )}
      </div>
      <Card tokens={toCardTokens(C)} padding={cardPadding}>
        {children}
      </Card>
    </div>
  );
}
