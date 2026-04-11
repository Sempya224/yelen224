"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { T } from "@/lib/theme";

// ─── Types ────────────────────────────────────────────────────────────────────
type Horaire = { jour: string; ouvert: boolean; debut: string; fin: string; heures?: string };
type Annonce = { id: string; titre: string; contenu: string; type: string; epingle: boolean; image_url: string | null; created_at: string; date_expiration: string | null };
type Avis    = { id: string; note: number; commentaire: string | null; created_at: string; nom: string; rdv_confirmed: boolean };
type Institution = {
  id: string; name: string; category: string; description: string;
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

const CAT_META: Record<string, { color: string }> = {
  "Hopital / Clinique":      { color: "#ef4444" },
  "Ecole / Universite":      { color: "#3b82f6" },
  "Mairie / Administration": { color: "#F5A623" },
  "Banque / Microfinance":   { color: "#22c55e" },
  "Pharmacie":               { color: "#a855f7" },
  "Cabinet medical":         { color: "#f97316" },
  "Tribunal / Justice":      { color: "#f43f5e" },
  "Transport / Logistique":  { color: "#06b6d4" },
  "ONG / Association":       { color: "#14b8a6" },
  "Autre":                   { color: "#8b5cf6" },
};

const JOURS_SEMAINE = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];

// ─── SVG Icons (plus d'emojis) ────────────────────────────────────────────────
const Icons = {
  Pin:      () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Back:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>,
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
};

const CAT_ICON: Record<string, () => React.ReactElement> = {
  "Hopital / Clinique":      Icons.CatHealth,
  "Ecole / Universite":      Icons.CatEdu,
  "Mairie / Administration": Icons.CatAdmin,
  "Banque / Microfinance":   Icons.CatBank,
  "Pharmacie":               Icons.CatPharma,
  "Cabinet medical":         Icons.CatHealth,
  "Tribunal / Justice":      Icons.Flag,
  "Transport / Logistique":  Icons.Globe,
  "ONG / Association":       Icons.Users,
  "Autre":                   Icons.Building,
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

function parseHoraires(v: unknown): Horaire[] {
  if (!v) return [];
  let raw = v;
  if (typeof v === "string") { try { raw = JSON.parse(v); } catch { return []; } }
  if (!Array.isArray(raw)) return [];
  return (raw as any[]).map(item => {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, any>;
    if ("ouvert" in o) return { jour: String(o.jour || ""), ouvert: Boolean(o.ouvert), debut: String(o.debut || ""), fin: String(o.fin || "") };
    const jour = String(o.jour || o.day || "").trim();
    const heures = String(o.heures || o.hours || "").trim();
    if (!jour) return null;
    return { jour, ouvert: !heures.toLowerCase().includes("ferm") && heures !== "", debut: "", fin: "", heures };
  }).filter((i): i is Horaire => i !== null);
}

function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
}

function isOuvertNow(horaires: Horaire[]): { ouvert: boolean; horaire: Horaire | null } {
  const now = new Date();
  const jourNom = JOURS_SEMAINE[now.getDay()];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const h = horaires.find(x => x.jour.toLowerCase() === jourNom.toLowerCase());
  if (!h || !h.ouvert) return { ouvert: false, horaire: h || null };
  if (h.debut && h.fin) {
    const [dh, dm] = h.debut.split(":").map(Number);
    const [fh, fm] = h.fin.split(":").map(Number);
    return { ouvert: minutes >= dh * 60 + dm && minutes <= fh * 60 + fm, horaire: h };
  }
  return { ouvert: true, horaire: h };
}

function formatHoraire(h: Horaire): string {
  if (!h.ouvert) return "Fermé";
  if (h.debut && h.fin) return `${h.debut} – ${h.fin}`;
  if (h.heures) return h.heures;
  return "Ouvert";
}

// ─── Logo institution ─────────────────────────────────────────────────────────
function InstitutionLogo({ logo, name, category, size = 64 }: { logo?: string | null; name: string; category: string; size?: number }) {
  const [err, setErr] = useState(false);
  const meta = CAT_META[category] || { color: "#F5A623" };
  const CatIconComp = CAT_ICON[category] || Icons.Building;
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

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: row } = await supabase.from("institutions").select("*").eq("id", id).maybeSingle();
      if (!row) { setLoading(false); return; }
      const r = row as Record<string, any>;
      setInst({
        id: String(r.id), name: String(r.name ?? r.nom ?? ""),
        category: String(r.category ?? r.categorie ?? "Autre"),
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

      const { data: annData } = await supabase
        .from("annonces").select("id,titre,contenu,type,epingle,image_url,created_at,date_expiration")
        .eq("institution_id", id).eq("statut", "publiee")
        .order("epingle", { ascending: false }).order("created_at", { ascending: false }).limit(6);
      setAnnonces((annData ?? []).filter((a: any) => !a.date_expiration || new Date(a.date_expiration) > new Date()));

      // ✅ FIX: On récupère TOUS les avis directement depuis la table avis
      // sans filtrage sur le statut du RDV — les données sont déjà en DB
      const { data: avisData } = await supabase
        .from("avis")
        .select("id,note,commentaire,created_at,citoyen_id")
        .eq("institution_id", id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (avisData && avisData.length > 0) {
        // Récupérer les noms des citoyens
        const ids = [...new Set(avisData.map((a: any) => a.citoyen_id).filter(Boolean))];
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

        setAvis(avisData.map((a: any) => ({
          id: a.id,
          note: a.note,
          commentaire: a.commentaire,
          created_at: a.created_at,
          nom: uMap[a.citoyen_id] || "Citoyen",
          rdv_confirmed: citoyensVerifies.has(a.citoyen_id),
        })));
      }

      setLoading(false);
    })();
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
      <div style={{ width: "44px", height: "44px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      <p style={{ color: C.textSubtle, fontSize: "14px", fontFamily: "-apple-system,sans-serif" }}>Chargement…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!inst) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center", fontFamily: "-apple-system,sans-serif" }}>
      <div style={{ fontSize: "48px", marginBottom: "16px", color: C.textSubtle }}><Icons.Building /></div>
      <p style={{ color: C.text, fontSize: "16px", fontWeight: "700", marginBottom: "20px" }}>Institution introuvable</p>
      <Link href="/recherche" style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>Retour à la recherche</Link>
    </div>
  );

  const meta = CAT_META[inst.category] || { color: "#F5A623" };
  const CatIconComp = CAT_ICON[inst.category] || Icons.Building;
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
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, fontFamily: "'SF Pro Text',-apple-system,'Helvetica Neue',sans-serif", color: C.text, paddingBottom: "32px", transition: "background-color 0.3s ease" }}>
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

      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 200, backgroundColor: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${C.borderCard}`, padding: "0 16px" }}>
        <div style={{ height: "52px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/recherche" className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: C.text }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "9px", backgroundColor: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icons.Back />
            </div>
            <span style={{ color: C.textSubtle, fontSize: "13px", fontWeight: "600" }}>Retour</span>
          </Link>
          <div style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "0 12px" }}>
            <div style={{ color: C.text, fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst.name}</div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* BANNIÈRE */}
      {inst.banniere && !imgBanErr ? (
        <div style={{ width: "100%", height: "180px", overflow: "hidden", position: "relative" }}>
          <img src={inst.banniere} alt="" onError={() => setImgBanErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
          <div style={{ position: "absolute", inset: 0, background: isDark ? "linear-gradient(to bottom,transparent 40%,rgba(7,7,22,0.9) 100%)" : "linear-gradient(to bottom,transparent 50%,rgba(242,242,247,0.9) 100%)" }}/>
        </div>
      ) : (
        <div style={{ width: "100%", height: "100px", background: isDark ? `linear-gradient(160deg, ${meta.color}12, ${meta.color}06, transparent)` : `linear-gradient(160deg, ${meta.color}08, ${meta.color}03, transparent)` }}/>
      )}

      {/* HERO */}
      <div style={{ padding: "0 16px", marginTop: inst.banniere && !imgBanErr ? "-48px" : "-20px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", marginBottom: "14px" }}>
          <InstitutionLogo logo={inst.logo} name={inst.name} category={inst.category} size={72}/>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: "4px" }}>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "6px" }}>
              {inst.badge_verifie && (
                <span style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <Icons.Shield /> VÉRIFIÉ
                </span>
              )}
              {horaireAujd && (
                <span style={{ background: ouvert ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${ouvert ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, color: ouvert ? "#22c55e" : "#ef4444", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>
                  {ouvert ? "● OUVERT" : "● FERMÉ"}
                </span>
              )}
              {annonces.length > 0 && (
                <span style={{ background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", color: "#F5A623", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <Icons.Announce /> {annonces.length} annonce{annonces.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <h1 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 3px", lineHeight: 1.15, letterSpacing: "-0.5px" }}>{inst.name}</h1>
            <div style={{ color: meta.color, fontSize: "11px", fontWeight: "700", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ color: meta.color }}><CatIconComp /></div>
              {inst.category}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: C.textSubtle }}><Icons.Pin /></span>
              <span style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "500" }}>{[inst.adresse, inst.quartier, inst.ville].filter(Boolean).join(" · ") || "—"}</span>
            </div>
          </div>
        </div>

        {/* Note globale */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <span style={{ fontSize: "26px", fontWeight: "900", color: noteMoyenne >= 4 ? "#22c55e" : noteMoyenne >= 3 ? "#F5A623" : "#ef4444", letterSpacing: "-1px" }}>
            {noteMoyenne > 0 ? noteMoyenne.toFixed(1) : "—"}
          </span>
          <Stars note={noteMoyenne} size={14} isDark={isDark}/>
          <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600" }}>({nbAvis} avis)</span>
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
                  {a.image_url && (
                    <div style={{ width: "100%", height: "120px", overflow: "hidden" }}>
                      <img src={a.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}/>
                    </div>
                  )}
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
                  {a.commentaire && (
                    <p style={{ color: C.textMuted, fontSize: "12.5px", lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>"{a.commentaire}"</p>
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