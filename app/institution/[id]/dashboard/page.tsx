import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { isTabKey } from "@/lib/institutionPermissions";

// Ancien point d'entrée du dashboard institution (avant le chantier "URLs
// dynamiques institution", 28/08/2026) — devenu un simple redirect shim
// permanent vers /{slug}/{id}/{screen}. Ne pas supprimer : les liens de
// notifications déjà envoyés (communaute-demandes, partenariats, etc.),
// les favoris/bookmarks existants et tout lien externe déjà partagé
// pointent encore vers cette URL et doivent continuer de fonctionner
// indéfiniment.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export default async function LegacyInstitutionDashboardRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const { data: inst, error } = await supabaseAdmin
    .from("institutions")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  // Piège CLAUDE.md (/pieges-techniques-connus) : ne jamais tester !data
  // sans avoir destructuré `error` avant, sinon une vraie erreur serveur
  // (schema cache PostgREST après migration, connexion DB...) se fait
  // passer pour un 404 générique, invisible au diagnostic.
  if (error) {
    console.error("[LEGACY DASHBOARD REDIRECT] Erreur lecture institution:", error.message);
  }
  if (!inst) notFound();

  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const screen = rawTab && rawTab !== "accueil" && isTabKey(rawTab) ? rawTab : "dashboard";

  redirect(`/${inst.slug}/${id}/${screen}`);
}
