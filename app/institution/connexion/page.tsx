"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { YelenLogo } from "@/components/YelenLogo";
import { MembreLoginSection } from "./components/MembreLoginSection";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YelenLoader } from "@/components/YelenLoader";
import { validerFormatPhoneGuinee, normaliserChiffresPhone, versE164Guinee, filtrerSaisiePhone, masquerPhoneGuinee } from "@/lib/phoneGuinee";
import { AuthSecurityBlockedScreen } from "@/components/security/AuthSecurityBlockedScreen";

// ═══════════════════════════════════════════════════════════
// ACCENT DE MARQUE — fixe, jamais dérivé du thème clair/sombre
// ═══════════════════════════════════════════════════════════
const GOLD = { gold: "#F5A623", goldD: "#C8940A", goldL: "#FDE68A" };

// ═══════════════════════════════════════════════════════════
// SECURITY: Math Challenge
// ═══════════════════════════════════════════════════════════

// Horodatage extrait en dehors du corps du composant : évite que l'analyse
// de pureté de React Compiler (react-hooks/purity) signale Date.now() comme
// appel impur potentiellement exécuté pendant le rendu, alors qu'il n'est en
// réalité jamais appelé que depuis des gestionnaires d'événements utilisateur.
function now() {
  return Date.now();
}

function generateChallenge() {
  const ops = [
    { q: () => { const a = Math.floor(Math.random()*20+5), b = Math.floor(Math.random()*15+3); return { q: `${a} + ${b}`, a: String(a+b) }; } },
    { q: () => { const a = Math.floor(Math.random()*20+15), b = Math.floor(Math.random()*10+2); return { q: `${a} - ${b}`, a: String(a-b) }; } },
    { q: () => { const a = Math.floor(Math.random()*8+2), b = Math.floor(Math.random()*6+2); return { q: `${a} × ${b}`, a: String(a*b) }; } },
    { q: () => { const b = [2,3,4,5][Math.floor(Math.random()*4)], a = b * Math.floor(Math.random()*8+2); return { q: `${a} ÷ ${b}`, a: String(a/b) }; } },
  ];
  return ops[Math.floor(Math.random()*ops.length)].q();
}

// Message générique pour l'état bloqué/support_only (chantier Auth
// Security 28/08/2026, voir lib/security/authSecurity.ts) — utilisé
// uniquement pour la garde locale avant l'envoi d'une requête.
function messageBlocageActuel(state: "blocked" | "support_only", retryAfterS: number): string {
  if (state === "support_only") return "Contactez le support pour réactiver la connexion sur cet appareil.";
  return retryAfterS > 0 ? `Accès temporairement protégé. Réessayez dans ${retryAfterS}s.` : "Accès temporairement protégé. Réessayez dans un instant.";
}

type InstPreview = {
  id: string;
  name: string;
  category: string;
  ville: string;
  logo: string | null;
  badge_verifie: boolean;
  moyenne_avis: number;
  nb_avis: number;
  phone: string;
  statut: "en_attente" | "validee" | "suspendue" | "refusee";
};

// Rendu uniquement : la valeur brute (E.164) reste dans l'état, seul
// l'affichage est masqué.
function masquerNumeroInst(phone: string): string {
  return masquerPhoneGuinee(phone.replace(/^\+224/, ""));
}

type RememberedInst = { id: string; name: string };

type Step = "unlock" | "phone" | "preview" | "otp" | "totp" | "setup" | "success" | "deletion-pending";

type DeletionInfo = { motif: string; scheduled_purge_at: string };

// useSearchParams() (lignes "expired"/"logged_out"/"deletion_requested")
// exige une frontière Suspense en App Router, sinon le build échoue au
// prerendering statique ("Error occurred prerendering page /institution/
// connexion") — corrigé le 22/07/2026, jamais rencontré avant car aucun
// build Netlify n'avait été relancé depuis l'écriture de ce chantier.
function InstitutionConnexionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // useState plutôt que des const dérivées directement de searchParams
  // (retour Bryan, cohérence avec app/login/page.tsx) — pour pouvoir fermer
  // chaque bandeau localement avec un X, sans toucher à l'URL.
  const [sessionExpired, setSessionExpired] = useState(searchParams.get("expired") === "1");
  const [loggedOut, setLoggedOut] = useState(searchParams.get("logged_out") === "1");
  // Déclenché par page.tsx du dashboard quand l'ID d'institution de l'URL
  // ne correspond pas à celui de la session (URL modifiée manuellement) —
  // distinct de "session expirée" : ici la session était valide, c'est
  // l'accès demandé qui a été refusé, message volontairement différent.
  const [accesRefuse, setAccesRefuse] = useState(searchParams.get("acces_refuse") === "1");
  // Bug préexistant (indépendant de ce chantier) : ParametresTab.tsx redirige
  // déjà vers ?deletion_requested=1 après une demande de suppression de
  // compte, mais ce paramètre n'a jamais été lu ici — la bannière
  // correspondante ne s'affichait donc jamais.
  const [deletionRequested, setDeletionRequested] = useState(searchParams.get("deletion_requested") === "1");
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = T[theme];
  const C = {
    gold: GOLD.gold, goldD: GOLD.goldD, goldL: GOLD.goldL,
    goldBg:  isDark ? "rgba(245,166,35,0.07)" : "#FFFBEB",
    goldBg2: isDark ? "rgba(245,166,35,0.12)" : "#FEF3C7",
    bg:      t.pageBg,
    white:   t.cardBg,
    dark:    t.text,
    dark2:   t.textMuted,
    gray:    t.textSubtle,
    gray2:   t.textFaint,
    gray3:   isDark ? "rgba(255,255,255,0.08)" : "#EDE8D8",
    red:     "#DC2626",
    redL:    isDark ? "rgba(220,38,38,0.14)" : "#FEF2F2",
    green:   "#16A34A",
    greenL:  isDark ? "rgba(22,163,74,0.14)" : "#F0FDF4",
    // Orange de marque assombri pour le texte de lien : #9A6400 ≈ 5:1 sur
    // blanc (AA) ; en sombre, l'orange de marque est déjà très contrasté.
    linkAccent: isDark ? GOLD.gold : "#9A6400",
    amber:   isDark ? "#FCD34D" : "#92400E",
    amberBg: isDark ? "rgba(245,158,11,0.14)" : "#FFFBEB",
    // Information neutre (session expirée, demande enregistrée) : bleu, pour
    // ne pas se confondre avec le doré de marque ni avec une erreur.
    info:    isDark ? "#60A5FA" : "#2563EB",
    infoFg:  isDark ? "#BFDBFE" : "#1E3A8A",
    infoBg:  isDark ? "rgba(59,130,246,0.14)" : "#EFF6FF",
    // Désactivé (boutons) : gris neutre, texte lisible AA sur le fond.
    disabledBg: isDark ? "rgba(255,255,255,0.08)" : "#F3F4F6",
    disabledFg: isDark ? "rgba(255,255,255,0.45)" : "#6B7280",
    // Neutre (décision Bryan 14/08/2026) : l'ancien halo doré permanent sur
    // les cadres (bordure des champs/cartes au repos) gâtait l'image de
    // marque — bordure neutre au repos, doré réservé au focus (voir
    // .inp:focus / .phone-wrap:focus-within), exactement comme Google.
    border:  isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.14)",
    // Retiré complètement (décision CEO 14/08/2026) : diffusion dorée sur
    // les badges icône/carte — aucun effet de halo, même discret, dans les
    // références premium (Google/Meta/GitHub n'en utilisent pas). Bordure
    // et fond dégradé restent seuls porteurs de la mise en valeur.
    shadow:  "none",
    // Ombre du conteneur principal — neutre et discrète (décision CEO
    // 14/08/2026, "réduire fortement les grands effets jaunes/flottants") :
    // avant, diffusion dorée sur 60px/20% d'opacité (effet halo). Remplacée
    // par une ombre grise standard SaaS premium, sans teinte de marque.
    shadow2: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(20,20,30,0.09)",
  };
  const [step, setStep]         = useState<Step>("phone");
  const [phone, setPhone]       = useState("");
  const [otp, setOtp]           = useState(["","","","","",""]);
  const [inst, setInst]         = useState<InstPreview | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  // État anti-abus piloté par le serveur (chantier Auth Security
  // 28/08/2026, voir lib/security/authSecurity.ts) — remplace l'ancien
  // compteur cosmétique local (attempts/blocked/blockEnd/timer).
  const [securityState, setSecurityState] = useState<"normal" | "warning" | "blocked" | "support_only">("normal");
  const [securityRetryAfterS, setSecurityRetryAfterS] = useState(0);
  const [resendTimer, setResendTimer] = useState(0);
  const [challenge, setChallenge]     = useState(generateChallenge);
  const [chalAns, setChalAns]         = useState("");
  const [chalOk, setChalOk]           = useState(false);
  // Sheet explicatif "pourquoi cette vérification ?" (retour Bryan
  // 30/09/2026) — l'icône à droite du champ de réponse était jusqu'ici un
  // simple indicateur d'état (info/coche), jamais cliquable.
  const [showSecuriteInfo, setShowSecuriteInfo] = useState(false);
  const [justReady, setJustReady]     = useState(false);
  const phoneDigitsNormalized = normaliserChiffresPhone(phone);
  const phoneValidation = validerFormatPhoneGuinee(phone);
  const phoneErreurVisible = phoneValidation.code === "prefixe_inconnu" || phoneValidation.code === "caracteres_invalides";
  const phoneCtaDisabled = loading || securityState === "blocked" || securityState === "support_only" || !chalOk || !phoneValidation.valide;
  const otpRefs = useRef<(HTMLInputElement|null)[]>([]);

  // ── Se souvenir de moi / déverrouillage rapide ──
  const [rememberMe, setRememberMe]           = useState(false);
  const [remembered, setRemembered]           = useState<RememberedInst | null>(null);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [unlockMode, setUnlockMode]           = useState<"choice" | "pin">("choice");
  const [unlockPin, setUnlockPin]             = useState("");
  const [setupMode, setSetupMode]             = useState<"choice" | "pin">("choice");
  const [setupPin, setSetupPin]               = useState("");

  // ── 2FA TOTP (chantier sécurité institution, 25/07/2026) ──
  // totpContext distingue le flux OTP téléphone frais (où rememberMe peut
  // encore mener à l'étape "setup" après la 2FA) du déverrouillage rapide
  // (PIN/biométrie d'un appareil mémorisé, où le TOTP mène toujours
  // directement à completeLogin, comme aujourd'hui).
  const [totpToken, setTotpToken]             = useState("");
  const [totpContext, setTotpContext]         = useState<"otp" | "unlock">("otp");
  // Avertissement explicite à la connexion (décision CEO 17/08/2026, révisée
  // le même jour) : seul le compte_principal peut se connecter pendant une
  // suspension (les membres d'équipe restent bloqués côté serveur), mais on
  // ne veut plus le laisser découvrir la suspension seulement après avoir
  // atterri sur le dashboard — l'écran "success" ci-dessous prévient
  // explicitement avant la redirection. Positionné dès qu'une route
  // d'authentification répond `suspended`, consommé par completeLogin().
  const [suspendedFlag, setSuspendedFlag]     = useState(false);
  const [totpCode, setTotpCode]               = useState(["","","","","",""]);
  const [totpBackupMode, setTotpBackupMode]   = useState(false);
  const [totpBackupCode, setTotpBackupCode]   = useState("");
  const totpRefs = useRef<(HTMLInputElement|null)[]>([]);

  // ── Compte en cours de suppression (délai de grâce) ──
  const [deletionInfo, setDeletionInfo]       = useState<DeletionInfo | null>(null);
  const [pendingLogin, setPendingLogin]       = useState<{ id: string; name: string } | null>(null);
  const [cancelLoading, setCancelLoading]     = useState(false);

  // Décompte visuel du blocage — purement informatif : la porte réelle
  // reste vérifiée par le serveur à la prochaine requête.
  useEffect(() => {
    if (securityState !== "blocked" || securityRetryAfterS <= 0) return;
    const t = setTimeout(() => setSecurityRetryAfterS(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [securityState, securityRetryAfterS]);

  // Timer renvoi
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer(v => Math.max(v-1, 0)), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  useEffect(() => {
    setChalOk(chalAns.trim() === challenge.a);
  }, [chalAns, challenge]);

  // Micro-interaction : le bouton principal "pulse" brièvement au moment où
  // le numéro et la vérification deviennent valides ensemble, pour signaler
  // que l'action est prête sans attendre le clic.
  useEffect(() => {
    if (!phoneValidation.valide || !chalOk) return;
    setJustReady(true);
    const t = setTimeout(() => setJustReady(false), 450);
    return () => clearTimeout(t);
  }, [phoneValidation.valide, chalOk]);

  // Au chargement : un appareil est-il mémorisé ? Si oui, l'écran de
  // connexion s'ouvre directement en déverrouillage rapide — sinon le
  // formulaire téléphone reste affiché par défaut. Vérification silencieuse,
  // n'empêche jamais l'affichage immédiat du formulaire.
  useEffect(() => {
    setWebauthnSupported(browserSupportsWebAuthn());
    (async () => {
      try {
        const res = await fetch("/api/institution/auth/remember/check", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.success) {
          setRemembered(data.institution);
          setStep("unlock");
        }
      } catch {}
    })();
  }, []);

  const canContinueLogin = inst?.statut === "validee" || inst?.statut === "en_attente";

  // Le cookie de session est déjà posé par la route qui vient de nous appeler
  // (verify-otp / pin/verify / webauthn/auth-verify) — on vérifie ici si un délai de
  // grâce de suppression est en cours avant d'entrer dans le dashboard, plutôt que de
  // laisser l'institution atterrir dessus normalement.
  async function completeLogin(id: string, name: string) {
    try {
      const res = await fetch("/api/institution/auth/deletion/status");
      const data = await res.json();
      if (res.ok && data.pending) {
        setPendingLogin({ id, name });
        setDeletionInfo({ motif: data.motif, scheduled_purge_at: data.scheduled_purge_at });
        setLoading(false);
        setStep("deletion-pending");
        return;
      }
    } catch { /* en cas d'erreur réseau, ne pas bloquer une connexion par ailleurs valide */ }

    localStorage.setItem("yelen224_institution_id", id);
    localStorage.setItem("yelen224_inst_name", name);
    localStorage.setItem("yelen224_inst_auth", "true");
    localStorage.setItem("yelen224_inst_auth_ts", String(now()));
    setLoading(false);
    setStep("success");
    // Délai allongé quand suspendu — le message est plus long, laisse le
    // temps de le lire avant la redirection vers "Espace suspendu".
    setTimeout(() => router.push(`/institution/${id}/dashboard`), suspendedFlag ? 2800 : 1500);
  }

  // Bascule vers l'étape de saisie du code TOTP — appelée dès qu'une route
  // primaire (OTP/PIN/WebAuthn) répond requiresTotp. totpToken/totpContext
  // sont déjà positionnés par l'appelant avant cet appel.
  function enterTotpStep() {
    setTotpCode(["","","","","",""]);
    setTotpBackupMode(false);
    setTotpBackupCode("");
    setError("");
    setLoading(false);
    setStep("totp");
    setTimeout(() => totpRefs.current[0]?.focus(), 300);
  }

  async function cancelDeletionAndEnter() {
    if (!pendingLogin) return;
    setCancelLoading(true);
    setError("");
    try {
      const res = await fetch("/api/institution/auth/deletion/cancel", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Nous n'avons pas pu annuler la suppression. Réessayez.");
        setCancelLoading(false);
        return;
      }
      const { id, name } = pendingLogin;
      setDeletionInfo(null);
      setPendingLogin(null);
      localStorage.setItem("yelen224_institution_id", id);
      localStorage.setItem("yelen224_inst_name", name);
      localStorage.setItem("yelen224_inst_auth", "true");
      localStorage.setItem("yelen224_inst_auth_ts", String(now()));
      setCancelLoading(false);
      setStep("success");
      setTimeout(() => router.push(`/institution/${id}/dashboard`), 1500);
    } catch {
      setError("Un problème de connexion est survenu.");
      setCancelLoading(false);
    }
  }

  // ── Déverrouillage rapide : biométrie ──
  async function handleBiometricUnlock() {
    if (!remembered) return;
    setError("");
    setLoading(true);
    try {
      const optRes = await fetch("/api/institution/auth/webauthn/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: remembered.id }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setError(optData.code === "NOT_CONFIGURED"
          ? "Aucun accès rapide par empreinte/Face ID configuré. Utilisez votre code ou reconnectez-vous par SMS."
          : (optData.error || "Nous n'avons pas pu préparer la vérification. Réessayez."));
        setLoading(false);
        return;
      }

      let assertion;
      try {
        assertion = await startAuthentication({ optionsJSON: optData.options });
      } catch {
        setError("Vérification annulée ou échouée. Réessayez ou utilisez votre code.");
        setLoading(false);
        return;
      }

      const verifyRes = await fetch("/api/institution/auth/webauthn/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: remembered.id, credential: assertion, challengeToken: optData.challengeToken }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error || "Nous n'avons pas pu vérifier votre identité. Réessayez.");
        setLoading(false);
        return;
      }

      if (verifyData.requiresTotp) {
        setTotpToken(verifyData.totpToken);
        setTotpContext("unlock");
        enterTotpStep();
        return;
      }

      setSuspendedFlag(!!verifyData.suspended);
      completeLogin(verifyData.institution.id, verifyData.institution.name);
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
      setLoading(false);
    }
  }

  // ── Déverrouillage rapide : code ──
  async function handlePinUnlock() {
    if (!remembered) return;
    setError("");
    if (unlockPin.length < 4) { setError("Merci d'entrer votre code de déverrouillage."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/institution/auth/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: remembered.id, pin: unlockPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ce code ne semble pas correct.");
        setUnlockPin("");
        setLoading(false);
        return;
      }

      if (data.requiresTotp) {
        setTotpToken(data.totpToken);
        setTotpContext("unlock");
        enterTotpStep();
        return;
      }

      setSuspendedFlag(!!data.suspended);
      completeLogin(data.institution.id, data.institution.name);
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
      setLoading(false);
    }
  }

  // "Ce n'est pas vous" — oublie l'appareil et revient au flow complet.
  async function handleForgetDevice() {
    try { await fetch("/api/institution/auth/remember/forget", { method: "POST" }); } catch {}
    setRemembered(null);
    setError("");
    setUnlockMode("choice");
    setUnlockPin("");
    setStep("phone");
  }

  // ── ÉTAPE 1 : Chercher institution par numéro ──
  async function handlePhoneSubmit() {
    setError("");
    if (securityState === "blocked" || securityState === "support_only") { setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }

    if (!phoneValidation.valide) {
      setError(phoneValidation.message || "Ce numéro ne semble pas valide. Vérifiez-le et réessayez.");
      return;
    }
    if (!chalOk) { setError("La réponse ne semble pas correcte, réessayez."); return; }

    setLoading(true);
    const fullPhone = versE164Guinee(phoneDigitsNormalized);

    try {
      const res = await fetch("/api/institution/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await res.json();

      if (data.security?.state) { setSecurityState(data.security.state); setSecurityRetryAfterS(data.security.retryAfterS || 0); }

      if (res.status === 423) {
        setError(data.error || "Accès temporairement protégé.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Un souci est survenu. Réessayez dans un instant.");
        if (data.code === "NOT_FOUND") { setChallenge(generateChallenge()); setChalAns(""); }
        setLoading(false);
        return;
      }

      setInst(data.institution as InstPreview);
      localStorage.setItem("yelen_inst_phone", fullPhone);
      setStep("preview");
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
    }
    setLoading(false);
  }

  // ── ÉTAPE 2 : Envoyer OTP ──
  async function handleSendOtp() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/institution/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: inst!.id }),
      });
      const data = await res.json();

      if (data.security?.state) { setSecurityState(data.security.state); setSecurityRetryAfterS(data.security.retryAfterS || 0); }

      if (!res.ok) {
        setError(data.error || "Un souci est survenu lors de l'envoi du code. Réessayez dans un instant.");
        setLoading(false);
        return;
      }

      setStep("otp");
      setResendTimer(60);
      setSuccess(`Code envoyé au ${masquerNumeroInst(inst!.phone)}`);
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
    }
    setLoading(false);
  }

  // ── ÉTAPE 3 : Vérifier OTP ──
  async function handleVerifyOtp() {
    const code = otp.join("");
    // Bouton désactivé tant que le code n'est pas complet — garde-fou
    // silencieux, sans message (retour Bryan 09/08/2026).
    if (code.length < 6) return;
    if (securityState === "blocked" || securityState === "support_only") { setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/institution/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: inst!.id, code, rememberMe }),
      });
      const data = await res.json();

      if (data.security?.state) { setSecurityState(data.security.state); setSecurityRetryAfterS(data.security.retryAfterS || 0); }

      if (!res.ok) {
        setError(data.error || "Ce code ne correspond pas. Vérifiez-le et réessayez.");
        setLoading(false);
        return;
      }

      if (data.requiresTotp) {
        setTotpToken(data.totpToken);
        setTotpContext("otp");
        enterTotpStep();
        return;
      }

      setSuspendedFlag(!!data.suspended);

      // Session posée côté serveur. Si "se souvenir de moi" est coché, on
      // propose de configurer l'accès rapide avant de rejoindre le tableau
      // de bord — sinon rien à configurer, connexion terminée.
      if (rememberMe) {
        setLoading(false);
        setStep("setup");
      } else {
        completeLogin(inst!.id, inst!.name);
      }
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
      setLoading(false);
    }
  }

  // ── ÉTAPE 2FA TOTP ──
  async function handleTotpVerify() {
    setError("");
    const entered = totpBackupMode ? totpBackupCode.trim() : totpCode.join("");
    // Bouton désactivé tant que le code n'est pas complet — même garde-fou
    // silencieux que l'OTP téléphone (retour Bryan 09/08/2026).
    if (totpBackupMode ? !entered : entered.length < 6) {
      if (totpBackupMode) setError("Merci d'entrer un code de secours.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/institution/auth/totp/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpToken, code: entered }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Ce code ne semble pas correct.");
        setTotpCode(["","","","","",""]);
        setLoading(false);
        setTimeout(() => totpRefs.current[0]?.focus(), 100);
        return;
      }

      setSuspendedFlag(!!data.suspended);

      // Même règle que handleVerifyOtp : un déverrouillage rapide (PIN/
      // biométrie) va toujours directement à completeLogin, une connexion
      // OTP fraîche avec "se souvenir de moi" propose encore la
      // configuration de l'accès rapide.
      if (totpContext === "otp" && rememberMe) {
        setLoading(false);
        setStep("setup");
      } else {
        completeLogin(data.institution.id, data.institution.name);
      }
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
      setLoading(false);
    }
  }

  const handleTotpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n = [...totpCode]; n[i] = val.slice(-1); setTotpCode(n);
    if (val && i < 5) totpRefs.current[i+1]?.focus();
    if (n.every(d => d) && n.join("").length === 6) setTimeout(handleTotpVerify, 200);
  };
  const handleTotpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !totpCode[i] && i > 0) totpRefs.current[i-1]?.focus();
  };

  // ── Configuration de l'accès rapide (proposée une fois, après connexion complète) ──
  async function handleSetupBiometric() {
    setError("");
    setLoading(true);
    try {
      const optRes = await fetch("/api/institution/auth/webauthn/register-options", { method: "POST" });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setError(optData.error || "Nous n'avons pas pu préparer cette étape. Réessayez.");
        setLoading(false);
        return;
      }

      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: optData.options });
      } catch {
        setError("Enregistrement annulé ou échoué. Vous pourrez réessayer plus tard.");
        setLoading(false);
        return;
      }

      const verifyRes = await fetch("/api/institution/auth/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: attestation, challengeToken: optData.challengeToken }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error || "Nous n'avons pas pu terminer l'enregistrement. Réessayez.");
        setLoading(false);
        return;
      }

      completeLogin(inst!.id, inst!.name);
    } catch {
      setError("Petit souci de connexion. Vous pourrez réessayer plus tard.");
      setLoading(false);
    }
  }

  async function handleSetupPin() {
    setError("");
    if (setupPin.length < 4) { setError("Votre code doit contenir au moins 4 chiffres."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/institution/auth/pin/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: setupPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Nous n'avons pas pu enregistrer votre code. Réessayez.");
        setLoading(false);
        return;
      }
      completeLogin(inst!.id, inst!.name);
    } catch {
      setError("Petit souci de connexion. Vous pourrez réessayer plus tard.");
      setLoading(false);
    }
  }

  function skipSetup() {
    completeLogin(inst!.id, inst!.name);
  }

  // OTP input handlers
  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n = [...otp]; n[i] = val.slice(-1); setOtp(n);
    if (val && i < 5) otpRefs.current[i+1]?.focus();
    if (n.every(d => d) && n.join("").length === 6) setTimeout(handleVerifyOtp, 200);
  };
  const handleOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i-1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); otpRefs.current[i-1]?.focus(); }
    if (e.key === "ArrowRight" && i < 5) { e.preventDefault(); otpRefs.current[i+1]?.focus(); }
    if (e.key === "Enter") handleVerifyOtp();
  };
  // Collage du code complet : répartit les chiffres sur les 6 cases, sans
  // envoi automatique (l'utilisateur confirme explicitement).
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setOtp(Array.from({ length: 6 }, (_, k) => digits[k] ?? ""));
    otpRefs.current[Math.min(digits.length, 5)]?.focus();
  };
  // « Modifier le numéro » : même retour que « Retour » de l'étape 2.
  function retourModifierNumero() {
    setStep("phone"); setInst(null); setError(""); setSuccess("");
    setOtp(["","","","","",""]); setResendTimer(0);
    setChallenge(generateChallenge()); setChalAns("");
  }

  // Focus automatique sur la première case en arrivant à l'étape du code.
  useEffect(() => {
    if (step === "otp") otpRefs.current[0]?.focus();
  }, [step]);

  // ── CSS ──
  const css = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    html,body{background:${C.bg};overflow-x:hidden;min-height:100%}
    @keyframes fadeUp{from{opacity:0}to{opacity:1}}
    @keyframes scaleIn{from{opacity:0}to{opacity:1}}
    @keyframes successPop{0%{transform:scale(0.8)}60%{transform:scale(1.1)}100%{transform:scale(1)}}
    @keyframes errShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
    @keyframes authPop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
    @keyframes readyPulse{0%{transform:scale(1)}45%{transform:scale(1.03)}100%{transform:scale(1)}}
    @keyframes checkPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
    .tap{transition:opacity .12s,transform .12s;cursor:pointer;touch-action:manipulation;user-select:none}
    .tap:active{opacity:.75;transform:scale(.97)}
    input::placeholder{color:${C.gray2}}
    .inp:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(245,166,35,0.12)!important;outline:none}
    .otp-inp:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(245,166,35,0.15)!important;outline:none}
    .phone-wrap:focus-within{border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(245,166,35,0.12)!important}
    .card-hover{transition:transform 0.2s,box-shadow 0.2s}
    .card-hover:hover{transform:translateY(-2px);box-shadow:${C.shadow2}}
    .err-shake{animation:errShake .35s ease}
    .cta-main{transition:transform .15s,box-shadow .15s,filter .15s}
    .cta-main:not(:disabled):hover{transform:translateY(-1px);filter:brightness(1.03)}
    .yelen-conn-root{min-height:100svh;overflow-x:hidden}
    .yelen-login-content{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
    .yelen-login-content > div{animation-duration:.15s!important}
    .yelen-login-content > div:not(.yelen-login-step-split){width:100%;max-width:440px;margin-left:auto;margin-right:auto}

    /* ── Écran de connexion unique (style Mailchimp) : formulaire toujours
       visible et centré, sans page d'accueil marketing ni pop-up à ouvrir ── */
    .yelen-login-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:20px}
    .yelen-login-card{position:relative;width:100%;max-width:440px;background:${C.white};border-radius:24px;box-shadow:${C.shadow2};display:flex;flex-direction:column;overflow:hidden;animation:authPop .22s cubic-bezier(.2,.8,.2,1)}
    .yelen-login-scroll{flex:1;display:flex;flex-direction:column;padding:32px 36px 24px}
    .yelen-login-side{text-align:center;margin-bottom:22px}

    /* ── Liens légaux dans la carte (retire le footer séparé, style Google
       Sign-in, retour Bryan 07/09/2026) ── */
    .yelen-login-legal{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px;margin-top:20px;padding-top:14px;border-top:1px solid ${C.border};font-size:11px;color:${C.gray}}
    .yelen-login-legal a{color:${C.gray};text-decoration:none}
    .yelen-login-legal a:hover{color:${C.goldD};text-decoration:underline}

    .yelen-login-title{letter-spacing:0}
    .yelen-link:hover{text-decoration:underline}
    .otp-box{width:48px;height:56px}
    @media (max-width: 640px){.otp-box{width:44px;height:52px}}
    @media (prefers-reduced-motion: reduce){
      *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
    }
    @media (max-width: 640px){
      .yelen-login-title{font-size:24px!important}
      .yelen-login-wrap{padding:0}
      .yelen-login-card{max-width:100%;min-height:100svh;border-radius:0}
      .yelen-login-scroll{padding:48px 22px 24px}
    }

    /* ── Écran principal (téléphone) en PC : carte large façon Google Sign-in,
       icône/titre à gauche et champs de formulaire à droite au lieu d'empiler
       verticalement — réduit aussi la hauteur nécessaire, donc l'ascenseur
       interne (.yelen-login-scroll) n'apparaît plus sur un écran de bureau. ── */
    @media (min-width: 960px){
      .yelen-login-card.wide{max-width:820px}
      /* Étape téléphone : carte encore plus large pour laisser de la place à
         l'illustration réelle (retour Bryan 07/09/2026) sans écraser le
         formulaire. */
      .yelen-login-card.illustrated{max-width:1040px}
      /* Hauteur naturelle mesurée de l'étape 1 (Edge, 1366×768 et 1920×1080) : 560,5 px */
      .yelen-login-card{min-height:561px}
      .yelen-login-illustration img{max-height:300px;object-fit:cover!important}
      .yelen-login-step-split{display:flex;flex-direction:row;align-items:center;gap:48px}
      .yelen-login-step-split .yelen-login-side{flex:0 0 260px;text-align:left;margin-bottom:0}
      .yelen-login-card.illustrated .yelen-login-step-split .yelen-login-side{flex:0 0 340px}
      .yelen-login-step-split .yelen-login-form{flex:1;min-width:0}
      .yelen-login-illustration{display:block!important}
    }
  `;

  const Spinner = () => <YelenLoader size={18} color={C.dark}/>;

  const ErrorBanner = ({ msg }: { msg: string }) => (
    <div role="alert" className="err-shake" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", marginBottom: "16px" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style={{ color: C.red, fontSize: "13px", fontWeight: "600", flex: 1 }}>{msg}</span>
      <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );

  const ctaStyle = (disabled: boolean): React.CSSProperties => ({
    width: "100%", height: "44px", borderRadius: "10px", border: "none",
    background: disabled ? C.disabledBg : C.gold,
    color: disabled ? C.disabledFg : "#1a1200", fontSize: "15px", fontWeight: "600",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
    transition: "background 0.2s, color 0.2s",
  });

  const secondaryStyle: React.CSSProperties = {
    width: "100%", height: "44px", borderRadius: "10px", border: `1.5px solid ${C.border}`,
    background: "transparent", color: C.dark2, fontSize: "15px", fontWeight: "600",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
  };

  const FingerprintIcon = ({ color, size = 34 }: { color: string; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/>
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88"/>
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/>
      <path d="M2 12a10 10 0 0 1 18-6"/>
      <path d="M21.8 16c.2-2 .131-5.354 0-6"/>
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/>
      <path d="M8.65 22c.21-.66.45-1.32.57-2"/>
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>
    </svg>
  );

  return (
    <div className="yelen-conn-root" style={{ display: "flex", flexDirection: "column", background: C.bg, fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", color: C.dark }}>
      <style>{css}</style>

      {/* ÉCRAN DE CONNEXION — style Mailchimp : le formulaire est le contenu
          principal de la page, toujours visible, sans pop-up à ouvrir.
          Décision CEO 07/09/2026 : plus de header séparé (même traitement
          que l'inscription) — le logo Yelen vit désormais dans la carte,
          en haut à droite, plutôt que dans une barre au-dessus. */}
      <div className="yelen-login-wrap">
        <div className="yelen-login-card wide illustrated" role="main" aria-label="Connexion institution">
          <Link href="/" aria-label="Retour à l'accueil Yelen224" title="Yelen224" className="tap" style={{ position: "absolute", top: "20px", right: "20px", zIndex: 5, width: "36px", height: "36px", background: C.disabledBg, border: `1px solid ${C.border}`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
            <YelenLogo size={18} color={C.dark2}/>
          </Link>
          <div className="yelen-login-scroll">

        {sessionExpired && step !== "success" && (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.infoBg, border: `1px solid ${C.info}40`, borderLeft: `3px solid ${C.info}`, borderRadius: "12px", marginBottom: "20px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span style={{ color: C.infoFg, fontSize: "13px", fontWeight: "500", flex: 1 }}>Votre session a expiré. Reconnectez-vous pour continuer.</span>
            <button onClick={() => setSessionExpired(false)} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.infoFg, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {accesRefuse && step !== "success" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", marginBottom: "20px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
            <span style={{ color: C.red, fontSize: "13px", fontWeight: "700", flex: 1 }}>Accès refusé : votre session ne correspond pas à cet établissement. Reconnectez-vous pour continuer en sécurité.</span>
            <button onClick={() => setAccesRefuse(false)} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {loggedOut && step !== "success" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderLeft: `3px solid ${C.green}`, borderRadius: "12px", marginBottom: "20px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ color: C.green, fontSize: "13px", fontWeight: "700", flex: 1 }}>Vous avez été déconnecté avec succès</span>
            <button onClick={() => setLoggedOut(false)} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.green, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {deletionRequested && step !== "success" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.infoBg, border: `1px solid ${C.info}40`, borderLeft: `3px solid ${C.info}`, borderRadius: "12px", marginBottom: "20px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span style={{ color: C.infoFg, fontSize: "13px", fontWeight: "700", flex: 1 }}>Votre demande de suppression de compte a bien été enregistrée.</span>
            <button onClick={() => setDeletionRequested(false)} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.infoFg, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        <div className="yelen-login-content">
        {(securityState === "blocked" || securityState === "support_only") ? (
          <AuthSecurityBlockedScreen state={securityState} retryAfterS={securityRetryAfterS} dark={isDark} onExpire={() => setSecurityState("normal")} />
        ) : (
        <>
        {/* ═══ STEP: UNLOCK (déverrouillage rapide) ═══ */}
        {step === "unlock" && remembered && (
          <div className="yelen-login-step-split" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="yelen-login-side">
              {/* Illustration réelle (même traitement que les autres étapes,
                  retour Bryan 07/09/2026) — visible uniquement à partir de
                  960px, sur la même ligne que le titre plutôt qu'empilée
                  au-dessus. */}
              <div className="yelen-login-illustration" style={{ display: "none", width: "100%", borderRadius: "20px", overflow: "hidden", marginBottom: "18px", border: `1px solid ${C.border}` }}>
                <Image src="/illustrations/deverrouillage-rapide.png" alt="Déverrouillage rapide de l'espace institution" width={1536} height={1024} style={{ width: "100%", height: "auto", display: "block" }} priority/>
              </div>
              <h1 className="yelen-login-title" title={`Bonjour, ${remembered.name}`} style={{ color: C.dark, fontSize: "28px", fontWeight: "600", marginBottom: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Bonjour, {remembered.name}</h1>
              <p style={{ color: C.dark2, fontSize: "14px" }}>Déverrouillez votre espace pour continuer</p>
            </div>

            <div className="yelen-login-form">
            {error && <ErrorBanner msg={error}/>}

            {unlockMode === "choice" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {webauthnSupported && (
                  <button onClick={handleBiometricUnlock} disabled={loading} className="tap cta-main" style={ctaStyle(loading)}>
                    {loading ? <><Spinner/> Vérification…</> : <><FingerprintIcon color={loading ? C.gray : C.dark} size={18}/> Toucher pour déverrouiller</>}
                  </button>
                )}
                <button onClick={() => { setUnlockMode("pin"); setError(""); }} disabled={loading} className="tap" style={secondaryStyle}>
                  Utiliser mon code de déverrouillage
                </button>
              </div>
            )}

            {unlockMode === "pin" && (
              <div>
                <input
                  className="inp"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Code de déverrouillage"
                  value={unlockPin}
                  onChange={e => setUnlockPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handlePinUnlock()}
                  style={{ width: "100%", padding: "15px 16px", borderRadius: "14px", border: `1.5px solid ${C.border}`, backgroundColor: C.white, color: C.dark, fontSize: "20px", fontWeight: "700", letterSpacing: "4px", textAlign: "center", marginBottom: "12px" }}
                  autoFocus
                />
                <button onClick={handlePinUnlock} disabled={loading || unlockPin.length < 4} className="tap" style={{ ...ctaStyle(loading || unlockPin.length < 4), marginBottom: "10px" }}>
                  {loading ? <><Spinner/> Vérification…</> : "Déverrouiller"}
                </button>
                {webauthnSupported && (
                  <button onClick={() => { setUnlockMode("choice"); setUnlockPin(""); setError(""); }} className="tap" style={{ width: "100%", background: "none", border: "none", color: C.gold, fontSize: "13px", fontWeight: "700", cursor: "pointer", padding: "8px" }}>
                    ← Utiliser l&apos;empreinte / Face ID
                  </button>
                )}
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <span style={{ color: C.dark2, fontSize: "13px" }}>Ce n&apos;est pas vous ?{" "}</span>
              <button onClick={handleForgetDevice} className="tap" style={{ background: "none", border: "none", padding: 0, color: C.dark2, fontSize: "13px", fontWeight: "500", textDecoration: "underline", cursor: "pointer" }}>
                Se connecter avec un autre compte
              </button>
            </div>
            </div>
          </div>
        )}

        {/* ═══ STEP: PHONE ═══ */}
        {step === "phone" && (
          <div className="yelen-login-step-split" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="yelen-login-side">
              {/* Illustration réelle (retour Bryan 07/09/2026), remplace
                  l'icône bâtiment générique — visible uniquement à partir de
                  960px (voir .yelen-login-step-split), l'étape téléphone
                  reste texte seul sur mobile. */}
              <div className="yelen-login-illustration" style={{ display: "none", width: "100%", borderRadius: "20px", overflow: "hidden", marginBottom: "18px", border: `1px solid ${C.border}` }}>
                <Image src="/illustrations/institution-connexion.png" alt="Espace institution Yelen224" width={888} height={876} style={{ width: "100%", height: "auto", display: "block" }} priority/>
              </div>
              <h1 className="yelen-login-title" style={{ color: C.dark, fontSize: "28px", fontWeight: "600", marginBottom: "6px" }}>Connexion</h1>
              <p style={{ color: C.dark2, fontSize: "14px", lineHeight: 1.5 }}>Accédez à l&apos;espace sécurisé de votre institution</p>
              <p style={{ color: C.gray, fontSize: "12px", marginTop: "6px" }}>Étape 1 sur {rememberMe ? 4 : 3}</p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "10px", padding: "5px 12px", backgroundColor: C.gray3, border: `1px solid ${C.border}`, borderRadius: "20px" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ color: C.dark, fontSize: "12px", fontWeight: "500" }}>Connexion sécurisée</span>
              </div>
            </div>

            <div className="yelen-login-form">
            {/* Champ téléphone */}
            <div style={{ marginBottom: "14px" }}>
              <label htmlFor="inst-phone" style={{ color: C.dark2, fontSize: "13px", fontWeight: "500", display: "block", marginBottom: "6px" }}>Numéro de téléphone</label>
              <div className="phone-wrap" style={{ display: "flex", borderRadius: "10px", height: "40px", border: `1.5px solid ${phoneErreurVisible ? C.red : (phoneValidation.valide ? C.green : C.border)}`, overflow: "hidden", backgroundColor: C.white, transition: "border-color 0.2s, box-shadow 0.2s" }}>
                <div style={{ padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", borderRight: `1.5px solid ${C.border}`, backgroundColor: C.goldBg2, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 0 }}>
                    <div style={{ width: "8px", height: "6px", background: "#CE1126", borderRadius: "1px 0 0 1px" }}/>
                    <div style={{ width: "8px", height: "6px", background: "#FCD20F" }}/>
                    <div style={{ width: "8px", height: "6px", background: "#009A44", borderRadius: "0 1px 1px 0" }}/>
                  </div>
                  <span style={{ color: C.dark, fontSize: "14px", fontWeight: "600" }}>+224</span>
                </div>
                <input
                  id="inst-phone"
                  className="inp"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  readOnly={loading}
                  aria-describedby="inst-phone-count"
                  placeholder="620 000 000"
                  value={phone}
                  onChange={e => {
                    const raw = filtrerSaisiePhone(e.target.value);
                    // Plafond à 10 chiffres : 9 chiffres réels + 1 "0" initial toléré.
                    if (raw.replace(/\s/g, "").length <= 10) setPhone(raw);
                  }}
                  onKeyDown={e => e.key === "Enter" && handlePhoneSubmit()}
                  style={{ flex: 1, minWidth: 0, padding: "0 14px", fontSize: "15px", fontWeight: "500", letterSpacing: "0.5px", border: "none", background: "transparent", color: C.dark, transition: "all 0.2s" }}
                  autoFocus
                />
                {phoneValidation.valide && (
                  <div style={{ display: "flex", alignItems: "center", paddingRight: "14px", animation: "checkPop .2s ease" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                )}
                {phoneErreurVisible && (
                  <div style={{ display: "flex", alignItems: "center", paddingRight: "14px", animation: "checkPop .2s ease" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                )}
              </div>
              <p id="inst-phone-count" aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "5px", color: phoneErreurVisible ? C.red : (phoneValidation.valide ? C.green : C.gray), fontSize: "12px", marginTop: "6px", fontWeight: "500" }}>
                {phoneErreurVisible ? phoneValidation.message : (phoneValidation.valide ? "Numéro valide" : `${phoneDigitsNormalized.length} / 9 chiffres`)}
              </p>
            </div>

            {/* Challenge math */}
            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="inst-chal" style={{ color: C.dark2, fontSize: "13px", fontWeight: "500", display: "block", marginBottom: "6px" }}>Vérification de sécurité</label>
              <p style={{ color: C.dark2, fontSize: "14px", marginBottom: "8px" }}>Combien font <strong style={{ color: C.dark, fontWeight: "700" }}>{challenge.q}</strong> ?</p>
              <div style={{ position: "relative" }}>
                <input
                  id="inst-chal"
                  className="inp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  readOnly={loading}
                  aria-label="Réponse à la question de sécurité"
                  placeholder="Votre réponse"
                  value={chalAns}
                  onChange={e => setChalAns(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onKeyDown={e => e.key === "Enter" && handlePhoneSubmit()}
                  style={{ width: "100%", height: "40px", padding: "0 44px 0 14px", borderRadius: "10px", border: `1.5px solid ${chalOk ? C.green : C.border}`, backgroundColor: C.white, color: C.dark, fontSize: "15px", fontWeight: "500", transition: "border-color 0.2s" }}
                />
                <button
                  type="button"
                  onClick={() => setShowSecuriteInfo(true)}
                  aria-label="Pourquoi cette vérification ?"
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: "4px", cursor: "pointer", display: "flex" }}
                >
                  {chalOk
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" style={{ animation: "checkPop .2s ease" }} aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  }
                </button>
              </div>
              {chalOk && (
                <p style={{ display: "flex", alignItems: "center", gap: "5px", color: C.green, fontSize: "12px", marginTop: "6px", fontWeight: "500", animation: "fadeUp .2s ease" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Vérification réussie
                </p>
              )}
            </div>

            {showSecuriteInfo && createPortal(
              <div onClick={() => setShowSecuriteInfo(false)} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: "24px 24px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", width: "100%", maxWidth: "480px" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => setShowSecuriteInfo(false)} aria-label="Fermer" className="tap" style={{ width: "32px", height: "32px", borderRadius: "50%", border: `1px solid ${C.border}`, background: "none", color: C.dark, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: C.goldBg2, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                  </div>
                  <h2 style={{ color: C.dark, fontSize: "17px", fontWeight: "900", margin: "0 0 8px" }}>Pourquoi cette vérification ?</h2>
                  <p style={{ color: C.gray, fontSize: "13.5px", lineHeight: 1.65, margin: "0 0 20px" }}>
                    Cette vérification limite les envois automatiques de SMS.
                  </p>
                  <button onClick={() => setShowSecuriteInfo(false)} className="tap" style={{ width: "100%", background: C.gold, color: "#1a1200", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer" }}>
                    Compris
                  </button>
                </div>
              </div>,
              document.body
            )}

            {error && <ErrorBanner msg={error}/>}

            <button
              onClick={handlePhoneSubmit}
              disabled={phoneCtaDisabled}
              className="tap cta-main"
              style={{ width: "100%", height: "44px", borderRadius: "10px", border: "none", background: phoneCtaDisabled ? C.disabledBg : C.gold, color: phoneCtaDisabled ? C.disabledFg : "#1a1200", fontSize: "15px", fontWeight: "600", cursor: phoneCtaDisabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", transition: "background 0.2s, color 0.2s", animation: justReady ? "readyPulse .45s ease" : "none" }}
            >
              {loading ? <><Spinner/> Recherche…</> : <>
                Continuer vers mon institution
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </>}
            </button>
            {phoneCtaDisabled && !loading && (
              <p style={{ color: C.gray, fontSize: "12px", textAlign: "center", marginTop: "8px" }}>
                {!phoneValidation.valide ? "Entrez votre numéro à 9 chiffres." : "Répondez à la question."}
              </p>
            )}

            <div style={{ textAlign: "center", marginTop: "16px", color: C.dark2, fontSize: "14px" }}>
              Pas encore inscrit ?{" "}
              <Link href="/institution/inscription" style={{ color: C.linkAccent, fontWeight: "500", textDecoration: "none" }} className="yelen-link">Créer un compte</Link>
            </div>
            <MembreLoginSection/>
            </div>
          </div>
        )}

        {/* ═══ STEP: PREVIEW INSTITUTION ═══ */}
        {step === "preview" && inst && (
          <div className="yelen-login-step-split" style={{ animation: "scaleIn 0.3s ease" }}>
            <div className="yelen-login-side">
              {/* Illustration réelle (même traitement que l'étape OTP,
                  retour Bryan 07/09/2026) — visible uniquement à partir de
                  960px, sur la même ligne que le titre plutôt qu'empilée
                  au-dessus. */}
              <div className="yelen-login-illustration" style={{ display: "none", width: "100%", borderRadius: "20px", overflow: "hidden", marginBottom: "18px", border: `1px solid ${C.border}` }}>
                <Image src="/illustrations/confirmer-identite-institution.png" alt="Confirmation de l'identité de l'institution" width={1536} height={1024} style={{ width: "100%", height: "auto", display: "block" }} priority/>
              </div>
              <h2 className="yelen-login-title" style={{ color: C.dark, fontSize: "28px", fontWeight: "600" }}>Confirmer l&apos;identité</h2>
              <p style={{ color: C.dark2, fontSize: "14px", marginTop: "6px" }}>Vérifiez que c&apos;est bien votre institution</p>
              <p style={{ color: C.gray, fontSize: "12px", marginTop: "6px" }}>Étape 2 sur 3</p>
            </div>

            <div className="yelen-login-form">
            {/* Card institution */}
            <div className="card-hover" style={{ backgroundColor: C.white, borderRadius: "20px", padding: "20px", border: `2px solid ${C.gold}30`, boxShadow: C.shadow, marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                {inst.logo ? (
                  <div style={{ position: "relative", width: "64px", height: "64px", borderRadius: "16px", overflow: "hidden", border: `2px solid ${C.gold}30`, flexShrink: 0 }}><Image src={inst.logo} alt={inst.name} fill sizes="64px" style={{ objectFit: "cover" }}/></div>
                ) : (
                  <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, border: `2px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: C.gold, fontSize: "24px", fontWeight: "900" }}>{inst.name.slice(0,2).toUpperCase()}</span>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ color: C.dark, fontSize: "18px", fontWeight: "600" }}>{inst.name}</span>
                    {inst.badge_verifie && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: C.greenL, color: C.green, fontSize: "12px", fontWeight: "500", padding: "2px 8px", borderRadius: "10px" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        Vérifié
                      </div>
                    )}
                  </div>
                  <div style={{ color: C.gray, fontSize: "13px", marginTop: "2px" }}>{inst.category}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ color: C.gray, fontSize: "12px" }}>{inst.ville}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "14px", backgroundColor: C.gray3, borderRadius: "12px" }}>
                {[
                  { label: "Note", value: inst.moyenne_avis > 0 ? inst.moyenne_avis.toFixed(1) : "—" },
                  { label: "Avis", value: String(inst.nb_avis || 0) },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: "600", color: C.dark }}>{s.value}</div>
                    <div style={{ fontSize: "12px", color: C.dark2, marginTop: "2px" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bandeau statut */}
            {inst.statut === "en_attente" && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "14px 16px", backgroundColor: "#FFF3CD", border: "1px solid #FFC107", borderLeft: "3px solid #FFC107", borderRadius: "12px", marginBottom: "20px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                <div>
                  <div style={{ color: "#856404", fontSize: "12px", fontWeight: "800", marginBottom: "2px" }}>Vérification en cours</div>
                  <div style={{ color: "#856404", fontSize: "12px", lineHeight: 1.5 }}>
                    Votre compte est en cours de vérification par notre équipe. Vous pouvez vous connecter dès maintenant — votre profil sera visible aux citoyens une fois la validation terminée.
                  </div>
                </div>
              </div>
            )}

            {(inst.statut === "suspendue" || inst.statut === "refusee") && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "14px 16px", backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", marginBottom: "20px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  <div style={{ color: C.red, fontSize: "12px", fontWeight: "800", marginBottom: "2px" }}>
                    {inst.statut === "suspendue" ? "Compte suspendu" : "Demande non retenue"}
                  </div>
                  <div style={{ color: C.red, fontSize: "12px", lineHeight: 1.5 }}>
                    {inst.statut === "suspendue"
                      ? "Ce compte est actuellement suspendu. Contactez le support Yelen224 pour en savoir plus et retrouver l'accès à votre espace."
                      : "Cette demande d'inscription n'a pas été retenue. Contactez le support Yelen224 pour en comprendre les raisons ou corriger votre dossier."}
                  </div>
                </div>
              </div>
            )}

            {/* Numéro masqué — uniquement si la connexion reste possible */}
            {canContinueLogin && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.gray3, border: `1px solid ${C.border}`, borderRadius: "12px", marginBottom: "20px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.dark, fontSize: "13px", fontWeight: "700" }}>
                    Un code SMS sera envoyé au {masquerNumeroInst(inst.phone)}
                  </div>
                  <div style={{ color: C.gray, fontSize: "12px" }}>Via SMS sécurisé YELEN224</div>
                </div>
              </div>
            )}

            {error && <ErrorBanner msg={error}/>}

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setStep("phone"); setInst(null); setError(""); setChallenge(generateChallenge()); setChalAns(""); }}
                className="tap"
                style={{ flex: canContinueLogin ? 1 : "1 1 100%", height: "44px", borderRadius: "10px", border: `1.5px solid ${C.border}`, background: "transparent", color: C.dark2, fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                ← Retour
              </button>
              {canContinueLogin && (
                <button onClick={handleSendOtp} disabled={loading} className="tap"
                  style={{ flex: 2, height: "44px", borderRadius: "10px", border: "none", background: loading ? C.disabledBg : C.gold, color: loading ? C.disabledFg : "#1a1200", fontSize: "15px", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  {loading ? <><Spinner/> Envoi…</> : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Envoyer le code SMS
                  </>}
                </button>
              )}
            </div>
            </div>
          </div>
        )}

        {/* ═══ STEP: OTP ═══ */}
        {step === "otp" && (
          <div className="yelen-login-step-split" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="yelen-login-side">
              {/* Illustration réelle (même traitement que l'étape téléphone,
                  retour Bryan 07/09/2026) — visible uniquement à partir de
                  960px, sur la même ligne que le titre (voir
                  .yelen-login-step-split) plutôt qu'empilée au-dessus. */}
              <div className="yelen-login-illustration" style={{ display: "none", width: "100%", borderRadius: "20px", overflow: "hidden", marginBottom: "18px", border: `1px solid ${C.border}` }}>
                <Image src="/illustrations/verification-code-otp.png" alt="Vérification du code envoyé par SMS" width={1536} height={1024} style={{ width: "100%", height: "auto", display: "block" }} priority/>
              </div>
              <h2 className="yelen-login-title" style={{ color: C.dark, fontSize: "28px", fontWeight: "600", marginBottom: "6px" }}>Saisissez le code</h2>
              <p style={{ color: C.dark2, fontSize: "14px" }}>
                Un code SMS à 6 chiffres a été envoyé au<br/><strong style={{ color: C.dark, fontWeight: "600" }}>{inst ? masquerNumeroInst(inst.phone) : ""}</strong>
              </p>
              <button type="button" onClick={retourModifierNumero} disabled={loading} className="tap yelen-link" style={{ background: "none", border: "none", padding: 0, marginTop: "6px", color: C.dark2, fontSize: "13px", cursor: "pointer" }}>
                Modifier le numéro
              </button>
              <p style={{ color: C.gray, fontSize: "12px", marginTop: "6px" }}>Étape 3 sur {rememberMe ? 4 : 3}</p>
            </div>

            <div className="yelen-login-form">
            {success && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ color: C.green, fontSize: "13px", fontWeight: "600", flex: 1 }}>{success}</span>
                <button onClick={() => setSuccess("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.green, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {/* OTP inputs */}
            <div role="group" aria-label="Code à 6 chiffres" style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "20px" }}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  className="otp-inp otp-box"
                  ref={el => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label={`Chiffre ${i + 1} sur 6`}
                  maxLength={1}
                  readOnly={loading}
                  value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                  onPaste={e => handleOtpPaste(e)}
                  style={{ textAlign: "center", fontSize: "22px", fontWeight: "600", backgroundColor: C.white, border: `1.5px solid ${d ? C.dark2 : C.border}`, borderRadius: "10px", color: C.dark, transition: "border-color 0.15s" }}
                />
              ))}
            </div>

            {/* Se souvenir de moi */}
            <div role="checkbox" aria-checked={rememberMe} tabIndex={0}
              onClick={() => setRememberMe(v => !v)}
              onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setRememberMe(v => !v); } }}
              className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", backgroundColor: rememberMe ? C.amberBg : C.white, border: `1.5px solid ${rememberMe ? C.gold : C.border}`, borderRadius: "10px", marginBottom: "16px", cursor: "pointer", transition: "all 0.2s" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "6px", backgroundColor: rememberMe ? C.gold : "transparent", border: `2px solid ${rememberMe ? C.gold : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                {rememberMe && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a1200" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.dark, fontSize: "13px", fontWeight: "500" }}>Se souvenir de moi sur cet appareil</div>
                <div style={{ color: C.gray, fontSize: "12px", marginTop: "2px" }}>À ne cocher que sur votre appareil personnel.</div>
              </div>
            </div>

            {error && <ErrorBanner msg={error}/>}

            <button onClick={handleVerifyOtp} disabled={loading || otp.join("").length < 6} className="tap cta-main"
              style={{ width: "100%", height: "44px", borderRadius: "10px", border: "none", background: loading || otp.join("").length < 6 ? C.disabledBg : C.gold, color: loading || otp.join("").length < 6 ? C.disabledFg : "#1a1200", fontSize: "15px", fontWeight: "600", cursor: loading || otp.join("").length < 6 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "8px" }}>
              {loading ? <><Spinner/> Vérification…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Confirmer le code
              </>}
            </button>
            {!loading && otp.join("").length < 6 && (
              <p style={{ color: C.gray, fontSize: "12px", textAlign: "center", marginBottom: "6px" }}>Saisissez les 6 chiffres.</p>
            )}

            <div style={{ textAlign: "center", marginTop: "10px" }}>
              {resendTimer > 0 ? (
                <span style={{ color: C.gray, fontSize: "13px" }}>Renvoyer dans {resendTimer} s</span>
              ) : (
                <button onClick={handleSendOtp} disabled={loading} className="tap yelen-link" style={{ background: "none", border: "none", color: C.dark, fontSize: "13px", fontWeight: "500", cursor: "pointer" }}>
                  Renvoyer le code
                </button>
              )}
            </div>
            </div>
          </div>
        )}

        {/* ═══ STEP: TOTP (2FA) ═══ */}
        {step === "totp" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{ width: "68px", height: "68px", borderRadius: "20px", background: `linear-gradient(135deg, ${C.gold}20, ${C.gold}08)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: C.shadow }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h2 style={{ color: C.dark, fontSize: "22px", fontWeight: "900", marginBottom: "6px" }}>Double authentification</h2>
              <p style={{ color: C.gray, fontSize: "13px" }}>Ce compte a activé la 2FA — entrez le code de votre application d&apos;authentification.</p>
            </div>

            {error && <ErrorBanner msg={error}/>}

            {!totpBackupMode ? (
              <>
                <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "16px" }}>
                  {totpCode.map((d, i) => (
                    <input
                      key={i}
                      className="otp-inp"
                      ref={el => { totpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={e => handleTotpChange(i, e.target.value)}
                      onKeyDown={e => handleTotpKey(i, e)}
                      style={{ width: "52px", height: "62px", textAlign: "center", fontSize: "24px", fontWeight: "800", backgroundColor: d ? `${C.gold}12` : C.white, border: `2px solid ${d ? C.gold : C.border}`, borderRadius: "14px", color: C.dark, transition: "all 0.15s" }}
                    />
                  ))}
                </div>
                <div style={{ textAlign: "center", marginBottom: "18px" }}>
                  <button onClick={() => { setTotpBackupMode(true); setError(""); }} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Utiliser un code de secours</button>
                </div>
              </>
            ) : (
              <div style={{ marginBottom: "18px" }}>
                <input
                  className="inp"
                  type="text"
                  placeholder="XXXX-XXXX"
                  value={totpBackupCode}
                  onChange={e => setTotpBackupCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && handleTotpVerify()}
                  style={{ width: "100%", padding: "15px 16px", borderRadius: "14px", border: `1.5px solid ${C.border}`, backgroundColor: C.white, color: C.dark, fontSize: "18px", fontWeight: "700", letterSpacing: "3px", textAlign: "center", marginBottom: "12px" }}
                  autoFocus
                />
                <div style={{ textAlign: "center" }}>
                  <button onClick={() => { setTotpBackupMode(false); setTotpBackupCode(""); setError(""); }} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Utiliser l&apos;application d&apos;authentification</button>
                </div>
              </div>
            )}

            <button onClick={handleTotpVerify} disabled={loading || (totpBackupMode ? !totpBackupCode.trim() : totpCode.join("").length < 6)} className="tap cta-main"
              style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: loading || (totpBackupMode ? !totpBackupCode.trim() : totpCode.join("").length < 6) ? C.gray3 : `${C.gold}`, color: loading || (totpBackupMode ? !totpBackupCode.trim() : totpCode.join("").length < 6) ? C.gray : C.dark, fontSize: "16px", fontWeight: "800", cursor: loading || (totpBackupMode ? !totpBackupCode.trim() : totpCode.join("").length < 6) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: !loading ? `0 8px 24px ${C.gold}40` : "none", marginBottom: "14px" }}>
              {loading ? <><Spinner/> Vérification…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Vérifier
              </>}
            </button>

            <div style={{ textAlign: "center" }}>
              <button
                onClick={() => {
                  setTotpToken(""); setTotpCode(["","","","","",""]); setTotpBackupMode(false); setTotpBackupCode(""); setError("");
                  setStep(totpContext === "unlock" && remembered ? "unlock" : "phone");
                }}
                className="tap" style={{ background: "none", border: "none", color: C.gray, fontSize: "12.5px", fontWeight: "600", cursor: "pointer" }}>
                Annuler la connexion
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP: SETUP (configurer l'accès rapide) ═══ */}
        {step === "setup" && inst && (
          <div className="yelen-login-step-split" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="yelen-login-side">
              {/* Illustration réelle (même traitement que les étapes OTP/
                  Confirmer l'identité, retour Bryan 07/09/2026) — visible
                  uniquement à partir de 960px, sur la même ligne que le
                  titre plutôt qu'empilée au-dessus. */}
              <div className="yelen-login-illustration" style={{ display: "none", width: "100%", borderRadius: "20px", overflow: "hidden", marginBottom: "18px", border: `1px solid ${C.border}` }}>
                <Image src="/illustrations/configurer-acces-rapide.png" alt="Configuration de l'accès rapide par empreinte ou Face ID" width={1536} height={1024} style={{ width: "100%", height: "auto", display: "block" }} priority/>
              </div>
              <h2 className="yelen-login-title" style={{ color: C.dark, fontSize: "28px", fontWeight: "600", marginBottom: "6px" }}>Configurer l&apos;accès rapide</h2>
              <p style={{ color: C.dark2, fontSize: "14px", lineHeight: 1.5 }}>La prochaine fois, déverrouillez votre espace sans repasser par le SMS.</p>
              <p style={{ color: C.gray, fontSize: "12px", marginTop: "6px" }}>Étape 4 sur 4</p>
            </div>

            <div className="yelen-login-form">
            {error && <ErrorBanner msg={error}/>}

            {setupMode === "choice" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
                {webauthnSupported && (
                  <button onClick={handleSetupBiometric} disabled={loading} className="tap cta-main" style={ctaStyle(loading)}>
                    {loading ? <><Spinner/> Configuration…</> : <><FingerprintIcon color={loading ? C.gray : C.dark} size={18}/> Activer l&apos;empreinte ou le visage</>}
                  </button>
                )}
                <button onClick={() => { setSetupMode("pin"); setError(""); }} disabled={loading} className="tap" style={secondaryStyle}>
                  Définir un code de déverrouillage
                </button>
              </div>
            )}

            {setupMode === "pin" && (
              <div style={{ marginBottom: "10px" }}>
                <input
                  className="inp"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Nouveau code (4 à 8 chiffres)"
                  value={setupPin}
                  onChange={e => setSetupPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleSetupPin()}
                  style={{ width: "100%", padding: "15px 16px", borderRadius: "14px", border: `1.5px solid ${C.border}`, backgroundColor: C.white, color: C.dark, fontSize: "20px", fontWeight: "700", letterSpacing: "4px", textAlign: "center", marginBottom: "12px" }}
                  autoFocus
                />
                <button onClick={handleSetupPin} disabled={loading || setupPin.length < 4} className="tap cta-main" style={ctaStyle(loading || setupPin.length < 4)}>
                  {loading ? <><Spinner/> Enregistrement…</> : "Valider ce code"}
                </button>
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: "10px" }}>
              <button onClick={skipSetup} disabled={loading} className="tap yelen-link" style={{ background: "none", border: "none", color: C.dark2, fontSize: "14px", fontWeight: "500", cursor: "pointer", padding: "8px" }}>
                Plus tard
              </button>
            </div>
            </div>
          </div>
        )}

        {/* ═══ STEP: SUCCESS ═══ */}
        {step === "success" && (
          <div style={{ textAlign: "center", animation: "fadeUp 0.3s ease", padding: "40px 0" }}>
            {suspendedFlag ? (
              <>
                <div style={{ width: "80px", height: "80px", borderRadius: "24px", background: "#D6283915", border: "2px solid #D62839", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "successPop 0.5s ease" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D62839" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <h2 style={{ color: C.dark, fontSize: "22px", fontWeight: "900", marginBottom: "8px" }}>Connexion réussie — établissement suspendu</h2>
                <p style={{ color: C.gray, fontSize: "13.5px", lineHeight: 1.6, maxWidth: "320px", margin: "0 auto" }}>
                  Votre établissement est actuellement suspendu par l&apos;équipe Yelen224. Vous allez être redirigé vers l&apos;écran &quot;Espace suspendu&quot; pour comprendre pourquoi et demander une révision.
                </p>
              </>
            ) : (
              <>
                <div style={{ width: "80px", height: "80px", borderRadius: "24px", background: `${C.gold}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "successPop 0.5s ease", boxShadow: `0 12px 32px ${C.gold}50` }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h2 style={{ color: C.dark, fontSize: "24px", fontWeight: "900", marginBottom: "8px" }}>Connexion réussie !</h2>
                <p style={{ color: C.gray, fontSize: "14px" }}>Redirection vers votre dashboard…</p>
              </>
            )}
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
              <YelenLoader size={24} color={suspendedFlag ? "#D62839" : C.gold}/>
            </div>
          </div>
        )}

        {step === "deletion-pending" && deletionInfo && (
          <div style={{ animation: "fadeUp 0.3s ease", padding: "12px 0" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "20px", backgroundColor: C.redL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </div>
            <h2 style={{ color: C.dark, fontSize: "20px", fontWeight: "900", textAlign: "center", marginBottom: "8px" }}>Suppression de compte en cours</h2>
            <p style={{ color: C.gray, fontSize: "13px", textAlign: "center", lineHeight: 1.6, marginBottom: "20px" }}>
              Votre compte sera définitivement supprimé le{" "}
              <strong style={{ color: C.dark }}>{new Date(deletionInfo.scheduled_purge_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong>.
              Vous pouvez annuler à tout moment avant cette date.
            </p>
            {error && (
              <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "12px", padding: "10px 14px", marginBottom: "14px", color: C.red, fontSize: "12px", fontWeight: "700", textAlign: "center" }}>{error}</div>
            )}
            <button onClick={cancelDeletionAndEnter} disabled={cancelLoading} className="tap" style={{ width: "100%", background: `${C.gold}`, color: C.dark, fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px", border: "none", cursor: "pointer", marginBottom: "10px" }}>
              {cancelLoading ? "..." : "Annuler la suppression et continuer"}
            </button>
            <button
              onClick={async () => {
                // Le cookie de session posé par la connexion qui vient de réussir n'a
                // pas lieu de rester actif si l'institution ne veut pas annuler la
                // suppression maintenant — sinon une URL directe vers le dashboard
                // suffirait à contourner cet écran.
                try { await fetch("/api/institution/auth/logout", { method: "POST" }) } catch {}
                setStep("phone"); setDeletionInfo(null); setPendingLogin(null);
              }}
              className="tap"
              style={{ width: "100%", background: "none", border: "none", color: C.gray, fontSize: "12px", fontWeight: "700", padding: "8px", cursor: "pointer" }}
            >
              Ne pas annuler pour l&apos;instant
            </button>
          </div>
        )}
        </>
        )}
        </div>

          {/* Liens légaux — dans la carte, façon Google Sign-in, plutôt
              qu'une barre de pied de page séparée (retour Bryan 07/09/2026). */}
          <div className="yelen-login-legal">
            <span>© {new Date().getFullYear()} Yelen224</span>
            <Link href="/confidentialite">Confidentialité</Link>
            <Link href="/cgu">CGU</Link>
            <Link href="/contact">Contact</Link>
          </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function InstitutionConnexion() {
  return (
    <Suspense fallback={
      <div style={{ height: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFBEB" }}>
        <YelenLoader size={32}/>
      </div>
    }>
      <InstitutionConnexionInner/>
    </Suspense>
  );
}
