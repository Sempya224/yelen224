import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";

// Signale à AuthSessionWatcher (components/AuthSessionWatcher.tsx) qu'une
// déconnexion volontaire est en cours — supabase.auth.signOut() émet le même
// événement SIGNED_OUT qu'une expiration naturelle de session ; sans ce
// drapeau, les deux redirections (?logged_out=1 vs ?session_expired=1)
// entreraient en course. Réinitialisé après un court délai plutôt
// qu'immédiatement : l'événement peut arriver juste après la résolution de
// signOut(), pas de façon strictement synchrone.
let logoutInProgress = false;
export function isLogoutInProgress() {
  return logoutInProgress;
}

/**
 * Déconnexion citoyen "stricte" : contrairement aux implémentations locales
 * qu'elle remplace (app/page.tsx, dashboard-client.tsx, profil-client.tsx,
 * informations-client.tsx — 4 versions divergentes avant ce chantier), elle
 * ne doit JAMAIS avaler silencieusement un échec réseau — LogoutFlow a
 * besoin que l'erreur remonte pour afficher l'écran "Impossible de terminer
 * la déconnexion" plutôt qu'un succès mensonger.
 *
 * Les deux appels (signOut + révocation du remember-token) sont idempotents,
 * donc un "Réessayer" après échec peut relancer cette fonction sans risque.
 */
export async function logoutCitoyenStrict(): Promise<void> {
  logoutInProgress = true;
  try {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;

    const res = await fetch("/api/citoyen/auth/logout", { method: "POST" });
    if (!res.ok) throw new Error("logout_failed");

    try {
      localStorage.removeItem(YELEN224_USER_ID_KEY);
      localStorage.removeItem("yelen224_last_bio");
      localStorage.removeItem("yelen224_bio_registered");
      localStorage.removeItem("yelen224_bio_credential_id");
      localStorage.removeItem("yelen224_bio_ignored");
    } catch {}
  } finally {
    setTimeout(() => { logoutInProgress = false; }, 2000);
  }
}
