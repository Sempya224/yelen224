"use client";

// Portail employé Clock In Shift — yelen224.com/clock/{institution}
// (décision CEO 26/07/2026, URL V1 sans sous-domaine). Écran public,
// distinct du dashboard institution : volontairement simple (un login,
// un bouton), pensé pour un kiosque partagé ou le téléphone personnel de
// l'employé, "en quelques secondes" (brief CEO).
//
// Refonte écran de login (10/09/2026, brief CEO "niveau US, workforce
// moderne") — ÉTAPE 1/2, décision explicite de Bryan : uniquement l'écran
// de login (phases "chargement"/"connexion" ci-dessous), la phase
// "pointage" (après connexion, statut en service) reste inchangée pour
// l'instant, chantier séparé à venir. Identité entreprise (nom/logo)
// chargée via GET /api/clock/institution?slug=..., route publique dédiée
// (aucune donnée sensible — name/logo déjà publics sur la fiche
// institution citoyenne) — dégrade proprement si l'entreprise est
// introuvable ou l'appel échoue, ne bloque jamais le formulaire de login.
//
// Regroupement des erreurs en 3 catégories, pas 1 par code API : le
// backend (app/api/clock/auth/login/route.ts) renvoie volontairement le
// même message générique "Identifiant ou PIN incorrect" pour un
// identifiant OU un PIN faux (protection anti-énumération déjà en place,
// ne pas la contourner côté UI en essayant de deviner lequel des deux
// champs est fautif).
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import { YelenLogo } from "@/components/YelenLogo";
import { YelenLoader } from "@/components/YelenLoader";

const C = {
  gold: "#F5A623", goldD: "#C8940A",
  white: "#FFFFFF", pageBg: "#FFFFFF", dark: "#1C1400", dark2: "#3D2E00",
  gray: "#767676", gray3: "#F0F0F0", green: "#0F8A5F", greenL: "#ECFDF5",
  red: "#B3261E", redL: "#FDECEA", border: "#E1E1E1",
};

const PIN_REGEX = /^\d{4}$/;

type Employe = { employeeId: string; role: string; nom: string; prenom: string; poste: string | null; departement: string | null };
type InstInfo = { name: string; logo: string | null; ville: string | null };
type ErrorCategory = "credentials" | "compte" | "general" | null;
type PlanDuJour = { debut: string; fin: string; pauseMinutes: number; dureeMinutes: number };
type Semaine = { travailleesMinutes: number; prevuesMinutes: number; ecartMinutes: number };
type AujourdHuiReel = { debut: string; fin: string; dureeMinutes: number };
type Segment = { debut: string; fin: string };
type ProfilData = {
  matricule: string; nom: string; prenom: string; poste: string | null;
  departement: string | null; manager: string | null; dateEmbauche: string | null;
  statut: string; role: string; doitChangerPin: boolean;
};
type ShiftJour = { date: string; jour: string; segments: Segment[] };
type JourSemaineDetail = { date: string; jour: string; prevuesMinutes: number; travailleesMinutes: number };

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuree(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function formatEcart(minutes: number): string {
  if (minutes === 0) return "0h";
  return `${minutes > 0 ? "+" : "-"}${formatDuree(Math.abs(minutes))}`;
}

function minutesDepuisMinuit(heure: string): number {
  const [h, m] = heure.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function formatCountdown(minutes: number): string {
  return `Dans ${formatMinutes(minutes)}`;
}

function formatDureeLive(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function formatDateComplete(d: Date): string {
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatHeureCourte(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const JOURS_ABBR = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

function formatPlageSemaine(d: Date): string {
  const jour = d.getDay();
  const lundi = new Date(d);
  lundi.setDate(d.getDate() + (jour === 0 ? -6 : 1 - jour));
  const dimanche = new Date(lundi);
  dimanche.setDate(lundi.getDate() + 6);
  const mois = dimanche.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  return `${JOURS_ABBR[lundi.getDay()]} ${String(lundi.getDate()).padStart(2, "0")} → ${JOURS_ABBR[dimanche.getDay()]} ${String(dimanche.getDate()).padStart(2, "0")} ${mois}`;
}

function formatDateCourte(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
}

export default function ClockPortalPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [phase, setPhase] = useState<"chargement" | "connexion" | "pointage" | "hors_ligne">("chargement");
  const [employe, setEmploye] = useState<Employe | null>(null);
  const [identifiant, setIdentifiant] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCategory, setErrorCategory] = useState<ErrorCategory>(null);
  const [instInfo, setInstInfo] = useState<InstInfo | null>(null);
  const [enService, setEnService] = useState(false);
  const [dernierHorodatage, setDernierHorodatage] = useState<string | null>(null);
  const [planDuJour, setPlanDuJour] = useState<PlanDuJour | null>(null);
  const [semaine, setSemaine] = useState<Semaine | null>(null);
  const [aujourdHuiReel, setAujourdHuiReel] = useState<AujourdHuiReel | null>(null);
  const [shiftsParJour, setShiftsParJour] = useState<ShiftJour[]>([]);
  const [semaineDetail, setSemaineDetail] = useState<JourSemaineDetail[]>([]);
  const [vuePlanning, setVuePlanning] = useState(false);
  const [planningMode, setPlanningMode] = useState<"mon_planning" | "disponibilites">("mon_planning");
  const [planningTab, setPlanningTab] = useState<"aujourdhui" | "semaine" | "avenir">("aujourdhui");
  const [jourSelectionne, setJourSelectionne] = useState<string | null>(null);
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null);
  const [sheetHeures, setSheetHeures] = useState(false);
  const [sheetProfil, setSheetProfil] = useState(false);
  const [sheetFinAnticipee, setSheetFinAnticipee] = useState(false);
  // Scan QR requis pour arrivée/départ (Pointer ma présence, Terminer mon
  // shift) — pas pour les pauses, décision Bryan 10/09/2026. Le QR scanné
  // est celui déjà affiché/imprimé par l'institution (ClockInShiftTab.tsx
  // ::clockPortalUrl), validé côté serveur (/api/clock/pointage).
  const [scannerOuvert, setScannerOuvert] = useState(false);
  const [scanCamPhase, setScanCamPhase] = useState<"avant" | "demarrage" | "actif" | "refuse">("avant");
  const [scanErreur, setScanErreur] = useState("");
  const [scanValidation, setScanValidation] = useState(false);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const [profilData, setProfilData] = useState<ProfilData | null>(null);
  const [pinActuel, setPinActuel] = useState("");
  const [nouveauPin, setNouveauPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSucces, setPinSucces] = useState(false);

  const ouvrirProfil = useCallback(async () => {
    setSheetProfil(true);
    const res = await fetch("/api/clock/profil");
    if (res.ok) setProfilData(await res.json());
  }, []);

  async function changerPin() {
    setPinError(""); setPinSucces(false);
    if (nouveauPin !== confirmPin) { setPinError("Les deux nouveaux PIN ne correspondent pas"); return; }
    setPinLoading(true);
    const res = await fetch("/api/clock/profil", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinActuel, nouveauPin }),
    });
    const j = await res.json().catch(() => null);
    setPinLoading(false);
    if (!res.ok) { setPinError(j?.error || "Erreur lors du changement de PIN"); return; }
    setPinSucces(true);
    setPinActuel(""); setNouveauPin(""); setConfirmPin("");
    setProfilData((prev) => (prev ? { ...prev, doitChangerPin: false } : prev));
  }

  const chargerStatut = useCallback(async () => {
    try {
      const res = await fetch("/api/clock/auth/me");
      if (!res.ok) { setPhase("connexion"); return; }
      const j = await res.json();
      setEmploye({ employeeId: j.employeeId, role: j.role, nom: j.nom, prenom: j.prenom, poste: j.poste ?? null, departement: j.departement ?? null });
      setEnService(j.dernierStatut === "entree");
      setDernierHorodatage(j.horodatage ?? null);
      setPlanDuJour(j.planDuJour ?? null);
      setSemaine(j.semaine ?? null);
      setAujourdHuiReel(j.aujourdHuiReel ?? null);
      setShiftsParJour(j.shiftsParJour ?? []);
      setSemaineDetail(j.semaineDetail ?? []);
      setPhase("pointage");
    } catch {
      // LOT 15 État H "Hors connexion" — panne réseau au chargement,
      // jamais un écran cassé ou un spinner infini.
      setPhase("hors_ligne");
    }
  }, []);

  useEffect(() => { chargerStatut(); }, [chargerStatut]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (phase !== "pointage") return;
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const res = await fetch(`/api/clock/institution?slug=${encodeURIComponent(slug)}`);
        if (res.ok) {
          const j = await res.json();
          setInstInfo({ name: j.name, logo: j.logo ?? null, ville: j.ville ?? null });
        }
      } catch {
        // Dégradation silencieuse — l'identité entreprise est un
        // habillage, jamais un pré-requis pour se connecter.
      }
    })();
  }, [slug]);

  function effacerErreur() {
    if (error) { setError(""); setErrorCategory(null); }
  }

  async function connexion() {
    if (!identifiant.trim() || !PIN_REGEX.test(pin)) return;
    setLoading(true); setError(""); setErrorCategory(null);
    try {
      const res = await fetch("/api/clock/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, identifiant: identifiant.trim(), pin }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setLoading(false);
        const code = j?.code;
        setErrorCategory(code === "INVALID_CREDENTIALS" ? "credentials" : code === "EMPLOYEE_INACTIVE" ? "compte" : "general");
        setError(code === "INVALID_CREDENTIALS" ? "Identifiant ou PIN incorrect, réessayez" : (j?.error || "Connexion impossible. Réessayez."));
        return;
      }
      setPin("");
      await chargerStatut();
      setLoading(false);
    } catch {
      setLoading(false);
      setErrorCategory("general");
      setError("Connexion impossible. Vérifiez votre connexion et réessayez.");
    }
  }

  async function pointer() {
    setLoading(true); setError("");
    let res: Response;
    try {
      res = await fetch("/api/clock/pointage", { method: "POST" });
    } catch {
      setLoading(false);
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
      return;
    }
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) { setError(j?.error || "Erreur de pointage"); return; }
    setEnService(j.typeAction === "entree");
    setDernierHorodatage(j.horodatage);
  }

  // stop() de html5-qrcode lève une exception SYNCHRONE quand le scan n'est
  // pas actif — un simple .catch() ne l'attrape jamais (throw avant qu'une
  // Promise existe à chaîner), voir même garde-fou dans le ScannerModal
  // institution (app/[slug]/[id]/layout.tsx).
  function arreterCameraSiActive(html5QrCode: Html5Qrcode | null) {
    if (!html5QrCode?.isScanning) return;
    try { html5QrCode.stop().catch(() => {}); } catch {}
  }

  function ouvrirScanner() {
    setScanErreur(""); setScanCamPhase("avant"); setScannerOuvert(true);
  }

  function fermerScanner() {
    arreterCameraSiActive(html5QrRef.current);
    setScannerOuvert(false);
  }

  async function traiterScanPointage(decodedText: string) {
    setScanValidation(true); setScanErreur("");
    try {
      const res = await fetch("/api/clock/pointage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_payload: decodedText }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setScanValidation(false); setScanErreur(j?.error || "QR invalide, réessayez."); return; }
      setEnService(j.typeAction === "entree");
      setDernierHorodatage(j.horodatage);
      setScanValidation(false);
      fermerScanner();
    } catch {
      setScanValidation(false);
      setScanErreur("Connexion impossible. Vérifiez votre réseau et réessayez.");
    }
  }

  async function demarrerScanPointage() {
    setScanCamPhase("demarrage");
    try {
      const html5QrCode = new Html5Qrcode("qr-reader-pointage");
      html5QrRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText: string) => {
          arreterCameraSiActive(html5QrCode);
          void traiterScanPointage(decodedText);
        },
        () => {},
      );
      setScanCamPhase("actif");
    } catch {
      setScanCamPhase("refuse");
    }
  }

  useEffect(() => {
    return () => { arreterCameraSiActive(html5QrRef.current); };
  }, []);

  async function deconnexion() {
    await fetch("/api/clock/auth/logout", { method: "POST" });
    setEmploye(null); setIdentifiant(""); setPin(""); setError(""); setErrorCategory(null);
    setEnService(false); setDernierHorodatage(null);
    setPhase("connexion");
  }

  const formValide = identifiant.trim().length > 0 && PIN_REGEX.test(pin);

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        .eci-field { transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease; }
        .eci-field:focus { outline: none; border-color: ${C.gold} !important; background-color: ${C.white} !important; box-shadow: 0 0 0 3px ${C.gold}22; }
        .eci-field:not(:placeholder-shown):not(:focus) { border-color: ${C.dark2}2e; background-color: ${C.white}; }
        .eci-field-error, .eci-field-error:focus, .eci-field-error:not(:placeholder-shown) { border-color: ${C.red} !important; background-color: ${C.redL} !important; box-shadow: none !important; }
        .eci-cta:not(:disabled):active { transform: scale(0.98); }
        @keyframes eciSheetFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes eciSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {phase !== "pointage" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "clamp(40px, 10svh, 76px)", paddingBottom: "20px" }}>
          <div style={{ width: "60px", height: "60px", borderRadius: "18px", overflow: "hidden", position: "relative", background: C.gray3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
            {instInfo?.logo ? (
              <Image src={instInfo.logo} alt="" fill sizes="60px" style={{ objectFit: "cover" }}/>
            ) : (
              <span style={{ color: C.goldD, fontSize: "22px", fontWeight: 900 }}>{instInfo?.name?.[0]?.toUpperCase() ?? "…"}</span>
            )}
          </div>
          <div style={{ color: C.dark, fontSize: "16.5px", fontWeight: 800, letterSpacing: "-0.2px", textAlign: "center", minHeight: "20px" }}>
            {instInfo?.name ?? ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px" }}>
            <YelenLogo size={11} color={C.gray}/>
            <span style={{ color: C.gray, fontSize: "10.5px", fontWeight: 700 }}>Propulsé par Yelen</span>
          </div>
        </div>
      )}

      {phase === "chargement" && (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><YelenLoader size={24} color={C.gold}/></div>
      )}

      {phase === "hors_ligne" && (
        <div style={{ width: "100%", maxWidth: "340px", padding: "8px 24px 40px", textAlign: "center" }}>
          <div style={{ width: "52px", height: "52px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          </div>
          <div style={{ color: C.dark, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>Connexion impossible</div>
          <div style={{ color: C.gray, fontSize: "12.5px", fontWeight: 600, marginBottom: "18px" }}>Vérifiez votre réseau, puis réessayez.</div>
          <button onClick={() => { setPhase("chargement"); chargerStatut(); }} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "999px", border: "none", background: C.gold, color: C.dark, fontWeight: 800, fontSize: "14px", cursor: "pointer" }}>Réessayer</button>
        </div>
      )}

      {phase === "connexion" && (
        <div style={{ width: "100%", maxWidth: "380px", padding: "8px 24px 40px", display: "flex", flexDirection: "column" }}>
          <h1 style={{ color: C.dark, fontSize: "25px", fontWeight: 900, letterSpacing: "-0.5px", marginBottom: "5px" }}>Bienvenue</h1>
          <p style={{ color: C.gray, fontSize: "13px", marginBottom: "28px" }}>Connectez-vous pour enregistrer votre présence.</p>

          {errorCategory === "compte" && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "18px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ color: C.dark2, fontSize: "12.5px", fontWeight: 600, lineHeight: 1.4 }}>{error}</span>
            </div>
          )}
          {errorCategory === "general" && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "18px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ color: C.red, fontSize: "12.5px", fontWeight: 600, lineHeight: 1.4 }}>{error}</span>
            </div>
          )}

          <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "7px" }}>Identifiant employé</label>
          <input
            value={identifiant}
            onChange={e => { setIdentifiant(e.target.value); effacerErreur(); }}
            placeholder="Ex. ECO-00123"
            autoFocus
            className={`eci-field${errorCategory === "credentials" ? " eci-field-error" : ""}`}
            style={{ width: "100%", padding: "12px 14px", borderRadius: "11px", border: `1.5px solid ${C.border}`, backgroundColor: `${C.white}c0`, marginBottom: "12px", fontSize: "14px", color: C.dark, boxSizing: "border-box" }}
          />

          <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "7px" }}>Code PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="4 chiffres"
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); effacerErreur(); }}
            onKeyDown={e => e.key === "Enter" && connexion()}
            className={`eci-field${errorCategory === "credentials" ? " eci-field-error" : ""}`}
            style={{ width: "100%", padding: "12px 14px", borderRadius: "11px", border: `1.5px solid ${C.border}`, backgroundColor: `${C.white}c0`, fontSize: "16px", letterSpacing: "6px", textAlign: "center", color: C.dark, boxSizing: "border-box" }}
          />
          {errorCategory === "credentials" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "9px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ color: C.red, fontSize: "12px", fontWeight: 700 }}>{error}</span>
            </div>
          )}

          <button
            onClick={connexion}
            disabled={loading || !formValide}
            className="eci-cta tap"
            style={{
              width: "100%", padding: "13px", borderRadius: "999px", border: "none", marginTop: "22px",
              background: formValide ? C.gold : C.gray3,
              color: formValide ? C.dark : C.gray,
              fontWeight: 800, fontSize: "14px", cursor: loading || !formValide ? "default" : "pointer",
              opacity: loading ? 0.75 : 1, transition: "background .15s ease, color .15s ease",
              boxShadow: formValide ? `0 6px 16px ${C.gold}35` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {loading ? <YelenLoader size={17} color={formValide ? C.dark : C.gray}/> : "Continuer"}
          </button>

          <p style={{ color: C.gray, fontSize: "11px", lineHeight: 1.5, textAlign: "center", maxWidth: "300px", margin: "18px auto 0" }}>
            En continuant, vous acceptez les{" "}
            <Link href="/cgu" style={{ color: C.gray, fontWeight: 700, textDecoration: "underline", textDecorationColor: C.gold, textUnderlineOffset: "3px" }}>Conditions d&apos;utilisation</Link>
            {" "}et reconnaissez avoir pris connaissance de la{" "}
            <Link href="/confidentialite" style={{ color: C.gray, fontWeight: 700, textDecoration: "underline", textDecorationColor: C.gold, textUnderlineOffset: "3px" }}>Politique de confidentialité</Link>
            {" "}de Yelen.
          </p>
        </div>
      )}

      {phase === "connexion" && (
        <div style={{ marginTop: "auto", padding: "28px 24px 20px", textAlign: "center" }}>
          <div style={{ color: C.gray, fontSize: "10.5px", lineHeight: 1.5 }}>
            © 2026 Yelen224 — Tous droits réservés.
          </div>
          <div style={{ marginTop: "6px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "10.5px" }}>
            <Link href="/cgu" style={{ color: C.gray, fontWeight: 600 }}>Conditions d&apos;utilisation</Link>
            <span style={{ color: C.gray }}>·</span>
            <Link href="/confidentialite" style={{ color: C.gray, fontWeight: 600 }}>Confidentialité</Link>
            <span style={{ color: C.gray }}>·</span>
            <Link href="/contact" style={{ color: C.gray, fontWeight: 600 }}>Aide</Link>
          </div>
        </div>
      )}

      {phase === "pointage" && employe && (
        <div style={{ width: "100%", maxWidth: "480px", padding: "24px 18px calc(90px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", overflow: "hidden", position: "relative", background: C.gray3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {instInfo?.logo ? (
                  <Image src={instInfo.logo} alt="" fill sizes="36px" style={{ objectFit: "cover" }}/>
                ) : (
                  <span style={{ color: C.goldD, fontSize: "13px", fontWeight: 900 }}>{instInfo?.name?.[0]?.toUpperCase() ?? "…"}</span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ color: C.dark, fontSize: "12.5px", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instInfo?.name ?? ""}</span>
                <span style={{ color: C.gray, fontSize: "9.5px", fontWeight: 700 }}>Employeur</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 0 }}>
                <span style={{ color: C.dark, fontSize: "12.5px", fontWeight: 800, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{employe.prenom} {employe.nom}</span>
                <span style={{ color: C.gray, fontSize: "9.5px", fontWeight: 700 }}>Employé</span>
              </div>
              <button onClick={() => ouvrirProfil()} className="tap" style={{ position: "relative", flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: C.gray3, border: `1px solid ${C.border}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 900, color: C.gold }}>
                  {employe.prenom.slice(0, 1).toUpperCase()}{employe.nom.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ position: "absolute", bottom: "-1px", right: "-1px", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: C.green, border: `2px solid ${C.white}` }}/>
              </button>
            </div>
          </div>

          <div style={{ position: "relative", marginBottom: "22px", paddingBottom: "18px" }}>
            <svg viewBox="0 0 340 60" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "56px", opacity: 0.07, pointerEvents: "none" }}>
              <rect x="0" y="22" width="34" height="38" fill={C.dark2}/>
              <rect x="38" y="10" width="26" height="50" fill={C.dark2}/>
              <rect x="68" y="30" width="30" height="30" fill={C.dark2}/>
              <rect x="270" y="26" width="28" height="34" fill={C.dark2}/>
              <rect x="302" y="14" width="24" height="46" fill={C.dark2}/>
              <rect x="330" y="34" width="10" height="26" fill={C.dark2}/>
            </svg>
            <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: C.dark, fontSize: "19px", fontWeight: 900, letterSpacing: "-0.3px" }}>Bonjour, {employe.prenom} ☀️</div>
                <div style={{ color: C.gray, fontSize: "12.5px", fontWeight: 600, marginTop: "3px" }}>Bon courage pour votre journée !</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ color: C.gray, fontSize: "10.5px", fontWeight: 600, whiteSpace: "nowrap" }}>{formatDateComplete(now)}</div>
                <div style={{ color: C.dark, fontSize: "22px", fontWeight: 900, letterSpacing: "-0.5px", marginTop: "2px" }}>{formatHeureCourte(now)}</div>
              </div>
            </div>
          </div>

          {error && <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: 700, padding: "10px 12px", borderRadius: "10px", marginBottom: "14px", textAlign: "center" }}>{error}</div>}

          {(() => {
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const debutMin = planDuJour ? minutesDepuisMinuit(planDuJour.debut) : 0;

            // "en_pause" vs "termine" : pas de type dédié en base (décision
            // d'architecture documentée dans la migration attendance_logs —
            // une pause EST une sortie suivie d'une entree plus tard) —
            // distinction faite ici par comparaison à l'heure de fin prévue,
            // jamais une donnée inventée.
            let etat: "en_service" | "en_pause" | "termine" | "a_venir" | "retard" | "aucun_shift";
            if (enService) etat = "en_service";
            else if (aujourdHuiReel) {
              const sortie = dernierHorodatage ? new Date(dernierHorodatage) : null;
              const sortieMin = sortie ? sortie.getHours() * 60 + sortie.getMinutes() : null;
              const finPrevueMin = planDuJour ? minutesDepuisMinuit(planDuJour.fin) : null;
              etat = (sortieMin !== null && finPrevueMin !== null && sortieMin < finPrevueMin) ? "en_pause" : "termine";
            }
            else if (!planDuJour) etat = "aucun_shift";
            else if (nowMin < debutMin) etat = "a_venir";
            else etat = "retard";

            if (etat === "en_pause") {
              const pauseMin = dernierHorodatage ? Math.max(0, Math.round((now.getTime() - new Date(dernierHorodatage).getTime()) / 60000)) : 0;
              return (
                <div style={{ backgroundColor: C.white, boxShadow: "0 1px 4px rgba(28,20,0,0.05)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px 18px", marginBottom: "18px", textAlign: "center" }}>
                  <div style={{ color: C.gold, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>Pause en cours</div>
                  <div style={{ color: C.dark, fontSize: "22px", fontWeight: 900, letterSpacing: "-0.3px", marginBottom: "16px" }}>{formatMinutes(pauseMin)}</div>
                  <button onClick={pointer} disabled={loading} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "999px", border: "none", background: C.gold, color: C.dark, fontWeight: 800, fontSize: "14.5px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.75 : 1, boxShadow: `0 6px 16px ${C.gold}35`, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                    {loading ? <YelenLoader size={16} color={C.dark}/> : (
                      <>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                        Reprendre le travail
                      </>
                    )}
                  </button>
                </div>
              );
            }

            if (etat === "aucun_shift") {
              return (
                <div style={{ backgroundColor: C.gray3, borderRadius: "16px", padding: "22px 18px", marginBottom: "18px", textAlign: "center" }}>
                  <div style={{ color: C.dark2, fontSize: "14px", fontWeight: 800, marginBottom: "14px" }}>Aucun shift prévu aujourd&apos;hui</div>
                  <button onClick={() => setVuePlanning(true)} className="tap" style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: "999px", color: C.dark2, fontSize: "13px", fontWeight: 700, padding: "12px", cursor: "pointer" }}>Voir mon planning</button>
                </div>
              );
            }

            if (etat === "termine" && aujourdHuiReel) {
              return (
                <div style={{ backgroundColor: C.white, boxShadow: "0 1px 4px rgba(28,20,0,0.05)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px 18px", marginBottom: "18px", textAlign: "center" }}>
                  <div style={{ color: C.green, fontSize: "15px", fontWeight: 900, marginBottom: "4px" }}>Présence terminée</div>
                  <div style={{ color: C.dark, fontSize: "18px", fontWeight: 900, marginBottom: "2px" }}>{aujourdHuiReel.debut} — {aujourdHuiReel.fin}</div>
                  <div style={{ color: C.gray, fontSize: "12.5px", fontWeight: 600, marginBottom: "14px" }}>{formatDureeLive(aujourdHuiReel.dureeMinutes)} enregistrées</div>
                  <button disabled className="tap" style={{ width: "100%", background: "none", border: `1px solid ${C.green}30`, borderRadius: "999px", color: C.green, fontSize: "13px", fontWeight: 700, padding: "12px", cursor: "default" }}>Voir le détail — bientôt disponible</button>
                </div>
              );
            }

            if (etat === "en_service") {
              // Temps travaillé = cumul du jour, pas seulement le segment en
              // cours — sinon une reprise après pause repart visuellement de
              // zéro alors que le total réel (aujourdHuiReel, déjà comptabilisé
              // par la boucle serveur) inclut le(s) segment(s) précédent(s).
              const segmentEnCoursMin = dernierHorodatage ? Math.max(0, Math.round((now.getTime() - new Date(dernierHorodatage).getTime()) / 60000)) : 0;
              const elapsedMin = (aujourdHuiReel?.dureeMinutes ?? 0) + segmentEnCoursMin;
              const dureePrevueMin = planDuJour?.dureeMinutes ?? null;
              const progressPct = dureePrevueMin ? Math.min(1, elapsedMin / dureePrevueMin) : 0;
              const R = 17, CIRC = 2 * Math.PI * R;

              // 1er segment du jour (aucun aujourdHuiReel, donc aucune pause
              // encore prise) : le bouton propose "Aller en pause", jamais
              // besoin de garde-fou puisqu'il n'annonce pas la fin du shift.
              // Après une reprise (2e segment ou plus), il devient "Terminer
              // mon shift" et se bloque tant que l'heure de fin prévue n'est
              // pas atteinte (voir sheetFinAnticipee).
              const reprise = !!aujourdHuiReel;
              const finPrevueMin = planDuJour ? minutesDepuisMinuit(planDuJour.fin) : null;
              const finAtteinte = finPrevueMin === null || nowMin >= finPrevueMin;
              return (
                <div style={{ backgroundColor: C.white, boxShadow: "0 1px 4px rgba(28,20,0,0.05)", border: `1px solid ${C.border}`, borderRadius: "22px", padding: "22px 20px", marginBottom: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green }}/>
                    <span style={{ color: C.dark, fontSize: "13.5px", fontWeight: 800 }}>En service</span>
                  </div>
                  {dernierHorodatage && (
                    <div style={{ color: C.gray, fontSize: "11.5px", fontWeight: 600, marginBottom: "20px" }}>Depuis {formatHeure(dernierHorodatage)}</div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                      <div style={{ width: "46px", height: "46px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: C.dark, fontSize: "27px", fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1, whiteSpace: "nowrap" }}>{formatDureeLive(elapsedMin)}</div>
                        <div style={{ color: C.gray, fontSize: "11px", fontWeight: 600, marginTop: "4px" }}>Temps travaillé</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <div style={{ textAlign: "right", minWidth: 0 }}>
                        <div style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 700 }}>Vous êtes en service</div>
                        <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600 }}>Bonne continuation !</div>
                      </div>
                      <div style={{ position: "relative", width: "40px", height: "40px", flexShrink: 0 }}>
                        <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="20" cy="20" r={R} fill="none" stroke={`${C.green}25`} strokeWidth="3"/>
                          {progressPct > 0 && (
                            <circle cx="20" cy="20" r={R} fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"
                              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progressPct)}/>
                          )}
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (!reprise) { pointer(); return; }
                      if (!finAtteinte) { setSheetFinAnticipee(true); return; }
                      ouvrirScanner();
                    }}
                    disabled={loading} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "999px", border: "none", background: C.gold, color: C.dark, fontWeight: 800, fontSize: "15px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.75 : 1, boxShadow: `0 6px 16px ${C.gold}35`, display: "flex", alignItems: "center", justifyContent: "center", gap: "9px" }}>
                    {loading ? <YelenLoader size={17} color={C.dark}/> : reprise ? (
                      <>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                        Terminer mon shift
                      </>
                    ) : (
                      <>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round"><rect x="9" y="6" width="2.5" height="12" rx="1"/><rect x="14.5" y="6" width="2.5" height="12" rx="1"/></svg>
                        Aller en pause
                      </>
                    )}
                  </button>
                </div>
              );
            }

            // a_venir / retard — partagent la même carte (heure prévue +
            // badge) et le même CTA "Pointer ma présence", seule la
            // couleur/le texte du badge change.
            const retard = etat === "retard";
            const accent = retard ? C.red : C.gold;
            const grandeValeur = retard ? formatMinutes(nowMin - debutMin) : formatMinutes(debutMin - nowMin);
            const grandLabel = retard ? "de retard" : "avant votre shift";
            return (
              <div style={{ backgroundColor: C.white, boxShadow: "0 1px 4px rgba(28,20,0,0.05)", border: `1px solid ${retard ? `${C.red}35` : C.border}`, borderRadius: "22px", padding: "22px 20px", marginBottom: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "18px" }}>
                  {retard && <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.red }}/>}
                  <span style={{ color: C.dark, fontSize: "13.5px", fontWeight: 800 }}>{retard ? "En retard" : "Votre prochain shift"}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                    <div style={{ width: "46px", height: "46px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.dark, fontSize: "24px", fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1, whiteSpace: "nowrap" }}>{grandeValeur}</div>
                      <div style={{ color: accent, fontSize: "11px", fontWeight: 700, marginTop: "4px" }}>{grandLabel}</div>
                    </div>
                  </div>
                  {planDuJour && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ color: C.dark, fontSize: "14px", fontWeight: 800, whiteSpace: "nowrap" }}>{planDuJour.debut} — {planDuJour.fin}</div>
                      <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600, marginTop: "2px" }}>Horaire prévu</div>
                    </div>
                  )}
                </div>

                <button onClick={ouvrirScanner} disabled={loading} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "999px", border: "none", background: C.gold, color: C.dark, fontWeight: 800, fontSize: "15px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.75 : 1, boxShadow: `0 6px 18px ${C.gold}35`, display: "flex", alignItems: "center", justifyContent: "center", gap: "9px" }}>
                  {loading ? <YelenLoader size={17} color={C.dark}/> : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                      Pointer ma présence
                    </>
                  )}
                </button>
              </div>
            );
          })()}

          {planDuJour && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span style={{ color: C.dark, fontSize: "14px", fontWeight: 800 }}>Aujourd&apos;hui</span>
                </div>
                <button onClick={() => setVuePlanning(true)} className="tap" style={{ background: "none", border: "none", padding: 0, color: C.dark, fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>Voir mon planning →</button>
              </div>

              <div style={{ backgroundColor: C.white, boxShadow: "0 1px 4px rgba(28,20,0,0.05)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                    <div style={{ width: "30px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.dark, fontSize: "15px", fontWeight: 800 }}>{planDuJour.debut}</div>
                      <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600 }}>Début prévu</div>
                    </div>
                  </div>
                  <span style={{ color: C.gray, fontSize: "14px", margin: "0 6px" }}>→</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <div style={{ width: "30px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/></svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.dark, fontSize: "15px", fontWeight: 800, whiteSpace: "nowrap" }}>{planDuJour.pauseMinutes > 0 ? `${planDuJour.pauseMinutes} min` : "—"}</div>
                      <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600 }}>Pause</div>
                    </div>
                  </div>
                  <span style={{ color: C.gray, fontSize: "14px", margin: "0 6px" }}>→</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                    <div style={{ width: "30px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.dark, fontSize: "15px", fontWeight: 800 }}>{planDuJour.fin}</div>
                      <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600 }}>Fin prévue</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${C.border}` }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span style={{ color: C.gray, fontSize: "11.5px", fontWeight: 600 }}>Siège de l&apos;institution{instInfo?.ville ? ` — ${instInfo.ville}` : ""}</span>
                </div>
              </div>
            </div>
          )}

          {semaine && (() => {
            const progressPct = semaine.prevuesMinutes > 0 ? Math.min(1, semaine.travailleesMinutes / semaine.prevuesMinutes) : 0;
            return (
              <div style={{ backgroundColor: C.white, boxShadow: "0 1px 4px rgba(28,20,0,0.05)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
                    <div>
                      <div style={{ color: C.dark, fontSize: "14px", fontWeight: 800 }}>Cette semaine</div>
                      <div style={{ color: C.gray, fontSize: "10.5px", fontWeight: 600 }}>Vos heures de travail</div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: C.gray3, borderRadius: "999px", padding: "5px 10px", fontSize: "10px", fontWeight: 700, color: C.dark2, whiteSpace: "nowrap" }}>{formatPlageSemaine(now)}</div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div>
                    <div style={{ color: C.dark, fontSize: "19px", fontWeight: 900 }}>{formatDuree(semaine.travailleesMinutes)}</div>
                    <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600, marginTop: "2px" }}>heures travaillées</div>
                  </div>
                  <div>
                    <div style={{ color: C.dark, fontSize: "19px", fontWeight: 900 }}>{formatDuree(semaine.prevuesMinutes)}</div>
                    <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600, marginTop: "2px" }}>prévues</div>
                  </div>
                  <div>
                    <div style={{ color: semaine.ecartMinutes < 0 ? C.red : C.green, fontSize: "19px", fontWeight: 900 }}>{formatEcart(semaine.ecartMinutes)}</div>
                    <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600, marginTop: "2px" }}>restant</div>
                  </div>
                </div>

                <div style={{ width: "100%", height: "8px", borderRadius: "999px", backgroundColor: C.gray3, overflow: "hidden", marginBottom: "14px" }}>
                  <div style={{ width: `${Math.round(progressPct * 100)}%`, height: "100%", backgroundColor: C.gold, borderRadius: "999px" }}/>
                </div>

                <button onClick={() => setSheetHeures(true)} className="tap" style={{ width: "100%", background: "none", border: "none", color: C.dark, fontSize: "12px", fontWeight: 700, padding: "0", cursor: "pointer", textAlign: "left" }}>Voir mes heures →</button>
              </div>
            );
          })()}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "20px" }}>
            {[
              { titre: "Mon planning", sous: "Mes prochains shifts", onClick: () => setVuePlanning(true), icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
              { titre: "Mes pauses", sous: "Gérer mes pauses", onClick: null, icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
              { titre: "Mon historique", sous: "Mes pointages", onClick: null, icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
              { titre: "Mon profil", sous: "Infos & paramètres", onClick: () => ouvrirProfil(), icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
            ].map((item) => (
              <button key={item.titre} disabled={!item.onClick} onClick={item.onClick ?? undefined} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px", padding: "10px 8px", borderRadius: "14px", border: `1px solid ${C.border}`, backgroundColor: C.white, cursor: item.onClick ? "pointer" : "default" }}>
                <div style={{ width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>{item.icone}</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: C.dark, fontSize: "10px", fontWeight: 800, lineHeight: 1.25 }}>{item.titre}</div>
                  <div style={{ color: C.gray, fontSize: "8.5px", fontWeight: 600, lineHeight: 1.25, marginTop: "1px" }}>{item.sous}</div>
                </div>
              </button>
            ))}
          </div>

          <button onClick={deconnexion} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", background: "none", border: "none", color: C.gray, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: "8px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Se déconnecter
          </button>

          <div style={{ textAlign: "center", color: C.gray, fontSize: "10px", fontWeight: 600, marginTop: "18px" }}>
            © 2026 Yelen224 — Propulsé par Sempya224
          </div>
        </div>
      )}

      {phase === "pointage" && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", padding: "0 16px calc(10px + env(safe-area-inset-bottom))", pointerEvents: "none" }}>
          <div style={{ width: "100%", maxWidth: "440px", backgroundColor: C.white, borderRadius: "22px", boxShadow: "0 8px 30px rgba(28,20,0,0.14)", border: `1px solid ${C.border}`, display: "flex", padding: "10px 6px", pointerEvents: "auto" }}>
            {[
              { label: "Accueil", actif: true, onClick: null, icone: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
              { label: "Planning", actif: false, onClick: () => setVuePlanning(true), icone: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
              { label: "Heures", actif: false, onClick: () => setSheetHeures(true), icone: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> },
              { label: "Profil", actif: false, onClick: () => ouvrirProfil(), icone: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
            ].map((item) => (
              <button key={item.label} disabled={!item.actif && !item.onClick} onClick={item.onClick ?? undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "6px 0", background: "none", border: "none", cursor: item.actif || item.onClick ? "pointer" : "default" }}>
                {item.icone}
                <span style={{ fontSize: "9.5px", fontWeight: item.actif ? 800 : 600, color: item.actif ? C.dark : C.gray }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {vuePlanning && (() => {
        const aujourdHuiStr2 = now.toISOString().slice(0, 10);
        // Bande de jours "façon DoorDash" — toujours aujourd'hui en premier,
        // puis les 6 jours suivants (jamais de jours passés affichés), pas
        // la semaine calendaire fixe lundi→dimanche.
        const joursSemaineDates = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now);
          d.setDate(now.getDate() + i);
          return d;
        });
        const shiftsParDate = new Map(shiftsParJour.map((s) => [s.date, s]));
        const dateAffichee = planningTab === "semaine" ? (jourSelectionne ?? aujourdHuiStr2) : aujourdHuiStr2;
        const shiftDuJourAffiche = shiftsParDate.get(dateAffichee);
        const shiftsAvenir = shiftsParJour.filter((s) => s.date > aujourdHuiStr2);

        function EtatVide({ titre, description, avecProchainsJours }: { titre: string; description: string; avecProchainsJours?: boolean }) {
          return (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: "16px", padding: "28px 20px 32px", textAlign: "center" }}>
              <div style={{ position: "relative", width: "180px", height: "150px", margin: "0 auto 14px" }}>
                <Image src="/illustrations/planning-vide.png" alt="" fill sizes="180px" style={{ objectFit: "contain" }}/>
              </div>
              <div style={{ color: C.dark, fontSize: "13.5px", fontWeight: 800, marginBottom: "4px" }}>{titre}</div>
              <div style={{ color: C.gray, fontSize: "12px", fontWeight: 600, marginBottom: "16px" }}>{description}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
                <button onClick={() => chargerStatut()} className="tap" style={{ border: `1px solid ${C.border}`, borderRadius: "999px", background: "none", color: C.dark2, fontSize: "12px", fontWeight: 700, padding: "9px 18px", cursor: "pointer" }}>Actualiser</button>
                {avecProchainsJours && (
                  <button onClick={() => setPlanningTab("avenir")} className="tap" style={{ border: "none", background: "none", color: C.dark, fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "4px" }}>Voir les prochains jours →</button>
                )}
              </div>
            </div>
          );
        }

        const STATUT_REEL: Record<string, { label: string; couleur: string }> = {
          pas_pointe: { label: "Pas encore pointé", couleur: C.gray },
          retard: { label: "En retard", couleur: C.red },
          en_cours: { label: "En cours", couleur: C.green },
          pause: { label: "En pause", couleur: C.gold },
          termine: { label: "Terminé", couleur: C.green },
          absent: { label: "Absent", couleur: C.red },
        };

        function CarteShift({ date, jour, segment }: { date: string; jour: string; segment: Segment }) {
          const id = `${date}-${segment.debut}`;
          const dureePrevue = (() => {
            const [hD, mD] = segment.debut.split(":").map(Number);
            const [hF, mF] = segment.fin.split(":").map(Number);
            return Math.max(0, (hF * 60 + mF) - (hD * 60 + mD));
          })();
          const estAujourdHui = date === aujourdHuiStr2;
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const debutMin = minutesDepuisMinuit(segment.debut);
          const finMin = minutesDepuisMinuit(segment.fin);

          // Statut réel de présence (aujourd'hui seulement — un shift futur
          // n'a par définition aucun pointage) : réutilise les mêmes signaux
          // que la carte "état actuel" de l'accueil (enService,
          // aujourdHuiReel, dernierHorodatage), jamais une deuxième source
          // de vérité recalculée différemment.
          let statutReel: keyof typeof STATUT_REEL = "pas_pointe";
          if (estAujourdHui) {
            if (enService) statutReel = "en_cours";
            else if (aujourdHuiReel) {
              const sortieMin = dernierHorodatage ? new Date(dernierHorodatage).getHours() * 60 + new Date(dernierHorodatage).getMinutes() : null;
              statutReel = (sortieMin !== null && sortieMin < finMin) ? "pause" : "termine";
            } else if (nowMin < debutMin) statutReel = "pas_pointe";
            else if (nowMin < finMin) statutReel = "retard";
            else statutReel = "absent";
          }

          const dureeReelle = estAujourdHui
            ? (aujourdHuiReel?.dureeMinutes ?? 0) + (enService && dernierHorodatage ? Math.max(0, Math.round((now.getTime() - new Date(dernierHorodatage).getTime()) / 60000)) : 0)
            : 0;

          const lignesDroite: string[] = !estAujourdHui
            ? (() => {
                const jours = Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${aujourdHuiStr2}T00:00:00`).getTime()) / 86400000);
                return [jours <= 1 ? "Commence demain" : `Commence dans ${jours} jours`];
              })()
            : statutReel === "pas_pointe" ? [`Dans ${formatMinutes(Math.max(0, debutMin - nowMin))}`]
            : statutReel === "retard" ? [`+${formatMinutes(nowMin - debutMin)} de retard`]
            : statutReel === "en_cours" ? (() => {
                const heureEntree = dernierHorodatage ? new Date(dernierHorodatage) : null;
                const retardEntree = heureEntree ? Math.max(0, (heureEntree.getHours() * 60 + heureEntree.getMinutes()) - debutMin) : 0;
                return [
                  `Pointé à ${heureEntree ? formatHeureCourte(heureEntree) : "—"}${retardEntree > 0 ? ` · +${formatMinutes(retardEntree)}` : ""}`,
                  `Se termine dans ${formatMinutes(Math.max(0, finMin - nowMin))}`,
                ];
              })()
            : statutReel === "pause" ? ["Pause en cours"]
            : statutReel === "termine" ? [aujourdHuiReel ? `Terminé à ${aujourdHuiReel.fin}` : "Terminé"]
            : ["Aucun pointage enregistré"];

          return (
            <div style={{ position: "relative", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.dark, fontSize: "14px", fontWeight: 800 }}>{instInfo?.name ?? "Votre employeur"}</div>
                  {(employe?.poste || employe?.departement) && (
                    <div style={{ color: C.gray, fontSize: "10.5px", fontWeight: 600, marginTop: "1px" }}>{[employe?.poste, employe?.departement].filter(Boolean).join(" · ")}</div>
                  )}
                  {instInfo?.ville && (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span style={{ color: C.gray, fontSize: "10.5px", fontWeight: 600 }}>{instInfo.ville}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => setMenuOuvert(menuOuvert === id ? null : id)} className="tap" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", flexShrink: 0, color: C.gray, fontSize: "16px", fontWeight: 900, lineHeight: 1 }}>⋯</button>
                {menuOuvert === id && (
                  <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "34px", right: "10px", backgroundColor: C.white, border: `1px solid ${C.border}`, borderRadius: "12px", boxShadow: "0 4px 16px rgba(28,20,0,0.12)", padding: "6px", zIndex: 10, minWidth: "170px" }}>
                    {["Modifier", "Voir les détails", "Ajouter une note", "Signaler un problème"].map((label) => (
                      <div key={label} style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 600, color: C.gray, borderRadius: "8px" }}>{label}</div>
                    ))}
                    <div style={{ padding: "4px 10px 2px", fontSize: "9.5px", fontWeight: 600, color: C.gray, borderTop: `1px solid ${C.border}`, marginTop: "2px", paddingTop: "8px" }}>Bientôt disponible</div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: C.dark, fontSize: "15px", fontWeight: 800 }}>{segment.debut} — {segment.fin}</div>
                <div style={{ color: C.gray, fontSize: "11px", fontWeight: 600 }}>
                  {estAujourdHui && dureeReelle > 0 ? `${formatDuree(dureePrevue)} planifiées · ${formatDuree(dureeReelle)} travaillées` : `${formatDuree(dureePrevue)} · ${estAujourdHui ? "Aujourd'hui" : jour}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: estAujourdHui ? STATUT_REEL[statutReel].couleur : C.gold }}/>
                  <span style={{ color: estAujourdHui ? STATUT_REEL[statutReel].couleur : C.gold, fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{estAujourdHui ? STATUT_REEL[statutReel].label : "Planifié"}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  {lignesDroite.map((ligne, i) => (
                    <div key={i} style={{ color: C.gray, fontSize: "10.5px", fontWeight: 600, marginTop: i > 0 ? "2px" : 0 }}>{ligne}</div>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: C.white, display: "flex", flexDirection: "column", animation: "eciSheetFade 0.15s ease" }} onClick={() => setMenuOuvert(null)}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <button onClick={() => setVuePlanning(false)} className="tap" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ color: C.dark, fontSize: "18px", fontWeight: 900, letterSpacing: "-0.3px" }}>Planning</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px calc(24px + env(safe-area-inset-bottom))" }}>
              <div style={{ color: C.gray, fontSize: "12.5px", fontWeight: 600, marginBottom: "16px" }}>Votre temps de travail, organisé simplement.</div>

              <div style={{ display: "flex", gap: "6px", backgroundColor: C.gray3, borderRadius: "999px", padding: "4px", marginBottom: "18px" }}>
                {([["mon_planning", "Mon planning"], ["disponibilites", "Disponibilités"]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setPlanningMode(key)} className="tap" style={{ flex: 1, padding: "9px 0", borderRadius: "999px", border: "none", background: planningMode === key ? C.white : "none", boxShadow: planningMode === key ? "0 1px 3px rgba(28,20,0,0.08)" : "none", color: planningMode === key ? C.dark : C.gray, fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}>{label}</button>
                ))}
              </div>

              {planningMode === "disponibilites" ? (
                <EtatVide titre="Disponibilités arrive bientôt" description="Vous pourrez bientôt consulter et demander des créneaux disponibles directement ici."/>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "18px", overflowX: "auto" }}>
                    {([["aujourdhui", "Aujourd'hui"], ["semaine", "Cette semaine"], ["avenir", "À venir"]] as const).map(([key, label]) => (
                      <button key={key} onClick={() => setPlanningTab(key)} className="tap" style={{ backgroundColor: planningTab === key ? C.gold : C.gray3, color: planningTab === key ? C.dark : C.gray, border: "none", fontWeight: 800, fontSize: "12px", padding: "8px 14px", borderRadius: "999px", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
                    ))}
                  </div>

                  {planningTab === "aujourdhui" && (
                    <>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
                        <div style={{ color: C.dark, fontSize: "15px", fontWeight: 900, marginBottom: "4px" }}>{formatDateComplete(now)}</div>
                        <div style={{ color: C.gray, fontSize: "12.5px", fontWeight: 600 }}>
                          {shiftDuJourAffiche ? `${shiftDuJourAffiche.segments.length} shift${shiftDuJourAffiche.segments.length > 1 ? "s" : ""} · ${formatDuree(shiftDuJourAffiche.segments.reduce((t, s) => { const [hD,mD]=s.debut.split(":").map(Number); const [hF,mF]=s.fin.split(":").map(Number); return t + Math.max(0,(hF*60+mF)-(hD*60+mD)); }, 0))} planifiées` : "Aucun shift planifié"}
                        </div>
                      </div>
                      {shiftDuJourAffiche ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {shiftDuJourAffiche.segments.map((seg) => <CarteShift key={seg.debut} date={shiftDuJourAffiche.date} jour={shiftDuJourAffiche.jour} segment={seg}/>)}
                        </div>
                      ) : (
                        <EtatVide titre="Aucun shift disponible" description="Aucun créneau n'est actuellement prévu pour aujourd'hui." avecProchainsJours/>
                      )}
                    </>
                  )}

                  {planningTab === "semaine" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "18px" }}>
                        {joursSemaineDates.map((d) => {
                          const dStr = d.toISOString().slice(0, 10);
                          const jourAbbr = JOURS_ABBR[d.getDay()].replace(".", "");
                          const aUnShift = shiftsParDate.has(dStr);
                          const selectionne = dStr === dateAffichee;
                          return (
                            <button key={dStr} onClick={() => setJourSelectionne(dStr)} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
                              <span style={{ color: C.gray, fontSize: "10px", fontWeight: 700 }}>{jourAbbr}</span>
                              <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: selectionne ? C.gold : "transparent", color: selectionne ? C.dark : (dStr === aujourdHuiStr2 ? C.gold : C.dark), display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800 }}>{d.getDate()}</div>
                              <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: aUnShift ? C.gold : "transparent" }}/>
                            </button>
                          );
                        })}
                      </div>
                      {shiftDuJourAffiche ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {shiftDuJourAffiche.segments.map((seg) => <CarteShift key={seg.debut} date={shiftDuJourAffiche.date} jour={shiftDuJourAffiche.jour} segment={seg}/>)}
                        </div>
                      ) : (
                        <EtatVide titre="Aucun shift ce jour-là" description="Ce jour est un jour de repos ou n'a pas encore d'horaire affecté."/>
                      )}
                    </>
                  )}

                  {planningTab === "avenir" && (
                    shiftsAvenir.length === 0 ? (
                      <EtatVide titre="Aucun shift à venir" description="Aucun créneau n'est prévu dans les 13 prochains jours."/>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {shiftsAvenir.map((s) => (
                          <div key={s.date}>
                            <div style={{ color: C.dark2, fontSize: "11px", fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: "8px" }}>{s.jour} {formatDateCourte(s.date)}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                              {s.segments.map((seg) => <CarteShift key={seg.debut} date={s.date} jour={s.jour} segment={seg}/>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {scannerOuvert && (
        <div
          onClick={fermerScanner}
          style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(28,20,0,0.88)", backdropFilter: "blur(16px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "eciSheetFade 0.2s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "480px", backgroundColor: C.white, borderRadius: "24px 24px 0 0", padding: "20px 22px calc(24px + env(safe-area-inset-bottom))", boxSizing: "border-box", animation: "eciSheetUp 0.25s cubic-bezier(0.22,1,0.36,1)" }}
          >
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.border, margin: "0 auto 18px" }}/>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div>
                <div style={{ color: C.dark, fontSize: "17px", fontWeight: 900 }}>Scanner le QR de l&apos;établissement</div>
                <div style={{ color: C.gray, fontSize: "11.5px", fontWeight: 600, marginTop: "2px" }}>Affiché sur place par {instInfo?.name ?? "votre employeur"}</div>
              </div>
              <button onClick={fermerScanner} className="tap" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {!scanErreur && (
              <div>
                {/* Conteneur avec dimensions réelles avant même le démarrage —
                    sur iOS Safari, attacher un flux caméra à un élément caché
                    fait échouer start() silencieusement (piège déjà documenté
                    dans ScannerModal, app/[slug]/[id]/layout.tsx). */}
                <div style={{ position: "relative", display: (scanCamPhase === "actif" || scanCamPhase === "demarrage") ? "block" : "none" }}>
                  <div id="qr-reader-pointage" style={{ borderRadius: "16px", overflow: "hidden", backgroundColor: C.gray3, minHeight: "260px" }}/>
                  {(scanCamPhase === "demarrage" || scanValidation) && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px", textAlign: "center", backgroundColor: scanValidation ? "rgba(255,255,255,0.85)" : "transparent" }}>
                      <YelenLoader size={32} label={scanValidation ? "Vérification…" : "Ouverture de la caméra…"} labelColor={C.gray}/>
                    </div>
                  )}
                </div>
                {scanCamPhase === "avant" && (
                  <div style={{ textAlign: "center", padding: "24px 8px" }}>
                    <div style={{ width: "60px", height: "60px", borderRadius: "16px", backgroundColor: `${C.gold}1A`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </div>
                    <div style={{ color: C.dark, fontSize: "14px", fontWeight: 800, marginBottom: "6px" }}>Scannez le QR affiché sur votre lieu de travail</div>
                    <div style={{ color: C.gray, fontSize: "12px", lineHeight: 1.5, marginBottom: "18px" }}>Yelen a besoin d&apos;accéder à votre caméra pour confirmer que vous êtes bien sur place.</div>
                    <button onClick={demarrerScanPointage} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "999px", border: "none", background: C.gold, color: C.dark, fontWeight: 800, fontSize: "13.5px", cursor: "pointer" }}>Activer la caméra</button>
                  </div>
                )}
                {scanCamPhase === "refuse" && (
                  <div style={{ textAlign: "center", padding: "24px 8px" }}>
                    <div style={{ width: "60px", height: "60px", borderRadius: "16px", backgroundColor: C.redL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                    </div>
                    <div style={{ color: C.dark, fontSize: "14px", fontWeight: 800, marginBottom: "6px" }}>Accès à la caméra impossible</div>
                    <div style={{ color: C.gray, fontSize: "12px", lineHeight: 1.5, marginBottom: "18px" }}>Autorisez la caméra pour Yelen224 dans les réglages de votre navigateur, puis réessayez.</div>
                    <button onClick={demarrerScanPointage} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "999px", border: `1px solid ${C.border}`, background: "none", color: C.dark2, fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}>Réessayer</button>
                  </div>
                )}
              </div>
            )}

            {scanErreur && (
              <div style={{ textAlign: "center", padding: "20px 8px" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: C.redL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
                <div style={{ color: C.red, fontSize: "14px", fontWeight: 800, marginBottom: "6px" }}>QR invalide</div>
                <div style={{ color: C.gray, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "18px" }}>{scanErreur}</div>
                <button onClick={() => { setScanErreur(""); setScanCamPhase("avant"); }} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "999px", border: "none", background: C.gold, color: C.dark, fontWeight: 800, fontSize: "13.5px", cursor: "pointer" }}>Réessayer</button>
              </div>
            )}
          </div>
        </div>
      )}

      {sheetFinAnticipee && (
        <div
          onClick={() => setSheetFinAnticipee(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(28,20,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "eciSheetFade 0.2s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "480px", backgroundColor: C.white, borderRadius: "24px 24px 0 0", padding: "20px 22px calc(22px + env(safe-area-inset-bottom))", boxSizing: "border-box", animation: "eciSheetUp 0.25s cubic-bezier(0.22,1,0.36,1)" }}
          >
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.border, margin: "0 auto 18px" }}/>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>
              <Image src="/illustrations/fin-anticipee-shift.png" alt="" width={1254} height={1254} style={{ width: "168px", height: "auto", display: "block" }}/>
            </div>
            <div style={{ fontSize: "17px", fontWeight: 900, color: C.dark, textAlign: "center", marginBottom: "6px" }}>Il n&apos;est pas encore l&apos;heure de fin</div>
            <div style={{ color: C.gray, fontSize: "13px", fontWeight: 600, textAlign: "center", lineHeight: 1.5, marginBottom: "22px" }}>
              Votre shift se termine à {planDuJour?.fin ?? "—"}. Si vous terminez maintenant, votre présence de la journée s&apos;arrête ici.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={() => { setSheetFinAnticipee(false); ouvrirScanner(); }} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "999px", border: "none", background: C.gold, color: C.dark, fontWeight: 800, fontSize: "14px", cursor: "pointer" }}>Terminer quand même</button>
              <button onClick={() => setSheetFinAnticipee(false)} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "999px", border: `1px solid ${C.border}`, background: "none", color: C.dark2, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Annuler, continuer à travailler</button>
            </div>
          </div>
        </div>
      )}

      {sheetHeures && (
        <div
          onClick={() => setSheetHeures(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(28,20,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "eciSheetFade 0.2s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "480px", backgroundColor: C.white, borderRadius: "24px 24px 0 0", padding: "20px 22px calc(22px + env(safe-area-inset-bottom))", maxHeight: "82svh", overflowY: "auto", boxSizing: "border-box", animation: "eciSheetUp 0.25s cubic-bezier(0.22,1,0.36,1)" }}
          >
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.border, margin: "0 auto 18px" }}/>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px" }}>
              <div style={{ fontSize: "21px", fontWeight: 900, color: C.dark, letterSpacing: "-0.3px" }}>Mes heures</div>
              <button onClick={() => setSheetHeures(false)} className="tap" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ color: C.gray, fontSize: "12.5px", fontWeight: 600, marginBottom: "18px" }}>{formatPlageSemaine(now)}</div>

            {semaine && (
              <div style={{ display: "flex", justifyContent: "space-between", border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "20px" }}>
                <div>
                  <div style={{ color: C.dark, fontSize: "17px", fontWeight: 900 }}>{formatDuree(semaine.travailleesMinutes)}</div>
                  <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600, marginTop: "2px" }}>travaillées</div>
                </div>
                <div>
                  <div style={{ color: C.dark, fontSize: "17px", fontWeight: 900 }}>{formatDuree(semaine.prevuesMinutes)}</div>
                  <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600, marginTop: "2px" }}>prévues</div>
                </div>
                <div>
                  <div style={{ color: semaine.ecartMinutes < 0 ? C.red : C.green, fontSize: "17px", fontWeight: 900 }}>{formatEcart(semaine.ecartMinutes)}</div>
                  <div style={{ color: C.gray, fontSize: "9.5px", fontWeight: 600, marginTop: "2px" }}>restant</div>
                </div>
              </div>
            )}

            <div style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "10px" }}>Détail par jour</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {semaineDetail.map((j) => {
                const estAujourdHui = j.date === now.toISOString().slice(0, 10);
                const pasDeShift = j.prevuesMinutes === 0;
                return (
                  <div key={j.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${estAujourdHui ? C.gold : C.border}`, borderRadius: "14px", padding: "12px 14px" }}>
                    <div>
                      <div style={{ color: C.dark, fontSize: "13.5px", fontWeight: 800 }}>{j.jour}</div>
                      <div style={{ color: C.gray, fontSize: "10.5px", fontWeight: 600, marginTop: "1px" }}>{formatDateCourte(j.date)}</div>
                    </div>
                    {pasDeShift ? (
                      <span style={{ color: C.gray, fontSize: "12px", fontWeight: 600 }}>Repos</span>
                    ) : (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: C.dark, fontSize: "13px", fontWeight: 700 }}>{formatDuree(j.travailleesMinutes)} <span style={{ color: C.gray, fontWeight: 600 }}>/ {formatDuree(j.prevuesMinutes)}</span></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {sheetProfil && (() => {
        const STATUTS: Record<string, { label: string; couleur: string }> = {
          actif: { label: "Actif", couleur: C.gray },
          suspendu: { label: "Suspendu", couleur: C.gray },
          en_conge: { label: "En congé", couleur: C.gray },
          archive: { label: "Archivé", couleur: C.gray },
          desactive: { label: "Désactivé", couleur: C.gray },
          teletravail: { label: "Télétravail", couleur: C.gray },
          mission: { label: "En mission", couleur: C.gray },
        };
        const statutInfo = profilData ? (STATUTS[profilData.statut] ?? { label: profilData.statut, couleur: C.gray }) : null;
        const pinValide = PIN_REGEX.test(pinActuel) && PIN_REGEX.test(nouveauPin) && PIN_REGEX.test(confirmPin);

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: C.white, display: "flex", flexDirection: "column", animation: "eciSheetFade 0.15s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <button onClick={() => setSheetProfil(false)} className="tap" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ color: C.dark, fontSize: "18px", fontWeight: 900, letterSpacing: "-0.3px" }}>Mon profil</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px calc(24px + env(safe-area-inset-bottom))" }}>
              {!profilData ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={22} color={C.gold}/></div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "26px" }}>
                    <div style={{ width: "52px", height: "52px", borderRadius: "50%", backgroundColor: C.gray3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", fontWeight: 900, color: C.gold, flexShrink: 0 }}>
                      {profilData.prenom.slice(0, 1).toUpperCase()}{profilData.nom.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.dark, fontSize: "16px", fontWeight: 900, textTransform: "capitalize" }}>{profilData.prenom} {profilData.nom}</div>
                      <div style={{ color: C.gray, fontSize: "11.5px", fontWeight: 600, marginTop: "2px" }}>Employee ID · {profilData.matricule}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "6px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: statutInfo!.couleur }}/>
                        <span style={{ color: statutInfo!.couleur, fontSize: "11px", fontWeight: 800 }}>{statutInfo!.label}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "10px" }}>Emploi</div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: "16px", padding: "4px 16px", marginBottom: "6px" }}>
                    {[
                      ["Poste", profilData.poste],
                      ["Département", profilData.departement],
                      ["Manager", profilData.manager],
                      ["Établissement", instInfo?.name ?? null],
                      ["Employé depuis", profilData.dateEmbauche ? new Date(`${profilData.dateEmbauche}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null],
                    ].map(([label, valeur]) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ color: C.gray, fontSize: "12.5px", fontWeight: 600 }}>{label}</span>
                        <span style={{ color: C.dark, fontSize: "12.5px", fontWeight: 700, textAlign: "right" }}>{valeur ?? "—"}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 0 12px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span style={{ color: C.gray, fontSize: "10.5px", fontWeight: 600 }}>Géré par votre organisation — {instInfo?.name ?? "votre employeur"}</span>
                    </div>
                  </div>

                  <div style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", margin: "22px 0 10px" }}>Qui voit mes données</div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
                    <div style={{ color: C.dark, fontSize: "12.5px", fontWeight: 800, marginBottom: "8px" }}>{instInfo?.name ?? "Votre employeur"} peut voir :</div>
                    {["Informations d'emploi (poste, département, manager)", "Horaires et planning", "Pointages et présence", "Employee ID"].map((t) => (
                      <div key={t} style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "5px" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ color: C.dark2, fontSize: "11.5px", fontWeight: 600 }}>{t}</span>
                      </div>
                    ))}
                    <div style={{ color: C.dark, fontSize: "12.5px", fontWeight: 800, margin: "12px 0 8px" }}>Ne peut pas voir :</div>
                    {["Vos autres activités Yelen", "Vos identifiants de connexion (PIN)"].map((t) => (
                      <div key={t} style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "5px" }}>
                        <span style={{ color: C.gray, fontSize: "13px", fontWeight: 700, width: "12px", textAlign: "center" }}>—</span>
                        <span style={{ color: C.gray, fontSize: "11.5px", fontWeight: 600 }}>{t}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", margin: "22px 0 10px" }}>Sécurité</div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
                    {profilData.doitChangerPin && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", marginBottom: "14px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span style={{ color: C.dark2, fontSize: "11.5px", fontWeight: 600 }}>Changement de PIN requis — votre employeur vous a communiqué un PIN temporaire.</span>
                      </div>
                    )}
                    <div style={{ color: C.dark, fontSize: "12.5px", fontWeight: 800, marginBottom: "10px" }}>Changer mon code PIN</div>
                    {["PIN actuel", "Nouveau PIN", "Confirmer le nouveau PIN"].map((label, i) => (
                      <input
                        key={label}
                        type="password" inputMode="numeric" maxLength={4} placeholder="4 chiffres"
                        value={i === 0 ? pinActuel : i === 1 ? nouveauPin : confirmPin}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                          if (i === 0) setPinActuel(v); else if (i === 1) setNouveauPin(v); else setConfirmPin(v);
                          setPinError(""); setPinSucces(false);
                        }}
                        style={{ width: "100%", padding: "11px 14px", borderRadius: "11px", border: `1.5px solid ${C.border}`, marginBottom: "8px", fontSize: "15px", letterSpacing: "5px", textAlign: "center", color: C.dark, boxSizing: "border-box" }}
                        aria-label={label}
                      />
                    ))}
                    {pinError && <div style={{ color: C.red, fontSize: "11.5px", fontWeight: 700, marginBottom: "8px" }}>{pinError}</div>}
                    {pinSucces && <div style={{ color: C.green, fontSize: "11.5px", fontWeight: 700, marginBottom: "8px" }}>PIN mis à jour avec succès.</div>}
                    <button onClick={changerPin} disabled={!pinValide || pinLoading} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "999px", border: "none", background: pinValide ? C.gold : C.gray3, color: pinValide ? C.dark : C.gray, fontWeight: 800, fontSize: "13.5px", cursor: pinValide ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {pinLoading ? <YelenLoader size={15} color={C.dark}/> : "Mettre à jour le PIN"}
                    </button>
                  </div>

                  <div style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", margin: "22px 0 10px" }}>À venir</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {["Photo & coordonnées personnelles", "Vérification d'identité & documents", "Confidentialité & mes données", "Appareils & sessions"].map((t) => (
                      <div key={t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px" }}>
                        <span style={{ color: C.dark2, fontSize: "12px", fontWeight: 600 }}>{t}</span>
                        <span style={{ color: C.gray, fontSize: "10.5px", fontWeight: 600 }}>Bientôt disponible</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
