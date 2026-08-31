import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SECTEUR_LABELS } from "@/lib/institutionTaxonomy";
import { APP_URL } from "@/lib/config";
import { construireLienPartageInstitution, extraireIdDepuisParamInstitution } from "@/lib/institutionSlug";
import InstitutionPublicClient from "./InstitutionPublicClient";

type MetaRow = {
  slug: string;
  name: string;
  secteur: string | null;
  category: string | null;
  description: string | null;
  ville: string | null;
  statut: string | null;
};

async function getInstitutionMeta(id: string): Promise<MetaRow | null> {
  const { data } = await supabase
    .from("institutions")
    .select("slug,name,secteur,category,description,ville,statut")
    .eq("id", id)
    .eq("statut", "validee")
    .maybeSingle();
  return data ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id: rawParam } = await params;
  const id = extraireIdDepuisParamInstitution(rawParam);
  const inst = id ? await getInstitutionMeta(id) : null;

  if (!inst) {
    return {
      title: "Institution — Yelen224",
      description: "Prenez rendez-vous avec des institutions et prestataires en Guinée sur Yelen224.",
    };
  }

  const secteurLabel = inst.secteur ? SECTEUR_LABELS[inst.secteur] : (inst.category ?? "");
  const title = `${inst.name} — Yelen224`;
  const description = inst.description?.trim()
    ? inst.description.trim().slice(0, 160)
    : `${secteurLabel ? secteurLabel + " · " : ""}${inst.ville ?? ""} — Prenez rendez-vous en un clic sur Yelen224.`.trim();
  const url = `${APP_URL}/institution/${construireLienPartageInstitution(inst.slug, id!)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Yelen224",
      type: "profile",
      locale: "fr_FR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function InstitutionPage(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const { id: rawParam } = await params;
  const id = extraireIdDepuisParamInstitution(rawParam);
  // Param invalide (aucun uuid détectable) : laisser InstitutionPublicClient
  // gérer l'état "introuvable" comme avant ce chantier, jamais un redirect
  // vers on ne sait quoi.
  if (!id) return <InstitutionPublicClient />;

  // Lien de partage périmé (institution renommée depuis, slug régénéré par
  // PATCH /api/institution/profile) : l'id reste seul canonique, on
  // corrige l'URL vers le slug à jour — même discipline que le dashboard
  // institution, aucun ancien lien/QR déjà partagé ne se casse jamais. Un
  // uuid brut (lien pré-existant à ce chantier) est aussi canonicalisé ici
  // vers la forme {slug}-{id}. Query string préservée (?source=qr alimente
  // le compteur de provenance QR lu par InstitutionPublicClient).
  const { data: canon } = await supabase.from("institutions").select("slug").eq("id", id).maybeSingle();
  if (canon?.slug) {
    const canonique = construireLienPartageInstitution(canon.slug, id);
    if (rawParam !== canonique) {
      const sp = await searchParams;
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(sp)) {
        if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
        else if (v !== undefined) qs.append(k, v);
      }
      const qsString = qs.toString();
      redirect(`/institution/${canonique}${qsString ? `?${qsString}` : ""}`);
    }
  }

  // Compteur réel de vues (Lot G Search, 28/08/2026, section "Populaire")
  // — même mirroring que offre_vues (app/offres/[id]/page.tsx), erreur
  // avalée volontairement, ne doit jamais empêcher l'affichage de la page.
  // Pas de garde sur l'existence de l'institution (contrairement à
  // offres) : la FK institution_id ON DELETE CASCADE fait déjà tout le
  // travail de rejet propre si l'id n'existe pas.
  await supabase.from("institution_vues").insert({ institution_id: id, citoyen_id: null }).then(() => {}, () => {});
  return <InstitutionPublicClient />;
}
