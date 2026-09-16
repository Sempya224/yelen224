import { supabase } from "@/lib/supabase";

// Cibles "mentionnables" dans un post Yelen Community (09/09/2026) — un
// citoyen ou une entreprise déjà présent dans Community (a déjà publié),
// jamais l'annuaire complet des utilisateurs Yelen (même principe que la
// recherche Community, voir ChercherCommunauteOverlay.tsx). Réutilisé par
// le composeur (autocomplétion "@") et par l'ouverture d'une mention déjà
// publiée (fallback si l'API professionnels échoue).
export type CibleMentionnable = { type: "citoyen" | "institution"; id: string; nom: string; photo: string | null; sousTitre: string | null };

export async function chargerCiblesMentionnables(): Promise<CibleMentionnable[]> {
  const out: CibleMentionnable[] = [];
  const [{ data: { session } }, { data: postsData }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.from("posts").select("institution_auteur_id").eq("statut", "publiee").eq("auteur_type", "institution").limit(300),
  ]);

  if (session?.access_token) {
    const res = await fetch("/api/citoyen/communaute/professionnels", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const j = await res.json().catch(() => null);
    if (res.ok && Array.isArray(j?.professionnels)) {
      for (const p of j.professionnels as { id: string; nom: string; photo: string | null; profession: string | null }[]) {
        out.push({ type: "citoyen", id: p.id, nom: p.nom, photo: p.photo, sousTitre: p.profession });
      }
    }
  }

  const instIds = [...new Set((postsData ?? []).map(p => p.institution_auteur_id).filter((x): x is string => !!x))];
  if (instIds.length > 0) {
    const { data: instData } = await supabase.from("institutions").select("id, name, logo, category").in("id", instIds);
    for (const inst of (instData ?? []) as { id: string; name: string; logo: string | null; category: string | null }[]) {
      out.push({ type: "institution", id: inst.id, nom: inst.name, photo: inst.logo, sousTitre: inst.category });
    }
  }

  return out;
}
