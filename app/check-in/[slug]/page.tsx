import { supabase } from "@/lib/supabase";
import { CheckInApp } from "./CheckInApp";

// Le slug ne sert qu'à afficher le nom/logo/identifiant de l'établissement
// (y compris dans la fiche d'aide) — jamais transmis comme identifiant de
// sécurité : l'institution réelle d'un agent est toujours dérivée côté
// serveur de sa session Check-in (institution_membres.institution_id),
// jamais de l'URL (même principe que GAP-07-01, ne jamais faire confiance
// à un identifiant fourni par le client pour une décision d'autorisation).
export default async function CheckInPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ badge?: string }> }) {
  const { slug } = await params;
  const { badge } = await searchParams;
  const { data: institution } = await supabase
    .from("institutions")
    .select("name, logo")
    .eq("slug", slug)
    .maybeSingle();

  return (
    <CheckInApp
      institutionNom={institution?.name ?? "Yelen"}
      institutionLogo={institution?.logo ?? null}
      institutionSlug={slug}
      badgeTokenInitial={badge ?? null}
    />
  );
}
