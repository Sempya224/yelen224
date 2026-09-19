// Suggestions de publication du composeur "Yelen Community" (22/08/2026,
// retour Bryan : suggérer à partir de la vraie activité du citoyen, pas un
// "achievement" générique façon MoneyLion — "s'il voit ça il sera excité
// de le partager"). Même discipline que lib/assistantMessages.ts : zéro
// appel LLM, isomorphe (aucun import next/server ni supabase-js), les
// lignes réelles sont récupérées par l'appelant (route API), ce fichier ne
// fait que dériver un texte/catégorie à partir de données déjà vraies.

export type PostSuggestionType = "demarche_terminee" | "avis_positif";

export type PostSuggestion = {
  id: string;
  type: PostSuggestionType;
  categorie: string;
  titre: string;
  texte: string;
  date: string;
};

// Fenêtre de récence (retour Bryan 22/08/2026) — au-delà, la suggestion
// disparaît plutôt que de proposer un événement déjà oublié par le citoyen.
const FENETRE_JOURS = 7;

export function estRecent(dateISO: string, maintenant: Date = new Date()): boolean {
  const diffJours = (maintenant.getTime() - new Date(dateISO).getTime()) / (1000 * 60 * 60 * 24);
  return diffJours >= 0 && diffJours <= FENETRE_JOURS;
}

export type DemarcheTermineeInfo = { id: string; titre: string; termine_le: string };

export function suggestionDemarcheTerminee(d: DemarcheTermineeInfo): PostSuggestion {
  return {
    id: `demarche-${d.id}`,
    type: "demarche_terminee",
    categorie: "reussite_temoignage",
    titre: "Démarche terminée",
    texte: `Je viens de terminer "${d.titre}" !`,
    date: d.termine_le,
  };
}

export type AvisPositifInfo = {
  id: string;
  institutionNom: string;
  note: number;
  commentaire: string | null;
  titre: string | null;
  createdAt: string;
};

// Réutilise le texte déjà écrit par le citoyen dans son avis — friction
// minimale, zéro texte inventé par nous (retour Bryan : "le signal le
// plus fort", il n'a rien de nouveau à rédiger).
export function suggestionAvisPositif(a: AvisPositifInfo): PostSuggestion {
  const extrait = a.commentaire?.trim() || a.titre?.trim() || "";
  return {
    id: `avis-${a.id}`,
    type: "avis_positif",
    categorie: "reussite_temoignage",
    titre: `Avis ${a.note}/5 pour ${a.institutionNom}`,
    texte: extrait || `Je recommande ${a.institutionNom} — ${a.note}/5.`,
    date: a.createdAt,
  };
}
