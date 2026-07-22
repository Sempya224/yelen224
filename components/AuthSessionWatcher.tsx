"use client";

// Détecte l'expiration naturelle d'une session Supabase Auth citoyen et
// redirige vers /login avec une bannière rassurante — contrairement à
// l'institution (qui a déjà ?expired=1 depuis un 401 explicite), rien
// n'existait côté citoyen. Ne couvre que l'événement SIGNED_OUT déjà émis
// par le SDK Supabase (écouteur léger, décision validée avec Bryan) — pas
// d'audit des appels API citoyen un par un, hors périmètre de ce chantier.
//
// Ignoré sur /institution et /admin : ces espaces utilisent un cookie JWT
// custom, jamais de session Supabase Auth — ce composant n'a rien à y
// détecter (garde surtout utile si un même navigateur a par ailleurs une
// session citoyen Supabase active en arrière-plan, ex. en développement).
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isLogoutInProgress } from "@/lib/auth/logoutCitoyen";

export function AuthSessionWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith("/institution") || pathname?.startsWith("/admin")) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !isLogoutInProgress()) {
        router.replace("/login?session_expired=1");
      }
    });
    return () => subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}
