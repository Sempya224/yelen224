import { EMPTY_SIGNUP_STATE, SignupState } from "./types";

const STORAGE_KEY = "yelen224_signup_state_v1";

// sessionStorage plutôt que localStorage : les informations saisies pendant
// la création d'un espace professionnel (téléphone, identité du responsable)
// n'ont aucune raison de survivre indéfiniment sur un poste partagé — seul
// un refresh dans le même onglet doit être couvert (exigence "reprise", pas
// "persistance longue durée"). getItem/setItem protégés par try/catch :
// peut lever sur Safari navigation privée (piège déjà documenté ailleurs
// dans le projet pour localStorage, même prudence ici par cohérence).
export function loadSignupState(): SignupState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SIGNUP_STATE;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_SIGNUP_STATE, ...parsed };
  } catch {
    return EMPTY_SIGNUP_STATE;
  }
}

export function saveSignupState(state: SignupState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function clearSignupState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
