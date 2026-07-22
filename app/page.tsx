"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { YELEN224_USER_ID_KEY, YELEN224_LAST_TAB_KEY } from "@/lib/auth/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isWebAuthnSupported, registerBiometrie, authenticateBiometrie } from "@/lib/auth/citoyenBiometrie";
import { MonAssistant } from "@/components/MonAssistant";
import { formatYelenId } from "@/lib/citoyenIdentite";
import { souscrirePush } from "@/lib/pushClient";
import { NotifPanel } from "@/components/NotifPanel";
import { rdvEstEnRetard } from "@/lib/rdvGating";
import { LogoutFlow, CITOYEN_LOGOUT_COPY } from "@/components/LogoutFlow";

const CarteMapHome = dynamic(() => import("@/components/CarteMapHome"), { ssr: false });

async function ft<T>(p: Promise<T> | PromiseLike<T>, ms = 5000): Promise<T | null> {
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms))
    ]);
  } catch { return null; }
}

const P = { pointerEvents: "none" as const };

// Version affichée en pied de l'onglet Compte (décision produit
// 18/07/2026) — distincte de la "Version 1.0 — Mars 2025" des pages
// légales (CGU/Confidentialité), qui versionne le texte juridique, pas
// l'application. Mise à jour manuelle par Bryan à chaque étape notable
// (celle-ci reflète le chantier "Mon compte" + Journal d'activité).
const YELEN_APP_VERSION = "2.334.0-387";

// ============================================================
// ICÔNES
// ============================================================
const Ic = {
  Home:     (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Search:   (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Cal:      (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Msg:      (a?: boolean, b?: number) => <span style={{ position: "relative", display: "inline-flex", pointerEvents: "none" }}><svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>{b ? <span style={{ position: "absolute", top: "-4px", right: "-4px", backgroundColor: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "800", borderRadius: "10px", minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none" }}>{b}</span> : null}</span>,
  User:     (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Bell:     (a?: boolean, b?: number) => <span style={{ position: "relative", display: "inline-flex", pointerEvents: "none" }}><svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>{!!b && <span style={{ position: "absolute", top: "-4px", right: "-4px", backgroundColor: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "800", borderRadius: "10px", minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none" }}>{b > 9 ? "9+" : b}</span>}</span>,
  X:        () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Back:     () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>,
  Chev:     () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Shield:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Star:     (f?: boolean) => <svg style={P} width="11" height="11" viewBox="0 0 24 24" fill={f ? "#F5A623" : "none"} stroke="#F5A623" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Clock:    () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Plus:     () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Map:      () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Globe:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Bldg:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  Hosp:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  Info:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Help:     () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Lock:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Out:      () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Expand:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
  Notif:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Trash:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Settings: (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  QR:       () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>,
  Pay:      () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Finger:   () => <svg style={P} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M8 11a4 4 0 0 0 8 0"/><path d="M12 18v4"/><path d="M4 15.5A9 9 0 0 0 20 15"/></svg>,
  Award:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>,
  TrendUp:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Doc:      () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Check:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Bank:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
  Device:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
};

// ============================================================
// TYPES
// ============================================================
type Tab = "accueil" | "recherche" | "rdv" | "compte";
type RDV = { id: string; date_rdv: string; heure_rdv?: string; statut: string; objet?: string; institution_name?: string; presence_status?: string };
type Inst = { id: string; name: string; category?: string; ville?: string; quartier?: string; adresse?: string; latitude?: number; longitude?: number; phone?: string; logo?: string; moyenne_avis?: number; nb_avis?: number; badge_verifie?: boolean; disponibilites?: any };
function stInfo(s: string) {
  switch (s) {
    case "confirme":   return { c: "#22c55e", bg: "rgba(34,197,94,0.12)",   l: "Confirmé" };
    case "en_attente": return { c: "#F5A623", bg: "rgba(245,166,35,0.12)",  l: "En attente" };
    case "annule":     return { c: "#ef4444", bg: "rgba(239,68,68,0.12)",   l: "Annulé" };
    case "effectue":   return { c: "#3b82f6", bg: "rgba(59,130,246,0.12)",  l: "Effectué" };
    case "present":    return { c: "#22c55e", bg: "rgba(34,197,94,0.12)",   l: "Présent ✓" };
    case "absent":     return { c: "#ef4444", bg: "rgba(239,68,68,0.12)",   l: "Absent" };
    default:           return { c: "#8E8E93", bg: "rgba(142,142,147,0.12)", l: s };
  }
}

async function handleShareYelen() {
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const text = "Découvre Yelen224 — prends rendez-vous en ligne avec les hôpitaux, mairies, banques et ambassades de Guinée, sans faire la queue.";
  try {
    if (navigator.share) {
      await navigator.share({ title: "Yelen224", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      window.alert("Lien copié — partagez-le avec vos proches !");
    }
  } catch {}
}

// ============================================================
// LOGO YELEN224
// ============================================================
function Logo({ size = 38, textSize = 16, subSize = 8, color = "#fff" }: { size?: number; textSize?: number; subSize?: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, backgroundColor: "#F5A623", borderRadius: "28%", transform: "rotate(8deg)", opacity: 0.22 }}/>
        <div style={{ position: "relative", width: size, height: size, backgroundColor: "#F5A623", borderRadius: "28%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 12px rgba(245,166,35,0.45)" }}>
          <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
          </svg>
        </div>
      </div>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: `${textSize}px`, fontWeight: "900", letterSpacing: "0.5px", color }}>YELEN224</div>
        <div style={{ fontSize: `${subSize}px`, fontWeight: "700", letterSpacing: "2px", color: "#F5A623", marginTop: "2px" }}>REPUBLIQUE DE GUINEE</div>
      </div>
    </div>
  );
}

// ============================================================
// WEBAUTHN — Biométrie réelle, vérifiée serveur (Lot C, 18/07/2026)
// ============================================================
// isWebAuthnSupported/registerBiometrie/authenticateBiometrie extraites
// dans lib/auth/citoyenBiometrie.ts (correctif Lot E, 18/07/2026) pour
// être réutilisées aussi par l'écran Sécurité (app/compte/securite) sans
// dupliquer la cérémonie WebAuthn.

// ============================================================
// BIOMETRIE MODAL — Réel WebAuthn (empreinte / Face ID)
// ============================================================
function BiometrieModal({ onSuccess, onClose, prenom, isDark, card, t1, t2, brd, userId }: {
  onSuccess: () => void; onClose: () => void; prenom: string;
  isDark: boolean; card: string; t1: string; t2: string; brd: string;
  userId: string;
}) {
  const [phase, setPhase] = useState<"wait" | "scanning" | "success" | "fail" | "unsupported">("wait");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Vérifier support WebAuthn dès l'ouverture
    if (!isWebAuthnSupported()) {
      setPhase("unsupported");
    }
  }, []);

  async function handleScan() {
    setPhase("scanning");
    setErrorMsg("");

    try {
      const isRegistered = localStorage.getItem("yelen224_bio_registered") === "1";

      let ok = false;
      if (!isRegistered) {
        // Première fois : enregistrer l'empreinte
        const result = await registerBiometrie(userId);
        ok = result.ok;
        if (!result.ok && result.reason === "unsupported") {
          setPhase("unsupported");
          return;
        }
      } else {
        // Déjà enregistré : juste s'authentifier
        ok = await authenticateBiometrie(userId);
      }

      if (ok) {
        setPhase("success");
        setTimeout(() => { onSuccess(); }, 1000);
      } else {
        setPhase("fail");
        setErrorMsg("Authentification échouée. Réessayez.");
      }
    } catch {
      setPhase("fail");
      setErrorMsg("Erreur biométrique. Utilisez votre code PIN.");
    }
  }

  function handleRetry() {
    setPhase("wait");
    setErrorMsg("");
  }

  const ringColor =
    phase === "success" ? "#22c55e" :
    phase === "fail" ? "#ef4444" :
    phase === "scanning" ? "#F5A623" :
    isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ backgroundColor: card, borderRadius: "28px", padding: "40px 28px 36px", maxWidth: "340px", width: "100%", textAlign: "center", border: `1px solid ${brd}`, boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ width: "60px", height: "4px", background: "linear-gradient(90deg,#CE1126 33.3%,#FCD20F 33.3% 66.6%,#009A44 66.6%)", borderRadius: "2px", margin: "0 auto 28px" }}/>
        <Logo size={42} textSize={17} subSize={8} color={t1}/>
        <div style={{ marginTop: "28px", marginBottom: "8px", color: t1, fontSize: "18px", fontWeight: "800" }}>
          {phase === "success" ? "Identité vérifiée ✓" :
           phase === "fail" ? "Échec de vérification" :
           phase === "unsupported" ? "Non disponible" :
           `Bonjour, ${prenom}`}
        </div>
        <div style={{ color: t2, fontSize: "13px", marginBottom: "36px", lineHeight: 1.5 }}>
          {phase === "wait" && (localStorage.getItem("yelen224_bio_registered") === "1"
            ? "Utilisez votre empreinte ou Face ID pour accéder à votre espace"
            : "Enregistrez votre empreinte pour une connexion sécurisée")}
          {phase === "scanning" && "Authentification en cours..."}
          {phase === "success" && "Accès autorisé — YelenID vérifié"}
          {phase === "fail" && (errorMsg || "Authentification échouée.")}
          {phase === "unsupported" && "La biométrie n'est pas disponible sur cet appareil."}
        </div>

        {/* Cercle biométrique */}
        <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 32px" }}>
          {phase === "scanning" && (
            <>
              <div style={{ position: "absolute", inset: "-12px", borderRadius: "50%", border: "2px solid rgba(245,166,35,0.3)", animation: "pingRing 1.5s ease-out infinite" }}/>
              <div style={{ position: "absolute", inset: "-24px", borderRadius: "50%", border: "1.5px solid rgba(245,166,35,0.15)", animation: "pingRing 1.5s ease-out infinite 0.3s" }}/>
            </>
          )}
          {phase === "success" && (
            <div style={{ position: "absolute", inset: "-12px", borderRadius: "50%", border: "2px solid rgba(34,197,94,0.4)", animation: "pingRing 1s ease-out infinite" }}/>
          )}
          <div style={{ width: "120px", height: "120px", borderRadius: "50%",
            background:
              phase === "success" ? "linear-gradient(135deg,#22c55e,#16a34a)" :
              phase === "fail" ? "linear-gradient(135deg,#ef4444,#b91c1c)" :
              phase === "scanning" ? "linear-gradient(135deg,#F5A623,#C8940A)" :
              isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            border: `3px solid ${ringColor}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.4s ease",
            boxShadow: phase !== "wait" && phase !== "unsupported" ? `0 0 40px ${phase === "success" ? "rgba(34,197,94,0.4)" : phase === "fail" ? "rgba(239,68,68,0.3)" : "rgba(245,166,35,0.4)"}` : "none"
          }}>
            {phase === "success"
              ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              : phase === "fail"
              ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              : <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={phase === "scanning" ? "#080812" : t2} strokeWidth="1.4" strokeLinecap="round">
                  <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
                  <path d="M8 11a4 4 0 0 0 8 0"/>
                  <path d="M12 18v4"/>
                  <path d="M4 15.5A9 9 0 0 0 20 15"/>
                </svg>
            }
          </div>
        </div>

        {phase === "wait" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button onClick={handleScan} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "16px", padding: "16px", borderRadius: "16px", border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(245,166,35,0.35)" }}>
              {localStorage.getItem("yelen224_bio_registered") === "1" ? "Toucher pour s'identifier" : "Enregistrer mon empreinte"}
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: t2, fontSize: "14px", cursor: "pointer", padding: "8px" }}>
              Utiliser le code PIN
            </button>
          </div>
        )}

        {phase === "fail" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button onClick={handleRetry} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer" }}>
              Réessayer
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: t2, fontSize: "14px", cursor: "pointer", padding: "8px" }}>
              Utiliser le code PIN
            </button>
          </div>
        )}

        {phase === "unsupported" && (
          <button onClick={onClose} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer" }}>
            Continuer sans biométrie
          </button>
        )}

        {(phase === "wait" || phase === "success") && (
          <div style={{ marginTop: "24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            {Ic.Shield()}
            <span style={{ color: "#22c55e", fontSize: "11px", fontWeight: "700" }}>
              {phase === "success" ? "YelenID vérifié · Clé publique" : "WebAuthn · Vérifié côté serveur"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODAL OPT-IN BIOMÉTRIE — Proposé à l'utilisateur une fois
// ============================================================
function BiometrieOptInModal({ onActivate, onIgnore, prenom, isDark, card, t1, t2, brd }: {
  onActivate: () => void; onIgnore: () => void; prenom: string;
  isDark: boolean; card: string; t1: string; t2: string; brd: string;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 8500, backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(16px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0" }}>
      <div style={{ backgroundColor: card, borderRadius: "28px 28px 0 0", padding: "32px 24px 40px", maxWidth: "480px", width: "100%", border: `1px solid ${brd}`, boxShadow: "0 -20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ width: "40px", height: "4px", background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)", borderRadius: "2px", margin: "0 auto 28px" }}/>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 6px 20px rgba(245,166,35,0.4)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
              <path d="M8 11a4 4 0 0 0 8 0"/>
              <path d="M12 18v4"/>
              <path d="M4 15.5A9 9 0 0 0 20 15"/>
            </svg>
          </div>
          <div>
            <div style={{ color: t1, fontSize: "19px", fontWeight: "900", marginBottom: "4px" }}>
              Connexion biométrique
            </div>
            <div style={{ color: t2, fontSize: "13px" }}>Empreinte digitale · Face ID</div>
          </div>
        </div>

        <p style={{ color: t2, fontSize: "14px", lineHeight: 1.6, marginBottom: "20px" }}>
          Bonjour <strong style={{ color: t1 }}>{prenom}</strong> ! Activez la connexion par empreinte digitale ou Face ID pour accéder à votre espace instantanément — sans saisir de code.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
          {[
            { icon: "⚡", text: "Connexion en moins d'une seconde" },
            { icon: "🔐", text: "Données stockées localement sur votre appareil" },
            { icon: "🛡️", text: "Standard WebAuthn — niveau bancaire" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "12px" }}>
              <span style={{ fontSize: "18px" }}>{f.icon}</span>
              <span style={{ color: t1, fontSize: "13px", fontWeight: "600" }}>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button onClick={onActivate} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "16px", padding: "16px", borderRadius: "16px", border: "none", cursor: "pointer", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
            Activer la biométrie
          </button>
          <button onClick={onIgnore} style={{ width: "100%", background: "none", border: `1px solid ${brd}`, color: t2, fontWeight: "600", fontSize: "15px", padding: "14px", borderRadius: "16px", cursor: "pointer" }}>
            Pas maintenant
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// YELENID CARD — Passeport numérique citoyen
// ============================================================
function YelenIDCard({ userId, userName, userPhone, userPhoto, initials, rdvs, isDark, t1, t2, t3, card, brd, router }: any) {
  const yelenId = userId ? formatYelenId(userId) : "YL-????-????";
  const presenceScore = rdvs.length > 0
    ? Math.min(100, Math.round((rdvs.filter((r: any) => r.presence_status === "present").length / rdvs.length) * 100))
    : 100;
  const scoreColor = presenceScore >= 80 ? "#22c55e" : presenceScore >= 50 ? "#F5A623" : "#ef4444";
  const scoreLabel = presenceScore >= 80 ? "Excellent" : presenceScore >= 50 ? "Bon" : "À améliorer";

  return (
    <div style={{ borderRadius: "22px", overflow: "hidden", background: "linear-gradient(135deg,#080812 0%,#1a1208 50%,#0d0d00 100%)", border: "1px solid rgba(245,166,35,0.25)", boxShadow: "0 8px 32px rgba(0,0,0,0.35)", position: "relative" }}>
      <div style={{ height: "4px", background: "linear-gradient(90deg,#CE1126 33.3%,#FCD20F 33.3% 66.6%,#009A44 66.6%)" }}/>
      <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "radial-gradient(circle,rgba(245,166,35,0.08) 0%,transparent 70%)", pointerEvents: "none" }}/>
      <div style={{ position: "absolute", bottom: "-30px", left: "-30px", width: "120px", height: "120px", borderRadius: "50%", background: "radial-gradient(circle,rgba(245,166,35,0.05) 0%,transparent 70%)", pointerEvents: "none" }}/>

      <div style={{ padding: "18px 20px 20px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ fontSize: "9px", fontWeight: "800", color: "#F5A623", letterSpacing: "2px" }}>YELENID</div>
            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#F5A623", opacity: 0.6 }}/>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", letterSpacing: "1px" }}>PASSEPORT NUMÉRIQUE</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(34,197,94,0.12)", borderRadius: "20px", padding: "3px 10px", border: "1px solid rgba(34,197,94,0.25)" }}>
            {Ic.Shield()}
            <span style={{ color: "#22c55e", fontSize: "10px", fontWeight: "700" }}>VÉRIFIÉ</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: "58px", height: "58px", borderRadius: "18px", overflow: "hidden", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "900", color: "#080812", border: "2px solid rgba(245,166,35,0.4)" }}>
              {userPhoto ? <img src={userPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : initials}
            </div>
            <div style={{ position: "absolute", bottom: "-3px", right: "-3px", width: "18px", height: "18px", borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #080812" }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName}</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", marginBottom: "6px" }}>{userPhone}</div>
            <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#F5A623", fontWeight: "700", letterSpacing: "1px" }}>{yelenId}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          {[
            { label: "RDV Total", value: rdvs.length || "0", color: "#F5A623" },
            { label: "Score présence", value: `${presenceScore}%`, color: scoreColor },
            { label: "Statut", value: scoreLabel, color: scoreColor },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px 8px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: s.color, fontSize: "15px", fontWeight: "900", lineHeight: 1, marginBottom: "4px" }}>{s.value}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontWeight: "600" }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => router.push("/profil")} style={{ flex: 1, background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", padding: "11px", color: "#F5A623", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
            Mon profil
          </button>
          <button onClick={() => router.push("/mon-qr")} style={{ flex: 1, background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", padding: "11px", color: "#F5A623", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
            Mon QR Code
          </button>
          <button onClick={() => router.push("/mes-rdv")} style={{ flex: 1, background: "linear-gradient(135deg,#F5A623,#C8940A)", border: "none", borderRadius: "12px", padding: "11px", color: "#080812", fontSize: "12px", fontWeight: "800", cursor: "pointer" }}>
            Mes RDV →
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// QUICK ACTIONS
// ============================================================
function QuickActions({ router, t1, t2, card, brd, isDark }: any) {
  const actions = [
    {
      label: "Prendre un RDV",
      sub: "Trouver une institution",
      href: "/recherche",
      grad: "linear-gradient(135deg,#F5A623,#C8940A)",
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14" strokeWidth="3"/><line x1="12" y1="14" x2="12" y2="14" strokeWidth="3"/><line x1="16" y1="14" x2="16" y2="14" strokeWidth="3"/></svg>,
      hot: true,
    },
    {
      label: "Mon QR Code",
      sub: "Confirmer ma présence",
      href: "/mon-qr",
      grad: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>,
    },
    {
      label: "Scanner QR",
      sub: "Accueil institution",
      href: "/institution/scanner",
      grad: "linear-gradient(135deg,#22c55e,#15803d)",
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>,
    },
    {
      label: "Payer une Facture",
      sub: "Eau · Électricité · Mobile",
      href: "/paiement",
      grad: "linear-gradient(135deg,#a855f7,#7c3aed)",
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
      soon: true,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ color: t1, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px" }}>Actions rapides</div>
        <div style={{ color: "#22c55e", fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}>
          {Ic.TrendUp()} Vos raccourcis
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {actions.map(a => (
          <Link key={a.label} href={a.href} style={{ textDecoration: "none" }}>
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", border: `1px solid ${brd}`, position: "relative", overflow: "hidden" }} className="tap">
              {a.hot && (
                <div style={{ position: "absolute", top: "10px", right: "10px", background: "#ef4444", borderRadius: "20px", padding: "2px 8px", fontSize: "9px", fontWeight: "800", color: "#fff" }}>POPULAIRE</div>
              )}
              {a.soon && (
                <div style={{ position: "absolute", top: "10px", right: "10px", background: "rgba(168,85,247,0.15)", borderRadius: "20px", padding: "2px 8px", fontSize: "9px", fontWeight: "800", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)" }}>BIENTÔT</div>
              )}
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: a.grad, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px", boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }}>
                {a.icon}
              </div>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800", marginBottom: "3px", lineHeight: 1.2 }}>{a.label}</div>
              <div style={{ color: t2, fontSize: "11px", fontWeight: "500" }}>{a.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Section "Fil d'activité" retirée (20/07/2026, demande explicite de
// Bryan) — redondante avec les cartes "Prochain rendez-vous"/"En retard"
// de l'onglet RDV et avec /mes-rdv.

// ============================================================
// SUGGESTIONS INTELLIGENTES
// ============================================================
function SuggestionsIntelligentes({ rdvs, insts, userLat, userLng, t1, t2, t3, card, brd, isDark, router }: any) {
  const suggestions: Array<{ icon: string; titre: string; sous: string; href: string; color: string; tag: string }> = [];

  if (userLat && userLng && insts.length > 0) {
    const proche = insts.find((i: Inst) => i.latitude && i.longitude);
    if (proche) {
      suggestions.push({ icon: "📍", titre: proche.name, sous: "À proximité de vous · Disponible maintenant", href: `/institution/${proche.id}`, color: "#3b82f6", tag: "Près de vous" });
    }
  }

  suggestions.push({ icon: "🪪", titre: "Renouvelez votre CNI", sous: "Évitez les files — réservez en ligne à la mairie", href: "/recherche?categorie=Mairie", color: "#F5A623", tag: "Recommandé" });

  if (rdvs.length > 0) {
    suggestions.push({ icon: "🔁", titre: "Reprendre votre démarche", sous: `Dernier RDV : ${rdvs[0]?.institution_name || "Institution"}`, href: "/mes-rdv", color: "#22c55e", tag: "En cours" });
  }

  suggestions.push({ icon: "📈", titre: "Certificat de résidence", sous: "Très demandé cette semaine en Guinée", href: "/recherche?categorie=Mairie", color: "#a855f7", tag: "Populaire" });

  if (suggestions.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ color: t1, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px" }}>Pour vous</div>
        <div style={{ color: t2, fontSize: "11px", fontWeight: "600" }}>Personnalisé</div>
      </div>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px", scrollSnapType: "x mandatory" }}>
        {suggestions.map((s, i) => (
          <Link key={i} href={s.href} style={{ textDecoration: "none", flexShrink: 0, scrollSnapAlign: "start" }}>
            <div style={{ width: "220px", backgroundColor: card, borderRadius: "18px", padding: "16px", border: `1px solid ${brd}`, position: "relative", overflow: "hidden" }} className="tap">
              <div style={{ position: "absolute", top: "10px", right: "10px", background: `${s.color}18`, borderRadius: "20px", padding: "2px 8px", fontSize: "9px", fontWeight: "800", color: s.color, border: `1px solid ${s.color}30` }}>{s.tag}</div>
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>{s.icon}</div>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800", marginBottom: "4px", lineHeight: 1.2 }}>{s.titre}</div>
              <div style={{ color: t2, fontSize: "11px", lineHeight: 1.4 }}>{s.sous}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// HERO SLIDES
// ============================================================
const HERO_SLIDES_GUEST = [
  { titre: "Votre RDV en un clic", sous: "Ne vous déplacez plus au hasard : planifiez, réservez, et gagnez du temps depuis votre mobile.", badge: "🇬🇳 Officiel" },
  { titre: "Guinée numérique", sous: "Les services publics et privés à portée de votre téléphone. Hôpitaux, mairies, banques.", badge: "🏛️ État" },
  { titre: "Réservez en 30 sec", sous: "Fini les queues interminables — prenez rendez-vous depuis chez vous en toute sécurité.", badge: "⚡ Rapide" },
  { titre: "Diaspora Guinea", sous: "La diaspora guinéenne peut aussi accéder à tous les services depuis l'étranger.", badge: "🌍 54 pays" },
];

const HERO_SLIDES_USER = (prenom: string) => {
  const h = new Date().getHours();
  const greet = h < 12 ? "Bonjour" : h < 18 ? "Bonsoir" : "Bonne soirée";
  return [
    { titre: `${greet}, ${prenom} 👋`, sous: "Vos rendez-vous vous attendent. Votre YelenID est actif et sécurisé.", badge: "✅ Connecté" },
    { titre: "Vos services", sous: "Hôpitaux, mairies, banques, ambassades — tout en un clic.", badge: "🇬🇳 Officiel" },
    { titre: "Yelen — la lumière", sous: "Un accès simplifié aux services pour chaque Guinéen, partout dans le monde.", badge: "🌟 YelenID" },
  ];
};

function HeroTitre({ userId, prenom }: { userId: string | null; prenom: string }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const slides = userId ? HERO_SLIDES_USER(prenom) : HERO_SLIDES_GUEST;

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(p => (p + 1) % slides.length); setVisible(true); }, 350);
    }, 5500);
    return () => clearInterval(t);
  }, [slides.length]);

  const s = slides[idx];
  return (
    <div style={{ transition: "opacity 0.35s ease, transform 0.35s ease", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,0.2)", borderRadius: "20px", padding: "4px 12px", marginBottom: "10px", backdropFilter: "blur(8px)" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", color: "rgba(8,8,18,0.9)" }}>{s.badge}</span>
      </div>
      <h1 style={{ color: "#080812", fontSize: "30px", fontWeight: "900", margin: "0 0 8px", lineHeight: 1.1, letterSpacing: "-0.5px" }}>{s.titre}</h1>
      <p style={{ color: "rgba(8,8,18,0.65)", fontSize: "13px", fontWeight: "600", margin: "0 0 20px", lineHeight: 1.5, maxWidth: "300px" }}>{s.sous}</p>
    </div>
  );
}

// ============================================================
// SECTION ABOUT + VIDEO YELEN224
// ============================================================
function AboutYelen({ isDark, t1, t2, brd }: { isDark: boolean; t1: string; t2: string; brd: string }) {
  const [playing, setPlaying] = useState(false);
  const VIDEO_ID = "3pvKVLhRcpo";
  return (
    <div style={{ borderRadius: "22px", overflow: "hidden", border: `1px solid rgba(245,166,35,0.2)`, background: isDark ? "linear-gradient(145deg,#111108,#1a1a0f)" : "linear-gradient(145deg,#fffdf5,#fff8e8)" }}>
      <div style={{ height: "3px", background: "linear-gradient(90deg,#F5A623,#C8940A,#F5A623)" }}/>
      <div style={{ padding: "18px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
          </div>
          <div>
            <div style={{ fontSize: "9px", fontWeight: "700", color: "#F5A623", letterSpacing: "1.2px", textTransform: "uppercase" }}>Toujours à vos côtés</div>
            <div style={{ fontSize: "16px", fontWeight: "900", color: t1, letterSpacing: "-0.3px" }}>YELEN224 — La lumière numérique</div>
          </div>
        </div>
        <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
          {!playing ? (
            <div onClick={() => setPlaying(true)} style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer" }}>
              <img src={`https://img.youtube.com/vi/${VIDEO_ID}/maxresdefault.jpg`} alt="YELEN224" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${VIDEO_ID}/hqdefault.jpg`; }}/>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.5))" }}/>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "62px", height: "62px", borderRadius: "50%", background: "rgba(245,166,35,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 28px rgba(245,166,35,0.55)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#080812" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
              </div>
            </div>
          ) : (
            <iframe src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`} allow="autoplay; encrypted-media" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} title="YELEN224"/>
          )}
        </div>
        <p style={{ fontSize: "12px", color: t2, lineHeight: 1.6, marginTop: "12px", marginBottom: 0 }}>YELEN224 connecte chaque citoyen guinéen aux services publics et privés — hôpitaux, mairies, banques, ambassades — en Guinée et dans la diaspora.</p>
      </div>
    </div>
  );
}

// ============================================================
// CTA PRESTATAIRE
// ============================================================
function CTAPrestataire({ isDark, t1, t2, brd }: { isDark: boolean; t1: string; t2: string; brd: string }) {
  return (
    <Link href="/institution/inscription" style={{ textDecoration: "none", display: "block" }}>
      <div style={{ borderRadius: "20px", overflow: "hidden", position: "relative", background: "linear-gradient(135deg,#F5A623 0%,#E8960A 60%,#C8740A 100%)", boxShadow: "0 8px 32px rgba(245,166,35,0.35)" }}>
        <div style={{ height: "4px", background: "linear-gradient(90deg,#CE1126 33.3%,#FCD20F 33.3% 66.6%,#009A44 66.6%)" }}/>
        <div style={{ padding: "22px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
            </div>
            <div>
              <div style={{ color: "#080812", fontSize: "17px", fontWeight: "900", marginBottom: "4px" }}>Rejoignez Yelen224</div>
              <div style={{ color: "rgba(8,8,18,0.6)", fontSize: "12px", fontWeight: "600" }}>Plateforme officielle de prise de RDV</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
            {[
              { icon: "🏥", text: "Hôpitaux · Cliniques · Pharmacies" },
              { icon: "🏛️", text: "Mairies · Ministères · Ambassades" },
              { icon: "🏦", text: "Banques · Assurances · ONG" },
            ].map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "rgba(0,0,0,0.1)", borderRadius: "12px" }}>
                <span style={{ fontSize: "18px" }}>{a.icon}</span>
                <div style={{ color: "#080812", fontSize: "12px", fontWeight: "700" }}>{a.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "#080812", color: "#F5A623", fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px" }} className="tap">
            Inscrire mon institution →
          </div>
        </div>
      </div>
    </Link>
  );
}

// NotifPanel déplacé vers components/NotifPanel.tsx (20/07/2026) — un
// fichier de route ("page.tsx") ne peut exporter que des noms réservés
// par Next.js App Router (default, metadata, ...), pas un composant
// arbitraire ; nécessaire pour le partager avec
// app/dashboard/dashboard-client.tsx (header unifié, chantier "Yelen
// Assistant").

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export default function YelenApp() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const [tab, setTab]               = useState<Tab>("accueil");
  const [carteOpen, setCarteOpen]   = useState(false);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [comptOuvert, setComptOuvert] = useState<Record<string, boolean>>({}); // sections "Mon compte" dépliées

  // ── Biométrie ──
  const [bioOptInOpen, setBioOptInOpen] = useState(false);   // modal d'opt-in
  const [bioAuthOpen, setBioAuthOpen]   = useState(false);   // modal d'auth WebAuthn
  const [bioOk, setBioOk]               = useState(false);   // auth réussie
  const [logoutOpen, setLogoutOpen]     = useState(false);   // flux de déconnexion

  const [userId, setUserId]         = useState<string | null>(null);
  const [userName, setUserName]     = useState("");
  const [userPhone, setUserPhone]   = useState("");
  const [userPhoto, setUserPhoto]   = useState<string | null>(null);
  const [userVille, setUserVille]   = useState("");
  const [userCreeLe, setUserCreeLe] = useState<string | null>(null);
  const [rdvs, setRdvs]             = useState<RDV[]>([]);
  const [insts, setInsts]           = useState<Inst[]>([]);
  const [mapInsts, setMapInsts]     = useState<Inst[]>([]);
  const [mapLoaded, setMapLoaded]   = useState(false);
  const [msgCount, setMsg]          = useState(0);
  const [stats, setStats]           = useState({ i: 0, c: 0 });
  const [now, setNow]               = useState<Date | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [userLat, setUserLat]       = useState<number | null>(null);
  const [userLng, setUserLng]       = useState<number | null>(null);
  const [scrolled, setScrolled]     = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [ready, setReady]           = useState(false);
  const lastScrollY = useRef(0);

  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  // Restaure le dernier onglet actif — sans ça, "Retour" depuis un écran
  // ouvert depuis l'onglet Compte (ou Recherche/RDV) revient toujours sur
  // Accueil : ce composant est démonté par la navigation vers /compte/*,
  // le state React `tab` est perdu, et le remontage au retour repart de
  // la valeur par défaut "accueil".
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(YELEN224_LAST_TAB_KEY); } catch {}
    if (saved === "accueil" || saved === "recherche" || saved === "rdv" || saved === "compte") {
      setTab(saved);
    }
  }, []);

  function changeTab(t: Tab) {
    setTab(t);
    try { sessionStorage.setItem(YELEN224_LAST_TAB_KEY, t); } catch {}
  }

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); }, () => {}, { timeout: 5000 });
    }
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
      if (y < 60) setHeaderVisible(true);
      else if (y > lastScrollY.current + 4) setHeaderVisible(false);
      else if (y < lastScrollY.current - 4) setHeaderVisible(true);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearInterval(tick); window.removeEventListener("scroll", onScroll); };
  }, []);

  useEffect(() => {
    try {
      const done = localStorage.getItem("yelen224_onboarding_done");
      if (!done) { router.replace("/onboarding"); return; }
    } catch {}
    setReady(true);

    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    setUserId(id);

    if (id) {
      // Chantier "Yelen Assistant" (20/07/2026), Lot D — abonnement push
      // best-effort, une fois par chargement. souscrirePush() réutilise
      // l'abonnement existant s'il y en a déjà un (idempotent), et ne
      // redemande jamais la permission si déjà refusée par le navigateur.
      // Insert direct (RLS push_subs_citoyen_own autorise le citoyen sur sa
      // propre ligne, pas besoin de route serveur ici).
      (async () => {
        const sub = await souscrirePush();
        if (!sub) return;
        await supabase.from("push_subscriptions").upsert({
          destinataire_id: id, destinataire_type: "citoyen",
          endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: sub.userAgent,
        }, { onConflict: "endpoint" });
      })();

      // Logique biométrie opt-in / auth
      const bioRegistered = localStorage.getItem("yelen224_bio_registered") === "1";
      const bioIgnored    = localStorage.getItem("yelen224_bio_ignored") === "1";
      const lastBio       = localStorage.getItem("yelen224_last_bio");
      const bioExpired    = !lastBio || (Date.now() - parseInt(lastBio)) > 30 * 60 * 1000; // 30min

      if (!bioRegistered && !bioIgnored) {
        // Première fois : proposer d'activer
        setBioOptInOpen(true);
      } else if (bioRegistered && bioExpired) {
        // Déjà enregistré, session expirée : s'authentifier
        setBioAuthOpen(true);
      } else {
        // Session encore valide ou biométrie ignorée
        setBioOk(true);
      }
    }

    (async () => {
      try {
        const [iR, uR] = await Promise.allSettled([
          ft(supabase.from("institutions").select("*", { count: "exact", head: true })),
          ft(supabase.from("users").select("*", { count: "exact", head: true })),
        ]);
        setStats({
          i: iR.status === "fulfilled" && iR.value ? (iR.value as any).count || 0 : 0,
          c: uR.status === "fulfilled" && uR.value ? (uR.value as any).count || 0 : 0,
        });

        const iD = await ft(supabase.from("institutions").select("id,name,category,ville,quartier,adresse,latitude,longitude,phone,logo,moyenne_avis,nb_avis,badge_verifie,disponibilites").not("name", "is", null).order("created_at", { ascending: false }).limit(20), 6000);
        if (iD && (iD as any).data) {
          const rows = (iD as any).data as Inst[];
          setMapInsts(rows.filter(r => r.latitude && r.longitude));
          if (!id) setInsts(rows.slice(0, 5));
        }
        // Distingue "encore en train de charger" de "chargé mais vide" —
        // avant ce correctif, une carte vide (aucune institution avec
        // latitude/longitude — actuellement TOUJOURS le cas, aucun écran
        // du produit ne permet encore de renseigner ces champs, voir
        // CLAUDE.md) affichait "Chargement..." indéfiniment, signalé par
        // Bryan le 20/07/2026 comme un écran bloqué/blanc.
        setMapLoaded(true);

        if (id) {
          // `name` retiré : colonne inexistante sur `users` (même bug que
          // dashboard-client.tsx, corrigé le 17/07/2026) — la faisait échouer
          // toute la requête, userName restait "" en permanence, donc la carte
          // YelenID et le "Bonjour" affichaient un nom vide/caché.
          // `cree_le` → `created_at` : même classe de bug, colonne renommée
          // en base après l'audit du 07/07/2026, jamais répercutée ici
          // (corrigé le 18/07/2026, diagnostic SQL confirmé par Bryan).
          const uD = await ft(supabase.from("users").select("prenom,nom,phone,photo_url,ville,created_at").eq("id", id).maybeSingle(), 5000);
          if (uD && (uD as any).data) {
            const r = (uD as any).data;
            const p = (r.prenom || "").trim(), n = (r.nom || "").trim();
            setUserName(p ? `${p} ${n}`.trim() : r.phone || "Citoyen");
            setUserPhone(r.phone || "");
            setUserPhoto(r.photo_url || null);
            setUserCreeLe(r.created_at || null);
            const villeCitoyen = (r.ville || "").trim();
            setUserVille(villeCitoyen);

            // Établissements "près de vous" — uniquement ceux de la même ville
            // que le citoyen (décision produit du 17/07/2026). Sans ville
            // renseignée, on ne devine rien : le bloc invite à la définir.
            if (villeCitoyen) {
              const vD = await ft(supabase.from("institutions").select("id,name,category,ville,quartier,adresse,latitude,longitude,phone,logo,moyenne_avis,nb_avis,badge_verifie,disponibilites").eq("ville", villeCitoyen).not("name", "is", null).order("moyenne_avis", { ascending: false }).limit(12), 6000);
              setInsts(vD && (vD as any).data ? (vD as any).data : []);
            } else {
              setInsts([]);
            }
          }

          // Pas de .limit() ici — la carte YelenID (RDV Total / Score de
          // présence) et l'onglet RDV (stats Total/À venir/Terminés)
          // dépendent tous les deux de compter le VRAI total du citoyen ;
          // une limite à 10 faussait ces chiffres pour tout citoyen ayant
          // plus de 10 RDV (signalé par Bryan le 20/07/2026 — "les données
          // étaient cachées", pas un problème de mise en page de la carte).
          const rD = await ft(supabase.from("rdv").select("id,date_rdv,heure_rdv,statut,objet,institution_id,presence_status").eq("citoyen_id", id).order("date_rdv", { ascending: false }), 5000);
          if (rD && (rD as any).data) {
            const rows = (rD as any).data as any[];
            const ids = [...new Set(rows.map((r: any) => r.institution_id).filter(Boolean))];
            let m: Record<string, string> = {};
            if (ids.length) {
              const nD = await ft(supabase.from("institutions").select("id,name").in("id", ids), 4000);
              if (nD && (nD as any).data) (nD as any).data.forEach((x: any) => { m[x.id] = x.name || "Institution"; });
            }
            setRdvs(rows.map((r: any) => ({ ...r, institution_name: m[r.institution_id] || "Institution" })));
          }

          try {
            const nD = await ft(supabase.from("notifications").select("*", { count: "exact", head: true }).eq("destinataire_id", id).eq("destinataire_type", "citoyen").eq("lu", false), 4000);
            if (nD) setNotifCount((nD as any).count || 0);
          } catch { setNotifCount(0); }
          try {
            const mD = await ft(supabase.from("messages").select("*", { count: "exact", head: true }).eq("destinataire_citoyen_id", id).eq("lu", false), 4000);
            if (mD) setMsg((mD as any).count || 0);
          } catch {}
        }
      } catch (e) { console.error("load error", e); setMapLoaded(true); }
    })();
  }, [router]);

  if (!ready) return null;

  const initials = userName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2) || "C";
  const prenom = userName.split(" ")[0] || "Citoyen";
  const prochainRdv = rdvs.find(r => r.statut !== "annule" && new Date(r.date_rdv) >= new Date());
  const timeStr = now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "––:––:––";
  const dateStr = now ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "";

  const catMeta: Record<string, { color: string; bg: string; label: string }> = {
    "Hopital / Clinique":      { color: "#ef4444", bg: "rgba(239,68,68,0.1)",   label: "Santé" },
    "Ecole / Universite":      { color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  label: "Éducation" },
    "Mairie / Administration": { color: "#F5A623", bg: "rgba(245,166,35,0.1)",  label: "Admin" },
    "Banque / Microfinance":   { color: "#22c55e", bg: "rgba(34,197,94,0.1)",   label: "Banque" },
    "Pharmacie":               { color: "#a855f7", bg: "rgba(168,85,247,0.1)",  label: "Pharmacie" },
    "Cabinet medical":         { color: "#f97316", bg: "rgba(249,115,22,0.1)",  label: "Médecin" },
    "Tribunal / Justice":      { color: "#f43f5e", bg: "rgba(244,63,94,0.1)",   label: "Justice" },
    "Transport / Logistique":  { color: "#06b6d4", bg: "rgba(6,182,212,0.1)",   label: "Transport" },
    "ONG / Association":       { color: "#14b8a6", bg: "rgba(20,184,166,0.1)",  label: "ONG" },
  };

  // Structure "Mon compte" (décision CEO, 18/07/2026) — 5 sections type
  // Apple ID/Google Account/Uber Account plutôt qu'une liste plate. Les
  // items pointant vers /compte/... sont des écrans neufs volontairement
  // vides pour ce lot (structure d'abord, contenu réel la semaine
  // suivante) ; les autres réutilisent des écrans déjà fonctionnels —
  // aucun écran existant n'a été supprimé, seuls les liens du menu ont
  // été réorganisés.
  const SECTIONS_COMPTE = [
    { titre: "Profil", items: [
      { l: "Informations personnelles", h: "/compte/informations-personnelles", i: Ic.Doc() },
      { l: "Documents personnels",    h: "/compte/documents-personnels",   i: Ic.Doc() },
      { l: "Carte Yelen",             h: "/compte/carte-yelen",            i: Ic.Pay() },
      { l: "Tableau de bord",         h: "/dashboard",                     i: Ic.Home() },
      { l: "Éducation",               h: "/education",                     i: Ic.Globe() },
      { l: "Langue",                  h: "/compte/langue",                 i: Ic.Globe() },
    ]},
    { titre: "Mon Activité", items: [
      { l: "Activités passées",      h: "/compte/activites",              i: Ic.Clock() },
      { l: "Mes démarches",          h: "/compte/mes-demarches",          i: Ic.Doc() },
      { l: "Mes rendez-vous",         h: "/mes-rdv",                       i: Ic.Cal() },
      { l: "Messagerie",              h: "/messagerie/citoyen",            i: Ic.Msg(false, msgCount) },
      { l: "Mes avis",                h: "/compte/mes-avis",               i: Ic.Star(true) },
      { l: "Mes établissements favoris", h: "/compte/favoris",             i: Ic.Star() },
      { l: "Mes paiements",           h: "/compte/paiements",              i: Ic.Pay() },
      { l: "Mes remboursements",      h: "/compte/remboursements",         i: Ic.Pay() },
      { l: "Mes réservations payantes", h: "/compte/reservations-payantes", i: Ic.QR() },
      { l: "Mes documents",           h: "/compte/documents-telecharges",  i: Ic.Doc() },
      { l: "Historique des connexions", h: "/compte/historique-connexions", i: Ic.Clock() },
    ]},
    { titre: "Aide et support", items: [
      { l: "Centre d'aide",           h: "/compte/aide",                   i: Ic.Info() },
      { l: "FAQ",                     h: "/faq",                           i: Ic.Info() },
      { l: "Contacter Yelen",         h: "/contact",                       i: Ic.Globe() },
      { l: "Signaler un problème",    h: "/signalement",                   i: Ic.Info() },
      { l: "État des services",       h: "/compte/etat-services",          i: Ic.Check() },
      { l: "Suggestions",             h: "/compte/suggestions",            i: Ic.Info() },
      { l: "Tutoriels",               h: "/compte/tutoriels",              i: Ic.Info() },
    ]},
    { titre: "Mentions légales", items: [
      { l: "Conditions d'utilisation", h: "/cgu",                          i: Ic.Info() },
      { l: "Politique de confidentialité", h: "/confidentialite",          i: Ic.Lock() },
      { l: "À propos de Yelen",       h: "/compte/a-propos",               i: Ic.Info() },
      { l: "Version",                 h: "/compte/version",                i: Ic.Info() },
      { l: "Gestion des consentements", h: "/compte/consentements",        i: Ic.Check() },
      { l: "Licences",                h: "/compte/licences",               i: Ic.Doc() },
    ]},
  ];

  // 5 actions les plus utilisées, à plat (pas groupées par section) —
  // seules celles-là restent visibles sans clic en haut de l'onglet
  // Compte (retour direct de Bryan le 18/07/2026 : le menu par section
  // devenait trop long avec 29 écrans au total). Chaque section
  // ci-dessus reste repliée (nom + flèche uniquement) et se déplie
  // entièrement au clic — ces items y restent aussi, pas de suppression.
  const ACTIONS_RAPIDES_COMPTE = [
    { l: "Mes rendez-vous", h: "/mes-rdv",             i: Ic.Cal() },
    { l: "Mon QR Code",     h: "/mon-qr",               i: Ic.QR() },
    { l: "Messagerie",      h: "/messagerie/citoyen",   i: Ic.Msg(false, msgCount) },
    { l: "Dashboard",       h: "/dashboard",             i: Ic.Home() },
    { l: "Paramètres",      h: "/compte/parametres",   i: Ic.Settings() },
  ];

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif", color: t1, overflowX: "hidden", paddingBottom: "84px" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;max-width:100vw;background:${bg};-webkit-text-size-adjust:100%}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideLeft{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes notifIn{from{opacity:0;transform:translateY(-10px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes pingRing{0%{transform:scale(1);opacity:0.8}100%{transform:scale(1.5);opacity:0}}
        @keyframes shimmer{0%{opacity:0.4}50%{opacity:1}100%{opacity:0.4}}
        @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        .scr{animation:fadeUp 0.25s ease}
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
        a,.tap,button{-webkit-tap-highlight-color:transparent !important}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        .map-wrap *{pointer-events:auto !important}
        .map-wrap{pointer-events:auto !important}
      `}</style>

      {/* ── OPT-IN BIOMÉTRIE — Proposé à l'utilisateur, non bloquant ── */}
      {bioOptInOpen && userId && (
        <BiometrieOptInModal
          prenom={prenom}
          isDark={isDark} card={card} t1={t1} t2={t2} brd={brd}
          onActivate={() => {
            setBioOptInOpen(false);
            setBioAuthOpen(true); // Lancer l'enregistrement WebAuthn
          }}
          onIgnore={() => {
            try { localStorage.setItem("yelen224_bio_ignored", "1"); } catch {}
            setBioOptInOpen(false);
            setBioOk(true);
          }}
        />
      )}

      {/* ── AUTH BIOMÉTRIE — WebAuthn réel ── */}
      {bioAuthOpen && userId && (
        <>
          <style>{`@keyframes pingRing { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(1.5); opacity: 0; } }`}</style>
          <BiometrieModal
            prenom={prenom}
            isDark={isDark} card={card} t1={t1} t2={t2} brd={brd}
            userId={userId}
            onSuccess={() => {
              try { localStorage.setItem("yelen224_last_bio", String(Date.now())); } catch {}
              setBioOk(true);
              setBioAuthOpen(false);
            }}
            onClose={() => {
              // L'utilisateur préfère le PIN — laisser passer
              setBioOk(true);
              setBioAuthOpen(false);
            }}
          />
        </>
      )}

      {logoutOpen && (
        <LogoutFlow
          onClose={() => setLogoutOpen(false)}
          redirectTo="/login?logged_out=1"
          copy={CITOYEN_LOGOUT_COPY}
        />
      )}

      {notifOpen && <NotifPanel onClose={() => { setNotifOpen(false); setNotifCount(0); }} isDark={isDark} t1={t1} t2={t2} t3={t3} card={card} card2={card2} brd={brd} userId={userId} userName={userName}/>}

      {/* ══════════════════════════════════════════════════════
          HEADER ACCUEIL — transparent sur le hero, fond blanc/sombre au
          scroll ; se cache vers le bas, réapparaît vers le haut. Icônes
          blanches sur fond doré/transparent, noires (ou blanches en thème
          sombre) dès que le fond devient clair/opaque. Réservé à l'onglet
          Accueil — les 3 autres onglets (recherche/rdv/compte) ont leur
          propre header simplifié (retour/titre/FAQ, cf. plus bas), signalé
          le 18/07/2026 : côté citoyen n'existe qu'en mobile, jamais en PC.
      ══════════════════════════════════════════════════════ */}
      {tab === "accueil" && (
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: scrolled ? (isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)") : "transparent", backdropFilter: scrolled ? "blur(20px)" : "none", WebkitBackdropFilter: scrolled ? "blur(20px)" : "none", borderBottom: scrolled ? `1px solid ${brd}` : "none", transform: headerVisible ? "translateY(0)" : "translateY(-100%)", transition: "transform 0.25s ease, background-color 0.3s ease" }}>
        <div style={{ padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>

          {/* ── LOGO SEUL — aucun texte dans le header ── */}
          <div style={{ position: "relative", width: "46px", height: "46px", flexShrink: 0 }}>
            <div style={{ position: "absolute", inset: 0, backgroundColor: "#F5A623", borderRadius: "28%", transform: "rotate(8deg)", opacity: 0.22 }}/>
            <div style={{ position: "relative", width: "46px", height: "46px", backgroundColor: "#F5A623", borderRadius: "28%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 12px rgba(245,166,35,0.45)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={scrolled ? t1 : "#fff"} strokeWidth="2.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </div>
          </div>

          <div style={{ flex: 1 }}/>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginLeft: "10px" }}>
            <button onClick={() => { setNotifOpen(o => !o); if (!notifOpen) setNotifCount(0); }} style={{ position: "relative", background: "#F5A623", border: "none", padding: "7px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", width: "38px", height: "38px", boxShadow: "0 2px 8px rgba(245,166,35,0.35)" }} className="tap">
              {Ic.Bell(notifCount > 0, notifCount || undefined)}
            </button>
            <button onClick={() => router.push("/messagerie/citoyen")} style={{ background: "#F5A623", border: "none", padding: "7px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", borderRadius: "50%", width: "38px", height: "38px", boxShadow: "0 2px 8px rgba(245,166,35,0.35)" }} className="tap">
              {Ic.Msg(false, msgCount || undefined)}
            </button>
          </div>
        </div>
      </header>
      )}

      {/* ══════════════════════════════════════════════════════
          HEADER SIMPLIFIÉ — onglets Recherche/RDV/Compte : retour (vers
          Accueil) à gauche, titre de l'onglet au milieu, Notification +
          Message + "?" à droite (mêmes icônes/handlers que le header
          Accueil, pour qu'elles restent accessibles partout, pas
          seulement sur Accueil). Icône retour identique à celle déjà
          utilisée ailleurs dans l'app (mes-rdv, profil, dashboard).
      ══════════════════════════════════════════════════════ */}
      {tab !== "accueil" && (() => {
        // Même bandeau doré que le hero Accueil / CompteHeader, façon
        // Booking (étendu derrière la barre de statut). Couvre Recherche,
        // RDV et le sommet de l'onglet Compte — les 3 onglets non-Accueil
        // partagent ce header. Mode sombre volontairement inchangé.
        const hBg     = isDark ? bg : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
        const hText   = isDark ? t1 : "#080812";
        // Boutons ronds identiques à ceux du header Accueil (fond doré
        // plein, icône blanche, ombre) — déjà éprouvé lisible sur ce même
        // fond, au lieu d'un chip translucide qui se fondait dans le doré.
        const hChip   = isDark ? card2 : "#F5A623";
        const hIcon   = isDark ? hText : "#fff";
        const hBrd    = isDark ? brd : "transparent";
        const hShadow = isDark ? "none" : "0 2px 8px rgba(245,166,35,0.35)";
        return (
        <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: hBg, borderBottom: isDark ? `1px solid ${brd}` : "none" }}>
          {/* Pas de bouton retour ici — navigation entre onglets déjà
              assurée par la barre du bas, contrairement aux écrans internes
              (fiche établissement, RDV, /compte/*) qui en ont réellement
              besoin. */}
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ color: hText, fontSize: "16px", fontWeight: "800", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tab === "recherche" ? "Recherche" : tab === "rdv" ? "Mes RDV" : "Mon compte"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <button onClick={() => { setNotifOpen(o => !o); if (!notifOpen) setNotifCount(0); }} className="tap" style={{ position: "relative", width: "36px", height: "36px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: hIcon }}>
                {Ic.Bell(notifCount > 0, notifCount || undefined)}
              </button>
              <button onClick={() => router.push("/messagerie/citoyen")} className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: hIcon }}>
                {Ic.Msg(false, msgCount || undefined)}
              </button>
              <Link href="/faq" className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", color: hIcon, textDecoration: "none", flexShrink: 0 }}>
                {Ic.Help()}
              </Link>
            </div>
          </div>
        </header>
        );
      })()}

      {/* ===================================================== */}
      {/* TAB ACCUEIL */}
      {/* ===================================================== */}
      {tab === "accueil" && (
        <div className="scr">
          {/* HERO */}
          <div style={{ position: "relative", minHeight: "300px", background: "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "-60px", right: "-60px", width: "260px", height: "260px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }}/>
            <div style={{ position: "absolute", bottom: "-40px", left: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(0,0,0,0.06)", pointerEvents: "none" }}/>

            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 20px 24px" }}>
              <div style={{ color: "rgba(8,8,18,0.5)", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", marginBottom: "8px", textTransform: "uppercase" }}>{now ? dateStr : "Chargement..."}</div>
              <HeroTitre userId={userId} prenom={prenom}/>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(8px)", borderRadius: "20px", padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span style={{ color: "#080812", fontSize: "13px", fontWeight: "800", fontVariantNumeric: "tabular-nums" }}>{now ? timeStr : "––:––:––"}</span>
                </div>

                {userId && (
                  <div onClick={() => router.push("/profil")} style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(8px)", borderRadius: "20px", padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ color: "#080812", fontSize: "12px", fontWeight: "700" }}>{userVille || "Choisir ma ville"}</span>
                  </div>
                )}

                {userId && prochainRdv && (
                  <div onClick={() => router.push("/mes-rdv")} style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(8px)", borderRadius: "20px", padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span style={{ color: "#080812", fontSize: "12px", fontWeight: "700" }}>RDV {new Date(prochainRdv.date_rdv).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}{prochainRdv.heure_rdv ? ` · ${prochainRdv.heure_rdv}` : ""}</span>
                  </div>
                )}

                {!userId && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Link href="/inscription" style={{ background: "#080812", color: "#F5A623", fontWeight: "800", fontSize: "13px", padding: "9px 18px", borderRadius: "20px", textDecoration: "none" }}>S'inscrire</Link>
                    <Link href="/login" style={{ background: "rgba(0,0,0,0.15)", color: "#080812", fontWeight: "700", fontSize: "13px", padding: "9px 16px", borderRadius: "20px", textDecoration: "none" }}>Connexion</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BARRE RECHERCHE */}
          <div style={{ padding: "14px 16px 0" }}>
            <Link href="/recherche" style={{ textDecoration: "none", display: "block" }}>
              <div style={{ background: isDark ? "#1C1C1E" : "#fff", border: "1.5px solid rgba(245,166,35,0.3)", borderRadius: "16px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 20px rgba(245,166,35,0.12)" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                </div>
                <div style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)", fontSize: "14px" }}>Hôpitaux · Mairies · Banques · Ambassades...</div>
                <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "auto" }}>{Ic.Chev()}</div>
              </div>
            </Link>
          </div>

          <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: "22px" }}>

            {userId && (
              <>
                <YelenIDCard userId={userId} userName={userName} userPhone={userPhone} userPhoto={userPhoto} initials={initials} rdvs={rdvs} isDark={isDark} t1={t1} t2={t2} t3={t3} card={card} brd={brd} router={router}/>
                <QuickActions router={router} t1={t1} t2={t2} card={card} brd={brd} isDark={isDark}/>
                <SuggestionsIntelligentes rdvs={rdvs} insts={insts} userLat={userLat} userLng={userLng} t1={t1} t2={t2} t3={t3} card={card} brd={brd} isDark={isDark} router={router}/>
              </>
            )}

            {/* STATS */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {[{ v: stats.i || "...", l: "Institutions", c: "#F5A623" }, { v: stats.c || "...", l: "Citoyens", c: "#34C759" }, { v: "54+", l: "Pays", c: "#007AFF" }].map(s => (
                <div key={s.l} style={{ backgroundColor: card, borderRadius: "14px", padding: "14px 10px", textAlign: "center", border: `1px solid ${brd}` }}>
                  <div style={{ color: s.c, fontSize: "19px", fontWeight: "900", letterSpacing: "-0.5px", lineHeight: 1 }}>{s.v}</div>
                  <div style={{ color: t2, fontSize: "11px", marginTop: "4px", fontWeight: "500" }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* SERVICES */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span style={{ color: t1, fontSize: "18px", fontWeight: "900", letterSpacing: "-0.3px" }}>Services</span>
                <Link href="/recherche" style={{ color: "#F5A623", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Tout voir</Link>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Santé",      href: "/recherche?categorie=Hopital",  grad: "linear-gradient(135deg,#FF6B6B,#FF3B30)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg> },
                  { label: "Éducation", href: "/recherche?categorie=Ecole",    grad: "linear-gradient(135deg,#4A90E2,#007AFF)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><path d="M2 13l10 6 10-6"/></svg> },
                  { label: "Admin.",    href: "/recherche?categorie=Mairie",   grad: "linear-gradient(135deg,#F5A623,#C8940A)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg> },
                  { label: "Banque",    href: "/recherche?categorie=Banque",   grad: "linear-gradient(135deg,#34C759,#27A84A)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> },
                  { label: "Ambassades",href: "/ambassades",                    grad: "linear-gradient(135deg,#8B5CF6,#6D28D9)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
                  { label: "Justice",   href: "/recherche?categorie=Tribunal",  grad: "linear-gradient(135deg,#FF9500,#E07800)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> },
                ].map(cat => (
                  <Link key={cat.label} href={cat.href} className="tap" style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: cat.grad, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.15)" }}>{cat.icon}</div>
                    <span style={{ color: t1, fontSize: "11px", fontWeight: "700", textAlign: "center", lineHeight: 1.2 }}>{cat.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* BANNIÈRE VALEUR (non connecté) */}
            {!userId && (
              <div style={{ backgroundColor: card, borderRadius: "20px", padding: "22px", border: `1px solid ${brd}` }}>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <div style={{ color: t1, fontSize: "18px", fontWeight: "900", marginBottom: "6px" }}>Yelen224 — Votre temps est précieux</div>
                  <div style={{ color: t2, fontSize: "13px" }}>La plateforme officielle de la Guinée numérique</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { icon: "⚡", titre: "Gagnez du temps", sous: "Fini les files d'attente. Vos démarches depuis votre mobile." },
                    { icon: "🔗", titre: "Tout centralisé", sous: "Un seul compte pour accéder à des centaines de services." },
                    { icon: "🔐", titre: "100% Sécurisé", sous: "Vos données sont protégées. Chiffrement AES-256 bancaire." },
                  ].map(v => (
                    <div key={v.titre} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px", backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: "12px" }}>
                      <span style={{ fontSize: "24px" }}>{v.icon}</span>
                      <div>
                        <div style={{ color: t1, fontSize: "14px", fontWeight: "700", marginBottom: "2px" }}>{v.titre}</div>
                        <div style={{ color: t2, fontSize: "12px" }}>{v.sous}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                  <Link href="/inscription" style={{ flex: 1, display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "14px", textDecoration: "none", textAlign: "center" }}>Créer mon compte</Link>
                  <Link href="/login" style={{ flex: 1, display: "block", backgroundColor: card2, color: t1, fontWeight: "600", fontSize: "15px", padding: "15px", borderRadius: "14px", textDecoration: "none", textAlign: "center", border: `1px solid ${brd}` }}>Se connecter</Link>
                </div>
              </div>
            )}

            {/* CARTE */}
            <div style={{ margin: "0 -16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "3px", height: "18px", background: "#F5A623", borderRadius: "2px" }}/>
                  <div style={{ color: t1, fontSize: "17px", fontWeight: "800", letterSpacing: "-0.3px" }}>Carte des prestataires</div>
                </div>
                <button onClick={() => setCarteOpen(true)} style={{ display: "flex", alignItems: "center", gap: "5px", color: "#F5A623", fontSize: "13px", fontWeight: "700", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", cursor: "pointer", padding: "6px 12px", borderRadius: "20px" }} className="tap">
                  {Ic.Expand()} Agrandir
                </button>
              </div>
              <div className="map-wrap" style={{ height: "240px", position: "relative", zIndex: 0, isolation: "isolate" }}>
                {mapInsts.length > 0 ? <CarteMapHome institutions={mapInsts as any}/> : (
                  <div style={{ height: "100%", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "8px", padding: "16px", textAlign: "center" }}>
                    {Ic.Map()}
                    <span style={{ color: t3, fontSize: "13px" }}>{mapLoaded ? "Aucun établissement localisé sur la carte pour l'instant." : "Chargement de la carte..."}</span>
                  </div>
                )}
                <button onClick={e => { e.stopPropagation(); setCarteOpen(true); }} style={{ position: "absolute", bottom: "10px", right: "10px", backgroundColor: isDark ? "rgba(10,10,15,0.88)" : "rgba(255,255,255,0.92)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "20px", padding: "7px 14px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "#F5A623", fontSize: "12px", fontWeight: "700", backdropFilter: "blur(8px)", zIndex: 10 }} className="tap">
                  {Ic.Expand()} Plein écran
                </button>
              </div>
            </div>

            {/* ÉTABLISSEMENTS PRÈS DE VOUS */}
            {(userId ? true : insts.length > 0) && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ color: t1, fontSize: "17px", fontWeight: "800", letterSpacing: "-0.3px" }}>Établissements près de vous</div>
                  <Link href="/recherche" style={{ color: "#F5A623", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Voir tout</Link>
                </div>

                {userId && !userVille ? (
                  <div style={{ backgroundColor: card, borderRadius: "20px", padding: "28px 20px", textAlign: "center", border: `1px solid ${brd}` }}>
                    <div style={{ color: "#F5A623", display: "flex", justifyContent: "center", marginBottom: "10px" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                    <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Ajoutez votre ville</div>
                    <div style={{ color: t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>Renseignez votre ville pour découvrir les établissements disponibles près de chez vous.</div>
                    <button onClick={() => router.push("/profil")} className="tap" style={{ background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                      Choisir ma ville
                    </button>
                  </div>
                ) : userId && userVille && insts.length === 0 ? (
                  <div style={{ backgroundColor: card, borderRadius: "20px", padding: "28px 20px", textAlign: "center", border: `1px solid ${brd}` }}>
                    <div style={{ color: "#F5A623", display: "flex", justifyContent: "center", marginBottom: "10px" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg></div>
                    <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Pas encore d'établissement à {userVille}</div>
                    <div style={{ color: t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>Yelen224 arrive progressivement dans toutes les préfectures. Aidez-nous à le faire connaître autour de vous.</div>
                    <button onClick={handleShareYelen} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>
                      Partager Yelen224
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "12px", overflowX: "auto", margin: "0 -16px", padding: "2px 16px 8px" }}>
                    {insts.map(inst => {
                      const cm = catMeta[inst.category || ""] || { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", label: inst.category || "Autre" };
                      const initials = inst.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
                      return (
                        <Link key={inst.id} href={`/institution/${inst.id}`} className="tap" style={{ textDecoration: "none", flex: "0 0 auto", width: "168px" }}>
                          <div style={{ backgroundColor: card, borderRadius: "18px", border: `1px solid ${brd}`, overflow: "hidden" }}>
                            <div style={{ height: "108px", position: "relative", background: `linear-gradient(135deg,${cm.color}33,${cm.color}0d)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {inst.logo
                                ? <img src={inst.logo} alt={inst.name} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                                : <span style={{ color: cm.color, fontSize: "30px", fontWeight: "900" }}>{initials || "?"}</span>}
                              {inst.badge_verifie && (
                                <span style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(34,197,94,0.9)", color: "#fff", fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px" }}>✓</span>
                              )}
                            </div>
                            <div style={{ padding: "10px 12px 12px" }}>
                              <div style={{ color: t1, fontSize: "13px", fontWeight: "800", letterSpacing: "-0.1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst.name}</div>
                              <div style={{ color: t3, fontSize: "10.5px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cm.label}{inst.ville ? ` · ${inst.ville}` : ""}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "7px" }}>
                                <span style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700" }}>⭐ {(inst.moyenne_avis || 0).toFixed(1)}</span>
                                <span style={{ color: t3, fontSize: "10px" }}>({inst.nb_avis || 0} avis)</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <CTAPrestataire isDark={isDark} t1={t1} t2={t2} brd={brd}/>
            <AboutYelen isDark={isDark} t1={t1} t2={t2} brd={brd}/>

            {/* STORE BUTTONS */}
            <div style={{ background: "linear-gradient(135deg,#080812,#1a1a2e)", borderRadius: "22px", padding: "22px 20px", border: "1px solid rgba(245,166,35,0.15)" }}>
              <div style={{ color: "#fff", fontSize: "16px", fontWeight: "900", marginBottom: "4px" }}>Bientôt sur mobile</div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginBottom: "16px" }}>App native iOS & Android — disponible prochainement</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { label: "App Store", sub: "Télécharger sur", icon: <svg width="20" height="24" viewBox="0 0 814 1000" fill="#fff"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.7-57.9-145.2-119.4C62 418.3 42.1 252.4 42.1 183.7c0-26.6 2-53.2 16.1-77.1 52.7-91.6 156.2-83.9 180.5-83.9 75.1 0 135.5 53.2 180.5 53.2 43.1 0 114.9-58.5 205.6-58.5zm-60.5-30.3c-16.6-72.3-78.6-153.1-162.5-202-5.3-3.1-10.8-4.6-15.6-4.6-5.4 0-10.3 1.7-14.3 5.1-77.2 64.2-64.8 175.2-61.2 185.5 1.3 3.8 3.7 6.8 6.9 8.8 58.7 37 139.2 49.3 186.5 49.3 3.4 0 6.5-.1 9.3-.2 6.1-.3 11.2-4.4 13.3-10.2 4.6-12.8 7.1-27.5 7.1-42.9l-.5 11.2z"/></svg> },
                  { label: "Google Play", sub: "Disponible sur", icon: <svg width="20" height="22" viewBox="0 0 512 512"><path fill="#4CAF50" d="M325 256L136 46l189 210z"/><path fill="#F44336" d="M136 466l189-210-189-210L96 99v314z"/><path fill="#FFC107" d="M325 256l96-56-96-154-189 210z"/><path fill="#2196F3" d="M421 312l-96-56-189 210 285-154z"/></svg> },
                ].map(s => (
                  <div key={s.label} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }} className="tap">
                    {s.icon}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", lineHeight: 1, marginBottom: "3px" }}>{s.sub}</div>
                      <div style={{ color: "#fff", fontSize: "15px", fontWeight: "700", lineHeight: 1 }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: "8px" }}/>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TAB RECHERCHE */}
      {/* ===================================================== */}
      {tab === "recherche" && (
        <div className="scr" style={{ padding: "76px 16px 0" }}>
          <Link href="/recherche" style={{ textDecoration: "none", display: "block", marginBottom: "16px" }}>
            <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.05)", border: "1.5px solid rgba(245,166,35,0.25)", borderRadius: "16px", padding: "13px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <span style={{ color: t2, fontSize: "15px", flex: 1 }}>Institution, service, ville...</span>
            </div>
          </Link>
          <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden", marginBottom: "16px" }}>
            {[{ l: "Toutes les institutions", h: "/recherche", i: Ic.Bldg() }, { l: "Ambassades & Consulats", h: "/ambassades", i: Ic.Globe() }, { l: "Carte interactive", h: "/carte", i: Ic.Map() }].map((item, idx, arr) => (
              <Link key={item.l} href={item.h} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px", textDecoration: "none", borderBottom: idx < arr.length - 1 ? `1px solid ${brd}` : "none" }} className="tap">
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623" }}>{item.i}</div>
                  <span style={{ color: t1, fontSize: "15px" }}>{item.l}</span>
                </div>{Ic.Chev()}
              </Link>
            ))}
          </div>
          <div style={{ color: t3, fontSize: "12px", fontWeight: "600", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px", paddingLeft: "4px" }}>Par catégorie</div>
          <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden" }}>
            {["Hôpital / Clinique", "École / Université", "Mairie / Administration", "Banque / Microfinance", "Pharmacie", "Tribunal / Justice", "Transport / Logistique", "ONG / Association"].map((cat, i, arr) => (
              <Link key={cat} href={`/recherche?categorie=${encodeURIComponent(cat)}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", textDecoration: "none", borderBottom: i < arr.length - 1 ? `1px solid ${brd}` : "none" }} className="tap">
                <span style={{ color: t1, fontSize: "15px" }}>{cat}</span>{Ic.Chev()}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TAB RDV */}
      {/* ===================================================== */}
      {tab === "rdv" && (() => {
        const rdvAVenir = rdvs.filter(r => r.statut === "en_attente" || r.statut === "confirme");
        const rdvTermines = rdvs.filter(r => r.statut === "termine");
        const rdvAVenirTries = [...rdvAVenir].sort((a, b) => (a.date_rdv + (a.heure_rdv || "")).localeCompare(b.date_rdv + (b.heure_rdv || "")));
        // Mis en avant explicite du prochain RDV et du RDV en retard (2
        // cartes distinctes, avec infos complètes) — demandé par Bryan le
        // 20/07/2026, cet écran est le plus visité côté citoyen.
        const rdvEnRetard = rdvAVenirTries.find(r => r.statut === "en_attente" && r.presence_status !== "present" && rdvEstEnRetard(r.date_rdv, r.heure_rdv || "00:00"));
        const prochain = rdvAVenirTries.find(r => r.id !== rdvEnRetard?.id);
        return (
        <div className="scr" style={{ padding: "76px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "16px" }}>
            <Link href="/recherche" style={{ width: "36px", height: "36px", backgroundColor: "#F5A623", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", textDecoration: "none" }} className="tap">{Ic.Plus()}</Link>
          </div>
          {!userId ? (
            <div style={{ backgroundColor: card, borderRadius: "20px", padding: "40px 20px", textAlign: "center" }}>
              <div style={{ color: t1, fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>Connectez-vous</div>
              <div style={{ color: t2, fontSize: "14px", marginBottom: "20px" }}>Gérez vos rendez-vous depuis votre compte.</div>
              <Link href="/login" style={{ display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none" }}>Se connecter</Link>
            </div>
          ) : rdvs.length === 0 ? (
            <div style={{ backgroundColor: card, borderRadius: "20px", padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📅</div>
              <div style={{ color: t1, fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>Aucun rendez-vous</div>
              <Link href="/recherche" style={{ display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none" }}>Trouver une institution</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* STATS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
                {[
                  { n: rdvs.length,        l: "Total",     c: "#3b82f6" },
                  { n: rdvAVenir.length,   l: "À venir",   c: "#F5A623" },
                  { n: rdvTermines.length, l: "Terminés",  c: "#22c55e" },
                ].map(s => (
                  <div key={s.l} style={{ backgroundColor: card, borderRadius: "16px", padding: "14px 8px", textAlign: "center", border: `1px solid ${brd}` }}>
                    <div style={{ color: s.c, fontSize: "22px", fontWeight: "900", lineHeight: 1 }}>{s.n}</div>
                    <div style={{ color: t3, fontSize: "10px", fontWeight: "700", marginTop: "4px", letterSpacing: "0.02em" }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* RDV EN RETARD — prioritaire, affiché avant le prochain */}
              {rdvEnRetard && (
                <div onClick={() => router.push("/mes-rdv")} className="tap" style={{ backgroundColor: card, borderRadius: "16px", padding: "15px", border: "1.5px solid rgba(239,68,68,0.4)", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ color: "#ef4444", fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rendez-vous en retard</div>
                    <span style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>En retard</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "12px", backgroundColor: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontWeight: "800", fontSize: "14px", flexShrink: 0 }}>
                      {(rdvEnRetard.institution_name || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "14px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rdvEnRetard.institution_name}</div>
                      {rdvEnRetard.objet && <div style={{ color: t2, fontSize: "12px", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rdvEnRetard.objet}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: t2, fontSize: "12px", marginTop: "2px" }}>{Ic.Clock()}<span>{new Date(rdvEnRetard.date_rdv).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{rdvEnRetard.heure_rdv && ` · ${rdvEnRetard.heure_rdv}`}</span></div>
                    </div>
                    {Ic.Chev()}
                  </div>
                  <div style={{ color: "#ef4444", fontSize: "11px", lineHeight: 1.5, marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${brd}` }}>
                    Ce rendez-vous a dépassé l'heure prévue sans confirmation de votre présence. Contactez l'établissement si vous êtes toujours sur place.
                  </div>
                </div>
              )}

              {/* PROCHAIN RDV */}
              {prochain && (
                <div onClick={() => router.push("/mes-rdv")} className="tap" style={{ backgroundColor: card, borderRadius: "16px", padding: "15px", border: `1px solid ${brd}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ color: t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em" }}>Prochain rendez-vous</div>
                    <span style={{ backgroundColor: stInfo(prochain.statut).bg, color: stInfo(prochain.statut).c, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{stInfo(prochain.statut).l}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "12px", backgroundColor: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", fontWeight: "800", fontSize: "14px", flexShrink: 0 }}>
                      {(prochain.institution_name || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "14px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prochain.institution_name}</div>
                      {prochain.objet && <div style={{ color: t2, fontSize: "12px", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prochain.objet}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: t2, fontSize: "12px", marginTop: "2px" }}>{Ic.Clock()}<span>{new Date(prochain.date_rdv).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{prochain.heure_rdv && ` · ${prochain.heure_rdv}`}</span></div>
                    </div>
                    {Ic.Chev()}
                  </div>
                </div>
              )}

              {/* CTA — VERS L'ESPACE MES RDV */}
              <div style={{ background: isDark ? "linear-gradient(135deg,rgba(245,166,35,0.12),rgba(245,166,35,0.03))" : "linear-gradient(135deg,rgba(245,166,35,0.08),rgba(245,166,35,0.02))", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "20px", padding: "22px 20px" }}>
                <div style={{ width: "46px", height: "46px", borderRadius: "14px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px", boxShadow: "0 4px 14px rgba(245,166,35,0.3)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div style={{ color: t1, fontSize: "17px", fontWeight: "800", marginBottom: "6px", letterSpacing: "-0.2px" }}>Gérez vos rendez-vous</div>
                <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "18px" }}>Confirmation, annulation, report et avis — tout se passe dans votre espace Mes RDV.</div>
                <button onClick={() => router.push("/mes-rdv")} className="tap" style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  Ouvrir Mes RDV
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
        );
      })()}


      {/* ===================================================== */}
      {/* TAB COMPTE */}
      {/* ===================================================== */}
      {tab === "compte" && (
        <div className="scr" style={{ padding: "76px 16px 0" }}>
          {!userId ? (
            <div style={{ backgroundColor: card, borderRadius: "20px", padding: "32px 20px", textAlign: "center" }}>
              <div style={{ width: "70px", height: "70px", borderRadius: "50%", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: t1 }}>{Ic.User()}</div>
              <div style={{ color: t1, fontSize: "18px", fontWeight: "700", marginBottom: "6px" }}>Non connecté</div>
              <div style={{ color: t2, fontSize: "14px", marginBottom: "20px" }}>Créez un compte pour accéder à tous les services.</div>
              <Link href="/inscription" style={{ display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none", marginBottom: "10px" }}>Créer un compte</Link>
              <Link href="/login" style={{ display: "block", backgroundColor: card2, color: t1, fontWeight: "600", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none" }}>Se connecter</Link>
            </div>
          ) : (
            <div>
              {/* HEADER IDENTITÉ — carte YelenID + infos de compte. "Niveau
                  du compte" n'existe pas encore comme concept produit
                  (aucun système de palier citoyen) : affiché honnêtement
                  "À venir" plutôt qu'inventé (signalé le 18/07/2026). */}
              <div style={{ background: "linear-gradient(135deg,#080812,#1a1208)", borderRadius: "20px", padding: "18px", marginBottom: "12px", border: "1px solid rgba(245,166,35,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" }}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontSize: "16px", fontWeight: "700", marginBottom: "2px" }}>{userName}</div>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", marginBottom: "4px" }}>{userPhone}</div>
                    <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#F5A623", fontWeight: "700" }}>{userId ? formatYelenId(userId) : "—"}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    {Ic.Shield()}
                    <span style={{ color: "#22c55e", fontSize: "9px", fontWeight: "700" }}>VÉRIFIÉ</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Niveau du compte</div>
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "12.5px", fontWeight: "600" }}>À venir</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Membre depuis</div>
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "12.5px", fontWeight: "600" }}>{userCreeLe ? new Date(userCreeLe).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                  </div>
                </div>
                <Link href="/compte/informations-personnelles" style={{ display: "block", textAlign: "center", marginTop: "10px", backgroundColor: "rgba(245,166,35,0.12)", color: "#F5A623", fontWeight: "700", fontSize: "13px", padding: "10px", borderRadius: "10px", textDecoration: "none" }} className="tap">Modifier mon profil</Link>
              </div>

              {/* BOUTON BIOMÉTRIE — fonctionnel dès aujourd'hui (WebAuthn
                  réel), laissé ici en accès rapide. La section Personal
                  Information ci-dessous référence aussi /compte/biometrie
                  (encore vide) : ce bouton restera la voie d'activation
                  réelle jusqu'à ce que cet écran reçoive son contenu. */}
              <button
                onClick={() => {
                  const isRegistered = localStorage.getItem("yelen224_bio_registered") === "1";
                  if (isRegistered) {
                    setBioAuthOpen(true);
                  } else {
                    setBioOptInOpen(true);
                  }
                }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "16px", padding: "14px 16px", cursor: "pointer", marginBottom: "12px" }}
                className="tap"
              >
                <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
                    <path d="M8 11a4 4 0 0 0 8 0"/>
                    <path d="M12 18v4"/>
                    <path d="M4 15.5A9 9 0 0 0 20 15"/>
                  </svg>
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ color: t1, fontSize: "15px", fontWeight: "700" }}>
                    {localStorage.getItem("yelen224_bio_registered") === "1" ? "Biométrie active" : "Activer la biométrie"}
                  </div>
                  <div style={{ color: t2, fontSize: "12px" }}>
                    {localStorage.getItem("yelen224_bio_registered") === "1" ? "Empreinte / Face ID configuré" : "Connexion rapide par empreinte ou Face ID"}
                  </div>
                </div>
                <span style={{
                  background: localStorage.getItem("yelen224_bio_registered") === "1" ? "rgba(34,197,94,0.12)" : "rgba(142,142,147,0.1)",
                  color: localStorage.getItem("yelen224_bio_registered") === "1" ? "#22c55e" : t3,
                  fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px"
                }}>
                  {localStorage.getItem("yelen224_bio_registered") === "1" ? "ON" : "OFF"}
                </span>
              </button>

              {/* ACTIONS RAPIDES — 5 écrans les plus utilisés, à plat,
                  visibles sans clic (retour direct de Bryan le 18/07/2026 :
                  le menu par section devenait trop long avec 29 écrans). */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ color: t3, fontSize: "12px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>Actions rapides</div>
                <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden" }}>
                  {ACTIONS_RAPIDES_COMPTE.map((item, i, arr) => (
                    <Link key={item.l} href={item.h} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px", textDecoration: "none", borderBottom: i < arr.length - 1 ? `1px solid ${brd}` : "none" }} className="tap">
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(245,166,35,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623" }}>{item.i}</div>
                      <span style={{ color: t1, fontSize: "15px", flex: 1 }}>{item.l}</span>
                      {Ic.Chev()}
                    </Link>
                  ))}
                </div>
              </div>

              {/* 5 SECTIONS — Personal Information / Manage Account / Mon
                  Activité / Help & Support / Legal (décision CEO 18/07/2026).
                  Repliées par défaut : juste le nom + une flèche vers le bas
                  pour signaler que c'est cliquable. Le clic déplie la liste
                  complète de la section (pas un sous-ensemble). */}
              {SECTIONS_COMPTE.map(sec => {
                const ouvert = comptOuvert[sec.titre] === true;
                return (
                  <div key={sec.titre} style={{ marginBottom: "16px" }}>
                    <button
                      onClick={() => setComptOuvert(prev => ({ ...prev, [sec.titre]: !ouvert }))}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", padding: "14px 16px", backgroundColor: card, border: `1px solid ${ouvert ? "rgba(245,166,35,0.35)" : "transparent"}`, borderRadius: "16px", cursor: "pointer" }}
                      className="tap"
                    >
                      <span style={{ color: t1, fontSize: "15px", fontWeight: "700" }}>{sec.titre}</span>
                      <span style={{ display: "inline-flex", color: ouvert ? "#F5A623" : t2, transform: ouvert ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.2s" }}>{Ic.Chev()}</span>
                    </button>
                    {ouvert && (
                      <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden", marginTop: "8px" }}>
                        {sec.items.map((item, i, arr) => (
                          <Link key={item.l} href={item.h} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px", textDecoration: "none", borderBottom: i < arr.length - 1 ? `1px solid ${brd}` : "none" }} className="tap">
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(245,166,35,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623" }}>{item.i}</div>
                            <span style={{ color: t1, fontSize: "15px", flex: 1 }}>{item.l}</span>
                            {Ic.Chev()}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <button onClick={() => setLogoutOpen(true)} style={{ width: "100%", backgroundColor: "rgba(255,59,48,0.1)", border: "none", borderRadius: "14px", padding: "15px", color: "#FF3B30", fontSize: "15px", fontWeight: "600", cursor: "pointer" }} className="tap">Déconnexion</button>

              {/* FOOTER — pied de l'onglet Compte (retour Bryan 18/07/2026 :
                  l'app a atteint un niveau plus abouti, mérite une signature) */}
              <div style={{ textAlign: "center", padding: "24px 0 4px" }}>
                <div style={{ color: t2, fontSize: "12.5px", fontWeight: "700" }}>© {new Date().getFullYear()} Yelen — Sempya224</div>
                <div style={{ color: t3, fontSize: "11px", marginTop: "3px" }}>Version {YELEN_APP_VERSION}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CARTE PLEIN ÉCRAN */}
      {carteOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: bg, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", backgroundColor: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${brd}`, flexShrink: 0 }}>
            <div style={{ color: t1, fontSize: "17px", fontWeight: "700" }}>Carte des prestataires</div>
            <button onClick={() => setCarteOpen(false)} style={{ background: card2, border: "none", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }} className="tap">{Ic.X()}</button>
          </div>
          <div className="map-wrap" style={{ flex: 1, overflow: "hidden" }}>
            {mapInsts.length > 0 ? <CarteMapHome institutions={mapInsts as any}/> : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: t3, padding: "16px", textAlign: "center" }}>
                {mapLoaded ? "Aucun établissement localisé sur la carte pour l'instant." : "Chargement..."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MON ASSISTANT — bandeau tirable, uniquement onglet Accueil pour ce
          MVP (voir CLAUDE.md /chantier-mon-assistant). Sous la nav du bas
          en z-index (90 < 100), jamais par-dessus le header. */}
      {tab === "accueil" && <MonAssistant userId={userId}/>}

      {/* NAVIGATION BAS — fond général doré retiré en clair (fond neutre,
          seuls l'icône et le libellé de l'onglet actif passent en or),
          façon Booking/PayPal. Mode sombre volontairement inchangé. */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: isDark ? "linear-gradient(180deg,#E8960A 0%,#C8740A 100%)" : card, paddingTop: "10px", paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)", display: "grid", gridTemplateColumns: "repeat(4,1fr)", boxShadow: isDark ? "0 -4px 24px rgba(200,116,10,0.45)" : "0 -1px 0 rgba(0,0,0,0.06)" }}>
        {([
          { key: "accueil",    label: "Accueil",  r: (a: boolean) => Ic.Home(a) },
          { key: "recherche",  label: "Recherche",r: (a: boolean) => Ic.Search(a) },
          { key: "rdv",        label: "RDV",      r: (a: boolean) => Ic.Cal(a) },
          { key: "compte",     label: "Compte",   r: (a: boolean) => Ic.User(a) },
        ] as { key: Tab; label: string; r: (a: boolean) => any }[]).map(item => {
          const active = tab === item.key;
          const activeColor = isDark ? "#ffffff" : "#F5A623";
          // t3 (gris clair) était trop pâle pour un onglet inactif — t2
          // (gris foncé) reste distinct de l'or actif tout en restant
          // lisible, icône et libellé suivent tous les deux via `color`.
          const inactiveColor = isDark ? "rgba(255,255,255,0.6)" : t2;
          return (
            <button key={item.key} onClick={() => changeTab(item.key as Tab)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", background: isDark && active ? "rgba(0,0,0,0.22)" : "none", border: "none", padding: "6px 4px", cursor: "pointer", color: active ? activeColor : inactiveColor, position: "relative", transition: "all 0.15s" }} className="tap">
              {isDark && active && <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "2px", background: "#fff", borderRadius: "0 0 2px 2px" }}/>}
              {item.r(active)}
              <span style={{ fontSize: "10px", fontWeight: active ? "800" : "600", letterSpacing: "0.2px" }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}