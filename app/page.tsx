"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

// ============================================================
// ICÔNES
// ============================================================
const Ic = {
  Home:     (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Search:   (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Cal:      (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Msg:      (a?: boolean, b?: number) => <span style={{ position: "relative", display: "inline-flex", pointerEvents: "none" }}><svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>{b ? <span style={{ position: "absolute", top: "-4px", right: "-4px", backgroundColor: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "800", borderRadius: "10px", minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none" }}>{b}</span> : null}</span>,
  User:     (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Bell:     (dot?: boolean) => <span style={{ position: "relative", display: "inline-flex", pointerEvents: "none" }}><svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>{dot && <span style={{ position: "absolute", top: "1px", right: "1px", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#ef4444", border: "2px solid transparent", pointerEvents: "none" }}/>}</span>,
  Menu:     (color = "#fff") => <svg style={P} width="28" height="22" viewBox="0 0 28 22" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><line x1="0" y1="2" x2="28" y2="2"/><line x1="0" y1="11" x2="22" y2="11"/><line x1="0" y1="20" x2="28" y2="20"/></svg>,
  X:        () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
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
  Scan:     () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>,
  Bank:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
};

// ============================================================
// TYPES
// ============================================================
type Tab = "accueil" | "recherche" | "rdv" | "messagerie" | "compte";
type RDV = { id: string; date_rdv: string; heure_rdv?: string; statut: string; objet?: string; institution_name?: string; presence_status?: string };
type Inst = { id: string; name: string; category?: string; ville?: string; quartier?: string; adresse?: string; latitude?: number; longitude?: number; phone?: string; logo?: string; moyenne_avis?: number; nb_avis?: number; badge_verifie?: boolean; disponibilites?: any };
type Notif = { id: string; titre: string; message: string; type: "info" | "success" | "warning" | "rdv"; lu: boolean; temps: string; created_at?: string };

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

function calcOuvert(disponibilites: any): { ouvert: boolean | null; horaireDuJour: string } {
  let ouvert: boolean | null = null;
  let horaireDuJour = "";
  try {
    const dispo = typeof disponibilites === "string" ? JSON.parse(disponibilites) : disponibilites;
    if (Array.isArray(dispo)) {
      const JOURS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
      const jourNom = JOURS[new Date().getDay()];
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const h = dispo.find((d: any) => d.jour?.toLowerCase() === jourNom.toLowerCase());
      if (h) {
        if (h.ouvert === false) { ouvert = false; }
        else if (h.debut && h.fin) {
          const [dh, dm] = h.debut.split(":").map(Number);
          const [fh, fm] = h.fin.split(":").map(Number);
          ouvert = nowMin >= dh * 60 + dm && nowMin <= fh * 60 + fm;
          horaireDuJour = `${h.debut}–${h.fin}`;
        } else if (h.heures) { ouvert = true; horaireDuJour = h.heures; }
      }
    }
  } catch {}
  return { ouvert, horaireDuJour };
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
// WEBAUTHN — Biométrie réelle (empreinte / Face ID)
// ============================================================

/** Génère un challenge aléatoire pour WebAuthn */
function generateChallenge(): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;
}

/** Vérifie si WebAuthn est supporté sur l'appareil */
function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";
}

/** Enregistre la biométrie de l'utilisateur (première fois) */
async function registerBiometrie(userId: string, userName: string): Promise<boolean> {
  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) return false;

    const challenge = generateChallenge();
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "YELEN224", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId) as unknown as BufferSource,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256
          { type: "public-key", alg: -257 },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: "none",
      },
    }) as PublicKeyCredential | null;

    if (!credential) return false;

    // Stocker l'ID de credential pour les prochaines authentifications
    localStorage.setItem("yelen224_bio_credential_id", credential.id);
    localStorage.setItem("yelen224_bio_registered", "1");
    return true;
  } catch (err: any) {
    console.error("WebAuthn register error:", err);
    return false;
  }
}

/** Authentifie via biométrie (empreinte / Face ID) */
async function authenticateBiometrie(): Promise<boolean> {
  try {
    const challenge = generateChallenge();
    const credentialId = localStorage.getItem("yelen224_bio_credential_id");

    const options: PublicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      userVerification: "required",
      rpId: window.location.hostname,
    };

    if (credentialId) {
      // Cibler le credential enregistré
      const idBytes = Uint8Array.from(atob(credentialId.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      options.allowCredentials = [{ type: "public-key", id: idBytes as unknown as BufferSource, transports: ["internal"] }];
    }

    const assertion = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential | null;
    return !!assertion;
  } catch (err: any) {
    console.error("WebAuthn auth error:", err);
    return false;
  }
}

// ============================================================
// BIOMETRIE MODAL — Réel WebAuthn (empreinte / Face ID)
// ============================================================
function BiometrieModal({ onSuccess, onClose, prenom, isDark, card, t1, t2, brd, userId, userName }: {
  onSuccess: () => void; onClose: () => void; prenom: string;
  isDark: boolean; card: string; t1: string; t2: string; brd: string;
  userId: string; userName: string;
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
        ok = await registerBiometrie(userId, userName);
      } else {
        // Déjà enregistré : juste s'authentifier
        ok = await authenticateBiometrie();
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
              {phase === "success" ? "YelenID vérifié · AES-256" : "WebAuthn · Chiffrement AES-256"}
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
function YelenIDCard({ userId, userName, userPhone, initials, rdvs, isDark, t1, t2, t3, card, brd, router }: any) {
  const yelenId = userId ? `GN-2024-${String(userId).substring(0, 7).toUpperCase()}` : "GN-2024-XXXXXXX";
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
            <div style={{ width: "58px", height: "58px", borderRadius: "18px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "900", color: "#080812", border: "2px solid rgba(245,166,35,0.4)" }}>
              {initials}
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

// ============================================================
// FIL D'ACTIVITÉ
// ============================================================
function FilActivite({ rdvs, t1, t2, t3, card, brd, router }: any) {
  if (!rdvs || rdvs.length === 0) return null;

  function tempsDepuis(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `Il y a ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Il y a ${h}h`;
    const j = Math.floor(h / 24);
    if (j < 7) return `Il y a ${j}j`;
    return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ color: t1, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px" }}>Activité récente</div>
        <button onClick={() => router.push("/mes-rdv")} style={{ background: "none", border: "none", color: "#F5A623", fontSize: "13px", fontWeight: "700", cursor: "pointer", padding: 0 }}>
          Tout voir
        </button>
      </div>
      <div style={{ backgroundColor: card, borderRadius: "18px", border: `1px solid ${brd}`, overflow: "hidden" }}>
        {rdvs.slice(0, 5).map((r: any, i: number) => {
          const s = stInfo(r.statut);
          return (
            <div key={r.id} onClick={() => router.push("/mes-rdv")}
              style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", borderBottom: i < Math.min(rdvs.length, 5) - 1 ? `1px solid ${brd}` : "none", cursor: "pointer" }}
              className="tap">
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${s.bg}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: s.c }}>
                {Ic.Cal()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: t1, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.institution_name || "Institution"}
                </div>
                <div style={{ color: t2, fontSize: "11px", marginTop: "2px" }}>
                  RDV — {new Date(r.date_rdv).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  {r.heure_rdv && ` à ${r.heure_rdv}`}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                <span style={{ backgroundColor: s.bg, color: s.c, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{s.l}</span>
                <span style={{ color: t3, fontSize: "10px" }}>{tempsDepuis(r.date_rdv)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
// INSTITUTION LOGO
// ============================================================
function InstLogoCell({ logo, name, catColor, size = 54 }: { logo?: string; name: string; catColor: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  if (logo && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: "14px", overflow: "hidden", flexShrink: 0, border: `1.5px solid ${catColor}30` }}>
        <img src={logo} alt={name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "14px", flexShrink: 0, background: `linear-gradient(135deg,${catColor}22,${catColor}0d)`, border: `1.5px solid ${catColor}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: catColor, fontSize: size * 0.28 + "px", fontWeight: "900" }}>{initials || "?"}</span>
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

// ============================================================
// PANEL NOTIFICATIONS
// ============================================================
function NotifPanel({ onClose, isDark, t1, t2, t3, card, card2, brd, userId, userName }: any) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (userId) {
        const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
        if (data && data.length > 0) {
          setNotifs(data.map((n: any) => ({ id: String(n.id), titre: n.titre || "Notification", message: n.message || "", type: n.type || "info", lu: Boolean(n.lu), temps: n.created_at ? fmt(n.created_at) : "Récemment" })));
        } else {
          setNotifs([
            { id: "w", titre: `Bienvenue, ${userName.split(" ")[0]} !`, message: "Votre compte YELEN224 est actif. Prenez votre premier rendez-vous.", type: "success", lu: false, temps: "Maintenant" },
            { id: "u", titre: "Nouveaux prestataires", message: "De nouvelles institutions ont rejoint YELEN224 cette semaine.", type: "info", lu: true, temps: "2j" },
          ]);
        }
      } else {
        setNotifs([
          { id: "g1", titre: "Bienvenue sur YELEN224", message: "Plateforme officielle de RDV en République de Guinée.", type: "info", lu: false, temps: "Maintenant" },
          { id: "g2", titre: "Nouveaux services", message: "Les ambassades acceptent désormais les RDV en ligne.", type: "success", lu: true, temps: "1h" },
        ]);
      }
      setLoading(false);
    }
    load();
  }, [userId, userName]);

  function fmt(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "À l'instant"; if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}j`;
  }

  const nc = (t: string) => ({ success: "#22c55e", rdv: "#007AFF", warning: "#F5A623", info: "#8E8E93" })[t] || "#8E8E93";
  const unread = notifs.filter(n => !n.lu).length;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "64px", right: "12px", width: "min(360px, calc(100vw - 24px))", backgroundColor: card, borderRadius: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: `1px solid ${brd}`, overflow: "hidden", animation: "notifIn 0.2s cubic-bezier(0.4,0,0.2,1)" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: "800" }}>Notifications</div>
            {unread > 0 && <span style={{ backgroundColor: "#ef4444", color: "#fff", fontSize: "10px", fontWeight: "800", borderRadius: "10px", padding: "1px 7px" }}>{unread}</span>}
          </div>
          <button onClick={onClose} style={{ background: card2, border: "none", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t2 }}>{Ic.X()}</button>
        </div>
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {loading ? <div style={{ padding: "32px", textAlign: "center", color: t3 }}>Chargement...</div>
          : notifs.map((n, i) => (
            <div key={n.id} style={{ padding: "13px 16px", borderBottom: i < notifs.length - 1 ? `1px solid ${brd}` : "none", display: "flex", gap: "12px" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: `${nc(n.type)}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: nc(n.type) }}>{Ic.Notif()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                  <div style={{ color: t1, fontSize: "13px", fontWeight: n.lu ? "600" : "800", flex: 1 }}>{n.titre}</div>
                  {!n.lu && <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#F5A623" }}/>}
                </div>
                <div style={{ color: t2, fontSize: "11px", lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ color: t3, fontSize: "10px", marginTop: "3px" }}>{n.temps}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export default function YelenApp() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const [tab, setTab]               = useState<Tab>("accueil");
  const [drawer, setDrawer]         = useState(false);
  const [carteOpen, setCarteOpen]   = useState(false);
  const [notifOpen, setNotifOpen]   = useState(false);

  // ── Biométrie ──
  const [bioOptInOpen, setBioOptInOpen] = useState(false);   // modal d'opt-in
  const [bioAuthOpen, setBioAuthOpen]   = useState(false);   // modal d'auth WebAuthn
  const [bioOk, setBioOk]               = useState(false);   // auth réussie

  const [userId, setUserId]         = useState<string | null>(null);
  const [userName, setUserName]     = useState("");
  const [userPhone, setUserPhone]   = useState("");
  const [rdvs, setRdvs]             = useState<RDV[]>([]);
  const [insts, setInsts]           = useState<Inst[]>([]);
  const [mapInsts, setMapInsts]     = useState<Inst[]>([]);
  const [msgCount, setMsg]          = useState(0);
  const [stats, setStats]           = useState({ i: 0, c: 0 });
  const [now, setNow]               = useState<Date | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [userLat, setUserLat]       = useState<number | null>(null);
  const [userLng, setUserLng]       = useState<number | null>(null);
  const [scrolled, setScrolled]     = useState(false);
  const [ready, setReady]           = useState(false);

  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); }, () => {}, { timeout: 5000 });
    }
    const onScroll = () => setScrolled(window.scrollY > 60);
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
          setInsts(rows.slice(0, 5));
          setMapInsts(rows.filter(r => r.latitude && r.longitude));
        }

        if (id) {
          const uD = await ft(supabase.from("users").select("prenom,nom,name,phone").eq("id", id).maybeSingle(), 5000);
          if (uD && (uD as any).data) {
            const r = (uD as any).data;
            let p = (r.prenom || "").trim(), n = (r.nom || "").trim();
            if (!p && r.name) { const pts = String(r.name).trim().split(/\s+/); p = pts[0] || ""; n = pts.slice(1).join(" ") || ""; }
            setUserName(p ? `${p} ${n}`.trim() : r.phone || "Citoyen");
            setUserPhone(r.phone || "");
          }

          const rD = await ft(supabase.from("rdv").select("id,date_rdv,heure_rdv,statut,objet,institution_id,presence_status").eq("citoyen_id", id).order("date_rdv", { ascending: false }).limit(10), 5000);
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
            const nD = await ft(supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", id).eq("lu", false), 4000);
            if (nD) setNotifCount((nD as any).count || 0);
          } catch { setNotifCount(1); }
          try {
            const mD = await ft(supabase.from("messages").select("*", { count: "exact", head: true }).eq("receiver_id", id).eq("lu", false), 4000);
            if (mD) setMsg((mD as any).count || 0);
          } catch {}
        } else { setNotifCount(2); }
      } catch (e) { console.error("load error", e); }
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

  const DRAWER_SECTIONS = [
    { titre: "Espace Citoyen", items: [
      { l: "Tableau de bord",   h: "/dashboard",       i: Ic.Home() },
      { l: "Mes rendez-vous",   h: "/mes-rdv",         i: Ic.Cal() },
      { l: "Mon QR Code",       h: "/mon-qr",          i: Ic.QR() },
      { l: "Mon profil",        h: "/profil",          i: Ic.User() },
      { l: "Messagerie",        h: "/messagerie",      i: Ic.Msg() },
      { l: "Paramètres",        h: "/parametres",      i: Ic.Settings() },
    ]},
    { titre: "Services", items: [
      { l: "Toutes les institutions", h: "/recherche",  i: Ic.Bldg() },
      { l: "Ambassades & Consulats",  h: "/ambassades", i: Ic.Globe() },
      { l: "Carte interactive",       h: "/carte",      i: Ic.Map() },
    ]},
    { titre: "Espace Prestataire", items: [
      { l: "Inscrire mon institution", h: "/institution/inscription", i: Ic.Bldg() },
      { l: "Connexion institution",    h: "/institution/connexion",   i: Ic.Lock() },
      { l: "Dashboard institution",    h: "/institution/dashboard",   i: Ic.Hosp() },
      { l: "Scanner QR accueil",       h: "/institution/scanner",     i: Ic.Scan() },
      { l: "Guide prestataire",        h: "/guide-prestataire",       i: Ic.Info() },
    ]},
    { titre: "Légal & Support", items: [
      { l: "CGU",                h: "/cgu",             i: Ic.Info() },
      { l: "Confidentialité",    h: "/confidentialite", i: Ic.Lock() },
      { l: "FAQ",                h: "/faq",             i: Ic.Info() },
      { l: "Contact",            h: "/contact",         i: Ic.Map() },
    ]},
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
            userId={userId} userName={userName}
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

      {/* DRAWER MENU */}
      {drawer && (
        <div onClick={() => setDrawer(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "82vw", maxWidth: "340px", backgroundColor: card, display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.3)", animation: "slideLeft 0.28s cubic-bezier(0.4,0,0.2,1)" }}>
            <div style={{ padding: "16px 20px 18px", borderBottom: `1px solid ${brd}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <Logo size={36} textSize={15} subSize={7} color={t1}/>
                <button onClick={() => setDrawer(false)} style={{ background: "none", border: `1px solid ${brd}`, borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer" }}>{Ic.X()}</button>
              </div>
              {userId ? (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "rgba(245,166,35,0.07)", borderRadius: "14px", border: "1px solid rgba(245,166,35,0.15)" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "800", color: "#080812", flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "15px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName}</div>
                    <div style={{ color: t2, fontSize: "12px" }}>{userPhone}</div>
                  </div>
                  {Ic.Shield()}
                </div>
              ) : (
                <div style={{ display: "flex", gap: "8px" }}>
                  <Link href="/inscription" onClick={() => setDrawer(false)} style={{ flex: 1, backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "13px", padding: "10px", borderRadius: "10px", textDecoration: "none", textAlign: "center", display: "block" }}>S'inscrire</Link>
                  <Link href="/login" onClick={() => setDrawer(false)} style={{ flex: 1, backgroundColor: card2, color: t1, fontWeight: "600", fontSize: "13px", padding: "10px", borderRadius: "10px", textDecoration: "none", textAlign: "center", border: `1px solid ${brd}`, display: "block" }}>Connexion</Link>
                </div>
              )}

              {/* ── Bouton biométrie dans le menu ── */}
              {userId && (
                <button
                  onClick={() => {
                    setDrawer(false);
                    const isRegistered = localStorage.getItem("yelen224_bio_registered") === "1";
                    if (isRegistered) {
                      setBioAuthOpen(true);
                    } else {
                      setBioOptInOpen(true);
                    }
                  }}
                  style={{ marginTop: "10px", width: "100%", display: "flex", alignItems: "center", gap: "10px", background: isDark ? "rgba(245,166,35,0.07)" : "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "12px", padding: "10px 14px", cursor: "pointer" }}
                  className="tap"
                >
                  <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
                      <path d="M8 11a4 4 0 0 0 8 0"/>
                      <path d="M12 18v4"/>
                      <path d="M4 15.5A9 9 0 0 0 20 15"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ color: t1, fontSize: "13px", fontWeight: "700" }}>
                      {localStorage.getItem("yelen224_bio_registered") === "1" ? "Biométrie active" : "Activer la biométrie"}
                    </div>
                    <div style={{ color: t2, fontSize: "11px" }}>
                      {localStorage.getItem("yelen224_bio_registered") === "1" ? "Empreinte / Face ID configuré" : "Connexion rapide & sécurisée"}
                    </div>
                  </div>
                  {localStorage.getItem("yelen224_bio_registered") === "1"
                    ? <span style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>ON</span>
                    : <span style={{ background: "rgba(245,166,35,0.12)", color: "#F5A623", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>OFF</span>
                  }
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
              {DRAWER_SECTIONS.map(sec => (
                <div key={sec.titre} style={{ marginBottom: "2px" }}>
                  <div style={{ padding: "10px 20px 5px", color: t3, fontSize: "11px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase" }}>{sec.titre}</div>
                  {sec.items.map((item, i) => (
                    <Link key={item.l} href={item.h} onClick={() => setDrawer(false)} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 20px", textDecoration: "none", borderBottom: i < sec.items.length - 1 ? `1px solid ${brd}` : "none" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(245,166,35,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", flexShrink: 0 }}>{item.i}</div>
                      <span style={{ color: t1, fontSize: "15px", flex: 1 }}>{item.l}</span>
                      {Ic.Chev()}
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ padding: "14px 20px", borderTop: `1px solid ${brd}` }}>
              {userId && (
                <button onClick={() => {
                  try { localStorage.removeItem(YELEN224_USER_ID_KEY); localStorage.removeItem("yelen224_last_bio"); localStorage.removeItem("yelen224_bio_registered"); localStorage.removeItem("yelen224_bio_credential_id"); localStorage.removeItem("yelen224_bio_ignored"); } catch {}
                  window.location.reload(); setDrawer(false);
                }} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", background: "rgba(255,59,48,0.08)", border: "none", borderRadius: "12px", padding: "12px 16px", cursor: "pointer", marginBottom: "12px" }} className="tap">
                  {Ic.Out()}<span style={{ color: "#FF3B30", fontSize: "15px", fontWeight: "600" }}>Déconnexion</span>
                </button>
              )}
              <div style={{ textAlign: "center" }}>
                <div style={{ color: t3, fontSize: "11px", marginBottom: "6px" }}>Powered by</div>
                <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <span style={{ backgroundColor: "#FE2C55", color: "#fff", fontSize: "11px", fontWeight: "800", padding: "4px 12px", borderRadius: "8px" }}>SEMPYA224</span>
                </a>
                <div style={{ color: t3, fontSize: "10px", marginTop: "6px" }}>© {new Date().getFullYear()}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {notifOpen && <NotifPanel onClose={() => { setNotifOpen(false); setNotifCount(0); }} isDark={isDark} t1={t1} t2={t2} t3={t3} card={card} card2={card2} brd={brd} userId={userId} userName={userName}/>}

      {/* ══════════════════════════════════════════════════════
          HEADER STICKY — Logo seul, sans texte
      ══════════════════════════════════════════════════════ */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: scrolled ? (isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)") : "transparent", backdropFilter: scrolled ? "blur(20px)" : "none", WebkitBackdropFilter: scrolled ? "blur(20px)" : "none", borderBottom: scrolled ? `1px solid ${brd}` : "none", transition: "background-color 0.3s ease" }}>
        <div style={{ padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>

          {/* ── LOGO SEUL — aucun texte dans le header ── */}
          <div style={{ position: "relative", width: "38px", height: "38px", flexShrink: 0 }}>
            <div style={{ position: "absolute", inset: 0, backgroundColor: "#F5A623", borderRadius: "28%", transform: "rotate(8deg)", opacity: 0.22 }}/>
            <div style={{ position: "relative", width: "38px", height: "38px", backgroundColor: "#F5A623", borderRadius: "28%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 12px rgba(245,166,35,0.45)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ThemeToggle/>

            {/* Badge biométrie si session active */}
            {userId && bioOk && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", background: scrolled ? "rgba(34,197,94,0.1)" : "rgba(0,0,0,0.15)", borderRadius: "20px", padding: "5px 10px", backdropFilter: "blur(8px)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontSize: "10px", fontWeight: "700", color: "#22c55e" }}>ID</span>
              </div>
            )}

            <button onClick={() => { setNotifOpen(o => !o); if (!notifOpen) setNotifCount(0); }} style={{ position: "relative", background: scrolled ? card2 : "rgba(255,255,255,0.15)", border: "none", padding: "7px", cursor: "pointer", color: scrolled ? (notifOpen ? "#F5A623" : t2) : "#fff", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", width: "38px", height: "38px" }} className="tap">
              {Ic.Bell(notifCount > 0)}
              {notifCount > 0 && <span style={{ position: "absolute", top: "4px", right: "4px", width: "9px", height: "9px", borderRadius: "50%", backgroundColor: "#ef4444", border: "2px solid transparent" }}/>}
            </button>
            <button onClick={() => setDrawer(true)} style={{ background: "none", border: "none", padding: "7px 4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: scrolled ? t1 : "#fff" }} className="tap">
              {Ic.Menu(scrolled ? t1 : "#fff")}
            </button>
          </div>
        </div>
      </header>

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
                <YelenIDCard userId={userId} userName={userName} userPhone={userPhone} initials={initials} rdvs={rdvs} isDark={isDark} t1={t1} t2={t2} t3={t3} card={card} brd={brd} router={router}/>
                <QuickActions router={router} t1={t1} t2={t2} card={card} brd={brd} isDark={isDark}/>
                <FilActivite rdvs={rdvs} t1={t1} t2={t2} t3={t3} card={card} brd={brd} router={router}/>
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
                {mapInsts.length > 0 ? <CarteMapHome institutions={mapInsts as any}/> : <div style={{ height: "100%", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "8px" }}>{Ic.Map()}<span style={{ color: t3, fontSize: "13px" }}>Chargement de la carte...</span></div>}
                <button onClick={e => { e.stopPropagation(); setCarteOpen(true); }} style={{ position: "absolute", bottom: "10px", right: "10px", backgroundColor: isDark ? "rgba(10,10,15,0.88)" : "rgba(255,255,255,0.92)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "20px", padding: "7px 14px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "#F5A623", fontSize: "12px", fontWeight: "700", backdropFilter: "blur(8px)", zIndex: 10 }} className="tap">
                  {Ic.Expand()} Plein écran
                </button>
              </div>
            </div>

            {/* INSTITUTIONS */}
            {insts.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ color: t1, fontSize: "17px", fontWeight: "800", letterSpacing: "-0.3px" }}>Prestataires à proximité</div>
                  <Link href="/recherche" style={{ color: "#F5A623", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Voir tout</Link>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {insts.map(inst => {
                    const { ouvert, horaireDuJour } = calcOuvert(inst.disponibilites);
                    let distLabel = "";
                    if (inst.latitude && inst.longitude && userLat && userLng) {
                      const R = 6371;
                      const dLat = ((inst.latitude - userLat) * Math.PI) / 180;
                      const dLon = ((inst.longitude - userLng) * Math.PI) / 180;
                      const a = Math.sin(dLat / 2) ** 2 + Math.cos((userLat * Math.PI) / 180) * Math.cos((inst.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
                      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                      distLabel = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
                    } else if (inst.ville) { distLabel = inst.ville; }
                    const cm = catMeta[inst.category || ""] || { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", label: inst.category || "Autre" };
                    return (
                      <Link key={inst.id} href={`/institution/${inst.id}`} style={{ textDecoration: "none", display: "block" }} className="tap">
                        <div style={{ backgroundColor: card, borderRadius: "18px", border: `1px solid ${brd}`, overflow: "hidden" }}>
                          <div style={{ height: "3px", background: `linear-gradient(90deg,${cm.color},${cm.color}44)` }}/>
                          <div style={{ padding: "14px 15px" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "13px" }}>
                              <InstLogoCell logo={inst.logo} name={inst.name} catColor={cm.color} size={54}/>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: t1, fontSize: "15px", fontWeight: "800", letterSpacing: "-0.2px", marginBottom: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst.name}</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "6px" }}>
                                  <span style={{ background: cm.bg, color: cm.color, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{cm.label.toUpperCase()}</span>
                                  {inst.badge_verifie && <span style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>✓ VÉRIFIÉ</span>}
                                  {ouvert !== null && (
                                    <span style={{ background: ouvert ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: ouvert ? "#22c55e" : "#ef4444", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: ouvert ? "#22c55e" : "#ef4444", display: "inline-block" }}/>
                                      {ouvert ? `Ouvert${horaireDuJour ? " · " + horaireDuJour : ""}` : "Fermé"}
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {[1,2,3,4,5].map(n => <span key={n}>{Ic.Star(n <= Math.round(inst.moyenne_avis || 0))}</span>)}
                                    {(inst.nb_avis || 0) > 0 && <span style={{ color: t3, fontSize: "10px", marginLeft: "2px" }}>({inst.nb_avis})</span>}
                                  </div>
                                  {distLabel && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "3px", color: t3, fontSize: "10px", fontWeight: "600" }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                      {distLabel}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div style={{ color: t3, alignSelf: "center", flexShrink: 0 }}>{Ic.Chev()}</div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
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
          <h1 style={{ color: t1, fontSize: "26px", fontWeight: "800", margin: "0 0 14px", letterSpacing: "-0.5px" }}>Recherche</h1>
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
      {tab === "rdv" && (
        <div className="scr" style={{ padding: "76px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h1 style={{ color: t1, fontSize: "26px", fontWeight: "800", margin: 0, letterSpacing: "-0.5px" }}>Mes RDV</h1>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {rdvs.map(r => {
                const s = stInfo(r.statut);
                const ps = r.presence_status ? stInfo(r.presence_status) : null;
                return (
                  <div key={r.id} style={{ backgroundColor: card, borderRadius: "16px", padding: "15px", border: `1px solid ${brd}` }} className="tap" onClick={() => router.push("/mon-qr")}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ color: t1, fontSize: "15px", fontWeight: "700" }}>{r.institution_name}</div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {ps && <span style={{ backgroundColor: ps.bg, color: ps.c, fontSize: "9px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px" }}>{ps.l}</span>}
                        <span style={{ backgroundColor: s.bg, color: s.c, fontSize: "10px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>{s.l}</span>
                      </div>
                    </div>
                    <div style={{ color: t2, fontSize: "13px", marginBottom: "5px" }}>{r.objet || "Rendez-vous général"}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: t3 }}>{Ic.Clock()}<span style={{ fontSize: "12px" }}>{new Date(r.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}{r.heure_rdv && ` à ${r.heure_rdv}`}</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#F5A623", fontSize: "11px", fontWeight: "700" }}>{Ic.QR()} Mon QR</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================== */}
      {/* TAB MESSAGERIE */}
      {/* ===================================================== */}
      {tab === "messagerie" && (
        <div className="scr" style={{ padding: "76px 16px 0" }}>
          <h1 style={{ color: t1, fontSize: "26px", fontWeight: "800", margin: "0 0 16px", letterSpacing: "-0.5px" }}>Messagerie</h1>
          {!userId ? (
            <div style={{ backgroundColor: card, borderRadius: "20px", padding: "40px 20px", textAlign: "center" }}>
              <div style={{ color: t1, fontSize: "17px", fontWeight: "700", marginBottom: "16px" }}>Connectez-vous</div>
              <Link href="/login" style={{ display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none" }}>Se connecter</Link>
            </div>
          ) : (
            <Link href="/messagerie" style={{ textDecoration: "none", display: "block" }} className="tap">
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "18px", display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "12px", backgroundColor: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: t1 }}>{Ic.Msg()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: t1, fontSize: "15px", fontWeight: "600" }}>Ouvrir la messagerie</div>
                  <div style={{ color: t2, fontSize: "13px" }}>{msgCount > 0 ? `${msgCount} message${msgCount > 1 ? "s" : ""} non lu${msgCount > 1 ? "s" : ""}` : "Aucun message non lu"}</div>
                </div>
                {Ic.Chev()}
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ===================================================== */}
      {/* TAB COMPTE */}
      {/* ===================================================== */}
      {tab === "compte" && (
        <div className="scr" style={{ padding: "76px 16px 0" }}>
          <h1 style={{ color: t1, fontSize: "26px", fontWeight: "800", margin: "0 0 16px", letterSpacing: "-0.5px" }}>Mon compte</h1>
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
              {/* YELENID COMPACT */}
              <div style={{ background: "linear-gradient(135deg,#080812,#1a1208)", borderRadius: "20px", padding: "18px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "14px", border: "1px solid rgba(245,166,35,0.2)" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>{initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontSize: "16px", fontWeight: "700", marginBottom: "2px" }}>{userName}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", marginBottom: "4px" }}>{userPhone}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#F5A623", fontWeight: "700" }}>GN-2024-{String(userId).substring(0, 7).toUpperCase()}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                  {Ic.Shield()}
                  <span style={{ color: "#22c55e", fontSize: "9px", fontWeight: "700" }}>VÉRIFIÉ</span>
                </div>
              </div>

              {/* BOUTON BIOMÉTRIE dans compte */}
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

              {/* MENU OPTIONS */}
              <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden", marginBottom: "12px" }}>
                {[
                  { l: "Mon profil",     h: "/profil",              i: Ic.User() },
                  { l: "Mes RDV",        h: "/mes-rdv",             i: Ic.Cal() },
                  { l: "Mon QR Code",    h: "/mon-qr",              i: Ic.QR() },
                  { l: "Messagerie",     h: "/messagerie",          i: Ic.Msg(false, msgCount) },
                  { l: "Paramètres",    h: "/parametres",           i: Ic.Settings() },
                  { l: "FAQ",            h: "/faq",                 i: Ic.Info() },
                ].map((item, i, arr) => (
                  <Link key={item.l} href={item.h} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px", textDecoration: "none", borderBottom: i < arr.length - 1 ? `1px solid ${brd}` : "none" }} className="tap">
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(245,166,35,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623" }}>{item.i}</div>
                    <span style={{ color: t1, fontSize: "15px", flex: 1 }}>{item.l}</span>
                    {Ic.Chev()}
                  </Link>
                ))}
              </div>

              <button onClick={() => {
                try {
                  localStorage.removeItem(YELEN224_USER_ID_KEY);
                  localStorage.removeItem("yelen224_last_bio");
                  localStorage.removeItem("yelen224_bio_registered");
                  localStorage.removeItem("yelen224_bio_credential_id");
                  localStorage.removeItem("yelen224_bio_ignored");
                } catch {}
                window.location.reload();
              }} style={{ width: "100%", backgroundColor: "rgba(255,59,48,0.1)", border: "none", borderRadius: "14px", padding: "15px", color: "#FF3B30", fontSize: "15px", fontWeight: "600", cursor: "pointer" }} className="tap">Déconnexion</button>
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
            {mapInsts.length > 0 ? <CarteMapHome institutions={mapInsts as any}/> : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}>Chargement...</div>}
          </div>
        </div>
      )}

      {/* NAVIGATION BAS */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "linear-gradient(180deg,#E8960A 0%,#C8740A 100%)", paddingBottom: "env(safe-area-inset-bottom)", display: "grid", gridTemplateColumns: "repeat(5,1fr)", boxShadow: "0 -4px 24px rgba(200,116,10,0.45)" }}>
        {([
          { key: "accueil",    label: "Accueil",  r: (a: boolean) => Ic.Home(a) },
          { key: "recherche",  label: "Recherche",r: (a: boolean) => Ic.Search(a) },
          { key: "rdv",        label: "RDV",      r: (a: boolean) => Ic.Cal(a) },
          { key: "messagerie", label: "Messages", r: (a: boolean) => Ic.Msg(a, msgCount || undefined) },
          { key: "compte",     label: "Compte",   r: (a: boolean) => Ic.User(a) },
        ] as { key: Tab; label: string; r: (a: boolean) => any }[]).map(item => {
          const active = tab === item.key;
          return (
            <button key={item.key} onClick={() => setTab(item.key as Tab)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", background: active ? "rgba(0,0,0,0.22)" : "none", border: "none", padding: "6px 4px 5px", cursor: "pointer", color: active ? "#ffffff" : "rgba(255,255,255,0.6)", position: "relative", transition: "all 0.15s" }} className="tap">
              {active && <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "2px", background: "#fff", borderRadius: "0 0 2px 2px" }}/>}
              {item.r(active)}
              <span style={{ fontSize: "10px", fontWeight: active ? "800" : "600", letterSpacing: "0.2px" }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}