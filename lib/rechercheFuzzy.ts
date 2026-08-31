// Correction de fautes simples pour l'overlay Search (décision CEO
// 08/08/2026) — comparaison approximative côté client, aucune migration ni
// dépendance externe. Déterministe (distance de Levenshtein), conforme à
// la philosophie zéro-LLM du projet : pas de "compréhension" du texte,
// juste une tolérance mécanique à quelques lettres de différence.

// Distance de Levenshtein classique (programmation dynamique, O(n*m)) —
// suffisant pour des termes courts (noms d'institutions/villes/services),
// jamais appelé sur de longs textes ici.
function distanceLevenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cout);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function normaliser(texte: string): string {
  return texte
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase().trim();
}

// Vrai si `terme` correspond à `cible` — soit une sous-chaîne directe
// (cas le plus fréquent, prioritaire), soit une tolérance de 1-2 lettres
// selon la longueur du mot le plus court comparé (une faute plausible sur
// un mot de 4 lettres n'est pas la même tolérance que sur un mot de 12).
export function correspondApproximativement(terme: string, cible: string): boolean {
  const t = normaliser(terme);
  const c = normaliser(cible);
  if (!t) return true;
  if (c.includes(t)) return true;

  // Comparaison mot à mot de la cible (ex. "banque de guinée" vs "banqe")
  // plutôt qu'une distance globale sur la phrase entière, qui échouerait
  // dès que le terme tapé ne correspond qu'à un des mots.
  const mots = c.split(/\s+/);
  for (const mot of mots) {
    if (!mot) continue;
    const tolerance = t.length <= 4 ? 1 : t.length <= 8 ? 2 : 3;
    if (Math.abs(mot.length - t.length) > tolerance) continue;
    if (distanceLevenshtein(t, mot) <= tolerance) return true;
  }
  return false;
}
