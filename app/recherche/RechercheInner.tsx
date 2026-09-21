"use client";

import { Fragment, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { VILLES_GUINEE } from "@/lib/villes";
import { YelenLoader } from "@/components/YelenLoader";
import { YELEN224_USER_ID_KEY, YELEN224_LAST_TAB_KEY } from "@/lib/auth/constants";
import { deriverTendancesCitoyen, type RdvPourTendance } from "@/lib/citoyenTendances";
import { urlExterneSure } from "@/lib/urlValidation";
import {
  type Institution, type CategorieOption, type CategorieById, categorieVisuel,
  ctaPourInstitution, ctaHrefInstitution, CtaActionIcon, VERIFIE_BLEU,
  MetaVerifiedBadge, InstitutionLogo, Stars, CarteInstitutionCard, ICON_COEUR, ICON_PIN,
  CarteSheet, type TypeIdentite, typeIdentite, scorePertinence, parseLocalisationRequete,
} from "./shared";
import { ACTIVITE_CATEGORIE_SHORT, ActiviteCategorieIcon } from "@/lib/activiteVisuels";
import { RechercheOverlay } from "./RechercheOverlay";

const CarteMap = dynamic(() => import("@/components/CarteMap"), { ssr: false });

// Refonte "écran le plus stratégique" (décision CEO 06/08/2026) — onglet 1
// uniquement ("Vue principale — liste recommandée"), les onglets Vue
// horizontale / Vue Carte restent des chantiers séparés à venir. Périmètre :
// nouveau Hero utile (pas décoratif), rails de découverte personnalisés,
// palette assouplie (le gold redevient un accent, plus un fond plein
// partout). Zéro nouvelle route API — tous les rails lisent des données déjà
// réelles/existantes via le client supabase, même discipline "zéro donnée
// inventée" que le reste du produit :
// - "Recommandé pour vous" réutilise lib/citoyenTendances.ts (déjà construit
//   pour app/menu/vos-tendances, déterministe, seuil minimum de preuve).
// - "Près de chez vous" réutilise le proxy déjà établi ailleurs (ville
//   citoyen == ville institution, voir app/page.tsx) — aucune institution ne
//   renseigne encore de vraies coordonnées GPS (confirmé CLAUDE.md), donc pas
//   de "distance" inventée.
// - "Les mieux notées" (pas "populaire"/"tendance") : aucun compteur de vues
//   de profil institution n'existe dans le produit, un vrai signal de
//   popularité serait fabriqué. Reformulé honnêtement sur moyenne_avis/nb_avis
//   réels, cohérent avec le reste du produit.
// Restylée (§1 du plan) — plus de bandeau gold plein en tête de carte, chip
// de catégorie neutre (c'était un simple libellé, pas un statut méritant
// l'accent), pastille de disponibilité passée au vert sémantique (cohérent
// avec le reste du produit : vert = positif/disponible). Le gold reste
// réservé à la note (convention universelle étoiles), au badge Vérifié et
// au CTA principal — jamais un fond plein en dehors de ces deux usages.
function CardGrille({ inst, C, categorieById }: { inst: Institution; C: typeof T["dark"]; categorieById?: CategorieById }) {
  const router = useRouter();
  const meta = categorieVisuel(inst, categorieById);
  const hasDispos = inst.disponibilites && (Array.isArray(inst.disponibilites) ? (inst.disponibilites as unknown[]).length > 0 : true);
  const txt2 = C.textSubtle;
  // CTA réel (retour Bryan 23/08/2026, voir shared.tsx::ctaPourInstitution)
  // — remplace l'ancien libelleAction(category) toujours affiché ("RDV"
  // partout, même sans capacité réelle). La destination du CTA n'est plus
  // systématiquement la fiche (ex. rdv → /rdv/{id}), donc la carte n'est
  // plus un <a> unique : conteneur cliquable + CTA en lien indépendant
  // (stopPropagation), même pattern que CarteInstitutionCard (shared.tsx).
  const cta = ctaPourInstitution(inst);
  const idType = typeIdentite(inst);
  return (
    <div onClick={() => router.push(`/institution/${inst.id}?source=yelen_search`)} className="tap inst-card" style={{ cursor: "pointer", display: "flex", flexDirection: "column", background: C.cardBg, borderRadius: "16px", overflow: "hidden", position: "relative" }}>
      <div style={{ padding: "12px 12px 6px", display: "flex", justifyContent: "center" }}>
        <InstitutionLogo inst={inst} size={50} categorieById={categorieById} circular={idType === "profession"}/>
      </div>
      <div style={{ padding: "0 10px 10px", flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span style={{ background: C.borderCard, color: txt2, fontSize: "8px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", letterSpacing: "0.5px", textTransform: "uppercase" }}>{meta.short}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px" }}>
          {inst.badge_verifie && <MetaVerifiedBadge size={11}/>}
          <span style={{ color: C.text, fontSize: "12px", fontWeight: "800", lineHeight: 1.3, textAlign: "center", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{inst.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px" }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span style={{ color: txt2, fontSize: "10px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>{inst.ville || "Guinée"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}><Stars note={inst.moyenne_avis || 0} count={inst.nb_avis || 0} C={C}/></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: hasDispos ? "#00C896" : "rgba(255,255,255,0.1)" }}/>
          <span style={{ color: hasDispos ? "#00966F" : txt2, fontSize: "9px", fontWeight: "700" }}>{hasDispos ? "Créneaux disponibles" : "Sur demande"}</span>
        </div>
        <div style={{ marginTop: "auto", paddingTop: "6px" }}>
          {cta ? (
            <a href={ctaHrefInstitution(inst, cta.action)} target={cta.action === "rdv" || cta.action === "phone" ? undefined : "_blank"} rel={cta.action === "rdv" || cta.action === "phone" ? undefined : "noreferrer"} onClick={e => e.stopPropagation()} style={{ width: "100%", padding: "7px", background: "#F5A623", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", textDecoration: "none" }}>
              <CtaActionIcon action={cta.action} size={11}/>
              <span style={{ color: "#080812", fontSize: "10px", fontWeight: "900" }}>{cta.label}</span>
            </a>
          ) : (
            <a href={`/institution/${inst.id}?source=yelen_search`} onClick={e => e.stopPropagation()} style={{ width: "100%", padding: "7px", background: C.borderCard, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
              <span style={{ color: C.text, fontSize: "10px", fontWeight: "900" }}>Voir la fiche</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  return (
    <div style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "16px", border: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`, padding: "12px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <div style={{ width: "50px", height: "50px", borderRadius: "12px", background: bg }} className="skel"/>
      <div style={{ width: "55%", height: "9px", borderRadius: "5px", background: bg }} className="skel"/>
      <div style={{ width: "85%", height: "22px", borderRadius: "5px", background: bg }} className="skel"/>
      <div style={{ width: "50%", height: "8px", borderRadius: "5px", background: bg }} className="skel"/>
      <div style={{ width: "100%", height: "26px", borderRadius: "10px", background: bg }} className="skel"/>
    </div>
  );
}

// Squelette dédié à la Vue horizontale (onglet 2) — rangée pleine largeur,
// distincte du squelette carré de la grille (onglet 1) : chaque vue garde
// son propre flow jusque dans son état de chargement.
function SkeletonRow({ isDark, C }: { isDark: boolean; C: typeof T["dark"] }) {
  const bg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  return (
    <div style={{ display: "flex", gap: "12px", background: C.cardBg, borderRadius: "16px", padding: "14px" }}>
      <div style={{ width: "54px", height: "54px", borderRadius: "12px", background: bg, flexShrink: 0 }} className="skel"/>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", justifyContent: "center" }}>
        <div style={{ width: "55%", height: "11px", borderRadius: "5px", background: bg }} className="skel"/>
        <div style={{ width: "35%", height: "9px", borderRadius: "5px", background: bg }} className="skel"/>
        <div style={{ width: "85%", height: "9px", borderRadius: "5px", background: bg }} className="skel"/>
      </div>
    </div>
  );
}

// Rail de découverte horizontal (§3 du plan, refondu Lot F 28/08/2026 —
// référence DoorDash fournie par Bryan : cartes plus grandes/photo en avant
// façon "Quick essentials nearby", bouton flèche circulaire dans l'en-tête
// quand la section a plus de 10 résultats réels). Ne se rend jamais vide.
// Réutilise CarteInstitutionCard (shared.tsx, même carte que le Search
// Overlay et la Vue Carte — jamais une 3e implémentation de carte) plutôt
// que l'ancien CardGrille compact 150px : rendu "professionnel", photo de
// couverture quand elle existe (registre Entreprise/vertical), sinon le
// même repli propre logo+infos (registre Institution/Profession déjà géré
// par CarteInstitutionCard via typeIdentite, voir shared.tsx).
function Rail({ titre, sousTitre, institutions, C, t2, categorieById, citoyenGeoloc, favorisIdsSet, onToggleFavori, onVoirPlus, hideCover }: {
  titre: string; sousTitre?: string; institutions: Institution[]; C: typeof T["dark"]; t2: string; categorieById?: CategorieById;
  citoyenGeoloc: { lat: number; lng: number } | null; favorisIdsSet: Set<string>; onToggleFavori: (inst: Institution) => void;
  onVoirPlus?: () => void;
  // "Vos favoris"/"Les mieux notées" uniquement (retour Bryan 28/08/2026) —
  // retire la photo de couverture de CarteInstitutionCard pour ces 2
  // sections précises, les autres rails gardent la photo quand elle existe.
  hideCover?: boolean;
}) {
  const router = useRouter();
  if (institutions.length === 0) return null;
  const affichees = institutions.slice(0, 10);
  const aPlus = institutions.length > 10 && !!onVoirPlus;
  return (
    <section style={{ marginBottom: "22px" }}>
      <div style={{ padding: "0 16px", marginBottom: "10px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div>
          <div style={{ color: C.text, fontSize: "14.5px", fontWeight: "800", letterSpacing: "-0.2px" }}>{titre}</div>
          {sousTitre && <div style={{ color: t2, fontSize: "11px", marginTop: "1px" }}>{sousTitre}</div>}
        </div>
        {aPlus && (
          <button onClick={onVoirPlus} aria-label={`Voir plus — ${titre}`} className="tap" style={{ width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0, background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        )}
      </div>
      <div className="no-scroll" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", gap: "10px", padding: "0 16px", width: "max-content" }}>
          {affichees.map(inst => (
            <div key={inst.id} style={{ width: "260px", flexShrink: 0 }}>
              <CarteInstitutionCard inst={inst} C={C} t2={t2} citoyenGeoloc={citoyenGeoloc} estFavori={favorisIdsSet.has(inst.id)} onToggleFavori={e => { e.stopPropagation(); onToggleFavori(inst); }} onSelect={() => router.push(`/institution/${inst.id}?source=yelen_search`)} categorieById={categorieById} hideCover={hideCover}/>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Ligne compacte "Populaire" — logo rond/carré selon le type (comme
// ailleurs), nom, note+avis, catégorie/ville, cœur favori. Volontairement
// différente de CarteInstitutionCard (pas de photo, pas de CTA) : c'est le
// point du Lot G (retour Bryan 28/08/2026, référence DoorDash "Retail
// stores delivered").
function LignePopulaire({ inst, C, t2, categorieById, estFavori, onToggleFavori, onSelect, onVoirPlusDescription }: {
  inst: Institution; C: typeof T["dark"]; t2: string; categorieById?: CategorieById;
  estFavori: boolean; onToggleFavori: (e: React.MouseEvent) => void; onSelect: () => void;
  onVoirPlusDescription: (inst: Institution) => void;
}) {
  const meta = categorieVisuel(inst, categorieById);
  const idType = typeIdentite(inst);
  // Site web (retour Bryan 28/08/2026) — bouton icône neutre (fond
  // C.sectionAlt/bordure, jamais le doré/noir plein des CTA principaux
  // "Appeler"/"Prendre RDV") : simple lien secondaire, pas une action
  // principale de cette ligne compacte. N'apparaît que si l'institution a
  // réellement renseigné un site (jamais un bouton mort).
  const siteHref = urlExterneSure(inst.website);
  return (
    <div onClick={onSelect} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", cursor: "pointer" }}>
      <InstitutionLogo inst={inst} size={46} categorieById={categorieById} circular={idType === "profession"}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ color: C.text, fontSize: "12.5px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</span>
          {inst.badge_verifie && <MetaVerifiedBadge size={11}/>}
        </div>
        <div style={{ marginTop: "2px" }}><Stars note={inst.moyenne_avis || 0} count={inst.nb_avis || 0} C={C}/></div>
        <div style={{ display: "flex", alignItems: "center", gap: "3px", color: t2, fontSize: "10px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.short} · {ICON_PIN(t2)}{inst.ville || "Guinée"}</div>
        {inst.description && (
          <div style={{ display: "flex", alignItems: "baseline", gap: "5px", marginTop: "3px" }}>
            <div style={{ color: t2, fontSize: "10.5px", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{inst.description}</div>
            <button onClick={e => { e.stopPropagation(); onVoirPlusDescription(inst); }} className="tap" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#F5A623", fontSize: "10.5px", fontWeight: "800", flexShrink: 0 }}>Voir plus</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0, marginLeft: "auto" }}>
        <button onClick={onToggleFavori} aria-label={estFavori ? "Retirer des favoris" : "Ajouter aux favoris"} className="tap" style={{ background: "none", border: "none", cursor: "pointer", padding: "3px" }}>
          {ICON_COEUR(estFavori, "#F5A623", t2)}
        </button>
        {siteHref && (
          <a href={siteHref} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} aria-label="Site web" className="tap" style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 9px", borderRadius: "20px", background: C.sectionAlt, border: `1px solid ${C.borderCard}`, color: t2, textDecoration: "none", whiteSpace: "nowrap" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span style={{ fontSize: "10px", fontWeight: "700" }}>Site web</span>
          </a>
        )}
      </div>
    </div>
  );
}

// Rail "Populaire" (Lot G, 28/08/2026, référence DoorDash "Retail stores
// delivered" — capture Bryan à l'appui) — volontairement à l'opposé de
// Rail ci-dessus : colonnes de 3 lignes compactes empilées verticalement,
// qui défilent horizontalement, plutôt que des cartes photo. Classement
// réel (app/api/citoyen/institutions/populaires) combinant vues de fiche,
// avis et réservations — jamais un ordre inventé.
function RailPopulaire({ institutions, C, t2, categorieById, favorisIdsSet, onToggleFavori, onVoirPlus, onVoirPlusDescription }: {
  institutions: Institution[]; C: typeof T["dark"]; t2: string; categorieById?: CategorieById;
  favorisIdsSet: Set<string>; onToggleFavori: (inst: Institution) => void; onVoirPlus?: () => void;
  onVoirPlusDescription: (inst: Institution) => void;
}) {
  const router = useRouter();
  if (institutions.length === 0) return null;
  const colonnes: Institution[][] = [];
  for (let i = 0; i < institutions.length; i += 3) colonnes.push(institutions.slice(i, i + 3));
  return (
    <section style={{ marginBottom: "22px" }}>
      <div style={{ padding: "0 16px", marginBottom: "6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ color: C.text, fontSize: "14.5px", fontWeight: "800", letterSpacing: "-0.2px" }}>Populaire</div>
        {onVoirPlus && (
          <button onClick={onVoirPlus} aria-label="Voir plus — Populaire" className="tap" style={{ width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0, background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        )}
      </div>
      <div className="no-scroll" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", gap: "18px", padding: "0 16px", width: "max-content" }}>
          {colonnes.map((colonne, i) => (
            <div key={i} style={{ width: "300px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
              {colonne.map((inst, j) => (
                <div key={inst.id} style={{ borderTop: j > 0 ? `1px solid ${C.borderCard}` : "none" }}>
                  <LignePopulaire inst={inst} C={C} t2={t2} categorieById={categorieById} estFavori={favorisIdsSet.has(inst.id)} onToggleFavori={e => { e.stopPropagation(); onToggleFavori(inst); }} onSelect={() => router.push(`/institution/${inst.id}?source=yelen_search`)} onVoirPlusDescription={onVoirPlusDescription}/>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Extraction sûre d'un service depuis institutions.services — même
// discipline défensive que InstitutionPublicClient.tsx::toServiceLabel
// (entrées historiques en chaîne simple encore possibles, entrées
// actuelles en objet {nom,description,duree_minutes,champs_complementaires,...}).
// Un 1er essai ici avait rendu l'objet brut directement dans le JSX et fait
// planter l'écran ("Objects are not valid as a React child") — jamais
// refaire cette erreur, toujours passer par ce normaliseur avant affichage.
function labelService(entry: unknown): { nom: string; description: string | null; dureeMinutes: number | null } | null {
  if (typeof entry === "string") {
    const nom = entry.trim();
    return nom ? { nom, description: null, dureeMinutes: null } : null;
  }
  if (entry && typeof entry === "object" && "nom" in entry) {
    const e = entry as { nom?: unknown; description?: unknown; duree_minutes?: unknown };
    const nom = typeof e.nom === "string" ? e.nom.trim() : "";
    if (!nom) return null;
    return {
      nom,
      description: typeof e.description === "string" && e.description.trim() ? e.description.trim() : null,
      dureeMinutes: typeof e.duree_minutes === "number" ? e.duree_minutes : null,
    };
  }
  return null;
}

// Sheet "Voir plus" — description complète (retour Bryan 28/08/2026,
// déclenché depuis LignePopulaire/RailPopulaire) — bottom sheet mobile
// simple, même convention que le reste du produit (panel arrondi en haut,
// poignée, backdrop cliquable pour fermer, cf. YELEN_UX_RULES.md §1.5).
function SheetDescription({ inst, C, t2, categorieById, onClose }: {
  inst: Institution; C: typeof T["dark"]; t2: string; categorieById?: CategorieById; onClose: () => void;
}) {
  const services = Array.isArray(inst.services) ? (inst.services as unknown[]).map(labelService).filter((s): s is NonNullable<typeof s> => !!s) : [];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}/>
      <div style={{ position: "relative", width: "100%", maxHeight: "70svh", overflowY: "auto", background: C.pageBg, borderRadius: "20px 20px 0 0", padding: "10px 20px calc(24px + env(safe-area-inset-bottom))", animation: "fadeUp 0.25s ease" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: t2, opacity: 0.4, margin: "0 auto 16px" }}/>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "14px" }}>
          <InstitutionLogo inst={inst} size={44} categorieById={categorieById}/>
          <div style={{ flex: 1, minWidth: 0, paddingTop: "2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ color: C.text, fontSize: "15px", fontWeight: "900" }}>{inst.name}</span>
              {inst.badge_verifie && <MetaVerifiedBadge size={13}/>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="tap" style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: C.sectionAlt, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ color: C.text, fontSize: "13.5px", lineHeight: 1.65 }}>{inst.description}</div>
        <div style={{ color: t2, fontSize: "10.5px", marginTop: "8px", fontStyle: "italic" }}>Écrit par {inst.name}</div>

        {/* Services réels (institutions.services), normalisés via
            labelService() ci-dessus — chaque service pointe vers le même
            lien réel que la fiche complète (/rdv/{id}?service=...), jamais
            une liste inventée : rien ne s'affiche si l'institution n'en a
            renseigné aucun. */}
        {services.length > 0 && (
          <div style={{ marginTop: "18px" }}>
            <div style={{ color: C.text, fontSize: "12px", fontWeight: "800", marginBottom: "8px" }}>Services proposés</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {services.map((s, i) => (
                <a key={i} href={`/rdv/${inst.id}?service=${encodeURIComponent(s.nom)}`} onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "9px 12px", background: C.sectionAlt, borderRadius: "10px", textDecoration: "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nom}</div>
                    {s.description && <div style={{ color: t2, fontSize: "10px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.description}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    {s.dureeMinutes ? <span style={{ color: t2, fontSize: "10px" }}>{s.dureeMinutes} min</span> : null}
                    <span style={{ color: "#F5A623", fontSize: "10.5px", fontWeight: "800" }}>RDV</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* CTA conversation réelle (retour Bryan 28/08/2026) — réutilise le
            vrai mécanisme "Poser une question" déjà existant sur la fiche
            institution (questions_institution, InstitutionPublicClient.tsx),
            jamais une messagerie fabriquée pour l'occasion. La messagerie
            "Établissements" (app/messagerie/citoyen) est scopée par RDV
            (une conversation par rendez-vous) — impossible à ouvrir pour une
            institution qui n'a pas encore de RDV avec ce citoyen. */}
        <a href={`/institution/${inst.id}?question=1&source=yelen_search`} onClick={e => e.stopPropagation()} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "18px", padding: "13px", background: "#F5A623", borderRadius: "12px", textDecoration: "none" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span style={{ color: "#080812", fontSize: "13px", fontWeight: "900" }}>Poser une question</span>
        </a>
      </div>
    </div>
  );
}

// Sheet de la Vue Carte (SheetSection/SheetMiniLine/CarteSheet + constantes
// SHEET_MINI_H/SHEET_PEEK_H/SHEET_TOP_CLEARANCE/SheetSnap) déplacé dans
// ./shared.tsx (retour Bryan 22/08/2026) — réutilisé tel quel par le widget
// carte de l'accueil citoyen (components/CarteYelenAccueil.tsx), jamais une
// deuxième implémentation. Importé plus haut dans ce fichier.

// ══ HERO — carrousel de 3 bandeaux promotionnels (décision CEO 07/08/2026,
// onglet 1 uniquement — onglets Vue liste/Vue Carte non concernés par ce
// chantier, ils gardent leur propre Hero compact inchangé). Remplace le
// Hero utile compact par un carrousel plein écran, chaque bandeau avec sa
// propre identité de couleur et sa propre destination réelle : Mon Compte,
// Offres, Yelen Rewards — 3 fonctionnalités déjà existantes dans le
// produit (app/page.tsx onglets "compte"/"offres", app/menu/recompenses),
// aucune n'est inventée pour l'occasion.
//
// Illustrations : compositions géométriques/abstraites sur mesure, dans
// le langage graphique déjà établi de l'app (formes pleines, cercles,
// icônes trait) — décision explicite de Bryan (07/08/2026, en réponse à
// des références Kulu à personnages dessinés à la main) : hors de portée
// d'un SVG écrit à la main à ce niveau de détail, donc des compositions
// sobres pour cette version, remplaçables facilement lors du futur
// chantier dédié à la bibliothèque d'illustrations SVG de tout
// l'écosystème Yelen.
//
// ⚠️ Dérogation assumée pour le bandeau Yelen Rewards : l'écran Récompenses
// (app/menu/recompenses/recompenses-client.tsx) documente une règle CEO
// déjà actée interdisant les icônes génériques trophée/pièce/cadeau au
// profit du langage "lumière" (noyau + rayons). Bryan a explicitement
// tranché (07/08/2026) de suivre malgré tout le brief de ce bandeau tel
// quel (trophée/étoiles/pièces) — décision consciente, pas un oubli de
// cohérence : ne pas "corriger" ce bandeau vers le langage lumière sans
// nouvelle demande explicite.
const HERO_AUTOPLAY_MS = 4800;
// Fermeture temporaire du bandeau Hero (retour Bryan 28/08/2026) — un X
// masque le bandeau (onglet Grille uniquement, les 3 slides
// Espace/Offres/Rewards) pendant 7 jours pleins à partir du jour de
// fermeture, stocké en localStorage (par appareil, pas de compte requis).
const HERO_GRILLE_FERME_KEY = "yelen224_hero_grille_ferme_le";
const HERO_FERME_DUREE_MS = 7 * 24 * 60 * 60 * 1000;

function IllustrationEspace() {
  return (
    <svg width="118" height="118" viewBox="0 0 118 118" fill="none">
      <circle cx="59" cy="59" r="56" stroke="rgba(255,255,255,0.12)" strokeWidth="2"/>
      <circle cx="59" cy="59" r="42" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
      <circle cx="59" cy="47" r="15" fill="rgba(255,255,255,0.95)"/>
      <path d="M31 95c4-17 15-25 28-25s24 8 28 25" stroke="rgba(255,255,255,0.95)" strokeWidth="7" strokeLinecap="round" fill="none"/>
      <circle cx="94" cy="30" r="13" fill="#2EE6A6"/>
      <path d="M88.5 30l3.7 3.7L98 26" stroke="#063028" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function IllustrationOffres() {
  return (
    <svg width="118" height="118" viewBox="0 0 118 118" fill="none">
      <circle cx="59" cy="59" r="56" stroke="rgba(255,255,255,0.14)" strokeWidth="2"/>
      <g transform="translate(24,30) rotate(-10 35 30)">
        <rect x="0" y="0" width="62" height="46" rx="10" fill="rgba(255,255,255,0.96)"/>
        <circle cx="15" cy="23" r="8" fill="#F5A623"/>
        <path d="M22 33 40 15" stroke="#F5A623" strokeWidth="3.4" strokeLinecap="round"/>
        <circle cx="41" cy="32" r="3.4" fill="#F5A623"/>
      </g>
      <circle cx="93" cy="26" r="6" fill="rgba(255,255,255,0.85)"/>
      <circle cx="101" cy="42" r="3.5" fill="rgba(255,255,255,0.65)"/>
      <circle cx="20" cy="95" r="4.5" fill="rgba(255,255,255,0.65)"/>
    </svg>
  );
}

function IllustrationRewards() {
  return (
    <svg width="118" height="118" viewBox="0 0 118 118" fill="none">
      <circle cx="59" cy="59" r="56" stroke="rgba(255,255,255,0.14)" strokeWidth="2"/>
      <g transform="translate(35,26)">
        <path d="M8 0h32v20a16 16 0 0 1-32 0V0z" fill="#F5A623"/>
        <path d="M8 6H0v6a10 10 0 0 0 8 9.8V6zM40 6h8v6a10 10 0 0 1-8 9.8V6z" fill="rgba(255,255,255,0.85)"/>
        <rect x="19" y="38" width="10" height="10" fill="#F5A623"/>
        <rect x="10" y="48" width="28" height="7" rx="2" fill="#F5A623"/>
      </g>
      <circle cx="93" cy="30" r="5" fill="rgba(255,255,255,0.9)"/>
      <circle cx="98" cy="46" r="3" fill="rgba(255,255,255,0.6)"/>
      <path d="M22 20l2.6 5.4L30 28l-5.4 2.6L22 36l-2.6-5.4L14 28l5.4-2.6z" fill="rgba(255,255,255,0.85)"/>
    </svg>
  );
}

// Bandeaux onglet 2 (09/08/2026) — contexte "comparaison pour décider",
// délibérément différent des bandeaux growth de l'onglet 1 (validé par
// Bryan) : confiance (badge Vérifié déjà vu sur chaque carte comparée) et
// rappel d'action (RDV réels déjà pris, jamais un chiffre inventé).
function IllustrationVerifie() {
  return (
    <svg width="118" height="118" viewBox="0 0 118 118" fill="none">
      <circle cx="59" cy="59" r="56" stroke="rgba(255,255,255,0.14)" strokeWidth="2"/>
      <path d="M59 22l24 9v18c0 20-12 32-24 38-12-6-24-18-24-38V31z" fill="rgba(255,255,255,0.95)"/>
      <path d="M48 59l8 8 16-17" stroke="#0095F6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="93" cy="30" r="5" fill="rgba(255,255,255,0.85)"/>
      <circle cx="98" cy="46" r="3" fill="rgba(255,255,255,0.6)"/>
    </svg>
  );
}
function IllustrationRdv() {
  return (
    <svg width="118" height="118" viewBox="0 0 118 118" fill="none">
      <circle cx="59" cy="59" r="56" stroke="rgba(255,255,255,0.14)" strokeWidth="2"/>
      <rect x="30" y="34" width="58" height="50" rx="8" fill="rgba(255,255,255,0.95)"/>
      <rect x="30" y="34" width="58" height="16" rx="8" fill="#F5A623"/>
      <rect x="42" y="24" width="6" height="16" rx="3" fill="#F5A623"/>
      <rect x="70" y="24" width="6" height="16" rx="3" fill="#F5A623"/>
      <path d="M44 68l8 8 16-17" stroke="#00966F" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="93" cy="30" r="5" fill="rgba(255,255,255,0.85)"/>
    </svg>
  );
}

type HeroSlide = {
  id: string; bg: string; kicker: string; titre: string; texte: string; cta: string;
  illustration: React.ReactNode; href: string; onGo?: () => void;
};

// Généralisé (09/08/2026) pour être réutilisé par l'onglet 2 (bandeaux
// différents, contexte "comparaison" plutôt que découverte/growth) — les
// slides sont maintenant calculés par l'appelant, plus construits en dur
// ici. Mécanique de carrousel (autoplay, swipe, dots) inchangée.
function HeroCarousel({ slides, onClose, C }: { slides: HeroSlide[]; onClose?: () => void; C: typeof T["dark"] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const pausedRef = useRef(false);
  const resumeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToIndex = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setActive(a => {
        const next = (a + 1) % slides.length;
        scrollToIndex(next);
        return next;
      });
    }, HERO_AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [scrollToIndex, slides.length]);

  function onScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }
  function onInteractionStart() {
    pausedRef.current = true;
    if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
  }
  function onInteractionEnd() {
    if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    resumeTimeout.current = setTimeout(() => { pausedRef.current = false; }, 3500);
  }

  return (
    <div style={{ padding: "14px 0 4px" }}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={onInteractionStart}
        onPointerUp={onInteractionEnd}
        onPointerCancel={onInteractionEnd}
        className="no-scroll"
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
      >
        {slides.map(s => (
          <a key={s.id} href={s.href} onClick={e => { if (s.href === "#") e.preventDefault(); s.onGo?.(); }} style={{ position: "relative", scrollSnapAlign: "start", flex: "0 0 100%", width: "100%", boxSizing: "border-box", padding: "10px 16px 0", textDecoration: "none", display: "block" }}>
            {/* X de fermeture (retour Bryan 28/08/2026, ajusté pour flotter
                hors du bandeau plutôt que dedans) — masque le bandeau
                pendant 7 jours, cf. HERO_FERME_DUREE_MS. Sibling du bloc
                coloré (pas un enfant, qui est overflow:hidden et le
                couperait). Le conteneur défilant parent est overflowX:auto
                (donc overflowY implicitement clippé par la spec CSS) — un
                top négatif serait rogné, d'où le padding-top de 10px
                ajouté sur ce lien pour réserver un vrai espace non coupé
                plutôt qu'un débordement. Au-dessus du lien
                (stopPropagation+preventDefault) pour ne jamais déclencher
                la navigation de la carte. */}
            {onClose && (
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} aria-label="Fermer ce bandeau pour 7 jours" className="tap" style={{ position: "absolute", top: "0px", right: "7px", zIndex: 2, width: "24px", height: "24px", borderRadius: "50%", border: `2px solid ${C.pageBg}`, background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
            <div style={{ position: "relative", overflow: "hidden", background: s.bg, borderRadius: "18px", padding: "14px 16px", minHeight: "118px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ position: "absolute", right: "-10px", top: "50%", transform: "translateY(-50%) scale(0.76)", transformOrigin: "right center" }}>{s.illustration}</div>
              <div style={{ position: "relative", maxWidth: "72%" }}>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "9.5px", fontWeight: "700", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{s.kicker}</div>
                <div style={{ color: "#fff", fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", lineHeight: 1.2, marginBottom: "3px" }}>{s.titre}</div>
                <div style={{ color: "rgba(255,255,255,0.82)", fontSize: "10.5px", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{s.texte}</div>
              </div>
              <div style={{ position: "relative", display: "flex" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 11px", background: "rgba(255,255,255,0.96)", borderRadius: "9px", fontSize: "10.5px", fontWeight: "900", color: "#111" }}>
                  {s.cta}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginTop: "10px" }}>
        {slides.map((s, i) => (
          <button key={s.id} onClick={() => { scrollToIndex(i); setActive(i); }} aria-label={`Bandeau ${i + 1}`} className="tap" style={{ width: i === active ? "18px" : "6px", height: "6px", borderRadius: "3px", border: "none", background: i === active ? "#F5A623" : "rgba(128,128,128,0.3)", padding: 0, cursor: "pointer", transition: "width 0.25s ease" }}/>
        ))}
      </div>
    </div>
  );
}

// Signature institutionnelle de fin de parcours — Search V2 (retour Bryan
// 28/08/2026) : la v1 affichait des métriques internes ("2 institutions",
// "15 catégories · Yelen224") qui lisaient comme un aperçu de base de
// données plutôt qu'une conclusion produit. Zéro chiffre ici désormais —
// uniquement la marque, une phrase de confiance, des liens utilitaires
// réels (jamais un lien inventé : pas de page "/a-propos" dans le
// produit, "Contact" utilisé à la place), le drapeau en signature discrète
// et un copyright. Partagée par les états "fin des résultats" et "aucun
// résultat" ci-dessous.
function SignatureYelen({ C, t2 }: { C: typeof T["dark"]; t2: string }) {
  const anneeActuelle = new Date().getFullYear();
  const liensUtilitaires: { label: string; href: string }[] = [
    { label: "Aide", href: "/faq" },
    { label: "Contact", href: "/contact" },
    { label: "Confidentialité", href: "/confidentialite" },
    { label: "Conditions", href: "/cgu" },
  ];
  return (
    <div style={{ textAlign: "center", padding: "32px 0 22px", borderTop: `1px solid ${C.borderCard}`, marginTop: "28px" }}>
      <div style={{ color: C.text, fontSize: "13.5px", fontWeight: "900", letterSpacing: "-0.2px", marginBottom: "4px" }}>Yelen</div>
      <div style={{ color: t2, fontSize: "11px", marginBottom: "8px" }}>Le répertoire professionnel de confiance.</div>
      <div style={{ color: t2, fontSize: "10.5px", lineHeight: 1.6, maxWidth: "280px", margin: "0 auto 20px" }}>
        Des établissements et services référencés pour vous aider à trouver ce dont vous avez besoin.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "20px" }}>
        {liensUtilitaires.map((l, i) => (
          <Fragment key={l.href}>
            {i > 0 && <span style={{ color: t2, opacity: 0.35, fontSize: "10px" }}>·</span>}
            <Link href={l.href} style={{ color: t2, fontSize: "10.5px", fontWeight: "600", textDecoration: "none" }}>{l.label}</Link>
          </Fragment>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "10px" }}>
        <div style={{ width: "13px", height: "9px", background: "#CE1126", borderRadius: "1px 0 0 1px" }}/>
        <div style={{ width: "13px", height: "9px", background: "#FCD20F" }}/>
        <div style={{ width: "13px", height: "9px", background: "#009A44", borderRadius: "0 1px 1px 0" }}/>
        <span style={{ color: t2, fontSize: "9.5px", fontWeight: "600", marginLeft: "2px" }}>République de Guinée</span>
      </div>

      <div style={{ color: t2, fontSize: "9.5px", opacity: 0.7 }}>© {anneeActuelle} Yelen</div>
    </div>
  );
}

// `embedded`/`onBack` (09/08/2026, décision CEO — promotion en onglet
// principal de l'accueil citoyen, discoverability) : par défaut `false`,
// donc l'écran `/recherche` autonome garde exactement son comportement
// actuel (lien retour vers "/") — seul l'onglet Accueil (app/page.tsx)
// passe `embedded` pour rediriger le retour vers l'onglet Accueil plutôt
// qu'une navigation "/" qui n'aurait plus de sens une fois cet écran
// monté comme contenu d'onglet plutôt que comme route dédiée.
export function RechercheInner({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";
  const searchParams = useSearchParams();

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Chantier "Recherche & catégories" (21/08/2026) — remplace le filtre
  // legacy `institutions.category` (texte libre, plus jamais écrit depuis
  // la migration Taxonomie, voir shared.tsx) par les 15 vraies catégories
  // (activite_categories, lecture publique déjà ouverte en RLS). `filterCat`
  // porte désormais un `code` stable (ex. "hebergement_restauration_evenements"),
  // jamais un uuid brut dans l'URL. Chargée une fois, catégories fixes
  // gérées par Yelen (pas de re-fetch au fil de la session).
  const [categories, setCategories] = useState<CategorieOption[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("activite_categories").select("id,code,label").eq("actif", true).order("ordre");
      setCategories((data as CategorieOption[]) || []);
    })();
  }, []);
  const categorieById = useMemo<CategorieById>(
    () => Object.fromEntries(categories.map(c => [c.id, { code: c.code, label: c.label }])),
    [categories]
  );
  const [filterCat, setFilterCat] = useState(searchParams.get("categorie") || "");
  const [filterVille, setFilterVille] = useState(searchParams.get("region") || "");
  const [filterVerifie, setFilterVerifie] = useState(false);
  const [filterDispos, setFilterDispos] = useState(false);
  // Filtre "Type" (Lot A, 28/08/2026, décision CEO) — dérivé de
  // statut_juridique (voir shared.tsx::typeIdentite), pas une colonne SQL
  // dédiée : filtré côté client après fetch, même pattern que filterDispos.
  const [filterType, setFilterType] = useState<TypeIdentite | "">("");
  // Défaut "pertinence" (Lot B, 28/08/2026, brief Search §12) — remplace
  // "note" comme tri par défaut, voir shared.tsx::scorePertinence.
  const [sortBy, setSortBy] = useState<"pertinence"|"note"|"avis"|"nom">("pertinence");
  const [total, setTotal] = useState(0);
  // Permet d'arriver directement sur la Vue Carte (retour Bryan 22/08/2026)
  // — le bouton "Agrandir" du widget carte de l'accueil citoyen doit ouvrir
  // cette vraie Vue Carte, jamais une réimplémentation séparée ("on ne peut
  // pas avoir 2 expériences").
  const [vue, setVue] = useState<"grille"|"liste"|"carte">(searchParams.get("vue") === "carte" ? "carte" : "grille");
  const [showFilters, setShowFilters] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;

  // Coach mark "Grille/Liste/Carte" (retour Bryan 03/09/2026) — au premier
  // passage sur cet écran, rien n'indique que ces 3 icônes sont de vraies
  // vues cliquables (elles peuvent lire comme une simple décoration). Une
  // bulle pointe vers elles une seule fois par appareil (localStorage),
  // se ferme au tap n'importe où dessus, disparaît automatiquement, ou
  // dès que l'utilisateur touche une des 3 icônes (signal qu'il a compris).
  const [coachMarkVuesVisible, setCoachMarkVuesVisible] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("yelen224_recherche_coachmark_vues_vu") === "1") return; } catch { /* ignore */ }
    const t = setTimeout(() => setCoachMarkVuesVisible(true), 700);
    return () => clearTimeout(t);
  }, []);
  function fermerCoachMarkVues() {
    try { localStorage.setItem("yelen224_recherche_coachmark_vues_vu", "1"); } catch { /* ignore */ }
    setCoachMarkVuesVisible(false);
  }
  useEffect(() => {
    if (!coachMarkVuesVisible) return;
    const t = setTimeout(fermerCoachMarkVues, 6000);
    return () => clearTimeout(t);
  }, [coachMarkVuesVisible]);

  // Header "Grille" (retour Bryan 23/08/2026 : "l'écran n'a pas de header",
  // la ligne retour+recherche défilait avec la page) — sticky, masqué en
  // glissant vers le haut dès qu'on scrolle vers le bas, réaffiché dès
  // qu'on recommence à remonter (peu importe la position). Hauteur mesurée
  // en direct (ResizeObserver, jamais une valeur en dur) pour que la ligne
  // catégories, déjà sticky juste en dessous, recolle exactement sous ce
  // header au lieu de se chevaucher avec lui.
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(64);
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);

  // Onglet 2 "Liste" (retour Bryan 23/08/2026) — même traitement header
  // fixe masqué/réaffiché au scroll que l'onglet 1, mais seule la ligne
  // logo+vues+compteur en fait partie désormais ; la barre de recherche et
  // les chips catégories redeviennent du contenu d'écran normal (ni sticky
  // ni fixed), au lieu de tout empiler dans le même bloc figé. État
  // partagé avec l'onglet Grille (un seul des deux rendu à la fois).
  //
  // ⚠️ Bug réel corrigé (retour Bryan 23/08/2026, capture à l'appui — le
  // header recouvrait la recherche + les catégories en arrivant sur
  // Liste) : la dépendance de l'effet de mesure était le booléen dérivé
  // `vue === "grille" || vue === "liste"`, qui ne change PAS en passant de
  // Grille à Liste (true→true) — l'effet ne se relançait donc jamais au
  // changement d'onglet, le ResizeObserver restait accroché au <div>
  // Grille démonté (silencieux, plus jamais déclenché), et `headerH`
  // gardait la hauteur de Grille au lieu de celle, différente, du header
  // Liste. Dépendance corrigée sur `vue` lui-même, pour que l'effet se
  // relance et remesure à chaque bascule entre les deux.
  useEffect(() => {
    if (vue !== "grille" && vue !== "liste") return;
    const el = headerRef.current;
    if (!el) return;
    const mesurer = () => setHeaderH(el.getBoundingClientRect().height);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vue]);

  useEffect(() => {
    if (vue !== "grille" && vue !== "liste") return;
    lastScrollY.current = window.scrollY;
    function onScrollHeader() {
      const y = window.scrollY;
      if (y <= headerH) { setHeaderHidden(false); lastScrollY.current = y; return; }
      setHeaderHidden(y > lastScrollY.current);
      lastScrollY.current = y;
    }
    window.addEventListener("scroll", onScrollHeader, { passive: true });
    return () => window.removeEventListener("scroll", onScrollHeader);
  }, [vue, headerH]);

  // ── Vue Carte (onglet 3, sheet DoorDash — décision CEO 06/08/2026) ──
  const [selectedCarteId, setSelectedCarteId] = useState<string | null>(null);
  const [zoneIds, setZoneIds] = useState<string[] | null>(null);
  const [pendingZoneIds, setPendingZoneIds] = useState<string[] | null>(null);

  // ── Signaux citoyen réels pour les rails de découverte (§3 du plan) et le
  // sheet de la Vue Carte ── Page 100% publique — dégradation silencieuse
  // si le citoyen n'est pas identifié (pas d'id en localStorage) : les
  // rails/sections personnalisés ne se rendent simplement pas, jamais
  // d'erreur ni de section vide.
  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [citoyenPrenom, setCitoyenPrenom] = useState<string | null>(null);
  const [citoyenVille, setCitoyenVille] = useState<string | null>(null);
  const [tendances, setTendances] = useState<ReturnType<typeof deriverTendancesCitoyen> | null>(null);
  const [favorisInsts, setFavorisInsts] = useState<Institution[]>([]);
  // Bandeau "Vos rendez-vous en cours" (onglet 2, 09/08/2026) — RDV réels à
  // venir, jamais affiché si le citoyen n'en a aucun (jamais de compteur
  // inventé). "En cours" = non passé, ni annulé/refusé/terminé.
  const [rdvActifsCount, setRdvActifsCount] = useState(0);
  const [prochainRdvNom, setProchainRdvNom] = useState<string | null>(null);
  const [poolDecouverte, setPoolDecouverte] = useState<Institution[]>([]);
  // Rail "Populaire" (Lot G, 28/08/2026) — classement réel calculé côté
  // serveur (app/api/citoyen/institutions/populaires), résolu en objets
  // Institution complets via poolDecouverte déjà chargé, en préservant
  // l'ordre du classement.
  const [populairesIds, setPopulairesIds] = useState<string[]>([]);
  // Sheet "Voir plus" (retour Bryan 28/08/2026) — description complète de
  // l'institution ouverte depuis la ligne "Populaire".
  const [descriptionSheetInst, setDescriptionSheetInst] = useState<Institution | null>(null);
  useEffect(() => {
    fetch("/api/citoyen/institutions/populaires").then(r => r.ok ? r.json() : { ids: [] }).then(d => setPopulairesIds(d.ids || [])).catch(() => {});
  }, []);
  // Géoloc appareil — même pattern permissif que app/page.tsx/mes-rdv/
  // favoris (demande silencieuse, aucune UI si refusé/indisponible), pour
  // la distance réelle affichée sur les fiches du sheet de la Vue Carte.
  const [citoyenGeoloc, setCitoyenGeoloc] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setCitoyenGeoloc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 8000 }
    );
  }, []);


  useEffect(() => {
    (async () => {
      // Vivier de découverte (§3) — une seule requête bornée, réutilisée pour
      // dériver "Près de chez vous"/"Partenaires vérifiés"/"Les mieux
      // notées"/"Nouveau sur Yelen" côté client, plutôt que 4 requêtes
      // séparées pour la même table.
      const { data: pool } = await supabase
        .from("institutions")
        .select("id,name,category,secteur,ville,quartier,moyenne_avis,nb_avis,logo,banniere,badge_verifie,description,statut,adresse,latitude,longitude,phone,disponibilites,horaires,created_at,activite_categorie_id,statut_juridique,website,services")
        .eq("statut", "validee")
        .order("created_at", { ascending: false })
        .limit(150);
      setPoolDecouverte((pool || []) as Institution[]);

      let id: string | null = null;
      try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
      if (!id) return;
      setCitoyenId(id);

      const { data: u } = await supabase.from("users").select("prenom,ville").eq("id", id).maybeSingle();
      if (u) {
        setCitoyenPrenom((u.prenom || "").trim() || null);
        setCitoyenVille((u.ville || "").trim() || null);
      }

      const { data: favRows } = await supabase.from("citoyen_favoris").select("institution_id").eq("citoyen_id", id);
      const favIds = (favRows || []).map((f: { institution_id: string }) => f.institution_id);
      if (favIds.length > 0) {
        const { data: favInsts } = await supabase
          .from("institutions")
          .select("id,name,category,secteur,ville,quartier,moyenne_avis,nb_avis,logo,banniere,badge_verifie,description,statut,adresse,latitude,longitude,phone,disponibilites,horaires,activite_categorie_id")
          .in("id", favIds)
          .eq("statut", "validee");
        setFavorisInsts((favInsts || []) as Institution[]);
      }

      // Tendances (secteur le plus fréquenté) — même moteur déterministe que
      // app/menu/vos-tendances, pas de nouvelle logique. Jointure évitée
      // volontairement sur institutions(secteur) dans le select rdv (piège
      // FK multiple documenté sur cette table) : deux requêtes séparées,
      // fusion en JS, même pattern déjà utilisé par app/page.tsx.
      const { data: rdvRows } = await supabase.from("rdv").select("institution_id,date_rdv").eq("citoyen_id", id).order("date_rdv", { ascending: false }).limit(200);
      const instIds = [...new Set((rdvRows || []).map((r: { institution_id: string | null }) => r.institution_id).filter((v): v is string => !!v))];
      const secteurParId: Record<string, string | null> = {};
      const nomParId: Record<string, string> = {};
      if (instIds.length > 0) {
        const { data: instRows } = await supabase.from("institutions").select("id,name,secteur").in("id", instIds);
        (instRows || []).forEach((r: { id: string; name: string; secteur: string | null }) => { secteurParId[r.id] = r.secteur; nomParId[r.id] = r.name; });
      }
      const rdvPourTendance: RdvPourTendance[] = (rdvRows || []).map((r: { institution_id: string | null; date_rdv: string }) => ({
        institutionId: r.institution_id,
        institutionNom: r.institution_id ? (nomParId[r.institution_id] ?? null) : null,
        secteur: r.institution_id ? (secteurParId[r.institution_id] ?? null) : null,
        dateRdv: r.date_rdv,
      }));
      setTendances(deriverTendancesCitoyen(rdvPourTendance));

      const aujourdHui = new Date().toISOString().slice(0, 10);
      const { data: rdvActifsRows } = await supabase
        .from("rdv")
        .select("id,institution_id,date_rdv")
        .eq("citoyen_id", id)
        .in("statut", ["nouveau", "en_attente", "confirme"])
        .gte("date_rdv", aujourdHui)
        .order("date_rdv", { ascending: true })
        .limit(20);
      setRdvActifsCount(rdvActifsRows?.length || 0);
      const premierInstId = rdvActifsRows?.[0]?.institution_id;
      if (premierInstId) {
        const { data: instProchain } = await supabase.from("institutions").select("name").eq("id", premierInstId).maybeSingle();
        setProchainRdvNom(instProchain?.name || null);
      }
    })();
  }, []);

  // Cap relevé de 12 à 30 (Lot F, 28/08/2026) — la Rail elle-même n'affiche
  // que les 10 premiers désormais, ce cap plus large sert uniquement à
  // savoir si le bouton "Voir plus" doit apparaître (>10 réels disponibles).
  const railRecommandees = useMemo(() => {
    if (!tendances?.suffisant || !tendances.secteurTop) return [];
    return poolDecouverte.filter(i => i.secteur === tendances.secteurTop).slice(0, 30);
  }, [poolDecouverte, tendances]);

  const railPresDeChezVous = useMemo(() => {
    if (!citoyenVille) return [];
    return poolDecouverte.filter(i => i.ville === citoyenVille).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)).slice(0, 30);
  }, [poolDecouverte, citoyenVille]);

  const railVerifiees = useMemo(() => poolDecouverte.filter(i => i.badge_verifie).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)).slice(0, 30), [poolDecouverte]);
  const railMieuxNotees = useMemo(() => poolDecouverte.filter(i => i.nb_avis > 0).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)).slice(0, 30), [poolDecouverte]);
  const railNouvelles = useMemo(() => poolDecouverte.slice(0, 30), [poolDecouverte]);
  const railPopulaires = useMemo(() => {
    const parId = new Map(poolDecouverte.map(i => [i.id, i]));
    return populairesIds.map(id => parId.get(id)).filter((i): i is Institution => !!i);
  }, [poolDecouverte, populairesIds]);
  const aDesRails = railRecommandees.length > 0 || railPresDeChezVous.length > 0 || favorisInsts.length > 0 || railVerifiees.length > 0 || railMieuxNotees.length > 0 || railNouvelles.length > 0 || railPopulaires.length > 0;

  // "Voir plus" des rails (Lot F, 28/08/2026, référence DoorDash) — cible la
  // grille "Toutes les institutions" juste en dessous, en appliquant le
  // filtre/tri réel déjà existant qui correspond à la section quand il
  // existe (Vérifiés→filterVerifie, Près de chez vous→filterVille, Mieux
  // notées→tri Note). "Recommandé"/"Nouveau"/"Favoris" n'ont pas
  // d'équivalent filtrable honnête aujourd'hui (secteur legacy ≠ taxonomie
  // activite_categorie, pas de tri "plus récent") — on scrolle simplement
  // vers la grille complète plutôt que d'inventer un filtre qui mentirait.
  const grilleRef = useRef<HTMLDivElement | null>(null);
  function scrollVersGrille() {
    grilleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function voirPlusVerifiees() { setFilterVerifie(true); scrollVersGrille(); }
  function voirPlusPresDeChezVous() { if (citoyenVille) setFilterVille(citoyenVille); scrollVersGrille(); }
  function voirPlusMieuxNotees() { setSortBy("note"); scrollVersGrille(); }

  // Fermeture temporaire du bandeau Hero de l'onglet Grille (retour Bryan
  // 28/08/2026) — défaut affiché (évite un flash "masqué" le temps de lire
  // le localStorage), masqué dès que l'effet trouve une fermeture encore
  // valide (< 7 jours).
  const [heroGrilleFerme, setHeroGrilleFerme] = useState(false);
  useEffect(() => {
    let fermeLe: string | null = null;
    try { fermeLe = localStorage.getItem(HERO_GRILLE_FERME_KEY); } catch {}
    // localStorage n'existe pas côté rendu serveur — cette lecture ne peut
    // se faire que dans un effet, même dérogation déjà en place ailleurs
    // dans ce fichier (CarteSheet, shared.tsx) pour la même contrainte
    // ESLint stricte du projet (react-hooks/set-state-in-effect), rendu en
    // cascade ponctuel unique au montage, jamais en boucle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fermeLe && Date.now() - Number(fermeLe) < HERO_FERME_DUREE_MS) setHeroGrilleFerme(true);
  }, []);
  function fermerHeroGrille() {
    setHeroGrilleFerme(true);
    try { localStorage.setItem(HERO_GRILLE_FERME_KEY, String(Date.now())); } catch {}
  }

  // Bandeaux Hero — onglet 1 (découverte/growth) vs onglet 2 (comparaison,
  // 09/08/2026, décision CEO explicitement différente de l'onglet 1).
  const heroSlidesGrille: HeroSlide[] = useMemo(() => ([
    {
      id: "espace",
      bg: "linear-gradient(135deg,#0B3B5C 0%,#0F5C6B 55%,#12786B 100%)",
      kicker: citoyenPrenom ? `Bonjour, ${citoyenPrenom}` : "Bienvenue sur Yelen",
      titre: "Votre espace Yelen",
      texte: "Retrouvez vos activités, vos rendez-vous et vos services en quelques clics.",
      cta: "Accéder à mon espace",
      illustration: <IllustrationEspace/>,
      href: "/",
      onGo: () => { try { sessionStorage.setItem(YELEN224_LAST_TAB_KEY, "compte"); } catch {} },
    },
    {
      id: "offres",
      bg: "linear-gradient(135deg,#7A4200 0%,#C8790A 55%,#F5A623 100%)",
      kicker: "Partenaires vérifiés",
      titre: "Découvrir les Offres",
      texte: "Des offres exclusives proposées par nos partenaires vérifiés Yelen.",
      cta: "Voir les offres",
      illustration: <IllustrationOffres/>,
      href: "/",
      onGo: () => { try { sessionStorage.setItem(YELEN224_LAST_TAB_KEY, "offres"); } catch {} },
    },
    {
      id: "rewards",
      bg: "linear-gradient(135deg,#37105F 0%,#5B1E8C 55%,#7A2FA8 100%)",
      kicker: "Fidélité Yelen",
      titre: "Yelen Rewards",
      texte: "Cumulez des points et débloquez des récompenses réelles au fil de votre activité.",
      cta: "Découvrir Yelen Rewards",
      illustration: <IllustrationRewards/>,
      href: "/menu/recompenses",
    },
  ]), [citoyenPrenom]);

  // Onglet 2 : jamais de doublon avec les 3 bandeaux ci-dessus. "Vérifié"
  // renforce le badge déjà visible sur chaque carte pendant la comparaison
  // (CTA applique le filtre réel déjà existant). "RDV en cours" seulement
  // si le citoyen a de vrais rendez-vous à venir — pas de bandeau vide.
  const heroSlidesListe: HeroSlide[] = useMemo(() => {
    const slides: HeroSlide[] = [
      {
        id: "verifie",
        bg: "linear-gradient(135deg,#12203A 0%,#1B3358 55%,#0F4C75 100%)",
        kicker: "Confiance Yelen",
        titre: "Établissements vérifiés",
        texte: "Identité et activité confirmées par Yelen — repérez le badge bleu en comparant.",
        cta: "Voir les établissements vérifiés",
        illustration: <IllustrationVerifie/>,
        href: "#",
        onGo: () => { setFilterVerifie(true); },
      },
    ];
    if (rdvActifsCount > 0) {
      slides.push({
        id: "rdv",
        bg: "linear-gradient(135deg,#0B3B24 0%,#0F5C3A 55%,#0F7A4A 100%)",
        kicker: "Vos rendez-vous",
        titre: rdvActifsCount > 1 ? `${rdvActifsCount} rendez-vous en cours` : "1 rendez-vous en cours",
        texte: prochainRdvNom ? `Prochain : ${prochainRdvNom}.` : "Retrouvez le détail de vos rendez-vous à venir.",
        cta: "Voir mes rendez-vous",
        illustration: <IllustrationRdv/>,
        href: "/mes-rdv",
      });
    }
    return slides;
  }, [rdvActifsCount, prochainRdvNom]);

  // Institutions réellement positionnables sur la carte (lat/long réelles —
  // aucune institution n'en a encore renseigné à ce jour, l'état vide en
  // tient compte honnêtement) + sous-ensemble filtré par "Rechercher dans
  // cette zone" quand actif.
  const institutionsCarte = useMemo(() => institutions.filter(i => i.latitude && i.longitude), [institutions]);
  const institutionsCarteAffichees = useMemo(
    () => zoneIds === null ? institutionsCarte : institutionsCarte.filter(i => zoneIds.includes(i.id)),
    [institutionsCarte, zoneIds]
  );

  // Sélection effective — aucune présélection par défaut (retour Bryan
  // 21/08/2026, référence Yelp) : tant que le citoyen n'a tapé aucun repère,
  // rien n'est sélectionné. La carte cadre alors tous les établissements
  // visibles via fitBounds (CarteMap.tsx::MapPositioning) au lieu de zoomer
  // sur un seul, et le sheet replié affiche l'invite "Sélectionnez un
  // établissement" au lieu d'ouvrir directement une fiche. Seul un vrai tap
  // (handleSelectSurCarte) ou un clic carte déclenche la sélection et le
  // zoom rapproché.
  const selectedCarteIdEffectif = selectedCarteId;

  function handleZoneChange(ids: string[], parUtilisateur: boolean) {
    if (!parUtilisateur) return;
    setPendingZoneIds(ids);
  }

  function appliquerZone() {
    setZoneIds(pendingZoneIds);
    setPendingZoneIds(null);
  }

  function reinitialiserZone() {
    setZoneIds(null);
    setPendingZoneIds(null);
  }

  // Sélection déclenchée par un tap sur un repère de la carte — le sheet
  // (état replié) affiche alors la fiche de cet établissement.
  function handleSelectSurCarte(id: string) {
    setSelectedCarteId(id);
  }

  // ── Sections personnalisées du sheet, état "Explorer" (§ jamais la même
  // liste qu'en recherche) — mêmes signaux que les rails de l'onglet 1,
  // recalculés ici uniquement sur les établissements réellement
  // positionnables sur la carte (institutionsCarte), pas sur le vivier brut
  // poolDecouverte (qui n'est pas filtré par lat/long). ──
  const sheetRecommandees = useMemo(() => {
    if (!tendances?.suffisant || !tendances.secteurTop) return [];
    return institutionsCarte.filter(i => i.secteur === tendances.secteurTop);
  }, [institutionsCarte, tendances]);
  const sheetFavoris = useMemo(() => favorisInsts.filter(i => i.latitude && i.longitude), [favorisInsts]);
  const sheetPresDeChezVous = useMemo(() => {
    if (!citoyenVille) return [];
    return institutionsCarte.filter(i => i.ville === citoyenVille).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0));
  }, [institutionsCarte, citoyenVille]);
  const sheetVerifiees = useMemo(() => institutionsCarte.filter(i => i.badge_verifie).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)), [institutionsCarte]);
  const sheetMieuxNotees = useMemo(() => institutionsCarte.filter(i => i.nb_avis > 0).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)), [institutionsCarte]);
  const sheetNouvelles = useMemo(() => [...institutionsCarte].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")), [institutionsCarte]);

  const favorisIdsSet = useMemo(() => new Set(favorisInsts.map(i => i.id)), [favorisInsts]);
  const selectedCarteInst = useMemo(() => institutionsCarteAffichees.find(i => i.id === selectedCarteIdEffectif) ?? institutionsCarte.find(i => i.id === selectedCarteIdEffectif) ?? null, [institutionsCarteAffichees, institutionsCarte, selectedCarteIdEffectif]);

  // Ajout/retrait favori depuis le sheet de la Vue Carte — même écriture
  // directe (RLS auth.uid()=citoyen_id) que InstitutionPublicClient.tsx,
  // pas de nouvelle route. Redirige vers l'inscription si non identifié,
  // même garde-fou que partout ailleurs dans le produit.
  async function handleToggleFavoriCarte(inst: Institution) {
    if (!citoyenId) { window.location.href = "/inscription"; return; }
    const estFavori = favorisIdsSet.has(inst.id);
    if (estFavori) {
      setFavorisInsts(prev => prev.filter(i => i.id !== inst.id));
      const { error } = await supabase.from("citoyen_favoris").delete().eq("citoyen_id", citoyenId).eq("institution_id", inst.id);
      if (error) setFavorisInsts(prev => [...prev, inst]);
    } else {
      setFavorisInsts(prev => [...prev, inst]);
      const { error } = await supabase.from("citoyen_favoris").insert({ citoyen_id: citoyenId, institution_id: inst.id });
      if (error) setFavorisInsts(prev => prev.filter(i => i.id !== inst.id));
    }
  }

  const fetchInstitutions = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("institutions")
      // services/website/whatsapp ajoutés (retour Bryan 23/08/2026) — seuls
      // champs bruts manquants pour appeler ctaPourInstitution() (shared.tsx),
      // même moteur que la fiche complète (lib/prestataireCapacites.ts).
      .select("id,name,category,secteur,ville,quartier,moyenne_avis,nb_avis,logo,banniere,badge_verifie,description,statut,adresse,latitude,longitude,phone,disponibilites,horaires,activite_categorie_id,services,website,whatsapp,statut_juridique")
      .eq("statut", "validee");
    // filterCat porte un code (activite_categories.code) — résolu en id
    // pour filtrer sur la vraie FK, jamais sur l'ancien texte libre
    // `category` (gelé, plus jamais écrit depuis la migration Taxonomie).
    if (filterCat) {
      const catId = categories.find(c => c.code === filterCat)?.id;
      if (catId) query = query.eq("activite_categorie_id", catId);
    }
    // Localisation en langage naturel (Lot D, 28/08/2026) — "Restaurants à
    // Conakry" détecte la ville réelle et l'applique comme filtre, le reste
    // de la requête ("Restaurants") sert de recherche par nom. Le filtre
    // Ville manuel (filterVille) reste prioritaire s'il est déjà posé.
    const { motsCles, ville: villeDetectee } = parseLocalisationRequete(search, VILLES_GUINEE);
    if (filterVille) query = query.ilike("ville", `%${filterVille}%`);
    else if (villeDetectee) query = query.ilike("ville", `%${villeDetectee}%`);
    if (filterVerifie) query = query.eq("badge_verifie", true);
    if (motsCles) query = query.ilike("name", `%${motsCles}%`);
    const { data } = await query.limit(100);
    let results = (data || []) as Institution[];
    // Comptage paid_services actifs par institution (retour Bryan
    // 23/08/2026) — dernier champ requis par ctaPourInstitution(), même
    // logique de dérivation hasBooking que la fiche complète (services
    // gratuits OU paid_services actifs, jamais l'un sans vérifier l'autre).
    if (results.length > 0) {
      const { data: paidRows } = await supabase
        .from("paid_services")
        .select("institution_id")
        .in("institution_id", results.map(r => r.id))
        .eq("is_active", true);
      const comptes = new Map<string, number>();
      for (const p of paidRows ?? []) comptes.set(p.institution_id, (comptes.get(p.institution_id) ?? 0) + 1);
      results = results.map(r => ({ ...r, paid_services_actifs: comptes.get(r.id) ?? 0 }));
    }
    if (filterDispos) results = results.filter(r => r.disponibilites && (Array.isArray(r.disponibilites) ? (r.disponibilites as unknown[]).length > 0 : true));
    if (filterType) results = results.filter(r => typeIdentite(r) === filterType);
    if (sortBy === "pertinence") results.sort((a, b) => scorePertinence(b, { search: motsCles, citoyenGeoloc }) - scorePertinence(a, { search: motsCles, citoyenGeoloc }));
    else if (sortBy === "note") results.sort((a, b) => (b.moyenne_avis||0) - (a.moyenne_avis||0));
    else if (sortBy === "avis") results.sort((a, b) => (b.nb_avis||0) - (a.nb_avis||0));
    else results.sort((a, b) => (a.name||"").localeCompare(b.name||""));
    setInstitutions(results);
    setTotal(results.length);
    setPage(0);
    setLoading(false);
  }, [search, filterCat, filterVille, filterVerifie, filterDispos, filterType, sortBy, categories, citoyenGeoloc]);

  useEffect(() => {
    const t = setTimeout(fetchInstitutions, 300);
    return () => clearTimeout(t);
  }, [fetchInstitutions]);

  const activeFilters = [filterCat, filterVille, filterVerifie, filterDispos, filterType].filter(Boolean).length;
  // Hint transparent (Lot D, 28/08/2026) — n'affiche la ville détectée dans
  // le texte tapé que si aucun filtre Ville manuel n'est déjà posé (sinon
  // celui-ci prime déjà, voir fetchInstitutions), pour ne jamais laisser
  // croire à un filtre "caché" quand il est explicite.
  const villeDetecteeAffichage = filterVille ? null : parseLocalisationRequete(search, VILLES_GUINEE).ville;
  const visible = institutions.slice(0, (page + 1) * PER_PAGE);
  const hasMore = visible.length < institutions.length;
  const rechercheActive = search.length > 0 || activeFilters > 0;

  // Callbacks du Search Overlay (chantier 08/08/2026) — l'overlay ne
  // manipule jamais directement l'état du parent, il passe par ces deux
  // points d'entrée explicites, puis se ferme lui-même.
  function handleCommitSearchOverlay(q: string) {
    setSearch(q);
    setVue("grille");
    setHeaderHidden(false);
    setOverlayOpen(false);
  }
  function handleApplyCategorieOverlay(categoryKey: string) {
    setFilterCat(categoryKey);
    setSearch("");
    setVue("grille");
    setHeaderHidden(false);
    setOverlayOpen(false);
  }

  const iBg  = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const iBrd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const t2   = isDark ? "#6E6E7A" : "#6C6C70";

  return (
    /* Vrai correctif du bug sticky/fixed cassés (retour Bryan 06/08/2026,
       reproduit après rechargement complet — mon 1er correctif overflowY
       n'avait aucun effet : la spec CSS force overflow-y à se recalculer
       en "auto" dès que overflow-x est non-visible, PEU IMPORTE qu'on
       écrive explicitement "visible" à côté, donc cette ligne ne changeait
       rien). Cause réelle trouvée par lecture de app/globals.css:124 —
       `* { -webkit-overflow-scrolling: touch }` s'applique à TOUS les
       éléments du site. Combiné à overflow-y qui redevient "auto" sur ce
       conteneur (à cause de overflowX:"hidden" juste en dessous), ce
       conteneur devient un vrai scroller iOS à défilement inertiel — bug
       WebKit connu : les descendants position:fixed/sticky restent piégés
       à l'intérieur au lieu de s'ancrer au vrai viewport. Neutralisé en
       forçant -webkit-overflow-scrolling:auto ICI (spécificité inline,
       l'emporte sur la règle globale `*`), sans toucher à cette règle
       globale ailleurs (utile pour les rangées à défilement horizontal
       volontaire comme les chips/rails). */
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif", color: C.text, overflowX: "hidden", WebkitOverflowScrolling: "auto", paddingBottom: vue === "carte" ? 0 : "40px" }}>
      {/* Sélecteurs globaux non scopés (*, html/body, a, input:focus,
          select option) volontairement omis quand embedded=true — app/page.tsx
          (l'onglet Accueil qui monte ce composant) a déjà ses propres
          règles équivalentes, les dupliquer ici les ferait fuiter sur le
          reste de l'app tant que cet onglet est affiché (fixes projet
          09/08/2026, cf. commentaire sur RechercheInner ci-dessus). Les
          règles scopées par classe (.tap/.inst-card/.skel/.no-scroll)
          restent nécessaires dans les deux cas. */}
      <style>{`
        ${embedded ? "" : `
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        *{scrollbar-width:none}
        input:focus,select:focus{outline:none;border-color:rgba(245,166,35,0.4)!important;box-shadow:0 0 0 3px rgba(245,166,35,0.06)!important}
        select option{background:${isDark?"#0D0D1A":"#fff"};color:${C.text}}
        a{-webkit-tap-highlight-color:transparent}
        `}
        ::-webkit-scrollbar{display:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes skel{0%,100%{opacity:0.4}50%{opacity:0.8}}
        .skel{animation:skel 1.6s ease infinite}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        .inst-card{transition:transform 0.15s,box-shadow 0.15s}
        .inst-card:active{transform:scale(0.98);box-shadow:0 6px 24px rgba(245,166,35,0.15)}
        input::placeholder{color:${t2}}
        .no-scroll::-webkit-scrollbar{display:none}
      `}</style>

      {/* ══ ONGLET 1 (GRILLE) — retour à la version précédente (Bryan
          08/08/2026) : la ligne recherche+vues redevient non-sticky (défile
          avec la page), seule la ligne de catégories reste sticky, comme
          avant le chantier "header fixe" du jour. Seul changement conservé
          de ce chantier : le logo est remplacé par une icône retour vers
          l'accueil — mêmes dimensions/style que l'icône retour déjà
          utilisée sur l'onglet Carte plus bas (bouton carré C.cardBg,
          flèche ligne+polyline), pour qu'elles soient identiques entre les
          deux onglets plutôt qu'une forme inventée différente. ══ */}
      {vue === "grille" && (
        <>
          {/* position:fixed (pas sticky) — même traitement que le header
              Offres de app/page.tsx, retour Bryan 23/08/2026 après un 1er
              essai en sticky resté figé au test réel : sticky + transform
              sur le même élément est un bug Safari/iOS connu (le sticky ne
              se "recolle" plus après un scroll), déjà vu une fois dans ce
              fichier pour une autre raison (cf. le commentaire
              -webkit-overflow-scrolling plus haut). Fixed est immunisé,
              donc le espaceur juste après réserve sa place dans le flux. */}
          <div
            ref={headerRef}
            style={{
              position: "fixed", top: 0, left: 0, right: 0, zIndex: 310,
              backgroundColor: isDark ? "rgba(8,8,15,0.98)" : "rgba(248,248,251,0.98)",
              backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
              transform: headerHidden ? "translateY(-100%)" : "translateY(0)",
              transition: "transform 0.25s ease",
            }}
          >
          <div style={{ padding: "calc(11px + env(safe-area-inset-top)) 16px 11px", display: "flex", alignItems: "center", gap: "10px" }}>
            {embedded ? (
              <button onClick={onBack} aria-label="Retour à l'accueil" className="tap" style={{ width: "34px", height: "34px", borderRadius: "12px", flexShrink: 0, background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.06)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              </button>
            ) : (
              <Link href="/" aria-label="Retour à l'accueil" className="tap" style={{ width: "34px", height: "34px", borderRadius: "12px", flexShrink: 0, background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.06)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              </Link>
            )}

            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {/* Barre de recherche — n'est plus un champ de saisie mais un
                  déclencheur (retour Bryan 08/08/2026, Search Overlay) :
                  au clic, ouverture de RechercheOverlay en plein écran,
                  clavier et curseur placés là-bas, pas ici. */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "999px", padding: "5px 5px 5px 13px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <div onClick={() => setOverlayOpen(true)} className="tap" style={{ flex: 1, minWidth: 0, cursor: "pointer", padding: "6px 0", fontSize: "13.5px", color: search ? C.text : t2, fontWeight: search ? "600" : "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{search || "Institution, service, ville…"}</div>
                {search && (
                  <button onClick={() => setSearch("")} aria-label="Effacer" style={{ background: "none", border: "none", color: t2, cursor: "pointer", display: "flex", padding: "2px", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
                <button onClick={() => setShowFilters(f => !f)} className="tap" aria-label="Filtres" style={{ width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0, background: activeFilters > 0 ? "#F5A623" : "#111111", color: activeFilters > 0 ? "#080812" : "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
                  {activeFilters > 0 && <span style={{ position: "absolute", top: "-3px", right: "-3px", width: "13px", height: "13px", borderRadius: "50%", background: "#080812", color: "#F5A623", fontSize: "7.5px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${isDark ? "rgba(8,8,15,0.98)" : "rgba(248,248,251,0.98)"}` }}>{activeFilters}</span>}
                </button>
              </div>
            </div>

            <div style={{ position: "relative", display: "flex", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "12px", padding: "3px", gap: "2px", flexShrink: 0 }}>
              {([
                { k: "grille", label: "Grille" },
                { k: "liste",  label: "Liste" },
                { k: "carte",  label: "Carte" },
              ] as { k: "grille"|"liste"|"carte"; label: string }[]).map(v => (
                <button key={v.k} onClick={() => { setVue(v.k); if (v.k === "liste") setHeaderHidden(false); if (coachMarkVuesVisible) fermerCoachMarkVues(); }} aria-label={v.label} className="tap" style={{ width: "30px", height: "28px", borderRadius: "8px", border: "none", background: vue === v.k ? "#F5A623" : "transparent", color: vue === v.k ? "#080812" : t2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  {v.k === "grille" && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>}
                  {v.k === "liste" && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>}
                  {v.k === "carte" && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>}
                </button>
              ))}

              {/* Coach mark — pointe vers ce groupe de vues, une seule fois
                  par appareil (voir useEffect coachMarkVuesVisible plus haut). */}
              {coachMarkVuesVisible && (
                <div onClick={fermerCoachMarkVues} className="tap" style={{ position: "absolute", top: "calc(100% + 11px)", right: "0", zIndex: 9300, width: "196px", cursor: "pointer", animation: "fadeUp 0.3s ease" }}>
                  <div style={{ position: "absolute", top: "-5px", right: "18px", width: "10px", height: "10px", background: "#F5A623", transform: "rotate(45deg)" }}/>
                  <div style={{ background: "#F5A623", borderRadius: "14px", padding: "12px 14px", boxShadow: "0 10px 28px rgba(0,0,0,0.28)" }}>
                    <div style={{ color: "#080812", fontSize: "12.5px", fontWeight: "800", marginBottom: "3px" }}>Grille, Liste ou Carte</div>
                    <div style={{ color: "rgba(8,8,18,0.7)", fontSize: "11.5px", lineHeight: 1.5 }}>Ces 3 icônes changent l&apos;affichage des résultats — touchez pour essayer.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
          {/* Espaceur — le header est désormais position:fixed (retiré du
              flux), cette réserve empêche la ligne catégories de se
              retrouver cachée dessous à l'arrivée sur l'écran. */}
          <div style={{ height: `${headerH}px` }}/>

          {/* Ligne catégories — icône au-dessus du libellé, pas de fond en
              pilule, même esprit que la ligne Happy Hour/Grocery/Pickup de
              DoorDash. position:sticky natif — colle désormais juste sous
              le header ci-dessus (top dynamique = hauteur mesurée du
              header, ou l'inset de sécurité seul quand le header est
              masqué au scroll vers le bas) plutôt qu'un offset fixe. */}
          <div style={{ position: "sticky", top: headerHidden ? "env(safe-area-inset-top)" : `${headerH}px`, zIndex: 300, backgroundColor: isDark ? "rgba(8,8,15,0.98)" : "rgba(248,248,251,0.98)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: `1px solid ${isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)"}`, transition: "top 0.25s ease" }}>
            <div className="no-scroll" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", gap: "4px", padding: "10px 10px", width: "max-content" }}>
                <button onClick={() => setFilterCat("")} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", minWidth: "56px" }}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={!filterCat ? "#F5A623" : t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
                  <span style={{ color: !filterCat ? "#F5A623" : t2, fontSize: "10.5px", fontWeight: !filterCat ? "800" : "600", whiteSpace: "nowrap" }}>Tout</span>
                  <div style={{ width: "16px", height: "2.5px", borderRadius: "2px", background: !filterCat ? "#F5A623" : "transparent" }}/>
                </button>
                {categories.map(cat => {
                  const actif = filterCat === cat.code;
                  return (
                    <button key={cat.id} onClick={() => setFilterCat(actif ? "" : cat.code)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", minWidth: "56px" }}>
                      <ActiviteCategorieIcon code={cat.code} color={actif ? "#F5A623" : t2} size={21}/>
                      <span style={{ color: actif ? "#F5A623" : t2, fontSize: "10.5px", fontWeight: actif ? "800" : "600", whiteSpace: "nowrap" }}>{ACTIVITE_CATEGORIE_SHORT[cat.code] ?? cat.label}</span>
                      <div style={{ width: "16px", height: "2.5px", borderRadius: "2px", background: actif ? "#F5A623" : "transparent" }}/>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ ONGLET 2 (LISTE) — retour Bryan 23/08/2026 : seule la ligne
          logo+vues+compteur devient le header (fixed, masqué/réaffiché au
          scroll, même mécanique que l'onglet Grille) ; la barre de
          recherche et les chips catégories redeviennent du contenu
          d'écran normal (ni sticky ni fixed), au lieu d'être toutes deux
          empilées dans le même bloc figé qu'avant. ══ */}
      {vue === "liste" && (
        <>
          <div ref={headerRef} style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 310, backgroundColor: isDark ? "rgba(8,8,15,0.98)" : "rgba(248,248,251,0.98)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: `1px solid ${isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)"}`, paddingTop: "env(safe-area-inset-top)", transform: headerHidden ? "translateY(-100%)" : "translateY(0)", transition: "transform 0.25s ease" }}>
            {/* Ligne logo + vues + compteur */}
            <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
              <Link href="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", flexShrink: 0 }}>
                <div style={{ width: "28px", height: "28px", background: "#F5A623", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
                </div>
                <div style={{ lineHeight: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: "900", color: C.text, letterSpacing: "0.4px" }}>YELEN224</div>
                  <div style={{ fontSize: "7px", fontWeight: "700", color: "#F5A623", letterSpacing: "1.5px" }}>ANNUAIRE</div>
                </div>
              </Link>

              <div style={{ flex: 1 }}/>

              {/* Toggle vue — icônes modernisées (grille/liste conservées et
                  agrandies, carte remplacée par une vraie boussole). */}
              <div style={{ display: "flex", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "12px", padding: "3px", gap: "2px" }}>
                {([
                  { k: "grille", label: "Grille" },
                  { k: "liste",  label: "Liste" },
                  { k: "carte",  label: "Carte" },
                ] as { k: "grille"|"liste"|"carte"; label: string }[]).map(v => (
                  <button key={v.k} onClick={() => { setVue(v.k); if (v.k === "grille" || v.k === "liste") setHeaderHidden(false); }} aria-label={v.label} className="tap" style={{ width: "32px", height: "28px", borderRadius: "8px", border: "none", background: vue === v.k ? "#F5A623" : "transparent", color: vue === v.k ? "#080812" : t2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {v.k === "grille" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>}
                    {v.k === "liste" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>}
                    {v.k === "carte" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>}
                  </button>
                ))}
              </div>

              {!loading && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ color: "#F5A623", fontSize: "13px", fontWeight: "900", lineHeight: 1 }}>{total}</div>
                  <div style={{ color: t2, fontSize: "8px", fontWeight: "600" }}>résultats</div>
                </div>
              )}
            </div>
          </div>
          {/* Espaceur — le header ci-dessus est position:fixed (retiré du
              flux), cette réserve empêche la recherche/chips de se
              retrouver cachées dessous à l'arrivée sur l'écran. */}
          <div style={{ height: `${headerH}px` }}/>

          {/* Barre recherche + suggestions — contenu d'écran normal
              (retiré du header, ni sticky ni fixed). */}
          <div style={{ padding: "10px 16px 10px", position: "relative" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <div onClick={() => setOverlayOpen(true)} className="tap" style={{ flex: 1, position: "relative", cursor: "pointer" }}>
                <div style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#F5A623" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                </div>
                <div style={{ width: "100%", padding: "10px 36px 10px 36px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "12px", fontSize: "14px", color: search ? C.text : t2, fontWeight: search ? "600" : "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{search || "Institution, service, ville…"}</div>
                {search && (
                  <button onClick={e => { e.stopPropagation(); setSearch(""); }} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t2, cursor: "pointer", display: "flex", padding: "2px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
              <button onClick={() => setShowFilters(f => !f)} className="tap" style={{ width: "42px", height: "40px", borderRadius: "12px", flexShrink: 0, background: activeFilters > 0 ? "#F5A623" : iBg, border: activeFilters > 0 ? "none" : `1px solid ${iBrd}`, color: activeFilters > 0 ? "#080812" : t2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", boxShadow: activeFilters > 0 ? "0 2px 6px rgba(0,0,0,0.15)" : "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
                {activeFilters > 0 && <span style={{ position: "absolute", top: "-4px", right: "-4px", width: "15px", height: "15px", borderRadius: "50%", background: "#080812", color: "#F5A623", fontSize: "8px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.pageBg}` }}>{activeFilters}</span>}
              </button>
            </div>
          </div>

          {/* Chips catégories scrollables — état actif adouci (§1 du plan) */}
          <div className="no-scroll" style={{ overflowX: "auto", paddingBottom: "11px" }}>
            <div style={{ display: "flex", gap: "6px", padding: "0 16px", width: "max-content" }}>
              <button onClick={() => setFilterCat("")} className="tap" style={{ padding: "6px 13px", borderRadius: "20px", border: `1px solid ${!filterCat ? "#F5A623" : iBrd}`, background: iBg, color: !filterCat ? "#F5A623" : t2, fontSize: "11px", fontWeight: !filterCat ? "800" : "600", cursor: "pointer" }}>
                Tout
              </button>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setFilterCat(filterCat === cat.code ? "" : cat.code)} className="tap" style={{ padding: "6px 12px", borderRadius: "20px", border: `1px solid ${filterCat === cat.code ? "#F5A623" : iBrd}`, background: iBg, color: filterCat === cat.code ? "#F5A623" : t2, fontSize: "11px", fontWeight: filterCat === cat.code ? "800" : "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}>
                  <ActiviteCategorieIcon code={cat.code} color="currentColor" size={9}/>
                  {ACTIVITE_CATEGORIE_SHORT[cat.code] ?? cat.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══ HEADER (onglet Carte uniquement) — façon DoorDash exactement
          (référence, pas une copie littérale — captures Bryan 06/08/2026) :
          flèche retour + recherche flottante en haut, la carte reste
          l'élément central de l'écran, jamais recouverte par du chrome.
          Chips catégories ajoutées juste en dessous (même esprit que les
          puces DashPass/Ratings/Price de DoorDash sous leur recherche) —
          seule façon de filtrer par catégorie sur cet onglet maintenant que
          l'ancienne barre du bas (qui les portait) est retirée. La flèche
          retour ramène à l'onglet Grille (pas de navigation de route ici,
          les 3 vues vivent sur la même page) — équivalent le plus proche du
          "retour à la liste" de DoorDash dans notre architecture à onglets.
          Grille/Liste gardent le header classique ci-dessus, inchangé. ══ */}
      {vue === "carte" && (
        <div style={{ position: "sticky", top: 0, zIndex: 300, backgroundColor: isDark ? "rgba(8,8,15,0.94)" : "rgba(248,248,251,0.94)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", paddingTop: "env(safe-area-inset-top)" }}>
          <div style={{ padding: "10px 16px 12px", position: "relative" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setVue("grille"); setHeaderHidden(false); }} aria-label="Retour" className="tap" style={{ width: "42px", height: "42px", borderRadius: "14px", flexShrink: 0, background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.06)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              </button>
              <div onClick={() => setOverlayOpen(true)} className="tap" style={{ flex: 1, position: "relative", cursor: "pointer" }}>
                <div style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#F5A623" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                </div>
                <div style={{ width: "100%", padding: "11px 36px 11px 37px", background: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", fontSize: "14px", color: search ? C.text : t2, fontWeight: search ? "600" : "500", boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{search || "Institution, service, ville…"}</div>
                {search && (
                  <button onClick={e => { e.stopPropagation(); setSearch(""); }} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t2, cursor: "pointer", display: "flex", padding: "2px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
              <button onClick={() => setShowFilters(f => !f)} className="tap" style={{ width: "42px", height: "42px", borderRadius: "14px", flexShrink: 0, background: activeFilters > 0 ? "#F5A623" : C.cardBg, border: activeFilters > 0 ? "none" : `1px solid ${C.borderCard}`, color: activeFilters > 0 ? "#080812" : t2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", boxShadow: activeFilters > 0 ? "0 2px 6px rgba(0,0,0,0.15)" : (isDark ? "0 4px 16px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.06)") }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
                {activeFilters > 0 && <span style={{ position: "absolute", top: "-4px", right: "-4px", width: "15px", height: "15px", borderRadius: "50%", background: "#080812", color: "#F5A623", fontSize: "8px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.pageBg}` }}>{activeFilters}</span>}
              </button>
            </div>
          </div>

          {/* Chips catégories — modernisées (retour Bryan 21/08/2026) :
              même style icône-au-dessus-du-libellé que l'onglet 1 (ligne
              1071-1091), plus la pilule "texte seul" d'origine. */}
          <div className="no-scroll" style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", gap: "4px", padding: "0 10px 11px", width: "max-content" }}>
              <button onClick={() => setFilterCat("")} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", minWidth: "56px" }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={!filterCat ? "#F5A623" : t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
                <span style={{ color: !filterCat ? "#F5A623" : t2, fontSize: "10.5px", fontWeight: !filterCat ? "800" : "600", whiteSpace: "nowrap" }}>Tout</span>
                <div style={{ width: "16px", height: "2.5px", borderRadius: "2px", background: !filterCat ? "#F5A623" : "transparent" }}/>
              </button>
              {categories.map(cat => {
                const actif = filterCat === cat.code;
                return (
                  <button key={cat.id} onClick={() => setFilterCat(actif ? "" : cat.code)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", minWidth: "56px" }}>
                    <ActiviteCategorieIcon code={cat.code} color={actif ? "#F5A623" : t2} size={21}/>
                    <span style={{ color: actif ? "#F5A623" : t2, fontSize: "10.5px", fontWeight: actif ? "800" : "600", whiteSpace: "nowrap" }}>{ACTIVITE_CATEGORIE_SHORT[cat.code] ?? cat.label}</span>
                    <div style={{ width: "16px", height: "2.5px", borderRadius: "2px", background: actif ? "#F5A623" : "transparent" }}/>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ HERO — carrousel de bandeaux (décision CEO 07-09/08/2026) :
          onglet 1 = découverte/growth (Compte/Offres/Rewards), onglet 2 =
          comparaison (Vérifié + RDV en cours réel) — contenus
          délibérément différents, jamais un doublon. ══ */}
      {!rechercheActive && vue === "grille" && !heroGrilleFerme && (
        <HeroCarousel slides={heroSlidesGrille} onClose={fermerHeroGrille} C={C as typeof T["dark"]}/>
      )}
      {!rechercheActive && vue === "liste" && (
        <HeroCarousel slides={heroSlidesListe} C={C as typeof T["dark"]}/>
      )}

      {/* ══ FILTRES AVANCÉS ══ */}
      {showFilters && (
        <div style={{ margin: "10px 16px", background: C.cardBg, border: `1px solid rgba(245,166,35,0.12)`, borderRadius: "16px", padding: "16px", animation: "slideDown 0.2s ease" }}>
          <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Filtres avancés</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
            {[
              { label: "Ville", val: filterVille, onChange: (v: string) => setFilterVille(v), options: VILLES_GUINEE, placeholder: "Toutes les villes" },
            ].map(f => (
              <div key={f.label}>
                <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>{f.label}</div>
                <select value={f.val} onChange={e => f.onChange(e.target.value)} style={{ width: "100%", padding: "9px 10px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "10px", fontSize: "12px", color: C.text, fontWeight: "600" }}>
                  <option value="">{f.placeholder}</option>
                  {f.options.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            ))}
            <div>
              <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>Trier par</div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as "pertinence"|"note"|"avis"|"nom")} style={{ width: "100%", padding: "9px 10px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "10px", fontSize: "12px", color: C.text, fontWeight: "600" }}>
                <option value="pertinence">Pertinence</option>
                <option value="note">Meilleure note</option>
                <option value="avis">Plus d&apos;avis</option>
                <option value="nom">Alphabétique</option>
              </select>
            </div>
          </div>

          {/* Filtre Type — Institution/Entreprise/Profession (Lot A,
              28/08/2026), dérivé de statut_juridique (shared.tsx::typeIdentite),
              chips plutôt qu'un <select> : sélection unique, "Tous" = aucun
              filtre, même pattern visuel que les chips catégories. */}
          <div style={{ marginBottom: "10px" }}>
            <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>Type</div>
            {/* Chips à largeur naturelle qui s'enroulent (Lot E, 28/08/2026,
                mobile-first) — pas de flex:1 équitable : "Professionnels"
                aurait forcé un retour à la ligne dans une colonne trop
                étroite sur petit écran, jamais un texte tronqué/écrasé. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {([
                { k: "", l: "Tous" },
                { k: "institution", l: "Institutions" },
                { k: "entreprise", l: "Entreprises" },
                { k: "profession", l: "Professionnels" },
              ] as { k: TypeIdentite | ""; l: string }[]).map(opt => (
                <button key={opt.k || "tous"} onClick={() => setFilterType(opt.k)} className="tap" style={{ padding: "7px 12px", borderRadius: "20px", border: `1px solid ${filterType === opt.k ? C.text : iBrd}`, background: filterType === opt.k ? C.text : iBg, color: filterType === opt.k ? C.pageBg : t2, fontSize: "11px", fontWeight: filterType === opt.k ? "800" : "600", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { label: "Institutions vérifiées uniquement", val: filterVerifie, set: () => setFilterVerifie(v => !v), path: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
              { label: "Avec créneaux disponibles",         val: filterDispos,   set: () => setFilterDispos(v => !v),   path: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
            ].map(f => (
              <button key={f.label} onClick={f.set} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "10px", cursor: "pointer" }}>
                {/* Noir plutôt que doré à l'état coché (retour Bryan
                    28/08/2026) — C.text plutôt que #111 en dur : reste
                    "noir" en thème clair tout en restant visible en thème
                    sombre (où C.text est clair), même logique que
                    C.pageBg pour le contraste du check à l'intérieur. */}
                <div style={{ width: "18px", height: "18px", borderRadius: "5px", background: f.val ? C.text : "transparent", border: `2px solid ${f.val ? C.text : iBrd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                  {f.val && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.pageBg} strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={f.val ? C.text : t2} strokeWidth="2" strokeLinecap="round"><path d={f.path}/></svg>
                <span style={{ color: f.val ? C.text : t2, fontSize: "12px", fontWeight: f.val ? "700" : "500", flex: 1, textAlign: "left" }}>{f.label}</span>
              </button>
            ))}
          </div>
          {activeFilters > 0 && (
            <button onClick={() => { setFilterCat(""); setFilterVille(""); setFilterVerifie(false); setFilterDispos(false); setFilterType(""); setSearch(""); }} className="tap" style={{ width: "100%", marginTop: "10px", padding: "10px", background: "#F5A623", border: "none", borderRadius: "10px", color: "#080812", fontSize: "11.5px", fontWeight: "800", cursor: "pointer" }}>
              Réinitialiser ({activeFilters} filtre{activeFilters > 1 ? "s" : ""})
            </button>
          )}
        </div>
      )}

      {/* ══ RAILS DE DÉCOUVERTE (§3 du plan) ══ — masqués pendant une
          recherche/filtre actif (place à la grille de résultats), jamais
          affichés vides. */}
      {!rechercheActive && vue === "grille" && aDesRails && (
        <div style={{ paddingTop: "18px" }}>
          <RailPopulaire institutions={railPopulaires} C={C as typeof T["dark"]} t2={t2} categorieById={categorieById} favorisIdsSet={favorisIdsSet} onToggleFavori={handleToggleFavoriCarte} onVoirPlus={scrollVersGrille} onVoirPlusDescription={setDescriptionSheetInst}/>
          <Rail titre="Recommandé pour vous" sousTitre={tendances?.secteurTopLabel ? `Basé sur vos rendez-vous en ${tendances.secteurTopLabel.toLowerCase()}` : undefined} institutions={railRecommandees} C={C as typeof T["dark"]} t2={t2} categorieById={categorieById} citoyenGeoloc={citoyenGeoloc} favorisIdsSet={favorisIdsSet} onToggleFavori={handleToggleFavoriCarte} onVoirPlus={scrollVersGrille}/>
          <Rail titre="Vos favoris" institutions={favorisInsts} C={C as typeof T["dark"]} t2={t2} categorieById={categorieById} citoyenGeoloc={citoyenGeoloc} favorisIdsSet={favorisIdsSet} onToggleFavori={handleToggleFavoriCarte} onVoirPlus={scrollVersGrille} hideCover/>
          <Rail titre="Nouveau sur Yelen" institutions={railNouvelles} C={C as typeof T["dark"]} t2={t2} categorieById={categorieById} citoyenGeoloc={citoyenGeoloc} favorisIdsSet={favorisIdsSet} onToggleFavori={handleToggleFavoriCarte} onVoirPlus={scrollVersGrille}/>
          <Rail titre="Près de chez vous" sousTitre={citoyenVille ? `À ${citoyenVille}` : undefined} institutions={railPresDeChezVous} C={C as typeof T["dark"]} t2={t2} categorieById={categorieById} citoyenGeoloc={citoyenGeoloc} favorisIdsSet={favorisIdsSet} onToggleFavori={handleToggleFavoriCarte} onVoirPlus={voirPlusPresDeChezVous}/>
          <Rail titre="Établissements vérifiés" sousTitre="Identité et activité confirmées par Yelen" institutions={railVerifiees} C={C as typeof T["dark"]} t2={t2} categorieById={categorieById} citoyenGeoloc={citoyenGeoloc} favorisIdsSet={favorisIdsSet} onToggleFavori={handleToggleFavoriCarte} onVoirPlus={voirPlusVerifiees}/>
          <Rail titre="Les mieux notées" institutions={railMieuxNotees} C={C as typeof T["dark"]} t2={t2} categorieById={categorieById} citoyenGeoloc={citoyenGeoloc} favorisIdsSet={favorisIdsSet} onToggleFavori={handleToggleFavoriCarte} onVoirPlus={voirPlusMieuxNotees} hideCover/>
        </div>
      )}

      {/* ══ CONTENU ══ */}
      <main style={{ padding: "12px 16px 0" }}>

        {/* Skeleton — chaque vue garde son propre flow, y compris au chargement */}
        {loading && vue === "grille" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} isDark={isDark}/>)}
          </div>
        )}
        {loading && vue === "liste" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} isDark={isDark} C={C as typeof T["dark"]}/>)}
          </div>
        )}
        {loading && vue === "carte" && (
          <div style={{ height: "calc(100svh - 172px)", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={28}/></div>
        )}

        {/* ── VUE CARTE (onglet 3) — carte plein écran + sheet DoorDash
            (référence, pas une copie littérale — captures Bryan
            06/08/2026) : le sheet remplace entièrement l'ancien carrousel
            horizontal ET l'ancienne barre du bas. "Rechercher dans cette
            zone" recalcule 100% côté client depuis les institutions déjà
            chargées — aucun nouvel appel réseau. ── */}
        {!loading && vue === "carte" && (
          <div style={{ margin: "-12px -16px 0", position: "relative", height: "calc(100svh - 172px)" }}>
            {institutionsCarte.length === 0 ? (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
                <Image
                  src="/illustrations/recherche-carte-vide.png"
                  alt="Aucun établissement localisé"
                  width={1254}
                  height={1254}
                  style={{ width: "104px", height: "auto", margin: "0 auto 14px", display: "block" }}
                />
                <div style={{ color: C.text, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Aucun établissement localisé pour l&apos;instant</div>
                <div style={{ color: t2, fontSize: "12px", lineHeight: 1.6 }}>Les établissements apparaîtront ici dès qu&apos;ils auront renseigné leur position depuis leur espace Yelen224.</div>
              </div>
            ) : (
              <>
                <CarteMap institutions={institutionsCarteAffichees} selectedId={selectedCarteIdEffectif} onSelect={handleSelectSurCarte} onZoneChange={handleZoneChange} citoyenGeoloc={citoyenGeoloc}/>

                {pendingZoneIds !== null ? (
                  <button onClick={appliquerZone} className="tap" style={{ position: "absolute", top: "14px", left: "50%", transform: "translateX(-50%)", zIndex: 900, backgroundColor: isDark ? "#0D0D1A" : "#fff", border: `1px solid ${iBrd}`, borderRadius: "20px", padding: "8px 16px", fontSize: "12px", fontWeight: "800", color: C.text, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    Rechercher dans cette zone
                  </button>
                ) : zoneIds !== null && (
                  <button onClick={reinitialiserZone} className="tap" style={{ position: "absolute", top: "14px", left: "50%", transform: "translateX(-50%)", zIndex: 900, backgroundColor: isDark ? "#0D0D1A" : "#fff", border: `1px solid ${iBrd}`, borderRadius: "20px", padding: "8px 16px", fontSize: "12px", fontWeight: "800", color: t2, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: "6px" }}>
                    Toutes les zones
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}

                <CarteSheet
                  rechercheActive={rechercheActive}
                  search={search}
                  selectedInst={selectedCarteInst}
                  filteredInstitutions={institutionsCarteAffichees}
                  sheetRecommandees={sheetRecommandees}
                  secteurTopLabel={tendances?.secteurTopLabel ?? null}
                  sheetFavoris={sheetFavoris}
                  sheetPresDeChezVous={sheetPresDeChezVous}
                  citoyenVille={citoyenVille}
                  sheetVerifiees={sheetVerifiees}
                  sheetMieuxNotees={sheetMieuxNotees}
                  sheetNouvelles={sheetNouvelles}
                  sansAucuneInstitution={institutionsCarte.length === 0}
                  citoyenGeoloc={citoyenGeoloc}
                  favorisIdsSet={favorisIdsSet}
                  onToggleFavori={handleToggleFavoriCarte}
                  onSelectInstitution={handleSelectSurCarte}
                  onDeselectInstitution={() => setSelectedCarteId(null)}
                  mapAreaHeight={typeof window !== "undefined" ? window.innerHeight - 172 : 600}
                  C={C as typeof T["dark"]}
                  t2={t2}
                  isDark={isDark}
                  categorieById={categorieById}
                />
              </>
            )}
          </div>
        )}

        {/* Aucun résultat — jamais un simple "Aucun résultat" sec (brief
            "conclusion du parcours de recherche", 28/08/2026) : la
            formulation est contextualisée, et 2 actions de récupération
            immédiates sont proposées plutôt qu'une impasse. Illustration
            Yelen dédiée (décision Bryan du 07/09/2026, annule la règle
            "pas de personnages dessinés à la main" documentée dans
            RechercheOverlay.tsx pour cet écran) — public/illustrations/recherche-aucun-resultat.jpg. */}
        {!loading && vue !== "carte" && institutions.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 16px 8px", animation: "fadeUp 0.3s ease" }}>
            <Image
              src="/illustrations/recherche-aucun-resultat.jpg"
              alt="Aucun résultat trouvé"
              width={1214}
              height={651}
              style={{ width: "230px", maxWidth: "100%", height: "auto", margin: "0 auto 18px", display: "block" }}
            />
            <div style={{ color: C.text, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>C&apos;est tout pour cette recherche</div>
            <div style={{ color: t2, fontSize: "12px", lineHeight: 1.6, maxWidth: "300px", margin: "0 auto 20px" }}>
              {rechercheActive
                ? "Nous n'avons trouvé aucun établissement correspondant à vos critères actuels."
                : "Aucun établissement n'est encore référencé ici."}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "260px", margin: "0 auto" }}>
              {rechercheActive && (
                <button onClick={() => setShowFilters(true)} className="tap" style={{ padding: "12px 20px", background: "#F5A623", borderRadius: "12px", border: "none", color: "#080812", fontWeight: "800", fontSize: "13px", cursor: "pointer" }}>
                  Modifier les filtres
                </button>
              )}
              <button onClick={() => { setFilterCat(""); setFilterVille(""); setFilterVerifie(false); setFilterDispos(false); setFilterType(""); setSearch(""); }} className="tap" style={{ padding: "12px 20px", background: iBg, border: `1px solid ${iBrd}`, borderRadius: "12px", color: C.text, fontWeight: "800", fontSize: "13px", cursor: "pointer" }}>
                Explorer les catégories
              </button>
            </div>

            {categories.length > 0 && (
              <div style={{ marginTop: "26px" }}>
                <div className="no-scroll" style={{ overflowX: "auto" }}>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "center", padding: "0 4px", width: "max-content", margin: "0 auto" }}>
                    {categories.slice(0, 6).map(cat => (
                      <button key={cat.id} onClick={() => { setFilterCat(cat.code); setSearch(""); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "20px", border: `1px solid ${iBrd}`, background: iBg, cursor: "pointer", whiteSpace: "nowrap" }}>
                        <ActiviteCategorieIcon code={cat.code} color={t2} size={14}/>
                        <span style={{ color: C.text, fontSize: "11.5px", fontWeight: "700" }}>{ACTIVITE_CATEGORIE_SHORT[cat.code] ?? cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <SignatureYelen C={C as typeof T["dark"]} t2={t2}/>
          </div>
        )}

        {/* ── GRILLE 2 colonnes style Amazon ── */}
        {!loading && vue === "grille" && institutions.length > 0 && (
          <div ref={grilleRef}>
            {/* En-tête "Comparez N établissements" + tri (retour Bryan
                28/08/2026) — même en-tête que la Vue Liste (onglet 2),
                jamais réservé à un seul onglet : le tri était déjà possible
                en Liste mais invisible/inaccessible depuis la Grille par
                défaut. Remplace l'ancien "Toutes les institutions", affiché
                uniquement hors recherche active. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ color: C.text, fontSize: "14.5px", fontWeight: "800", letterSpacing: "-0.2px" }}>Comparez {total} établissement{total > 1 ? "s" : ""}{villeDetecteeAffichage ? ` à ${villeDetecteeAffichage}` : ""}</div>
              <div style={{ display: "flex", gap: "6px" }}>
                {([
                  { k: "pertinence", l: "Pertinence" },
                  { k: "note", l: "Note" },
                  { k: "avis", l: "Avis" },
                  { k: "nom",  l: "A-Z" },
                ] as { k: "pertinence"|"note"|"avis"|"nom"; l: string }[]).map(s => (
                  <button key={s.k} onClick={() => setSortBy(s.k)} className="tap" style={{ padding: "5px 11px", borderRadius: "16px", border: `1px solid ${sortBy === s.k ? C.text : iBrd}`, background: sortBy === s.k ? C.text : iBg, color: sortBy === s.k ? C.pageBg : t2, fontSize: "10.5px", fontWeight: sortBy === s.k ? "800" : "600", cursor: "pointer" }}>
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", animation: "fadeUp 0.3s ease" }}>
              {visible.map(inst => <CardGrille key={inst.id} inst={inst} C={C as typeof T["dark"]} categorieById={categorieById}/>)}
            </div>
            {hasMore && (
              <button onClick={() => setPage(p => p + 1)} className="tap" style={{ width: "100%", marginTop: "12px", padding: "13px", background: iBg, border: "1px solid rgba(245,166,35,0.2)", borderRadius: "14px", color: "#F5A623", fontWeight: "700", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m7 10 5 5 5-5"/></svg>
                Charger la suite ({institutions.length - visible.length} restants)
              </button>
            )}
          </div>
        )}

        {/* ── VUE HORIZONTALE (onglet 2) — liste détaillée pour comparer,
            flow distinct de la grille de découverte (onglet 1) : rangées
            pleine largeur, fiche plus complète par établissement (adresse,
            téléphone), tri exposé directement plutôt que caché dans les
            filtres avancés. ── */}
        {!loading && vue === "liste" && institutions.length > 0 && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ color: C.text, fontSize: "14.5px", fontWeight: "800", letterSpacing: "-0.2px" }}>Comparez {total} établissement{total > 1 ? "s" : ""}{villeDetecteeAffichage ? ` à ${villeDetecteeAffichage}` : ""}</div>
              <div style={{ display: "flex", gap: "6px" }}>
                {([
                  { k: "pertinence", l: "Pertinence" },
                  { k: "note", l: "Note" },
                  { k: "avis", l: "Avis" },
                  { k: "nom",  l: "A-Z" },
                ] as { k: "pertinence"|"note"|"avis"|"nom"; l: string }[]).map(s => (
                  <button key={s.k} onClick={() => setSortBy(s.k)} className="tap" style={{ padding: "5px 11px", borderRadius: "16px", border: `1px solid ${sortBy === s.k ? C.text : iBrd}`, background: sortBy === s.k ? C.text : iBg, color: sortBy === s.k ? C.pageBg : t2, fontSize: "10.5px", fontWeight: sortBy === s.k ? "800" : "600", cursor: "pointer" }}>
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {visible.map(inst => {
              const meta = categorieVisuel(inst, categorieById);
              const hasD = inst.disponibilites && (Array.isArray(inst.disponibilites) ? (inst.disponibilites as unknown[]).length > 0 : true);
              // CTA réel (retour Bryan 23/08/2026, shared.tsx::ctaPourInstitution)
              // — remplace la duplication inline de CATEGORIES_RESERVATION qui
              // affichait "RDV"/"Réserver" sans jamais vérifier de capacité
              // réelle. Conteneur cliquable + CTA en lien indépendant
              // (stopPropagation) puisque sa destination n'est plus toujours
              // la fiche, même pattern que CardGrille/CarteInstitutionCard.
              const cta = ctaPourInstitution(inst);
              const idType = typeIdentite(inst);
              return (
                <div key={inst.id} onClick={() => router.push(`/institution/${inst.id}?source=yelen_search`)} className="tap inst-card" style={{ cursor: "pointer", display: "flex", gap: "12px", background: C.cardBg, borderRadius: "16px", padding: "14px", position: "relative", overflow: "hidden" }}>
                  <InstitutionLogo inst={inst} size={54} categorieById={categorieById} circular={idType === "profession"}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "6px", marginBottom: "4px" }}>
                      <div style={{ color: C.text, fontSize: "13.5px", fontWeight: "800", lineHeight: 1.25, flex: 1 }}>{inst.name}</div>
                      {inst.badge_verifie && (
                        <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "2px 6px", background: `${VERIFIE_BLEU}18`, border: `1px solid ${VERIFIE_BLEU}45`, borderRadius: "20px", flexShrink: 0 }}>
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={VERIFIE_BLEU} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          <span style={{ color: VERIFIE_BLEU, fontSize: "7px", fontWeight: "800" }}>VÉRIFIÉ</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span style={{ background: C.borderCard, color: t2, fontSize: "8px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px" }}>{meta.short}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span style={{ color: t2, fontSize: "10px" }}>{inst.ville || "Guinée"}{inst.quartier ? ` · ${inst.quartier}` : ""}</span>
                      </div>
                    </div>
                    <Stars note={inst.moyenne_avis || 0} count={inst.nb_avis || 0} C={C as typeof T["dark"]}/>
                    {inst.description && <div style={{ color: t2, fontSize: "11px", lineHeight: 1.5, marginTop: "4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{inst.description}</div>}

                    {(inst.adresse || inst.phone) && (
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${C.borderCard}` }}>
                        {inst.adresse && (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span style={{ color: t2, fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>{inst.adresse}</span>
                          </div>
                        )}
                        {inst.phone && (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            <span style={{ color: t2, fontSize: "10px" }}>{inst.phone}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: hasD ? "#00C896" : iBrd }}/>
                        <span style={{ color: hasD ? "#00966F" : t2, fontSize: "9px", fontWeight: "700" }}>{hasD ? "Créneaux dispo" : "Sur demande"}</span>
                      </div>
                      <div style={{ flex: 1 }}/>
                      {cta ? (
                        <a href={ctaHrefInstitution(inst, cta.action)} target={cta.action === "rdv" || cta.action === "phone" ? undefined : "_blank"} rel={cta.action === "rdv" || cta.action === "phone" ? undefined : "noreferrer"} onClick={e => e.stopPropagation()} style={{ padding: "6px 12px", background: "#F5A623", borderRadius: "8px", display: "flex", alignItems: "center", gap: "4px", boxShadow: "0 1px 4px rgba(0,0,0,0.12)", textDecoration: "none" }}>
                          <CtaActionIcon action={cta.action} size={10}/>
                          <span style={{ color: "#080812", fontSize: "10px", fontWeight: "900" }}>{cta.label}</span>
                        </a>
                      ) : (
                        <a href={`/institution/${inst.id}?source=yelen_search`} onClick={e => e.stopPropagation()} style={{ padding: "6px 12px", background: C.borderCard, borderRadius: "8px", display: "flex", alignItems: "center", textDecoration: "none" }}>
                          <span style={{ color: C.text, fontSize: "10px", fontWeight: "900" }}>Voir la fiche</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
            {hasMore && (
              <button onClick={() => setPage(p => p + 1)} className="tap" style={{ width: "100%", marginTop: "12px", padding: "13px", background: iBg, border: "1px solid rgba(245,166,35,0.2)", borderRadius: "14px", color: "#F5A623", fontWeight: "700", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m7 10 5 5 5-5"/></svg>
                Charger la suite ({institutions.length - visible.length} restants)
              </button>
            )}
          </div>
        )}

        {/* Fin des résultats — conclusion élégante du scroll (chantier
            28/08/2026), jamais pendant le chargement ni tant qu'il reste
            des résultats à charger (hasMore) : "Charger la suite" garde la
            priorité tant qu'il y a réellement plus à voir. Jamais sur la
            Vue Carte (retour Bryan 06/08/2026) : "c'est le sheet qui fait
            tout", plus d'espace vide ni de pied de page derrière/sous la
            carte plein écran. */}
        {!loading && vue !== "carte" && institutions.length > 0 && !hasMore && (
          <div style={{ textAlign: "center", padding: "32px 4px 8px", animation: "fadeUp 0.3s ease" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ color: C.text, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Vous avez atteint la fin</div>
            <div style={{ color: t2, fontSize: "12px", lineHeight: 1.6, maxWidth: "320px", margin: "0 auto" }}>Vous avez consulté tous les établissements correspondant à votre recherche.</div>

            {/* Continuer à explorer — vraies catégories (activite_categories,
                mêmes 15 que partout dans le produit), jamais une liste
                inventée ; exclut la catégorie déjà active. */}
            {categories.length > 0 && (
              <div style={{ marginTop: "24px" }}>
                <div style={{ color: t2, fontSize: "10.5px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>Continuer à explorer</div>
                <div className="no-scroll" style={{ overflowX: "auto" }}>
                  <div style={{ display: "flex", gap: "8px", padding: "0 4px", width: "max-content", margin: "0 auto" }}>
                    {categories.filter(c => c.code !== filterCat).slice(0, 6).map(cat => (
                      <button key={cat.id} onClick={() => { setFilterCat(cat.code); setSearch(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "20px", border: `1px solid ${iBrd}`, background: iBg, cursor: "pointer", whiteSpace: "nowrap" }}>
                        <ActiviteCategorieIcon code={cat.code} color={t2} size={14}/>
                        <span style={{ color: C.text, fontSize: "11.5px", fontWeight: "700" }}>{ACTIVITE_CATEGORIE_SHORT[cat.code] ?? cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Élargir ma recherche — seulement si une recherche/filtre est
                actif, avec rappel clair de ce qui est actuellement filtré. */}
            {rechercheActive && (
              <div style={{ marginTop: "24px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", marginBottom: "10px" }}>
                  {search && <span style={{ padding: "4px 10px", borderRadius: "20px", background: iBg, border: `1px solid ${iBrd}`, color: t2, fontSize: "10.5px", fontWeight: "600" }}>« {search} »</span>}
                  {filterCat && <span style={{ padding: "4px 10px", borderRadius: "20px", background: iBg, border: `1px solid ${iBrd}`, color: t2, fontSize: "10.5px", fontWeight: "600" }}>{categories.find(c => c.code === filterCat)?.label ?? filterCat}</span>}
                  {filterVille && <span style={{ padding: "4px 10px", borderRadius: "20px", background: iBg, border: `1px solid ${iBrd}`, color: t2, fontSize: "10.5px", fontWeight: "600" }}>{filterVille}</span>}
                  {filterVerifie && <span style={{ padding: "4px 10px", borderRadius: "20px", background: iBg, border: `1px solid ${iBrd}`, color: t2, fontSize: "10.5px", fontWeight: "600" }}>Vérifié</span>}
                  {filterDispos && <span style={{ padding: "4px 10px", borderRadius: "20px", background: iBg, border: `1px solid ${iBrd}`, color: t2, fontSize: "10.5px", fontWeight: "600" }}>Créneaux disponibles</span>}
                </div>
                <button onClick={() => setShowFilters(true)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 18px", borderRadius: "12px", border: "none", background: C.text, color: C.pageBg, fontSize: "12px", fontWeight: "800", cursor: "pointer" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  Élargir ma recherche
                </button>
              </div>
            )}

            <SignatureYelen C={C as typeof T["dark"]} t2={t2}/>
          </div>
        )}
      </main>

      {overlayOpen && (
        <RechercheOverlay
          onClose={() => setOverlayOpen(false)}
          onCommitSearch={handleCommitSearchOverlay}
          onApplyCategorie={handleApplyCategorieOverlay}
          C={C as typeof T["dark"]}
          isDark={isDark}
          citoyenId={citoyenId}
          citoyenGeoloc={citoyenGeoloc}
          favorisIdsSet={favorisIdsSet}
          onToggleFavori={handleToggleFavoriCarte}
          secteurTopLabel={tendances?.secteurTopLabel ?? null}
          citoyenVille={citoyenVille}
        />
      )}

      {descriptionSheetInst && (
        <SheetDescription inst={descriptionSheetInst} C={C as typeof T["dark"]} t2={t2} categorieById={categorieById} onClose={() => setDescriptionSheetInst(null)}/>
      )}
    </div>
  );
}

