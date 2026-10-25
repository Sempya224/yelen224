import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { lireFiltresJournal, masquerDonneesTechniques, rechercheRessembleAUneIp, requeteJournalFiltree } from "@/lib/journalRequete";

// Contourne RLS via service role — journal_activite n'a aucune policy
// publique (migration 20260715000001), accès exclusivement via cette
// route, réservée aux rôles ayant accès au Journal (admin, superviseur,
// dirigeant en lecture seule — cf. lib/institutionPermissions.ts).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const COLONNES = "id,audit_id,membre_id,membre_nom,action,categorie,niveau,cible_table,cible_id,details,ancienne_valeur,nouvelle_valeur,ip,user_agent,navigateur,os,plateforme,created_at";

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filtres = lireFiltresJournal(searchParams);

  // Onglet "Administration & accès" (profil) — un membre sans journal.read
  // (agent, comptable) peut quand même lire SON PROPRE historique : ce
  // n'est pas la vue Journal d'équipe, juste son propre compte. On ignore
  // tout membre_id fourni par le client et on force le sien — aucune fuite
  // possible vers l'historique d'un collègue.
  if (!can(membre.role, "journal.read")) {
    filtres.membreId = membre.membreId;
  }
  // IP et user-agent bruts réservés à admin/superviseur : masqués pour les
  // autres rôles, et recherche par fragment d'IP refusée (recherche_texte
  // indexe l'IP — sinon l'IP se retrouverait par essais).
  const voirIp = can(membre.role, "journal.voir_ip");
  if (!voirIp && rechercheRessembleAUneIp(filtres.q)) {
    return NextResponse.json({ error: "La recherche par adresse IP est réservée à l'administration." }, { status: 400 });
  }
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

  const [{ query: dataQuery }, { query: countQuery }] = await Promise.all([
    requeteJournalFiltree(sb, membre.institutionId, filtres, COLONNES),
    requeteJournalFiltree(sb, membre.institutionId, filtres, "id", { count: "exact", head: true }),
  ]);

  const [{ data, error }, { count }] = await Promise.all([
    dataQuery.order("created_at", { ascending: false }).range(offset, offset + limit - 1),
    countQuery,
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lignes = (data ?? []) as unknown as Parameters<typeof masquerDonneesTechniques>[0];
  return NextResponse.json({ entrees: voirIp ? lignes : masquerDonneesTechniques(lignes), total: count ?? 0, ip_masquee: !voirIp });
}
