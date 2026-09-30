"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
type ThemeC = (typeof T)[keyof typeof T];
import { type Horaire, JOURS_SEMAINE, parseHoraires, isOuvertNow } from "@/lib/horaires";
import { toISODate } from "@/lib/disponibilites";
import { ACTIVITE_CATEGORIE_COLORS, ActiviteCategorieIcon } from "@/lib/activiteVisuels";
import { enregistrerInstitutionConsultee } from "@/lib/institutionsRecentes";
import { YelenLoader } from "@/components/YelenLoader";
import { EcranContenuIntrouvable } from "@/components/EcranContenuIntrouvable";
import { urlExterneSure } from "@/lib/urlValidation";
import { construireLienPartageInstitution, extraireIdDepuisParamInstitution } from "@/lib/institutionSlug";
import { detecterSourceAcquisition } from "@/lib/acquisitionSource";
import { enregistrerEvenementAcquisition } from "@/lib/acquisitionEvents";
import { APP_URL } from "@/lib/config";
import { deriverCapacites, deciderCta, CTA_LABELS, type CtaAction } from "@/lib/prestataireCapacites";
import { EQUIPEMENTS_ETABLISSEMENT, EQUIPEMENTS_CHAMBRE } from "@/lib/hotelEquipements";

// ─── Types ────────────────────────────────────────────────────────────────────
type Annonce = { id: string; titre: string; contenu: string; type: string; format: string; media_urls: string[] | null; epingle: boolean; image_url: string | null; created_at: string; date_expiration: string | null };
type Avis    = { id: string; citoyen_id: string; titre: string | null; note: number; commentaire: string | null; reponse_institution: string | null; reponse_le: string | null; created_at: string; nom: string; rdv_confirmed: boolean; utile_count: number };
// Ligne brute renvoyée par le select() sur `avis` (avant enrichissement nom/rdv_confirmed/utile_count).
type AvisRow = { id: string; citoyen_id: string; titre: string | null; note: number; commentaire: string | null; reponse_institution: string | null; reponse_le: string | null; created_at: string; masque: boolean };
type Commentaire = { id: string; annonce_id: string; contenu: string; citoyen_id: string; citoyen_nom: string | null; created_at: string };
type QuestionInstitution = { id: string; citoyen_id: string; question: string; reponse: string | null; reponse_le: string | null; created_at: string };
// Chantier Services Hôtel V2 (docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md,
// 20/08/2026) — sous-ensemble public de paid_services étendu (migration
// 20260821000010). Prestations : uniquement les 4 types avec un prix réel
// (§F Option 2 de l'audit, "inclus"/"sur_demande" hors périmètre de ce
// lot). Chambres (est_chambre=true) : retour Bryan 20/08/2026, vivent
// aussi dans paid_services pour avoir une vraie photo — remplace
// l'ancienne section "Chambres" basée sur institutions.services (jamais
// de photo).
type PrestationHotel = {
  id: string; nom: string; description: string | null; categorie: string | null;
  prix: number; unite_prix: string | null; horaires: Horaire[] | null; localisation: string | null;
  type_prestation: "reservable" | "commandable" | "supplement" | "horaires_limites" | null;
  est_chambre: boolean;
  // Galerie chambre (retour Bryan 20/08/2026, "jusqu'à 5 images et une
  // vidéo max 60s") — remplace photo_url (jamais exécuté en base).
  photos: string[]; video_url: string | null; video_duree_secondes: number | null;
  // Équipements structurés Hôtel (21/08/2026, lib/hotelEquipements.tsx) —
  // par chambre, distinct de Institution.equipements_etablissement.
  equipements_chambre: string[] | null;
  // Fiche structurée Chambre/Service V2 (25/09/2026, migrations
  // 20260925000004/000005) — description_courte pour les cartes/listes,
  // `description` devient la description détaillée de la fiche complète.
  description_courte: string | null; inclus: string[]; non_inclus: string[]; a_savoir: string | null;
  duree_minutes: number;
  capacite_max: number | null; capacite_adultes: number | null; capacite_enfants: number | null; superficie_m2: number | null;
  // Disponibilité réelle du type de chambre (retour Bryan 25/09/2026,
  // carte Tarif "façon Booking") — NULL sur les chambres créées avant ce
  // champ (migration 20260917000001), jamais réécrit rétroactivement,
  // voir CLAUDE.md /schema. Traité comme "non renseigné" côté affichage,
  // jamais une valeur par défaut inventée.
  nombre_unites: number | null;
};
type Institution = {
  id: string; slug: string; name: string; category: string; secteur: string | null; description: string;
  // Chantier Taxonomie des activités (Phase 3, 20/08/2026) — résolus par
  // requêtes séparées (activite_categories/institution_activites+activites,
  // jamais un embed PostgREST — CLAUDE.md /pieges-techniques-connus) après
  // le chargement principal. null tant que l'institution n'a pas encore été
  // migrée vers la nouvelle taxonomie (repli "Non renseigné", jamais une
  // correspondance devinée depuis l'ancien secteur).
  activiteCategorieCode: string | null; activiteCategorieLabel: string | null;
  activitePrincipaleCode: string | null; activitePrincipaleLabel: string | null;
  adresse: string; ville: string; quartier: string;
  phone: string; whatsapp?: string; email?: string; website?: string;
  logo?: string | null; banniere?: string | null;
  moyenne_avis: number; nb_avis: number; badge_verifie: boolean;
  horaires: Horaire[]; services: string[];
  // CTA V1 (17/08/2026) — brut, non parsé, uniquement pour deriverCapacites().
  disponibilites?: unknown;
  annee_creation?: string; capacite?: string; langue?: string[];
  conditions_entreprise: string | null; informations_importantes: string | null; informations_legales: string | null;
  conditions_entreprise_le: string | null; informations_importantes_le: string | null; informations_legales_le: string | null;
  conditions_entreprise_creee_le: string | null; informations_importantes_creee_le: string | null; informations_legales_creee_le: string | null;
  // Équipements structurés Hôtel (21/08/2026, lib/hotelEquipements.tsx) —
  // établissement uniquement, distinct des équipements par chambre
  // (PrestationHotel.equipements_chambre).
  equipements_etablissement: string[];
};

const ANNONCE_TYPES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  information: { color: "#60a5fa", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.2)",  label: "Info" },
  offre:       { color: "#34d399", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.2)",   label: "Offre" },
  urgent:      { color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)",   label: "Urgent" },
  evenement:   { color: "#c084fc", bg: "rgba(168,85,247,0.1)",  border: "rgba(168,85,247,0.2)",  label: "Événement" },
  communique:  { color: "#fbbf24", bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.2)",  label: "Communiqué" },
};

// SECTEUR_LABELS/SECTEUR_META extraites dans lib/secteurs.ts (chantier
// Favoris citoyen, 18/07/2026) pour être réutilisées ailleurs.

// FAQ de la fiche prestataire (chantier refonte, 24/07/2026) — questions
// génériques sur le fonctionnement réel de Yelen (réservation, annulation,
// avis, confidentialité), valables pour n'importe quelle institution.
// Volontairement aucune question spécifique à l'institution elle-même
// (horaires réels, politique d'annulation propre) : Yelen ne peut pas
// garantir un contenu qu'aucune institution n'a renseigné.
// Contenu revérifié ligne par ligne contre le comportement réel du code
// (retour Bryan 09/08/2026 : "jamais inventer") :
// - RDV démarre TOUJOURS au statut "nouveau" (payant ou gratuit, voir
//   app/rdv/[id]/page.tsx et actions.ts, corrigé le 05/08/2026) — l'ancien
//   texte promettait une "confirmation immédiate", faux : l'établissement
//   doit d'abord accepter la demande.
// - Annulation/report réels (app/mes-rdv/actions.ts + page.tsx,
//   `detailCanAct`) : aucune coupure à l'heure précise du rendez-vous,
//   seulement tant que le JOUR n'est pas passé et que le statut est
//   en_attente/confirmé — l'ancien texte ("jusqu'à l'heure prévue")
//   affirmait une précision qui n'existe pas dans le code.
const FAQ_FICHE: { q: string; r: string }[] = [
  { q: "Comment prendre rendez-vous avec cette institution ?", r: "Appuyez sur \"Prendre RDV\", choisissez un service et un créneau disponible, puis confirmez. Votre demande est envoyée à l'établissement, qui doit l'accepter avant que le rendez-vous soit confirmé." },
  { q: "Puis-je annuler ou reporter mon rendez-vous ?", r: "Oui, depuis l'onglet \"Mes RDV\" de votre compte, tant que le jour du rendez-vous n'est pas encore passé." },
  { q: "Comment laisser un avis sur cette institution ?", r: "Seuls les citoyens ayant effectué un rendez-vous avec cette institution peuvent laisser un avis, depuis leurs Activités passées." },
  { q: "Mes informations sont-elles partagées avec l'institution ?", r: "Seules les informations nécessaires à votre rendez-vous (nom, téléphone) deviennent visibles par l'institution une fois le rendez-vous confirmé." },
  { q: "Que faire si l'institution ne répond pas ?", r: "Vous pouvez la contacter par téléphone ou WhatsApp directement depuis cette fiche, ou signaler un problème depuis l'application." },
];

// ─── SVG Icons (plus d'emojis) ────────────────────────────────────────────────
const Icons = {
  Pin:      () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Back:     () => <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  Check:    (color = "#22c55e") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Shield:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Phone:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17v-.08z"/></svg>,
  Mail:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  Globe:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Clock:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Cal:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Star:     (filled: boolean, color = "#F5A623") => <svg width="13" height="13" viewBox="0 0 20 20" fill={filled ? color : "none"} stroke={color} strokeWidth="1"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/></svg>,
  Lock:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Chevron:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Building: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  MapPin:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Info:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Announce: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>,
  Heart:    (filled: boolean, color = "#ef4444", size = 13) => <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  Share:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>,
  Comment:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  Pin2:     () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
  Whatsapp: () => <svg width="16" height="16" fill="#22c55e" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>,
  Flag:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  Users:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Note:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  CatEdu:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><path d="M2 13l10 6 10-6"/></svg>,
  CatPharma:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>,
  // Fiche Chambre — refonte "Détails" (25/09/2026) : icônes UI sobres,
  // jamais d'emoji dans Yelen (règle produit non négociable).
  Person:   (color = "currentColor") => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>,
  Bed:      (color = "currentColor") => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/><path d="M3 18h18"/><path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/></svg>,
  Expand:   (color = "currentColor") => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>,
  Cross:    (color = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// Chantier Taxonomie des activités (Phase 3, 20/08/2026) — le badge de
// secteur de la fiche publique (couleur/icône) est désormais piloté par
// activite_categorie (ACTIVITE_CATEGORIE_COLORS/ActiviteCategorieIcon,
// lib/activiteVisuels.tsx), plus par l'ancien SECTEUR_ICON/secteur — voir
// isHotel/meta/CatIconComp plus bas et InstitutionLogo ci-dessous.

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Ancien format d'un service : simple string. Nouveau format (Lot A
// refonte wizard RDV, ServicesTab.tsx, type OffreService) : objet
// structuré {nom, description, duree_minutes, champs_complementaires} —
// extraire .nom, sinon String(objet) produit littéralement
// "[object Object]" (bug réel confirmé le 27/07/2026 : nom de service
// affiché comme "[object Object]" + avertissement React "clés dupliquées"
// puisque tous les services d'une même institution donnaient la même
// chaîne).
function toServiceLabel(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "nom" in entry) {
    const nom = (entry as { nom?: unknown }).nom;
    return typeof nom === "string" ? nom : "";
  }
  return "";
}

function parseArr(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(toServiceLabel).filter(Boolean);
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(toServiceLabel).filter(Boolean) : []; }
    catch { return v.split(/[,\n]/).map(s => s.trim()).filter(Boolean); }
  }
  return [];
}

function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
}

function formatHoraire(h: Horaire): string {
  if (!h.ouvert) return "Fermé";
  if (h.debut && h.fin) return `${h.debut} – ${h.fin}`;
  if (h.heures) return h.heures;
  return "Ouvert";
}

// Statut ouvert/fermé enrichi (retour Bryan 09/08/2026) : si fermé, "Ouvre
// à HH:MM" en cherchant réellement le prochain jour ouvert (pas seulement
// aujourd'hui — si l'horaire du jour est déjà passé ou que le jour est
// fermé, il faut regarder les jours suivants, jamais réafficher une heure
// d'ouverture déjà dépassée). Retourne null si aucun jour ouvert trouvé
// dans les 7 jours (horaires réels manquants/incomplets).
function prochaineOuverture(horaires: Horaire[]): { label: string; debut: string } | null {
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const todayIdx = now.getDay();
  const todayNom = JOURS_SEMAINE[todayIdx];
  const todayH = horaires.find(h => h.jour.toLowerCase() === todayNom.toLowerCase());
  if (todayH?.ouvert && todayH.debut) {
    const [dh, dm] = todayH.debut.split(":").map(Number);
    if (Number.isFinite(dh) && Number.isFinite(dm) && minutesNow < dh * 60 + dm) {
      return { label: "aujourd'hui", debut: todayH.debut };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const nom = JOURS_SEMAINE[(todayIdx + i) % 7];
    const h = horaires.find(x => x.jour.toLowerCase() === nom.toLowerCase());
    if (h?.ouvert && h.debut) return { label: i === 1 ? "demain" : nom, debut: h.debut };
  }
  return null;
}

// ─── Logo institution ─────────────────────────────────────────────────────────
function InstitutionLogo({ logo, name, categorieCode, size = 64 }: { logo?: string | null; name: string; categorieCode: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const color = categorieCode ? (ACTIVITE_CATEGORIE_COLORS[categorieCode] ?? "#F5A623") : "#F5A623";
  const initials = getInitials(name);

  if (logo && !err) {
    return (
      <div style={{ width: size, height: size, position: "relative", borderRadius: "18px", overflow: "hidden", flexShrink: 0, border: `2.5px solid ${color}35`, boxShadow: `0 0 0 4px ${color}12, 0 8px 24px rgba(0,0,0,0.25)` }}>
        <Image src={logo} alt={name} fill sizes={`${size}px`} onError={() => setErr(true)} style={{ objectFit: "cover" }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "18px", flexShrink: 0, background: `linear-gradient(135deg, ${color}28, ${color}12)`, border: `2.5px solid ${color}40`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", boxShadow: `0 0 0 4px ${color}08, 0 8px 24px rgba(0,0,0,0.2)` }}>
      <div style={{ color, opacity: 0.8 }}>{categorieCode ? <ActiviteCategorieIcon code={categorieCode} color={color}/> : <Icons.Building/>}</div>
      <span style={{ color, fontSize: size * 0.13 + "px", fontWeight: "900", letterSpacing: "0.5px" }}>{initials || "?"}</span>
    </div>
  );
}

// ─── Calendrier séjour (Phase B, hero hôtel, 25/09/2026) ───────────────────────
// Lance uniquement les dates de séjour depuis la fiche publique — Yelen ne
// construit jamais son propre moteur de réservation ici (voir
// docs/ui/YELEN_HOTEL_MODEL_AUDIT.md Partie 7) : une fois les 2 dates
// choisies, "Continuer" redirige vers /rdv/{id} qui reste l'unique moteur
// (dispo réelle, inventaire, confirmation). Calque de ChambreCalendar dans
// app/rdv/[id]/page.tsx, dupliqué ici car ce fichier n'importe jamais de
// composant depuis le wizard (aucun point de partage existant, et la seule
// autre chambre commune n'a pas de sens en dehors du wizard).
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_FR = ["D", "L", "M", "M", "J", "V", "S"];
function SejourCalendar({ calendarMonth, onMonthChange, minDate, selected, onSelect, C }: {
  calendarMonth: Date; onMonthChange: (dir: 1 | -1) => void; minDate: Date; selected: string | null;
  onSelect: (iso: string) => void; C: ThemeC;
}) {
  const first = new Date(calendarMonth);
  const startOffset = first.getDay();
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <button onClick={() => onMonthChange(-1)} className="tap" style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, cursor: "pointer" }}>‹</button>
        <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", textTransform: "capitalize" }}>{MOIS_FR[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</div>
        <button onClick={() => onMonthChange(1)} className="tap" style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, cursor: "pointer" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", marginBottom: "6px" }}>
        {JOURS_FR.map((j, i) => <div key={i} style={{ textAlign: "center", color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase" }}>{j}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px" }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i}/>;
          const iso = toISODate(d);
          const disabled = d < minDate;
          const sel = selected === iso;
          return (
            <button key={i} disabled={disabled} onClick={() => onSelect(iso)} className={disabled ? "" : "tap"}
              style={{ aspectRatio: "1", borderRadius: "10px", border: `1px solid ${C.borderCard}`, background: disabled ? "transparent" : C.cardBg, color: disabled ? C.textSubtle : sel ? "#F5A623" : C.text, fontSize: "12px", fontWeight: sel ? "800" : "600", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1 }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Étoiles ──────────────────────────────────────────────────────────────────
function Stars({ note, size = 13, isDark }: { note: number; size?: number; isDark: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={i <= Math.round(note) ? "#F5A623" : (isDark ? "#3a3a5a" : "#ddd")}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/>
        </svg>
      ))}
    </div>
  );
}

function SectionTitle({ icon, label, count, color = "#F5A623" }: { icon: React.ReactNode; label: string; count?: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
      <div style={{ color, opacity: 0.8 }}>{icon}</div>
      <span style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px" }}>{label}</span>
      {count !== undefined && count > 0 && (
        <span style={{ background: `${color}18`, border: `1px solid ${color}30`, color, fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{count}</span>
      )}
    </div>
  );
}

// Illustration originale du widget de satisfaction — badge dégradé +
// accents décoratifs, dessinée pour Yelen (pas une reprise d'un visuel
// d'un autre produit).
// Badge "vérifié" bleu inline à côté du nom, façon Meta/Instagram — vrai
// sceau à contour crénelé (pas un simple cercle), même silhouette que le
// badge vérifié Instagram/X — affiché uniquement si inst.badge_verifie
// (accordé par un admin Yelen après contrôle des documents, voir
// api/admin/institutions/[id]/badge). Affiché uniquement dans le header
// sticky (pas dans le hero, pour éviter le doublon — retour 25/07/2026).
function MetaVerifiedBadge({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#0095F6" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"/>
      <path fill="#fff" d="M9.9 16.2 6 12.3l1.4-1.4 2.5 2.5 6.7-6.7 1.4 1.4z"/>
    </svg>
  );
}

function SatIllustration({ variant }: { variant: "question" | "merci" }) {
  const isThanks = variant === "merci";
  return (
    <div style={{ position: "relative", width: "52px", height: "52px", flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: isThanks ? "linear-gradient(135deg,#22c55e,#4ade80)" : "linear-gradient(135deg,#F5A623,#FBBF24)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 16px ${isThanks ? "rgba(34,197,94,0.35)" : "rgba(245,166,35,0.35)"}` }}>
        {isThanks ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <span style={{ color: "#080812", fontSize: "22px", fontWeight: "900", lineHeight: 1 }}>?</span>
        )}
      </div>
      <span style={{ position: "absolute", top: "-3px", right: "-2px", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: isThanks ? "#F5A623" : "#60a5fa" }}/>
      <span style={{ position: "absolute", bottom: "-1px", left: "-5px", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: isThanks ? "#60a5fa" : "#22c55e" }}/>
    </div>
  );
}

function AnnonceImageCarousel({ images, height, dotActiveColor, dotInactiveColor = "rgba(255,255,255,0.45)" }:
  { images: string[]; height: number; dotActiveColor: string; dotInactiveColor?: string }) {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  if (images.length === 0) return null;
  return (
    <div style={{ width: "100%", height: `${height}px`, position: "relative", overflow: "hidden" }}>
      <div
        ref={scrollerRef}
        onScroll={() => {
          const el = scrollerRef.current; if (!el) return;
          const idx = Math.round(el.scrollLeft / el.clientWidth);
          setActive(Math.max(0, Math.min(images.length - 1, idx)));
        }}
        style={{ display: "flex", width: "100%", height: "100%", overflowX: "auto", scrollSnapType: "x mandatory" }}
      >
        {images.map((url, i) => (
          <div key={i} style={{ position: "relative", width: "100%", height: "100%", flexShrink: 0, scrollSnapAlign: "start" }}>
            <Image src={url} alt="" fill sizes="100vw" style={{ objectFit: "cover" }}/>
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div style={{ position: "absolute", bottom: "8px", left: 0, right: 0, display: "flex", justifyContent: "center", gap: "5px" }}>
          {images.map((_, i) => (
            <span key={i} style={{
              width: i === active ? "7px" : "5.5px", height: i === active ? "7px" : "5.5px",
              borderRadius: "50%", backgroundColor: i === active ? dotActiveColor : dotInactiveColor,
              boxShadow: "0 1px 2px rgba(0,0,0,0.35)", transition: "width 0.15s, height 0.15s",
            }}/>
          ))}
        </div>
      )}
    </div>
  );
}

// Indicateur de scroll réutilisable pour un bottom sheet — même principe
// que la barre de scroll globale de la page (scrollPct/scrollThumbH plus
// bas), mais rattaché au scroll interne d'un conteneur précis plutôt qu'à
// `window` (retour Bryan 26/09/2026, sheets "Prix & frais"/"Garantie" :
// la scrollbar native est masquée globalement, voir globals.css, donc rien
// n'indique qu'un sheet peut défiler sans cette barre). Appelé au niveau
// racine du composant (jamais dans un bloc conditionnel) pour respecter les
// Rules of Hooks, même si le sheet correspondant n'est pas ouvert.
// Rendu de la barre elle-même, réutilisé par tous les plein écrans/sheets
// défilables de la fiche (useSheetScrollThumb ci-dessous fournit l'état).
function ScrollThumbBar({ thumb, isDark, top = "calc(env(safe-area-inset-top) + 64px)", bottom = "20px" }: { thumb: { pct: number; thumbH: number; shown: boolean }; isDark: boolean; top?: string; bottom?: string }) {
  return (
    <div aria-hidden style={{ position: "fixed", top, bottom, right: "4px", width: "3px", zIndex: 60, pointerEvents: "none", opacity: thumb.shown ? 1 : 0, transition: "opacity 0.4s ease" }}>
      <div style={{ position: "absolute", top: `${thumb.pct * (1 - thumb.thumbH) * 100}%`, height: `${thumb.thumbH * 100}%`, width: "100%", borderRadius: "3px", background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)" }}/>
    </div>
  );
}

function useSheetScrollThumb(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  const [thumbH, setThumbH] = useState(1);
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setPct(max > 0 ? Math.min(Math.max(el.scrollTop / max, 0), 1) : 0);
    setThumbH(el.scrollHeight > 0 ? Math.min(Math.max(el.clientHeight / el.scrollHeight, 0.08), 1) : 1);
    setShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(false), 900);
  }, []);
  // Calcule la hauteur du "thumb" dès l'ouverture (pas seulement au 1er
  // scroll) — sinon le sheet s'affiche sans indicateur tant que le citoyen
  // n'a pas encore fait défiler une première fois.
  useEffect(() => {
    if (open) onScroll();
  }, [open, onScroll]);
  return { ref, onScroll, pct, thumbH, shown };
}

// ─── Page principale ──────────────────────────────────────────────────────────
// useSearchParams() exige une frontière Suspense en App Router (voir
// app/login/page.tsx pour le même pattern déjà en place) — sinon le build
// Netlify échoue au prerendering (bug réel déjà rencontré le 22/07/2026,
// voir CLAUDE.md /historique-deploiement).
function InstitutionProfilePageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawParam = params.id as string;
  // Post-redirect (page.tsx serveur canonicalise déjà vers {slug}-{id}
  // avant que ce composant ne monte), rawParam contient toujours un uuid
  // extractible — le repli sur rawParam lui-même ne sert qu'un param
  // vraiment invalide (jamais atteint en pratique, page.tsx rendrait
  // EcranContenuIntrouvable avant).
  const id = extraireIdDepuisParamInstitution(rawParam) ?? rawParam;
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  // Preuve de valeur du QR "Mon code QR" (retour Bryan 25/07/2026) — mémorise
  // seulement l'INTENTION du scan pour l'attribuer à la réservation qui
  // pourrait suivre dans la même session ; n'affecte jamais l'affichage de
  // cette page elle-même (le QR continue de mener ici, pas à la réservation
  // directement — décision Bryan : voir les infos avant de réserver reste
  // important). Best-effort : sessionStorage peut échouer (navigation
  // privée) sans jamais bloquer la page.
  useEffect(() => {
    if (searchParams.get("source") === "qr") {
      try { sessionStorage.setItem("yelen224_provenance", "qr"); } catch {}
    }
  }, [searchParams]);

  // Centre d'Analyse → Acquisition (nouvel onglet) — un event "profile_view"
  // par montage réel de la fiche, source résolue une seule fois à
  // l'arrivée (jamais re-déclenché si searchParams change ensuite, ex.
  // ouverture d'un onglet interne qui touche l'URL). Nouveau/récurrent
  // dérivé à l'agrégation (lib/analyseAcquisition.ts), pas ici.
  useEffect(() => {
    const source = detecterSourceAcquisition(searchParams.get("source"), typeof document !== "undefined" ? document.referrer || null : null, APP_URL);
    enregistrerEvenementAcquisition(id, "profile_view", source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [inst, setInst]         = useState<Institution | null>(null);
  // CTA V1 (17/08/2026) — paid_services actifs, non inclus dans le
  // select("*") sur institutions (table séparée). Sert uniquement à
  // deriverCapacites() (hasBooking), voir docs/ui/YELEN_PRESTATAIRE_CTA_V1_SPEC.md §5.
  const [paidServicesActifs, setPaidServicesActifs] = useState(0);
  // Chantier Services Hôtel V2 (docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md,
  // 20/08/2026) — prestations réelles (paid_services étendu), uniquement
  // pour secteur hôtel, bloc additif "Expérience & Services" (§H de
  // l'audit). Jamais fetché pour les autres secteurs.
  const [prestationsHotel, setPrestationsHotel] = useState<PrestationHotel[]>([]);
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [avis, setAvis]         = useState<Avis[]>([]);
  const [loading, setLoading]   = useState(true);
  // Chantier refonte fiche prestataire (24/07/2026, retour CEO) — Info/
  // Horaires/Services ne sont plus des onglets qui masquent le reste :
  // tout le contenu est désormais visible en un seul scroll, ces boutons
  // deviennent des ancres qui font défiler jusqu'à la section. Avis reste
  // à part : son bouton ouvre un plein écran dédié façon Booking.
  const [reviewsOpen, setReviewsOpen] = useState(false);
  // "À propos" tronquée à 2 lignes + "Voir plus" (retour Bryan 25/09/2026,
  // pour toutes les catégories) — troncature en JS par nombre de
  // caractères, pas en CSS WebkitLineClamp (retour Bryan 22/08/2026 sur
  // CommunautePostCard.tsx : peu fiable sur certains rendus). Ouvre le même
  // patron de sheet Yelen que la FAQ plus bas (faqOuverte).
  const [descriptionSheetOpen, setDescriptionSheetOpen] = useState(false);
  // "Prix & frais" — lien façon DoorDash "Pricing & Fees" ouvrant un
  // bottom sheet explicatif (retour Bryan 26/09/2026). Contenu
  // volontairement non légal (aucune mention de loi/juridiction) : texte
  // humain qui explique juste le fonctionnement réel du paiement Yelen —
  // même patron de sheet que descriptionSheetOpen/faqOuverte ci-dessus.
  const [prixFraisSheetOpen, setPrixFraisSheetOpen] = useState(false);
  // "Garantie" — même patron que "Prix & frais" ci-dessus, lien placé à
  // gauche sur la même ligne (retour Bryan 26/09/2026). Contrairement à
  // "Prix & frais", visible pour TOUTE institution (pas seulement celles
  // avec un service payant) : le volet "ce que Yelen garantit" (examen
  // avant publication, badge_verifie, code de validation, protection des
  // données) est vrai même sans paiement — seul le volet "ce que Yelen ne
  // garantit pas" varie selon paidServicesActifs (paiement/remboursement
  // n'a de sens que s'il y a un service payant).
  const [garantieSheetOpen, setGarantieSheetOpen] = useState(false);
  const prixFraisScroll = useSheetScrollThumb(prixFraisSheetOpen);
  const garantieScroll = useSheetScrollThumb(garantieSheetOpen);
  const infoRef = useRef<HTMLDivElement>(null);
  const horairesRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);
  const [imgBanErr, setImgBanErr] = useState(false);
  // Bandeau "Yelen vous accompagne" (28/09/2026) — arrivée depuis le
  // parcours d'orientation (app/menu/projets/accompagnement,
  // ?source=yelen_accompagnement) : propose de reprendre directement le
  // flux de réservation plutôt que de faire tout reperdre le contexte déjà
  // collecté. Fermeture locale seulement (pas de mémorisation persistée —
  // un aller-retour volontaire sur la fiche peut vouloir le revoir).
  const [accompagnementIgnore, setAccompagnementIgnore] = useState(false);
  // Calendrier séjour (Phase B, hero hôtel, 25/09/2026) — bandeau qui
  // remplace Découvrir/WhatsApp dans le hero pour un hôtel, ouvre ce popup
  // 2 étapes (arrivée puis départ), "Continuer" redirige vers /rdv/{id}
  // avec les dates déjà connues (le wizard prend le relais, voir
  // app/rdv/[id]/page.tsx::dispoChambres).
  const [sejourModalOpen, setSejourModalOpen] = useState(false);
  const [sejourStep, setSejourStep] = useState<"arrivee" | "depart">("arrivee");
  // Présélection depuis le bandeau "Vos dates de séjour" de l'onglet
  // Recherche (catégorie Hôtels & restos, retour Bryan 29/09/2026) —
  // query params `date_arrivee`/`date_depart` repris tels quels, jamais de
  // confiance aveugle dans une valeur venue de l'URL (format ISO
  // yyyy-mm-dd validé, sinon ignoré silencieusement comme si absent).
  const dateUrlValide = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;
  const [sejourArrivee, setSejourArrivee] = useState<string | null>(() => dateUrlValide(searchParams.get("date_arrivee")));
  const [sejourDepart, setSejourDepart] = useState<string | null>(() => dateUrlValide(searchParams.get("date_depart")));
  const [sejourCalendarMonth, setSejourCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  // Lot E2 (engagement citoyen, 16/07/2026)
  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [likesCount, setLikesCount] = useState<Record<string, number>>({});
  const [mesLikes, setMesLikes] = useState<Set<string>>(new Set());
  const [mesUtile, setMesUtile] = useState<Set<string>>(new Set());
  // Chantier Favoris citoyen (18/07/2026)
  const [estFavori, setEstFavori] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Indicateur de position de scroll — barre verticale sur le bord droit,
  // même comportement que app/page.tsx (retour Bryan 25/07/2026 : étendre
  // ce repère à la fiche établissement jusqu'au récapitulatif du wizard).
  const [scrollPct, setScrollPct]         = useState(0);
  const [scrollThumbH, setScrollThumbH]   = useState(0);
  const [scrollBarShown, setScrollBarShown] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // CTA "Prendre RDV" — retenté en position:fixed avec révélation au scroll
  // vers le haut (retour Bryan 25/07/2026), après un aller-retour sur
  // `sticky` (bug fixed constaté sur mobile le 24/07/2026, voir commentaire
  // sur le bandeau CTA plus bas). Décision assumée : Bryan confirme sur son
  // téléphone si le bug refixed revient avant qu'on généralise le pattern.
  const [ctaVisible, setCtaVisible] = useState(true);
  // Header principal (secteurs non-hôtel) — même traitement "séparateur
  // visible seulement au scroll" que les popups plein écran (retour Bryan
  // 26/09/2026). Réutilise le listener de scroll déjà en place plutôt que
  // d'en ajouter un second.
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const lastScrollY = useRef(0);
  useEffect(() => {
    const onScrollPct = () => {
      const viewport = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const max = total - viewport;
      setScrollPct(max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0);
      setScrollThumbH(total > 0 ? Math.min(Math.max(viewport / total, 0.08), 1) : 1);
      setScrollBarShown(true);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
      scrollHideTimer.current = setTimeout(() => setScrollBarShown(false), 900);

      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      if (y < 40 || delta < -4) setCtaVisible(true);
      else if (delta > 4) setCtaVisible(false);
      lastScrollY.current = y;
      setHeaderScrolled(y > 4);
    };
    onScrollPct();
    window.addEventListener("scroll", onScrollPct, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScrollPct);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    };
  }, []);
  // FAQ (chantier refonte fiche prestataire, 24/07/2026 — bottom sheet
  // façon Booking, 09/08/2026). faqOuverte = index affiché dans le sheet
  // (null = fermé). faqFeedback = réponse "Cela vous a-t-il aidé ?" pour
  // la question actuellement ouverte, jamais persisté (pas de demande de
  // suivi côté Bryan, juste l'interaction) — réinitialisé à chaque
  // ouverture d'une question.
  const [faqOuverte, setFaqOuverte] = useState<number | null>(null);
  const [faqFeedback, setFaqFeedback] = useState<"oui" | "non" | null>(null);
  // Lot E3 (engagement citoyen, commentaires, 16/07/2026)
  const [commentaires, setCommentaires] = useState<Record<string, Commentaire[]>>({});
  const [commentsOpenId, setCommentsOpenId] = useState<string | null>(null);
  const [detailOpenId, setDetailOpenId] = useState<string | null>(null);
  const selectedDetailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (detailOpenId && selectedDetailRef.current) {
      selectedDetailRef.current.scrollIntoView({ block: "start" });
    }
  }, [detailOpenId]);
  const [nouveauCommentaire, setNouveauCommentaire] = useState<Record<string, string>>({});
  const [envoiCommentaire, setEnvoiCommentaire] = useState<string | null>(null);

  // Widget "Comment on s'en sort ?" (satisfaction plateforme, 24/07/2026) —
  // clé localStorage globale (pas liée à cette institution) : la question
  // porte sur Yelen en général, fermer/répondre sur une fiche masque aussi
  // le widget sur les autres, pendant 30 jours (même pattern que
  // components/MonAssistant.tsx::ASSISTANT_DISMISS_KEY).
  const SAT_DISMISS_KEY = "yelen224_satisfaction_dismissed_until";
  const [satDismissedUntil, setSatDismissedUntil] = useState(0);
  const [satStep, setSatStep] = useState<1 | 2>(1);
  const [satReponse, setSatReponse] = useState<string | null>(null);
  const [satCommentaire, setSatCommentaire] = useState("");
  const [satSubmitting, setSatSubmitting] = useState(false);
  const [satSubmitted, setSatSubmitted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAT_DISMISS_KEY);
      if (raw) setSatDismissedUntil(Number(raw) || 0);
    } catch {}
  }, []);

  function dismissSatisfaction() {
    const until = Date.now() + 30 * 24 * 60 * 60 * 1000;
    try { localStorage.setItem(SAT_DISMISS_KEY, String(until)); } catch {}
    setSatDismissedUntil(until);
  }

  async function handleSubmitSatisfaction() {
    if (!citoyenId || !satReponse) return;
    setSatSubmitting(true);
    const { error } = await supabase.from("enquete_satisfaction").insert({
      citoyen_id: citoyenId,
      reponse: satReponse,
      commentaire: satCommentaire.trim() || null,
      institution_id: inst?.id ?? null,
    });
    setSatSubmitting(false);
    if (!error) {
      setSatSubmitted(true);
      dismissSatisfaction();
    }
  }

  // "Questions des citoyens" façon Booking "Travelers are asking" (public
  // pré-RDV, 24/07/2026) — questions_institution, max 2 par citoyen et par
  // établissement (imposé par trigger serveur, voir migration). Séparé de
  // la vraie messagerie citoyen↔institution (liée à un RDV).
  const [questions, setQuestions] = useState<QuestionInstitution[]>([]);
  const [questionsListOpen, setQuestionsListOpen] = useState(false);
  // Horaire complet replié par défaut, façon DoorDash "Cart summary"
  // (retour Bryan 26/09/2026) — seul le statut Ouvert/Fermé maintenant
  // reste visible d'emblée, la liste des 7 jours ne s'affiche qu'au clic.
  const [horaireDetailOpen, setHoraireDetailOpen] = useState(false);
  // Même patron pour la carte Contacts (retour Bryan 26/09/2026, "pareil
  // pour la section Contact") — ici aucun résumé équivalent au statut
  // Ouvert/Fermé n'existe, donc toute la liste (adresse/téléphone/
  // WhatsApp/email/site) est repliée derrière une seule ligne.
  const [contactDetailOpen, setContactDetailOpen] = useState(false);
  // Même patron pour Équipements (retour Bryan 27/09/2026, "quelques-uns
  // affichés, les autres pliés, comme pour les horaires") — à la
  // différence de Contact, un aperçu (quelques équipements, pas zéro)
  // reste visible replié ; seul le reste bascule derrière le clic.
  const [equipementsDetailOpen, setEquipementsDetailOpen] = useState(false);
  // Même patron pour Détails (retour Bryan 27/09/2026, "Détails en pliage
  // aussi") — comme Contacts, seulement 2 champs possibles (Fondée en/
  // Capacité), aucun résumé équivalent, donc tout replié derrière une
  // seule ligne cliquable.
  const [detailsDetailOpen, setDetailsDetailOpen] = useState(false);
  // Même patron pour À propos (retour Bryan 27/09/2026, "À propos aussi
  // en pliage") — pas de résumé chiffré équivalent (ni statut, ni
  // compteur), donc un simple toggle icône+libellé, contenu (description
  // tronquée + Voir plus + langues) entièrement replié par défaut.
  const [aproposDetailOpen, setAproposDetailOpen] = useState(false);
  // Séparateur du header du popup Conditions/Informations/Légales
  // (retour Bryan 26/09/2026 : "on doit sentir la séparation uniquement
  // si on scroll, sinon c'est uniforme") — false tant qu'on est en haut
  // du contenu, remis à false à chaque ouverture/fermeture (le popup lui
  // démonte/remonte, mais ce state ne le ferait pas tout seul).
  const [infoScrolled, setInfoScrolled] = useState(false);
  // Même traitement étendu à tous les headers plein écran de la fiche
  // (retour Bryan 26/09/2026, "apporte ce même traitement à tous les
  // header de la fiche") — un state par popup (chacun a son propre
  // scroll indépendant), remis à false à la fermeture.
  const [reviewsScrolled, setReviewsScrolled] = useState(false);
  const [commentsScrolled, setCommentsScrolled] = useState(false);
  const [detailScrolled, setDetailScrolled] = useState(false);
  const [askScrolled, setAskScrolled] = useState(false);
  const [questionsListScrolled, setQuestionsListScrolled] = useState(false);
  const [chambreScrolled, setChambreScrolled] = useState(false);
  const [galerieScrolled, setGalerieScrolled] = useState(false);
  const [serviceScrolled, setServiceScrolled] = useState(false);
  // "Conditions & Informations" façon Booking (Property Policies/Important
  // details/Legal information), 24/07/2026 — remplace le footer de la
  // fiche. Contenu rempli par l'institution (Mon compte > Conditions &
  // Informations), popup dédié par section.
  const [infoOpen, setInfoOpen] = useState<"conditions" | "importantes" | "legales" | null>(null);
  // Chantier Services Hôtel V2 (galerie, 20/08/2026) — Vue 2 (détail
  // chambre) et Vue 3 (galerie plein écran), même patron d'overlay que
  // infoOpen/reviewsOpen ci-dessus : état local, aucune nouvelle route.
  const [chambreOuverte, setChambreOuverte] = useState<PrestationHotel | null>(null);
  const [galerieOuverte, setGalerieOuverte] = useState(false);
  // "Lire plus" de la description (refonte "Détails", 25/09/2026) — state
  // top-level (jamais dans l'IIFE conditionnelle chambreOuverte && (()=>{}),
  // qui casserait les Rules of Hooks), réinitialisé à chaque ouverture
  // d'une chambre différente.
  const [descExpanded, setDescExpanded] = useState(false);
  // Viewer plein écran (refonte visuelle 25/09/2026) — porte désormais la
  // liste complète des médias + un index, pour permettre précédent/
  // suivant/compteur/clavier (auparavant un seul {type,url} figé, aucune
  // navigation possible une fois ouvert).
  const [mediaPleinEcran, setMediaPleinEcran] = useState<{ items: { type: "photo" | "video"; url: string }[]; index: number } | null>(null);
  // Swipe tactile du viewer plein écran (retour Bryan 25/09/2026 : "ajouter
  // le scroll avec la main, pas seulement les flèches") — refs plutôt que
  // du state, aucun rendu ne dépend de la position du doigt en cours de
  // geste (pas d'animation de suivi, juste seuil → navigation, cohérent
  // avec le reste du projet qui n'a pas de librairie de gestes).
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeConsumedRef = useRef(false);
  // Fiche service structurée V2 (25/09/2026) — même patron d'overlay que
  // chambreOuverte, contenu propre au service (durée, inclus/non inclus,
  // disponibilité, à savoir) plutôt que la liste compacte affichée avant.
  const [serviceOuvert, setServiceOuvert] = useState<PrestationHotel | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askSubmitting, setAskSubmitting] = useState(false);
  // Indicateur de scroll (même hook que les sheets "Prix & frais"/
  // "Garantie") étendu à tous les plein écrans défilables de la fiche —
  // "Scrolled" ci-dessus ne fait que masquer/révéler la bordure du header,
  // rien n'indiquait qu'il restait du contenu à faire défiler (retour Bryan
  // 26/09/2026 : "la barre doit exister en général", chambre/service inclus).
  const reviewsThumb = useSheetScrollThumb(reviewsOpen);
  const commentsThumb = useSheetScrollThumb(commentsOpenId !== null);
  const detailThumb = useSheetScrollThumb(detailOpenId !== null);
  const questionsListThumb = useSheetScrollThumb(questionsListOpen);
  const infoThumb = useSheetScrollThumb(infoOpen !== null);
  const chambreThumb = useSheetScrollThumb(chambreOuverte !== null);
  const galerieThumb = useSheetScrollThumb(chambreOuverte !== null && galerieOuverte);
  const serviceThumb = useSheetScrollThumb(serviceOuvert !== null);
  const askThumb = useSheetScrollThumb(askOpen);
  // Deep-link "?question=1" (retour Bryan 28/08/2026, CTA "Poser une
  // question" depuis la sheet Populaire de /recherche) — ouvre directement
  // le formulaire au chargement de la fiche, une seule fois (ref plutôt
  // qu'une fonction en dépendance, pour ne pas rouvrir le formulaire à
  // chaque re-render une fois le citoyen l'ayant refermé).
  const questionAutoOuverte = useRef(false);
  useEffect(() => {
    if (questionAutoOuverte.current) return;
    if (searchParams.get("question") !== "1") return;
    if (!citoyenId || !inst) return;
    questionAutoOuverte.current = true;
    setAskQuestion("");
    setAskOpen(true);
  }, [citoyenId, inst, searchParams]);
  const mesQuestions = questions.filter(q => q.citoyen_id === citoyenId);
  const questionsRepondues = questions.filter(q => q.reponse !== null).sort((a, b) => new Date(b.reponse_le ?? b.created_at).getTime() - new Date(a.reponse_le ?? a.created_at).getTime());
  // Refonte façon Booking "Travelers are asking" (retour Bryan 09/08/2026,
  // captures à l'appui) : une seule question mise en avant sur la fiche
  // (pas 3 empilées, jugé "incompréhensible") — la propre question en
  // attente du citoyen en priorité (il veut voir où en est SA question),
  // sinon la plus récente déjà répondue. Le popup "Voir toutes les
  // questions" reste le seul endroit où tout s'affiche.
  const maQuestionEnAttente = mesQuestions.find(q => !q.reponse) ?? null;
  const questionVedette = maQuestionEnAttente ?? questionsRepondues[0] ?? null;
  const nbQuestionsTotal = questionsRepondues.length + mesQuestions.filter(q => !q.reponse).length;
  // Délai de réponse réel (jours), jamais inventé — même garde-fou
  // d'échantillon minimum que le "temps d'attente" des favoris
  // (ECHANTILLON_MIN_ATTENTE=3, app/api/citoyen/favoris/route.ts).
  const delaiReponseJours = (() => {
    const delais = questionsRepondues
      .filter(q => q.reponse_le)
      .map(q => (new Date(q.reponse_le!).getTime() - new Date(q.created_at).getTime()) / 86400000)
      .filter(d => d >= 0);
    if (delais.length < 3) return null;
    const moyenne = delais.reduce((s, d) => s + d, 0) / delais.length;
    return Math.max(1, Math.round(moyenne));
  })();

  function ouvrirPoserQuestion() {
    if (!citoyenId) { router.push("/inscription"); return; }
    setAskQuestion("");
    setAskOpen(true);
  }

  async function handleSubmitQuestion() {
    if (!citoyenId || !inst) return;
    const question = askQuestion.trim();
    if (!question) return;
    setAskSubmitting(true);
    const { data, error } = await supabase
      .from("questions_institution")
      .insert({ institution_id: inst.id, citoyen_id: citoyenId, question })
      .select("id, citoyen_id, question, reponse, reponse_le, created_at")
      .single();
    setAskSubmitting(false);
    if (!error && data) {
      setQuestions(prev => [data, ...prev]);
      setAskOpen(false);
      setAskScrolled(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      // Correctif sécurité (01/09/2026) : select("*") sur ce client anon
      // renvoyait mot_de_passe_hash (et toute autre colonne sensible) à
      // chaque chargement de fiche publique — RLS filtre par ligne, jamais
      // par colonne. Liste explicite = uniquement les colonnes réellement
      // consommées ci-dessous, vérifiées une par une (croisé avec les
      // select() déjà en production dans favoris/route.ts et
      // rdv/[id]/page.tsx, et avec les migrations réelles). `nom`/`categorie`/
      // `telephone` (repli JS ci-dessous) ne sont pas de vraies colonnes —
      // drift déjà documenté dans CLAUDE.md (name/category/phone).
      // conditions_entreprise_creee_le/informations_importantes_creee_le/
      // informations_legales_creee_le (migration 20260831000001) réintégrées
      // le 01/09/2026 — exécution en base confirmée par Bryan.
      const { data: row } = await supabase
        .from("institutions")
        .select("id,slug,name,category,secteur,description,conditions_entreprise,informations_importantes,informations_legales,conditions_entreprise_le,informations_importantes_le,informations_legales_le,conditions_entreprise_creee_le,informations_importantes_creee_le,informations_legales_creee_le,equipements_etablissement,adresse,ville,quartier,phone,whatsapp,email,website,logo,banniere,moyenne_avis,nb_avis,badge_verifie,horaires,services,disponibilites,annee_creation,capacite,langue,activite_categorie_id")
        .eq("id", id)
        .maybeSingle();
      if (!row) { setLoading(false); return; }
      const r = row as Record<string, unknown>;
      setInst({
        id: String(r.id), slug: String(r.slug ?? ""), name: String(r.name ?? r.nom ?? ""),
        category: String(r.category ?? r.categorie ?? "Autre"),
        secteur: r.secteur ? String(r.secteur) : null,
        activiteCategorieCode: null, activiteCategorieLabel: null,
        activitePrincipaleCode: null, activitePrincipaleLabel: null,
        description: String(r.description ?? ""),
        conditions_entreprise: r.conditions_entreprise ? String(r.conditions_entreprise) : null,
        informations_importantes: r.informations_importantes ? String(r.informations_importantes) : null,
        informations_legales: r.informations_legales ? String(r.informations_legales) : null,
        conditions_entreprise_le: r.conditions_entreprise_le ? String(r.conditions_entreprise_le) : null,
        informations_importantes_le: r.informations_importantes_le ? String(r.informations_importantes_le) : null,
        informations_legales_le: r.informations_legales_le ? String(r.informations_legales_le) : null,
        conditions_entreprise_creee_le: r.conditions_entreprise_creee_le ? String(r.conditions_entreprise_creee_le) : null,
        informations_importantes_creee_le: r.informations_importantes_creee_le ? String(r.informations_importantes_creee_le) : null,
        informations_legales_creee_le: r.informations_legales_creee_le ? String(r.informations_legales_creee_le) : null,
        equipements_etablissement: Array.isArray(r.equipements_etablissement) ? r.equipements_etablissement as string[] : [],
        adresse: String(r.adresse ?? ""), ville: String(r.ville ?? ""), quartier: String(r.quartier ?? ""),
        phone: String(r.phone ?? r.telephone ?? ""),
        whatsapp: r.whatsapp ? String(r.whatsapp) : undefined,
        email: r.email ? String(r.email) : undefined,
        website: r.website ? String(r.website) : undefined,
        logo: (r.logo as string | null) ?? null, banniere: (r.banniere as string | null) ?? null,
        moyenne_avis: Number(r.moyenne_avis ?? 0),
        nb_avis: Number(r.nb_avis ?? 0),
        badge_verifie: Boolean(r.badge_verifie),
        horaires: parseHoraires(r.horaires),
        services: parseArr(r.services),
        disponibilites: r.disponibilites,
        annee_creation: r.annee_creation ? String(r.annee_creation) : undefined,
        capacite: r.capacite ? String(r.capacite) : undefined,
        langue: r.langue ? (Array.isArray(r.langue) ? r.langue : [String(r.langue)]) : undefined,
      });

      // Chantier Taxonomie des activités (Phase 3, 20/08/2026) — catégorie
      // + activité principale, requêtes séparées (jamais un embed
      // PostgREST, CLAUDE.md /pieges-techniques-connus). null si
      // l'institution n'a pas encore de activite_categorie_id (secteur
      // legacy uniquement) — repli "Non renseigné" au rendu, jamais une
      // correspondance devinée.
      if (r.activite_categorie_id) {
        const { data: catRow } = await supabase
          .from("activite_categories")
          .select("code,label")
          .eq("id", r.activite_categorie_id as string)
          .maybeSingle();
        if (catRow) {
          setInst(prev => prev ? { ...prev, activiteCategorieCode: catRow.code, activiteCategorieLabel: catRow.label } : prev);
        }
      }
      const { data: activiteLienRow } = await supabase
        .from("institution_activites")
        .select("activite_id")
        .eq("institution_id", id)
        .eq("principale", true)
        .maybeSingle();
      if (activiteLienRow?.activite_id) {
        const { data: actRow } = await supabase
          .from("activites")
          .select("code,label")
          .eq("id", activiteLienRow.activite_id)
          .maybeSingle();
        if (actRow) {
          setInst(prev => prev ? { ...prev, activitePrincipaleCode: actRow.code, activitePrincipaleLabel: actRow.label } : prev);
        }
        // Chantier Services Hôtel V2 — chambres ET prestations réelles,
        // uniquement pour l'hôtellerie (retour Bryan 20/08/2026 : les
        // chambres vivent maintenant dans paid_services, est_chambre=true,
        // pour avoir une vraie photo — plus dans institutions.services).
        // Policy RLS publique existante sur paid_services (is_active=true)
        // suffit, aucune nouvelle policy.
        if (actRow?.code === "hotellerie") {
          const { data: prestRows } = await supabase
            .from("paid_services")
            .select("id, nom, description, categorie, prix, unite_prix, horaires, localisation, type_prestation, est_chambre, photos, video_url, video_duree_secondes, equipements_chambre, description_courte, inclus, non_inclus, a_savoir, duree_minutes, capacite_max, capacite_adultes, capacite_enfants, superficie_m2, nombre_unites")
            .eq("institution_id", id)
            .eq("is_active", true)
            .order("categorie", { ascending: true });
          setPrestationsHotel((prestRows as PrestationHotel[] | null) ?? []);
        }
      }

      // CTA V1 (17/08/2026) — paid_services actifs, nécessaire à
      // deriverCapacites() (hasBooking). Policy RLS publique existante :
      // SELECT anon uniquement où is_active=true (app/api/institution/services/route.ts:6-14).
      const { count: paidCount } = await supabase
        .from("paid_services")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", id)
        .eq("is_active", true);
      setPaidServicesActifs(paidCount ?? 0);

      // "Continuez votre exploration" sur l'Accueil (retour Bryan
      // 25/07/2026, façon Booking.com "Continue your search") — purement
      // local, jamais bloquant pour l'affichage de la fiche.
      enregistrerInstitutionConsultee({
        id: String(r.id), name: String(r.name ?? r.nom ?? ""),
        logo: (r.logo as string | null) ?? null, category: String(r.category ?? r.categorie ?? "Autre"), ville: String(r.ville ?? ""),
      });

      const annRes = await fetch(`/api/annonces-publiques?institution_id=${id}`).then(r => r.json()).catch(() => ({ annonces: [] }));
      const annoncesData: Annonce[] = annRes.annonces ?? [];
      setAnnonces(annoncesData);

      // "Questions des citoyens" — RLS renvoie les questions répondues
      // (publiques) + les propres questions du citoyen connecté même en
      // attente (questions_institution_read_public/_read_own).
      const { data: questionsData } = await supabase
        .from("questions_institution")
        .select("id, citoyen_id, question, reponse, reponse_le, created_at")
        .eq("institution_id", id)
        .order("created_at", { ascending: false });
      setQuestions(questionsData ?? []);

      // Lot E1 (engagement citoyen, 16/07/2026) — une vue = un chargement de la
      // fiche pour une annonce donnée, dédoublonné par sessionStorage pour ne
      // pas gonfler le compteur à chaque refresh. citoyen_id = session Supabase
      // Auth réelle si connecté (pas le localStorage id, pour matcher auth.uid()
      // exigé par la policy RLS annonce_vues_insert), sinon null (visiteur anonyme).
      if (annoncesData.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        setCitoyenId(user?.id ?? null);

        const aVoir = annoncesData.filter(a => {
          const key = `yelen224_vue_${a.id}`;
          try {
            if (sessionStorage.getItem(key)) return false;
            sessionStorage.setItem(key, "1");
          } catch { /* navigation privée / storage indisponible : on compte quand même */ }
          return true;
        });
        if (aVoir.length > 0) {
          supabase.from("annonce_vues").insert(
            aVoir.map(a => ({ annonce_id: a.id, citoyen_id: user?.id ?? null }))
          ).then(() => {}, () => {});
        }

        // Lot E2 (engagement citoyen, 16/07/2026) — lecture directe côté client
        // (policy annonce_likes_public_read, SELECT ouvert à tous) : compte par
        // annonce + appartenance au citoyen courant, pas de route dédiée.
        const ids = annoncesData.map(a => a.id);
        const { data: likesRows } = await supabase.from("annonce_likes").select("annonce_id, citoyen_id").in("annonce_id", ids);
        const counts: Record<string, number> = {};
        const mine = new Set<string>();
        (likesRows ?? []).forEach((l: { annonce_id: string; citoyen_id: string | null }) => {
          counts[l.annonce_id] = (counts[l.annonce_id] ?? 0) + 1;
          if (user?.id && l.citoyen_id === user.id) mine.add(l.annonce_id);
        });
        setLikesCount(counts);
        setMesLikes(mine);

        // Lot E3 (engagement citoyen, commentaires, 16/07/2026) — lecture
        // directe (policy annonce_commentaires_public_read). citoyen_nom est
        // figé à l'insertion (voir handleSubmitComment) : aucune lecture
        // publique sur `users` n'existe pour le résoudre après coup.
        const { data: commentRows } = await supabase
          .from("annonce_commentaires")
          .select("id, annonce_id, contenu, citoyen_id, citoyen_nom, created_at")
          .in("annonce_id", ids)
          .order("created_at", { ascending: true });
        const parComm: Record<string, Commentaire[]> = {};
        (commentRows ?? []).forEach((c: Commentaire) => {
          (parComm[c.annonce_id] ??= []).push(c);
        });
        setCommentaires(parComm);
      }

      // ✅ FIX: On récupère TOUS les avis directement depuis la table avis
      // sans filtrage sur le statut du RDV — les données sont déjà en DB
      // brouillon=false (Lot G) : un brouillon non publié ne doit jamais
      // apparaître ici. masque filtré ci-dessous après lecture (le citoyen
      // a choisi de le cacher de sa propre liste, donc du public aussi).
      const { data: avisData } = await supabase
        .from("avis")
        .select("id,titre,note,commentaire,reponse_institution,reponse_le,created_at,citoyen_id,masque")
        .eq("institution_id", id)
        .eq("brouillon", false)
        .order("created_at", { ascending: false })
        .limit(50);

      const avisVisibles = (avisData ?? []).filter((a: AvisRow) => !a.masque);

      if (avisVisibles.length > 0) {
        // Récupérer les noms des citoyens
        const ids = [...new Set(avisVisibles.map((a: AvisRow) => a.citoyen_id).filter(Boolean))];
        const { data: usersData } = await supabase
          .from("users").select("id,nom,prenom,phone").in("id", ids);
        const uMap: Record<string, string> = {};
        (usersData ?? []).forEach((u: { id: string; nom: string | null; prenom: string | null; phone: string | null }) => {
          uMap[u.id] = [u.prenom, u.nom].filter(Boolean).join(" ") || u.phone || "Citoyen";
        });

        // Vérifier quels citoyens ont un RDV effectué/confirmé pour le badge
        const { data: rdvData } = await supabase
          .from("rdv")
          .select("citoyen_id")
          .eq("institution_id", id)
          .in("statut", ["effectue", "termine", "confirme"]);
        const citoyensVerifies = new Set((rdvData ?? []).map((r: { citoyen_id: string }) => r.citoyen_id));

        // "Utile" (Lot H, chantier Avis + Favoris citoyen) — mirroring
        // annonce_likes : compte public + mes propres marques.
        const avisIds = avisVisibles.map((a: AvisRow) => a.id);
        const { data: utileData } = await supabase.from("avis_utile").select("avis_id, citoyen_id").in("avis_id", avisIds);
        const utileCountMap: Record<string, number> = {};
        (utileData ?? []).forEach((u: { avis_id: string; citoyen_id: string | null }) => { utileCountMap[u.avis_id] = (utileCountMap[u.avis_id] ?? 0) + 1; });
        const { data: { user: viewerUser } } = await supabase.auth.getUser();
        setMesUtile(new Set((utileData ?? []).filter((u: { avis_id: string; citoyen_id: string | null }) => u.citoyen_id === viewerUser?.id).map((u: { avis_id: string; citoyen_id: string | null }) => u.avis_id)));

        setAvis(avisVisibles.map((a: AvisRow) => ({
          id: a.id,
          citoyen_id: a.citoyen_id,
          titre: a.titre,
          note: a.note,
          commentaire: a.commentaire,
          reponse_institution: a.reponse_institution,
          reponse_le: a.reponse_le,
          created_at: a.created_at,
          nom: uMap[a.citoyen_id] || "Citoyen",
          rdv_confirmed: citoyensVerifies.has(a.citoyen_id),
          utile_count: utileCountMap[a.id] ?? 0,
        })));

        // Vues (Lot H) — un rendu de la fiche = une vue par avis affiché,
        // dédoublonné par sessionStorage (même pattern que annonce_vues,
        // Lot E1 engagement citoyen).
        const aVoirAvis = avisVisibles.filter((a: AvisRow) => {
          const key = `yelen224_vue_avis_${a.id}`;
          try {
            if (sessionStorage.getItem(key)) return false;
            sessionStorage.setItem(key, "1");
          } catch { /* navigation privée / storage indisponible : on compte quand même */ }
          return true;
        });
        if (aVoirAvis.length > 0) {
          supabase.from("avis_vues").insert(
            aVoirAvis.map((a: AvisRow) => ({ avis_id: a.id, citoyen_id: viewerUser?.id ?? null }))
          ).then(() => {}, () => {});
        }
      }

      setLoading(false);
    })();
  }, [id]);

  // Chantier Favoris citoyen (18/07/2026) — effet indépendant de la
  // logique annonces ci-dessus (qui ne fixe citoyenId que si
  // annoncesData.length > 0) : le favori doit être vérifiable même sur
  // une fiche sans aucune annonce. setCitoyenId ici est idempotent avec
  // l'autre effet (même valeur dérivée de la même session).
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCitoyenId(prev => prev ?? user.id);
      const { data } = await supabase.from("citoyen_favoris").select("id").eq("citoyen_id", user.id).eq("institution_id", id).maybeSingle();
      setEstFavori(!!data);
    })();
  }, [id]);

  // RLS favoris_citoyen_own (auth.uid() = citoyen_id) — mirroring
  // handleToggleLike ci-dessus (annonce_likes), insert/delete direct.
  const handleToggleFavori = async () => {
    if (!citoyenId) { router.push("/inscription"); return; }
    const wasFavori = estFavori;
    setEstFavori(!wasFavori);
    const { error } = wasFavori
      ? await supabase.from("citoyen_favoris").delete().eq("citoyen_id", citoyenId).eq("institution_id", id)
      : await supabase.from("citoyen_favoris").insert({ citoyen_id: citoyenId, institution_id: id });
    if (error) { setEstFavori(wasFavori); setToast("Une erreur est survenue, réessayez."); }
    // Confirmation explicite — avant, aucun retour visuel ne confirmait
    // l'ajout/retrait des favoris (retour CEO 24/07/2026).
    else {
      setToast(wasFavori ? "Retiré des favoris" : "Ajouté aux favoris");
      if (!wasFavori) {
        void notifierAjoutFavori();
        enregistrerEvenementAcquisition(id, "favori_ajoute", detecterSourceAcquisition(searchParams.get("source"), typeof document !== "undefined" ? document.referrer || null : null, APP_URL));
      }
    }
  };

  // Fire-and-forget, uniquement sur ajout (jamais retrait) — ne doit jamais
  // bloquer le toast déjà affiché ci-dessus.
  async function notifierAjoutFavori() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch("/api/citoyen/favoris", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ institutionId: id }),
      });
    } catch {}
  }

  // Partage de la fiche (retour Bryan 09/08/2026, header). Même pattern
  // déjà établi dans app/compte/favoris/favoris-client.tsx::handlePartager
  // — Web Share API si disponible (mobile), sinon copie du lien dans le
  // presse-papiers avec confirmation via le toast déjà existant.
  async function handlePartager() {
    const lienPartage = inst?.slug ? construireLienPartageInstitution(inst.slug, id) : id;
    const url = `${window.location.origin}/institution/${lienPartage}?source=share`;
    enregistrerEvenementAcquisition(id, "profile_share", "share");
    if (navigator.share) {
      try { await navigator.share({ title: inst?.name, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); setToast("Lien copié."); } catch {}
    }
  }

  // Lot H (chantier Avis + Favoris citoyen, 18/07/2026) — "utile" sur un
  // avis, mirroring exact handleToggleLike (annonce_likes) ci-dessous.
  // Jamais l'auteur de l'avis lui-même (vérifié ici, pas seulement côté
  // UI — la policy RLS avis_utile_insert_own n'empêche pas un auteur de se
  // marquer utile, ce garde-fou est donc uniquement applicatif).
  const handleToggleUtile = async (a: Avis) => {
    if (!citoyenId) { router.push("/inscription"); return; }
    if (a.citoyen_id === citoyenId) return;
    const wasUtile = mesUtile.has(a.id);

    setMesUtile(prev => { const s = new Set(prev); if (wasUtile) s.delete(a.id); else s.add(a.id); return s; });
    setAvis(prev => prev.map(x => x.id === a.id ? { ...x, utile_count: Math.max(0, x.utile_count + (wasUtile ? -1 : 1)) } : x));

    const { error } = wasUtile
      ? await supabase.from("avis_utile").delete().eq("avis_id", a.id).eq("citoyen_id", citoyenId)
      : await supabase.from("avis_utile").insert({ avis_id: a.id, citoyen_id: citoyenId });

    if (error) {
      setMesUtile(prev => { const s = new Set(prev); if (wasUtile) s.add(a.id); else s.delete(a.id); return s; });
      setAvis(prev => prev.map(x => x.id === a.id ? { ...x, utile_count: Math.max(0, x.utile_count + (wasUtile ? 1 : -1)) } : x));
    }
  };

  // Lot E2 (engagement citoyen, 16/07/2026) — insert/delete direct, RLS
  // (annonce_likes_insert_own / delete_own) exige auth.uid() = citoyen_id,
  // donc citoyenId vient forcément de la session Supabase Auth, pas du
  // localStorage. Visiteur non connecté → redirigé vers /inscription, même
  // page cible que CitoyenGuard.
  const handleToggleLike = async (annonceId: string) => {
    if (!citoyenId) { router.push("/inscription"); return; }
    const wasLiked = mesLikes.has(annonceId);

    setMesLikes(prev => { const s = new Set(prev); if (wasLiked) s.delete(annonceId); else s.add(annonceId); return s; });
    setLikesCount(prev => ({ ...prev, [annonceId]: Math.max(0, (prev[annonceId] ?? 0) + (wasLiked ? -1 : 1)) }));

    const { error } = wasLiked
      ? await supabase.from("annonce_likes").delete().eq("annonce_id", annonceId).eq("citoyen_id", citoyenId)
      : await supabase.from("annonce_likes").insert({ annonce_id: annonceId, citoyen_id: citoyenId });

    if (error) {
      setMesLikes(prev => { const s = new Set(prev); if (wasLiked) s.add(annonceId); else s.delete(annonceId); return s; });
      setLikesCount(prev => ({ ...prev, [annonceId]: Math.max(0, (prev[annonceId] ?? 0) + (wasLiked ? 1 : -1)) }));
    }
  };

  // Lot E3 (engagement citoyen, commentaires, 16/07/2026) — citoyen_nom est lu
  // depuis la propre ligne `users` de l'auteur (seule lecture autorisée par
  // citoyen_own_profile) et figé sur la ligne du commentaire à l'insertion.
  const handleSubmitComment = async (annonceId: string) => {
    if (!citoyenId) { router.push("/inscription"); return; }
    const contenu = (nouveauCommentaire[annonceId] ?? "").trim();
    if (!contenu) return;

    setEnvoiCommentaire(annonceId);
    const { data: profil } = await supabase.from("users").select("nom, prenom").eq("id", citoyenId).maybeSingle();
    const citoyenNom = profil ? [profil.prenom, profil.nom].filter(Boolean).join(" ") || null : null;

    const { data, error } = await supabase
      .from("annonce_commentaires")
      .insert({ annonce_id: annonceId, citoyen_id: citoyenId, contenu, citoyen_nom: citoyenNom })
      .select("id, annonce_id, contenu, citoyen_id, citoyen_nom, created_at")
      .single();

    if (!error && data) {
      setCommentaires(prev => ({ ...prev, [annonceId]: [...(prev[annonceId] ?? []), data as Commentaire] }));
      setNouveauCommentaire(prev => ({ ...prev, [annonceId]: "" }));
    }
    setEnvoiCommentaire(null);
  };

  if (loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <YelenLoader size={44} label="Chargement…" labelColor={C.textSubtle}/>
    </div>
  );

  if (!inst) return (
    <EcranContenuIntrouvable
      pageBg={C.pageBg} text={C.text} textSubtle={C.textSubtle} border={C.border} isDark={theme === "dark"}
      eyebrow="ÉTABLISSEMENT INTROUVABLE"
      title="Cet établissement n'existe pas"
      message="Vérifiez l'adresse saisie, ou accédez directement à votre espace professionnel."
      primaryHref="/institution/connexion" primaryLabel="Se connecter"
      secondaryHref="/institution/inscription" secondaryLabel="Créer un compte établissement"
    />
  );

  const meta = { color: inst.activiteCategorieCode ? (ACTIVITE_CATEGORIE_COLORS[inst.activiteCategorieCode] ?? "#F5A623") : "#F5A623" };
  const CatIconComp = () => inst.activiteCategorieCode ? <ActiviteCategorieIcon code={inst.activiteCategorieCode} color={meta.color}/> : <Icons.Building/>;
  // Mode Hôtel V1 vitrine (chantier Hôtel, Phase 2, 19/08/2026), migré vers
  // la nouvelle taxonomie (chantier Taxonomie des activités, Phase 3,
  // 20/08/2026) — gate déterministe calculée une seule fois ici, même
  // principe que `ctaDecision` ci-dessous (jamais recalculée/dupliquée plus
  // bas dans ce fichier). Ne pilote que du texte/libellé conditionnel —
  // zéro nouveau composant, zéro changement pour les autres catégories. Voir
  // docs/ui/YELEN_HOTEL_MODEL_AUDIT.md Partie 12/15.
  const isHotel = inst.activitePrincipaleCode === "hotellerie";
  // "Continuer" du bandeau "Yelen vous accompagne" — hôtel : atterrit
  // directement sur l'étape date d'arrivée (?sejour=1, lu par
  // app/rdv/[id]/page.tsx, même effet que le bouton "Réserver un séjour"
  // du wizard). Autres catégories : ouvre le flux de réservation
  // directement, déjà ce que fait le CTA "Prendre rendez-vous" partout
  // ailleurs sur cette fiche — rien à inventer de plus.
  const depuisAccompagnement = searchParams.get("source") === "yelen_accompagnement" && !accompagnementIgnore;
  const instId = inst.id;
  function continuerDepuisAccompagnement() {
    router.push(isHotel ? `/rdv/${instId}?sejour=1` : `/rdv/${instId}`);
  }
  const banniereAccompagnement = depuisAccompagnement && (
    <div style={{ position: "absolute", left: "12px", right: "12px", bottom: "10px", zIndex: 5, background: "rgba(0,0,0,0.62)", backdropFilter: "blur(8px)", borderRadius: "14px", padding: "10px 10px 10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ flex: 1, minWidth: 0, color: "#fff", fontSize: "11px", fontWeight: 700, lineHeight: 1.35 }}>Vous avez déjà avancé dans votre recherche</div>
      <button onClick={continuerDepuisAccompagnement} className="tap" style={{ background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "12px", padding: "9px 14px", borderRadius: "10px", border: "none", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>Continuer</button>
      <button onClick={() => setAccompagnementIgnore(true)} aria-label="Ignorer" className="tap" style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: "50%", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer", flexShrink: 0 }}>{Icons.Cross("#fff")}</button>
    </div>
  );
  // Chantier Services Hôtel V2 (20/08/2026) — les chambres vivent dans
  // paid_services (est_chambre=true, avec photo), plus dans
  // institutions.services. Source unique du compte "Chambres" partout
  // dans ce fichier (TABS, STATS, section elle-même).
  const chambresHotel = prestationsHotel.filter(p => p.est_chambre);
  const { ouvert, horaire: horaireAujd } = isOuvertNow(inst.horaires);
  const jourAujd = JOURS_SEMAINE[new Date().getDay()];
  const prochaineOuv = !ouvert ? prochaineOuverture(inst.horaires) : null;
  // P0 Stored XSS (17/08/2026) — jamais rendre inst.website brut en href :
  // urlExterneSure() revalide au rendu (défense en profondeur, données
  // historiques potentiellement non validées à l'écriture).
  const websiteHref = urlExterneSure(inst.website);
  const adresseTexte = [inst.adresse, inst.quartier, inst.ville].filter(Boolean).join(", ");
  const mapsHref = adresseTexte ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresseTexte)}` : null;
  // CTA V1 (17/08/2026) — source unique de vérité des capacités/CTA,
  // voir lib/prestataireCapacites.ts et docs/ui/YELEN_PRESTATAIRE_CTA_V1_SPEC.md.
  // Ne jamais dupliquer cette logique ailleurs dans ce fichier (hero et
  // bandeau fixe doivent réutiliser exactement `ctaDecision`).
  const capacites = deriverCapacites({
    services: inst.services,
    paidServicesActifsCount: paidServicesActifs,
    disponibilites: inst.disponibilites,
    website: inst.website,
    whatsapp: inst.whatsapp,
    phone: inst.phone,
  });
  const ctaDecision = deciderCta(capacites);
  // Quand WhatsApp/Téléphone ne sont pas l'action principale, l'un des
  // deux (priorité WhatsApp) occupe le 2ᵉ emplacement du CTA hero — le
  // site web n'y a jamais eu de place (déjà uniquement dans "Contacts"
  // ci-dessous), comportement conservé à l'identique.
  const ctaQuickSecondary: CtaAction | null =
    ctaDecision.secondaires.find(a => a === "whatsapp" || a === "phone") ?? null;

  // Corrigé (17/08/2026, CTA V1) : le bouton WhatsApp du hero ouvrait
  // avant un compose générique (sans destinataire) même sans numéro réel
  // — désormais `hasWhatsApp` (donc l'affichage du bouton) exige un vrai
  // numéro, jamais de fallback. La carte Contacts plus bas l'a toujours
  // fait correctement (retour CEO 24/07/2026, historique conservé).
  const whatsappMsg = `Bonjour, je souhaite des informations sur ${inst.name} via YELEN224.`;
  const whatsappUrl = capacites.hasWhatsApp
    ? `https://wa.me/${inst.whatsapp!.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappMsg)}`
    : null;
  // Simple lookup (pas un composant) — sûr à définir ici, réutilisé par
  // le CTA hero et le bandeau fixe pour ne jamais diverger.
  const ctaHref = (action: CtaAction): string => {
    switch (action) {
      case "rdv": return `/rdv/${inst.id}`;
      case "website": return websiteHref ?? "#";
      case "whatsapp": return whatsappUrl ?? "#";
      case "phone": return `tel:${inst.phone}`;
    }
  };
  // Centre d'Analyse → Acquisition — "appointment_started" (clic RDV) vs
  // "contact_started" (phone/WhatsApp/website), source résolue une seule
  // fois par clic à partir du même ?source= que le profile_view initial.
  const trackerCtaClic = (action: CtaAction) => {
    const source = detecterSourceAcquisition(searchParams.get("source"), typeof document !== "undefined" ? document.referrer || null : null, APP_URL);
    enregistrerEvenementAcquisition(id, action === "rdv" ? "appointment_started" : "contact_started", source);
  };

  const inputBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBord = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  // Calcul note moyenne depuis les avis récupérés (source de vérité)
  const noteMoyenne = avis.length > 0 ? avis.reduce((acc, a) => acc + a.note, 0) / avis.length : inst.moyenne_avis;
  const nbAvis = avis.length > 0 ? avis.length : inst.nb_avis;

  // Ancres — Info/Horaires/Services défilent jusqu'à leur section (tout le
  // contenu est déjà monté dans la page) ; Avis ouvre le plein écran dédié.
  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const TABS = [
    { key: "info",      label: "Info",      icon: <Icons.Info />,  onPress: () => scrollToSection(infoRef) },
    { key: "horaires",  label: "Horaires",  icon: <Icons.Clock />, onPress: () => scrollToSection(horairesRef) },
    { key: "services",  label: isHotel ? "Chambres" : "Services",  icon: <Icons.Note />,  count: isHotel ? chambresHotel.length : inst.services.length, onPress: () => scrollToSection(servicesRef) },
    { key: "avis",      label: "Avis",      icon: Icons.Star(true), count: nbAvis, onPress: () => setReviewsOpen(true) },
  ] as { key: string; label: string; icon: React.ReactNode; count?: number; onPress: () => void }[];

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, color: C.text, transition: "background-color 0.3s ease", overflowX: "hidden", paddingBottom: "calc(84px + env(safe-area-inset-bottom))" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        /* overflow-x sur html/body retiré (23/07/2026, voir globals.css) —
           casse position:fixed pour tous ses descendants sur WebKit/iOS
           (nos overlays plein écran, la barre de scroll verticale...).
           Protection du débordement horizontal déplacée sur le wrapper
           racine ci-dessus (overflowX:"hidden"), pattern déjà utilisé par
           app/page.tsx. */
        html,body{background:${C.pageBg}}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes faqSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        .tap{transition:opacity 0.1s,transform 0.1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:0.7;transform:scale(0.97)}
        a{-webkit-tap-highlight-color:transparent}
      `}</style>

      {/* HEADER — fond neutre (retour CEO 24/07/2026 : "retire le fond
          Yelen sur le header de la fiche") au lieu du bandeau doré de
          marque, le doré restant réservé aux écrans où il porte l'identité
          Yelen elle-même (Accueil, Compte). Bouton favori déplacé ici
          depuis la bannière (3e colonne de la grille, à la place du &lt;div/&gt;
          vide). */}
      {!isHotel && (() => {
        const hText    = C.text;
        return (
        <header style={{ position: "sticky", top: 0, zIndex: 200, background: C.pageBg, borderBottom: headerScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
          {/* Grille 1fr/auto/1fr (au lieu de space-between) — garde le
              titre centré indépendamment de la largeur du bouton retour.
              Icônes retour/favoris/partager alignées sur le traitement de
              CompteHeader (components/CompteEcranVide.tsx) : icône seule,
              sans chip ni bordure (retour Bryan 31/08/2026, cohérence
              entre la fiche établissement et les ~29 écrans /compte/*). */}
          <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
            <Link href="/recherche" className="tap" style={{ justifySelf: "start", display: "flex", alignItems: "center", textDecoration: "none", background: "none", border: "none", padding: "4px 6px 4px 0", color: hText, minWidth: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Link>
            <div style={{ minWidth: 0, maxWidth: "180px", textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                <div style={{ color: hText, fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{inst.name}</div>
                {inst.badge_verifie && <MetaVerifiedBadge size={14}/>}
              </div>
            </div>
            <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={handleToggleFavori} className="tap" aria-label={estFavori ? "Retirer des favoris" : "Ajouter aux favoris"} style={{ background: "none", border: "none", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", color: hText, cursor: "pointer", flexShrink: 0 }}>
                {Icons.Heart(estFavori, estFavori ? "#ef4444" : hText, 20)}
              </button>
              <button onClick={handlePartager} className="tap" aria-label="Partager" style={{ background: "none", border: "none", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", color: hText, cursor: "pointer", flexShrink: 0 }}>
                <Icons.Share/>
              </button>
            </div>
          </div>
        </header>
        );
      })()}

      {/* BANNIÈRE — courte et large façon bandeau de chaîne YouTube (pas un
          grand visuel qui domine l'écran), uniquement quand une vraie photo
          existe ; le dégradé de secours reste tout aussi petit quand il n'y
          en a pas (retour CEO 24/07/2026 : la première tentative en 230px
          était trop grande). Non-hôtel uniquement — voir le hero pleine
          largeur ci-dessous pour l'hôtellerie (retour Bryan 25/09/2026). */}
      {!isHotel && (
        <div style={{ width: "100%", height: inst.banniere && !imgBanErr ? "120px" : "100px", overflow: "hidden", position: "relative" }}>
          {inst.banniere && !imgBanErr ? (
            <>
              <Image src={inst.banniere} alt="" fill sizes="100vw" priority onError={() => setImgBanErr(true)} style={{ objectFit: "cover" }}/>
              <div style={{ position: "absolute", inset: 0, background: isDark ? "linear-gradient(to bottom,transparent 40%,rgba(7,7,22,0.9) 100%)" : "linear-gradient(to bottom,transparent 45%,rgba(242,242,247,0.9) 100%)" }}/>
            </>
          ) : (
            <div style={{ width: "100%", height: "100%", background: isDark ? `linear-gradient(160deg, ${meta.color}12, ${meta.color}06, transparent)` : `linear-gradient(160deg, ${meta.color}08, ${meta.color}03, transparent)` }}/>
          )}
          {banniereAccompagnement}
        </div>
      )}

      {/* HERO PLEINE LARGEUR — hôtellerie uniquement (retour Bryan
          25/09/2026, chantier "adapter la fiche à l'hôtel", étape 1/N :
          "juste le hero header"). Réutilise inst.banniere (même champ, même
          fallback dégradé que la bannière ci-dessus) mais en couverture
          pleine largeur façon DoorDash — back/favori/partager superposés en
          cercles translucides sur la photo au lieu d'une barre sticky
          séparée. Reste du bloc HERO (logo/nom/catégorie/CTA) inchangé,
          scope volontairement limité au header pour cette étape. */}
      {isHotel && (
        <div style={{ width: "100%", height: "240px", overflow: "hidden", position: "relative" }}>
          {inst.banniere && !imgBanErr ? (
            <>
              <Image src={inst.banniere} alt="" fill sizes="100vw" priority onError={() => setImgBanErr(true)} style={{ objectFit: "cover" }}/>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, transparent 26%, transparent 62%, rgba(0,0,0,0.4) 100%)" }}/>
            </>
          ) : (
            <div style={{ width: "100%", height: "100%", background: isDark ? `linear-gradient(160deg, ${meta.color}18, ${meta.color}08, transparent)` : `linear-gradient(160deg, ${meta.color}10, ${meta.color}04, transparent)` }}/>
          )}
          <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 12px)", left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
            <Link href="/recherche" className="tap" aria-label="Retour" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "50%", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", color: "#080812", textDecoration: "none", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={handleToggleFavori} className="tap" aria-label={estFavori ? "Retirer des favoris" : "Ajouter aux favoris"} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "50%", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", border: "none", cursor: "pointer", flexShrink: 0 }}>
                {Icons.Heart(estFavori, estFavori ? "#ef4444" : "#080812", 19)}
              </button>
              <button onClick={handlePartager} className="tap" aria-label="Partager" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "50%", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", border: "none", cursor: "pointer", color: "#080812", flexShrink: 0 }}>
                <Icons.Share/>
              </button>
            </div>
          </div>
          {banniereAccompagnement}
        </div>
      )}

      {/* HERO — seul le logo chevauche la bannière (négatif appliqué à lui
          seul, pas à tout le bloc) : le nom/la catégorie restent toujours
          sur fond uni, jamais superposés à une photo chargée où ils
          devenaient illisibles (retour CEO 24/07/2026). */}
      <div style={{ padding: "10px 16px 0", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", marginBottom: "14px" }}>
          <div style={{ marginTop: inst.banniere && !imgBanErr ? "-40px" : "0", flexShrink: 0 }}>
            <InstitutionLogo logo={inst.logo} name={inst.name} categorieCode={inst.activiteCategorieCode} size={72}/>
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", margin: "0 0 3px" }}>
              <h1 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: 0, lineHeight: 1.15, letterSpacing: "-0.5px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</h1>
              {websiteHref && (
                <a href={websiteHref} target="_blank" rel="noreferrer" className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, background: "#F5A623", borderRadius: "20px", padding: "6px 12px", color: "#080812", fontSize: "11.5px", fontWeight: 700, textDecoration: "none" }}>
                  Site web
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
                </a>
              )}
            </div>
            <div style={{ color: meta.color, fontSize: "11px", fontWeight: "700", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ color: meta.color }}><CatIconComp /></div>
              {inst.activitePrincipaleLabel ?? inst.activiteCategorieLabel ?? "Non renseigné"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: C.textSubtle }}><Icons.Pin /></span>
              <span style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "500" }}>{[inst.adresse, inst.quartier, inst.ville].filter(Boolean).join(" · ") || "—"}</span>
            </div>
          </div>
        </div>

        {/* Note globale + statut ouvert/fermé + annonces — regroupés sur
            une seule ligne (retirés du dessus de la bannière) */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "26px", fontWeight: "900", color: C.text, letterSpacing: "-1px" }}>
            {noteMoyenne > 0 ? noteMoyenne.toFixed(1) : "—"}
          </span>
          <Stars note={noteMoyenne} size={14} isDark={isDark}/>
          <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600" }}>({nbAvis} avis)</span>
          {horaireAujd && (
            <span style={{ background: "transparent", border: `1px solid ${ouvert ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, color: ouvert ? "#22c55e" : "#ef4444", fontSize: "9px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px" }}>
              {ouvert
                ? `● OUVERT${horaireAujd.fin ? ` · Ferme à ${horaireAujd.fin}` : ""}`
                : `● FERMÉ${prochaineOuv ? ` · Ouvre ${prochaineOuv.label === "aujourd'hui" ? "" : prochaineOuv.label + " "}à ${prochaineOuv.debut}` : ""}`}
            </span>
          )}
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noreferrer" className="tap" aria-label="Itinéraire" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "10px", background: C.sectionAlt, border: `1px solid ${C.borderCard}`, flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            </a>
          )}
          {annonces.length > 0 && (
            <span style={{ background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", color: "#F5A623", fontSize: "9px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
              <Icons.Announce /> {annonces.length} annonce{annonces.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* CTA — piloté par ctaDecision (lib/prestataireCapacites.ts,
            source unique de vérité, voir docs/ui/YELEN_PRESTATAIRE_CTA_V1_SPEC.md).
            Jamais "Prendre RDV" par défaut : n'apparaît que si hasBooking. */}
        {isHotel && chambresHotel.length > 0 ? (
          <button
            onClick={() => { setSejourStep("arrivee"); setSejourModalOpen(true); }}
            className="tap"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 16px", borderRadius: "14px", border: `1.5px solid ${inputBord}`, background: inputBg, marginBottom: "10px", cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(245,166,35,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icons.Cal/>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Vos dates de séjour</div>
                <div style={{ color: C.text, fontSize: "13.5px", fontWeight: "800" }}>
                  {sejourArrivee && sejourDepart
                    ? `${new Date(`${sejourArrivee}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${new Date(`${sejourDepart}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
                    : "Choisir mes dates pour réserver"}
                </div>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
          </button>
        ) : ctaDecision.principal && (
            <div style={{ display: "grid", gridTemplateColumns: ctaQuickSecondary ? "1fr 1fr" : "1fr", gap: "10px", marginBottom: "10px" }}>
              {ctaDecision.principal.action === "rdv" ? (
                <Link href={ctaHref("rdv")} onClick={() => trackerCtaClic("rdv")} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "transparent", border: `1.5px solid ${inputBord}`, color: C.text, fontWeight: "800", fontSize: "13px", padding: "11px 12px", borderRadius: "12px", textDecoration: "none" }}>
                  <Icons.Cal /> {ctaDecision.principal.label}
                </Link>
              ) : (
                <a href={ctaHref(ctaDecision.principal.action)} onClick={() => trackerCtaClic(ctaDecision.principal!.action)} target={ctaDecision.principal.action === "phone" ? undefined : "_blank"} rel={ctaDecision.principal.action === "phone" ? undefined : "noreferrer"} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "transparent", border: `1.5px solid ${inputBord}`, color: C.text, fontWeight: "800", fontSize: "13px", padding: "11px 12px", borderRadius: "12px", textDecoration: "none" }}>
                  {ctaDecision.principal.action === "website" ? <Icons.Globe /> : ctaDecision.principal.action === "whatsapp" ? <Icons.Whatsapp /> : <Icons.Phone />}
                  {" "}{ctaDecision.principal.label}
                </a>
              )}
              {ctaQuickSecondary && (
                <a href={ctaHref(ctaQuickSecondary)} onClick={() => trackerCtaClic(ctaQuickSecondary)} target={ctaQuickSecondary === "phone" ? undefined : "_blank"} rel={ctaQuickSecondary === "phone" ? undefined : "noreferrer"} className="tap" style={ctaQuickSecondary === "whatsapp"
                  ? { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "transparent", border: `1px solid ${inputBord}`, color: "#22c55e", fontWeight: "700", fontSize: "13px", padding: "11px 12px", borderRadius: "12px", textDecoration: "none" }
                  : { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: inputBg, border: `1px solid ${inputBord}`, color: C.text, fontWeight: "700", fontSize: "13px", padding: "11px 12px", borderRadius: "12px", textDecoration: "none" }}>
                  {ctaQuickSecondary === "whatsapp" ? <Icons.Whatsapp /> : <Icons.Phone />} {CTA_LABELS[ctaQuickSecondary]}
                </a>
              )}
            </div>
        )}

        {/* "Garantie" (gauche) / "Prix & frais" (droite) — même ligne,
            façon DoorDash "Pricing & Fees" (retour Bryan 26/09/2026).
            "Garantie" toujours visible (vrai pour toute institution) ;
            "Prix & frais" seulement quand l'établissement a au moins un
            service RÉELLEMENT payant (paidServicesActifs > 0,
            paid_services.is_active=true, toutes catégories confondues —
            inclut les chambres d'hôtel). Jamais affiché pour un
            établissement qui ne propose que des RDV gratuits
            (institutions.services jsonb) : rien à expliquer sur le prix
            dans ce cas. Ouvrent les sheets explicatifs
            garantieSheetOpen/prixFraisSheetOpen ci-dessous. */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "-2px" }}>
          <button onClick={() => setGarantieSheetOpen(true)} className="tap" style={{ background: "none", border: "none", padding: "4px 0", color: C.textSubtle, fontSize: "11.5px", fontWeight: "700", textDecoration: "underline", cursor: "pointer" }}>
            Garantie
          </button>
          {paidServicesActifs > 0 && (
            <button onClick={() => setPrixFraisSheetOpen(true)} className="tap" style={{ background: "none", border: "none", padding: "4px 0", color: C.textSubtle, fontSize: "11.5px", fontWeight: "700", textDecoration: "underline", cursor: "pointer" }}>
              Prix &amp; frais
            </button>
          )}
        </div>

      </div>

      {/* STATS */}
      <div style={{ overflowX: "auto", padding: "4px 16px 0" }}>
        <div style={{ display: "flex", gap: "8px", paddingBottom: "2px" }}>
          {[
            { label: "Note",     value: noteMoyenne > 0 ? `${noteMoyenne.toFixed(1)}/5` : "—", color: C.text },
            { label: "Avis",     value: String(nbAvis),                                          color: C.text },
            { label: isHotel ? "Chambres" : "Services", value: isHotel ? (chambresHotel.length > 0 ? String(chambresHotel.length) : "—") : (inst.services.length > 0 ? String(inst.services.length) : "—"), color: C.text },
            { label: "Horaires", value: `${inst.horaires.filter(h => h.ouvert).length}/7j`,      color: C.text },
            ...(inst.annee_creation ? [{ label: "Fondée", value: inst.annee_creation, color: C.text }] : []),
          ].map(s => (
            <div key={s.label} style={{ flexShrink: 0, backgroundColor: C.cardBg, borderRadius: "12px", padding: "10px 14px", textAlign: "center", minWidth: "72px" }}>
              <div style={{ color: s.color, fontSize: "15px", fontWeight: "900", lineHeight: 1 }}>{s.value}</div>
              <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "600", marginTop: "3px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ANNONCES */}
      {annonces.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <SectionTitle icon={<Icons.Announce />} label="Annonces officielles" count={annonces.length} color="#F5A623"/>
          <div style={{ display: "flex", gap: "10px", overflowX: "auto", scrollSnapType: "x mandatory", alignItems: "flex-start", margin: "0 -16px", padding: "2px 16px 8px" }}>
            {annonces.map(a => {
              const t = ANNONCE_TYPES[a.type] || ANNONCE_TYPES.information;
              const images = a.format === "carrousel" && a.media_urls?.length ? a.media_urls : a.image_url ? [a.image_url] : [];
              return (
                <div key={a.id} onClick={() => setDetailOpenId(a.id)} className="tap" style={{ width: "300px", flexShrink: 0, scrollSnapAlign: "start", backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden", border: `1px solid ${t.border}`, borderLeft: `3px solid ${t.color}`, boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.35)" : "0 4px 16px rgba(0,0,0,0.08)", cursor: "pointer" }}>
                  {images.length > 0 ? (
                    <AnnonceImageCarousel images={images} height={120} dotActiveColor="#F5A623"/>
                  ) : a.format === "video" && a.media_urls?.[0] ? (
                    <div style={{ width: "100%", height: "180px", overflow: "hidden", backgroundColor: "#000" }}>
                      <video src={a.media_urls[0]} style={{ width: "100%", height: "100%", objectFit: "cover" }} controls playsInline/>
                    </div>
                  ) : null}
                  <div style={{ padding: "13px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                      <span style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color, fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{t.label.toUpperCase()}</span>
                      {a.epingle && <span style={{ background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", color: "#F5A623", fontSize: "10px", fontWeight: "700", padding: "2px 7px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}><Icons.Pin2 /> Épinglé</span>}
                      <span style={{ color: C.textSubtle, fontSize: "10px", marginLeft: "auto" }}>{new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                    </div>
                    <h3 style={{ color: C.text, fontSize: "14px", fontWeight: "800", margin: "0 0 6px", lineHeight: 1.3 }}>{a.titre}</h3>
                    <p style={{ color: C.textMuted, fontSize: "12px", lineHeight: 1.65, margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.contenu}</p>
                    {a.contenu.length > 130 && (
                      <button onClick={e => { e.stopPropagation(); setDetailOpenId(a.id); }} className="tap" style={{ background: "none", border: "none", padding: 0, marginTop: "4px", color: "#F5A623", fontSize: "11.5px", fontWeight: "700", cursor: "pointer" }}>Voir plus</button>
                    )}
                    {a.format === "pdf" && a.media_urls?.[0] && (
                      <a href={a.media_urls[0]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#ef4444", fontSize: "11px", fontWeight: "700", textDecoration: "none", marginTop: "8px" }}>
                        <Icons.Note /> Ouvrir le PDF
                      </a>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "10px" }}>
                      {a.date_expiration ? (
                        <p style={{ color: C.textSubtle, fontSize: "10px", margin: 0, display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                          <Icons.Clock /> Expire le {new Date(a.date_expiration).toLocaleDateString("fr-FR")}
                        </p>
                      ) : <span/>}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button onClick={e => { e.stopPropagation(); handleToggleLike(a.id); }} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: mesLikes.has(a.id) ? "rgba(239,68,68,0.1)" : "transparent", border: `1px solid ${mesLikes.has(a.id) ? "rgba(239,68,68,0.3)" : C.borderCard}`, borderRadius: "20px", padding: "5px 12px", cursor: "pointer" }}>
                          {Icons.Heart(mesLikes.has(a.id))}
                          <span style={{ color: mesLikes.has(a.id) ? "#ef4444" : C.textSubtle, fontSize: "11px", fontWeight: "700" }}>{likesCount[a.id] ?? 0}</span>
                        </button>
                        <button onClick={e => { e.stopPropagation(); setCommentsOpenId(a.id); }} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "transparent", border: `1px solid ${C.borderCard}`, borderRadius: "20px", padding: "5px 12px", cursor: "pointer", color: C.textSubtle }}>
                          <Icons.Comment/>
                          <span style={{ fontSize: "11px", fontWeight: "700" }}>{(commentaires[a.id] ?? []).length}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TABS NAV */}
      <div style={{ position: "sticky", top: "calc(52px + env(safe-area-inset-top))", zIndex: 150, backgroundColor: C.pageBg, borderBottom: `1px solid ${C.borderCard}`, marginTop: "16px" }}>
        <div style={{ overflowX: "auto", padding: "0 16px" }}>
          <div style={{ display: "flex", gap: "2px" }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={tab.onPress}
                className="tap"
                style={{
                  flexShrink: 0, padding: "12px 14px", border: "none", cursor: "pointer",
                  background: "transparent", borderBottom: "2px solid transparent",
                  color: C.textSubtle,
                  fontSize: "13px", fontWeight: "600",
                  display: "flex", alignItems: "center", gap: "5px",
                  transition: "color 0.15s, border-color 0.15s",
                  marginBottom: "-1px",
                }}
              >
                <span style={{ opacity: 0.8 }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span style={{ background: inputBg, color: C.textSubtle, fontSize: "10px", fontWeight: "800", padding: "1px 6px", borderRadius: "10px" }}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SECTIONS — tout le contenu est monté en permanence désormais (plus
          de tab masquant les autres) ; les ancres ci-dessus y font défiler.
          scrollMarginTop compense le header + la barre d'ancres, tous deux
          sticky, pour que la section ne s'arrête pas cachée dessous. */}
      <div style={{ padding: "16px 16px 0", animation: "fadeUp 0.2s ease" }}>

        {/* INFO */}
        <div ref={infoRef} style={{ display: "flex", flexDirection: "column", gap: "14px", scrollMarginTop: "calc(52px + env(safe-area-inset-top) + 64px)" }}>
            {inst.description && (() => {
              const DESCRIPTION_MAX = 140;
              const desc = inst.description;
              const tronquee = desc.length > DESCRIPTION_MAX || desc.split("\n").length > 2;
              const apercu = tronquee ? desc.split("\n").slice(0, 2).join("\n").slice(0, DESCRIPTION_MAX).trimEnd() : desc;
              return (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden" }}>
                {/* Repliée par défaut, même patron que Contacts/Détails
                    (retour Bryan 27/09/2026) : pas de compteur naturel ici,
                    juste un toggle icône+libellé. */}
                <button onClick={() => setAproposDetailOpen(v => !v)} className="tap" aria-expanded={aproposDetailOpen} style={{ width: "100%", background: "none", border: "none", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ color: C.text, opacity: 0.8, display: "flex" }}><Icons.Note/></div>
                    <span style={{ color: C.text, fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px" }}>À propos</span>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: aproposDetailOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {aproposDetailOpen && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.borderSubtle}`, paddingTop: "14px" }}>
                    <p style={{ color: C.textMuted, fontSize: "13px", lineHeight: 1.75, margin: 0 }}>
                      {apercu}{tronquee ? "… " : ""}
                      {tronquee && (
                        <button onClick={() => setDescriptionSheetOpen(true)} className="tap" style={{ background: "none", border: "none", padding: 0, color: C.text, fontSize: "13px", fontWeight: "800", cursor: "pointer" }}>Voir plus</button>
                      )}
                    </p>
                    {inst.langue && inst.langue.length > 0 && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "12px", alignItems: "center" }}>
                        <span style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "600" }}>Langues :</span>
                        {inst.langue.map(l => <span key={l} style={{ background: inputBg, border: `1px solid ${inputBord}`, color: C.text, fontSize: "11px", fontWeight: "600", padding: "3px 10px", borderRadius: "20px" }}>{l}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            {(() => {
              const contactCount = [inst.adresse, inst.phone, inst.whatsapp, inst.email, websiteHref].filter(Boolean).length;
              return (
            <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden" }}>
              {/* Coordonnées repliées par défaut, façon DoorDash "Cart
                  summary" (retour Bryan 26/09/2026) : une seule ligne
                  cliquable ("Contacts · N éléments"), la liste complète
                  (adresse/téléphone/WhatsApp/email/site) ne s'affiche
                  qu'au clic — aucun résumé équivalent au statut Ouvert/
                  Fermé des Horaires n'existe ici, donc tout est replié. */}
              <button onClick={() => setContactDetailOpen(v => !v)} className="tap" aria-expanded={contactDetailOpen} style={{ width: "100%", background: "none", border: "none", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ color: C.text, opacity: 0.8, display: "flex" }}><Icons.Phone/></div>
                  <span style={{ color: C.text, fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px" }}>Contacts</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: C.textSubtle, fontSize: "12.5px", fontWeight: "600" }}>{contactCount} élément{contactCount > 1 ? "s" : ""}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: contactDetailOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </button>
              {contactDetailOpen && (
              <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.borderSubtle}` }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "14px" }}>
                {inst.adresse && (
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.text }}><Icons.MapPin /></div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>Adresse</div>
                      <div style={{ color: C.text, fontSize: "13px", fontWeight: "600", lineHeight: 1.4 }}>{inst.adresse}</div>
                      {(inst.quartier || inst.ville) && <div style={{ color: C.textSubtle, fontSize: "11px", marginTop: "2px" }}>{[inst.quartier, inst.ville].filter(Boolean).join(", ")}</div>}
                    </div>
                  </div>
                )}
                {inst.phone && (
                  <a href={`tel:${inst.phone}`} onClick={() => trackerCtaClic("phone")} style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17v-.08z"/></svg>
                    </div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>Téléphone</div>
                      <div style={{ color: C.text, fontSize: "14px", fontWeight: "700" }}>{inst.phone}</div>
                    </div>
                  </a>
                )}
                {inst.whatsapp && (
                  <a href={`https://wa.me/${inst.whatsapp.replace(/\D/g, "")}`} onClick={() => trackerCtaClic("whatsapp")} target="_blank" rel="noreferrer" style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" fill="#25D366" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    </div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>WhatsApp</div>
                      <div style={{ color: C.text, fontSize: "14px", fontWeight: "700" }}>{inst.whatsapp}</div>
                    </div>
                  </a>
                )}
                {inst.email && (
                  <a href={`mailto:${inst.email}`} style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>Email</div>
                      <div style={{ color: C.text, fontSize: "13px", fontWeight: "600" }}>{inst.email}</div>
                    </div>
                  </a>
                )}
                {websiteHref && (
                  <a href={websiteHref} onClick={() => trackerCtaClic("website")} target="_blank" rel="noreferrer" style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    </div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>Site web</div>
                      <div style={{ color: C.text, fontSize: "13px", fontWeight: "600" }}>Visiter le site →</div>
                    </div>
                  </a>
                )}
              </div>
              </div>
              )}
            </div>
              );
            })()}

            {(inst.annee_creation || inst.capacite) && (() => {
              const detailsCount = [inst.annee_creation, inst.capacite].filter(Boolean).length;
              return (
                <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden" }}>
                  {/* Repliée par défaut, même patron que Contacts (retour
                      Bryan 27/09/2026) : une seule ligne cliquable
                      ("Détails · N éléments"), aucun résumé équivalent au
                      statut Ouvert/Fermé des Horaires n'existe ici. */}
                  <button onClick={() => setDetailsDetailOpen(v => !v)} className="tap" aria-expanded={detailsDetailOpen} style={{ width: "100%", background: "none", border: "none", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ color: C.text, opacity: 0.8, display: "flex" }}><Icons.Building/></div>
                      <span style={{ color: C.text, fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px" }}>Détails</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: C.textSubtle, fontSize: "12.5px", fontWeight: "600" }}>{detailsCount} élément{detailsCount > 1 ? "s" : ""}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: detailsDetailOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                  </button>
                  {detailsDetailOpen && (
                    <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.borderSubtle}` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", paddingTop: "14px" }}>
                        {inst.annee_creation && (
                          <div style={{ background: inputBg, borderRadius: "12px", padding: "12px", border: `1px solid ${inputBord}` }}>
                            <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Fondée en</div>
                            <div style={{ color: C.text, fontSize: "16px", fontWeight: "900" }}>{inst.annee_creation}</div>
                          </div>
                        )}
                        {inst.capacite && (
                          <div style={{ background: inputBg, borderRadius: "12px", padding: "12px", border: `1px solid ${inputBord}` }}>
                            <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Capacité</div>
                            <div style={{ color: C.text, fontSize: "16px", fontWeight: "900" }}>{inst.capacite}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
        </div>

        {/* HORAIRES */}
        <div ref={horairesRef} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "24px", scrollMarginTop: "calc(52px + env(safe-area-inset-top) + 64px)" }}>
            <div>
              <SectionTitle icon={<Icons.Clock />} label="Horaires" color={C.text}/>
              <p style={{ color: C.textSubtle, fontSize: "12px", margin: "-8px 0 0", lineHeight: 1.5 }}>Retrouvez les jours et horaires d&apos;ouverture de {inst.name} pour planifier votre visite.</p>
            </div>
            {inst.horaires.length === 0 ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}><Icons.Clock /></div>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Horaires non renseignés</p>
                <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Contactez l&apos;institution pour connaître ses horaires.</p>
              </div>
            ) : (
              <>
                <div style={{ backgroundColor: "transparent", border: `1px solid ${ouvert ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, borderRadius: 0, padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: ouvert ? "#22c55e" : "#ef4444" }}/>
                  </div>
                  <div>
                    <div style={{ color: ouvert ? "#22c55e" : "#ef4444", fontSize: "14px", fontWeight: "800" }}>{ouvert ? "Ouvert maintenant" : "Fermé maintenant"}</div>
                    {horaireAujd && <div style={{ color: C.textSubtle, fontSize: "12px" }}>{jourAujd} · {formatHoraire(horaireAujd)}</div>}
                  </div>
                </div>
                {/* Horaire complet — replié par défaut, façon DoorDash
                    "Cart summary" (retour Bryan 26/09/2026) : une seule
                    ligne cliquable résume ("Horaire complet · 7 jours"),
                    le détail jour par jour ne s'affiche qu'au clic. */}
                <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden" }}>
                  <button onClick={() => setHoraireDetailOpen(v => !v)} className="tap" aria-expanded={horaireDetailOpen} style={{ width: "100%", background: "none", border: "none", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <span style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Horaire complet</span>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: C.textSubtle, fontSize: "12.5px", fontWeight: "600" }}>{inst.horaires.length} jours</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: horaireDetailOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                  </button>
                  {horaireDetailOpen && (
                    <div style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                      {inst.horaires.map((h, i) => {
                        const isToday = h.jour.toLowerCase() === jourAujd.toLowerCase();
                        return (
                          <div key={h.jour} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < inst.horaires.length - 1 ? `1px solid ${C.borderSubtle}` : "none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              {isToday && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F5A623", flexShrink: 0 }}/>}
                              <span style={{ color: isToday ? "#F5A623" : C.text, fontSize: "14px", fontWeight: isToday ? "800" : "600" }}>{h.jour}</span>
                              {isToday && <span style={{ background: "#F5A623", color: "#fff", fontSize: "9px", fontWeight: "800", padding: "1px 6px", borderRadius: "10px" }}>Aujourd&apos;hui</span>}
                            </div>
                            <span style={{ color: h.ouvert ? C.text : C.textSubtle, fontSize: "13px", fontWeight: h.ouvert ? "700" : "500", fontStyle: h.ouvert ? "normal" : "italic" }}>{formatHoraire(h)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
        </div>

        {/* SERVICES — isHotel : chambres réelles (paid_services,
            est_chambre=true, avec photo/prix). Autres secteurs : inchangé,
            institutions.services tel quel (retour Bryan 20/08/2026 :
            "l'ajout des chambres avec image est obligatoire", l'ancienne
            liste texte sans photo était insuffisante pour un hôtel). */}
        <div ref={servicesRef} style={{ marginTop: "24px", scrollMarginTop: "calc(52px + env(safe-area-inset-top) + 64px)" }}>
          <SectionTitle icon={isHotel ? <Icons.Building /> : <Icons.Note />} label={isHotel ? "Chambres" : "Services"} color={C.text}/>
          <p style={{ color: C.textSubtle, fontSize: "12px", margin: "-8px 0 14px", lineHeight: 1.5 }}>{isHotel ? `Découvrez les chambres disponibles chez ${inst.name}, avec photos et tarifs.` : `Découvrez les services proposés par ${inst.name} et prenez rendez-vous en quelques clics.`}</p>
          {isHotel ? (
            chambresHotel.length === 0 ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}><Icons.Note /></div>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Chambres non renseignées</p>
                <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Contactez l&apos;établissement pour connaître ses chambres.</p>
              </div>
            ) : (
              <div>
                {/* Deux rangées horizontales, deux rendus (retour Bryan
                    27/09/2026 : "2 lignes, la 2e avec un rendu différent —
                    plusieurs choix de visionnage, reste professionnel").
                    Coins carrés partout (retour Bryan : "retire les coins
                    arrondis"), cartes agrandies (148px jugé trop petit).
                    Les deux rangées listent les 5 mêmes premières chambres
                    (chambresHotel.slice(0,5)) sous deux formats — pas une
                    pagination, une redondance volontaire de navigation.
                    Chambres au-delà de 5 : toujours consultables via
                    "Autres chambres" dans la fiche détaillée. */}
                <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" }}>Aperçu rapide</div>
                <div style={{ display: "flex", gap: "10px", overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -16px", padding: "2px 16px 8px" }}>
                  {chambresHotel.slice(0, 5).map((c, i) => (
                    <div key={c.id} onClick={() => { setChambreOuverte(c); setDescExpanded(false); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") { setChambreOuverte(c); setDescExpanded(false); } }} style={{ width: "176px", flexShrink: 0, scrollSnapAlign: "start", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: 0, overflow: "hidden", animation: `fadeUp 0.2s ease ${i * 0.03}s both`, cursor: "pointer" }} className="tap">
                      <div style={{ position: "relative" }}>
                        {c.photos.length > 0 ? (
                          // IMG-EXCEPTION: reason=vignette carte chambre rangée 1, URL Storage publique stable | reviewed=2026-09-27
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.photos[0]} alt={c.nom} style={{ width: "100%", height: "132px", objectFit: "cover", display: "block" }}/>
                        ) : (
                          <div style={{ width: "100%", height: "132px", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSubtle }}><Icons.Note/></div>
                        )}
                        {/* CTA directe — ouvre le wizard de réservation
                            immédiatement pour cette chambre, sans passer par
                            la fiche détaillée (retour Bryan 27/09/2026 :
                            "clique ouvre direct l'étape Que souhaitez-vous
                            faire"). Le reste de la carte garde l'accès à la
                            fiche détaillée (chambreOuverte), inchangé. */}
                        <Link href={`/rdv/${inst.id}?service=${encodeURIComponent(c.nom)}`} onClick={e => { e.stopPropagation(); trackerCtaClic("rdv"); }} aria-label={`Réserver ${c.nom}`} className="tap" style={{ position: "absolute", right: "6px", bottom: "6px", width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </Link>
                      </div>
                      <div style={{ padding: "11px 12px" }}>
                        <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nom}</div>
                        {c.capacite_max && <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "600", marginTop: "2px" }}>{c.capacite_max} pers.</div>}
                        <div style={{ fontSize: "12.5px", fontWeight: "800", marginTop: "5px" }}><span style={{ color: "#F5A623" }}>{c.prix.toLocaleString("fr-FR")} GNF</span>{c.unite_prix && <span style={{ color: C.text }}> / {c.unite_prix}</span>}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", margin: "16px 0 8px" }}>Vue détaillée</div>
                <div style={{ display: "flex", gap: "10px", overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -16px", padding: "2px 16px 8px" }}>
                  {chambresHotel.slice(0, 5).map((c, i) => (
                    <div key={c.id} onClick={() => { setChambreOuverte(c); setDescExpanded(false); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") { setChambreOuverte(c); setDescExpanded(false); } }} style={{ width: "268px", flexShrink: 0, scrollSnapAlign: "start", display: "flex", gap: "10px", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: 0, overflow: "hidden", padding: "10px", animation: `fadeUp 0.2s ease ${i * 0.03}s both`, cursor: "pointer" }} className="tap">
                      {c.photos.length > 0 ? (
                        // IMG-EXCEPTION: reason=vignette carte chambre rangée 2 (vue liste), URL Storage publique stable | reviewed=2026-09-27
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.photos[0]} alt={c.nom} style={{ width: "88px", height: "88px", objectFit: "cover", borderRadius: 0, flexShrink: 0 }}/>
                      ) : (
                        <div style={{ width: "88px", height: "88px", borderRadius: 0, flexShrink: 0, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSubtle }}><Icons.Note/></div>
                      )}
                      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                        <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nom}</div>
                        {c.capacite_max && <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "600", marginTop: "2px" }}>{c.capacite_max} pers.</div>}
                        <div style={{ fontSize: "12.5px", fontWeight: "800", marginTop: "4px" }}><span style={{ color: "#F5A623" }}>{c.prix.toLocaleString("fr-FR")} GNF</span>{c.unite_prix && <span style={{ color: C.text }}> / {c.unite_prix}</span>}</div>
                        {/* CTA — pill "Réserver" plutôt que le "+" de la
                            rangée 1 (rendu volontairement différent), même
                            comportement (accès direct au wizard). */}
                        <Link href={`/rdv/${inst.id}?service=${encodeURIComponent(c.nom)}`} onClick={e => { e.stopPropagation(); trackerCtaClic("rdv"); }} className="tap" style={{ marginTop: "auto", alignSelf: "flex-start", backgroundColor: "#F5A623", color: "#080812", fontSize: "11px", fontWeight: "800", padding: "6px 12px", borderRadius: 0, textDecoration: "none" }}>
                          Réserver
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>

                <p style={{ color: C.textSubtle, fontSize: "11px", textAlign: "center", marginTop: "4px", fontStyle: "italic" }}>Appuyez sur une chambre pour voir ses photos, ou sur le CTA pour réserver directement.</p>
              </div>
            )
          ) : inst.services.length === 0 ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}><Icons.Note /></div>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Services non renseignés</p>
                <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Contactez l&apos;institution pour connaître ses services.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {inst.services.map((s, i) => (
                  <Link key={`${s}-${i}`} href={`/rdv/${inst.id}?service=${encodeURIComponent(s)}`} onClick={() => trackerCtaClic("rdv")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 16px", textDecoration: "none", animation: `fadeUp 0.2s ease ${i * 0.03}s both` }} className="tap">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: meta.color, flexShrink: 0 }}/>
                      <span style={{ color: C.text, fontSize: "14px", fontWeight: "600" }}>{s}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                      <span style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700" }}>RDV</span>
                      <span style={{ color: meta.color }}><Icons.Chevron /></span>
                    </div>
                  </Link>
                ))}
                <p style={{ color: C.textSubtle, fontSize: "11px", textAlign: "center", marginTop: "8px", fontStyle: "italic" }}>Appuyez sur un service pour prendre rendez-vous directement.</p>
              </div>
            )}
        </div>

        {/* ÉQUIPEMENTS DE L'ÉTABLISSEMENT — chantier "Équipements
            structurés" (21/08/2026, décision Bryan). Remplace, pour
            l'hôtel, la donnée qui vivait auparavant dans le popup texte
            libre "Équipements & règles" — vraie section visible sur la
            fiche, grille icône+libellé groupée par catégorie, jamais une
            popup générique. N'affiche que les catégories qui ont au
            moins un équipement coché (§6 du brief : jamais un équipement
            non sélectionné à l'écran) ; bloc absent si l'hôtel n'a encore
            rien coché, jamais une grille vide affirmant une absence. */}
        {isHotel && inst.equipements_etablissement.length > 0 && (() => {
          // Aperçu à plat (toutes catégories confondues, ordre
          // EQUIPEMENTS_ETABLISSEMENT) — replié par défaut, même patron
          // que Horaires/Contact (retour Bryan 27/09/2026) : quelques
          // équipements visibles d'emblée, le reste derrière un clic.
          // Pas de pli si la liste tient déjà dans l'aperçu (jamais un
          // toggle inutile).
          const APERCU = 6;
          const tousItems = EQUIPEMENTS_ETABLISSEMENT.flatMap(cat => cat.items.filter(i => inst.equipements_etablissement.includes(i.code)));
          const pliable = tousItems.length > APERCU;
          const grilleStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px" };
          const itemNode = (item: (typeof tousItems)[number]) => (
            <div key={item.code} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {item.icon("#F5A623")}
              <span style={{ color: C.text, fontSize: "12.5px", fontWeight: "600" }}>{item.label}</span>
            </div>
          );
          return (
            <div style={{ marginTop: "24px" }}>
              <SectionTitle icon={<Icons.Note/>} label="Équipements" color="#60a5fa"/>
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden" }}>
                {equipementsDetailOpen ? (
                  <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    {EQUIPEMENTS_ETABLISSEMENT.map(cat => {
                      const items = cat.items.filter(i => inst.equipements_etablissement.includes(i.code));
                      if (items.length === 0) return null;
                      return (
                        <div key={cat.id}>
                          <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "9px" }}>{cat.label}</div>
                          <div style={grilleStyle}>{items.map(itemNode)}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: "16px" }}>
                    <div style={grilleStyle}>{tousItems.slice(0, APERCU).map(itemNode)}</div>
                  </div>
                )}
                {pliable && (
                  <button onClick={() => setEquipementsDetailOpen(v => !v)} className="tap" aria-expanded={equipementsDetailOpen} style={{ width: "100%", background: "none", border: "none", borderTop: `1px solid ${C.borderSubtle}`, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <span style={{ color: C.text, fontSize: "13.5px", fontWeight: "800" }}>{equipementsDetailOpen ? "Réduire" : "Voir tous les équipements"}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: C.textSubtle, fontSize: "12.5px", fontWeight: "600" }}>{tousItems.length}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: equipementsDetailOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* EXPÉRIENCE & SERVICES — chantier Services Hôtel V2
            (docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md §H, 20/08/2026).
            Bloc additif, isHotel uniquement, n'existe pas si l'hôtel n'a
            configuré aucune prestation (jamais une famille inventée —
            §3/§6 du brief). Familles = regroupement dynamique par
            `categorie`, jamais une liste figée. */}
        {isHotel && prestationsHotel.some(p => !p.est_chambre) && (() => {
          const TYPE_META: Record<string, { label: string; action: string | null; color: string }> = {
            reservable:       { label: "Réservable",       action: "Réserver",                     color: "#60a5fa" },
            commandable:      { label: "Commandable",      action: "Commander",                     color: "#34d399" },
            supplement:       { label: "Avec supplément",  action: "Ajouter à ma réservation",       color: "#fbbf24" },
            horaires_limites: { label: "Horaires limités", action: null,                             color: "#c084fc" },
          };
          const prestationsSeules = prestationsHotel.filter(p => !p.est_chambre);
          const familles = Array.from(new Set(prestationsSeules.map(p => p.categorie).filter((c): c is string => !!c)));
          return (
            <div style={{ marginTop: "24px" }}>
              <SectionTitle icon={<Icons.Building/>} label="Expérience et services" color="#34d399"/>
              {/* Liste compacte façon DoorDash (retour Bryan 27/09/2026 :
                  "je veux une représentation vaste, ça peut être plusieurs
                  services") — remplace les grandes cartes empilées
                  (photo 56px + paragraphe complet + gros bouton pill, qui
                  ne passait pas à l'échelle au-delà de 2-3 services) par
                  des lignes fines groupées par famille dans un bloc à
                  bordure unique (même patron que les Key Facts de la fiche
                  chambre), coins carrés (cohérent avec Chambres
                  ci-dessus). La description complète n'est pas perdue —
                  elle vit dans la fiche détaillée (serviceOuvert), que la
                  ligne ouvre toujours au tap. CTA directe conservée, même
                  patron "+" circulaire doré que les chambres plutôt que le
                  gros bouton pill d'avant. */}
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {familles.map(famille => {
                  const items = prestationsSeules.filter(p => p.categorie === famille);
                  return (
                    <div key={famille}>
                      <div style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{famille}</div>
                      <div style={{ border: `1px solid ${C.borderCard}`, borderRadius: 0, overflow: "hidden" }}>
                        {items.map((p, i) => {
                          const meta = p.type_prestation ? TYPE_META[p.type_prestation] : null;
                          return (
                            <div key={p.id} onClick={() => setServiceOuvert(p)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") setServiceOuvert(p); }} style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: C.cardBg, borderTop: i > 0 ? `1px solid ${C.borderCard}` : "none", padding: "10px 12px", cursor: "pointer" }} className="tap">
                              {/* PHOTO — vignette compacte si renseignée. */}
                              {p.photos.length > 0 ? (
                                // IMG-EXCEPTION: reason=vignette liste compacte service, URL Storage publique stable | reviewed=2026-09-27
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.photos[0]} alt={p.nom} style={{ width: "48px", height: "48px", objectFit: "cover", flexShrink: 0 }}/>
                              ) : (
                                <div style={{ width: "48px", height: "48px", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.textSubtle }}><Icons.Note/></div>
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                  <span style={{ color: C.text, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</span>
                                  <span style={{ fontSize: "12.5px", fontWeight: "800", whiteSpace: "nowrap", flexShrink: 0 }}><span style={{ color: "#F5A623" }}>{p.prix.toLocaleString("fr-FR")} GNF</span>{p.unite_prix && <span style={{ color: C.text }}> / {p.unite_prix}</span>}</span>
                                </div>
                                {(meta || p.duree_minutes > 0) && (
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
                                    {meta && <span style={{ color: meta.color, fontSize: "10px", fontWeight: "800" }}>{meta.label}</span>}
                                    {p.duree_minutes > 0 && <span style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "600" }}>{p.duree_minutes} min</span>}
                                  </div>
                                )}
                              </div>
                              {meta?.action && (
                                <Link href={`/rdv/${inst.id}?service=${encodeURIComponent(p.nom)}`} onClick={e => { e.stopPropagation(); trackerCtaClic("rdv"); }} aria-label={`${meta.action} ${p.nom}`} className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                </Link>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* AVIS — refonte (retour Bryan 09/08/2026) : le bandeau note/
            histogramme (auparavant uniquement dans le plein écran Avis,
            "Pop à ne pas toucher") est désormais aussi affiché ici en
            aperçu, avec le plus récent avis déjà répondu par
            l'établissement s'il en existe un (`avis` déjà trié
            created_at desc, cf. le chargement plus haut) — jamais un avis
            fabriqué s'il n'y a encore aucune réponse réelle. */}
        <div style={{ marginTop: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "14px" }}>
            <h3 style={{ color: C.text, fontSize: "18px", fontWeight: "900", letterSpacing: "-0.3px", margin: 0 }}>Avis</h3>
            <button onClick={() => setReviewsOpen(true)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "#F5A623", border: "none", borderRadius: "20px", padding: "8px 14px", color: "#080812", fontSize: "12.5px", fontWeight: "800", cursor: "pointer", flexShrink: 0 }}>
              {nbAvis > 0 ? `Voir les ${nbAvis} avis détaillés` : "Soyez le premier à laisser un avis"}
              <Icons.Chevron/>
            </button>
          </div>

          <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "18px", display: "flex", alignItems: "center", gap: "20px", marginBottom: "14px" }}>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: "34px", fontWeight: "900", color: noteMoyenne >= 4 ? "#22c55e" : noteMoyenne >= 3 ? "#F5A623" : "#ef4444", lineHeight: 1 }}>
                {noteMoyenne > 0 ? noteMoyenne.toFixed(1) : "—"}
              </div>
              <Stars note={noteMoyenne} size={12} isDark={isDark}/>
              <div style={{ color: C.textSubtle, fontSize: "10px", marginTop: "4px" }}>{nbAvis} avis</div>
            </div>
            <div style={{ flex: 1 }}>
              {[5,4,3,2,1].map(n => {
                const count = avis.filter(a => Math.round(a.note) === n).length;
                const pct = avis.length > 0 ? (count / avis.length) * 100 : 0;
                return (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", width: "8px" }}>{n}</span>
                    <div style={{ flex: 1, height: "6px", borderRadius: "3px", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: n >= 4 ? "#22c55e" : n >= 3 ? "#F5A623" : "#ef4444", borderRadius: "3px" }}/>
                    </div>
                    <span style={{ color: C.textSubtle, fontSize: "10px", width: "16px", textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {(() => {
            const avisRepondu = avis.find(a => a.reponse_institution);
            if (!avisRepondu) return null;
            return (
              <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "14px 15px", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "8px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>
                    {avisRepondu.nom.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span style={{ color: C.text, fontSize: "13px", fontWeight: "800" }}>{avisRepondu.nom}</span>
                    <Stars note={avisRepondu.note} size={11} isDark={isDark}/>
                  </div>
                </div>
                {avisRepondu.commentaire && (
                  <p style={{ color: C.text, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 8px", fontStyle: "italic", fontWeight: "600" }}>&quot;{avisRepondu.commentaire}&quot;</p>
                )}
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "700", marginBottom: "3px" }}>
                    {inst.name}{avisRepondu.reponse_le ? ` · ${new Date(avisRepondu.reponse_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
                  </div>
                  <div style={{ color: C.textMuted, fontSize: "12px", lineHeight: 1.5 }}>{avisRepondu.reponse_institution}</div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* QUESTIONS DES CITOYENS — refonte façon Booking "Travelers are
            asking" (retour Bryan 09/08/2026 : l'ancienne version empilait
            jusqu'à 3 questions, jugée "incompréhensible" — une seule
            question mise en avant désormais, en gros, avec icône, comme
            Booking). La propre question en attente du citoyen passe en
            priorité (il veut voir où en est SA question), sinon la plus
            récente déjà répondue. "Voir toutes les questions" reste
            l'endroit où tout s'affiche (popup dédié, cf. plus bas). */}
        {questionVedette ? (
          <div style={{ marginTop: "24px" }}>
            <h3 style={{ color: C.text, fontSize: "18px", fontWeight: "900", letterSpacing: "-0.3px", margin: "0 0 14px" }}>Les citoyens posent des questions</h3>
            <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
              <div style={{ flexShrink: 0, width: "26px", height: "26px", borderRadius: "50%", background: C.borderCard, display: "flex", alignItems: "center", justifyContent: "center", color: C.text }}>
                <Icons.Comment/>
              </div>
              <p style={{ color: C.text, fontSize: "15px", fontWeight: "800", lineHeight: 1.4, margin: 0 }}>{questionVedette.question}</p>
            </div>
            {questionVedette.reponse ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 15px" }}>
                <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "700", marginBottom: "5px" }}>
                  Réponse de l&apos;établissement{questionVedette.reponse_le ? ` · ${new Date(questionVedette.reponse_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
                </div>
                <p style={{ color: C.textMuted, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>{questionVedette.reponse}</p>
              </div>
            ) : (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "12px 15px" }}>
                <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "700" }}>En attente de réponse de l&apos;établissement</span>
              </div>
            )}
            {delaiReponseJours !== null && (
              <p style={{ color: C.textFaint, fontSize: "11px", margin: "10px 0 0" }}>
                Cet établissement répond généralement en {delaiReponseJours} jour{delaiReponseJours > 1 ? "s" : ""}.
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "8px", marginTop: "16px" }}>
              {nbQuestionsTotal > 1 && (
                <button onClick={() => setQuestionsListOpen(true)} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, flex: "1 1 auto", background: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "20px", padding: "8px 12px", color: C.text, fontSize: "12px", fontWeight: "800", cursor: "pointer" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Toutes les questions ({nbQuestionsTotal})</span>
                  <span style={{ flexShrink: 0, display: "flex" }}><Icons.Chevron/></span>
                </button>
              )}
              <button onClick={ouvrirPoserQuestion} className="tap" style={{ display: "inline-flex", backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "12px", padding: "12px 18px", fontSize: "13px", fontWeight: "800", cursor: "pointer", boxShadow: "0 6px 20px rgba(245,166,35,0.35)", flexShrink: 0, whiteSpace: "nowrap" }}>
                Poser une question
              </button>
            </div>
          </div>
        ) : (
          // Refonte (retour Bryan 26/09/2026 : "change complètement sa
          // façon, retire le fond") — l'ancien gros bouton plein doré
          // faisait passer un texte informatif pour un CTA géant. Repris
          // sur le même patron icône+texte que la question vedette
          // ci-dessus (cercle Icons.Comment), sans aucun fond ; la vraie
          // action est maintenant un bouton correctement dimensionné,
          // pas toute la carte.
          <div style={{ marginTop: "24px" }}>
            <h3 style={{ color: C.text, fontSize: "18px", fontWeight: "900", letterSpacing: "-0.3px", margin: "0 0 14px" }}>Les citoyens posent des questions</h3>
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <div style={{ flexShrink: 0, width: "26px", height: "26px", borderRadius: "50%", background: C.borderCard, display: "flex", alignItems: "center", justifyContent: "center", color: C.text }}>
                <Icons.Comment/>
              </div>
              <p style={{ color: C.textMuted, fontSize: "13.5px", lineHeight: 1.5, margin: 0 }}>Aucune question n&apos;a encore été posée à cet établissement.</p>
            </div>
            <button onClick={ouvrirPoserQuestion} className="tap" style={{ display: "inline-flex", backgroundColor: "transparent", color: C.text, border: `1.5px solid ${inputBord}`, borderRadius: 0, padding: "12px 18px", fontSize: "13px", fontWeight: "800", cursor: "pointer" }}>
              Soyez le premier à poser une question
            </button>
          </div>
        )}

        {/* CERTIFICATION — réelle (badge_verifie accordé par un admin Yelen
            après contrôle des documents officiels de l'établissement, voir
            api/admin/institutions/[id]/badge), pas décorative. Fond dégradé
            bleu propre à cette section, pour ne pas se confondre avec les
            autres cartes de la fiche (satisfaction=or, plus d'infos=violet). */}
        {inst.badge_verifie && (
          <div style={{ marginTop: "24px", position: "relative", overflow: "hidden", borderRadius: "20px", background: isDark ? "linear-gradient(160deg, rgba(59,130,246,0.12), rgba(59,130,246,0.03))" : "linear-gradient(160deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02))", border: `1px solid ${C.borderCard}`, padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
              <div style={{ position: "relative", width: "48px", height: "48px", flexShrink: 0 }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#60a5fa)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(59,130,246,0.35)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                </div>
              </div>
              <div>
                <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: "0 0 2px" }}>Établissement vérifié</h3>
                <p style={{ color: "#3b82f6", fontSize: "11px", fontWeight: "700", margin: 0 }}>Certifié par l&apos;équipe Yelen</p>
              </div>
            </div>
            <p style={{ color: C.textMuted, fontSize: "13px", lineHeight: 1.7, margin: 0 }}>
              L&apos;identité et les documents officiels de cet établissement ont été contrôlés par l&apos;équipe Yelen avant sa mise en ligne sur la plateforme.
            </p>
          </div>
        )}

        {/* FAQ — refonte façon Booking (retour Bryan 09/08/2026) : chaque
            question ouvre un bottom sheet dédié (pas un accordéon en
            ligne) avec la réponse en grand, puis "Cela vous a-t-il aidé ?"
            — si non, la question générique n'a pas suffi, on redirige vers
            "Poser une question" (l'établissement peut mieux répondre à un
            cas précis qu'une FAQ générique). */}
        <div style={{ marginTop: "24px" }}>
          {/* Icône dédiée (pas Icons.Info, réutilisée par l'onglet de
              navigation rapide "Info" plus haut) — currentColor pour que
              le noir foncé passé via `color` ci-dessous s'applique
              réellement (retour Bryan 09/08/2026 : "l'icône FAQ en bleu,
              met le noir foncé"). */}
          <SectionTitle icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} label="Questions fréquentes" color={C.text}/>
          <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden" }}>
            {FAQ_FICHE.map((f, i) => (
              <button key={f.q} onClick={() => { setFaqOuverte(i); setFaqFeedback(null); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "transparent", border: "none", borderBottom: i < FAQ_FICHE.length - 1 ? `1px solid ${C.borderSubtle}` : "none", padding: "14px 16px", cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: C.text, fontSize: "13.5px", fontWeight: "700" }}>{f.q}</span>
                <span style={{ color: C.textSubtle, flexShrink: 0 }}><Icons.Chevron /></span>
              </button>
            ))}
          </div>
        </div>

        {/* SATISFACTION PLATEFORME — "Comment on s'en sort ?" : évalue
            Yelen en général, pas cette institution. Citoyens connectés
            uniquement, réapparaît 30 jours après fermeture/réponse.
            Illustration originale (badge dégradé + accents), carte
            différenciée du reste de la fiche (fond dégradé propre) pour
            ne pas se confondre visuellement avec les autres blocs. */}
        {citoyenId && Date.now() > satDismissedUntil && (
          <div style={{ marginTop: "24px", position: "relative", overflow: "hidden", borderRadius: "20px", background: isDark ? "linear-gradient(160deg, rgba(245,166,35,0.10), rgba(96,165,250,0.05))" : "linear-gradient(160deg, rgba(245,166,35,0.08), rgba(96,165,250,0.05))", border: `1px solid ${C.borderCard}`, padding: "20px" }}>
            <button onClick={dismissSatisfaction} className="tap" aria-label="Fermer" style={{ position: "absolute", top: "14px", right: "14px", background: "none", border: "none", padding: "4px", color: C.textSubtle, cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            {satSubmitted ? (
              <div style={{ textAlign: "center", padding: "6px 4px" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><SatIllustration variant="merci"/></div>
                <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: "0 0 4px" }}>Merci pour votre retour</h3>
                <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>Ça nous aide à rendre Yelen un peu meilleur chaque jour.</p>
              </div>
            ) : satStep === 1 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <SatIllustration variant="question"/>
                  <div>
                    <p style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.3px" }}>1 sur 2</p>
                    <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: 0 }}>Comment on s&apos;en sort ?</h3>
                  </div>
                </div>
                <p style={{ color: C.text, fontSize: "13.5px", fontWeight: "700", margin: "0 0 12px", lineHeight: 1.5 }}>Il est facile de trouver et prendre rendez-vous sur Yelen</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { value: "accord_total", label: "Tout à fait d'accord", color: "#16a34a" },
                    { value: "accord", label: "D'accord", color: "#22c55e" },
                    { value: "neutre", label: "Neutre", color: "#94a3b8" },
                    { value: "desaccord", label: "Pas d'accord", color: "#f97316" },
                    { value: "desaccord_total", label: "Pas du tout d'accord", color: "#ef4444" },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => { setSatReponse(opt.value); setSatStep(2); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "11px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.6)", border: `1px solid ${C.borderCard}`, borderRadius: "12px", padding: "11px 14px", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: opt.color, flexShrink: 0 }}/>
                      <span style={{ color: C.text, fontSize: "13px", fontWeight: "600" }}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <SatIllustration variant="question"/>
                  <div>
                    <p style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.3px" }}>2 sur 2</p>
                    <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: 0 }}>Presque fini</h3>
                  </div>
                </div>
                <p style={{ color: C.text, fontSize: "13.5px", fontWeight: "700", margin: "0 0 4px", lineHeight: 1.5 }}>Qu&apos;est-ce qui aurait pu rendre votre expérience meilleure aujourd&apos;hui ?</p>
                <p style={{ color: C.textSubtle, fontSize: "11px", margin: "0 0 10px" }}>(optionnel)</p>
                <textarea
                  value={satCommentaire}
                  onChange={e => setSatCommentaire(e.target.value.slice(0, 300))}
                  placeholder="Dites-nous en quelques mots…"
                  rows={3}
                  style={{ width: "100%", resize: "none", backgroundColor: C.pageBg, border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "10px 12px", color: C.text, fontSize: "13px", fontFamily: "inherit", boxSizing: "border-box" }}
                />
                <p style={{ color: C.textFaint, fontSize: "10px", margin: "4px 0 12px", textAlign: "right" }}>{satCommentaire.length}/300</p>
                <button onClick={handleSubmitSatisfaction} disabled={satSubmitting} className="tap" style={{ width: "100%", backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "12px", padding: "12px", fontSize: "13.5px", fontWeight: "800", cursor: satSubmitting ? "not-allowed" : "pointer", opacity: satSubmitting ? 0.6 : 1 }}>
                  {satSubmitting ? "Envoi…" : "Envoyer"}
                </button>
              </>
            )}
          </div>
        )}

      </div>

      {/* ══════════════════════════════════════════════════════
          AVIS — plein écran dédié façon Booking (bouton X, pas de retour
          de navigation), ouvert par l'ancre "Avis" ou la carte résumé
          ci-dessus. Contenu repris tel quel de l'ancien onglet Avis.
      ══════════════════════════════════════════════════════ */}
      {reviewsOpen && (
        <div ref={reviewsThumb.ref} onScroll={e => { setReviewsScrolled(e.currentTarget.scrollTop > 4); reviewsThumb.onScroll(); }} style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <ScrollThumbBar thumb={reviewsThumb} isDark={isDark}/>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: reviewsScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => { setReviewsOpen(false); setReviewsScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Avis</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Résumé note */}
            <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "18px", display: "flex", alignItems: "center", gap: "20px" }}>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: "40px", fontWeight: "900", color: noteMoyenne >= 4 ? "#22c55e" : noteMoyenne >= 3 ? "#F5A623" : "#ef4444", lineHeight: 1 }}>
                  {noteMoyenne > 0 ? noteMoyenne.toFixed(1) : "—"}
                </div>
                <Stars note={noteMoyenne} size={14} isDark={isDark}/>
                <div style={{ color: C.textSubtle, fontSize: "10px", marginTop: "4px" }}>{nbAvis} avis</div>
              </div>
              <div style={{ flex: 1 }}>
                {[5,4,3,2,1].map(n => {
                  const count = avis.filter(a => Math.round(a.note) === n).length;
                  const pct = avis.length > 0 ? (count / avis.length) * 100 : 0;
                  return (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", width: "8px" }}>{n}</span>
                      <div style={{ flex: 1, height: "6px", borderRadius: "3px", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: n >= 4 ? "#22c55e" : n >= 3 ? "#F5A623" : "#ef4444", borderRadius: "3px", transition: "width 0.5s ease" }}/>
                      </div>
                      <span style={{ color: C.textSubtle, fontSize: "10px", width: "16px", textAlign: "right" }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Info politique */}
            <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: `1px solid ${C.borderCard}`, borderRadius: "12px", padding: "11px 13px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ color: "#3b82f6", flexShrink: 0 }}><Icons.Lock /></span>
              <span style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.55 }}>Seuls les citoyens ayant effectué un rendez-vous peuvent laisser un avis. Les avis vérifiés sont marqués d&apos;un badge.</span>
            </div>

            {/* ✅ Liste des avis — tous affichés */}
            {avis.length > 0 ? (
              avis.map((a, i) => (
                <div key={a.id} style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 15px", animation: `fadeUp 0.2s ease ${i * 0.04}s both` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>
                        {a.nom.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: C.text, fontSize: "13px", fontWeight: "800" }}>{a.nom}</span>
                          {/* Badge vérifié si le citoyen a un RDV confirmé */}
                          {a.rdv_confirmed && (
                            <span style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e", fontSize: "9px", fontWeight: "800", padding: "1px 6px", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                              {Icons.Check()} Vérifié
                            </span>
                          )}
                        </div>
                        <Stars note={a.note} size={11} isDark={isDark}/>
                      </div>
                    </div>
                    <span style={{ color: C.textSubtle, fontSize: "10px", flexShrink: 0 }}>
                      {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}
                    </span>
                  </div>
                  {a.titre && <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", marginBottom: "3px" }}>{a.titre}</div>}
                  {a.commentaire && (
                    <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.65, margin: "0 0 8px", fontStyle: "italic" }}>&quot;{a.commentaire}&quot;</p>
                  )}

                  {a.reponse_institution && (
                    <div style={{ background: "#F5A623", borderRadius: "10px", padding: "8px 10px", marginBottom: "8px" }}>
                      <div style={{ color: "#080812", fontSize: "10.5px", fontWeight: "800", marginBottom: "3px" }}>
                        {inst.name}{a.reponse_le ? ` · ${new Date(a.reponse_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}` : ""}
                      </div>
                      <div style={{ color: "#080812", fontSize: "12px", lineHeight: 1.5 }}>{a.reponse_institution}</div>
                    </div>
                  )}

                  {a.citoyen_id !== citoyenId && (
                    <button onClick={() => handleToggleUtile(a)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: mesUtile.has(a.id) ? "rgba(34,197,94,0.1)" : "transparent", border: `1px solid ${mesUtile.has(a.id) ? "rgba(34,197,94,0.3)" : C.borderCard}`, borderRadius: "20px", padding: "5px 12px", cursor: "pointer" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill={mesUtile.has(a.id) ? "#22c55e" : "none"} stroke={mesUtile.has(a.id) ? "#22c55e" : C.textSubtle} strokeWidth="2" strokeLinecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                      <span style={{ color: mesUtile.has(a.id) ? "#22c55e" : C.textSubtle, fontSize: "11px", fontWeight: "700" }}>Utile{a.utile_count > 0 ? ` (${a.utile_count})` : ""}</span>
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}>{Icons.Star(false)}</div>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Aucun avis pour le moment</p>
                <p style={{ color: C.textSubtle, fontSize: "12px", margin: "0 0 16px" }}>Prenez rendez-vous pour être le premier à laisser un avis.</p>
                <Link href={`/rdv/${inst.id}`} onClick={() => trackerCtaClic("rdv")} style={{ display: "inline-block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "13px", padding: "10px 20px", borderRadius: "12px", textDecoration: "none" }}>Prendre rendez-vous</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          COMMENTAIRES ANNONCE — plein écran (même logique que l'overlay
          Avis ci-dessus) : avant, les commentaires s'ouvraient en panneau
          inline dans la carte, ce qui grandissait la carte au milieu de la
          rangée horizontale d'annonces et cachait le reste de la fiche.
      ══════════════════════════════════════════════════════ */}
      {commentsOpenId && (() => {
        const a = annonces.find(x => x.id === commentsOpenId);
        if (!a) return null;
        const liste = commentaires[a.id] ?? [];
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, display: "flex", flexDirection: "column" }}>
            <ScrollThumbBar thumb={commentsThumb} isDark={isDark}/>
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: commentsScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0", flexShrink: 0 }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                <button onClick={() => { setCommentsOpenId(null); setCommentsScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>{a.titre}</div>
                <div/>
              </div>
            </header>

            <div ref={commentsThumb.ref} onScroll={e => { setCommentsScrolled(e.currentTarget.scrollTop > 4); commentsThumb.onScroll(); }} style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {liste.length === 0 ? (
                <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                  <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}><Icons.Comment/></div>
                  <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Aucun commentaire pour l&apos;instant</p>
                  <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Soyez le premier à réagir à cette annonce.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {liste.map(c => (
                    <div key={c.id} style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ color: C.text, fontSize: "12.5px", fontWeight: "700" }}>{c.citoyen_id === citoyenId ? "Vous" : (c.citoyen_nom || "Citoyen")}</span>
                        <span style={{ color: C.textFaint, fontSize: "10px", flexShrink: 0 }}>{new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                      </div>
                      <p style={{ color: C.textMuted, fontSize: "12.5px", margin: "4px 0 0", lineHeight: 1.55 }}>{c.contenu}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ position: "sticky", bottom: 0, flexShrink: 0, background: C.pageBg, borderTop: `1px solid ${C.borderCard}`, padding: `10px 16px calc(10px + env(safe-area-inset-bottom))`, display: "flex", gap: "8px" }}>
              <input
                value={nouveauCommentaire[a.id] ?? ""}
                onChange={e => setNouveauCommentaire(prev => ({ ...prev, [a.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleSubmitComment(a.id); }}
                placeholder={citoyenId ? "Ajouter un commentaire…" : "Connectez-vous pour commenter"}
                style={{ flex: 1, backgroundColor: inputBg, border: `1px solid ${inputBord}`, borderRadius: "12px", padding: "10px 14px", color: C.text, fontSize: "13px", fontFamily: "inherit" }}
              />
              <button
                onClick={() => handleSubmitComment(a.id)}
                disabled={envoiCommentaire === a.id || !(nouveauCommentaire[a.id] ?? "").trim()}
                className="tap"
                style={{ backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "12px", padding: "10px 18px", fontSize: "13px", fontWeight: "700", cursor: "pointer", opacity: envoiCommentaire === a.id ? 0.6 : 1, flexShrink: 0 }}
              >
                Envoyer
              </button>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          DÉTAIL ANNONCES — plein écran (même logique que Avis/Commentaires
          ci-dessus) : ouvert par "Voir plus" ou un clic sur une carte,
          montre TOUTES les annonces en entier (média complet, contenu
          intégral, expiration, lien PDF), pas seulement celle cliquée —
          on scrolle automatiquement jusqu'à celle-ci à l'ouverture.
      ══════════════════════════════════════════════════════ */}
      {detailOpenId && (
        <div ref={detailThumb.ref} onScroll={e => { setDetailScrolled(e.currentTarget.scrollTop > 4); detailThumb.onScroll(); }} style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <ScrollThumbBar thumb={detailThumb} isDark={isDark}/>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: detailScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => { setDetailOpenId(null); setDetailScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Annonces officielles</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {annonces.map(a => {
              const t = ANNONCE_TYPES[a.type] || ANNONCE_TYPES.information;
              const images = a.format === "carrousel" && a.media_urls?.length ? a.media_urls : a.image_url ? [a.image_url] : [];
              return (
                <div key={a.id} ref={el => { if (a.id === detailOpenId) selectedDetailRef.current = el; }} style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden", border: `1px solid ${t.border}`, borderLeft: `3px solid ${t.color}`, outline: a.id === detailOpenId ? `2px solid ${t.color}55` : "none" }}>
                  {images.length > 0 ? (
                    <AnnonceImageCarousel images={images} height={220} dotActiveColor="#F5A623"/>
                  ) : a.format === "video" && a.media_urls?.[0] ? (
                    <div style={{ width: "100%", height: "220px", overflow: "hidden", backgroundColor: "#000" }}>
                      <video src={a.media_urls[0]} style={{ width: "100%", height: "100%", objectFit: "cover" }} controls playsInline/>
                    </div>
                  ) : null}
                  <div style={{ padding: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                      <span style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color, fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{t.label.toUpperCase()}</span>
                      {a.epingle && <span style={{ background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", color: "#F5A623", fontSize: "10px", fontWeight: "700", padding: "2px 7px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}><Icons.Pin2 /> Épinglé</span>}
                      <span style={{ color: C.textSubtle, fontSize: "10px", marginLeft: "auto" }}>{new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    <h3 style={{ color: C.text, fontSize: "16px", fontWeight: "800", margin: "0 0 10px", lineHeight: 1.35 }}>{a.titre}</h3>
                    <p style={{ color: C.textMuted, fontSize: "13px", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{a.contenu}</p>
                    {a.date_expiration && (
                      <p style={{ color: C.textSubtle, fontSize: "11px", margin: "12px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Icons.Clock /> Expire le {new Date(a.date_expiration).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                    {a.format === "pdf" && a.media_urls?.[0] && (
                      <a href={a.media_urls[0]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#ef4444", fontSize: "12px", fontWeight: "700", textDecoration: "none", marginTop: "12px" }}>
                        <Icons.Note /> Ouvrir le PDF
                      </a>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px", paddingTop: "14px", borderTop: `1px solid ${C.borderCard}` }}>
                      <button onClick={() => handleToggleLike(a.id)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: mesLikes.has(a.id) ? "rgba(239,68,68,0.1)" : "transparent", border: `1px solid ${mesLikes.has(a.id) ? "rgba(239,68,68,0.3)" : C.borderCard}`, borderRadius: "20px", padding: "6px 14px", cursor: "pointer" }}>
                        {Icons.Heart(mesLikes.has(a.id))}
                        <span style={{ color: mesLikes.has(a.id) ? "#ef4444" : C.textSubtle, fontSize: "12px", fontWeight: "700" }}>{likesCount[a.id] ?? 0}</span>
                      </button>
                      <button onClick={() => { setDetailOpenId(null); setCommentsOpenId(a.id); }} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "transparent", border: `1px solid ${C.borderCard}`, borderRadius: "20px", padding: "6px 14px", cursor: "pointer", color: C.textSubtle }}>
                        <Icons.Comment/>
                        <span style={{ fontSize: "12px", fontWeight: "700" }}>{(commentaires[a.id] ?? []).length}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          PRIX & FRAIS — sheet façon DoorDash "Pricing and Fees" (retour
          Bryan 26/09/2026), déclenché par le lien ajouté près du CTA de
          réservation ci-dessus. Contenu volontairement non légal (aucune
          mention de loi/juridiction, contrairement à la référence
          DoorDash) : texte humain qui explique le fonctionnement réel du
          paiement Yelen, cohérent avec les sheets "Frais Yelen"/"Frais &
          taxes" du récapitulatif de réservation (app/rdv/[id]/page.tsx).
          Contenu légèrement différent hôtel / autres catégories : un hôtel
          n'a que des chambres payantes, alors que les autres secteurs
          mélangent RDV gratuits et payants sur la même fiche (retour Bryan
          26/09/2026, précision demandée après un premier jet trop générique)
          — d'où le 1er point dédié à cette coexistence pour les non-hôtels.
          Même patron de sheet que "À propos"/FAQ ci-dessous.
      ══════════════════════════════════════════════════════ */}
      {prixFraisSheetOpen && (() => {
        const bullets: { icon: React.ReactNode; titre: string; texte: React.ReactNode }[] = [
          ...(!isHotel ? [{
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
            titre: "Gratuit ou payant selon le service",
            texte: <>Chez {inst.name}, certains rendez-vous sont gratuits et d&apos;autres payants selon le service choisi. Quand un service a un prix, il est toujours affiché avant que vous ne réserviez — jamais de surprise au moment de confirmer.</>,
          }] : []),
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
            titre: "Le prix affiché est le prix final",
            texte: isHotel
              ? <>C&apos;est le prix fixé par l&apos;établissement lui-même — jamais une estimation, jamais un prix ajusté par un algorithme Yelen. Si une taxe s&apos;applique, elle est déjà incluse : rien à ajouter de votre côté.</>
              : <>Pour un service payant, le prix indiqué est celui fixé par l&apos;établissement lui-même — jamais une estimation, jamais un prix ajusté par un algorithme Yelen. Si une taxe s&apos;applique, elle est déjà incluse : rien à ajouter de votre côté.</>,
          },
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>,
            titre: "Aucun frais Yelen à ce jour",
            texte: <>Yelen ne facture aucune commission ni frais de service sur les réservations. Ce que vous voyez sur la fiche est ce que vous payez.</>,
          },
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
            titre: "Paiement directement sur place",
            texte: isHotel
              ? <>Le règlement se fait auprès de l&apos;établissement, jamais via Yelen. Yelen ne collecte et ne conserve aucun moyen de paiement.</>
              : <>Pour les services payants, le règlement se fait auprès de l&apos;établissement, jamais via Yelen. Yelen ne collecte et ne conserve aucun moyen de paiement.</>,
          },
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6M9 16h6M9 8h6M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>,
            titre: "Un récapitulatif avant chaque confirmation",
            texte: isHotel
              ? <>Avant de confirmer une réservation, Yelen affiche toujours le détail complet — prix, frais Yelen, frais &amp; taxes, puis le total — pour que vous validiez chaque montant en connaissance de cause.</>
              : <>Avant de confirmer un rendez-vous payant, Yelen affiche toujours le détail complet — prix, frais Yelen, frais &amp; taxes, puis le total — pour que vous validiez chaque montant en connaissance de cause. Pour un rendez-vous gratuit, aucun montant n&apos;est demandé.</>,
          },
        ];
        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div onClick={() => setPrixFraisSheetOpen(false)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }}/>
          <div style={{ position: "relative", width: "100%", maxHeight: "80svh", backgroundColor: C.pageBg, borderRadius: "20px 20px 0 0", overflow: "hidden", animation: "faqSheetUp 0.22s ease" }}>
            <div ref={prixFraisScroll.ref} onScroll={prixFraisScroll.onScroll} style={{ maxHeight: "80svh", overflowY: "auto", padding: "10px 20px calc(20px + env(safe-area-inset-bottom))" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: C.borderCard, margin: "0 auto 18px" }}/>
              <h2 style={{ color: C.text, fontSize: "19px", fontWeight: "900", lineHeight: 1.3, margin: "0 0 6px" }}>Prix &amp; frais</h2>
              <p style={{ color: C.textSubtle, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 18px" }}>Comment fonctionne le paiement sur Yelen.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "22px" }}>
                {bullets.map(b => (
                  <div key={b.titre} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span style={{ display: "flex", flexShrink: 0, marginTop: "1px", color: C.text }}>{b.icon}</span>
                    <div>
                      <div style={{ color: C.text, fontSize: "13.5px", fontWeight: "800", marginBottom: "3px" }}>{b.titre}</div>
                      <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.65, margin: 0 }}>{b.texte}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setPrixFraisSheetOpen(false)} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "26px", border: "none", background: "#F5A623", color: "#080812", fontSize: "14px", fontWeight: "800", cursor: "pointer" }}>
                Compris
              </button>
            </div>
            {/* Indicateur de scroll — scrollbar native masquée globalement
                (globals.css), sinon rien ne signale que ce sheet défile. */}
            <div aria-hidden style={{ position: "absolute", top: "18px", bottom: "18px", right: "4px", width: "3px", pointerEvents: "none", opacity: prixFraisScroll.shown ? 1 : 0, transition: "opacity 0.4s ease" }}>
              <div style={{ position: "absolute", top: `${prixFraisScroll.pct * (1 - prixFraisScroll.thumbH) * 100}%`, height: `${prixFraisScroll.thumbH * 100}%`, width: "100%", borderRadius: "3px", background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)" }}/>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          GARANTIE — sheet façon DoorDash/Target "guarantee" (retour Bryan
          26/09/2026), déclenché par le lien ajouté à gauche de "Prix &
          frais" ci-dessus. Deux volets honnêtes plutôt qu'une promesse
          générique : ce que Yelen garantit RÉELLEMENT (basé sur le badge
          badge_verifie déjà réel — contrôle des documents officiels par un
          admin Yelen, voir section CERTIFICATION plus bas — le code de
          validation généré à la confirmation, et la protection des
          données), puis ce que Yelen ne garantit pas (qualité du service
          sur place, paiement/remboursement quand un service payant existe,
          respect des horaires) — jamais une promesse que le produit ne
          peut pas tenir (voir CLAUDE.md /protocole "zéro fausse promesse").
      ══════════════════════════════════════════════════════ */}
      {garantieSheetOpen && (() => {
        const garantitBullets: { icon: React.ReactNode; titre: string; texte: React.ReactNode }[] = [
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
            titre: "Un établissement examiné avant publication",
            texte: inst.badge_verifie
              ? <>Cet établissement porte le badge « Vérifié par Yelen » : son identité et ses documents officiels ont été contrôlés par notre équipe avant sa mise en ligne.</>
              : <>Chaque établissement présent sur Yelen — dont celui-ci — passe par une validation de notre équipe avant sa mise en ligne. Certains portent en plus le badge « Vérifié par Yelen », accordé après un contrôle renforcé de leur identité et de leurs documents officiels.</>,
          },
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
            titre: "Une réservation tracée",
            texte: <>Chaque réservation confirmée génère un code de validation Yelen unique, à présenter à votre arrivée — la preuve que votre rendez-vous existe bien dans notre système.</>,
          },
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
            titre: "Vos données protégées",
            texte: <>Vos informations personnelles ne sont transmises à l&apos;établissement que dans le cadre strict de votre réservation — jamais revendues ni partagées à un autre usage.</>,
          },
        ];
        const neGarantitPasBullets: { icon: React.ReactNode; titre: string; texte: React.ReactNode }[] = [
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
            titre: "La qualité du service sur place",
            texte: <>Yelen valide l&apos;établissement, pas chaque prestation prise individuellement : la qualité, la disponibilité réelle et le déroulement du service une fois sur place restent sous la responsabilité de l&apos;établissement.</>,
          },
          ...(paidServicesActifs > 0 ? [{
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
            titre: "Le paiement et les remboursements",
            texte: <>Le règlement d&apos;un service payant se fait directement avec l&apos;établissement : Yelen ne traite aucun paiement et ne peut donc pas garantir de remboursement en cas de litige.</>,
          }] : []),
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>,
            titre: "Le respect des horaires annoncés",
            texte: <>Les horaires et informations affichés proviennent de l&apos;établissement lui-même — Yelen ne peut garantir qu&apos;ils sont appliqués à la lettre à tout moment.</>,
          },
        ];
        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div onClick={() => setGarantieSheetOpen(false)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }}/>
          <div style={{ position: "relative", width: "100%", maxHeight: "80svh", backgroundColor: C.pageBg, borderRadius: "20px 20px 0 0", overflow: "hidden", animation: "faqSheetUp 0.22s ease" }}>
            <div ref={garantieScroll.ref} onScroll={garantieScroll.onScroll} style={{ maxHeight: "80svh", overflowY: "auto", padding: "10px 20px calc(20px + env(safe-area-inset-bottom))" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: C.borderCard, margin: "0 auto 18px" }}/>
              <h2 style={{ color: C.text, fontSize: "19px", fontWeight: "900", lineHeight: 1.3, margin: "0 0 6px" }}>Garantie</h2>
              <p style={{ color: C.textSubtle, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 18px" }}>Ce que Yelen vérifie réellement — et ce qui reste entre vous et l&apos;établissement.</p>

              <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 12px" }}>Ce que Yelen garantit</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "22px" }}>
                {garantitBullets.map(b => (
                  <div key={b.titre} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span style={{ display: "flex", flexShrink: 0, marginTop: "1px", color: "#22c55e" }}>{b.icon}</span>
                    <div>
                      <div style={{ color: C.text, fontSize: "13.5px", fontWeight: "800", marginBottom: "3px" }}>{b.titre}</div>
                      <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.65, margin: 0 }}>{b.texte}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 12px", paddingTop: "4px", borderTop: `1px solid ${C.borderSubtle}` }}>Ce que Yelen ne garantit pas</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "22px", marginTop: "16px" }}>
                {neGarantitPasBullets.map(b => (
                  <div key={b.titre} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span style={{ display: "flex", flexShrink: 0, marginTop: "1px", color: C.textSubtle }}>{b.icon}</span>
                    <div>
                      <div style={{ color: C.text, fontSize: "13.5px", fontWeight: "800", marginBottom: "3px" }}>{b.titre}</div>
                      <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.65, margin: 0 }}>{b.texte}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setGarantieSheetOpen(false)} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "26px", border: "none", background: "#F5A623", color: "#080812", fontSize: "14px", fontWeight: "800", cursor: "pointer" }}>
                Compris
              </button>
            </div>
            {/* Indicateur de scroll — même barre que le sheet "Prix & frais"
                ci-dessus (scrollbar native masquée globalement). */}
            <div aria-hidden style={{ position: "absolute", top: "18px", bottom: "18px", right: "4px", width: "3px", pointerEvents: "none", opacity: garantieScroll.shown ? 1 : 0, transition: "opacity 0.4s ease" }}>
              <div style={{ position: "absolute", top: `${garantieScroll.pct * (1 - garantieScroll.thumbH) * 100}%`, height: `${garantieScroll.thumbH * 100}%`, width: "100%", borderRadius: "3px", background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)" }}/>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          À PROPOS — sheet plein texte (retour Bryan 25/09/2026, toutes
          catégories) : même patron bottom sheet que la FAQ ci-dessous.
      ══════════════════════════════════════════════════════ */}
      {descriptionSheetOpen && inst.description && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div onClick={() => setDescriptionSheetOpen(false)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }}/>
          <div style={{ position: "relative", width: "100%", maxHeight: "80svh", overflowY: "auto", backgroundColor: C.pageBg, borderRadius: "20px 20px 0 0", padding: "10px 20px calc(20px + env(safe-area-inset-bottom))", animation: "faqSheetUp 0.22s ease" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: C.borderCard, margin: "0 auto 18px" }}/>
            <h2 style={{ color: C.text, fontSize: "19px", fontWeight: "900", lineHeight: 1.3, margin: "0 0 14px" }}>À propos de {inst.name}</h2>
            <p style={{ color: C.textMuted, fontSize: "13.5px", lineHeight: 1.75, margin: "0 0 20px", whiteSpace: "pre-line" }}>{inst.description}</p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          FAQ — bottom sheet façon Booking (retour Bryan 09/08/2026) :
          question en grand, réponse, puis "Cela vous a-t-il aidé ?".
          Réponse "Non" → CTA directe vers "Poser une question"
          (ouvrirPoserQuestion ferme ce sheet et ouvre l'autre).
      ══════════════════════════════════════════════════════ */}
      {faqOuverte !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div onClick={() => setFaqOuverte(null)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }}/>
          <div style={{ position: "relative", width: "100%", maxHeight: "80svh", overflowY: "auto", backgroundColor: C.pageBg, borderRadius: "20px 20px 0 0", padding: "10px 20px calc(20px + env(safe-area-inset-bottom))", animation: "faqSheetUp 0.22s ease" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: C.borderCard, margin: "0 auto 18px" }}/>
            <h2 style={{ color: C.text, fontSize: "19px", fontWeight: "900", lineHeight: 1.3, margin: "0 0 14px" }}>{FAQ_FICHE[faqOuverte].q}</h2>
            <p style={{ color: C.textMuted, fontSize: "13.5px", lineHeight: 1.7, margin: "0 0 20px" }}>{FAQ_FICHE[faqOuverte].r}</p>
            <div style={{ borderTop: `1px solid ${C.borderSubtle}`, paddingTop: "16px", marginBottom: "20px" }}>
              {faqFeedback === null ? (
                <>
                  <p style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "700", margin: "0 0 10px" }}>Cela vous a-t-il aidé ?</p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setFaqFeedback("oui")} className="tap" style={{ flex: 1, padding: "11px", borderRadius: "12px", border: `1px solid ${C.borderCard}`, background: "transparent", color: C.text, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Oui</button>
                    <button onClick={() => setFaqFeedback("non")} className="tap" style={{ flex: 1, padding: "11px", borderRadius: "12px", border: `1px solid ${C.borderCard}`, background: "transparent", color: C.text, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Non</button>
                  </div>
                </>
              ) : faqFeedback === "oui" ? (
                <p style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700", margin: 0 }}>Merci pour votre retour !</p>
              ) : (
                <div>
                  <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 12px" }}>
                    Désolé que cette réponse générique n&apos;ait pas suffi — l&apos;établissement pourra mieux répondre à votre situation précise.
                  </p>
                  <button onClick={() => { setFaqOuverte(null); ouvrirPoserQuestion(); }} className="tap" style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "13px", fontWeight: "800", cursor: "pointer", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
                    Poser une question à l&apos;établissement
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setFaqOuverte(null)} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "12px", border: `1px solid ${C.borderCard}`, background: "transparent", color: C.text, fontSize: "13.5px", fontWeight: "800", cursor: "pointer" }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          POSER UNE QUESTION — plein écran, façon Booking "Ask a
          question". Limite 2 questions/citoyen/établissement affichée
          avant envoi (le vrai garde-fou est le trigger serveur sur
          questions_institution).
      ══════════════════════════════════════════════════════ */}
      {askOpen && (
        <div ref={askThumb.ref} onScroll={e => { setAskScrolled(e.currentTarget.scrollTop > 4); askThumb.onScroll(); }} style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <ScrollThumbBar thumb={askThumb} isDark={isDark}/>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: askScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => { setAskOpen(false); setAskScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Poser une question</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 16px" }}>
            {mesQuestions.length >= 2 ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "22px", textAlign: "center" }}>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 8px" }}>Vous avez déjà posé 2 questions à cet établissement</p>
                <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 18px" }}>Prenez rendez-vous pour continuer à échanger directement avec l&apos;établissement.</p>
                <Link href={`/rdv/${inst?.id}`} onClick={() => trackerCtaClic("rdv")} style={{ display: "inline-block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "13px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>Prendre rendez-vous</Link>
              </div>
            ) : (
              <>
                <p style={{ color: C.textSubtle, fontSize: "11.5px", margin: "0 0 6px" }}>Votre question</p>
                <textarea
                  value={askQuestion}
                  onChange={e => setAskQuestion(e.target.value.slice(0, 150))}
                  placeholder='Par exemple, "Bonjour, avez-vous des places de parking ?"'
                  rows={4}
                  style={{ width: "100%", resize: "none", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "12px", padding: "12px 14px", color: C.text, fontSize: "13.5px", fontFamily: "inherit", boxSizing: "border-box" }}
                />
                <p style={{ color: C.textFaint, fontSize: "10.5px", margin: "4px 0 16px", textAlign: "right" }}>{askQuestion.length}/150</p>
                <p style={{ color: C.textSubtle, fontSize: "11.5px", lineHeight: 1.6, margin: "0 0 20px" }}>
                  Votre question sera publiée sur la fiche une fois répondue par l&apos;établissement. N&apos;incluez pas d&apos;informations personnelles (nom, téléphone, etc.).
                </p>
                <button onClick={handleSubmitQuestion} disabled={askSubmitting || !askQuestion.trim()} className="tap" style={{ width: "100%", backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: "800", cursor: askSubmitting ? "not-allowed" : "pointer", opacity: askSubmitting || !askQuestion.trim() ? 0.6 : 1 }}>
                  {askSubmitting ? "Envoi…" : "Envoyer la question"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TOUTES LES QUESTIONS — plein écran, refonte façon Booking
          "Travelers are asking" (retour Bryan 09/08/2026) : TOUTES les
          questions y compris la/les propre(s) question(s) en attente du
          citoyen connecté (avant, seules les questions déjà répondues y
          apparaissaient) — bouton "Poser une question" fixé en bas,
          toujours accessible sans scroller.
      ══════════════════════════════════════════════════════ */}
      {questionsListOpen && (
        <div ref={questionsListThumb.ref} onScroll={e => { setQuestionsListScrolled(e.currentTarget.scrollTop > 4); questionsListThumb.onScroll(); }} style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <ScrollThumbBar thumb={questionsListThumb} isDark={isDark} bottom="calc(env(safe-area-inset-bottom) + 76px)"/>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: questionsListScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => { setQuestionsListOpen(false); setQuestionsListScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Questions des citoyens</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 16px 100px" }}>
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", letterSpacing: "-0.3px", margin: "0 0 18px" }}>Les citoyens posent des questions</h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {mesQuestions.filter(q => !q.reponse).map((q, i, arr) => {
                const dernierGlobal = i === arr.length - 1 && questionsRepondues.length === 0;
                return (
                <div key={q.id} style={{ paddingBottom: "18px", marginBottom: dernierGlobal ? 0 : "18px", borderBottom: dernierGlobal ? "none" : `1px solid ${C.borderSubtle}` }}>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: C.borderCard, display: "flex", alignItems: "center", justifyContent: "center", color: C.text }}><Icons.Comment/></div>
                    <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", lineHeight: 1.5, margin: 0 }}>{q.question}</p>
                  </div>
                  <div style={{ backgroundColor: C.cardBg, borderRadius: "12px", padding: "10px 13px" }}>
                    <span style={{ color: C.textSubtle, fontSize: "11.5px", fontWeight: "700" }}>Votre question · en attente de réponse de l&apos;établissement</span>
                  </div>
                </div>
                );
              })}
              {questionsRepondues.map((q, i) => (
                <div key={q.id} style={{ paddingBottom: "18px", marginBottom: i < questionsRepondues.length - 1 ? "18px" : 0, borderBottom: i < questionsRepondues.length - 1 ? `1px solid ${C.borderSubtle}` : "none" }}>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: C.borderCard, display: "flex", alignItems: "center", justifyContent: "center", color: C.text }}><Icons.Comment/></div>
                    <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", lineHeight: 1.5, margin: 0 }}>{q.question}</p>
                  </div>
                  <div style={{ backgroundColor: C.cardBg, borderRadius: "12px", padding: "12px 14px" }}>
                    <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "700", marginBottom: "4px" }}>
                      Réponse de l&apos;établissement{q.reponse_le ? ` · ${new Date(q.reponse_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
                    </div>
                    <p style={{ color: C.textMuted, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>{q.reponse}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: C.pageBg, borderTop: `1px solid ${C.borderCard}` }}>
            <button onClick={ouvrirPoserQuestion} className="tap" style={{ width: "100%", backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: "800", cursor: "pointer" }}>
              Poser une question
            </button>
          </div>
        </div>
      )}

      {/* PLUS D'INFORMATIONS — façon Booking (Property Policies/Important
          details/Legal information), remplace l'ancien footer de la fiche
          (déplacé dans app/page.tsx, onglet Accueil). */}
      <div style={{ margin: "24px 16px 0" }}>
        <SectionTitle icon={<Icons.Note />} label="Plus d'informations" color="#a855f7"/>
        <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden" }}>
          {[
            { key: "conditions" as const, label: "Conditions de l'entreprise" },
            // Relabellée "Règles du séjour" en mode Hôtel (chantier
            // "Équipements structurés", 21/08/2026) — même donnée
            // (informations_importantes), mais réduite aux règles que la
            // checklist "Équipements" (section dédiée plus haut) ne peut
            // pas représenter : horaires de check-in/check-out,
            // restrictions. Ancien libellé "Équipements & règles"
            // (Phase 2, 19/08/2026) devenu trompeur depuis que les
            // équipements ont leur propre section structurée.
            { key: "importantes" as const, label: isHotel ? "Règles du séjour" : "Informations importantes" },
            { key: "legales" as const, label: "Informations légales" },
          ].map((s, i, arr) => (
            <button key={s.key} onClick={() => { setInfoOpen(s.key); setInfoScrolled(false); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "none", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${C.borderCard}` : "none", padding: "15px 16px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ color: C.text, fontSize: "13.5px", fontWeight: "700" }}>{s.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          ))}
        </div>
      </div>

      {/* POPUP CALENDRIER SÉJOUR — bandeau hero hôtel, remplace
          Découvrir/WhatsApp (retour Bryan 25/09/2026). Juste le calendrier :
          arrivée puis départ, "Continuer" redirige vers /rdv/{id} avec les
          dates en query params — le wizard (dispoChambres) prend le relais,
          aucune logique de disponibilité dupliquée ici. */}
      {sejourModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <div style={{ padding: "calc(env(safe-area-inset-top) + 16px) 16px 0" }}>
            {/* Flèche retour nue, façon DoorDash — pas de bouton encadré :
                étape "arrivee" = ferme le popup, étape "depart" = revient à
                "arrivee" (remplace l'ancien lien "Modifier", même action,
                un seul bouton). Retour Bryan 25/09/2026. */}
            <button onClick={() => sejourStep === "depart" ? setSejourStep("arrivee") : setSejourModalOpen(false)} className="tap" aria-label={sejourStep === "depart" ? "Modifier la date d'arrivée" : "Fermer"} style={{ background: "none", border: "none", padding: 0, marginBottom: "20px", display: "flex", color: C.text, cursor: "pointer" }}>
              <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <h1 style={{ color: C.text, fontSize: "28px", fontWeight: "900", margin: "0 0 8px", letterSpacing: "-0.6px" }}>{sejourStep === "arrivee" ? "Date d'arrivée" : "Date de départ"}</h1>
          </div>

          <div style={{ padding: "0 16px 40px" }}>
            {sejourStep === "arrivee" ? (
              <>
                <p style={{ color: C.textSubtle, fontSize: "13.5px", margin: "0 0 20px" }}>Sélectionnez votre date d&apos;arrivée pour <strong style={{ color: C.text }}>{inst.name}</strong>.</p>
                <SejourCalendar
                  calendarMonth={sejourCalendarMonth}
                  onMonthChange={(dir) => setSejourCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + dir); return d; })}
                  minDate={(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })()}
                  selected={sejourArrivee}
                  onSelect={(iso) => { setSejourArrivee(iso); setSejourDepart(null); setSejourStep("depart"); }}
                  C={C}
                />
              </>
            ) : (
              <>
                <p style={{ color: C.textSubtle, fontSize: "13.5px", margin: "0 0 20px", textTransform: "capitalize" }}>Arrivée le {sejourArrivee && new Date(`${sejourArrivee}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.</p>
                <SejourCalendar
                  calendarMonth={sejourCalendarMonth}
                  onMonthChange={(dir) => setSejourCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + dir); return d; })}
                  minDate={(() => { const d = new Date(`${sejourArrivee}T00:00:00`); d.setDate(d.getDate() + 1); return d; })()}
                  selected={sejourDepart}
                  onSelect={(iso) => setSejourDepart(iso)}
                  C={C}
                />

                {sejourDepart && (
                  <div style={{ marginTop: "24px" }}>
                    <p style={{ color: C.text, fontSize: "14.5px", fontWeight: "700", lineHeight: 1.6, margin: "0 0 18px" }}>
                      Trouvons maintenant des chambres de qualité pour votre séjour du {new Date(`${sejourArrivee}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au {new Date(`${sejourDepart}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}.
                    </p>
                    <button
                      onClick={() => router.push(`/rdv/${inst.id}?date_arrivee=${sejourArrivee}&date_depart=${sejourDepart}`)}
                      className="tap"
                      style={{ width: "100%", padding: "16px", borderRadius: "26px", border: "none", background: "#F5A623", color: "#080812", fontSize: "15px", fontWeight: "800", cursor: "pointer" }}
                    >
                      Continuer
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CHAMBRE — Vue 2 (chantier Services Hôtel V2, galerie, 20/08/2026).
          Même patron plein écran que Avis/Plus d'informations ci-dessus.
          Galerie en tête (aperçu, tap = Vue 3), puis nom/prix/description,
          CTA fixe en bas vers l'assistant RDV existant — Yelen ne
          construit jamais son propre moteur de réservation par date (voir
          docs/ui/YELEN_HOTEL_MODEL_AUDIT.md Partie 7, toujours valable).
      ══════════════════════════════════════════════════════ */}
      {chambreOuverte && (() => {
        const c = chambreOuverte;
        const apercu = [...c.photos.slice(0, 4), ...(c.video_url ? [c.video_url] : [])];
        const literieLabels = EQUIPEMENTS_CHAMBRE.find(cat => cat.id === "literie")?.items.filter(i => c.equipements_chambre?.includes(i.code)).map(i => i.label) ?? [];
        const equipementsAffiches = EQUIPEMENTS_CHAMBRE.filter(cat => cat.id !== "literie").flatMap(cat => cat.items).filter(i => c.equipements_chambre?.includes(i.code));
        const autresChambres = chambresHotel.filter(x => x.id !== c.id);
        const sectionTitleStyle: React.CSSProperties = { color: C.text, fontSize: "15px", fontWeight: 800, margin: "0 0 12px" };
        const microLabelStyle: React.CSSProperties = { color: C.textSubtle, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" };
        // Bloc "Tarif" (refonte "Détails", 25/09/2026) — label + valeur +
        // unité, jamais juste un chiffre nu (retour Bryan : "le prix doit
        // être présenté dans un bloc clairement séparé").
        // Refonte "façon Booking" (retour Bryan 25/09/2026) : structure
        // épurée reprise (label discret → prix en avant → ligne
        // d'information secondaire sous un séparateur), mais SANS les
        // badges de réduction/annulation de la référence Booking — aucune
        // de ces données n'existe dans paid_services (pas de prix barré,
        // pas de politique d'annulation en base, voir CLAUDE.md
        // /zero-donnee-inventee). La ligne d'info reprend nombre_unites
        // (donnée réelle) formulée sans jamais impliquer une disponibilité
        // en temps réel (aucun moteur de réservation par dates n'existe,
        // voir /schema paid_services.nombre_unites).
        // Infos complémentaires (nombre de chambres du type + annulation) —
        // extraites de prixNode pour être réutilisées seules, sans le prix
        // (retour Bryan 26/09/2026 : "retire le prix de cette carte, mets-le
        // à la même ligne que le nom de la chambre à droite" — le prix
        // rejoint le titre, cette carte ne garde que l'information
        // secondaire, toujours sans "annulation gratuite" invoquée nulle
        // part en base, voir commentaire d'origine ci-dessous conservé).
        const infosComplementaires = (
          <>
            {c.nombre_unites != null && (
              <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <span style={{ display: "flex", color: C.textSubtle }}>{Icons.Bed(C.textSubtle)}</span>
                <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: 600 }}>
                  {c.nombre_unites} chambre{c.nombre_unites > 1 ? "s" : ""} de ce type dans l&apos;établissement
                </span>
              </div>
            )}
            {/* Annulation — pas de politique réelle en base (aucun champ,
                aucune logique de remboursement citoyen), donc jamais
                "gratuite"/garantie (retour Bryan 25/09/2026, arbitrage
                explicite après audit) : formulation prudente qui renvoie
                vers l'établissement plutôt qu'une promesse Yelen. */}
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ display: "flex", color: C.textSubtle }}>{Icons.Info()}</span>
              <span style={{ color: C.textSubtle, fontSize: "11.5px", fontWeight: 600 }}>
                Conditions d&apos;annulation à demander auprès de l&apos;établissement
              </span>
            </div>
          </>
        );
        const prixNode = (compact: boolean) => (
          <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "18px", padding: compact ? "16px 18px" : "18px 20px" }}>
            <div style={{ ...microLabelStyle, marginBottom: "8px" }}>Tarif</div>
            <div style={{ color: "#F5A623", fontSize: compact ? "22px" : "28px", fontWeight: 900, lineHeight: 1.15 }}>{c.prix.toLocaleString("fr-FR")} GNF</div>
            {c.unite_prix && <div style={{ color: C.textSubtle, fontSize: "12.5px", fontWeight: 600, marginTop: "3px" }}>{c.unite_prix}</div>}
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.borderCard}`, display: "flex", flexDirection: "column", gap: "10px" }}>
              {infosComplementaires}
            </div>
          </div>
        );
        // Key Facts (refonte "Détails", 25/09/2026) — 3 blocs visuels
        // (Capacité/Couchage/Surface), jamais des lignes de texte brutes,
        // jamais d'emoji (icônes UI vectorielles, Icons.Person/Bed/Expand).
        const keyFacts: { label: string; value: string; sub?: string; icon: (c?: string) => React.ReactNode }[] = [];
        if (c.capacite_max) {
          keyFacts.push({
            label: "Capacité", value: `${c.capacite_max} personne${c.capacite_max > 1 ? "s" : ""}`,
            sub: (c.capacite_adultes || c.capacite_enfants) ? [c.capacite_adultes ? `${c.capacite_adultes} adulte${c.capacite_adultes > 1 ? "s" : ""}` : null, c.capacite_enfants ? `${c.capacite_enfants} enfant${c.capacite_enfants > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") : undefined,
            icon: Icons.Person,
          });
        }
        if (literieLabels.length > 0) {
          keyFacts.push({ label: "Couchage", value: literieLabels[0], sub: literieLabels.length > 1 ? literieLabels.slice(1).join(" · ") : undefined, icon: Icons.Bed });
        }
        if (c.superficie_m2) {
          keyFacts.push({ label: "Surface", value: `${c.superficie_m2} m²`, icon: Icons.Expand });
        }
        const reserverBtn = (
          <Link href={`/rdv/${inst.id}?service=${encodeURIComponent(c.nom)}`} onClick={() => trackerCtaClic("rdv")} className="tap" style={{ display: "block", textAlign: "center", backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "23px", padding: "13px 20px", fontSize: "14px", fontWeight: 800, textDecoration: "none", flexShrink: 0 }}>
            Réserver
          </Link>
        );
        return (
          <div ref={chambreThumb.ref} onScroll={e => { setChambreScrolled(e.currentTarget.scrollTop > 4); chambreThumb.onScroll(); }} style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
            <ScrollThumbBar thumb={chambreThumb} isDark={isDark} bottom="calc(env(safe-area-inset-bottom) + 80px)"/>
            {/* Refonte visuelle (25/09/2026) : mobile-first en flux
                unique, réarrangé en 2 colonnes ≥900px via CSS (galerie
                pleine largeur, identité+key facts+description à gauche,
                carte prix+CTA sticky à droite) — jamais le "desktop
                réduit" (retour Bryan), une seule barre CTA active à la
                fois (fixe en bas sur mobile, remplacée par la carte
                sticky sur desktop). */}
            <style>{`
              .chfiche-container{max-width:1120px;margin:0 auto;padding:16px 16px 110px}
              .chfiche-grid{display:flex;flex-direction:column}
              .chfiche-sidebar{display:none}
              .chfiche-hero-img{height:220px}
              .chfiche-thumb{height:107px}
              .chfiche-desc{max-width:100%}
              @media(min-width:900px){
                .chfiche-container{padding:32px 24px 60px}
                .chfiche-grid{display:grid;grid-template-columns:1fr 320px;column-gap:40px;row-gap:0;align-items:start}
                .chfiche-gallery{grid-column:1/-1}
                .chfiche-info{grid-column:1}
                .chfiche-sidebar{grid-column:2;display:block;position:sticky;top:24px;background:${C.cardBg};border-radius:16px;padding:20px;border:1px solid ${C.borderCard}}
                .chfiche-full{grid-column:1/-1}
                .chfiche-price-inline{display:none}
                .chfiche-title-price{display:none}
                .chfiche-ctabar{display:none!important}
                .chfiche-hero-img{height:380px}
                .chfiche-thumb{height:186px}
                .chfiche-desc{max-width:640px}
              }
            `}</style>
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: chambreScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                {/* Flèche retour nue — cohérence avec le popup calendrier
                    de séjour du même parcours de réservation (retour Bryan
                    26/09/2026), plus un bouton X encadré. */}
                <button onClick={() => { setChambreOuverte(null); setGalerieOuverte(false); setChambreScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>{c.nom}</div>
                <div/>
              </div>
            </header>

            <div className="chfiche-container">
              <div className="chfiche-grid">
                {/* GALERIE — priorité visuelle n°1, alignement/rayons
                    homogènes, écart minimal entre vignettes. */}
                <div className="chfiche-gallery">
                  {apercu.length > 0 && (
                    <button onClick={() => setGalerieOuverte(true)} aria-label="Voir toutes les photos" className="tap" style={{ display: "grid", gridTemplateColumns: apercu.length === 1 ? "1fr" : "1.4fr 1fr", gap: "4px", width: "100%", border: "none", padding: 0, cursor: "pointer", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
                      {/* IMG-EXCEPTION: reason=aperçu galerie chambre, URL Storage publique stable | reviewed=2026-08-20 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.photos[0]} alt={c.nom} className="chfiche-hero-img" style={{ width: "100%", objectFit: "cover", display: "block" }}/>
                      {apercu.length > 1 && (
                        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: "4px" }}>
                          {apercu.slice(1, 3).map((url, i) => {
                            const estVideo = c.video_url === url;
                            const restant = apercu.length - 3;
                            const dernier = i === 1 && restant > 0;
                            return (
                              <div key={url} className="chfiche-thumb" style={{ position: "relative" }}>
                                {estVideo ? (
                                  <div style={{ width: "100%", height: "100%", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                                  </div>
                                ) : (
                                  // IMG-EXCEPTION: reason=aperçu galerie chambre, URL Storage publique stable | reviewed=2026-08-20
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
                                )}
                                {dernier && (
                                  <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "15px", fontWeight: "900" }}>+{restant}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </button>
                  )}
                </div>

                <div className="chfiche-info">
                  {/* IDENTITÉ — nom en titre principal, type en information
                      secondaire (jamais un 2e gros titre, retour Bryan
                      25/09/2026). Prix sur la même ligne que le nom, aligné
                      à droite (retour Bryan 26/09/2026) — mobile uniquement
                      (chfiche-title-price masqué ≥900px : le prix vit déjà
                      dans la carte sidebar sticky sur desktop, jamais les
                      deux à la fois). */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <h1 style={{ color: C.text, fontSize: "22px", fontWeight: 900, letterSpacing: "-0.3px", margin: "0 0 4px" }}>{c.nom}</h1>
                    <div className="chfiche-title-price" style={{ textAlign: "right", flexShrink: 0, paddingTop: "2px" }}>
                      <div style={{ color: "#F5A623", fontSize: "18px", fontWeight: 900, lineHeight: 1.2, whiteSpace: "nowrap" }}>{c.prix.toLocaleString("fr-FR")} GNF</div>
                      {c.unite_prix && <div style={{ color: C.textSubtle, fontSize: "11px", fontWeight: 600, marginTop: "2px", whiteSpace: "nowrap" }}>{c.unite_prix}</div>}
                    </div>
                  </div>
                  {c.categorie && <div style={{ color: C.textSubtle, fontSize: "13px", fontWeight: 600, marginBottom: "16px" }}>{c.categorie}</div>}

                  {/* INFORMATIONS ESSENTIELLES — refonte "premium"
                      (retour Bryan 25/09/2026 : "les 4 cartes sont nulles,
                      style Booking/Airbnb") : une seule carte "fiche"
                      empilant chaque fait (icône ronde + valeur en avant +
                      libellé en second plan), au lieu de 3 petites cases en
                      grille asymétrique (Surface se retrouvait seule sur sa
                      ligne). Aucun emoji, mêmes icônes UI qu'avant. */}
                  {keyFacts.length > 0 && (
                    <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "18px", overflow: "hidden", marginBottom: "18px" }}>
                      {keyFacts.map((f, i) => (
                        <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "15px 18px", borderTop: i > 0 ? `1px solid ${C.borderCard}` : "none" }}>
                          <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", color: C.text, flexShrink: 0 }}>
                            {f.icon(C.text)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: C.text, fontSize: "14.5px", fontWeight: 800, lineHeight: 1.3 }}>{f.value}</div>
                            <div style={{ color: C.textSubtle, fontSize: "12px", fontWeight: 600, marginTop: "2px" }}>{f.label}{f.sub ? ` · ${f.sub}` : ""}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* INFOS COMPLÉMENTAIRES (mobile uniquement — le prix est
                      remonté sur la ligne du titre, la carte complète avec
                      prix reste sur la sidebar desktop, jamais les deux à
                      la fois). */}
                  <div className="chfiche-price-inline" style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "16px", padding: "14px 16px", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    {infosComplementaires}
                  </div>

                  {/* DESCRIPTION — section éditoriale, largeur de lecture
                      confortable sur desktop (max-width via chfiche-desc),
                      "Lire plus" au-delà de 220 caractères plutôt qu'un
                      pavé de texte brut. */}
                  {c.description && (() => {
                    const SEUIL = 220;
                    const longue = c.description.length > SEUIL;
                    const texte = longue && !descExpanded ? c.description.slice(0, SEUIL).trimEnd() + "…" : c.description;
                    return (
                      <div style={{ marginBottom: "8px" }}>
                        <h2 style={sectionTitleStyle}>À propos de cette chambre</h2>
                        <p className="chfiche-desc" style={{ color: C.text, fontSize: "13.5px", lineHeight: 1.75, margin: 0 }}>{texte}</p>
                        {longue && (
                          <button onClick={() => setDescExpanded(v => !v)} className="tap" style={{ background: "none", border: "none", padding: "8px 0 0", color: C.text, fontSize: "12.5px", fontWeight: 800, textDecoration: "underline", cursor: "pointer" }}>
                            {descExpanded ? "Lire moins" : "Lire plus"}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Carte Prix + Réserver — desktop uniquement. */}
                <div className="chfiche-sidebar">
                  {prixNode(true)}
                  <div style={{ marginTop: "14px" }}>{reserverBtn}</div>
                </div>

                <div className="chfiche-full">
                  {/* ÉQUIPEMENTS — grille de cellules, icônes discrètes,
                      texte dominant (hors literie, déjà résumée dans les
                      Key Facts — jamais une donnée dupliquée à l'écran). */}
                  {equipementsAffiches.length > 0 && (
                    <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${C.borderCard}` }}>
                      <h2 style={sectionTitleStyle}>Équipements de la chambre</h2>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {equipementsAffiches.map(item => (
                          <div key={item.code} style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "10px 12px" }}>
                            {item.icon(C.textSubtle)}
                            <span style={{ color: C.text, fontSize: "12.5px", fontWeight: "600" }}>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* INCLUS / NON INCLUS — deux cartes structurées, jamais
                      une couleur agressive pour Non inclus (retour Bryan
                      25/09/2026 : "reste neutre et professionnel"). */}
                  {(c.inclus.length > 0 || c.non_inclus.length > 0) && (
                    <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${C.borderCard}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
                      {c.inclus.length > 0 && (
                        <div style={{ backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px" }}>
                          <div style={{ ...microLabelStyle, marginBottom: "10px" }}>Inclus</div>
                          {c.inclus.map(item => <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "8px", color: C.text, fontSize: "12.5px", marginBottom: "7px", lineHeight: 1.5 }}><span style={{ flexShrink: 0, marginTop: "2px", color: "#22c55e" }}>{Icons.Check("currentColor")}</span><span>{item}</span></div>)}
                        </div>
                      )}
                      {c.non_inclus.length > 0 && (
                        <div style={{ backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px" }}>
                          <div style={{ ...microLabelStyle, marginBottom: "10px" }}>Non inclus</div>
                          {c.non_inclus.map(item => <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "8px", color: C.textSubtle, fontSize: "12.5px", marginBottom: "7px", lineHeight: 1.5 }}><span style={{ flexShrink: 0, marginTop: "2px" }}>{Icons.Cross(C.textSubtle)}</span><span>{item}</span></div>)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* À SAVOIR — information importante, pas une publicité :
                      fond neutre, aucune couleur accent. */}
                  {c.a_savoir && (
                    <div style={{ marginTop: "24px", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "14px", padding: "16px" }}>
                      <div style={{ ...microLabelStyle, marginBottom: "8px" }}>À savoir</div>
                      <div style={{ color: C.text, fontSize: "12.5px", lineHeight: 1.65 }}>{c.a_savoir}</div>
                    </div>
                  )}

                  {/* INFORMATIONS PRATIQUES — volontairement absente (brief
                      "Détails" §8 : "si une donnée n'existe pas dans le
                      modèle, ne pas créer de fausse information"). Arrivée/
                      Départ/Conditions n'existent pas pour un type de
                      chambre (données de séjour, pas de fiche produit) et
                      la Capacité est déjà couverte par les Key Facts —
                      aucune donnée réelle distincte à afficher ici. */}

                  {/* AUTRES CHAMBRES — réutilise chambresHotel déjà chargé,
                      aucune nouvelle donnée/requête. */}
                  {autresChambres.length > 0 && (
                    <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: `1px solid ${C.borderCard}` }}>
                      <h2 style={sectionTitleStyle}>Autres chambres</h2>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
                        {autresChambres.map(other => (
                          <button key={other.id} onClick={() => { setChambreOuverte(other); setGalerieOuverte(false); setDescExpanded(false); setChambreScrolled(false); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", overflow: "hidden", cursor: "pointer", padding: 0 }}>
                            {other.photos.length > 0 && (
                              // IMG-EXCEPTION: reason=vignette "autres chambres", URL Storage publique stable | reviewed=2026-09-25
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={other.photos[0]} alt={other.nom} style={{ width: "100%", height: "90px", objectFit: "cover", display: "block" }}/>
                            )}
                            <div style={{ padding: "10px 12px" }}>
                              <div style={{ color: C.text, fontSize: "12.5px", fontWeight: 700 }}>{other.nom}</div>
                              <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: 800, marginTop: "3px" }}>{other.prix.toLocaleString("fr-FR")} GNF{other.unite_prix ? ` / ${other.unite_prix}` : ""}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA — mobile uniquement (barre fixe), remplacée par la
                carte sidebar sticky sur desktop : jamais deux CTA
                permanents en même temps. */}
            <div className="chfiche-ctabar" style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: C.pageBg, borderTop: `1px solid ${C.borderCard}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <div style={{ color: "#F5A623", fontSize: "16px", fontWeight: "900", whiteSpace: "nowrap" }}>{c.prix.toLocaleString("fr-FR")} GNF</div>
                {c.unite_prix && <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: 600 }}>{c.unite_prix}</div>}
              </div>
              <Link href={`/rdv/${inst.id}?service=${encodeURIComponent(c.nom)}`} onClick={() => trackerCtaClic("rdv")} className="tap" style={{ display: "inline-block", textAlign: "center", backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "23px", padding: "13px 28px", fontSize: "14px", fontWeight: "800", textDecoration: "none", flexShrink: 0 }}>
                Réserver
              </Link>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          CHAMBRE — Vue 3, galerie plein écran (grille façon Booking
          "Photos"). Tap sur un élément = plein écran (mediaPleinEcran).
      ══════════════════════════════════════════════════════ */}
      {chambreOuverte && galerieOuverte && (
        <div ref={galerieThumb.ref} onScroll={e => { setGalerieScrolled(e.currentTarget.scrollTop > 4); galerieThumb.onScroll(); }} style={{ position: "fixed", inset: 0, zIndex: 550, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <ScrollThumbBar thumb={galerieThumb} isDark={isDark}/>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: galerieScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => { setGalerieOuverte(false); setGalerieScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Photos</div>
              <div/>
            </div>
          </header>
          <div style={{ padding: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            {(() => {
              const items: { type: "photo" | "video"; url: string }[] = [
                ...chambreOuverte.photos.map(url => ({ type: "photo" as const, url })),
                ...(chambreOuverte.video_url ? [{ type: "video" as const, url: chambreOuverte.video_url }] : []),
              ];
              return items.map((item, i) => (
                <button key={item.url} onClick={() => setMediaPleinEcran({ items, index: i })} aria-label={item.type === "video" ? "Voir la vidéo" : `Voir la photo ${i + 1}`} className="tap" style={{ position: "relative", border: "none", padding: 0, cursor: "pointer", borderRadius: "10px", overflow: "hidden", height: "160px", backgroundColor: item.type === "video" ? "#000" : undefined, display: item.type === "video" ? "flex" : "block", alignItems: "center", justifyContent: "center" }}>
                  {item.type === "video" ? (
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                  ) : (
                    <>
                      {/* IMG-EXCEPTION: reason=galerie plein écran, URL Storage publique stable | reviewed=2026-08-20 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
                    </>
                  )}
                </button>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Média plein écran (photo ou vidéo) — refonte "façon Booking"
          (retour Bryan 25/09/2026) : croix en haut à gauche, barre unique
          en bas (précédent · compteur · suivant), fond noir plein — plus
          de compteur/flèches éclatés au milieu de l'écran. Rendu via
          createPortal(document.body) : ce viewer est ouvert par-dessus la
          galerie plein écran (elle-même position:fixed + overflowY:auto),
          et un position:fixed imbriqué dans un autre position:fixed
          scrollable ne se recale pas fiablement sur mobile (Safari iOS
          notamment) — même pattern de portail déjà utilisé par
          MonAssistant/BiometrieModal/NotifPanel/LogoutFlow pour sortir
          d'un contexte d'empilement local. Swipe tactile (retour Bryan :
          "ajouter le scroll avec la main") : Pointer Events plutôt que
          l'API Drag and Drop (ne se déclenche pas sur tactile, même
          justification que PhotoGallery dans ServicesHotelTab.tsx) — pas
          de suivi animé du doigt, juste un seuil de distance qui déclenche
          précédent/suivant, cohérent avec l'absence de librairie de
          gestes dans le projet. Le zoom repose sur le pincement natif du
          navigateur. */}
      {mediaPleinEcran && createPortal((() => {
        const { items, index } = mediaPleinEcran;
        const current = items[index];
        const goTo = (i: number) => setMediaPleinEcran({ items, index: (i + items.length) % items.length });
        const SWIPE_THRESHOLD = 50;
        return (
          <div
            ref={el => el?.focus()}
            tabIndex={-1}
            onKeyDown={e => {
              if (e.key === "Escape") setMediaPleinEcran(null);
              if (e.key === "ArrowRight") goTo(index + 1);
              if (e.key === "ArrowLeft") goTo(index - 1);
            }}
            onClick={() => { if (swipeConsumedRef.current) { swipeConsumedRef.current = false; return; } setMediaPleinEcran(null); }}
            onPointerDown={e => { swipeStartRef.current = { x: e.clientX, y: e.clientY }; }}
            onPointerUp={e => {
              const start = swipeStartRef.current;
              swipeStartRef.current = null;
              if (!start || items.length < 2) return;
              const dx = e.clientX - start.x;
              const dy = e.clientY - start.y;
              if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
                swipeConsumedRef.current = true;
                goTo(dx < 0 ? index + 1 : index - 1);
              }
            }}
            style={{ position: "fixed", inset: 0, zIndex: 600, backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center", outline: "none", touchAction: "pan-y" }}
          >
            <button onClick={() => setMediaPleinEcran(null)} aria-label="Fermer" className="tap" style={{ position: "absolute", top: "calc(16px + env(safe-area-inset-top))", left: "16px", width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer", zIndex: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            {current.type === "photo" ? (
              // IMG-EXCEPTION: reason=visionneuse plein écran, URL Storage publique stable | reviewed=2026-08-20
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.url} alt="" draggable={false} onClick={e => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}/>
            ) : (
              <video src={current.url} controls autoPlay onClick={e => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%" }}/>
            )}
            {items.length > 1 && (
              <div onClick={e => e.stopPropagation()} style={{ position: "absolute", left: 0, right: 0, bottom: "calc(20px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", justifyContent: "center", gap: "22px" }}>
                <button onClick={() => goTo(index - 1)} aria-label="Photo précédente" className="tap" style={{ width: "38px", height: "38px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span style={{ color: "#fff", fontSize: "13px", fontWeight: "700" }}>{index + 1} / {items.length}</span>
                <button onClick={() => goTo(index + 1)} aria-label="Photo suivante" className="tap" style={{ width: "38px", height: "38px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            )}
          </div>
        );
      })(), document.body)}

      {/* ══════════════════════════════════════════════════════
          SERVICE — fiche complète (25/09/2026), même patron d'overlay que
          la chambre (header sticky + footer CTA sticky), ordre standard
          Yelen Hôtel : Photo → Identité → Prix+durée → Demande →
          Description → Inclus/non inclus → Disponibilité → Informations →
          À savoir. Les deux expériences (chambre/service) doivent donner
          l'impression du même produit — mêmes tokens de couleur/rayon.
      ══════════════════════════════════════════════════════ */}
      {serviceOuvert && (() => {
        const p = serviceOuvert;
        const TYPE_META: Record<string, { label: string; action: string | null; color: string }> = {
          reservable:       { label: "Réservable",       action: "Réserver",               color: "#60a5fa" },
          commandable:      { label: "Commandable",      action: "Commander",              color: "#34d399" },
          supplement:       { label: "Avec supplément",  action: "Ajouter à ma réservation", color: "#fbbf24" },
          horaires_limites: { label: "Horaires limités", action: null,                      color: "#c084fc" },
        };
        const meta = p.type_prestation ? TYPE_META[p.type_prestation] : null;
        return (
          <div ref={serviceThumb.ref} onScroll={e => { setServiceScrolled(e.currentTarget.scrollTop > 4); serviceThumb.onScroll(); }} style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
            <ScrollThumbBar thumb={serviceThumb} isDark={isDark} bottom={meta?.action ? "calc(env(safe-area-inset-bottom) + 80px)" : "20px"}/>
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: serviceScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                <button onClick={() => { setServiceOuvert(null); setServiceScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>{p.nom}</div>
                <div/>
              </div>
            </header>

            <div style={{ padding: "16px 16px 110px" }}>
              {/* PHOTO — facultative pour un service. */}
              {p.photos.length > 0 && (
                <button onClick={() => setMediaPleinEcran({ items: p.photos.map(url => ({ type: "photo" as const, url })), index: 0 })} className="tap" style={{ display: "block", width: "100%", border: "none", padding: 0, cursor: "pointer", borderRadius: "16px", overflow: "hidden", marginBottom: "18px" }}>
                  {/* IMG-EXCEPTION: reason=aperçu fiche service, URL Storage publique stable | reviewed=2026-09-25 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photos[0]} alt={p.nom} style={{ width: "100%", height: "200px", objectFit: "cover", display: "block" }}/>
                </button>
              )}

              {/* IDENTITÉ — nom déjà dans le header, famille + type ici. */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                {p.categorie && <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "700" }}>{p.categorie}</span>}
                {meta && <span style={{ backgroundColor: `${meta.color}18`, color: meta.color, fontSize: "10px", fontWeight: "800", padding: "2px 9px", borderRadius: "20px" }}>{meta.label}</span>}
              </div>

              {/* PRIX + DURÉE */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "16px" }}>
                <span style={{ color: "#F5A623", fontSize: "20px", fontWeight: "900" }}>{p.prix.toLocaleString("fr-FR")} GNF{p.unite_prix ? ` / ${p.unite_prix}` : ""}</span>
                {p.duree_minutes > 0 && <span style={{ color: C.textSubtle, fontSize: "12.5px", fontWeight: "700" }}>{p.duree_minutes} min</span>}
              </div>

              {/* DESCRIPTION — détaillée. */}
              {p.description && <p style={{ color: C.text, fontSize: "13.5px", lineHeight: 1.65, margin: 0 }}>{p.description}</p>}

              {/* INCLUS / NON INCLUS */}
              {(p.inclus.length > 0 || p.non_inclus.length > 0) && (
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${C.borderCard}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  {p.inclus.length > 0 && (
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Inclus</div>
                      {p.inclus.map(item => <div key={item} style={{ color: C.text, fontSize: "12.5px", marginBottom: "5px" }}>✓ {item}</div>)}
                    </div>
                  )}
                  {p.non_inclus.length > 0 && (
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Non inclus</div>
                      {p.non_inclus.map(item => <div key={item} style={{ color: C.textSubtle, fontSize: "12.5px", marginBottom: "5px" }}>✕ {item}</div>)}
                    </div>
                  )}
                </div>
              )}

              {/* DISPONIBILITÉ — horaires (distincts de la localisation,
                  affichée séparément ci-dessous en Informations). */}
              {p.horaires && p.horaires.length > 0 && (() => {
                const { ouvert, horaire } = isOuvertNow(p.horaires!);
                return (
                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${C.borderCard}` }}>
                    <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Disponibilité</div>
                    <span style={{ color: ouvert ? "#22c55e" : C.textSubtle, fontSize: "12.5px", fontWeight: "700" }}>
                      🕒 {ouvert ? "Ouvert maintenant" : "Fermé maintenant"}{horaire?.ouvert ? ` · ${horaire.debut}-${horaire.fin}` : ""}
                    </span>
                  </div>
                );
              })()}

              {/* INFORMATIONS — localisation. */}
              {p.localisation && (
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${C.borderCard}` }}>
                  <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Informations</div>
                  <span style={{ color: C.text, fontSize: "12.5px", fontWeight: "700" }}>📍 {p.localisation}</span>
                </div>
              )}

              {/* À SAVOIR */}
              {p.a_savoir && (
                <div style={{ marginTop: "16px", backgroundColor: C.cardBg, borderRadius: "12px", padding: "12px 14px" }}>
                  <div style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>À savoir</div>
                  <div style={{ color: C.text, fontSize: "12.5px", lineHeight: 1.6 }}>{p.a_savoir}</div>
                </div>
              )}
            </div>

            {/* DEMANDE — même CTA que la carte compacte (Réserver/
                Commander/Ajouter à ma réservation selon type_prestation),
                jamais affiché si le type n'a pas d'action (horaires_limites). */}
            {meta?.action && (
              <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: C.pageBg, borderTop: `1px solid ${C.borderCard}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ color: C.text, fontSize: "16px", fontWeight: "900", whiteSpace: "nowrap" }}>{p.prix.toLocaleString("fr-FR")} GNF{p.unite_prix ? ` / ${p.unite_prix}` : ""}</div>
                <Link href={`/rdv/${inst.id}?service=${encodeURIComponent(p.nom)}`} onClick={() => trackerCtaClic("rdv")} className="tap" style={{ display: "inline-block", textAlign: "center", backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "23px", padding: "13px 28px", fontSize: "14px", fontWeight: "800", textDecoration: "none", flexShrink: 0 }}>
                  {meta.action}
                </Link>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          POPUP CONDITIONS/INFORMATIONS/LÉGALES — même logique que Avis/
          Commentaires/Questions ci-dessus.
      ══════════════════════════════════════════════════════ */}
      {infoOpen && (() => {
        const meta = {
          // Icônes maison (pas des glyphes génériques réutilisés d'ailleurs
          // dans le fichier) — un pictogramme par nature de contenu :
          // document signé (conditions), cloche (informations importantes),
          // balance (informations légales). Couleur Yelen unique pour les 3
          // (retour Bryan 31/08/2026, cohérence avec le reste de la fiche —
          // fond doré plein, icône foncée, comme CTA/avatars/pill site web).
          conditions: {
            titre: "Conditions de l'entreprise", texte: inst?.conditions_entreprise, date: inst?.conditions_entreprise_le, dateCreation: inst?.conditions_entreprise_creee_le, color: "#F5A623",
            icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>,
          },
          importantes: {
            titre: isHotel ? "Règles du séjour" : "Informations importantes", texte: inst?.informations_importantes, date: inst?.informations_importantes_le, dateCreation: inst?.informations_importantes_creee_le, color: "#F5A623",
            icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
          },
          legales: {
            titre: "Informations légales", texte: inst?.informations_legales, date: inst?.informations_legales_le, dateCreation: inst?.informations_legales_creee_le, color: "#F5A623",
            icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"/><path d="M9 21h6"/><path d="M5 8h14"/><path d="m5 8-3 6a4 4 0 0 0 8 0z"/><path d="m19 8-3 6a4 4 0 0 0 8 0z"/></svg>,
          },
        }[infoOpen];
        return (
          <div ref={infoThumb.ref} onScroll={e => { setInfoScrolled(e.currentTarget.scrollTop > 4); infoThumb.onScroll(); }} style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
            <ScrollThumbBar thumb={infoThumb} isDark={isDark}/>
            {/* Séparateur visible seulement au scroll (retour Bryan
                26/09/2026) — header uniforme avec la page tant qu'on est
                en haut, la ligne apparaît dès qu'il y a du contenu
                dessous à distinguer. Fond identique à C.pageBg (retour
                Bryan 26/09/2026 : "les fonds sont différents") — plus le
                voile semi-transparent + flou utilisé ailleurs (utile
                seulement quand du contenu défile sous un header
                translucide ; ici le fond est plein, donc inutile). */}
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: C.pageBg, borderBottom: infoScrolled ? `1px solid ${C.borderCard}` : "1px solid transparent", transition: "border-color 0.2s ease", padding: "env(safe-area-inset-top) 16px 0" }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                {/* Flèche retour nue — même patron que le flux de
                    réservation (chambreOuverte/serviceOuvert, retour Bryan
                    26/09/2026), plus l'ancien bouton X encadré. */}
                <button onClick={() => { setInfoOpen(null); setInfoScrolled(false); }} className="tap" aria-label="Retour" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, display: "flex", color: C.text, cursor: "pointer" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <div/>
                <div/>
              </div>
            </header>
            <div style={{ padding: "8px 20px 24px", maxWidth: "560px", margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: meta.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {meta.icon}
                </div>
              </div>
              <h1 style={{ color: C.text, fontSize: "19px", fontWeight: "900", textAlign: "center", margin: "0 0 20px", letterSpacing: "-0.3px" }}>{meta.titre}</h1>
              {meta.texte ? (
                // Contenu en lecture directe (retour Bryan 26/09/2026 :
                // "adapte en vraie lecture, retire le texte dans un cadre")
                // — plus de carte C.cardBg autour du texte ni d'eyebrow
                // dupliquant le titre déjà affiché au-dessus, juste le
                // paragraphe sur le fond de page comme un vrai article.
                <div>
                  <p style={{ color: C.text, fontSize: "14.5px", lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>{meta.texte}</p>
                  <p style={{ color: "#080812", background: "#F5A623", borderRadius: "10px", fontSize: "11px", fontWeight: "700", margin: "16px 0 0", padding: "8px 10px" }}>
                    {(() => {
                      const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
                      // dateCreation absente (contenu écrit avant la migration
                      // 20260831000001) : repli sur meta.date, seule date
                      // connue pour cette ligne — jamais de "mis à jour"
                      // affiché dans ce cas, faute de vraie date de création
                      // à comparer.
                      const dateEcrit = meta.dateCreation ?? meta.date;
                      const misAJour = meta.dateCreation && meta.date && meta.date !== meta.dateCreation ? meta.date : null;
                      return <>Écrit par {inst?.name}{dateEcrit ? ` · écrit le ${fmt(dateEcrit)}` : ""}{misAJour ? ` · a été mis à jour le ${fmt(misAJour)}` : ""}</>;
                    })()}
                  </p>
                </div>
              ) : (
                <div style={{ backgroundColor: C.cardBg, borderRadius: "18px", padding: "36px 20px", textAlign: "center", border: `1px dashed ${C.borderCard}` }}>
                  <p style={{ color: C.textSubtle, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>Cet établissement n&apos;a pas encore renseigné cette section.</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* BANDEAU CTA — façon Booking ("Select rooms" toujours accessible en
          bas). Repassé de `sticky` à `fixed` (retour Bryan 25/07/2026) pour
          pouvoir se révéler au scroll vers le haut depuis n'importe où sur
          la page — impossible avec `sticky`, qui ne s'engage qu'à
          l'approche de sa position naturelle en fin de flux.
          ⚠️ Historique : ce même `fixed` avait été abandonné le 24/07/2026
          suite à un bug réel constaté sur téléphone (Safari iOS ET Chrome
          Android) — un espace vide de couleur page apparaissait entre le
          bandeau et le bord réel de l'écran, `fixed; bottom:0` étant ancré à
          la "layout viewport" qui se désynchronise de la "visual viewport"
          selon l'état de la barre d'adresse dynamique. Retenté ici après
          plusieurs correctifs corrigés depuis (overflow-x html/body cassant
          position:fixed sur WebKit, notamment) qui pouvaient être la vraie
          cause. À confirmer sur téléphone — si l'espace vide revient,
          repasser à `sticky` (voir historique git) plutôt que retenter
          d'autres réglages. */}
      {/* Même décision que le CTA hero (ctaDecision, lib/prestataireCapacites.ts)
          — jamais une 2ᵉ logique indépendante, voir CTA V1 §11/§19. */}
      {ctaDecision.principal && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 240, backgroundColor: C.cardBg, borderRadius: "22px 22px 0 0", boxShadow: isDark ? "0 -10px 32px rgba(0,0,0,0.55)" : "0 -10px 32px rgba(0,0,0,0.14)", padding: `14px 16px calc(14px + env(safe-area-inset-bottom))`, transform: `translateY(${ctaVisible ? "0" : "110%"})`, transition: "transform 0.3s ease" }}>
          {ctaDecision.principal.action === "rdv" ? (
            <Link href={ctaHref("rdv")} onClick={() => trackerCtaClic("rdv")} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "999px", textDecoration: "none", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
              <Icons.Cal /> {ctaDecision.principal.label}
            </Link>
          ) : (
            <a href={ctaHref(ctaDecision.principal.action)} target={ctaDecision.principal.action === "phone" ? undefined : "_blank"} rel={ctaDecision.principal.action === "phone" ? undefined : "noreferrer"} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "999px", textDecoration: "none", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
              {ctaDecision.principal.action === "website" ? <Icons.Globe /> : ctaDecision.principal.action === "whatsapp" ? <Icons.Whatsapp /> : <Icons.Phone />}
              {" "}{ctaDecision.principal.label}
            </a>
          )}
        </div>
      )}

      {/* Toast — confirme l'ajout/retrait des favoris (retour CEO
          24/07/2026 : "tu ajoutes ou décoches, rien, aucun texte ne dit ce
          qui est fait"). */}
      {toast && (
        <div style={{ position: "fixed", bottom: "calc(100px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", zIndex: 600, backgroundColor: isDark ? "#1C1C1E" : "#080812", color: "#fff", fontSize: "13px", fontWeight: "700", padding: "11px 18px", borderRadius: "12px", boxShadow: "0 6px 20px rgba(0,0,0,0.3)", whiteSpace: "nowrap", animation: "fadeUp 0.2s ease" }}>
          {toast}
        </div>
      )}

      {/* Indicateur de position de scroll — même composant visuel que
          app/page.tsx, indépendant du header/CTA sticky (position: fixed),
          estompé hors défilement. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top) + 60px)",
          bottom: "calc(env(safe-area-inset-bottom) + 76px)",
          right: "3px",
          width: "3px",
          zIndex: 90,
          pointerEvents: "none",
          opacity: scrollBarShown ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: `${scrollPct * (1 - scrollThumbH) * 100}%`,
            height: `${scrollThumbH * 100}%`,
            width: "100%",
            borderRadius: "3px",
            background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)",
          }}
        />
      </div>
    </div>
  );
}

export default function InstitutionPublicClient() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLoader size={32}/>
      </div>
    }>
      <InstitutionProfilePageInner/>
    </Suspense>
  );
}