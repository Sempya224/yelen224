import type { SupabaseClient } from "@supabase/supabase-js";
import { isMembreRole } from "./institutionPermissions";

// Filtres partagés entre la liste (app/api/institution/journal/route.ts) et
// l'export (app/api/institution/journal/export/route.ts) — Lot C (recherche
// universelle) puis Lot G (export enrichi). Extrait ici pour que les deux
// routes ne puissent jamais diverger sur ce qu'un même jeu de filtres
// retourne (avant Lot G, cette logique n'existait que dans route.ts).
export type FiltresJournal = {
  action: string | null;
  membreId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  cibleIds: string | null;
  q: string | null;
  categorie: string | null;
  niveau: string | null;
  plateforme: string | null;
  role: string | null;
};

// Masquage de l'IP et du user-agent bruts pour les rôles sans "journal.voir_ip"
// (liste, événements liés, export). Les champs navigateur/os/plateforme, plus
// grossiers, restent visibles.
export function masquerDonneesTechniques<T extends { ip: string | null; user_agent: string | null }>(entrees: T[]): T[] {
  return entrees.map(e => ({ ...e, ip: null, user_agent: null }));
}

// recherche_texte indexe l'adresse IP : sans garde, un rôle qui ne voit pas
// les IP pourrait les retrouver par essais (« 197.149 » → lignes concernées).
// Garde partielle : refuse les recherches qui ressemblent à un fragment d'IP
// (IPv4 « 12.34 », IPv6 « 2a01:… »). Une garde complète demanderait une
// colonne de recherche sans IP côté base.
export function rechercheRessembleAUneIp(q: string | null): boolean {
  const t = (q ?? "").trim();
  return /\d{1,3}\.\d{1,3}/.test(t) || /[0-9a-f]{0,4}:[0-9a-f:]{2,}/i.test(t);
}

export function lireFiltresJournal(searchParams: URLSearchParams): FiltresJournal {
  return {
    action: searchParams.get("action"),
    membreId: searchParams.get("membre_id"),
    dateFrom: searchParams.get("date_from"),
    dateTo: searchParams.get("date_to"),
    cibleIds: searchParams.get("cible_ids"),
    q: searchParams.get("q"),
    categorie: searchParams.get("categorie"),
    niveau: searchParams.get("niveau"),
    plateforme: searchParams.get("plateforme"),
    role: searchParams.get("role"),
  };
}

// Construit une requête `journal_activite` filtrée et scopée à l'institution.
// `select`/`opts` restent au choix de l'appelant (colonnes différentes entre
// liste/export, `count: "exact", head: true` pour un simple comptage) —
// seule la logique de filtrage est partagée. Le filtre par rôle nécessite
// une résolution async via institution_membres (pas de colonne role
// dénormalisée sur journal_activite), d'où la signature async.
//
// ⚠️ Retourne `{ query }` et non `query` directement : un query builder
// Supabase est "thenable" (awaitable) — le retourner tel quel depuis une
// fonction async l'aurait fait auto-exécuter et aplatir en {data,error} par
// la résolution standard des Promises, avant même d'atteindre l'appelant.
export async function requeteJournalFiltree(
  sb: SupabaseClient,
  institutionId: string,
  filtres: FiltresJournal,
  select: string,
  opts?: { count?: "exact"; head?: boolean }
) {
  let query = sb.from("journal_activite").select(select, opts).eq("institution_id", institutionId);

  if (filtres.action) query = query.eq("action", filtres.action);
  if (filtres.membreId) query = query.eq("membre_id", filtres.membreId);
  if (filtres.dateFrom) query = query.gte("created_at", filtres.dateFrom);
  if (filtres.dateTo) query = query.lte("created_at", filtres.dateTo);
  if (filtres.categorie) query = query.eq("categorie", filtres.categorie);
  if (filtres.niveau) query = query.eq("niveau", filtres.niveau);
  if (filtres.plateforme) query = query.eq("plateforme", filtres.plateforme);
  if (filtres.cibleIds) {
    const ids = filtres.cibleIds.split(",").filter(Boolean);
    if (ids.length) query = query.in("cible_id", ids);
  }
  if (filtres.q && filtres.q.trim()) {
    query = query.ilike("recherche_texte", `%${filtres.q.trim().toLowerCase()}%`);
  }
  // Reflète le rôle ACTUEL du membre, pas nécessairement celui qu'il avait
  // au moment de l'action si son rôle a changé depuis (limite déjà connue,
  // documentée au Lot C).
  if (filtres.role && isMembreRole(filtres.role)) {
    const { data: membresRole } = await sb
      .from("institution_membres")
      .select("id")
      .eq("institution_id", institutionId)
      .eq("role", filtres.role);
    const ids = (membresRole ?? []).map((m: { id: string }) => m.id);
    const sentinel = ["00000000-0000-0000-0000-000000000000"];
    query = query.in("membre_id", ids.length ? ids : sentinel);
  }

  return { query };
}
