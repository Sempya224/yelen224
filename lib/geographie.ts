import { supabase } from "@/lib/supabase";
import { VILLES_GUINEE } from "@/lib/villes";

// Yelen Geographic System — référentiel pays/villes central
// (docs/product/YELEN_GEOGRAPHIC_SYSTEM_AUDIT.md). Consommé par le
// wizard Hôtel (pays → ville → établissements) et, plus tard, par tout
// autre parcours ayant besoin d'un sélecteur géographique.
//
// La Guinée reste pilotée par lib/villes.ts (VILLES_GUINEE) — la table
// `cities` ne contient QUE l'international, pour éviter une 2e source
// de vérité (lib/villesCoordonnees.ts importe déjà le type VilleGuinee
// depuis lib/villes.ts). villesParPays() fait la jonction : le
// consommateur ne voit jamais la différence entre les deux sources.

export type Country = {
  id: string;
  iso2: string;
  iso3: string;
  name: string;
  nameFr: string;
  region: string;
  enabled: boolean;
};

export type Ville = {
  id: string;
  name: string;
};

function mapCountry(row: {
  id: string; iso2: string; iso3: string; name: string; name_fr: string; region: string; enabled: boolean;
}): Country {
  return { id: row.id, iso2: row.iso2, iso3: row.iso3, name: row.name, nameFr: row.name_fr, region: row.region, enabled: row.enabled };
}

/** Tous les pays du référentiel (existence ≠ disponibilité commerciale, voir `enabled`). */
export async function getCountries(): Promise<Country[]> {
  const { data, error } = await supabase
    .from("countries")
    .select("id, iso2, iso3, name, name_fr, region, enabled")
    .order("name_fr", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapCountry);
}

/** Uniquement les pays activés commercialement sur Yelen (aujourd'hui : la Guinée seule). */
export async function getEnabledCountries(): Promise<Country[]> {
  const { data, error } = await supabase
    .from("countries")
    .select("id, iso2, iso3, name, name_fr, region, enabled")
    .eq("enabled", true)
    .order("name_fr", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapCountry);
}

/**
 * Villes disponibles pour un pays donné. Guinée (iso2 "GN") → VILLES_GUINEE
 * (statique, aucune requête). Tout autre pays → table `cities`, alimentée
 * au fil de l'eau (aucun import externe au lancement de ce chantier).
 */
export async function villesParPays(countryId: string, iso2: string): Promise<Ville[]> {
  if (iso2 === "GN") {
    return VILLES_GUINEE.map((v) => ({ id: v, name: v }));
  }
  const { data, error } = await supabase
    .from("cities")
    .select("id, name")
    .eq("country_id", countryId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
