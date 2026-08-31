// Extrait de lib/analyseClients.ts pour être importable en toute sécurité
// depuis un composant client ("use client"). lib/analyseClients.ts crée un
// client Supabase service_role au niveau module (secret serveur, jamais
// préfixé NEXT_PUBLIC_) — importer ne serait-ce qu'UNE seule valeur
// réelle de ce fichier depuis un composant client force webpack à inclure
// tout le module (donc ce `createClient(...)`) dans le bundle navigateur,
// où `process.env.SUPABASE_SERVICE_ROLE_KEY` est toujours `undefined` →
// crash "supabaseKey is required" (confirmé en pratique le 04/08/2026).
// Règle : toute constante/type consommé à la fois par l'agrégation
// serveur et par l'UI client doit vivre ici, jamais dans analyseClients.ts.
export type SegmentClient = "nouveau" | "occasionnel" | "fidele" | "vip" | "inactif";

export const SEGMENT_LABELS: Record<SegmentClient, string> = {
  nouveau: "Nouveaux", occasionnel: "Occasionnels", fidele: "Fidèles", vip: "VIP", inactif: "Inactifs",
};
