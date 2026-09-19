"use client";

// Pièces partagées entre app/recherche/page.tsx et RechercheOverlay.tsx
// (chantier Search Overlay, décision CEO 08/08/2026) — extraites ici pour
// éviter un import circulaire (l'overlay est rendu par page.tsx, donc ne
// peut pas importer ses types/composants directement depuis page.tsx) et
// pour ne pas dupliquer ces briques déjà réelles/vérifiées ailleurs dans
// le produit. Contenu déplacé tel quel depuis page.tsx, comportement
// inchangé.
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { T } from "@/lib/theme";
import { parseHoraires, isOuvertNow } from "@/lib/horaires";
import { ACTIVITE_CATEGORIE_COLORS, ACTIVITE_CATEGORIE_SHORT, ActiviteCategorieIcon } from "@/lib/activiteVisuels";
import { deriverCapacites, deciderCta, type CtaAction } from "@/lib/prestataireCapacites";
import { urlExterneSure } from "@/lib/urlValidation";

export type Institution = {
  id: string; name: string; category: string; secteur: string | null; ville: string; quartier: string;
  moyenne_avis: number; nb_avis: number; logo: string | null; banniere?: string | null;
  badge_verifie: boolean; description: string | null; statut: string;
  adresse: string | null; latitude: number; longitude: number;
  phone: string | null; disponibilites: unknown; horaires?: unknown; created_at?: string;
  derniere_annonce?: { titre: string; type: string; contenu: string } | null;
  // Chantier Taxonomie des activités — remplace `category` (legacy, plus
  // jamais écrite depuis la Phase 2, voir CentreConfigurationTab.tsx et
  // docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md §14/§15) comme source
  // du filtre/badge de catégorie côté recherche citoyenne. FK brute vers
  // activite_categories.id — jamais résolue par embed PostgREST (piège
  // documenté, CLAUDE.md), résolue via `categorieById` (fetch séparé,
  // voir categorieVisuel() ci-dessous).
  activite_categorie_id?: string | null;
  // Chantier CTA V1, extension "Option B" (retour Bryan 23/08/2026 — voir
  // docs/ui/YELEN_PRESTATAIRE_CTA_V1_SPEC.md §12/§13, jusqu'ici limité à la
  // fiche complète, incohérence assumée temporairement) : mêmes champs bruts
  // que InstitutionPublicClient.tsx pour appeler lib/prestataireCapacites.ts,
  // seule source de vérité du CTA — jamais une 2e logique inventée ici.
  services?: unknown[] | null;
  website?: string | null;
  whatsapp?: string | null;
  paid_services_actifs?: number;
  // Chantier Search "types d'identité" (28/08/2026, Lot A) — donnée déjà
  // réelle et obligatoire à l'inscription (register/route.ts), jamais
  // ajoutée pour l'occasion. Valeurs : "public" | "prive_formel" |
  // "liberal" | "individuel_informel" (lib/institutionTaxonomy.tsx).
  statut_juridique?: string | null;
};

export type CategorieOption = { id: string; code: string; label: string };
export type CategorieById = Record<string, { code: string; label: string }>;

// Types d'identité Search (Lot A, 28/08/2026, décision CEO) — dérivés de
// institutions.statut_juridique, jamais une 4e valeur inventée : "liberal"
// et "individuel_informel" fusionnés en "profession" (le brief Search ne
// demande que 3 types), repli sur "entreprise" (le plus générique des 3)
// pour toute institution sans statut_juridique renseigné (legacy
// pré-migration onboarding_prestataire) — jamais un badge de type affiché
// dans ce cas, juste un rendu de carte par défaut.
export type TypeIdentite = "institution" | "entreprise" | "profession";
export function typeIdentite(inst: Pick<Institution, "statut_juridique">): TypeIdentite {
  if (inst.statut_juridique === "public") return "institution";
  if (inst.statut_juridique === "liberal" || inst.statut_juridique === "individuel_informel") return "profession";
  return "entreprise";
}

// Résout la catégorie réelle d'une institution (nouvelle taxonomie) vers
// son rendu visuel — jamais un badge "Autre" fabriqué : une institution
// sans activite_categorie_id renseignée s'affiche "Non classée" plutôt que
// de mentir sur sa catégorie réelle.
export function categorieVisuel(inst: Pick<Institution, "activite_categorie_id">, categorieById?: CategorieById): { code: string | null; short: string; color: string } {
  const code = inst.activite_categorie_id ? categorieById?.[inst.activite_categorie_id]?.code ?? null : null;
  if (!code) return { code: null, short: "Non classée", color: "#9C9CA8" };
  return { code, short: ACTIVITE_CATEGORIE_SHORT[code] ?? "Non classée", color: ACTIVITE_CATEGORIE_COLORS[code] ?? "#9C9CA8" };
}

// CTA de carte (Grille/Liste/Carte) — réutilise exactement le moteur de
// décision de la fiche complète (lib/prestataireCapacites.ts), jamais
// l'ancien `libelleAction`/`CATEGORIES_RESERVATION` (choisissait un
// libellé "Réserver"/"Prendre RDV" par catégorie, sans jamais vérifier de
// vraie capacité — cause du bug signalé : "RDV" affiché pour tous les
// profils). `null` si aucune capacité réelle (booking/site/WhatsApp/
// téléphone) — le composant appelant retombe alors sur un bouton neutre
// "Voir la fiche" (décision Bryan 23/08/2026, cartes compactes : jamais
// un CTA vide qui donnerait l'impression d'une carte cassée).
export function ctaPourInstitution(inst: Institution): { action: CtaAction; label: string } | null {
  const capacites = deriverCapacites({
    services: inst.services ?? [],
    paidServicesActifsCount: inst.paid_services_actifs ?? 0,
    disponibilites: inst.disponibilites,
    website: inst.website,
    whatsapp: inst.whatsapp,
    phone: inst.phone,
  });
  return deciderCta(capacites).principal;
}

// Même mapping action→destination que InstitutionPublicClient.tsx::ctaHref
// — jamais une 2e logique de résolution d'URL.
export function ctaHrefInstitution(inst: Institution, action: CtaAction): string {
  switch (action) {
    case "rdv": return `/rdv/${inst.id}`;
    case "website": return urlExterneSure(inst.website) ?? `/institution/${inst.id}`;
    case "whatsapp": return inst.whatsapp ? `https://wa.me/${inst.whatsapp.replace(/\D/g, "")}` : `/institution/${inst.id}`;
    case "phone": return `tel:${inst.phone}`;
  }
}

export function CtaActionIcon({ action, size = 11 }: { action: CtaAction; size?: number }) {
  if (action === "website") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
  if (action === "whatsapp") return <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>;
  if (action === "phone") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17v-.08z"/></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}

// Même bleu que le sceau MetaVerifiedBadge de la fiche établissement
// (InstitutionPublicClient.tsx, #0095F6, façon Meta/Instagram).
export const VERIFIE_BLEU = "#0095F6";

export function MetaVerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill={VERIFIE_BLEU} d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"/>
      <path fill="#fff" d="M9.9 16.2 6 12.3l1.4-1.4 2.5 2.5 6.7-6.7 1.4 1.4z"/>
    </svg>
  );
}

export function InstitutionLogo({ inst, size = 64, categorieById, circular }: { inst: Institution; size?: number; categorieById?: CategorieById; circular?: boolean }) {
  const [err, setErr] = useState(false);
  const meta = categorieVisuel(inst, categorieById);
  const initials = inst.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  // Avatar rond pour le type "profession" (Lot A, 28/08/2026) — même
  // convention que les avatars citoyen déjà ailleurs dans le produit,
  // distingue visuellement un professionnel individuel d'une institution/
  // entreprise (logo carré arrondi, inchangé pour ces deux types).
  const r = circular ? "50%" : Math.round(size * 0.22) + "px";
  if (inst.logo && !err) {
    return (
      <div style={{ width: size, height: size, position: "relative", borderRadius: r, overflow: "hidden", flexShrink: 0, border: "1px solid rgba(245,166,35,0.2)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <Image src={inst.logo} alt={inst.name} fill sizes={`${size}px`} onError={() => setErr(true)} style={{ objectFit: "cover" }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: r, flexShrink: 0, background: `${meta.color}1a`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", border: `1px solid ${meta.color}30` }}>
      {meta.code ? (
        <ActiviteCategorieIcon code={meta.code} color={meta.color} size={Math.round(size * 0.38)}/>
      ) : (
        <svg width={size * 0.38} height={size * 0.38} viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/></svg>
      )}
      <span style={{ color: meta.color, fontSize: size * 0.15 + "px", fontWeight: "900" }}>{initials || meta.short.slice(0,3)}</span>
    </div>
  );
}

// Aucun avis (count===0) : jamais une rangée d'étoiles vides + un tiret
// esseulé (retour Bryan 06/08/2026 — "amateur, ne reflète pas Yelen") ni
// un faux 0/5. Note chiffrée et nombre d'avis en texte foncé standard du
// thème (retour Bryan 07/08/2026, concerne les 3 onglets) — le gold reste
// réservé à l'étoile elle-même.
export function Stars({ note, count, C }: { note: number; count: number; C: typeof T["dark"] }) {
  if (count === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9C9CA8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.7 7.1-.7z"/></svg>
        <span style={{ color: "#9C9CA8", fontSize: "10px", fontWeight: "700" }}>Nouveau sur Yelen</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      {[1,2,3,4,5].map(s => (
        <svg key={s} width="10" height="10" viewBox="0 0 20 20" fill={s <= Math.round(note) ? "#F5A623" : "rgba(245,166,35,0.15)"}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/>
        </svg>
      ))}
      <span style={{ color: C.text, fontSize: "10px", fontWeight: "700", marginLeft: "3px" }}>{note.toFixed(1)}</span>
      <span style={{ color: C.text, fontSize: "10px", opacity: 0.6 }}>({count})</span>
    </div>
  );
}

// Distance réelle (haversine) entre le citoyen et une institution — jamais
// affichée sans une vraie position GPS de l'appareil.
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

// Hiérarchie de tri "Pertinence" (Lot B, 28/08/2026, brief Search §12) —
// combinaison déterministe de signaux réels, même philosophie zéro-LLM que
// lib/reputationScore.ts. Contrainte explicite du brief : le badge bleu ne
// doit jamais être le seul facteur déterminant — son poids est plafonné
// (10 pts sur un score qui peut monter à ~90+), la correspondance textuelle
// domine dès qu'une recherche est active ("la pertinence de la recherche
// reste prioritaire"). La proximité n'est calculée que si citoyenGeoloc ET
// les coordonnées de l'institution existent — aucune institution n'en
// renseigne à ce jour (CLAUDE.md /backlog-produit), donc ce terme reste
// inerte en pratique tant que ça n'a pas changé, jamais une distance
// inventée en repli.
export function scorePertinence(inst: Institution, opts?: { search?: string; citoyenGeoloc?: { lat: number; lng: number } | null }): number {
  let score = 0;
  const search = (opts?.search || "").trim().toLowerCase();
  if (search) {
    const nom = (inst.name || "").toLowerCase();
    if (nom === search) score += 40;
    else if (nom.startsWith(search)) score += 30;
    else if (nom.includes(search)) score += 18;
  }
  if (inst.nb_avis > 0) {
    score += (inst.moyenne_avis / 5) * 20;
    score += Math.min(Math.log10(inst.nb_avis + 1) * 4, 10);
  }
  if (inst.badge_verifie) score += 10;
  const hasDispo = inst.disponibilites && (Array.isArray(inst.disponibilites) ? (inst.disponibilites as unknown[]).length > 0 : true);
  if (hasDispo) score += 8;
  if (inst.created_at) {
    const ageJours = (Date.now() - new Date(inst.created_at).getTime()) / 86400000;
    if (ageJours <= 30) score += 5;
  }
  if (opts?.citoyenGeoloc && inst.latitude && inst.longitude) {
    const km = distanceKm(opts.citoyenGeoloc.lat, opts.citoyenGeoloc.lng, inst.latitude, inst.longitude);
    score += Math.max(0, 10 - km);
  }
  return score;
}

// Localisation en langage naturel (Lot D, 28/08/2026, brief Search §3/§11)
// — reconnaît une vraie préfecture guinéenne (lib/villes.ts, 33 valeurs
// fixes) en fin de requête ("Restaurants à Conakry", "Hôtel à Kankan"),
// jamais une ville inventée. Quartier volontairement hors périmètre :
// institutions.quartier est un champ libre sans liste canonique — une
// correspondance floue y produirait des faux positifs, jamais un
// heuristique approximatif ici (même discipline "zéro donnée inventée").
export function parseLocalisationRequete(query: string, villes: readonly string[]): { motsCles: string; ville: string | null } {
  const q = query.trim();
  if (!q) return { motsCles: "", ville: null };
  const normalise = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
  const qNorm = normalise(q);
  for (const ville of villes) {
    const villeNorm = normalise(ville);
    if (qNorm === villeNorm) return { motsCles: "", ville };
    const suffixe = ` a ${villeNorm}`;
    if (qNorm.endsWith(suffixe)) {
      const motsCles = q.slice(0, q.length - suffixe.length).trim();
      return { motsCles, ville };
    }
  }
  return { motsCles: q, ville: null };
}

export const ICON_COEUR = (rempli: boolean, couleur: string, t2: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={rempli ? couleur : "none"} stroke={rempli ? couleur : t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
);

// Repère carte devant la ville — même icône que CardGrille (déjà en place
// là-bas), généralisée ici (retour Bryan 28/08/2026) pour être cohérente
// sur toutes les cartes qui affichent une ville (CarteInstitutionCard,
// LignePopulaire), pas seulement la petite grille.
export const ICON_PIN = (couleur: string, size = 9) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
);

// Carte institution DoorDash — cœur du sheet de la Vue Carte (onglet 3) et
// réutilisée telle quelle pour les résultats "Établissements"/
// "Recommandations" du Search Overlay. Contenu 100% réel : photo =
// institutions.banniere si présente, horaires réels (lib/horaires.ts),
// distance réelle si la géoloc citoyen est disponible, favori réel.
export function CarteInstitutionCard({ inst, C, t2, citoyenGeoloc, estFavori, onToggleFavori, onSelect, categorieById, richDetails, hideCover }: {
  inst: Institution; C: typeof T["dark"]; t2: string;
  citoyenGeoloc: { lat: number; lng: number } | null;
  estFavori: boolean; onToggleFavori: (e: React.MouseEvent) => void; onSelect: () => void;
  categorieById?: CategorieById;
  // Onglet Carte uniquement (décision Bryan 21/08/2026) — le Search Overlay
  // (RechercheOverlay.tsx) n'envoie jamais cette prop, donc son rendu reste
  // strictement identique à avant. Variété façon Yelp basée sur les vraies
  // données déjà chargées (jamais rien d'inventé ni de tiré au sort) : une
  // institution sans badge/description garde exactement la carte actuelle.
  richDetails?: boolean;
  // "Vos favoris" uniquement (décision Bryan 21/08/2026) — masque la photo
  // de couverture pour un rendu plus compact en défilement horizontal.
  hideCover?: boolean;
}) {
  const meta = categorieVisuel(inst, categorieById);
  const idType = typeIdentite(inst);
  const horaires = useMemo(() => parseHoraires(inst.horaires), [inst.horaires]);
  const { ouvert, horaire } = useMemo(() => isOuvertNow(horaires), [horaires]);
  const distance = citoyenGeoloc ? distanceKm(citoyenGeoloc.lat, citoyenGeoloc.lng, inst.latitude, inst.longitude) : null;
  const cta = ctaPourInstitution(inst);

  return (
    <div onClick={onSelect} className="tap" style={{ cursor: "pointer", background: C.cardBg, borderRadius: "18px", overflow: "hidden" }}>
      {inst.banniere && !hideCover && (
        <div style={{ width: "100%", height: "116px", position: "relative", overflow: "hidden", background: C.sectionAlt }}>
          <Image src={inst.banniere} alt="" fill sizes="(min-width: 640px) 400px, 92vw" style={{ objectFit: "cover" }}/>
        </div>
      )}
      <div style={{ padding: "13px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <InstitutionLogo inst={inst} size={44} categorieById={categorieById} circular={idType === "profession"}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ color: C.text, fontSize: "13.5px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</span>
              {inst.badge_verifie && <MetaVerifiedBadge size={13}/>}
            </div>
            {idType === "profession" ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", flexWrap: "wrap" }}>
                <span style={{ background: `${meta.color}1a`, color: meta.color, fontSize: "9.5px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px" }}>{meta.short}</span>
                <span style={{ display: "flex", alignItems: "center", gap: "3px", color: t2, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ICON_PIN(t2)}{inst.ville || "Guinée"}{inst.quartier ? `, ${inst.quartier}` : ""}</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", color: t2, fontSize: "11px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.short} · {ICON_PIN(t2)}{inst.ville || "Guinée"}{inst.quartier ? `, ${inst.quartier}` : ""}</div>
            )}
          </div>
          <button onClick={onToggleFavori} aria-label={estFavori ? "Retirer des favoris" : "Ajouter aux favoris"} className="tap" style={{ background: "none", border: "none", cursor: "pointer", padding: "3px", flexShrink: 0 }}>
            {ICON_COEUR(estFavori, "#F5A623", t2)}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
          <Stars note={inst.moyenne_avis || 0} count={inst.nb_avis || 0} C={C}/>
          {distance !== null && <span style={{ color: t2, fontSize: "11px" }}>· {formatDistance(distance)}</span>}
        </div>

        {richDetails && inst.badge_verifie && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "6px" }}>
            <MetaVerifiedBadge size={12}/>
            <span style={{ color: VERIFIE_BLEU, fontSize: "11px", fontWeight: "700" }}>Identité vérifiée</span>
          </div>
        )}

        {horaires.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "6px" }}>
            <span style={{ color: ouvert ? "#00966F" : "#D62839", fontSize: "11px", fontWeight: "800" }}>{ouvert ? "Ouvert" : "Fermé"}</span>
            {ouvert && horaire?.fin && <span style={{ color: t2, fontSize: "11px" }}>· Ferme à {horaire.fin}</span>}
          </div>
        )}

        {richDetails && inst.description && (
          <div style={{ color: t2, fontSize: "11px", lineHeight: 1.5, marginTop: "8px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{inst.description}</div>
        )}

        <div style={{ display: "flex", gap: "6px", marginTop: "11px" }}>
          {cta ? (
            <a href={ctaHrefInstitution(inst, cta.action)} target={cta.action === "rdv" || cta.action === "phone" ? undefined : "_blank"} rel={cta.action === "rdv" || cta.action === "phone" ? undefined : "noreferrer"} onClick={e => e.stopPropagation()} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", textDecoration: "none", textAlign: "center", padding: "9px", background: "#F5A623", borderRadius: "10px", color: "#080812", fontSize: "11.5px", fontWeight: "900" }}>
              <CtaActionIcon action={cta.action} size={12}/> {cta.label}
            </a>
          ) : (
            <a href={`/institution/${inst.id}`} onClick={e => e.stopPropagation()} style={{ flex: 1, textDecoration: "none", textAlign: "center", padding: "9px", background: C.sectionAlt, border: `1px solid ${C.borderCard}`, borderRadius: "10px", color: C.text, fontSize: "11.5px", fontWeight: "900" }}>Voir la fiche</a>
          )}
          {inst.phone && (
            <a href={`tel:${inst.phone}`} onClick={e => e.stopPropagation()} aria-label="Appeler" style={{ width: "38px", height: "38px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.sectionAlt, border: `1px solid ${C.borderCard}`, borderRadius: "10px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </a>
          )}
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${inst.latitude},${inst.longitude}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} aria-label="Itinéraire" style={{ width: "38px", height: "38px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.sectionAlt, border: `1px solid ${C.borderCard}`, borderRadius: "10px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          </a>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet de la Vue Carte — déplacé depuis RechercheInner.tsx (retour Bryan
// 22/08/2026, "on ne peut pas avoir 2 expériences") : ce moteur (sections,
// glissement 3 paliers, fiche flottante) doit être la SEULE implémentation,
// réutilisée aussi bien par /recherche que par le widget carte de l'accueil
// citoyen (components/CarteYelenAccueil.tsx) — jamais une deuxième version
// dupliquée. Comportement strictement inchangé par ce déplacement.
// ═══════════════════════════════════════════════════════════════════════════

// Section groupée du sheet en état "Explorer" (jamais la même liste
// qu'en recherche) — invisible si vide, même convention que Rail (onglet 1).
export function SheetSection({ titre, sousTitre, items, C, t2, citoyenGeoloc, favorisIdsSet, onToggleFavori, onSelect, categorieById, richDetails, horizontal, hideCover }: {
  titre: string; sousTitre?: string; items: Institution[];
  C: typeof T["dark"]; t2: string;
  citoyenGeoloc: { lat: number; lng: number } | null; favorisIdsSet: Set<string>;
  onToggleFavori: (inst: Institution) => void; onSelect: (id: string) => void;
  categorieById?: CategorieById;
  richDetails?: boolean;
  // "Vos favoris" uniquement (décision Bryan 21/08/2026) — carrousel
  // horizontal (comme Rail, onglet 1) plutôt que la pile verticale par
  // défaut ; se comporte comme une simple rangée sans défilement tant
  // qu'il n'y a pas assez de favoris pour déborder.
  horizontal?: boolean;
  hideCover?: boolean;
}) {
  if (items.length === 0) return null;
  const card = (inst: Institution) => (
    <CarteInstitutionCard key={inst.id} inst={inst} C={C} t2={t2} citoyenGeoloc={citoyenGeoloc} estFavori={favorisIdsSet.has(inst.id)} onToggleFavori={e => { e.stopPropagation(); onToggleFavori(inst); }} onSelect={() => onSelect(inst.id)} categorieById={categorieById} richDetails={richDetails} hideCover={hideCover}/>
  );
  return (
    <div>
      <div style={{ color: C.text, fontSize: "13.5px", fontWeight: "800" }}>{titre}</div>
      {sousTitre && <div style={{ color: t2, fontSize: "10.5px", marginTop: "1px" }}>{sousTitre}</div>}
      {horizontal ? (
        <div className="no-scroll" style={{ overflowX: "auto", marginTop: "10px" }}>
          <div style={{ display: "flex", gap: "10px", width: "max-content" }}>
            {items.map(inst => <div key={inst.id} style={{ width: "260px", flexShrink: 0 }}>{card(inst)}</div>)}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
          {items.map(inst => card(inst))}
        </div>
      )}
    </div>
  );
}

export const SHEET_MINI_H = 112; // 3e palier (07/08/2026, retour Bryan) — poignée + 1 ligne compacte, dévoile la carte au maximum
export const SHEET_PEEK_H = 322;
export const SHEET_TOP_CLEARANCE = 64; // laisse un peu de carte visible en haut une fois développé, comme DoorDash

// Palier du sheet : 0 = mini (poignée + 1 ligne), 1 = peek (fiche complète,
// comme avant), 2 = développé (sections personnalisées). Trois paliers,
// comme DoorDash (retour Bryan 07/08/2026 — capture DoorDash à l'appui,
// notre sheet n'en avait que deux).
export type SheetSnap = 0 | 1 | 2;

// Ligne compacte du palier mini — jamais la fiche complète (pas de photo/
// CTA ici, juste de quoi identifier ce qui est sélectionné pendant que la
// carte reste visible à ~90% de l'écran). Statut ouvert/fermé réel
// (lib/horaires.ts), note réelle si des avis existent — rien d'inventé.
export function SheetMiniLine({ inst, C, t2 }: { inst: Institution; C: typeof T["dark"]; t2: string }) {
  const horaires = useMemo(() => parseHoraires(inst.horaires), [inst.horaires]);
  const { ouvert } = useMemo(() => isOuvertNow(horaires), [horaires]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: ouvert ? "#00C896" : "#9C9CA8", flexShrink: 0 }}/>
      <div style={{ color: C.text, fontSize: "12.5px", fontWeight: "800", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</div>
      {!!inst.nb_avis && (
        <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
          <svg width="9" height="9" viewBox="0 0 20 20" fill="#F5A623"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/></svg>
          <span style={{ color: t2, fontSize: "11px", fontWeight: "700" }}>{(inst.moyenne_avis || 0).toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

// Sheet DoorDash — cœur de la Vue Carte (décision CEO 06/08/2026, référence
// captures fournies, pas une copie littérale). Glissement écrit à la main
// (pointer events), même mécanique que components/MonAssistant.tsx (seul
// bandeau tirable déjà établi dans ce projet) : hauteur pilotée par ref
// impérative pendant le drag (jamais de re-render à chaque pixel), snap au
// relâchement vers le palier le plus proche parmi les 3.
//
// Contenu structuré selon l'action réelle (jamais la même liste) :
// - Recherche/filtre actif → liste plate des résultats réels filtrés
//   (paliers peek et développé — la notion de "fiche sélectionnée" ne
//   s'applique pas en recherche).
// - Mini → une ligne compacte (nom + statut + note) de la sélection, ou
//   un compteur de résultats si rien n'est sélectionné.
// - Peek → la fiche sélectionnée sur la carte (ou le premier résultat par
//   défaut).
// - Développé → sections personnalisées réelles (mêmes signaux que les
//   rails de l'onglet 1 : tendances RDV, favoris, ville, vérifiés, mieux
//   notés, nouveautés), jamais une liste plate identique à l'état
//   recherche.
export function CarteSheet({
  rechercheActive, search, selectedInst, filteredInstitutions,
  sheetRecommandees, secteurTopLabel, sheetFavoris, sheetPresDeChezVous, citoyenVille,
  sheetVerifiees, sheetMieuxNotees, sheetNouvelles, sansAucuneInstitution,
  citoyenGeoloc, favorisIdsSet, onToggleFavori, onSelectInstitution, onDeselectInstitution,
  mapAreaHeight, C, t2, isDark, categorieById,
}: {
  rechercheActive: boolean; search: string; selectedInst: Institution | null; filteredInstitutions: Institution[];
  sheetRecommandees: Institution[]; secteurTopLabel: string | null; sheetFavoris: Institution[];
  sheetPresDeChezVous: Institution[]; citoyenVille: string | null;
  sheetVerifiees: Institution[]; sheetMieuxNotees: Institution[]; sheetNouvelles: Institution[];
  sansAucuneInstitution: boolean;
  citoyenGeoloc: { lat: number; lng: number } | null; favorisIdsSet: Set<string>;
  onToggleFavori: (inst: Institution) => void; onSelectInstitution: (id: string) => void;
  // Fiche flottante déclenchée par un tap sur un repère de la carte (retour
  // Bryan 21/08/2026, référence Yelp) — appelé par le ✕ de cette fiche.
  onDeselectInstitution: () => void;
  mapAreaHeight: number; C: typeof T["dark"]; t2: string; isDark: boolean;
  categorieById?: CategorieById;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<{ startY: number; startH: number } | null>(null);
  const [snap, setSnap] = useState<SheetSnap>(1); // défaut = peek, comme avant

  const getMaxH = useCallback(() => Math.max(SHEET_PEEK_H, mapAreaHeight - SHEET_TOP_CLEARANCE), [mapAreaHeight]);
  const heightForSnap = useCallback((s: SheetSnap) => s === 0 ? SHEET_MINI_H : s === 1 ? SHEET_PEEK_H : getMaxH(), [getMaxH]);

  const setPanelHeight = useCallback((h: number, animate: boolean) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = animate ? "height 0.32s cubic-bezier(0.16,1,0.3,1)" : "none";
    el.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    setPanelHeight(heightForSnap(snap), true);
  }, [snap, heightForSnap, setPanelHeight]);

  // Une recherche/filtre qui démarre développe automatiquement le sheet —
  // l'utilisateur qui tape une recherche s'attend à voir des résultats tout
  // de suite, pas à devoir tirer lui-même le tiroir. Vraie synchronisation
  // sur un signal externe (rechercheActive), pas une valeur dérivable
  // pendant le rendu : snap doit rester librement pilotable par
  // l'utilisateur ensuite (il peut replier le sheet même en recherche
  // active). Tentative d'alternative sans effet (comparaison de ref
  // pendant le rendu, pourtant documentée par React) rejetée par la config
  // ESLint stricte de ce projet (react-hooks/refs, accès à une ref interdit
  // pendant le rendu) — useEffect+setState reste donc la solution correcte
  // ici, malgré le rendu en cascade ponctuel (un seul, au déclenchement de
  // la recherche, jamais en boucle).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (rechercheActive) setSnap(2);
  }, [rechercheActive]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = panelRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.current = { startY: e.clientY, startH: el.getBoundingClientRect().height };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = dragging.current.startY - e.clientY;
    const h = Math.min(getMaxH(), Math.max(SHEET_MINI_H, dragging.current.startH + delta));
    setPanelHeight(h, false);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    const el = panelRef.current;
    const currentH = el ? el.getBoundingClientRect().height : SHEET_PEEK_H;
    const maxH = getMaxH();
    dragging.current = null;
    // Snap vers le palier le plus proche parmi les 3 (seuils = milieux
    // entre paliers consécutifs), plutôt qu'un simple ratio à 2 états.
    const seuilBas = (SHEET_MINI_H + SHEET_PEEK_H) / 2;
    const seuilHaut = (SHEET_PEEK_H + maxH) / 2;
    setSnap(currentH < seuilBas ? 0 : currentH < seuilHaut ? 1 : 2);
  };

  function selectionnerEtReduire(id: string) {
    onSelectInstitution(id);
    setSnap(1);
  }

  // richDetails: true — variété façon Yelp (décision Bryan 21/08/2026),
  // scope limité à l'onglet Carte ; RechercheOverlay.tsx ne passe pas
  // cette prop, son rendu reste inchangé.
  const cardCommonProps = { C, t2, isDark, citoyenGeoloc, favorisIdsSet, onToggleFavori, categorieById, richDetails: true };

  return (
    <>
    <div
      ref={panelRef}
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: `${SHEET_PEEK_H}px`, zIndex: 1000, background: C.pageBg, borderRadius: "20px 20px 0 0", boxShadow: isDark ? "0 -10px 32px rgba(0,0,0,0.55)" : "0 -10px 32px rgba(0,0,0,0.16)", overflow: "hidden", display: "flex", flexDirection: "column", touchAction: "none" }}
    >
      <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={() => setSnap(s => (s + 1) % 3 as SheetSnap)} style={{ flexShrink: 0, padding: "10px 16px 6px", cursor: "grab" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: t2, opacity: 0.4, margin: "0 auto" }}/>
      </div>

      <div className="carte-sheet-scroll" style={{ flex: 1, overflowY: snap !== 0 ? "auto" : "hidden", padding: "6px 16px calc(20px + env(safe-area-inset-bottom))" }}>
        {snap === 0 ? (
          rechercheActive ? (
            <div style={{ color: C.text, fontSize: "12.5px", fontWeight: "800" }}>
              {filteredInstitutions.length} résultat{filteredInstitutions.length > 1 ? "s" : ""}{search ? ` pour "${search}"` : ""}
            </div>
          ) : selectedInst ? (
            <SheetMiniLine inst={selectedInst} C={C} t2={t2}/>
          ) : (
            <div style={{ color: C.text, fontSize: "12.5px", fontWeight: "800" }}>{filteredInstitutions.length} établissement{filteredInstitutions.length > 1 ? "s" : ""} sur la carte</div>
          )
        ) : rechercheActive ? (
          <>
            <div style={{ color: C.text, fontSize: "13px", fontWeight: "800", marginBottom: "12px" }}>
              {filteredInstitutions.length} résultat{filteredInstitutions.length > 1 ? "s" : ""}{search ? ` pour "${search}"` : ""}
            </div>
            {filteredInstitutions.length === 0 ? (
              <div style={{ textAlign: "center", color: t2, fontSize: "12.5px", padding: "24px 8px" }}>Aucun établissement localisé ne correspond à cette recherche.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {filteredInstitutions.map(inst => (
                  <CarteInstitutionCard key={inst.id} inst={inst} {...cardCommonProps} estFavori={favorisIdsSet.has(inst.id)} onToggleFavori={e => { e.stopPropagation(); onToggleFavori(inst); }} onSelect={() => selectionnerEtReduire(inst.id)}/>
                ))}
              </div>
            )}
          </>
        ) : (
          // Contenu identique aux paliers peek et développé (retour Bryan
          // 21/08/2026) — un tap sur un repère de la carte n'affecte plus ce
          // contenu, voir la fiche flottante indépendante ci-dessous.
          <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            <SheetSection titre="Recommandé pour vous" sousTitre={secteurTopLabel ? `Basé sur vos rendez-vous en ${secteurTopLabel.toLowerCase()}` : undefined} items={sheetRecommandees} {...cardCommonProps} onSelect={selectionnerEtReduire}/>
            <SheetSection titre="Vos favoris" items={sheetFavoris} {...cardCommonProps} onSelect={selectionnerEtReduire} horizontal hideCover/>
            <SheetSection titre="Près de chez vous" sousTitre={citoyenVille ? `À ${citoyenVille}` : undefined} items={sheetPresDeChezVous} {...cardCommonProps} onSelect={selectionnerEtReduire}/>
            <SheetSection titre="Partenaires vérifiés" sousTitre="Identité et activité confirmées par Yelen" items={sheetVerifiees} {...cardCommonProps} onSelect={selectionnerEtReduire} horizontal/>
            <SheetSection titre="Les mieux notées" items={sheetMieuxNotees} {...cardCommonProps} onSelect={selectionnerEtReduire} horizontal/>
            <SheetSection titre="Nouveau sur Yelen" items={sheetNouvelles} {...cardCommonProps} onSelect={selectionnerEtReduire}/>
            {sansAucuneInstitution && <div style={{ textAlign: "center", color: t2, fontSize: "12.5px", padding: "24px 8px" }}>Aucun établissement localisé pour l&apos;instant.</div>}
          </div>
        )}
      </div>
    </div>

    {/* ── Fiche flottante — tap sur un repère de la carte (retour Bryan
        21/08/2026, référence Yelp) : totalement séparée du sheet ci-dessus,
        jamais son contenu. Masquée au palier développé (le sheet couvre
        alors la carte, rien à survoler). Repositionnée au-dessus du sheet
        selon son palier courant, pas de suivi pixel-perfect du drag (déjà
        assez fluide en pratique, la transition CSS lisse le passage). ── */}
    {selectedInst && snap !== 2 && (
      <div style={{ position: "fixed", left: "16px", right: "16px", bottom: `${heightForSnap(snap) + 12}px`, zIndex: 1001, transition: "bottom 0.32s cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ position: "relative" }}>
          <button onClick={onDeselectInstitution} aria-label="Fermer la fiche" className="tap" style={{ position: "absolute", top: "8px", right: "8px", zIndex: 1, width: "26px", height: "26px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <CarteInstitutionCard inst={selectedInst} C={C} t2={t2} citoyenGeoloc={citoyenGeoloc} categorieById={categorieById} hideCover estFavori={favorisIdsSet.has(selectedInst.id)} onToggleFavori={e => { e.stopPropagation(); onToggleFavori(selectedInst); }} onSelect={() => {}}/>
        </div>
      </div>
    )}
    </>
  );
}
