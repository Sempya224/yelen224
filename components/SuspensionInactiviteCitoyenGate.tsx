"use client";

// Porte de blocage global "compte suspendu pour inactivité" (chantier
// COMPTES-INACTIFS.md, Phase 3, section 2.7 — premier blocage de compte
// citoyen à l'échelle du produit, contrairement à citoyen_rdv_restrictions
// qui ne bloque que la fonctionnalité RDV). Même structure que
// components/AuthSessionWatcher.tsx (vérification légère au changement de
// route, jamais un polling) — ignore /institution et /admin pour la même
// raison (JWT custom, aucune session Supabase Auth citoyen à y vérifier).
// /compte/feedback reste accessible même suspendu (accès au support
// préservé, décision 2.11.5) ; /compte/suspendu/login/inscription évitent
// la boucle de redirection.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const CHEMINS_IGNORES = ["/institution", "/admin", "/login", "/inscription", "/compte/suspendu", "/compte/feedback"];

export function SuspensionInactiviteCitoyenGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (CHEMINS_IGNORES.some((p) => pathname?.startsWith(p))) return;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch("/api/citoyen/compte/suspension-inactivite", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => null);
        if (json?.suspended) router.replace("/compte/suspendu");
      } catch {}
    })();
  }, [pathname, router]);

  return null;
}
