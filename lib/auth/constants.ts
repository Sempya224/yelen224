/** localStorage : id utilisateur citoyen (table `users`) après OTP validé */
export const YELEN224_USER_ID_KEY = "yelen224_user_id";

/** sessionStorage : id en cours de vérification OTP (entre inscription et validation) */
export const YELEN224_PENDING_USER_ID_KEY = "yelen224_pending_user_id";

/** sessionStorage : dernier onglet actif de l'app (Accueil/Recherche/RDV/Compte),
 * restauré au montage pour que "Retour" depuis un écran /compte/* (ou tout
 * autre écran ouvert depuis un onglet non-Accueil) revienne au bon onglet
 * plutôt que de réinitialiser sur Accueil (le tab n'étant qu'un état React,
 * perdu quand app/page.tsx est démonté par la navigation). */
export const YELEN224_LAST_TAB_KEY = "yelen224_last_tab";

/** localStorage : horodatage ISO de la dernière visite de l'onglet Communauté
 * — sert à compter les publications créées depuis, pour le badge rouge du
 * menu fixe en bas (retour Bryan 09/08/2026). */
export const YELEN224_COMMUNAUTE_SEEN_KEY = "yelen224_communaute_last_seen";

/** localStorage : même mécanisme que YELEN224_COMMUNAUTE_SEEN_KEY, pour
 * l'onglet Recherche (nouveaux établissements validés) et l'onglet Offres
 * (nouvelles offres publiées) — retour Bryan 09/08/2026. */
export const YELEN224_RECHERCHE_SEEN_KEY = "yelen224_recherche_last_seen";
export const YELEN224_OFFRES_SEEN_KEY = "yelen224_offres_last_seen";

/** localStorage : posé à "1" quand le citoyen clique sur le lien CGU ou
 * Politique de confidentialité pendant l'inscription (`app/inscription/page.tsx`),
 * ou quand il ferme le rappel plein écran post-bienvenue qui s'affiche sinon
 * (`app/page.tsx::RappelCguOverlay`) — sert uniquement à ne jamais réafficher
 * ce rappel une fois vu, pas un suivi de consentement légal. */
export const YELEN224_CGU_LIEN_OUVERT_KEY = "yelen224_cgu_lien_ouvert";
