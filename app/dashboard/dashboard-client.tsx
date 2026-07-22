"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { NotifPanel } from "@/components/NotifPanel";
import { LogoutFlow, CITOYEN_LOGOUT_COPY } from "@/components/LogoutFlow";
// ─── Types ────────────────────────────────────────────────────────────────────
type RDV = {
  id: string; date_rdv: string; heure_rdv?: string;
  statut: string; objet?: string;
  institution_id?: string; institution_name?: string;
};

type Paiement = {
  id: string;
  confirmation_code: string;
  service_nom: string;
  service_prix: number;
  statut: string;
  date_rdv: string;
  heure_rdv: string;
  institution_nom: string;
  created_at: string;
};

type UserData = { prenom: string; nom: string; phone: string; email?: string };
type Tab = "accueil" | "rdv" | "aide";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statutCfg(s: string) {
  switch (s) {
    case "confirme":   return { bg: "rgba(34,197,94,0.12)",   color: "#22c55e", label: "Confirmé",   icon: "✅" };
    case "en_attente": return { bg: "rgba(245,166,35,0.12)",  color: "#F5A623", label: "En attente", icon: "⏳" };
    case "annule":     return { bg: "rgba(239,68,68,0.12)",   color: "#ef4444", label: "Annulé",     icon: "❌" };
    case "termine":    return { bg: "rgba(59,130,246,0.12)",  color: "#3b82f6", label: "Terminé",    icon: "🏁" };
    case "no_show":    return { bg: "rgba(160,160,176,0.12)", color: "#A0A0B0", label: "Absent",     icon: "👻" };
    case "effectue":   return { bg: "rgba(59,130,246,0.12)",  color: "#3b82f6", label: "Effectué",   icon: "🏁" };
    default:           return { bg: "rgba(107,114,128,0.1)",  color: "#6b7280", label: s,            icon: "•" };
  }
}

function formatPrix(p: number) {
  return p.toLocaleString("fr-FR") + " FCFA";
}

function formatDate(date: string, heure?: string) {
  try {
    const d = new Date(date);
    const label = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    return heure ? `${label} · ${heure}` : label;
  } catch { return date; }
}

function formatDateCourt(date: string) {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch { return date; }
}

const initials = (p: string, n: string) =>
  [(p[0] ?? ""), (n[0] ?? "")].join("").toUpperCase() || "C";

const P = { pointerEvents: "none" as const };

const Ic = {
  Home:   (a?: boolean) => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Cal:    (a?: boolean) => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Help:   (a?: boolean) => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Pay:    (a?: boolean) => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Back:   () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>,
  Plus:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Clock:  () => <svg style={P} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Search: () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  User:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Flag:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  Phone:  () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17v-.08z"/></svg>,
  Mail:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Shield: () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Info:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  Doc:    () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  FAQ:    () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Bldg:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  Lock:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Sun:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  Out:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Edit:   () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Chev:   () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Warn:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Danger: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Coin:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2M9.5 9.5c.5-1.5 3.5-1.5 3.5.5s-3.5 2-3.5 4 3 2.5 3.5.5"/></svg>,
};

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ size = 36 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: Math.round(size * 0.28) + "px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(245,166,35,0.35)", flexShrink: 0 }}>
      <svg width={size * 0.48} height={size * 0.48} viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
      </svg>
    </div>
  );
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────
function ThemeFloating({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  const isDark = theme === "dark";
  return (
    <button onClick={onToggle} className="tap" style={{ position: "fixed", bottom: "96px", right: "16px", zIndex: 300, width: "40px", height: "40px", borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.1)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: isDark ? "#F5A623" : "#6b7280", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", transition: "all 0.2s" }}>
      {isDark ? Ic.Sun() : Ic.Moon()}
    </button>
  );
}

// ─── Welcome overlay ──────────────────────────────────────────────────────────
function WelcomeOverlay({ prenom, onDismiss }: { prenom: string; onDismiss: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(8,8,18,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", animation: "fadeIn 0.3s ease" }}>
      <div style={{ background: "linear-gradient(145deg,#1a1a2e,#16213e)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "28px", padding: "36px 28px", maxWidth: "360px", width: "100%", textAlign: "center", boxShadow: "0 40px 80px rgba(0,0,0,0.6)", animation: "slideUp 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(245,166,35,0.1)", border: "1.5px solid rgba(245,166,35,0.3)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 2.5s ease infinite" }}>
            <Logo size={52}/>
          </div>
        </div>
        <div style={{ color: "rgba(245,166,35,0.9)", fontSize: "10px", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>Bienvenue sur Yelen224</div>
        <h2 style={{ color: "#fff", fontSize: "26px", fontWeight: "900", margin: "0 0 12px", letterSpacing: "-0.5px", lineHeight: 1.2 }}>Ravi de vous avoir,<br/>{prenom} 👋</h2>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px", lineHeight: 1.7, margin: "0 0 28px" }}>Votre espace citoyen guinéen est prêt. Prenez vos rendez-vous en toute simplicité, où que vous soyez.</p>
        <button onClick={onDismiss} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "16px", background: "linear-gradient(135deg,#F5A623,#C8940A)", border: "none", color: "#080812", fontWeight: "800", fontSize: "15px", cursor: "pointer", boxShadow: "0 8px 24px rgba(245,166,35,0.4)" }}>
          Commencer →
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export function DashboardClient() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  const [authorized, setAuthorized]     = useState(false);
  const [userId, setUserId]             = useState<string | null>(null);
  const [user, setUser]                 = useState<UserData | null>(null);
  const [rdvs, setRdvs]                 = useState<RDV[]>([]);
  const [rdvTotal, setRdvTotal]         = useState(0);
  const [paiements, setPaiements]       = useState<Paiement[]>([]);
  const [paiementsTotal, setPaiementsTotal] = useState(0);
  const [totalDepense, setTotalDepense] = useState(0);
  const [nbAnnules, setNbAnnules]       = useState(0);
  const [loading, setLoading]           = useState(true);
  const [tab, setTab]                   = useState<Tab>("accueil");
  const [faqOpen, setFaqOpen]           = useState<number | null>(null);
  const [showWelcome, setShowWelcome]   = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [logoutOpen, setLogoutOpen]     = useState(false);
  const [showAllPaiements, setShowAllPaiements] = useState(false);
  // Chantier "Yelen Assistant" (20/07/2026) — header unifié avec le reste
  // de l'app (cloche + messages réels), demandé par Bryan : cet écran avait
  // jusqu'ici son propre bandeau simplifié (logo + avatar + déconnexion),
  // sans cloche ni messagerie, contrairement à app/page.tsx et aux autres
  // écrans citoyen.
  const [notifOpen, setNotifOpen]       = useState(false);
  const [notifCount, setNotifCount]     = useState(0);
  const [msgCount, setMsgCount]         = useState(0);

  // ── Chargement données ─────────────────────────────────────────────────────
  const loadData = useCallback(async (id: string) => {
    setLoading(true);

    // 1. Profil utilisateur — `name` retiré du select : colonne inexistante sur
    // `users` (jamais créée par migration, contrairement à institutions.name/
    // rdv.objet ; l'inscription citoyen écrit prenom/nom directement, cf.
    // api/citoyen/auth/register). La sélectionner faisait échouer toute la
    // requête (PostgREST rejette un select sur colonne inconnue) → user restait
    // null en permanence → "Bonjour Citoyen" et carte profil vide pour tout le monde.
    const { data: uRow } = await supabase
      .from("users")
      .select("prenom,nom,phone,email")
      .eq("id", id)
      .maybeSingle();

    if (uRow) {
      const r = uRow as any;
      const prenom = (r.prenom || "").trim();
      const nom = (r.nom || "").trim();
      setUser({ prenom: prenom || r.phone || "Citoyen", nom, phone: r.phone || "", email: r.email || "" });
    }

    // 2. RDV
    const { data: rdvData, count: rdvCount } = await supabase
      .from("rdv")
      .select("id,date_rdv,heure_rdv,statut,objet,institution_id", { count: "exact" })
      .eq("citoyen_id", id)
      .order("date_rdv", { ascending: false })
      .limit(10);

    if (rdvData) {
      const ids = [...new Set((rdvData as any[]).map(r => r.institution_id).filter(Boolean))];
      let instMap: Record<string, string> = {};
      if (ids.length) {
        const { data: ins } = await supabase.from("institutions").select("id,name").in("id", ids);
        (ins ?? []).forEach((i: any) => { instMap[i.id] = i.name; });
      }
      setRdvs((rdvData as any[]).map(r => ({ ...r, institution_name: instMap[r.institution_id] || "Institution" })));
      setRdvTotal(rdvCount ?? 0);

      // Compte des RDV annulés (global)
      const { count: cancelCount } = await supabase
        .from("rdv")
        .select("*", { count: "exact", head: true })
        .eq("citoyen_id", id)
        .eq("statut", "annule");
      setNbAnnules(cancelCount ?? 0);
    }

    // 3. Paiements (paid_bookings)
    const { data: paiData, count: paiCount } = await supabase
      .from("paid_bookings")
      .select(`
        id, confirmation_code, statut, date_rdv, heure_rdv, created_at,
        paid_services!inner(nom, prix),
        institutions!paid_bookings_institution_id_fkey(name)
      `, { count: "exact" })
      .eq("citoyen_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (paiData) {
      const mapped: Paiement[] = (paiData as any[]).map(row => ({
        id:                row.id,
        confirmation_code: row.confirmation_code,
        service_nom:       row.paid_services?.nom ?? "Service",
        service_prix:      row.paid_services?.prix ?? 0,
        statut:            row.statut,
        date_rdv:          row.date_rdv,
        heure_rdv:         row.heure_rdv ?? "",
        institution_nom:   row.institutions?.name ?? "Institution",
        created_at:        row.created_at,
      }));
      setPaiements(mapped);
      setPaiementsTotal(paiCount ?? 0);

      // Total dépensé (seulement les "confirme")
      const total = mapped
        .filter(p => p.statut === "confirme")
        .reduce((s, p) => s + p.service_prix, 0);
      setTotalDepense(total);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setAuthorized(true); setUserId(id);
    try {
      const visitKey = `yelen224_visited_${id}`;
      if (!localStorage.getItem(visitKey)) {
        setIsFirstVisit(true);
        localStorage.setItem(visitKey, "1");
      }
      // Vérifier si alerte déjà vue
      const alertKey = `yelen224_alert_annul_${id}`;
      if (localStorage.getItem(alertKey)) setAlertDismissed(true);
    } catch {}
    void loadData(id);
    (async () => {
      try {
        const [nD, mD] = await Promise.all([
          supabase.from("notifications").select("*", { count: "exact", head: true }).eq("destinataire_id", id).eq("destinataire_type", "citoyen").eq("lu", false),
          supabase.from("messages").select("*", { count: "exact", head: true }).eq("destinataire_citoyen_id", id).eq("lu", false),
        ]);
        setNotifCount(nD.count ?? 0);
        setMsgCount(mD.count ?? 0);
      } catch { /* silencieux — mêmes garanties que app/page.tsx */ }
    })();
  }, [router, loadData]);

  useEffect(() => {
    if (!loading && isFirstVisit && user) setShowWelcome(true);
  }, [loading, isFirstVisit, user]);

  const dismissAlert = () => {
    setAlertDismissed(true);
    if (userId) localStorage.setItem(`yelen224_alert_annul_${userId}`, "1");
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!authorized || loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
      <div style={{ width: "44px", height: "44px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const greet    = user?.prenom || "Citoyen";
  const ini      = initials(user?.prenom || "C", user?.nom || "");
  const cardBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.8)";
  const cardBord = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const subText  = C.textSubtle;
  const hour     = new Date().getHours();
  const timeGreet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  // Seuil alerte annulations : 5+
  const showAlertAnnul = nbAnnules >= 5 && !alertDismissed;

  // Paiements à afficher (3 par défaut, tous si expanded)
  const paiementsVisibles = showAllPaiements ? paiements : paiements.slice(0, 3);

  const FAQ_ITEMS = [
    { q: "Comment prendre un rendez-vous ?",              a: "Allez sur Recherche, trouvez l'institution souhaitée, cliquez sur Prendre un rendez-vous et choisissez un créneau disponible." },
    { q: "Puis-je annuler un rendez-vous ?",              a: "Oui, depuis Mes RDV, cliquez sur le rendez-vous puis Annuler. L'annulation doit être faite au moins 2h avant." },
    { q: "Comment fonctionne le badge vérifié ?",         a: "Les institutions avec le badge ✓ ont soumis leurs documents officiels et ont été validées par l'équipe Yelen224." },
    { q: "Mon numéro est-il visible ?",                   a: "Non, votre numéro est confidentiel et n'est jamais partagé sans votre accord." },
    { q: "Comment laisser un avis ?",                     a: "Vous pouvez laisser un avis uniquement après avoir effectué un rendez-vous confirmé avec l'institution." },
    { q: "Comment contacter le support ?",                a: "Via le centre d'aide, onglet Aide, ou directement par email à contact@yelen224.com — réponse sous 24h ouvrables." },
  ];

  const TABS: { key: Tab; label: string; icon: (a?: boolean) => React.ReactElement }[] = [
    { key: "accueil", label: "Accueil", icon: Ic.Home },
    { key: "rdv",     label: "Mes RDV", icon: Ic.Cal  },
    { key: "aide",    label: "Aide",    icon: Ic.Help  },
  ];
  // ── Header ────────────────────────────────────────────────────────────────
  // Même bandeau doré que les headers simplifiés de app/page.tsx (onglets
  // Recherche/RDV/Compte) — cohérence demandée par Bryan le 20/07/2026,
  // cet écran avait jusqu'ici son propre bandeau sombre sans cloche ni
  // messagerie. Mode sombre volontairement neutre, même convention.
  const hBg     = isDark ? C.pageBg : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
  const hText   = isDark ? C.text : "#080812";
  const hChip   = isDark ? C.cardBg : "#F5A623";
  const hIcon   = isDark ? hText : "#fff";
  const hBrd    = isDark ? C.border : "transparent";
  const hShadow = isDark ? "none" : "0 2px 8px rgba(245,166,35,0.35)";
  const Bandeau = () => (
    <div style={{ position: "sticky", top: 0, zIndex: 200, background: hBg, borderBottom: isDark ? `1px solid ${C.border}` : "none" }}>
      <div onClick={() => setTab("accueil")} style={{ height: "52px", display: "flex", alignItems: "center", gap: "10px", padding: "0 16px", cursor: "pointer" }}>
        <Logo size={30}/>
        <div style={{ flex: 1 }}/>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { setNotifOpen(o => !o); if (!notifOpen) setNotifCount(0); }} className="tap" style={{ position: "relative", width: "34px", height: "34px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: hIcon }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {notifCount > 0 && <span style={{ position: "absolute", top: "-3px", right: "-3px", backgroundColor: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "800", borderRadius: "10px", minWidth: "15px", height: "15px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{notifCount > 9 ? "9+" : notifCount}</span>}
          </button>
          <Link href="/messagerie/citoyen" className="tap" style={{ position: "relative", width: "34px", height: "34px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", color: hIcon, textDecoration: "none" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {msgCount > 0 && <span style={{ position: "absolute", top: "-3px", right: "-3px", backgroundColor: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "800", borderRadius: "10px", minWidth: "15px", height: "15px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{msgCount > 9 ? "9+" : msgCount}</span>}
          </Link>
          <Link href="/profil" style={{ textDecoration: "none" }}>
            <div className="tap" style={{ width: "34px", height: "34px", borderRadius: "50%", background: isDark ? "linear-gradient(135deg,#F5A623,#C8940A)" : "rgba(0,0,0,0.15)", border: `1px solid ${hBrd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900", color: isDark ? "#080812" : hIcon }}>
              {ini}
            </div>
          </Link>
          <button onClick={() => setLogoutOpen(true)} className="tap" style={{ width: "34px", height: "34px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            {Ic.Out()}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, color: C.text, fontFamily: "'SF Pro Text',-apple-system,'Helvetica Neue',sans-serif", paddingBottom: "88px", transition: "background-color 0.3s ease" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,166,35,0.3)}50%{box-shadow:0 0 0 12px rgba(245,166,35,0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
        .tap{transition:opacity 0.12s,transform 0.12s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:0.6;transform:scale(0.96)}
        a{-webkit-tap-highlight-color:transparent}
        input:focus{outline:none}
        .card-hover{transition:transform 0.15s,box-shadow 0.15s}
        .card-hover:hover{transform:translateY(-1px)}
        .alert-shake{animation:shake 0.4s ease}
      `}</style>

      {showWelcome && <WelcomeOverlay prenom={greet} onDismiss={() => setShowWelcome(false)}/>}
      <ThemeFloating theme={theme} onToggle={toggleTheme}/>
      <Bandeau/>
      {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} t1={C.text} t2={C.textMuted} t3={C.textSubtle} card={C.cardBg} card2={C.sectionAlt} brd={C.border} userId={userId}/>}

      <main style={{ padding: "16px 16px 0", animation: "fadeUp 0.25s ease" }}>

        {/* ═══════════════════════════════════════════════════════════════════
            ONGLET ACCUEIL
        ═══════════════════════════════════════════════════════════════════ */}
        {tab === "accueil" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

            {/* ── ALERTE ANNULATIONS (≥5) ── */}
            {showAlertAnnul && (
              <div className="alert-shake" style={{ background: isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.05)", border: "1.5px solid rgba(239,68,68,0.3)", borderRadius: "18px", padding: "16px 16px 14px", animation: "slideDown 0.35s ease", position: "relative", overflow: "hidden" }}>
                {/* Barre rouge top */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg,#ef4444,#dc2626)" }}/>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {Ic.Danger()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#ef4444", fontSize: "13px", fontWeight: "900", marginBottom: "4px", letterSpacing: "-0.2px" }}>
                      Alerte : {nbAnnules} annulations détectées
                    </div>
                    <div style={{ color: isDark ? "rgba(239,68,68,0.75)" : "#dc2626", fontSize: "12px", lineHeight: 1.6, marginBottom: "12px" }}>
                      Vous avez annulé <strong>{nbAnnules} rendez-vous</strong> sur Yelen224. Les annulations répétées peuvent affecter votre accès à certains services et votre priorité de réservation.
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Link href="/mes-rdv" className="tap" style={{ flex: 1, padding: "9px 12px", background: "#ef4444", borderRadius: "10px", color: "#fff", fontSize: "12px", fontWeight: "800", textDecoration: "none", textAlign: "center" }}>
                        Voir mes RDV
                      </Link>
                      <button onClick={dismissAlert} className="tap" style={{ padding: "9px 12px", background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", color: "#ef4444", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                        Compris
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── HERO PERSONNALISÉ ── */}
            <div style={{ background: isDark ? "linear-gradient(135deg,rgba(245,166,35,0.1),rgba(245,166,35,0.04))" : "linear-gradient(135deg,rgba(245,166,35,0.08),rgba(255,255,255,0.9))", border: "1.5px solid rgba(245,166,35,0.2)", borderRadius: "22px", padding: "22px 20px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "130px", height: "130px", borderRadius: "50%", background: "rgba(245,166,35,0.07)", pointerEvents: "none" }}/>
              <div style={{ color: "#F5A623", fontSize: "10px", fontWeight: "800", letterSpacing: "1.8px", textTransform: "uppercase", marginBottom: "8px" }}>{timeGreet} 👋</div>
              <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "900", margin: "0 0 8px", letterSpacing: "-0.5px", lineHeight: 1.15 }}>
                {greet}{user?.nom ? ` ${user.nom.split(" ")[0]}` : ""}
              </h1>
              {rdvTotal === 0 ? (
                <p style={{ color: subText, fontSize: "13px", margin: "0 0 18px", lineHeight: 1.6 }}>Votre espace est prêt — commencez par trouver une institution et planifier votre premier rendez-vous.</p>
              ) : rdvs.some(r => r.statut === "confirme") ? (
                <p style={{ color: subText, fontSize: "13px", margin: "0 0 18px", lineHeight: 1.6 }}>Vous avez un rendez-vous confirmé. Vérifiez les détails et préparez vos documents.</p>
              ) : (
                <p style={{ color: subText, fontSize: "13px", margin: "0 0 18px", lineHeight: 1.6 }}>Bienvenue. Planifiez vos prochains rendez-vous administratifs en quelques secondes.</p>
              )}
              <Link href="/recherche" className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", borderRadius: "14px", padding: "12px 20px", fontWeight: "800", fontSize: "13px", textDecoration: "none", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
                {Ic.Search()} Trouver un service
              </Link>
            </div>

            {/* ── STATS 2×2 ── */}
            <div>
              <div style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "3px", height: "18px", background: "linear-gradient(180deg,#F5A623,#F5A62388)", borderRadius: "2px" }}/>
                Mes statistiques
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Total RDV",    value: rdvTotal,                                              color: "#F5A623" },
                  { label: "Confirmés",    value: rdvs.filter(r => r.statut === "confirme").length,    color: "#22c55e" },
                  { label: "En attente",   value: rdvs.filter(r => r.statut === "en_attente").length,  color: "#F59E0B" },
                  { label: "Annulés",      value: nbAnnules,                                             color: nbAnnules >= 5 ? "#ef4444" : "#6b7280" },
                ].map(s => (
                  <div key={s.label} onClick={() => setTab("rdv")} className="tap card-hover" style={{ backgroundColor: cardBg, border: `1px solid ${s.label === "Annulés" && nbAnnules >= 5 ? "rgba(239,68,68,0.25)" : cardBord}`, borderRadius: "18px", padding: "18px 16px", cursor: "pointer" }}>
                    <div style={{ color: s.color, fontSize: "28px", fontWeight: "900", lineHeight: 1, marginBottom: "6px" }}>{s.value}</div>
                    <div style={{ color: subText, fontSize: "11px", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                      {s.label}
                      {s.label === "Annulés" && nbAnnules >= 5 && <span style={{ color: "#ef4444", fontSize: "10px" }}>⚠️</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── SECTION PAIEMENTS ── */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "3px", height: "18px", background: "linear-gradient(180deg,#00C896,#00C89688)", borderRadius: "2px" }}/>
                  Mes paiements
                  {paiementsTotal > 0 && (
                    <span style={{ background: "rgba(0,200,150,0.1)", color: "#00C896", fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", border: "1px solid rgba(0,200,150,0.2)" }}>
                      {paiementsTotal}
                    </span>
                  )}
                </div>
                {paiementsTotal > 3 && (
                  <button onClick={() => setShowAllPaiements(v => !v)} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                    {showAllPaiements ? "Réduire" : `Voir tout (${paiementsTotal})`}
                  </button>
                )}
              </div>

              {/* Récapitulatif financier */}
              {paiements.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ background: isDark ? "rgba(0,200,150,0.06)" : "rgba(0,200,150,0.04)", border: "1px solid rgba(0,200,150,0.2)", borderRadius: "16px", padding: "16px" }}>
                    <div style={{ color: subText, fontSize: "9px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Total dépensé</div>
                    <div style={{ color: "#00C896", fontSize: "18px", fontWeight: "900", letterSpacing: "-0.4px", lineHeight: 1 }}>{formatPrix(totalDepense)}</div>
                    <div style={{ color: subText, fontSize: "10px", marginTop: "4px" }}>{paiements.filter(p => p.statut === "confirme").length} service(s) payé(s)</div>
                  </div>
                  <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "16px", padding: "16px" }}>
                    <div style={{ color: subText, fontSize: "9px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>En attente</div>
                    <div style={{ color: "#F5A623", fontSize: "18px", fontWeight: "900", letterSpacing: "-0.4px", lineHeight: 1 }}>
                      {formatPrix(paiements.filter(p => p.statut === "en_attente").reduce((s, p) => s + p.service_prix, 0))}
                    </div>
                    <div style={{ color: subText, fontSize: "10px", marginTop: "4px" }}>{paiements.filter(p => p.statut === "en_attente").length} en cours</div>
                  </div>
                </div>
              )}

              {/* Liste des paiements */}
              {paiements.length === 0 ? (
                <div style={{ backgroundColor: cardBg, border: `1.5px dashed ${cardBord}`, borderRadius: "18px", padding: "32px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: "28px", marginBottom: "10px" }}>💳</div>
                  <div style={{ color: C.text, fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Aucun paiement</div>
                  <div style={{ color: subText, fontSize: "12px" }}>Vos paiements de services apparaîtront ici.</div>
                </div>
              ) : (
                <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "18px", overflow: "hidden" }}>
                  {paiementsVisibles.map((p, i, arr) => {
                    const st = statutCfg(p.statut);
                    return (
                      <div key={p.id} style={{ padding: "14px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` : "none", display: "flex", alignItems: "center", gap: "12px" }}>
                        {/* Icône statut */}
                        <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: st.bg, border: `1px solid ${st.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>
                          {st.icon}
                        </div>

                        {/* Détails */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Ligne 1 : service + montant */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "3px" }}>
                            <div style={{ color: C.text, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                              {p.service_nom}
                            </div>
                            <div style={{ color: p.statut === "confirme" ? "#00C896" : p.statut === "annule" ? "#ef4444" : C.text, fontSize: "13px", fontWeight: "900", flexShrink: 0, letterSpacing: "-0.3px" }}>
                              {p.statut === "annule" ? <span style={{ textDecoration: "line-through", opacity: 0.6 }}>{formatPrix(p.service_prix)}</span> : formatPrix(p.service_prix)}
                            </div>
                          </div>

                          {/* Ligne 2 : institution + date */}
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                            <span style={{ color: subText, fontSize: "11px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              🏛 {p.institution_nom}
                            </span>
                            <span style={{ color: subText, opacity: 0.4, fontSize: "10px" }}>·</span>
                            <span style={{ color: subText, fontSize: "11px", flexShrink: 0, display: "flex", alignItems: "center", gap: "3px" }}>
                              <span style={{ display: "inline-flex" }}>{Ic.Clock()}</span>
                              {formatDate(p.date_rdv, p.heure_rdv)}
                            </span>
                          </div>

                          {/* Ligne 3 : code + statut */}
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ color: subText, fontSize: "10px", fontFamily: "monospace", fontWeight: "700", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", padding: "1px 7px", borderRadius: "5px", letterSpacing: "0.5px" }}>
                              #{p.confirmation_code}
                            </span>
                            <span style={{ background: st.bg, color: st.color, fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px" }}>
                              {st.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Bouton voir plus inline */}
                  {!showAllPaiements && paiementsTotal > 3 && (
                    <button onClick={() => setShowAllPaiements(true)} className="tap" style={{ width: "100%", padding: "13px", background: "none", border: "none", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`, color: "#F5A623", fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      {Ic.Coin()} Voir les {paiementsTotal} paiements
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── RDV RÉCENTS ── */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "3px", height: "18px", background: "linear-gradient(180deg,#F5A623,#F5A62388)", borderRadius: "2px" }}/>
                  Rendez-vous récents
                </div>
                <Link href="/mes-rdv" style={{ color: "#F5A623", fontSize: "12px", fontWeight: "700", textDecoration: "none" }}>Voir tout</Link>
              </div>
              {rdvs.length === 0 ? (
                <div style={{ backgroundColor: cardBg, border: `1.5px dashed ${cardBord}`, borderRadius: "18px", padding: "36px 20px", textAlign: "center" }}>
                  <div style={{ color: "#F5A623", display: "flex", justifyContent: "center", marginBottom: "12px", opacity: 0.6 }}>{Ic.Cal()}</div>
                  <div style={{ color: C.text, fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Aucun rendez-vous</div>
                  <div style={{ color: subText, fontSize: "12px", marginBottom: "16px" }}>Prenez votre premier RDV dès maintenant.</div>
                  <Link href="/recherche" className="tap" style={{ display: "inline-block", background: "#F5A623", color: "#080812", padding: "10px 20px", borderRadius: "12px", fontWeight: "700", fontSize: "13px", textDecoration: "none" }}>Rechercher</Link>
                </div>
              ) : (
                <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "18px", overflow: "hidden" }}>
                  {rdvs.slice(0, 4).map((r, i, arr) => {
                    const st = statutCfg(r.statut);
                    return (
                      <Link key={r.id} href="/mes-rdv" className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` : "none", textDecoration: "none" }}>
                        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(245,166,35,0.09)", border: "1px solid rgba(245,166,35,0.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", flexShrink: 0 }}>{Ic.Cal()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.institution_name}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: subText, fontSize: "11px", marginTop: "2px" }}>
                            <span style={{ display: "inline-flex" }}>{Ic.Clock()}</span>
                            <span>{formatDateCourt(r.date_rdv)}{r.heure_rdv ? ` · ${r.heure_rdv}` : ""}</span>
                          </div>
                        </div>
                        <span style={{ background: st.bg, color: st.color, fontSize: "10px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px", flexShrink: 0 }}>{st.label}</span>
                      </Link>
                    );
                  })}
                  {rdvTotal > 4 && (
                    <Link href="/mes-rdv" style={{ display: "block", padding: "12px", textAlign: "center", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`, color: "#F5A623", fontSize: "12px", fontWeight: "700", textDecoration: "none" }}>
                      Voir les {rdvTotal} rendez-vous
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* ── ACTIONS RAPIDES ── */}
            <div>
              <div style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "3px", height: "18px", background: "linear-gradient(180deg,#F5A623,#F5A62388)", borderRadius: "2px" }}/>
                Actions rapides
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                {[
                  { label: "Recherche",    href: "/recherche",   I: Ic.Search(),  color: "#F5A623", bg: "rgba(245,166,35,0.08)" },
                  { label: "Mes RDV",      href: "/mes-rdv",     I: Ic.Cal(),     color: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
                  { label: "Mon profil",   href: "/profil",      I: Ic.User(),    color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
                  { label: "Signalement",  href: "/signalement", I: Ic.Flag(),    color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
                  { label: "Institutions", href: "/recherche",   I: Ic.Bldg(),    color: "#a855f7", bg: "rgba(168,85,247,0.08)" },
                  { label: "Contact",      href: "/contact",     I: Ic.Phone(),   color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
                ].map(a => (
                  <Link key={a.label} href={a.href} className="tap card-hover" style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "16px", padding: "14px 8px", textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "7px", textAlign: "center" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: a.bg, display: "flex", alignItems: "center", justifyContent: "center", color: a.color }}>{a.I}</div>
                    <span style={{ color: C.text, fontSize: "11px", fontWeight: "700", lineHeight: 1.2 }}>{a.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* ── PROFIL RAPIDE ── */}
            <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "18px", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "3px", height: "18px", background: "linear-gradient(180deg,#F5A623,#F5A62388)", borderRadius: "2px" }}/>
                  Mon profil
                </div>
                <Link href="/profil" className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", color: "#F5A623", fontSize: "12px", fontWeight: "700", textDecoration: "none" }}>
                  {Ic.Edit()} Modifier
                </Link>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>{ini}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: "16px", fontWeight: "800", marginBottom: "2px" }}>{user?.prenom} {user?.nom}</div>
                  <div style={{ color: subText, fontSize: "12px" }}>{user?.phone}</div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ONGLET MES RDV
        ═══════════════════════════════════════════════════════════════════ */}
        {tab === "rdv" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button onClick={() => setTab("accueil")} className="tap" style={{ width: "34px", height: "34px", borderRadius: "50%", background: cardBg, border: `1px solid ${cardBord}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.text }}>
                  {Ic.Back()}
                </button>
                <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: 0, letterSpacing: "-0.5px" }}>Mes rendez-vous</h2>
              </div>
              <Link href="/recherche" className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", borderRadius: "12px", padding: "9px 14px", fontWeight: "800", fontSize: "13px", textDecoration: "none", boxShadow: "0 4px 14px rgba(245,166,35,0.3)" }}>
                {Ic.Plus()} Nouveau
              </Link>
            </div>

            {/* Alerte annulations dans l'onglet RDV aussi */}
            {showAlertAnnul && (
              <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "14px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                {Ic.Danger()}
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#ef4444", fontSize: "12px", fontWeight: "800" }}>{nbAnnules} annulations sur votre compte</div>
                  <div style={{ color: isDark ? "rgba(239,68,68,0.65)" : "#dc2626", fontSize: "11px", marginTop: "2px" }}>Évitez les annulations tardives pour maintenir votre accès prioritaire.</div>
                </div>
              </div>
            )}

            {rdvTotal === 0 ? (
              <div style={{ backgroundColor: cardBg, border: `1.5px dashed ${cardBord}`, borderRadius: "20px", padding: "48px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "30px", marginBottom: "10px" }}>📅</div>
                <div style={{ color: C.text, fontSize: "15px", fontWeight: "700", marginBottom: "6px" }}>Aucun rendez-vous</div>
                <div style={{ color: subText, fontSize: "12px", marginBottom: "18px" }}>Recherchez une institution pour planifier votre premier RDV.</div>
                <Link href="/recherche" className="tap" style={{ display: "inline-block", background: "#F5A623", color: "#080812", padding: "12px 24px", borderRadius: "14px", fontWeight: "700", fontSize: "13px", textDecoration: "none" }}>Rechercher une institution</Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {rdvs.map((r, i) => {
                  const st = statutCfg(r.statut);
                  return (
                    <Link key={r.id} href={`/institution/${r.institution_id}`} className="tap card-hover" style={{ backgroundColor: cardBg, border: `1px solid ${r.statut === "annule" ? "rgba(239,68,68,0.15)" : cardBord}`, borderRadius: "18px", padding: "14px 16px", textDecoration: "none", display: "block", animation: `fadeUp 0.2s ease ${i * 0.04}s both` }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                        <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: st.bg, border: `1px solid ${st.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>{st.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                            <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.institution_name}</div>
                            <span style={{ background: st.bg, color: st.color, fontSize: "10px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px", flexShrink: 0 }}>{st.label}</span>
                          </div>
                          <div style={{ color: subText, fontSize: "12px", marginBottom: "2px" }}>{r.objet || "Rendez-vous général"}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: subText, fontSize: "11px" }}>
                            <span style={{ display: "inline-flex" }}>{Ic.Clock()}</span>
                            <span>{new Date(r.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}{r.heure_rdv ? ` à ${r.heure_rdv}` : ""}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {rdvTotal > 10 && (
                  <Link href="/mes-rdv" style={{ display: "block", backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "14px", padding: "14px", textAlign: "center", color: "#F5A623", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>
                    Voir tous les {rdvTotal} rendez-vous
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ONGLET AIDE
        ═══════════════════════════════════════════════════════════════════ */}
        {tab === "aide" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={() => setTab("accueil")} className="tap" style={{ width: "34px", height: "34px", borderRadius: "50%", background: cardBg, border: `1px solid ${cardBord}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.text }}>
                {Ic.Back()}
              </button>
              <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: 0, letterSpacing: "-0.5px" }}>Centre d'aide</h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { I: Ic.Flag(),  title: "Signaler un problème", desc: "Comportement inapproprié ou incident.", href: "/signalement", color: "#ef4444", bg: "rgba(239,68,68,0.06)",   brd: "rgba(239,68,68,0.14)"   },
                { I: Ic.Phone(), title: "Contacter le support", desc: "Lun–Ven · 8h–18h GMT.",                href: "/contact",    color: "#3b82f6", bg: "rgba(59,130,246,0.06)", brd: "rgba(59,130,246,0.14)" },
                { I: Ic.Bldg(),  title: "Institutions",         desc: "Toutes les institutions disponibles.", href: "/recherche",  color: "#a855f7", bg: "rgba(168,85,247,0.06)", brd: "rgba(168,85,247,0.14)" },
              ].map(a => (
                <Link key={a.title} href={a.href} className="tap card-hover" style={{ background: a.bg, border: `1px solid ${a.brd}`, borderRadius: "16px", padding: "15px 16px", textDecoration: "none", display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: a.bg, border: `1px solid ${a.brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: a.color, flexShrink: 0 }}>{a.I}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: a.color, fontSize: "14px", fontWeight: "800", marginBottom: "2px" }}>{a.title}</div>
                    <div style={{ color: subText, fontSize: "12px" }}>{a.desc}</div>
                  </div>
                  <div style={{ color: subText, flexShrink: 0 }}>{Ic.Chev()}</div>
                </Link>
              ))}
            </div>

            <div>
              <div style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "3px", height: "18px", background: "linear-gradient(180deg,#F5A623,#F5A62388)", borderRadius: "2px" }}/>
                Questions fréquentes
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {FAQ_ITEMS.map((item, i) => (
                  <div key={i} onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="tap" style={{ backgroundColor: cardBg, border: `1px solid ${faqOpen === i ? "rgba(245,166,35,0.3)" : cardBord}`, borderRadius: "14px", overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s" }}>
                    <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ color: C.text, fontSize: "13px", fontWeight: "700", lineHeight: 1.35, flex: 1 }}>{item.q}</span>
                      <span style={{ color: "#F5A623", fontSize: "20px", lineHeight: 1, transition: "transform 0.2s", transform: faqOpen === i ? "rotate(45deg)" : "rotate(0deg)", flexShrink: 0, fontWeight: "300" }}>+</span>
                    </div>
                    {faqOpen === i && (
                      <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`, animation: "fadeIn 0.15s ease" }}>
                        <p style={{ color: subText, fontSize: "13px", lineHeight: 1.7, margin: "12px 0 0" }}>{item.a}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "16px", padding: "18px 16px" }}>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", marginBottom: "4px" }}>Besoin d'aide personnalisée ?</div>
              <div style={{ color: subText, fontSize: "12px", marginBottom: "14px" }}>Notre équipe répond sous 24h ouvrables.</div>
              <a href="mailto:contact@yelen224.com" className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", borderRadius: "12px", padding: "11px 18px", fontWeight: "700", fontSize: "13px", textDecoration: "none" }}>
                {Ic.Mail()} contact@yelen224.com
              </a>
            </div>

            <div style={{ backgroundColor: cardBg, border: `1px solid ${cardBord}`, borderRadius: "18px", padding: "6px 4px" }}>
              {[
                { label: "FAQ",                         href: "/faq",              I: Ic.FAQ()    },
                { label: "Contact",                     href: "/contact",          I: Ic.Phone()  },
                { label: "CGU",                         href: "/cgu",              I: Ic.Doc()    },
                { label: "Politique de confidentialité",href: "/confidentialite",  I: Ic.Lock()   },
                { label: "Mentions légales",            href: "/mentions-legales", I: Ic.Shield() },
                { label: "À propos de Yelen224",        href: "/a-propos",         I: Ic.Info()   },
              ].map((item, i, arr) => (
                <Link key={item.label} href={item.href} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` : "none", textDecoration: "none", color: subText, fontSize: "13px", fontWeight: "600" }}>
                  <span style={{ color: subText, opacity: 0.7 }}>{item.I}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <span style={{ opacity: 0.4 }}>{Ic.Chev()}</span>
                </Link>
              ))}
            </div>

            <div style={{ textAlign: "center", color: subText, fontSize: "10px", opacity: 0.5, paddingBottom: "8px" }}>
              Yelen224 · v1.0 · République de Guinée
            </div>
          </div>
        )}
      </main>

      {/* ── BOTTOM NAV ── */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, backgroundColor: isDark ? "rgba(8,8,18,0.97)" : "rgba(250,250,252,0.97)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`, paddingBottom: "env(safe-area-inset-bottom)", display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", background: "none", border: "none", padding: "10px 4px 9px", cursor: "pointer", color: active ? "#F5A623" : subText, transition: "color 0.15s", position: "relative" }}>
              {active && <div style={{ position: "absolute", top: "0", width: "28px", height: "2.5px", background: "#F5A623", borderRadius: "0 0 3px 3px" }}/>}
              <span style={{ marginTop: "6px" }}>{t.icon(active)}</span>
              <span style={{ fontSize: "10px", fontWeight: active ? "800" : "600", letterSpacing: "0.1px" }}>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {logoutOpen && (
        <LogoutFlow
          onClose={() => setLogoutOpen(false)}
          redirectTo="/login?logged_out=1"
          copy={CITOYEN_LOGOUT_COPY}
        />
      )}
    </div>
  );
}