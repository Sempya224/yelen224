"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { CompteHeader } from "@/components/CompteEcranVide";
import { getConversations, type Conversation } from "@/lib/messagerie";
import { verifierRappels, fetchNotifications, marquerNotifsLues } from "@/lib/notifications";
import { annulerRdv, reporterRdv } from "./actions";
import { rdvEstEnRetard, rdvEstAbsent } from "@/lib/rdvGating";
import { YelenLoader } from "@/components/YelenLoader";

// Refonte complète (retour Bryan 29/07/2026) : écran jugé "trop chargé, pas
// assez compréhensible" — chaque carte de la liste affichait en permanence
// tout son détail (objet, motifs, avis, timeline, mini-fiche établissement,
// actions), rendant la liste très longue à parcourir. Désormais : liste
// compacte, chaque RDV cliquable ouvre un pop plein écran ("Détail du
// rendez-vous", même convention X que les autres pop plein écran du produit,
// ex. app/menu/depenses) qui regroupe tout ce détail. Header remplacé par
// CompteHeader (identique aux écrans /compte/*, demandé explicitement).
// Palette alignée sur le reste du produit (gold Yelen, plus de bleu/ambre
// propre à cet écran). Filtres réordonnés : "À venir" par défaut à la place
// de "Tous", "Tous" repoussé en dernière position. Un RDV "absent" (marqué
// par l'établissement, ou journée entière passée sans présence confirmée)
// ne compte plus dans "En attente"/"Confirmés" — un seul et même filtre
// "Absents" via rdvEstAbsent(), partagée avec app/page.tsx.

// ─── Types ────────────────────────────────────────────────────────────────────

type Rdv = {
  id: string;
  date_rdv: string;
  heure_rdv: string;
  objet: string | null;
  statut: string;
  pour_autre: boolean;
  nom_autre: string | null;
  phone_autre: string | null;
  presence: boolean;
  presence_status: string | null;
  created_at: string;
  motif_annulation: string | null;
  motif_report: string | null;
  motif_refus: string | null;
  avis_demande: boolean;
  institutions: {
    id: string;
    name: string;
    category: string;
    logo: string | null;
    ville: string | null;
    adresse: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
    badge_verifie: boolean;
  } | null;
};

type Notif = {
  id: string;
  type: string;
  titre: string;
  message: string;
  lu: boolean;
  rdv_id: string | null;
  created_at: string;
};

type ModalType =
  | { type: "annuler"; rdv: Rdv }
  | { type: "reporter"; rdv: Rdv }
  | { type: "avis"; rdv: Rdv }
  | { type: "notifs" }
  | null;

// "tous" volontairement en dernier (retour Bryan 29/07/2026) — l'ordre de ce
// tableau pilote directement l'ordre des chips de filtre affichées.
type FiltreKey = "avenir" | "en_attente" | "confirme" | "termine" | "annule" | "absent" | "historique" | "tous";

// ─── Icônes ───────────────────────────────────────────────────────────────────

const Ic = {
  Cal:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Check:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Search:   () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Pin:      () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Phone:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  ChevR:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Info:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Verified: () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Reschedule:() => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  X:        () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  QR:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>,
  Clock:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Bell:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  BellOff:  () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Inbox:    () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
  List:     () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  SearchOff:() => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="8" y1="8" x2="14" y2="14"/><line x1="14" y1="8" x2="8" y2="14"/></svg>,
  CheckCircle:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  XCircle:  () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  RefreshCcw:() => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  AlertTriangle:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  MessageCircle:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Flag:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  AlarmClock:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14 14"/><path d="M5 3 2 6M22 6l-3-3M6.38 18.7 4 21M17.64 18.67 20 21"/></svg>,
  Pulse:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="7"/></svg>,
  Star:     (filled: boolean, size = 13) => <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

function notifIcon(type: string) {
  switch (type) {
    case "confirmation":  return <span style={{ color: "#34D399" }}>{Ic.CheckCircle()}</span>;
    case "rappel_24h":    return <span style={{ color: "#F5A623" }}>{Ic.AlarmClock()}</span>;
    case "rappel_30min":  return <span style={{ color: "#F5A623" }}>{Ic.Bell()}</span>;
    case "heure_rdv":     return <span style={{ color: "#34D399" }}>{Ic.Pulse()}</span>;
    case "rdv_termine":   return <span style={{ color: "#A78BFA" }}>{Ic.Flag()}</span>;
    case "rdv_annule":    return <span style={{ color: "#F87171" }}>{Ic.XCircle()}</span>;
    case "rdv_reporte":   return <span style={{ color: "#F5A623" }}>{Ic.RefreshCcw()}</span>;
    case "rdv_depasse":   return <span style={{ color: "#F87171" }}>{Ic.AlertTriangle()}</span>;
    case "message":       return <span style={{ color: "#60A5FA" }}>{Ic.MessageCircle()}</span>;
    case "avis":          return Ic.Star(true, 16);
    default:              return <span style={{ color: "#64748B" }}>{Ic.Bell()}</span>;
  }
}

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT: Record<string, { label: string; color: string; bg: string }> = {
  nouveau:    { label: "Non confirmé", color: "#F5A623", bg: "rgba(245,166,35,0.12)" },
  confirme:   { label: "Confirmé",   color: "#34D399", bg: "rgba(52,211,153,0.12)" },
  en_attente: { label: "Accepté",    color: "#34D399", bg: "rgba(52,211,153,0.12)" },
  annule:     { label: "Annulé",     color: "#F87171", bg: "rgba(248,113,113,0.12)" },
  refuse:     { label: "Refusé",     color: "#F87171", bg: "rgba(248,113,113,0.12)" },
  termine:    { label: "Terminé",    color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  absent:     { label: "Absent",     color: "#9CA3AF", bg: "rgba(156,163,175,0.12)" },
  en_retard:  { label: "En retard",  color: "#F87171", bg: "rgba(248,113,113,0.12)" },
};

// ─── Helpers — FIX TIMEZONE ───────────────────────────────────────────────────
// new Date("2026-04-01") = minuit UTC = 31 mars 20h en EST → bug timezone
// new Date(2026, 3, 1)   = minuit heure locale → correct partout

function parseDateLocale(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isPasse(dateStr: string): boolean {
  const d = parseDateLocale(dateStr);
  d.setHours(23, 59, 59, 999);
  return d < new Date();
}

function getDaysUntil(dateStr: string): number {
  const d = parseDateLocale(dateStr);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function formatRelative(dateStr: string): string {
  const days = getDaysUntil(dateStr);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  if (days === -1) return "Hier";
  if (days > 1 && days <= 7) return `Dans ${days} jours`;
  if (days < -1 && days >= -7) return `Il y a ${Math.abs(days)} jours`;
  return parseDateLocale(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function formatMsgTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "À l'instant";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
}

/** Compte à rebours humain jusqu'à un RDV (date + heure), recalculé en live via `now`. */
function formatCountdown(dateStr: string, heureStr: string, now: Date): string {
  const [h, m] = (heureStr || "00:00").split(":").map(Number);
  const d = parseDateLocale(dateStr);
  d.setHours(h || 0, m || 0, 0, 0);
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return "En cours";
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `Dans ${diffMin} min`;
  const sameDay = d.toDateString() === now.toDateString();
  const diffH = Math.round(diffMin / 60);
  if (sameDay) return `Aujourd'hui à ${heureStr}`;
  if (diffH < 24) return `Dans ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "Demain";
  return `Dans ${diffD} jours`;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Un RDV cesse d'être compté "en attente"/"confirmé" une fois absent (marqué
 * par l'établissement, ou journée entière passée sans présence confirmée) —
 * même règle partagée que app/page.tsx (lib/rdvGating.ts), retour Bryan
 * 29/07/2026 : avant ce correctif, un RDV absent restait compté dans "En
 * attente" en plus d'apparaître dans "Absents". */
function estAbsent(r: Rdv): boolean {
  return rdvEstAbsent(r.date_rdv, r.statut, r.presence, r.presence_status);
}

/** Badge affiché sur la carte — ajoute l'état "Aujourd'hui", "Absent" et
 * "En retard" par-dessus le statut brut. */
function badgeFor(r: Rdv): { label: string; color: string; bg: string } {
  if (estAbsent(r)) return STATUT.absent;
  if (r.statut === "confirme" && !isPasse(r.date_rdv) && getDaysUntil(r.date_rdv) === 0) {
    return { ...STATUT.confirme, label: "Aujourd'hui" };
  }
  if ((r.statut === "en_attente" || r.statut === "nouveau") && r.presence_status !== "present" && rdvEstEnRetard(r.date_rdv, r.heure_rdv)) {
    return STATUT.en_retard;
  }
  return STATUT[r.statut] ?? STATUT.en_attente;
}

// ─── Timeline de suivi ──────────────────────────────────────────────────────────

function Timeline({ rdv, t1, t3, lineTodo, ov }: {
  rdv: Rdv; t1: string; t3: string; lineTodo: string; ov: (a: number) => string;
}) {
  type Step = { label: string; state: "done" | "current" | "todo" | "cancelled" };
  let steps: Step[];

  if (rdv.statut === "annule") {
    steps = [
      { label: "Réservation envoyée", state: "done" },
      { label: "Annulé", state: "cancelled" },
    ];
  } else if (rdv.statut === "refuse") {
    steps = [
      { label: "Réservation envoyée", state: "done" },
      { label: "Refusé par l'institution", state: "cancelled" },
    ];
  } else {
    // "confirme" (statut) signifie présence déjà scannée, PAS "accepté par
    // l'établissement" (c'est "en_attente" qui porte ce sens dans ce
    // projet — voir CLAUDE.md /schema). Utiliser "confirme" ici pour
    // l'étape d'acceptation créait exactement le mélange que ce correctif
    // supprime (retour Bryan 29/07/2026) : nommer l'étape avec le nom réel
    // de l'établissement plutôt qu'un mot("confirmée") déjà pris par un
    // autre sens ailleurs dans l'écran.
    const accepte = rdv.statut !== "nouveau";
    const presenceOk = !!rdv.presence;
    const termine = rdv.statut === "termine";
    const instNom = rdv.institutions?.name || "L'établissement";
    steps = [
      { label: "Réservation envoyée", state: "done" },
      { label: `${instNom} a accepté votre rendez-vous`, state: accepte ? "done" : "current" },
      { label: "Confirmation de présence", state: presenceOk ? "done" : accepte ? "current" : "todo" },
      { label: "Rendez-vous terminé", state: termine ? "done" : "todo" },
    ];
  }

  return (
    <div style={{ padding: "2px 0 4px" }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
              background: s.state === "done" ? "#34D399" : s.state === "cancelled" ? "#F87171" : s.state === "current" ? "#F5A623" : ov(0.06),
              border: s.state === "todo" ? `1px solid ${ov(0.15)}` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {(s.state === "done" || s.state === "cancelled") && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round">
                  {s.state === "done" ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                </svg>
              )}
            </div>
            {i < steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 18, background: s.state === "done" ? "#34D399" : lineTodo }}/>}
          </div>
          <div style={{ paddingBottom: 16, fontSize: 12.5, fontWeight: s.state === "current" ? 700 : 600, color: s.state === "todo" ? t3 : s.state === "cancelled" ? "#F87171" : t1 }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MesRdvPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const ov = (a: number) => (isDark ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const cardShadow = isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)";

  const [rdvs, setRdvs]           = useState<Rdv[]>([]);
  const [loading, setLoading]     = useState(true);
  const [userId, setUserId]       = useState<string | null>(null);
  // "avenir" par défaut à la place de "tous" (retour Bryan 29/07/2026) — la
  // première chose qu'un citoyen veut voir en ouvrant cet écran, c'est ce qui
  // vient, pas l'intégralité brute de son historique.
  const [filtre, setFiltre]       = useState<FiltreKey>("avenir");
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState<ModalType>(null);
  // RDV actuellement ouvert en pop plein écran ("Détail du rendez-vous") —
  // remplace l'ancien affichage systématique de tout le détail dans la liste.
  const [detailRdv, setDetailRdv] = useState<Rdv | null>(null);
  const [motif, setMotif]         = useState("");
  const [nouvelleDate, setNouvelleDate] = useState("");
  const [nouvelleHeure, setNouvelleHeure] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [notifs, setNotifs]       = useState<Notif[]>([]);
  const [nbNotifs, setNbNotifs]   = useState(0);
  const [avisNote, setAvisNote]   = useState(0);
  const [avisTitre, setAvisTitre] = useState("");
  const [avisCommentaire, setAvisCommentaire] = useState("");
  const [avisEnvoye, setAvisEnvoye] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [avisMap, setAvisMap]     = useState<Record<string, { note: number; commentaire: string | null }>>({});
  const [userLat, setUserLat]     = useState<number | null>(null);
  const [userLng, setUserLng]     = useState<number | null>(null);
  const [now, setNow]             = useState(new Date());
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Horloge live (countdown "Prochain RDV") + géolocalisation (distance) ────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); },
        () => {},
        { timeout: 5000 }
      );
    }
    return () => clearInterval(t);
  }, []);

  // ── Fetch RDVs ─────────────────────────────────────────────────────────────
  const fetchRdvs = useCallback(async (uid?: string) => {
    const id = uid || userId;
    if (!id) return;

    const { data } = await supabase
      .from("rdv")
      .select(`
        id, date_rdv, heure_rdv, objet, statut,
        pour_autre, nom_autre, phone_autre, presence, presence_status, created_at,
        motif_annulation, motif_report, motif_refus, avis_demande,
        institutions!rdv_institution_id_fkey ( id, name, category, logo, ville, adresse, phone, latitude, longitude, badge_verifie )
      `)
      .eq("citoyen_id", id)
      .order("date_rdv", { ascending: false });

    setRdvs((data as unknown as Rdv[]) || []);
    setLoading(false);
  }, [userId]);

  // ── Fetch avis déjà laissés (pour le rappel "note donnée" en historique) ────
  // brouillon=false uniquement — un brouillon (Lot G, chantier Avis +
  // Favoris citoyen) ne doit pas afficher "note donnée" tant qu'il n'est
  // pas publié, sinon le citoyen croirait avoir déjà terminé son avis.
  const fetchAvis = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setAvisMap({}); return; }
    const { data } = await supabase.from("avis").select("rdv_id,note,commentaire").in("rdv_id", ids).eq("brouillon", false);
    const map: Record<string, { note: number; commentaire: string | null }> = {};
    type AvisRow = { rdv_id: string | null; note: number; commentaire: string | null };
    ((data || []) as unknown as AvisRow[]).forEach((a) => { if (a.rdv_id) map[a.rdv_id] = { note: a.note, commentaire: a.commentaire }; });
    setAvisMap(map);
  }, []);

  useEffect(() => {
    fetchAvis(rdvs.filter(r => r.statut === "termine").map(r => r.id));
  }, [rdvs, fetchAvis]);

  const loadConversations = useCallback(async (uid?: string) => {
    const id = uid || userId;
    if (!id) return;
    try {
      setConversations(await getConversations(id));
    } catch {
      // Non-bloquant — la liste des RDV reste utilisable sans conversations.
    }
  }, [userId]);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let uid: string | null = null;
    try { uid = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!uid) { router.push("/login"); return; }
    setUserId(uid);
    fetchRdvs(uid);
    loadConversations(uid);

    fetchNotifications(uid, 30).then(data => {
      const notifs = data as Notif[];
      setNotifs(notifs);
      setNbNotifs(notifs.filter((n) => !n.lu).length);
    });

    verifierRappels(uid, "citoyen").catch(console.error);

    const channel = supabase
      .channel("mes-rdv-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "rdv" },
        () => fetchRdvs(uid))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" },
        () => loadConversations(uid))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications",
        filter: `destinataire_id=eq.${uid}` },
        (payload) => {
          setNotifs(prev => [payload.new as Notif, ...prev]);
          setNbNotifs(n => n + 1);
        })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Le RDV en détail doit refléter les mises à jour temps réel (ex. annulé
  // depuis un autre appareil) — resynchronise la référence ouverte.
  useEffect(() => {
    if (!detailRdv) return;
    const frais = rdvs.find(r => r.id === detailRdv.id);
    if (frais && frais !== detailRdv) setDetailRdv(frais);
  }, [rdvs, detailRdv]);

  // ── Annuler ────────────────────────────────────────────────────────────────
  async function handleAnnuler() {
    if (!modal || modal.type !== "annuler" || !motif.trim() || !userId) return;
    const rdv = modal.rdv;
    setActionLoading(rdv.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", false); return; }
      const res = await annulerRdv({ rdvId: rdv.id, motif: motif.trim(), accessToken: session.access_token });
      if (!res.ok) { showToast(res.error, false); return; }
      showToast("Rendez-vous annulé avec succès.");
    } catch {
      showToast("Erreur lors de l'annulation.", false);
    }
    await fetchRdvs();
    setActionLoading(null);
    setModal(null);
    setMotif("");
  }

  // ── Reporter ───────────────────────────────────────────────────────────────
  async function handleReporter() {
    if (!modal || modal.type !== "reporter" || !motif.trim() || !nouvelleDate || !nouvelleHeure || !userId) return;
    const rdv = modal.rdv;
    setActionLoading(rdv.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", false); return; }
      const res = await reporterRdv({ rdvId: rdv.id, motif: motif.trim(), nouvelleDate, nouvelleHeure, accessToken: session.access_token });
      if (!res.ok) { showToast(res.error, false); return; }
      showToast("Rendez-vous reporté avec succès.");
    } catch {
      showToast("Erreur lors du report.", false);
    }
    await fetchRdvs();
    setActionLoading(null);
    setModal(null);
    setMotif("");
    setNouvelleDate("");
    setNouvelleHeure("");
  }

  // Fire-and-forget : ne doit jamais bloquer le toast, une erreur ici est
  // sans conséquence pour l'utilisateur.
  async function notifierPublicationAvis(avisId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch("/api/citoyen/avis/notifier-publication", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ avisId }),
      });
    } catch {}
  }

  // ── Envoyer avis ───────────────────────────────────────────────────────────
  async function handleEnvoyerAvis(brouillon = false) {
    if (!modal || modal.type !== "avis" || avisNote === 0 || !userId) return;
    const rdv = modal.rdv;
    setActionLoading(rdv.id);
    try {
      const { data: avisCree } = await supabase.from("avis").insert({
        institution_id: rdv.institutions!.id,
        citoyen_id: userId,
        rdv_id: rdv.id,
        note: avisNote,
        titre: avisTitre.trim() || null,
        commentaire: avisCommentaire.trim() || null,
        brouillon,
      }).select("id").single();
      // Un brouillon n'est pas terminé — avis_demande reste true pour que
      // le citoyen soit toujours invité à publier (via Mes avis) plus tard.
      // rdv.avis_demande=false est mis à jour par notifierPublicationAvis()
      // côté serveur (service_role) — la policy RLS du citoyen sur `rdv`
      // est lecture seule, un UPDATE client-direct échouait silencieusement
      // (bug réel corrigé le 15/08/2026, voir notifier-publication/route.ts).
      if (!brouillon && avisCree?.id) {
        void notifierPublicationAvis(avisCree.id);
      }
      setAvisEnvoye(true);
      showToast(brouillon ? "Brouillon enregistré." : "Avis envoyé, merci !");
      setTimeout(() => {
        setModal(null);
        setAvisNote(0);
        setAvisTitre("");
        setAvisCommentaire("");
        setAvisEnvoye(false);
        fetchRdvs();
      }, 1800);
    } catch {
      showToast("Erreur lors de l'envoi.", false);
    }
    setActionLoading(null);
  }

  // ── Listes filtrées ────────────────────────────────────────────────────────
  // !estAbsent(r) sur avenir/en_attente/confirme (retour Bryan 29/07/2026) —
  // un RDV absent ne doit plus être compté ailleurs que dans "Absents".
  const rdvsAvenir     = rdvs.filter(r => !isPasse(r.date_rdv) && (r.statut === "en_attente" || r.statut === "confirme") && !estAbsent(r));
  const rdvsHistorique = rdvs.filter(r => isPasse(r.date_rdv) || r.statut === "annule" || r.statut === "termine" || r.statut === "refuse");
  const rdvsEnAttente  = rdvs.filter(r => r.statut === "en_attente" && !estAbsent(r));
  const rdvsConfirmes  = rdvs.filter(r => r.statut === "confirme" && !estAbsent(r));
  const rdvsTermines   = rdvs.filter(r => r.statut === "termine");
  const rdvsAnnules    = rdvs.filter(r => r.statut === "annule" || r.statut === "refuse");
  const rdvsAbsents    = rdvs.filter(estAbsent);
  const totalUnread    = conversations.reduce((s, c) => s + c.non_lus, 0);
  const rdvsAvisDemande = rdvs.filter(r => r.avis_demande && r.statut === "termine");

  const FILTRES: { key: FiltreKey; label: string; list: Rdv[] }[] = [
    { key: "avenir",     label: "À venir",     list: rdvsAvenir },
    { key: "en_attente", label: "En attente",  list: rdvsEnAttente },
    { key: "confirme",   label: "Confirmés",   list: rdvsConfirmes },
    { key: "absent",     label: "Absents",     list: rdvsAbsents },
    { key: "termine",    label: "Terminés",    list: rdvsTermines },
    { key: "annule",     label: "Annulés",     list: rdvsAnnules },
    { key: "historique", label: "Historique",  list: rdvsHistorique },
    { key: "tous",       label: "Tous",        list: rdvs },
  ];

  const baseList = FILTRES.find(f => f.key === filtre)?.list ?? rdvs;
  const searchLower = search.trim().toLowerCase();
  const historiqueTri = filtre === "historique" || filtre === "termine" || filtre === "annule" || filtre === "tous";
  const displayed = (searchLower
    ? baseList.filter(r =>
        (r.institutions?.name ?? "").toLowerCase().includes(searchLower) ||
        (r.institutions?.category ?? "").toLowerCase().includes(searchLower) ||
        (r.institutions?.ville ?? "").toLowerCase().includes(searchLower) ||
        (r.objet ?? "").toLowerCase().includes(searchLower)
      )
    : baseList
  ).slice().sort((a, b) => historiqueTri
    ? (b.date_rdv + (b.heure_rdv || "")).localeCompare(a.date_rdv + (a.heure_rdv || ""))
    : (a.date_rdv + (a.heure_rdv || "")).localeCompare(b.date_rdv + (b.heure_rdv || ""))
  );

  // ── Prochain RDV (affiché seulement s'il tombe dans les 48h) ────────────────
  const prochainRdv = rdvsAvenir
    .slice()
    .sort((a, b) => (a.date_rdv + a.heure_rdv).localeCompare(b.date_rdv + b.heure_rdv))
    .find(r => {
      const [h, m] = (r.heure_rdv || "00:00").split(":").map(Number);
      const d = parseDateLocale(r.date_rdv);
      d.setHours(h || 0, m || 0, 0, 0);
      const diff = d.getTime() - now.getTime();
      return diff > -3600000 && diff <= 48 * 3600000;
    });
  const prochainDistance = prochainRdv?.institutions?.latitude != null && prochainRdv?.institutions?.longitude != null && userLat != null && userLng != null
    ? distanceKm(userLat, userLng, prochainRdv.institutions.latitude, prochainRdv.institutions.longitude)
    : null;

  // Détail actuellement affiché dans le pop plein écran.
  const detail = detailRdv;
  const detailCanAct = detail ? !isPasse(detail.date_rdv) && (detail.statut === "en_attente" || detail.statut === "confirme") && !estAbsent(detail) : false;
  const detailAvis = detail ? avisMap[detail.id] : undefined;
  const detailDist = detail?.institutions?.latitude != null && detail?.institutions?.longitude != null && userLat != null && userLng != null
    ? distanceKm(userLat, userLng, detail.institutions.latitude, detail.institutions.longitude) : null;
  const detailEnRetard = detail ? (detail.statut === "en_attente" || detail.statut === "nouveau") && detail.presence_status !== "present" && rdvEstEnRetard(detail.date_rdv, detail.heure_rdv) : false;

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100svh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "-apple-system,sans-serif" }}>
      <div style={{ width: 40, height: 40, border: "3px solid rgba(245,166,35,0.15)", borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      <p style={{ color: t3, fontSize: 14 }}>Chargement...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100svh", background: bg, color: t1, fontFamily: "-apple-system,'SF Pro Text','Helvetica Neue',sans-serif", paddingBottom: 100 }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{background:${bg};overflow-x:hidden}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes screenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .tap{transition:opacity 0.1s,transform 0.1s;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .tap:active{opacity:0.65;transform:scale(0.96)}
        .chip-row{display:flex;gap:8px;overflow-x:auto;padding:14px 16px 2px}
        .chip{flex:0 0 auto;transition:transform 0.12s ease}
        .chip:active{transform:scale(0.96)}
        textarea,input{font-family:inherit;color:${t1}}
        textarea:focus,input:focus{outline:none}
        ${isDark ? `
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1) opacity(0.5)}
        input[type=time]::-webkit-calendar-picker-indicator{filter:invert(1) opacity(0.5)}
        ` : ""}
      `}</style>

      <CompteHeader titre="Mes réservations" fondNeutre/>

      {/* ══ CTA AVIS ════════════════════════════════════════════════════════ */}
      {rdvsAvisDemande.length > 0 && (
        <div style={{ margin: "16px 16px 0" }}>
          {rdvsAvisDemande.slice(0, 1).map(rdv => (
            <div key={rdv.id} onClick={() => { setModal({ type: "avis", rdv }); setAvisNote(0); setAvisCommentaire(""); setAvisEnvoye(false); }} className="tap" style={{ background: card, border: "1px solid rgba(167,139,250,0.3)", borderRadius: 16, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#A78BFA", flexShrink: 0 }}>{Ic.Star(true, 20)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: t1, fontSize: 14, fontWeight: 800, marginBottom: 2 }}>Donnez votre avis !</div>
                <div style={{ color: t2, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Votre RDV chez {rdv.institutions?.name} est terminé</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </div>
          ))}
        </div>
      )}

      {/* ══ PROCHAIN RENDEZ-VOUS ═════════════════════════════════════════════ */}
      {prochainRdv && (
        <div style={{ margin: "16px 16px 0" }} onClick={() => setDetailRdv(prochainRdv)} className="tap">
          <div style={{ background: card, border: "1px solid rgba(245,166,35,0.3)", borderRadius: 20, padding: "18px", animation: "fadeUp 0.3s ease", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#F5A623", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Prochain rendez-vous</div>
                <div style={{ color: t1, fontSize: 15, fontWeight: 800, marginTop: 1 }}>{prochainRdv.institutions?.name}</div>
              </div>
              <div style={{ background: "rgba(245,166,35,0.14)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 800, color: "#F5A623", flexShrink: 0 }}>
                {formatCountdown(prochainRdv.date_rdv, prochainRdv.heure_rdv, now)}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: t2 }}>
              {prochainRdv.objet && <div><strong style={{ color: t1 }}>Service : </strong>{prochainRdv.objet}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{Ic.Cal()}<span>{parseDateLocale(prochainRdv.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {prochainRdv.heure_rdv}</span></div>
              {prochainRdv.institutions?.adresse && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{Ic.Pin()}<span>{prochainRdv.institutions.adresse}{prochainDistance != null && ` · ${prochainDistance.toFixed(1)} km`}</span></div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ background: badgeFor(prochainRdv).bg, color: badgeFor(prochainRdv).color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{badgeFor(prochainRdv).label}</span>
              </div>
            </div>

            {getDaysUntil(prochainRdv.date_rdv) === 0 && (
              <button onClick={e => { e.stopPropagation(); router.push("/mon-qr"); }} className="tap" style={{ width: "100%", marginTop: 16, background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: 14, padding: "14px", borderRadius: 16, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {Ic.QR()} Scanner mon QR
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══ NOTIFICATIONS (entrée compacte, header n'en a plus la place) ═════ */}
      <div style={{ padding: "16px 16px 0" }}>
        <button onClick={() => { setModal({ type: "notifs" }); marquerNotifsLues(userId!).then(() => setNbNotifs(0)); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: card, border: `1px solid ${nbNotifs > 0 ? "rgba(245,166,35,0.3)" : brd}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer" }}>
          <span style={{ color: nbNotifs > 0 ? "#F5A623" : t3, flexShrink: 0 }}>{Ic.Bell()}</span>
          <span style={{ flex: 1, textAlign: "left", color: t1, fontSize: 13, fontWeight: 700 }}>
            {nbNotifs > 0 ? `${nbNotifs} nouvelle${nbNotifs > 1 ? "s" : ""} notification${nbNotifs > 1 ? "s" : ""}` : "Notifications"}
          </span>
          {totalUnread > 0 && (
            <span onClick={e => { e.stopPropagation(); router.push("/messagerie-list"); }} style={{ background: "rgba(96,165,250,0.14)", color: "#60A5FA", fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20 }}>{totalUnread} message{totalUnread > 1 ? "s" : ""}</span>
          )}
          <span style={{ color: t3, flexShrink: 0 }}>{Ic.ChevR()}</span>
        </button>
      </div>

      {/* ══ RECHERCHE ════════════════════════════════════════════════════════ */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: card, border: `1px solid ${brd}`, borderRadius: 16, padding: "12px 14px" }}>
          <span style={{ color: t3, flexShrink: 0 }}>{Ic.Search()}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un établissement, un service..." style={{ flex: 1, background: "transparent", border: "none", fontSize: 13.5, color: t1 }}/>
          {search && (
            <button onClick={() => setSearch("")} className="tap" style={{ background: "none", border: "none", cursor: "pointer", color: t3, display: "flex" }}>{Ic.X()}</button>
          )}
        </div>
      </div>

      {/* ══ FILTRES ══════════════════════════════════════════════════════════ */}
      <div className="chip-row">
        {FILTRES.map(f => {
          const active = filtre === f.key;
          return (
            <button key={f.key} onClick={() => setFiltre(f.key)} className="tap chip" style={{
              padding: "9px 14px", borderRadius: 30, border: "none",
              background: active ? "linear-gradient(135deg,#F5A623,#C8940A)" : card2,
              color: active ? "#080812" : t2, fontSize: 12.5, fontWeight: active ? 800 : 600,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              boxShadow: active ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
            }}>
              {f.label}
              <span style={{ background: active ? "rgba(8,8,18,0.2)" : ov(0.06), borderRadius: 20, padding: "1px 7px", fontSize: 10.5 }}>{f.list.length}</span>
            </button>
          );
        })}
      </div>

      {/* ══ CONVERSATIONS ═══════════════════════════════════════════════════ */}
      {conversations.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Conversations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conversations.map(c => (
              <div key={c.institution_id} onClick={() => router.push(`/messagerie/citoyen?institution_id=${c.institution_id}`)} className="tap" style={{ background: c.non_lus > 0 ? "rgba(96,165,250,0.06)" : card, border: `1px solid ${c.non_lus > 0 ? "rgba(96,165,250,0.2)" : brd}`, borderRadius: 14, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(96,165,250,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: t1, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.institution_nom}</div>
                  <div style={{ color: c.non_lus > 0 ? t1 : t3, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.dernier_message ?? "Aucun message"}</div>
                </div>
                {c.non_lus > 0 && (
                  <span style={{ background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0 }}>{c.non_lus}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ LISTE RDV (compacte — le détail complet vit dans le pop plein
          écran ouvert au clic, plus dans la carte elle-même) ═══════════════ */}
      <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>

        {displayed.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 24px", animation: "fadeUp 0.3s ease" }}>
            <div style={{ color: t3, display: "flex", justifyContent: "center", marginBottom: 16 }}>
              {search ? Ic.SearchOff() : filtre === "historique" ? <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> : filtre === "avenir" ? Ic.Inbox() : Ic.List()}
            </div>
            <div style={{ color: t2, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              {search ? "Aucun résultat" : `Aucun rendez-vous — ${FILTRES.find(f => f.key === filtre)?.label.toLowerCase()}`}
            </div>
            <div style={{ color: t3, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              {search ? "Essayez un autre établissement ou service." : "Prenez rendez-vous depuis la carte des institutions."}
            </div>
            {!search && (
              <button onClick={() => router.push("/recherche")} className="tap" style={{ background: "#F5A623", color: "#080812", border: "none", borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                Découvrir des établissements
              </button>
            )}
          </div>
        )}

        {displayed.map((rdv) => {
          const badge = badgeFor(rdv);
          const inst = rdv.institutions;
          const avis = avisMap[rdv.id];

          return (
            <div key={rdv.id} onClick={() => setDetailRdv(rdv)} className="tap" style={{ background: card, border: `1px solid ${brd}`, borderRadius: 18, padding: "12px 14px", boxShadow: cardShadow, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 44, height: 44, position: "relative", borderRadius: 13, background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#F5A623", overflow: "hidden" }}>
                  {inst?.logo
                    ? <Image src={inst.logo} alt={inst.name} fill sizes="44px" style={{ objectFit: "cover" }}/>
                    : getInitials(inst?.name ?? "?")}
                </div>
                {inst?.badge_verifie && (
                  <div style={{ position: "absolute", top: -3, right: -3, width: 15, height: 15, borderRadius: "50%", background: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${card}` }}>{Ic.Verified()}</div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ color: t1, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst?.name ?? "Institution"}</div>
                  <span style={{ background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0 }}>{badge.label}</span>
                </div>
                <div style={{ color: t3, fontSize: 11.5, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {inst?.category ?? ""}{inst?.ville ? ` · ${inst.ville}` : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, color: t2, fontSize: 11.5, fontWeight: 600 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>{Ic.Cal()}{formatRelative(rdv.date_rdv)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>{Ic.Clock()}{rdv.heure_rdv}</span>
                  {avis && <span style={{ color: "#F5A623", display: "flex", alignItems: "center", gap: 3 }}>{Ic.Star(true, 11)}{avis.note}</span>}
                </div>
              </div>

              <span style={{ color: t3, flexShrink: 0 }}>{Ic.ChevR()}</span>
            </div>
          );
        })}
      </div>

      {/* ══ BOUTON NOUVEAU RDV ═══════════════════════════════════════════════ */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 100 }}>
        <button onClick={() => router.push("/recherche")} className="tap" style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", border: "none", boxShadow: "0 6px 24px rgba(245,166,35,0.45)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {/* ══ TOAST ════════════════════════════════════════════════════════════ */}
      {toast && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", padding: "12px 22px", borderRadius: 14, fontSize: 13, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.35)", background: toast.ok ? "#0F2A1A" : "#2A0F0F", border: `1px solid ${toast.ok ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, color: toast.ok ? "#34D399" : "#F87171", animation: "slideUp 0.25s ease", display: "flex", alignItems: "center", gap: 8 }}>
          {toast.ok ? Ic.CheckCircle() : Ic.XCircle()}{toast.msg}
        </div>
      )}

      {/* ══ POP PLEIN ÉCRAN — DÉTAIL DU RENDEZ-VOUS ═══════════════════════════
          Même convention que les autres pop plein écran du produit (ex.
          app/menu/depenses) : header sticky avec X à gauche, titre centré,
          fond plein écran, tout le détail qui vivait avant en permanence
          dans chaque carte de la liste est regroupé ici. */}
      {detail && (() => {
        const inst = detail.institutions;
        const badge = badgeFor(detail);
        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(10,10,15,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: 52, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setDetailRdv(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: 36, height: 36, borderRadius: 9, background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                {Ic.X()}
              </button>
              <div style={{ color: t1, fontSize: 14, fontWeight: 800 }}>Détail du rendez-vous</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: 560, margin: "0 auto" }}>

            {/* Institution */}
            <div onClick={() => inst && router.push(`/institution/${inst.id}`)} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, cursor: inst ? "pointer" : "default", marginBottom: 18 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 56, height: 56, position: "relative", borderRadius: 16, background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: "#F5A623", overflow: "hidden" }}>
                  {inst?.logo ? <Image src={inst.logo} alt={inst.name} fill sizes="56px" style={{ objectFit: "cover" }}/> : getInitials(inst?.name ?? "?")}
                </div>
                {inst?.badge_verifie && (
                  <div style={{ position: "absolute", top: -3, right: -3, width: 17, height: 17, borderRadius: "50%", background: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${bg}` }}>{Ic.Verified()}</div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: t1, fontSize: 17, fontWeight: 800 }}>{inst?.name ?? "Institution"}</div>
                <div style={{ color: t3, fontSize: 12, marginTop: 2 }}>
                  {inst?.category ?? ""}{inst?.ville ? ` · ${inst.ville}` : ""}{detailDist != null ? ` · ${detailDist.toFixed(1)} km` : ""}
                </div>
                {(inst?.adresse || inst?.phone) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4, color: t3, fontSize: 11.5 }}>
                    {inst?.adresse && <span style={{ display: "flex", alignItems: "center", gap: 4 }}>{Ic.Pin()}{inst.adresse}</span>}
                    {inst?.phone && <span style={{ display: "flex", alignItems: "center", gap: 4 }}>{Ic.Phone()}{inst.phone}</span>}
                  </div>
                )}
              </div>
              {inst && <span style={{ color: t3, flexShrink: 0 }}>{Ic.ChevR()}</span>}
            </div>

            {/* Statut + date/heure */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <span style={{ background: badge.bg, color: badge.color, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20 }}>{badge.label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, background: card2, color: t2, fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20 }}>{Ic.Cal()}{parseDateLocale(detail.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, background: card2, color: t2, fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20 }}>{Ic.Clock()}{detail.heure_rdv}</span>
            </div>

            {detail.objet && (
              <div style={{ background: card, borderRadius: 14, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Objet</div>
                <div style={{ color: t2, fontSize: 13.5, lineHeight: 1.5 }}>{detail.objet}</div>
              </div>
            )}

            {detail.motif_annulation && (
              <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)", borderRadius: 14, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ color: "#F87171", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Motif d&apos;annulation</div>
                <div style={{ color: t2, fontSize: 13, lineHeight: 1.5 }}>{detail.motif_annulation}</div>
              </div>
            )}

            {detail.motif_refus && (
              <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)", borderRadius: 14, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ color: "#F87171", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Motif du refus</div>
                <div style={{ color: t2, fontSize: 13, lineHeight: 1.5 }}>{detail.motif_refus}</div>
              </div>
            )}

            {detail.motif_report && (
              <div style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: 14, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ color: "#F5A623", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Motif du report</div>
                <div style={{ color: t2, fontSize: 13, lineHeight: 1.5 }}>{detail.motif_report}</div>
              </div>
            )}

            {detailAvis && (
              <div style={{ background: card, borderRadius: 14, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Votre avis</div>
                <div style={{ marginBottom: detailAvis.commentaire ? 4 : 0 }}>
                  {[1,2,3,4,5].map(n => <span key={n} style={{ color: n <= detailAvis.note ? "#F5A623" : card2 }}>{Ic.Star(n <= detailAvis.note)}</span>)}
                </div>
                {detailAvis.commentaire && <div style={{ color: t2, fontSize: 12.5, lineHeight: 1.5 }}>{detailAvis.commentaire}</div>}
              </div>
            )}

            {/* Timeline — masquée pour absent/annulé/refusé, peu utile une
                fois la situation figée. */}
            {!estAbsent(detail) && detail.statut !== "annule" && detail.statut !== "refuse" && (
              <div style={{ background: card, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Suivi</div>
                <Timeline rdv={detail} t1={t1} t3={t3} lineTodo={brd} ov={ov}/>
              </div>
            )}

            {/* Rappel avis à laisser */}
            {detail.avis_demande && detail.statut === "termine" && (
              <div onClick={() => { setModal({ type: "avis", rdv: detail }); setAvisNote(0); setAvisCommentaire(""); setAvisEnvoye(false); }} className="tap" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 14, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ color: "#A78BFA" }}>{Ic.Star(true, 18)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#A78BFA", fontSize: 13, fontWeight: 700 }}>Laisser un avis</div>
                  <div style={{ color: t3, fontSize: 11 }}>Votre expérience compte pour la communauté</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            )}

            {/* Information importante — "en_attente" signifie "accepté par
                l'établissement, en attente du jour J" ; "confirme" signifie
                présence déjà scannée. */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: detailEnRetard ? "#F87171" : t3, fontSize: 12, lineHeight: 1.5, marginBottom: 20 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>{Ic.Info()}</span>
              <span>
                {detail.statut === "nouveau" && !detailEnRetard && "Votre demande est en attente de réponse de l'établissement."}
                {detailEnRetard && "Ce rendez-vous a dépassé l'heure prévue sans confirmation de votre présence. Contactez l'établissement si vous êtes toujours sur place."}
                {detail.statut === "en_attente" && !detailEnRetard && getDaysUntil(detail.date_rdv) === 0 && "C'est aujourd'hui ! Présentez-vous avec votre QR code à l'heure prévue."}
                {detail.statut === "en_attente" && !detailEnRetard && getDaysUntil(detail.date_rdv) !== 0 && "Présentez-vous 10 minutes avant l'heure prévue avec votre QR code. Une pièce d'identité pourra être demandée."}
                {detail.statut === "confirme" && "Votre présence a été confirmée — votre rendez-vous est en cours."}
                {estAbsent(detail) && "Ce rendez-vous a été marqué absent — la situation est réglée, aucune action n'est requise."}
              </span>
            </div>

            {/* Actions */}
            {detailCanAct && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={() => { setModal({ type: "reporter", rdv: detail }); setMotif(""); setNouvelleDate(""); setNouvelleHeure(""); }} className="tap" style={{ height: 52, borderRadius: 16, border: "none", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  {Ic.Reschedule()} Reporter
                </button>
                <button onClick={() => { setModal({ type: "annuler", rdv: detail }); setMotif(""); }} className="tap" style={{ height: 52, borderRadius: 16, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#F87171", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  {Ic.X()} Annuler
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* ══ MODAL ANNULER ════════════════════════════════════════════════════ */}
      {modal?.type === "annuler" && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "24px 24px 0 0", padding: "8px 0 0", width: "100%", maxWidth: 480, animation: "slideUp 0.28s ease" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: brd, margin: "0 auto 20px" }}/>
            <div style={{ padding: "0 24px 40px" }}>
              <div style={{ color: "#F87171", fontSize: 20, fontWeight: 900, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>{Ic.XCircle()} Annuler le RDV</div>
              <div style={{ color: t3, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                RDV chez <strong style={{ color: t1 }}>{modal.rdv.institutions?.name}</strong> le {formatRelative(modal.rdv.date_rdv)} à {modal.rdv.heure_rdv}
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: t3, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Motif d&apos;annulation <span style={{ color: "#F87171" }}>*obligatoire</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {["Empêchement personnel", "Problème de santé", "Déplacement annulé", "Changement de plans"].map(m => (
                    <button key={m} onClick={() => setMotif(m)} className="tap" style={{ padding: "10px 14px", background: motif === m ? "rgba(248,113,113,0.12)" : card2, border: `1px solid ${motif === m ? "rgba(248,113,113,0.35)" : brd}`, borderRadius: 10, color: motif === m ? "#F87171" : t2, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                      {m}
                    </button>
                  ))}
                </div>
                <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ou écrivez votre motif..." rows={2}
                  style={{ width: "100%", background: card2, border: `1px solid ${brd}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, resize: "none", lineHeight: 1.5, color: t1 }}/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                <button onClick={() => setModal(null)} className="tap" style={{ padding: 14, borderRadius: 14, border: `1px solid ${brd}`, background: "transparent", color: t2, fontSize: 14, cursor: "pointer" }}>Retour</button>
                <button onClick={handleAnnuler} disabled={!motif.trim() || actionLoading === modal.rdv.id} className="tap" style={{ padding: 14, borderRadius: 14, border: "none", background: motif.trim() ? "#F87171" : "rgba(248,113,113,0.2)", color: motif.trim() ? "#fff" : "#F87171", fontSize: 14, fontWeight: 800, cursor: motif.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {actionLoading === modal.rdv.id ? <><YelenLoader size={14} color="#fff"/>Annulation…</> : "Confirmer l'annulation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL REPORTER ═══════════════════════════════════════════════════ */}
      {modal?.type === "reporter" && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "24px 24px 0 0", padding: "8px 0 0", width: "100%", maxWidth: 480, animation: "slideUp 0.28s ease" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: brd, margin: "0 auto 20px" }}/>
            <div style={{ padding: "0 24px 40px" }}>
              <div style={{ color: "#F5A623", fontSize: 20, fontWeight: 900, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>{Ic.RefreshCcw()} Reporter le RDV</div>
              <div style={{ color: t3, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                RDV actuel : <strong style={{ color: t1 }}>{formatRelative(modal.rdv.date_rdv)} à {modal.rdv.heure_rdv}</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div>
                  <div style={{ color: t3, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Nouvelle date</div>
                  <input type="date" value={nouvelleDate} min={new Date().toISOString().split("T")[0]} onChange={e => setNouvelleDate(e.target.value)}
                    style={{ width: "100%", background: card2, border: `1px solid ${brd}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, color: t1 }}/>
                </div>
                <div>
                  <div style={{ color: t3, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Nouvelle heure</div>
                  <input type="time" value={nouvelleHeure} onChange={e => setNouvelleHeure(e.target.value)}
                    style={{ width: "100%", background: card2, border: `1px solid ${brd}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, color: t1 }}/>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: t3, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Motif du report <span style={{ color: "#F87171" }}>*obligatoire</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {["Conflit d'horaires", "Raison professionnelle", "Raison médicale", "Voyage/déplacement"].map(m => (
                    <button key={m} onClick={() => setMotif(m)} className="tap" style={{ padding: "10px 14px", background: motif === m ? "rgba(245,166,35,0.1)" : card2, border: `1px solid ${motif === m ? "rgba(245,166,35,0.3)" : brd}`, borderRadius: 10, color: motif === m ? "#F5A623" : t2, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                      {m}
                    </button>
                  ))}
                </div>
                <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ou écrivez votre motif..." rows={2}
                  style={{ width: "100%", background: card2, border: `1px solid ${brd}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, resize: "none", lineHeight: 1.5, color: t1 }}/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                <button onClick={() => setModal(null)} className="tap" style={{ padding: 14, borderRadius: 14, border: `1px solid ${brd}`, background: "transparent", color: t2, fontSize: 14, cursor: "pointer" }}>Retour</button>
                <button onClick={handleReporter} disabled={!motif.trim() || !nouvelleDate || !nouvelleHeure || actionLoading === modal.rdv.id} className="tap" style={{ padding: 14, borderRadius: 14, border: "none", background: (motif.trim() && nouvelleDate && nouvelleHeure) ? "#F5A623" : "rgba(245,166,35,0.2)", color: (motif.trim() && nouvelleDate && nouvelleHeure) ? "#080812" : "#F5A623", fontSize: 14, fontWeight: 800, cursor: (motif.trim() && nouvelleDate && nouvelleHeure) ? "pointer" : "not-allowed" }}>
                  {actionLoading === modal.rdv.id ? "..." : "Confirmer le report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL AVIS ═══════════════════════════════════════════════════════ */}
      {modal?.type === "avis" && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "24px 24px 0 0", padding: "8px 0 0", width: "100%", maxWidth: 480, animation: "slideUp 0.28s ease" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: brd, margin: "0 auto 20px" }}/>
            <div style={{ padding: "0 24px 40px" }}>
              {!avisEnvoye ? (
                <>
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ color: "#F5A623", display: "flex", justifyContent: "center", marginBottom: 10 }}>{Ic.Star(true, 42)}</div>
                    <div style={{ color: t1, fontSize: 19, fontWeight: 800, marginBottom: 4 }}>Votre avis compte !</div>
                    <div style={{ color: t3, fontSize: 13, lineHeight: 1.6 }}>Comment s&apos;est passé votre RDV chez <strong style={{ color: t1 }}>{modal.rdv.institutions?.name}</strong> ?</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setAvisNote(n)} className="tap" style={{ background: "none", border: "none", cursor: "pointer", color: "#F5A623", opacity: n <= avisNote ? 1 : 0.2, transition: "all 0.15s", transform: n <= avisNote ? "scale(1.1)" : "scale(1)" }}>{Ic.Star(true, 38)}</button>
                    ))}
                  </div>
                  {avisNote > 0 && (
                    <div style={{ textAlign: "center", color: ["","#F87171","#FB923C","#FBBF24","#34D399","#34D399"][avisNote], fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
                      {["","Très mauvais","Décevant","Correct","Bien","Excellent !"][avisNote]}
                    </div>
                  )}
                  <input value={avisTitre} onChange={e => setAvisTitre(e.target.value)} placeholder="Titre (optionnel)..." maxLength={80}
                    style={{ width: "100%", background: card2, border: `1px solid ${brd}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: t1, marginBottom: 10 }}/>
                  <textarea value={avisCommentaire} onChange={e => setAvisCommentaire(e.target.value)} placeholder="Commentaire (optionnel)..." rows={3}
                    style={{ width: "100%", background: card2, border: `1px solid ${brd}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, resize: "none", lineHeight: 1.5, color: t1, marginBottom: 20 }}/>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
                    <button onClick={() => setModal(null)} className="tap" style={{ padding: 14, borderRadius: 14, border: `1px solid ${brd}`, background: "transparent", color: t2, fontSize: 14, cursor: "pointer" }}>Plus tard</button>
                    <button onClick={() => handleEnvoyerAvis(false)} disabled={avisNote === 0 || actionLoading !== null} className="tap" style={{ padding: 14, borderRadius: 14, border: "none", background: avisNote > 0 ? "#F5A623" : "rgba(245,166,35,0.2)", color: avisNote > 0 ? "#080812" : "#F5A623", fontSize: 14, fontWeight: 800, cursor: avisNote > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      {actionLoading !== null ? <><YelenLoader size={14} color="#080812"/>Envoi…</> : "Envoyer mon avis"}
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                    <div/>
                    <button onClick={() => handleEnvoyerAvis(true)} disabled={avisNote === 0 || actionLoading !== null} className="tap" style={{ padding: 8, borderRadius: 10, border: "none", background: "transparent", color: t3, fontSize: 12, fontWeight: 600, cursor: avisNote > 0 ? "pointer" : "not-allowed", textDecoration: "underline" }}>
                      Enregistrer comme brouillon (à finir plus tard)
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
                  <div style={{ color: "#34D399", display: "flex", justifyContent: "center", marginBottom: 14 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                  <div style={{ color: "#34D399", fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Merci pour votre avis !</div>
                  <div style={{ color: t3, fontSize: 13, lineHeight: 1.6 }}>Votre évaluation aide toute la communauté Yelen224.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL NOTIFICATIONS ══════════════════════════════════════════════ */}
      {modal?.type === "notifs" && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, maxHeight: "80svh", display: "flex", flexDirection: "column", animation: "slideUp 0.28s ease" }}>
            <div style={{ padding: "12px 24px 14px", borderBottom: `1px solid ${brd}`, flexShrink: 0 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: brd, margin: "0 auto 16px" }}/>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: t1, fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>{Ic.Bell()} Notifications</div>
                <button onClick={() => setModal(null)} style={{ background: card2, border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t3 }}>{Ic.X()}</button>
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {notifs.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                  <div style={{ color: t3, display: "flex", justifyContent: "center", marginBottom: 10 }}>{Ic.BellOff()}</div>
                  <div style={{ color: t3, fontSize: 14 }}>Aucune notification</div>
                </div>
              ) : notifs.map((n, i) => (
                <div key={n.id} onClick={() => { if (n.rdv_id) { router.push(`/messagerie?rdv_id=${n.rdv_id}`); setModal(null); } }} style={{ padding: "14px 20px", borderBottom: i < notifs.length - 1 ? `1px solid ${brd}` : "none", background: n.lu ? "transparent" : "rgba(245,166,35,0.05)", cursor: n.rdv_id ? "pointer" : "default", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: card2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                    {notifIcon(n.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: 13, fontWeight: n.lu ? 500 : 700, marginBottom: 3 }}>{n.titre}</div>
                    <div style={{ color: t2, fontSize: 12, lineHeight: 1.5, marginBottom: 4 }}>{n.message}</div>
                    <div style={{ color: t3, fontSize: 10 }}>{formatMsgTime(n.created_at)}</div>
                  </div>
                  {!n.lu && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#F5A623", flexShrink: 0, marginTop: 5 }}/>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
