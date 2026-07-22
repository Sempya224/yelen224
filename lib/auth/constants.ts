/** localStorage : id utilisateur citoyen (table `users`) après OTP validé */
export const YELEN224_USER_ID_KEY = "yelen224_user_id";

/** sessionStorage : id en cours de vérification OTP (entre inscription et validation) */
export const YELEN224_PENDING_USER_ID_KEY = "yelen224_pending_user_id";

/** Code OTP simulé tant que Nimba SMS n'est pas branché */
export const YELEN224_OTP_SIMULE = "123456";

/** sessionStorage : dernier onglet actif de l'app (Accueil/Recherche/RDV/Compte),
 * restauré au montage pour que "Retour" depuis un écran /compte/* (ou tout
 * autre écran ouvert depuis un onglet non-Accueil) revienne au bon onglet
 * plutôt que de réinitialiser sur Accueil (le tab n'étant qu'un état React,
 * perdu quand app/page.tsx est démonté par la navigation). */
export const YELEN224_LAST_TAB_KEY = "yelen224_last_tab";
