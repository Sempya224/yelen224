"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, isSupportedLocale } from "@/i18n/locale";

const UN_AN_EN_SECONDES = 60 * 60 * 24 * 365;

/**
 * Pose le cookie de locale (brief CEO §18 : le choix explicite de
 * l'utilisateur doit persister et primer sur toute détection auto — il
 * n'y a d'ailleurs aucune détection automatique en Phase 1, seulement ce
 * cookie). Ne fait jamais confiance à une valeur brute venue du client.
 */
export async function setLocale(locale: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupportedLocale(locale)) {
    return { ok: false, error: "Langue non supportée." };
  }
  const store = await cookies();
  store.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: UN_AN_EN_SECONDES,
    sameSite: "lax",
  });
  return { ok: true };
}
