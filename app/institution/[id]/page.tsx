"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { type Horaire, JOURS_SEMAINE, parseHoraires, isOuvertNow } from "@/lib/horaires";
import { SECTEUR_LABELS, SECTEUR_META } from "@/lib/secteurs";

// ─── Types ────────────────────────────────────────────────────────────────────
type Annonce = { id: string; titre: string; contenu: string; type: string; format: string; media_urls: string[] | null; epingle: boolean; image_url: string | null; created_at: string; date_expiration: string | null };
type Avis    = { id: string; citoyen_id: string; titre: string | null; note: number; commentaire: string | null; reponse_institution: string | null; reponse_le: string | null; created_at: string; nom: string; rdv_confirmed: boolean; utile_count: number };
type Commentaire = { id: string; annonce_id: string; contenu: string; citoyen_id: string; citoyen_nom: string | null; created_at: string };
type Institution = {
  id: string; name: string; category: string; secteur: string | null; description: string;
  adresse: string; ville: string; quartier: string;
  phone: string; whatsapp?: string; email?: string; site_web?: string;
  logo?: string | null; banniere?: string | null;
  moyenne_avis: number; nb_avis: number; badge_verifie: boolean;
  horaires: Horaire[]; services: string[];
  annee_creation?: string; capacite?: string; langue?: string[];
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
function parseArr(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String).filter(Boolean) : []; }
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

// ─── Page principale ──────────────────────────────────────────────────────────
export default function InstitutionProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  const [inst, setInst]         = useState<Institution | null>(null);
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [avis, setAvis]         = useState<Avis[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<"info"|"horaires"|"services"|"avis">("info");
  const [imgBanErr, setImgBanErr] = useState(false);
  // Lot E2 (engagement citoyen, 16/07/2026)
  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [likesCount, setLikesCount] = useState<Record<string, number>>({});
  const [mesLikes, setMesLikes] = useState<Set<string>>(new Set());
  const [mesUtile, setMesUtile] = useState<Set<string>>(new Set());
  // Chantier Favoris citoyen (18/07/2026)
  const [estFavori, setEstFavori] = useState(false);
  // Lot E3 (engagement citoyen, commentaires, 16/07/2026)
  const [commentaires, setCommentaires] = useState<Record<string, Commentaire[]>>({});
  const [commentairesOuverts, setCommentairesOuverts] = useState<Set<string>>(new Set());
  const [nouveauCommentaire, setNouveauCommentaire] = useState<Record<string, string>>({});
  const [envoiCommentaire, setEnvoiCommentaire] = useState<string | null>(null);

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

      const annRes = await fetch(`/api/annonces-publiques?institution_id=${id}`).then(r => r.json()).catch(() => ({ annonces: [] }));
      const annoncesData: Annonce[] = annRes.annonces ?? [];
      setAnnonces(annoncesData);

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
    if (error) setEstFavori(wasFavori);
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

  const toggleCommentaires = (annonceId: string) => {
    setCommentairesOuverts(prev => {
      const s = new Set(prev);
      if (s.has(annonceId)) s.delete(annonceId); else s.add(annonceId);
      return s;
    });
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
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Bonjour, je souhaite des informations sur ${inst.name} via YELEN224.`)}`;

  const inputBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBord = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  // Calcul note moyenne depuis les avis récupérés (source de vérité)
  const noteMoyenne = avis.length > 0 ? avis.reduce((acc, a) => acc + a.note, 0) / avis.length : inst.moyenne_avis;
  const nbAvis = avis.length > 0 ? avis.length : inst.nb_avis;

  const TABS = [
    { key: "info",      label: "Info",      icon: <Icons.Info /> },
    { key: "horaires",  label: "Horaires",  icon: <Icons.Clock /> },
    { key: "services",  label: "Services",  icon: <Icons.Note />,  count: inst.services.length },
    { key: "avis",      label: "Avis",      icon: Icons.Star(true), count: nbAvis },
  ] as { key: typeof activeTab; label: string; icon: React.ReactNode; count?: number }[];

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, color: C.text, paddingBottom: "32px", transition: "background-color 0.3s ease" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .tap{transition:opacity 0.1s,transform 0.1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:0.7;transform:scale(0.97)}
        a{-webkit-tap-highlight-color:transparent}
      `}</style>

      {/* HEADER — même bandeau doré que les écrans Compte, façon Booking.
          Mode sombre volontairement inchangé. */}
      {(() => {
        const hBg      = isDark ? "rgba(7,7,22,0.97)" : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
        const hText    = isDark ? C.text : "#080812";
        const hSub     = isDark ? C.textSubtle : "rgba(8,8,18,0.65)";
        const hChip    = isDark ? inputBg : "#F5A623";
        const hChipBrd = isDark ? inputBord : "transparent";
        const hIcon    = isDark ? C.text : "#fff";
        const hShadow  = isDark ? "none" : "0 2px 8px rgba(245,166,35,0.35)";
        return (
        <header style={{ position: "sticky", top: 0, zIndex: 200, background: hBg, backdropFilter: isDark ? "blur(20px)" : "none", WebkitBackdropFilter: isDark ? "blur(20px)" : "none", borderBottom: isDark ? `1px solid ${C.borderCard}` : "none", padding: "0 16px" }}>
          {/* Grille 1fr/auto/1fr (au lieu de space-between) — le titre
              reste centré même si le bloc "Retour" (icône+texte) est plus
              large que la colonne de droite, vide. */}
          <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
            <Link href="/recherche" className="tap" style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: hText, minWidth: 0 }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "9px", backgroundColor: hChip, border: `1px solid ${hChipBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", color: hIcon, flexShrink: 0 }}>
                <Icons.Back />
              </div>
              <span style={{ color: hSub, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap" }}>Retour</span>
            </Link>
            <div style={{ minWidth: 0, maxWidth: "180px", textAlign: "center" }}>
              <div style={{ color: hText, fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst.name}</div>
            </div>
            <div/>
          </div>
        </header>
        );
      })()}

      {/* BANNIÈRE — bouton favori flottant façon Airbnb/Booking (au lieu
          du header), visible que la bannière soit une vraie image ou le
          dégradé de secours. */}
      <div style={{ width: "100%", height: inst.banniere && !imgBanErr ? "180px" : "100px", overflow: "hidden", position: "relative" }}>
        {inst.banniere && !imgBanErr ? (
          <>
            <img src={inst.banniere} alt="" onError={() => setImgBanErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
            <div style={{ position: "absolute", inset: 0, background: isDark ? "linear-gradient(to bottom,transparent 40%,rgba(7,7,22,0.9) 100%)" : "linear-gradient(to bottom,transparent 50%,rgba(242,242,247,0.9) 100%)" }}/>
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", background: isDark ? `linear-gradient(160deg, ${meta.color}12, ${meta.color}06, transparent)` : `linear-gradient(160deg, ${meta.color}08, ${meta.color}03, transparent)` }}/>
        )}
        <button onClick={handleToggleFavori} className="tap" aria-label={estFavori ? "Retirer des favoris" : "Ajouter aux favoris"} style={{ position: "absolute", top: "14px", right: "14px", width: "38px", height: "38px", borderRadius: "50%", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {Icons.Heart(estFavori)}
        </button>
      </div>

      {/* HERO */}
      <div style={{ padding: "0 16px", marginTop: inst.banniere && !imgBanErr ? "-48px" : "-20px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", marginBottom: "14px" }}>
          <InstitutionLogo logo={inst.logo} name={inst.name} secteur={inst.secteur} size={72}/>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: "4px" }}>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "6px" }}>
              {inst.badge_verifie && (
                <span style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <Icons.Shield /> VÉRIFIÉ
                </span>
              )}
            </div>
            <h1 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 3px", lineHeight: 1.15, letterSpacing: "-0.5px" }}>{inst.name}</h1>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {annonces.map(a => {
              const t = ANNONCE_TYPES[a.type] || ANNONCE_TYPES.information;
              return (
                <div key={a.id} style={{ backgroundColor: C.cardBg, borderRadius: "16px", overflow: "hidden", border: `1px solid ${t.border}`, borderLeft: `3px solid ${t.color}` }}>
                  {a.image_url ? (
                    <div style={{ width: "100%", height: "120px", overflow: "hidden" }}>
                      <img src={a.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}/>
                    </div>
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
                    <p style={{ color: C.textMuted, fontSize: "12px", lineHeight: 1.65, margin: 0 }}>{a.contenu}</p>
                    {a.date_expiration && (
                      <p style={{ color: C.textSubtle, fontSize: "10px", margin: "6px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Icons.Clock /> Expire le {new Date(a.date_expiration).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                    {a.format === "pdf" && a.media_urls?.[0] && (
                      <a href={a.media_urls[0]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#ef4444", fontSize: "11px", fontWeight: "700", textDecoration: "none", marginTop: "8px" }}>
                        <Icons.Note /> Ouvrir le PDF
                      </a>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                      <button onClick={() => handleToggleLike(a.id)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: mesLikes.has(a.id) ? "rgba(239,68,68,0.1)" : "transparent", border: `1px solid ${mesLikes.has(a.id) ? "rgba(239,68,68,0.3)" : C.borderCard}`, borderRadius: "20px", padding: "5px 12px", cursor: "pointer" }}>
                        {Icons.Heart(mesLikes.has(a.id))}
                        <span style={{ color: mesLikes.has(a.id) ? "#ef4444" : C.textSubtle, fontSize: "11px", fontWeight: "700" }}>{likesCount[a.id] ?? 0}</span>
                      </button>
                      <button onClick={() => toggleCommentaires(a.id)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: commentairesOuverts.has(a.id) ? "rgba(96,165,250,0.1)" : "transparent", border: `1px solid ${commentairesOuverts.has(a.id) ? "rgba(96,165,250,0.3)" : C.borderCard}`, borderRadius: "20px", padding: "5px 12px", cursor: "pointer", color: commentairesOuverts.has(a.id) ? "#60a5fa" : C.textSubtle }}>
                        <Icons.Comment/>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>{(commentaires[a.id] ?? []).length}</span>
                      </button>
                    </div>

                    {commentairesOuverts.has(a.id) && (
                      <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${C.borderCard}` }}>
                        {(commentaires[a.id] ?? []).length === 0 ? (
                          <p style={{ color: C.textSubtle, fontSize: "11.5px", margin: "0 0 8px" }}>Aucun commentaire pour l'instant.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
                            {(commentaires[a.id] ?? []).map(c => (
                              <div key={c.id} style={{ backgroundColor: C.pageBg, borderRadius: "10px", padding: "8px 10px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                                  <span style={{ color: C.text, fontSize: "11.5px", fontWeight: "700" }}>{c.citoyen_id === citoyenId ? "Vous" : (c.citoyen_nom || "Citoyen")}</span>
                                  <span style={{ color: C.textFaint, fontSize: "10px", flexShrink: 0 }}>{new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                                </div>
                                <p style={{ color: C.textMuted, fontSize: "12px", margin: "3px 0 0", lineHeight: 1.5 }}>{c.contenu}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "8px" }}>
                          <input
                            value={nouveauCommentaire[a.id] ?? ""}
                            onChange={e => setNouveauCommentaire(prev => ({ ...prev, [a.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") handleSubmitComment(a.id); }}
                            placeholder={citoyenId ? "Ajouter un commentaire…" : "Connectez-vous pour commenter"}
                            style={{ flex: 1, backgroundColor: C.pageBg, border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "8px 12px", color: C.text, fontSize: "12px", fontFamily: "inherit" }}
                          />
                          <button
                            onClick={() => handleSubmitComment(a.id)}
                            disabled={envoiCommentaire === a.id || !(nouveauCommentaire[a.id] ?? "").trim()}
                            className="tap"
                            style={{ backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "10px", padding: "8px 16px", fontSize: "12px", fontWeight: "700", cursor: "pointer", opacity: envoiCommentaire === a.id ? 0.6 : 1 }}
                          >
                            Envoyer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TABS NAV */}
      <div style={{ position: "sticky", top: "52px", zIndex: 150, backgroundColor: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, marginTop: "16px" }}>
        <div style={{ overflowX: "auto", padding: "0 16px" }}>
          <div style={{ display: "flex", gap: "2px" }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="tap"
                style={{
                  flexShrink: 0, padding: "12px 14px", border: "none", cursor: "pointer",
                  background: "transparent", borderBottom: activeTab === tab.key ? `2px solid #F5A623` : "2px solid transparent",
                  color: activeTab === tab.key ? "#F5A623" : C.textSubtle,
                  fontSize: "13px", fontWeight: activeTab === tab.key ? "800" : "600",
                  display: "flex", alignItems: "center", gap: "5px",
                  transition: "color 0.15s, border-color 0.15s",
                  marginBottom: "-1px",
                }}
              >
                <span style={{ opacity: 0.8 }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span style={{ background: activeTab === tab.key ? "rgba(245,166,35,0.15)" : inputBg, color: activeTab === tab.key ? "#F5A623" : C.textSubtle, fontSize: "10px", fontWeight: "800", padding: "1px 6px", borderRadius: "10px" }}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENU TABS */}
      <div style={{ padding: "16px 16px 0", animation: "fadeUp 0.2s ease" }}>

        {/* TAB INFO */}
        {activeTab === "info" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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

            {/* Badge Guinée */}
            <div style={{ background: "rgba(206,17,38,0.06)", border: "1px solid rgba(206,17,38,0.18)", borderRadius: "14px", padding: "14px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: "1px", flexShrink: 0, marginTop: "2px" }}>
                <div style={{ width: "8px", height: "14px", backgroundColor: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
                <div style={{ width: "8px", height: "14px", backgroundColor: "#FCD20F" }}/>
                <div style={{ width: "8px", height: "14px", backgroundColor: "#009A44", borderRadius: "0 2px 2px 0" }}/>
              </div>
              <div>
                <div style={{ color: isDark ? "#fca5a5" : "#dc2626", fontSize: "12px", fontWeight: "800", marginBottom: "4px" }}>Accessible en ambassade</div>
                <div style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.55 }}>Disponible depuis toutes les représentations diplomatiques guinéennes à l'étranger.</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB HORAIRES */}
        {activeTab === "horaires" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
        )}

        {/* TAB SERVICES */}
        {activeTab === "services" && (
          <div>
            {inst.services.length === 0 ? (
              <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", padding: "40px 20px", textAlign: "center", border: `1px solid ${C.borderCard}` }}>
                <div style={{ color: C.textSubtle, marginBottom: "10px", display: "flex", justifyContent: "center" }}><Icons.Note /></div>
                <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Services non renseignés</p>
                <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>Contactez l'institution pour connaître ses services.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {inst.services.map((s, i) => (
                  <Link key={s} href={`/rdv/${inst.id}?service=${encodeURIComponent(s)}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", backgroundColor: C.cardBg, borderRadius: "14px", padding: "14px 16px", textDecoration: "none", border: `1px solid ${C.borderCard}`, animation: `fadeUp 0.2s ease ${i * 0.03}s both` }} className="tap">
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
        )}

        {/* ✅ TAB AVIS — affiche TOUS les avis de la DB */}
        {activeTab === "avis" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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
        )}
      </div>

      {/* FOOTER */}
      <div style={{ margin: "24px 16px 0", padding: "16px", backgroundColor: C.cardBg, borderRadius: "16px", border: `1px solid ${C.borderCard}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center", marginBottom: "10px" }}>
          <div style={{ display: "flex", gap: "1px" }}>
            <div style={{ width: "14px", height: "9px", backgroundColor: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
            <div style={{ width: "14px", height: "9px", backgroundColor: "#FCD20F" }}/>
            <div style={{ width: "14px", height: "9px", backgroundColor: "#009A44", borderRadius: "0 2px 2px 0" }}/>
          </div>
          <span style={{ color: C.textSubtle, fontSize: "10px", marginLeft: "8px", fontWeight: "700" }}>YELEN224 · République de Guinée</span>
        </div>
        <div style={{ textAlign: "center", marginBottom: "10px" }}>
          <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <span style={{ backgroundColor: "#FE2C55", color: "#fff", fontSize: "10px", fontWeight: "800", padding: "3px 10px", borderRadius: "7px", letterSpacing: "0.5px" }}>SEMPYA224</span>
          </a>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
          <Link href="/cgu" style={{ color: C.textSubtle, fontSize: "11px", textDecoration: "none" }}>CGU</Link>
          <Link href="/confidentialite" style={{ color: C.textSubtle, fontSize: "11px", textDecoration: "none" }}>Confidentialité</Link>
          <Link href="/contact" style={{ color: C.textSubtle, fontSize: "11px", textDecoration: "none" }}>Contact</Link>
        </div>
      </div>
    </div>
  );
}