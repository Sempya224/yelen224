"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { type Horaire, JOURS_SEMAINE, parseHoraires, isOuvertNow } from "@/lib/horaires";
import { SECTEUR_LABELS, SECTEUR_META } from "@/lib/secteurs";
import { enregistrerInstitutionConsultee } from "@/lib/institutionsRecentes";

// ─── Types ────────────────────────────────────────────────────────────────────
type Annonce = { id: string; titre: string; contenu: string; type: string; format: string; media_urls: string[] | null; epingle: boolean; image_url: string | null; created_at: string; date_expiration: string | null };
type Avis    = { id: string; citoyen_id: string; titre: string | null; note: number; commentaire: string | null; reponse_institution: string | null; reponse_le: string | null; created_at: string; nom: string; rdv_confirmed: boolean; utile_count: number };
type Commentaire = { id: string; annonce_id: string; contenu: string; citoyen_id: string; citoyen_nom: string | null; created_at: string };
type QuestionInstitution = { id: string; citoyen_id: string; question: string; reponse: string | null; reponse_le: string | null; created_at: string };
type Institution = {
  id: string; name: string; category: string; secteur: string | null; description: string;
  adresse: string; ville: string; quartier: string;
  phone: string; whatsapp?: string; email?: string; site_web?: string;
  logo?: string | null; banniere?: string | null;
  moyenne_avis: number; nb_avis: number; badge_verifie: boolean;
  horaires: Horaire[]; services: string[];
  annee_creation?: string; capacite?: string; langue?: string[];
  conditions_entreprise: string | null; informations_importantes: string | null; informations_legales: string | null;
  conditions_entreprise_le: string | null; informations_importantes_le: string | null; informations_legales_le: string | null;
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
const FAQ_FICHE: { q: string; r: string }[] = [
  { q: "Comment prendre rendez-vous avec cette institution ?", r: "Appuyez sur \"Prendre RDV\", choisissez un service et un créneau disponible, puis confirmez. Vous recevez une confirmation immédiate dans l'application." },
  { q: "Puis-je annuler ou reporter mon rendez-vous ?", r: "Oui, depuis l'onglet \"Mes RDV\" de votre compte, jusqu'à l'heure prévue du rendez-vous." },
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
  Info:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Announce: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>,
  Heart:    (filled: boolean, color = "#ef4444") => <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  Comment:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  Pin2:     () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
  Whatsapp: () => <svg width="16" height="16" fill="#22c55e" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>,
  Flag:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  Users:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Note:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  CatHealth:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  CatEdu:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><path d="M2 13l10 6 10-6"/></svg>,
  CatAdmin:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  CatBank:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
  CatPharma:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>,
  // Tracés repris de SecteurIcon (app/institution/inscription/page.tsx) pour
  // une identité visuelle cohérente entre l'onboarding et la fiche publique.
  CatBeaute:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 5.6L19 10l-5.2 1.4L12 17l-1.8-5.6L5 10l5.2-1.4z"/></svg>,
  CatCommerce:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l1.5 5M18 2l-1.5 5M3 7h18l-1.4 13a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z"/></svg>,
  CatArtisanat:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-8 8l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a6 6 0 0 1 8-8z"/></svg>,
};

const SECTEUR_ICON: Record<string, () => React.ReactElement> = {
  sante:            Icons.CatHealth,
  administratif:    Icons.CatAdmin,
  financier:        Icons.CatBank,
  juridique:        Icons.Flag,
  beaute_bien_etre: Icons.CatBeaute,
  commerce:         Icons.CatCommerce,
  artisanat:        Icons.CatArtisanat,
  services_divers:  Icons.Building,
};

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

// ─── Logo institution ─────────────────────────────────────────────────────────
function InstitutionLogo({ logo, name, secteur, size = 64 }: { logo?: string | null; name: string; secteur: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const meta = SECTEUR_META[secteur ?? ""] || { color: "#F5A623" };
  const CatIconComp = SECTEUR_ICON[secteur ?? ""] || Icons.Building;
  const initials = getInitials(name);

  if (logo && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: "18px", overflow: "hidden", flexShrink: 0, border: `2.5px solid ${meta.color}35`, boxShadow: `0 0 0 4px ${meta.color}12, 0 8px 24px rgba(0,0,0,0.25)` }}>
        <img src={logo} alt={name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "18px", flexShrink: 0, background: `linear-gradient(135deg, ${meta.color}28, ${meta.color}12)`, border: `2.5px solid ${meta.color}40`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", boxShadow: `0 0 0 4px ${meta.color}08, 0 8px 24px rgba(0,0,0,0.2)` }}>
      <div style={{ color: meta.color, opacity: 0.8 }}><CatIconComp /></div>
      <span style={{ color: meta.color, fontSize: size * 0.13 + "px", fontWeight: "900", letterSpacing: "0.5px" }}>{initials || "?"}</span>
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
      <div style={{ width: "4px", height: "20px", borderRadius: "2px", background: `linear-gradient(180deg, ${color}, ${color}88)`, flexShrink: 0 }}/>
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
          <img key={i} src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", flexShrink: 0, scrollSnapAlign: "start" }}/>
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

// ─── Page principale ──────────────────────────────────────────────────────────
// useSearchParams() exige une frontière Suspense en App Router (voir
// app/login/page.tsx pour le même pattern déjà en place) — sinon le build
// Netlify échoue au prerendering (bug réel déjà rencontré le 22/07/2026,
// voir CLAUDE.md /historique-deploiement).
function InstitutionProfilePageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
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

  const [inst, setInst]         = useState<Institution | null>(null);
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [avis, setAvis]         = useState<Avis[]>([]);
  const [loading, setLoading]   = useState(true);
  // Chantier refonte fiche prestataire (24/07/2026, retour CEO) — Info/
  // Horaires/Services ne sont plus des onglets qui masquent le reste :
  // tout le contenu est désormais visible en un seul scroll, ces boutons
  // deviennent des ancres qui font défiler jusqu'à la section. Avis reste
  // à part : son bouton ouvre un plein écran dédié façon Booking.
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const horairesRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);
  const [imgBanErr, setImgBanErr] = useState(false);
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
    };
    onScrollPct();
    window.addEventListener("scroll", onScrollPct, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScrollPct);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    };
  }, []);
  // FAQ (chantier refonte fiche prestataire, 24/07/2026)
  const [faqOuverte, setFaqOuverte] = useState<number | null>(null);
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
  // "Conditions & Informations" façon Booking (Property Policies/Important
  // details/Legal information), 24/07/2026 — remplace le footer de la
  // fiche. Contenu rempli par l'institution (Mon compte > Conditions &
  // Informations), popup dédié par section.
  const [infoOpen, setInfoOpen] = useState<"conditions" | "importantes" | "legales" | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askSubmitting, setAskSubmitting] = useState(false);
  const mesQuestions = questions.filter(q => q.citoyen_id === citoyenId);
  const questionsRepondues = questions.filter(q => q.reponse !== null).sort((a, b) => new Date(b.reponse_le ?? b.created_at).getTime() - new Date(a.reponse_le ?? a.created_at).getTime());

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
    }
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: row } = await supabase.from("institutions").select("*").eq("id", id).maybeSingle();
      if (!row) { setLoading(false); return; }
      const r = row as Record<string, any>;
      setInst({
        id: String(r.id), name: String(r.name ?? r.nom ?? ""),
        category: String(r.category ?? r.categorie ?? "Autre"),
        secteur: r.secteur ? String(r.secteur) : null,
        description: String(r.description ?? ""),
        conditions_entreprise: r.conditions_entreprise ? String(r.conditions_entreprise) : null,
        informations_importantes: r.informations_importantes ? String(r.informations_importantes) : null,
        informations_legales: r.informations_legales ? String(r.informations_legales) : null,
        conditions_entreprise_le: r.conditions_entreprise_le ? String(r.conditions_entreprise_le) : null,
        informations_importantes_le: r.informations_importantes_le ? String(r.informations_importantes_le) : null,
        informations_legales_le: r.informations_legales_le ? String(r.informations_legales_le) : null,
        adresse: String(r.adresse ?? ""), ville: String(r.ville ?? ""), quartier: String(r.quartier ?? ""),
        phone: String(r.phone ?? r.telephone ?? ""),
        whatsapp: r.whatsapp ? String(r.whatsapp) : undefined,
        email: r.email ? String(r.email) : undefined,
        site_web: r.site_web ? String(r.site_web) : undefined,
        logo: r.logo ?? null, banniere: r.banniere ?? null,
        moyenne_avis: Number(r.moyenne_avis ?? 0),
        nb_avis: Number(r.nb_avis ?? 0),
        badge_verifie: Boolean(r.badge_verifie),
        horaires: parseHoraires(r.horaires),
        services: parseArr(r.services),
        annee_creation: r.annee_creation ? String(r.annee_creation) : undefined,
        capacite: r.capacite ? String(r.capacite) : undefined,
        langue: r.langue ? (Array.isArray(r.langue) ? r.langue : [String(r.langue)]) : undefined,
      });
      // "Continuez votre exploration" sur l'Accueil (retour Bryan
      // 25/07/2026, façon Booking.com "Continue your search") — purement
      // local, jamais bloquant pour l'affichage de la fiche.
      enregistrerInstitutionConsultee({
        id: String(r.id), name: String(r.name ?? r.nom ?? ""),
        logo: r.logo ?? null, category: String(r.category ?? r.categorie ?? "Autre"), ville: String(r.ville ?? ""),
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
        (likesRows ?? []).forEach((l: any) => {
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
        (commentRows ?? []).forEach((c: any) => {
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

      const avisVisibles = (avisData ?? []).filter((a: any) => !a.masque);

      if (avisVisibles.length > 0) {
        // Récupérer les noms des citoyens
        const ids = [...new Set(avisVisibles.map((a: any) => a.citoyen_id).filter(Boolean))];
        const { data: usersData } = await supabase
          .from("users").select("id,nom,prenom,phone").in("id", ids);
        const uMap: Record<string, string> = {};
        (usersData ?? []).forEach((u: any) => {
          uMap[u.id] = [u.prenom, u.nom].filter(Boolean).join(" ") || u.phone || "Citoyen";
        });

        // Vérifier quels citoyens ont un RDV effectué/confirmé pour le badge
        const { data: rdvData } = await supabase
          .from("rdv")
          .select("citoyen_id")
          .eq("institution_id", id)
          .in("statut", ["effectue", "termine", "confirme"]);
        const citoyensVerifies = new Set((rdvData ?? []).map((r: any) => r.citoyen_id));

        // "Utile" (Lot H, chantier Avis + Favoris citoyen) — mirroring
        // annonce_likes : compte public + mes propres marques.
        const avisIds = avisVisibles.map((a: any) => a.id);
        const { data: utileData } = await supabase.from("avis_utile").select("avis_id, citoyen_id").in("avis_id", avisIds);
        const utileCountMap: Record<string, number> = {};
        (utileData ?? []).forEach((u: any) => { utileCountMap[u.avis_id] = (utileCountMap[u.avis_id] ?? 0) + 1; });
        const { data: { user: viewerUser } } = await supabase.auth.getUser();
        setMesUtile(new Set((utileData ?? []).filter((u: any) => u.citoyen_id === viewerUser?.id).map((u: any) => u.avis_id)));

        setAvis(avisVisibles.map((a: any) => ({
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
        const aVoirAvis = avisVisibles.filter((a: any) => {
          const key = `yelen224_vue_avis_${a.id}`;
          try {
            if (sessionStorage.getItem(key)) return false;
            sessionStorage.setItem(key, "1");
          } catch { /* navigation privée / storage indisponible : on compte quand même */ }
          return true;
        });
        if (aVoirAvis.length > 0) {
          supabase.from("avis_vues").insert(
            aVoirAvis.map((a: any) => ({ avis_id: a.id, citoyen_id: viewerUser?.id ?? null }))
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
    else setToast(wasFavori ? "Retiré des favoris" : "Ajouté aux favoris");
  };

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
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
      <div style={{ width: "44px", height: "44px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      <p style={{ color: C.textSubtle, fontSize: "14px" }}>Chargement…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!inst) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
      <div style={{ fontSize: "48px", marginBottom: "16px", color: C.textSubtle }}><Icons.Building /></div>
      <p style={{ color: C.text, fontSize: "16px", fontWeight: "700", marginBottom: "20px" }}>Institution introuvable</p>
      <Link href="/recherche" style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>Retour à la recherche</Link>
    </div>
  );

  const meta = SECTEUR_META[inst.secteur ?? ""] || { color: "#F5A623" };
  const CatIconComp = SECTEUR_ICON[inst.secteur ?? ""] || Icons.Building;
  const { ouvert, horaire: horaireAujd } = isOuvertNow(inst.horaires);
  const jourAujd = JOURS_SEMAINE[new Date().getDay()];
  // Utilise le vrai numéro WhatsApp de l'institution s'il est renseigné —
  // avant, ce bouton du hero ouvrait toujours le compose générique WhatsApp
  // (sans destinataire) même quand inst.whatsapp existait, alors que la
  // carte Contacts plus bas l'utilisait déjà correctement (incohérence
  // corrigée, retour CEO 24/07/2026).
  const whatsappMsg = `Bonjour, je souhaite des informations sur ${inst.name} via YELEN224.`;
  const whatsappUrl = inst.whatsapp
    ? `https://wa.me/${inst.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappMsg)}`
    : `https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`;

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
    { key: "services",  label: "Services",  icon: <Icons.Note />,  count: inst.services.length, onPress: () => scrollToSection(servicesRef) },
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
      {(() => {
        const hBg      = isDark ? "rgba(7,7,22,0.97)" : "rgba(255,255,255,0.97)";
        const hText    = C.text;
        const hChip    = inputBg;
        const hChipBrd = inputBord;
        return (
        <header style={{ position: "sticky", top: 0, zIndex: 200, background: hBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
          {/* Grille 1fr/auto/1fr (au lieu de space-between) — garde le
              titre centré indépendamment de la largeur du chip retour. */}
          <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
            <Link href="/recherche" className="tap" style={{ justifySelf: "start", display: "flex", alignItems: "center", textDecoration: "none", color: hText, minWidth: 0 }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "9px", backgroundColor: hChip, border: `1px solid ${hChipBrd}`, display: "flex", alignItems: "center", justifyContent: "center", color: hText, flexShrink: 0 }}>
                <Icons.Back />
              </div>
            </Link>
            <div style={{ minWidth: 0, maxWidth: "180px", textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                <div style={{ color: hText, fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{inst.name}</div>
                {inst.badge_verifie && <MetaVerifiedBadge size={14}/>}
              </div>
            </div>
            <button onClick={handleToggleFavori} className="tap" aria-label={estFavori ? "Retirer des favoris" : "Ajouter aux favoris"} style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "9px", backgroundColor: hChip, border: `1px solid ${hChipBrd}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              {Icons.Heart(estFavori)}
            </button>
          </div>
        </header>
        );
      })()}

      {/* BANNIÈRE — courte et large façon bandeau de chaîne YouTube (pas un
          grand visuel qui domine l'écran), uniquement quand une vraie photo
          existe ; le dégradé de secours reste tout aussi petit quand il n'y
          en a pas (retour CEO 24/07/2026 : la première tentative en 230px
          était trop grande). */}
      <div style={{ width: "100%", height: inst.banniere && !imgBanErr ? "120px" : "100px", overflow: "hidden", position: "relative" }}>
        {inst.banniere && !imgBanErr ? (
          <>
            <img src={inst.banniere} alt="" onError={() => setImgBanErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
            <div style={{ position: "absolute", inset: 0, background: isDark ? "linear-gradient(to bottom,transparent 40%,rgba(7,7,22,0.9) 100%)" : "linear-gradient(to bottom,transparent 45%,rgba(242,242,247,0.9) 100%)" }}/>
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", background: isDark ? `linear-gradient(160deg, ${meta.color}12, ${meta.color}06, transparent)` : `linear-gradient(160deg, ${meta.color}08, ${meta.color}03, transparent)` }}/>
        )}
      </div>

      {/* HERO — seul le logo chevauche la bannière (négatif appliqué à lui
          seul, pas à tout le bloc) : le nom/la catégorie restent toujours
          sur fond uni, jamais superposés à une photo chargée où ils
          devenaient illisibles (retour CEO 24/07/2026). */}
      <div style={{ padding: "10px 16px 0", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", marginBottom: "14px" }}>
          <div style={{ marginTop: inst.banniere && !imgBanErr ? "-40px" : "0", flexShrink: 0 }}>
            <InstitutionLogo logo={inst.logo} name={inst.name} secteur={inst.secteur} size={72}/>
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "0 0 3px" }}>
              <h1 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: 0, lineHeight: 1.15, letterSpacing: "-0.5px" }}>{inst.name}</h1>
            </div>
            <div style={{ color: meta.color, fontSize: "11px", fontWeight: "700", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ color: meta.color }}><CatIconComp /></div>
              {inst.secteur ? (SECTEUR_LABELS[inst.secteur] || inst.secteur) : "Non renseigné"}
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
          <span style={{ fontSize: "26px", fontWeight: "900", color: noteMoyenne >= 4 ? "#22c55e" : noteMoyenne >= 3 ? "#F5A623" : "#ef4444", letterSpacing: "-1px" }}>
            {noteMoyenne > 0 ? noteMoyenne.toFixed(1) : "—"}
          </span>
          <Stars note={noteMoyenne} size={14} isDark={isDark}/>
          <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600" }}>({nbAvis} avis)</span>
          {horaireAujd && (
            <span style={{ background: ouvert ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${ouvert ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, color: ouvert ? "#22c55e" : "#ef4444", fontSize: "9px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px" }}>
              {ouvert ? "● OUVERT" : "● FERMÉ"}
            </span>
          )}
          {annonces.length > 0 && (
            <span style={{ background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", color: "#F5A623", fontSize: "9px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
              <Icons.Announce /> {annonces.length} annonce{annonces.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* CTA */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
          <Link href={`/rdv/${inst.id}`} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px 12px", borderRadius: "14px", textDecoration: "none", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
            <Icons.Cal /> Prendre RDV
          </Link>
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "rgba(37,211,102,0.1)", border: "1.5px solid rgba(37,211,102,0.3)", color: "#22c55e", fontWeight: "700", fontSize: "14px", padding: "14px 12px", borderRadius: "14px", textDecoration: "none" }}>
            <Icons.Whatsapp /> WhatsApp
          </a>
        </div>

        {inst.phone && (
          <a href={`tel:${inst.phone}`} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", backgroundColor: inputBg, border: `1px solid ${inputBord}`, color: C.text, fontWeight: "700", fontSize: "14px", padding: "13px", borderRadius: "14px", textDecoration: "none", marginBottom: "6px" }}>
            <Icons.Phone />
            <span style={{ color: "#22c55e" }}>{inst.phone}</span>
            <span style={{ color: C.textSubtle, fontSize: "11px" }}>· Appeler</span>
          </a>
        )}
      </div>

      {/* STATS */}
      <div style={{ overflowX: "auto", padding: "4px 16px 0" }}>
        <div style={{ display: "flex", gap: "8px", paddingBottom: "2px" }}>
          {[
            { label: "Note",     value: noteMoyenne > 0 ? `${noteMoyenne.toFixed(1)}/5` : "—", color: "#F5A623" },
            { label: "Avis",     value: String(nbAvis),                                          color: "#3b82f6" },
            { label: "Services", value: inst.services.length > 0 ? String(inst.services.length) : "—", color: "#22c55e" },
            { label: "Horaires", value: `${inst.horaires.filter(h => h.ouvert).length}/7j`,      color: "#a855f7" },
            ...(inst.annee_creation ? [{ label: "Fondée", value: inst.annee_creation, color: "#06b6d4" }] : []),
          ].map(s => (
            <div key={s.label} style={{ flexShrink: 0, backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "12px", padding: "10px 14px", textAlign: "center", minWidth: "72px" }}>
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
      <div style={{ position: "sticky", top: "calc(52px + env(safe-area-inset-top))", zIndex: 150, backgroundColor: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, marginTop: "16px" }}>
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
            {inst.description && (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}` }}>
                <SectionTitle icon={<Icons.Note />} label="À propos" color={meta.color}/>
                <p style={{ color: C.textMuted, fontSize: "13px", lineHeight: 1.75, margin: 0 }}>{inst.description}</p>
                {inst.langue && inst.langue.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "12px", alignItems: "center" }}>
                    <span style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "600" }}>Langues :</span>
                    {inst.langue.map(l => <span key={l} style={{ background: inputBg, border: `1px solid ${inputBord}`, color: C.text, fontSize: "11px", fontWeight: "600", padding: "3px 10px", borderRadius: "20px" }}>{l}</span>)}
                  </div>
                )}
              </div>
            )}

            <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}` }}>
              <SectionTitle icon={<Icons.Phone />} label="Contacts" color="#22c55e"/>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {inst.adresse && (
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#F5A623" }}><Icons.MapPin /></div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>Adresse</div>
                      <div style={{ color: C.text, fontSize: "13px", fontWeight: "600", lineHeight: 1.4 }}>{inst.adresse}</div>
                      {(inst.quartier || inst.ville) && <div style={{ color: C.textSubtle, fontSize: "11px", marginTop: "2px" }}>{[inst.quartier, inst.ville].filter(Boolean).join(", ")}</div>}
                    </div>
                  </div>
                )}
                {inst.phone && (
                  <a href={`tel:${inst.phone}`} style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(34,197,94,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icons.Phone /></div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>Téléphone</div>
                      <div style={{ color: "#22c55e", fontSize: "14px", fontWeight: "700" }}>{inst.phone}</div>
                    </div>
                  </a>
                )}
                {inst.whatsapp && (
                  <a href={`https://wa.me/${inst.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(34,197,94,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icons.Whatsapp /></div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>WhatsApp</div>
                      <div style={{ color: "#22c55e", fontSize: "14px", fontWeight: "700" }}>{inst.whatsapp}</div>
                    </div>
                  </a>
                )}
                {inst.email && (
                  <a href={`mailto:${inst.email}`} style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: isDark ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icons.Mail /></div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>Email</div>
                      <div style={{ color: "#60a5fa", fontSize: "13px", fontWeight: "600" }}>{inst.email}</div>
                    </div>
                  </a>
                )}
                {inst.site_web && (
                  <a href={inst.site_web} target="_blank" rel="noreferrer" style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icons.Globe /></div>
                    <div>
                      <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "3px" }}>Site web</div>
                      <div style={{ color: "#F5A623", fontSize: "13px", fontWeight: "600" }}>Visiter le site →</div>
                    </div>
                  </a>
                )}
              </div>
            </div>

            {(inst.annee_creation || inst.capacite) && (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}` }}>
                <SectionTitle icon={<Icons.Building />} label="Détails" color="#a855f7"/>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
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

        {/* HORAIRES */}
        <div ref={horairesRef} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "24px", scrollMarginTop: "calc(52px + env(safe-area-inset-top) + 64px)" }}>
            {inst.horaires.length === 0 ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center", border: `1px solid ${C.borderCard}` }}>
                <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}><Icons.Clock /></div>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Horaires non renseignés</p>
                <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Contactez l'institution pour connaître ses horaires.</p>
              </div>
            ) : (
              <>
                <div style={{ backgroundColor: ouvert ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${ouvert ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, borderRadius: "14px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: ouvert ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: ouvert ? "#22c55e" : "#ef4444" }}/>
                  </div>
                  <div>
                    <div style={{ color: ouvert ? "#22c55e" : "#ef4444", fontSize: "14px", fontWeight: "800" }}>{ouvert ? "Ouvert maintenant" : "Fermé maintenant"}</div>
                    {horaireAujd && <div style={{ color: C.textSubtle, fontSize: "12px" }}>{jourAujd} · {formatHoraire(horaireAujd)}</div>}
                  </div>
                </div>
                <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden", border: `1px solid ${C.borderCard}` }}>
                  {inst.horaires.map((h, i) => {
                    const isToday = h.jour.toLowerCase() === jourAujd.toLowerCase();
                    return (
                      <div key={h.jour} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < inst.horaires.length - 1 ? `1px solid ${C.borderSubtle}` : "none", backgroundColor: isToday ? (isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)") : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {isToday && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F5A623", flexShrink: 0 }}/>}
                          <span style={{ color: isToday ? "#F5A623" : C.text, fontSize: "14px", fontWeight: isToday ? "800" : "600" }}>{h.jour}</span>
                          {isToday && <span style={{ background: "rgba(245,166,35,0.12)", color: "#F5A623", fontSize: "9px", fontWeight: "800", padding: "1px 6px", borderRadius: "10px" }}>Aujourd'hui</span>}
                        </div>
                        <span style={{ color: h.ouvert ? C.text : C.textSubtle, fontSize: "13px", fontWeight: h.ouvert ? "700" : "500", fontStyle: h.ouvert ? "normal" : "italic" }}>{formatHoraire(h)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
        </div>

        {/* SERVICES */}
        <div ref={servicesRef} style={{ marginTop: "24px", scrollMarginTop: "calc(52px + env(safe-area-inset-top) + 64px)" }}>
            {inst.services.length === 0 ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center", border: `1px solid ${C.borderCard}` }}>
                <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}><Icons.Note /></div>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Services non renseignés</p>
                <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Contactez l'institution pour connaître ses services.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {inst.services.map((s, i) => (
                  <Link key={`${s}-${i}`} href={`/rdv/${inst.id}?service=${encodeURIComponent(s)}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 16px", textDecoration: "none", border: `1px solid ${C.borderCard}`, animation: `fadeUp 0.2s ease ${i * 0.03}s both` }} className="tap">
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

        {/* AVIS — résumé compact façon Booking ("8.3 Very Good — Voir les
            avis détaillés →") ; le contenu riche (histogramme, liste des
            avis) est désormais dans le plein écran ReviewsModal plutôt que
            mélangé au scroll principal, sur demande explicite du 24/07/2026. */}
        <div style={{ marginTop: "24px" }}>
          <button onClick={() => setReviewsOpen(true)} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "16px", backgroundColor: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}`, cursor: "pointer" }}>
            <div style={{ background: noteMoyenne >= 4 ? "#22c55e" : noteMoyenne >= 3 ? "#F5A623" : "#ef4444", color: "#fff", fontWeight: "900", fontSize: "16px", borderRadius: "10px", padding: "8px 11px", flexShrink: 0, lineHeight: 1 }}>
              {noteMoyenne > 0 ? noteMoyenne.toFixed(1) : "—"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.text, fontWeight: "800", fontSize: "14px", marginBottom: "2px" }}>
                {noteMoyenne >= 4.5 ? "Excellent" : noteMoyenne >= 4 ? "Très bien" : noteMoyenne >= 3 ? "Bien" : noteMoyenne > 0 ? "À améliorer" : "Aucun avis"}
              </div>
              <div style={{ color: C.textSubtle, fontSize: "12px" }}>{nbAvis > 0 ? `Voir les ${nbAvis} avis détaillés` : "Soyez le premier à laisser un avis"}</div>
            </div>
            <span style={{ color: C.textSubtle, flexShrink: 0 }}><Icons.Chevron /></span>
          </button>
        </div>

        {/* QUESTIONS DES CITOYENS — façon Booking "Travelers are asking" :
            questions publiques posées avant un RDV (pas la messagerie liée
            à un RDV). Affiché si au moins une question répondue existe, ou
            si le citoyen connecté a lui-même une question en attente. */}
        {(questionsRepondues.length > 0 || mesQuestions.length > 0) && (
          <div style={{ marginTop: "24px" }}>
            <SectionTitle icon={<Icons.Comment />} label="Questions des citoyens" color="#60a5fa"/>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {mesQuestions.filter(q => !q.reponse).map(q => (
                <div key={q.id} style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 15px", border: `1px solid ${C.borderCard}` }}>
                  <p style={{ color: C.text, fontSize: "13px", fontWeight: "700", margin: "0 0 6px", lineHeight: 1.5 }}>{q.question}</p>
                  <span style={{ color: "#60a5fa", fontSize: "11px", fontWeight: "700" }}>En attente de réponse de l&apos;établissement</span>
                </div>
              ))}
              {questionsRepondues.slice(0, 3).map(q => (
                <div key={q.id} style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 15px", border: `1px solid ${C.borderCard}` }}>
                  <p style={{ color: C.text, fontSize: "13px", fontWeight: "700", margin: "0 0 8px", lineHeight: 1.5 }}>{q.question}</p>
                  <div style={{ backgroundColor: C.pageBg, borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", marginBottom: "3px" }}>
                      Réponse de l&apos;établissement{q.reponse_le ? ` · ${new Date(q.reponse_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
                    </div>
                    <p style={{ color: C.textMuted, fontSize: "12.5px", margin: 0, lineHeight: 1.55 }}>{q.reponse}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              {questionsRepondues.length > 3 && (
                <button onClick={() => setQuestionsListOpen(true)} className="tap" style={{ flex: 1, background: "transparent", border: `1px solid ${C.borderCard}`, borderRadius: "12px", padding: "11px", color: C.textSubtle, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>
                  Voir toutes les questions ({questionsRepondues.length})
                </button>
              )}
              <button onClick={ouvrirPoserQuestion} className="tap" style={{ flex: 1, background: "transparent", border: "1px solid #60a5fa50", borderRadius: "12px", padding: "11px", color: "#60a5fa", fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>
                Poser une question
              </button>
            </div>
          </div>
        )}
        {questionsRepondues.length === 0 && mesQuestions.length === 0 && (
          <div style={{ marginTop: "24px" }}>
            <SectionTitle icon={<Icons.Comment />} label="Questions des citoyens" color="#60a5fa"/>
            <button onClick={ouvrirPoserQuestion} className="tap" style={{ width: "100%", background: C.cardBg, border: `1px dashed ${C.borderCard}`, borderRadius: "14px", padding: "16px", color: C.textSubtle, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
              Soyez le premier à poser une question à cet établissement
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
                <p style={{ color: "#3b82f6", fontSize: "11px", fontWeight: "700", margin: 0 }}>Certifié par l'équipe Yelen</p>
              </div>
            </div>
            <p style={{ color: C.textMuted, fontSize: "13px", lineHeight: 1.7, margin: 0 }}>
              L'identité et les documents officiels de cet établissement ont été contrôlés par l'équipe Yelen avant sa mise en ligne sur la plateforme.
            </p>
          </div>
        )}

        {/* FAQ — questions génériques sur le fonctionnement de Yelen
            (réservation, annulation, avis, confidentialité), pas de
            contenu spécifique à l'institution inventé (retour CEO
            24/07/2026, "un FAQ moderne et explicite après les avis"). */}
        <div style={{ marginTop: "24px" }}>
          <SectionTitle icon={<Icons.Info />} label="Questions fréquentes" color="#3b82f6"/>
          <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden", border: `1px solid ${C.borderCard}` }}>
            {FAQ_FICHE.map((f, i) => {
              const ouverte = faqOuverte === i;
              return (
                <div key={f.q} style={{ borderBottom: i < FAQ_FICHE.length - 1 ? `1px solid ${C.borderSubtle}` : "none" }}>
                  <button onClick={() => setFaqOuverte(ouverte ? null : i)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "transparent", border: "none", padding: "14px 16px", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ color: C.text, fontSize: "13.5px", fontWeight: "700" }}>{f.q}</span>
                    <span style={{ color: C.textSubtle, flexShrink: 0, transform: ouverte ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}><Icons.Chevron /></span>
                  </button>
                  {ouverte && (
                    <div style={{ padding: "0 16px 16px" }}>
                      <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.65, margin: 0 }}>{f.r}</p>
                    </div>
                  )}
                </div>
              );
            })}
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
                    <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: 0 }}>Comment on s'en sort ?</h3>
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
                <p style={{ color: C.text, fontSize: "13.5px", fontWeight: "700", margin: "0 0 4px", lineHeight: 1.5 }}>Qu'est-ce qui aurait pu rendre votre expérience meilleure aujourd'hui ?</p>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setReviewsOpen(false)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Avis</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Résumé note */}
            <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "18px", border: `1px solid ${C.borderCard}`, display: "flex", alignItems: "center", gap: "20px" }}>
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
            <div style={{ background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "12px", padding: "11px 13px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ color: "#3b82f6", flexShrink: 0 }}><Icons.Lock /></span>
              <span style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.55 }}>Seuls les citoyens ayant effectué un rendez-vous peuvent laisser un avis. Les avis vérifiés sont marqués d'un badge.</span>
            </div>

            {/* ✅ Liste des avis — tous affichés */}
            {avis.length > 0 ? (
              avis.map((a, i) => (
                <div key={a.id} style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 15px", border: `1px solid ${C.borderCard}`, animation: `fadeUp 0.2s ease ${i * 0.04}s both` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(135deg,rgba(245,166,35,0.2),rgba(245,166,35,0.08))", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "900", color: "#F5A623", flexShrink: 0 }}>
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
                    <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.65, margin: "0 0 8px", fontStyle: "italic" }}>"{a.commentaire}"</p>
                  )}

                  {a.reponse_institution && (
                    <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "10px", padding: "8px 10px", marginBottom: "8px" }}>
                      <div style={{ color: "#F5A623", fontSize: "10.5px", fontWeight: "800", marginBottom: "3px" }}>
                        Réponse de l'établissement{a.reponse_le ? ` · ${new Date(a.reponse_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}` : ""}
                      </div>
                      <div style={{ color: C.textMuted, fontSize: "12px", lineHeight: 1.5 }}>{a.reponse_institution}</div>
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
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center", border: `1px solid ${C.borderCard}` }}>
                <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}>{Icons.Star(false)}</div>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Aucun avis pour le moment</p>
                <p style={{ color: C.textSubtle, fontSize: "12px", margin: "0 0 16px" }}>Prenez rendez-vous pour être le premier à laisser un avis.</p>
                <Link href={`/rdv/${inst.id}`} style={{ display: "inline-block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "13px", padding: "10px 20px", borderRadius: "12px", textDecoration: "none" }}>Prendre rendez-vous</Link>
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
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0", flexShrink: 0 }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                <button onClick={() => setCommentsOpenId(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>{a.titre}</div>
                <div/>
              </div>
            </header>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {liste.length === 0 ? (
                <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center", border: `1px solid ${C.borderCard}` }}>
                  <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}><Icons.Comment/></div>
                  <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Aucun commentaire pour l'instant</p>
                  <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Soyez le premier à réagir à cette annonce.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {liste.map(c => (
                    <div key={c.id} style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "12px 14px", border: `1px solid ${C.borderCard}` }}>
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

            <div style={{ position: "sticky", bottom: 0, flexShrink: 0, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderTop: `1px solid ${C.borderCard}`, padding: `10px 16px calc(10px + env(safe-area-inset-bottom))`, display: "flex", gap: "8px" }}>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setDetailOpenId(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
          POSER UNE QUESTION — plein écran, façon Booking "Ask a
          question". Limite 2 questions/citoyen/établissement affichée
          avant envoi (le vrai garde-fou est le trigger serveur sur
          questions_institution).
      ══════════════════════════════════════════════════════ */}
      {askOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setAskOpen(false)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Poser une question</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 16px" }}>
            {mesQuestions.length >= 2 ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "22px", border: `1px solid ${C.borderCard}`, textAlign: "center" }}>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 8px" }}>Vous avez déjà posé 2 questions à cet établissement</p>
                <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 18px" }}>Prenez rendez-vous pour continuer à échanger directement avec l&apos;établissement.</p>
                <Link href={`/rdv/${inst?.id}`} style={{ display: "inline-block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "13px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>Prendre rendez-vous</Link>
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
          TOUTES LES QUESTIONS — plein écran (même logique que Avis/
          Commentaires/Détail annonce ci-dessus).
      ══════════════════════════════════════════════════════ */}
      {questionsListOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setQuestionsListOpen(false)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Questions des citoyens</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {questionsRepondues.map(q => (
              <div key={q.id} style={{ backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 15px", border: `1px solid ${C.borderCard}` }}>
                <p style={{ color: C.text, fontSize: "13px", fontWeight: "700", margin: "0 0 8px", lineHeight: 1.5 }}>{q.question}</p>
                <div style={{ backgroundColor: C.pageBg, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", marginBottom: "3px" }}>
                    Réponse de l&apos;établissement{q.reponse_le ? ` · ${new Date(q.reponse_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
                  </div>
                  <p style={{ color: C.textMuted, fontSize: "12.5px", margin: 0, lineHeight: 1.55 }}>{q.reponse}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PLUS D'INFORMATIONS — façon Booking (Property Policies/Important
          details/Legal information), remplace l'ancien footer de la fiche
          (déplacé dans app/page.tsx, onglet Accueil). */}
      <div style={{ margin: "24px 16px 0" }}>
        <SectionTitle icon={<Icons.Note />} label="Plus d'informations" color="#a855f7"/>
        <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden", border: `1px solid ${C.borderCard}` }}>
          {[
            { key: "conditions" as const, label: "Conditions de l'entreprise" },
            { key: "importantes" as const, label: "Informations importantes" },
            { key: "legales" as const, label: "Informations légales" },
          ].map((s, i, arr) => (
            <button key={s.key} onClick={() => setInfoOpen(s.key)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "none", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${C.borderCard}` : "none", padding: "15px 16px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ color: C.text, fontSize: "13.5px", fontWeight: "700" }}>{s.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          POPUP CONDITIONS/INFORMATIONS/LÉGALES — même logique que Avis/
          Commentaires/Questions ci-dessus.
      ══════════════════════════════════════════════════════ */}
      {infoOpen && (() => {
        const meta = {
          conditions: {
            titre: "Conditions de l'entreprise", texte: inst?.conditions_entreprise, date: inst?.conditions_entreprise_le, color: "#a855f7",
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l2 2 4-4"/><path d="M20 12a8 8 0 1 1-3.5-6.6"/></svg>,
          },
          importantes: {
            titre: "Informations importantes", texte: inst?.informations_importantes, date: inst?.informations_importantes_le, color: "#60a5fa",
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
          },
          legales: {
            titre: "Informations légales", texte: inst?.informations_legales, date: inst?.informations_legales_le, color: "#94a3b8",
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z"/></svg>,
          },
        }[infoOpen];
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                <button onClick={() => setInfoOpen(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div/>
                <div/>
              </div>
            </header>
            <div style={{ padding: "8px 20px 24px", maxWidth: "560px", margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: `${meta.color}18`, border: `1px solid ${meta.color}35`, display: "flex", alignItems: "center", justifyContent: "center", color: meta.color }}>
                  {meta.icon}
                </div>
              </div>
              <h1 style={{ color: C.text, fontSize: "19px", fontWeight: "900", textAlign: "center", margin: "0 0 20px", letterSpacing: "-0.3px" }}>{meta.titre}</h1>
              {meta.texte ? (
                <div style={{ backgroundColor: C.cardBg, borderRadius: "18px", padding: "22px 20px", border: `1px solid ${C.borderCard}` }}>
                  <p style={{ color: C.textMuted, fontSize: "14.5px", lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>{meta.texte}</p>
                  <p style={{ color: C.textFaint, fontSize: "11px", margin: "16px 0 0", paddingTop: "14px", borderTop: `1px solid ${C.borderCard}` }}>
                    Écrit par {inst?.name}{meta.date ? ` · mis à jour le ${new Date(meta.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}` : ""}
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
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 240, backgroundColor: C.cardBg, borderRadius: "22px 22px 0 0", boxShadow: isDark ? "0 -10px 32px rgba(0,0,0,0.55)" : "0 -10px 32px rgba(0,0,0,0.14)", padding: `14px 16px calc(14px + env(safe-area-inset-bottom))`, transform: `translateY(${ctaVisible ? "0" : "110%"})`, transition: "transform 0.3s ease" }}>
        <Link href={`/rdv/${inst.id}`} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "14px", textDecoration: "none", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
          <Icons.Cal /> Prendre RDV
        </Link>
      </div>

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

export default function InstitutionProfilePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "32px", height: "32px", border: "3px solid rgba(245,166,35,0.2)", borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <InstitutionProfilePageInner/>
    </Suspense>
  );
}