import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { getRequiredDocuments } from "@/lib/documentsInstitution";
import { hasDisponibilites, hasHorairesReception } from "@/lib/institutionConfigProgress";
import type { TabKey } from "@/lib/institutionPermissions";

// Agrégat pour le Centre de configuration (Setup Center post-inscription,
// décision CEO 12/08/2026) — remplace l'onglet "Accueil" tant que
// l'établissement n'est pas entièrement configuré. Accessible à TOUS les
// rôles authentifiés de l'institution (aucune garde canAccessTab/can()),
// contrairement aux autres routes institution/* : la réponse n'expose que
// des booléens/compteurs agrégés (aucune PII, aucune URL de document,
// aucun contenu de champ) — même précédent que GET /api/institution/membres
// dont la branche allégée est déjà ouverte à tous les rôles.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type DocSubStatut = "recu" | "valide" | "complement_demande" | "rejete" | null;
type ConfigItem = { id: string; label: string; done: boolean; tab: TabKey; subStatut?: DocSubStatut };
type ConfigGroup = { id: string; label: string; done: boolean; blocking: boolean; items: ConfigItem[] };

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const instId = membre.institutionId;

  const [
    { data: inst, error: instErr },
    { data: responsable },
    { count: membresEquipe },
    { count: servicesActifs },
    { data: documentsRows },
  ] = await Promise.all([
    sb.from("institutions")
      .select("name,logo,description,adresse,ville,statut,statut_juridique,badge_verifie,disponibilites,horaires,services,conditions_entreprise,informations_importantes,informations_legales,equipements_etablissement")
      .eq("id", instId).maybeSingle(),
    sb.from("institution_responsables").select("prenom,nom,phone,email").eq("institution_id", instId).maybeSingle(),
    sb.from("institution_membres").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).eq("actif", true).eq("compte_principal", false),
    sb.from("paid_services").select("id", { count: "exact", head: true })
      .eq("institution_id", instId).eq("is_active", true),
    sb.from("documents_institution").select("type,statut").eq("institution_id", instId).eq("statut_actif", true),
  ]);

  if (instErr || !inst) return NextResponse.json({ error: "Institution introuvable" }, { status: 404 });

  const requiredDocs = getRequiredDocuments(inst.statut_juridique);
  const docsRows = documentsRows ?? [];
  const servicesGeneraux = Array.isArray(inst.services) && inst.services.length > 0;

  // activite_principale_code n'est pas une colonne de `institutions` — même
  // dérivation que app/api/institution/profile/route.ts (institution_activites
  // principale=true → activites.code), jamais un .select() direct dessus.
  const { data: actRows } = await sb.from("institution_activites").select("activite_id,principale").eq("institution_id", instId);
  const activitePrincipaleId = actRows?.find((a) => a.principale)?.activite_id ?? null;
  let activitePrincipaleCode: string | null = null;
  if (activitePrincipaleId) {
    const { data: actRow } = await sb.from("activites").select("code").eq("id", activitePrincipaleId).maybeSingle();
    activitePrincipaleCode = actRow?.code ?? null;
  }
  const isHotel = activitePrincipaleCode === "hotellerie";

  const groups: ConfigGroup[] = [
    {
      id: "profil",
      label: "Profil de l'organisation",
      blocking: true,
      done: false,
      items: [
        {
          id: "profil_entreprise",
          label: "Profil entreprise",
          tab: "profil-entreprise",
          done: !!inst.logo && !!inst.description && inst.description.length > 10 && !!(inst.adresse || inst.ville),
        },
        {
          id: "profil_responsable",
          label: "Profil responsable",
          tab: "profil-responsable",
          done: !!responsable?.phone && !!responsable?.email,
        },
      ],
    },
    {
      id: "equipe",
      label: "Équipe et accès",
      // Compté dans le % global affiché, mais jamais requis pour basculer
      // vers le dashboard KPI (decision CEO 12/08/2026) — une institution
      // qui travaille légitimement seule ne doit jamais rester bloquée.
      blocking: false,
      done: false,
      items: [
        { id: "membre_equipe", label: "Ajouter un membre d'équipe", tab: "equipe", done: (membresEquipe ?? 0) >= 1 },
      ],
    },
    {
      id: "services",
      label: "Services et activités",
      blocking: true,
      done: false,
      items: [
        { id: "service_actif", label: "Activer un service", tab: "services", done: (servicesActifs ?? 0) >= 1 || servicesGeneraux },
      ],
    },
    {
      id: "horaires",
      label: "Présence et horaires",
      blocking: true,
      done: false,
      // Hôtellerie (retour Bryan 21/08/2026, docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md) —
      // l'onglet Disponibilités (créneaux + durée en minutes) est masqué
      // pour ce secteur (DisponibilitesTab.tsx, isHotel), donc
      // hasDisponibilites() n'y sera jamais vrai : cette étape resterait
      // bloquée pour toujours. Équivalent réel pour un hôtel : les
      // horaires Ouvert/Fermé publics (Profil Entreprise > Horaires).
      items: isHotel
        ? [{ id: "horaires_reception", label: "Configurer les horaires d'ouverture", tab: "profil-entreprise", done: hasHorairesReception(inst.horaires) }]
        : [{ id: "disponibilites", label: "Configurer les disponibilités", tab: "disponibilites", done: hasDisponibilites(inst.disponibilites) }],
    },
    {
      id: "profil_public",
      label: "Profil public",
      blocking: true,
      done: false,
      // Hôtellerie (retour Bryan 21/08/2026) — "Informations importantes"
      // n'est plus un texte libre obligatoire pour ce secteur : le texte
      // (informations_importantes) est réduit aux règles complémentaires
      // facultatives (ConfigurationHotelTab.tsx), remplacé par la
      // checklist "Équipements de l'établissement" comme signal de
      // complétion — sinon cette étape resterait bloquée pour toujours
      // dès qu'un hôtel ne remplit que la checklist (cas normal).
      items: [
        { id: "conditions", label: "Conditions générales", tab: "conditions-informations", done: !!inst.conditions_entreprise?.trim() },
        isHotel
          ? { id: "equipements_etablissement", label: "Équipements de l'établissement", tab: "configuration-hotel", done: Array.isArray(inst.equipements_etablissement) && inst.equipements_etablissement.length > 0 }
          : { id: "infos_importantes", label: "Informations importantes", tab: "conditions-informations", done: !!inst.informations_importantes?.trim() },
        { id: "infos_legales", label: "Informations légales", tab: "conditions-informations", done: !!inst.informations_legales?.trim() },
      ],
    },
    {
      id: "verification",
      label: "Vérification et activation",
      blocking: true,
      done: false,
      items: requiredDocs.map((doc) => {
        const row = docsRows.find((r) => r.type === doc.type);
        // Une institution déjà validée a nécessairement son dossier réglé —
        // même raccourci que DocumentsTab.tsx (institution_statut ===
        // "validee" y affiche directement l'écran "documents validés" sans
        // revérifier les lignes individuelles). Sans ce même raccourci ici,
        // une institution validée avant l'existence de ce système d'upload
        // (documents_institution vide pour elle) reste bloquée pour
        // toujours sur "Vérification" dans le Setup Center — bug réel
        // signalé par Bryan le 15/08/2026 sur un compte déjà vérifié de
        // longue date (Ecobank), alors que l'onglet Documents lui-même
        // affiche déjà tout comme réglé.
        const done = inst.statut === "validee" || row?.statut === "recu" || row?.statut === "valide";
        return {
          id: doc.type,
          label: doc.label,
          tab: "documents" as const,
          done,
          subStatut: (row?.statut ?? null) as DocSubStatut,
        };
      }),
    },
  ];

  for (const g of groups) g.done = g.items.every((i) => i.done);

  const pct = Math.round((groups.filter((g) => g.done).length / groups.length) * 100);
  const blockingGroupsDone = groups.filter((g) => g.blocking).every((g) => g.done);
  const complete = blockingGroupsDone && inst.statut === "validee";

  return NextResponse.json({
    groups,
    pct,
    complete,
    institutionStatut: inst.statut,
    badgeVerifie: inst.badge_verifie,
    orgName: inst.name,
    responsable: responsable ? { prenom: responsable.prenom, nom: responsable.nom } : null,
    counts: { servicesActifs: servicesActifs ?? 0, membresEquipe: membresEquipe ?? 0 },
  });
}
