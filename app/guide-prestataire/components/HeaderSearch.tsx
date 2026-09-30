"use client";

import { usePathname } from "next/navigation";
import { SearchForm } from "./SearchForm";

// L'accueil (hero) et /recherche (sa propre grande barre + résultats) ont
// déjà leur propre recherche — on évite le doublon visuel en la masquant
// sur ces deux routes précises, visible partout ailleurs (article, domaine).
export function HeaderSearch() {
  const pathname = usePathname();
  if (pathname === "/guide-prestataire" || pathname?.startsWith("/guide-prestataire/recherche")) {
    return null;
  }

  return (
    <div className="hc-header-search">
      <SearchForm />
    </div>
  );
}
