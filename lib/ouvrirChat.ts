// lib/ouvrirChat.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fonction universelle à appeler partout dans l'app quand on veut ouvrir le chat
// Elle détecte automatiquement si c'est un citoyen ou une institution
// et redirige vers la bonne page messagerie.
//
// UTILISATION :
//   import { ouvrirChat } from "@/lib/ouvrirChat";
//   ouvrirChat(rdvId, router);
//
// ─────────────────────────────────────────────────────────────────────────────

import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";

export function ouvrirChat(rdvId: string, router: { push: (url: string) => void }) {
  if (!rdvId) return;

  const citoyenId = localStorage.getItem(YELEN224_USER_ID_KEY);
  const institutionId = localStorage.getItem("yelen224_institution_id");

  if (institutionId) {
    // C'est une institution → page institution
    router.push(`/messagerie/institution?rdv_id=${rdvId}`);
  } else if (citoyenId) {
    // C'est un citoyen → page citoyen
    router.push(`/messagerie/citoyen?rdv_id=${rdvId}`);
  } else {
    // Pas connecté → login
    router.push("/login");
  }
}