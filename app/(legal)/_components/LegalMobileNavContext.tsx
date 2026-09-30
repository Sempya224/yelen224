"use client";

// Contexte partagé entre LegalHeader (icône déclencheur) et LegalSidebar
// (panneau déroulant mobile) — chantier "un seul bandeau document" du
// Centre légal (23/09/2026, retour Bryan). Header et Sidebar sont deux
// composants frères dans layout.tsx : ce contexte évite de faire remonter
// l'état dans le layout lui-même. Desktop non concerné (sidebar colonne
// permanente, jamais ce panneau).
import { createContext, useContext, useState, type ReactNode } from "react";

type LegalMobileNavContextValue = {
  ouvert: boolean;
  setOuvert: (v: boolean | ((prev: boolean) => boolean)) => void;
};

const LegalMobileNavContext = createContext<LegalMobileNavContextValue | null>(null);

export function LegalMobileNavProvider({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <LegalMobileNavContext.Provider value={{ ouvert, setOuvert }}>
      {children}
    </LegalMobileNavContext.Provider>
  );
}

export function useLegalMobileNav() {
  const ctx = useContext(LegalMobileNavContext);
  if (!ctx) throw new Error("useLegalMobileNav doit être utilisé sous LegalMobileNavProvider");
  return ctx;
}
