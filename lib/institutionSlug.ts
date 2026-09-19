import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Même translittération que le backfill SQL de la migration
// 20260805000010_clock_in_institutions_slug.sql — garde une normalisation
// cohérente entre les institutions déjà en base, celles créées depuis
// (auth/register/route.ts) et celles renommées (profile/route.ts, chantier
// "URLs dynamiques institution" 28/08/2026).
const SLUG_TRANSLIT: Record<string, string> = {
  à: "a", â: "a", ä: "a", é: "e", è: "e", ê: "e", ë: "e",
  ï: "i", î: "i", ô: "o", ö: "o", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

function slugifyBase(name: string): string {
  const lowered = name
    .toLowerCase()
    .split("")
    .map((ch) => SLUG_TRANSLIT[ch] ?? ch)
    .join("");
  return lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Segments racine déjà utilisés par app/* — un slug d'institution ne doit
// jamais coïncider avec une route du site : Next.js priorise toujours les
// routes statiques sur /[slug]/[id]/[screen], donc une institution qui
// obtiendrait un de ces slugs deviendrait définitivement inaccessible à sa
// propre URL. Étendre cette liste à chaque nouvelle route ajoutée à la
// racine de app/.
const RESERVED_SLUGS = new Set([
  "acces-mobile-requis", "admin", "ambassades", "api", "app", "avis",
  "carte", "cgu", "citoyen", "clock", "compte", "conditions-prestataires",
  "confidentialite", "contact", "education", "faq", "guide-prestataire",
  "inscription", "institution", "login", "mentions-legales", "menu",
  "mes-rdv", "messagerie", "mon-qr", "offres", "onboarding", "parametres",
  "politique-cookies", "profil", "rdv", "recherche", "recuperation-compte",
  "region-non-disponible", "signalement", "verify",
]);

// Génère un slug URL-friendly unique pour une institution (institutions.slug,
// NOT NULL UNIQUE + CHECK de format ^[a-z0-9]+(-[a-z0-9]+)*$, migration
// 20260805000010). Utilisé à la création et à la régénération sur
// renommage. excludeId : l'institution elle-même ne doit jamais compter
// comme une collision de son propre slug lors d'une régénération.
export async function generateInstitutionSlug(
  supabaseAdmin: SupabaseClient,
  name: string,
  excludeId?: string
): Promise<string> {
  const slugBase = slugifyBase(name) || `institution-${crypto.randomBytes(4).toString("hex")}`;
  let slug = slugBase;
  let slugSuffix = 1;
  while (true) {
    let query = supabaseAdmin.from("institutions").select("id").eq("slug", slug);
    if (excludeId) query = query.neq("id", excludeId);
    const { data: slugClash } = await query.maybeSingle();
    if (!RESERVED_SLUGS.has(slug) && !slugClash) break;
    slugSuffix++;
    slug = `${slugBase}-${slugSuffix}`;
    if (slugSuffix > 50) {
      slug = `${slugBase}-${Date.now()}`;
      break;
    }
  }
  return slug;
}

// Fiche établissement publique (chantier "lien de partage fiche
// établissement", 29/08/2026) — /institution/{id} reste la seule route
// possible (app/institution/[id]/dashboard/page.tsx, le redirect shim du
// dashboard institution, dépend déjà du nom de dossier [id] : impossible
// d'ajouter un segment [slug] séparé au même niveau sans conflit Next.js
// "different slug names for the same dynamic path"). Le même segment [id]
// accepte donc soit un uuid brut (anciens liens déjà partagés/indexés,
// toujours valides), soit la forme canonique {slug}-{id} (nouveaux liens
// de partage/QR/OpenGraph) — un uuid est toujours détectable par son
// format à la fin de la chaîne, quel que soit ce qui le précède.
const UUID_SUFFIX_REGEX = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function extraireIdDepuisParamInstitution(param: string): string | null {
  const match = param.match(UUID_SUFFIX_REGEX);
  return match ? match[1].toLowerCase() : null;
}

export function construireLienPartageInstitution(slug: string, id: string): string {
  return `${slug}-${id}`;
}
