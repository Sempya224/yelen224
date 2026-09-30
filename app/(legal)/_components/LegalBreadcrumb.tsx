"use client";

// Fil d'Ariane du Centre légal — dérivé automatiquement de lib/legalNav.ts,
// aucune page n'a besoin de passer son propre titre. N'affiche rien sur
// une route qui ne serait pas (encore) dans la navigation centralisée.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { LEGAL_OVERVIEW_HREF, findLegalNavItem } from "@/lib/legalNav";

export function LegalBreadcrumb() {
  const { theme } = useTheme();
  const C = T[theme];
  const pathname = usePathname();
  const current = findLegalNavItem(pathname ?? "");
  if (!current || current.href === LEGAL_OVERVIEW_HREF) return null;

  return (
    <div style={{ padding: "16px 24px 0", fontSize: "12px" }}>
      <Link href={LEGAL_OVERVIEW_HREF} style={{ color: C.textFaint, textDecoration: "none" }}>Centre légal</Link>
      <span style={{ color: C.textFaint, margin: "0 6px" }}>/</span>
      <span style={{ color: C.textSubtle }}>{current.label}</span>
    </div>
  );
}
