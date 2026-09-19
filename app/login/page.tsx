
"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { isWebAuthnSupported, authenticateBiometrie } from "@/lib/auth/citoyenBiometrie";
import { YelenLoader } from "@/components/YelenLoader";
import { validerFormatPhoneGuinee, normaliserChiffresPhone, versE164Guinee, filtrerSaisiePhone, masquerPhoneGuinee } from "@/lib/phoneGuinee";
import { AuthSecurityBlockedScreen } from "@/components/security/AuthSecurityBlockedScreen";

// Identité mémorisée (Se souvenir de moi) — façon Capital One, retour CEO
// 23/07/2026 : ne stocke jamais de secret, seulement de quoi reconnaître
// l'appareil (userId/nom/téléphone) pour sauter le numéro + la question de
// sécurité au retour. L'authentification réelle (OTP ou biométrie) reste
// systématiquement requise.
const YELEN224_REMEMBERED_KEY = "yelen224_remembered_login";

// ─── Anti-bot : questions mathématiques + logiques ────────────────────────────
const CHALLENGES = [
  { q: "Combien font 7 + 5 ?", a: "12", type: "math" },
  { q: "Combien font 13 - 6 ?", a: "7", type: "math" },
  { q: "Combien font 4 × 3 ?", a: "12", type: "math" },
  { q: "Combien font 18 ÷ 2 ?", a: "9", type: "math" },
  { q: "Quel est le résultat de 8 + 7 - 3 ?", a: "12", type: "math" },
  { q: "Quelle est la couleur du ciel par temps clair ?", a: "bleu", type: "logic" },
  { q: "Combien de jours y a-t-il dans une semaine ?", a: "7", type: "logic" },
  { q: "Combien font 6 × 4 ÷ 3 ?", a: "8", type: "math" },
  { q: "Combien font 25 - 18 + 4 ?", a: "11", type: "math" },
  { q: "Quel nombre vient après 99 ?", a: "100", type: "logic" },
];

// ─── Honeypot invisible ───────────────────────────────────────────────────────
// Un champ caché — si rempli → bot détecté

// Message générique pour l'état bloqué/support_only, piloté par le
// serveur (chantier Auth Security 28/08/2026, voir
// lib/security/authSecurity.ts) — utilisé uniquement pour la garde locale
// avant l'envoi d'une requête ; le message affiché après une vraie
// réponse serveur vient toujours de json.error.
function messageBlocageActuel(state: "blocked" | "support_only", retryAfterS: number): string {
  if (state === "support_only") return "Contactez le support pour réactiver la connexion sur cet appareil.";
  return retryAfterS > 0 ? `Accès temporairement protégé. Réessayez dans ${retryAfterS}s.` : "Accès temporairement protégé. Réessayez dans un instant.";
}

// useSearchParams() exige une frontière Suspense en App Router (voir le
// meme correctif applique a app/institution/connexion/page.tsx le 22/07/2026
// - meme bug, jamais detecte avant faute de build Netlify recent).
function LoginCitoyenInner() {
  const router  = useRouter();
  const searchParams = useSearchParams();
  const [loggedOut, setLoggedOut] = useState(searchParams.get("logged_out") === "1");
  const [sessionExpired, setSessionExpired] = useState(searchParams.get("session_expired") === "1");
  // Demande de récupération de compte déjà en cours (retour Bryan
  // 09/08/2026) — trace locale posée par recuperation-client.tsx à
  // l'envoi, aucune session possible sur cet écran pour le savoir
  // autrement. But : éviter qu'un citoyen soumette une 2e demande en
  // double faute de le savoir.
  const [recoveryPending, setRecoveryPending] = useState<{ phone: string; submittedAt: number } | null>(null);
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  const [step, setStep]       = useState<"phone" | "otp" | "remembered" | "totp">("phone");
  const [phone, setPhone]     = useState("");
  const phoneDigitsNormalized = normaliserChiffresPhone(phone);
  const phoneValidation = validerFormatPhoneGuinee(phone);
  const phoneErreurVisible = phoneValidation.code === "prefixe_inconnu" || phoneValidation.code === "caracteres_invalides";
  const [userId, setUserId]   = useState("");
  const [userName, setUserName] = useState("");
  const [code, setCode]       = useState(["","","","","",""]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false); // micro-animation avant redirection
  const [error, setError]     = useState("");
  // Fermeture locale de l'avertissement "tentatives détectées" — n'affecte
  // jamais securityState (qui reste la seule source de vérité côté
  // sécurité), seulement l'affichage du bandeau.
  const [avertissementFerme, setAvertissementFerme] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  // 2FA TOTP (chantier sécurité citoyen, 25/07/2026) — jeton de défi émis
  // par /api/citoyen/auth/verify ou .../webauthn/auth-verify quand
  // totp_enabled est vrai ; consommé par /api/citoyen/auth/totp/login-verify.
  const [totpToken, setTotpToken] = useState("");
  const [totpCode, setTotpCode]   = useState(["","","","","",""]);
  const [totpBackupMode, setTotpBackupMode] = useState(false);
  const [totpBackupCode, setTotpBackupCode] = useState("");
  const totpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Anti-bot
  const [challenge, setChallenge]   = useState(CHALLENGES[0]);
  const [chalAnswer, setChalAnswer] = useState("");
  const [chalValid, setChalValid]   = useState(false);
  const [honeypot, setHoneypot]     = useState(""); // doit rester vide
  // État anti-abus piloté par le serveur (chantier Auth Security
  // 28/08/2026) — remplace l'ancien compteur cosmétique local (remis à
  // zéro au moindre remount, donc jamais une vraie protection). Alimenté
  // par le champ `security` renvoyé par /api/citoyen/auth/{lookup,verify}.
  const [securityState, setSecurityState] = useState<"normal" | "warning" | "blocked" | "support_only">("normal");
  const [securityRetryAfterS, setSecurityRetryAfterS] = useState(0);
  // État terminal : le serveur a déjà répondu "aucun compte" pour ce
  // numéro — plus aucune requête identique tant que le numéro n'est pas
  // modifié (brief : "empêcher les requêtes répétitives identiques").
  const [notFoundTerminal, setNotFoundTerminal] = useState(false);
  const [typeSpeed, setTypeSpeed]   = useState<number[]>([]); // vitesse frappe
  const lastKeyTime = useRef<number>(0);

  // OTP refs
  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Identité mémorisée — écran "Bon retour" façon Capital One si présente,
  // sinon formulaire numéro complet (avec question de sécurité) inchangé.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(YELEN224_REMEMBERED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { userId: string; userName: string; phone: string };
        if (parsed?.userId) {
          setUserId(parsed.userId);
          setUserName(parsed.userName || "Citoyen");
          setPhone(parsed.phone || "");
          setStep("remembered");
        }
      }
      setBioAvailable(isWebAuthnSupported() && localStorage.getItem("yelen224_bio_registered") === "1");
      const recRaw = localStorage.getItem("yelen224_recuperation_pending");
      if (recRaw) {
        const parsed = JSON.parse(recRaw) as { phone: string; submittedAt: number };
        if (parsed?.phone && parsed?.submittedAt) setRecoveryPending(parsed);
      }
    } catch {}
  }, []);

  const dismissRecoveryPending = () => {
    try { localStorage.removeItem("yelen224_recuperation_pending"); } catch {}
    setRecoveryPending(null);
  };

  // Init challenge aléatoire
  useEffect(() => {
    const idx = Math.floor(Math.random() * CHALLENGES.length);
    setChallenge(CHALLENGES[idx]);
  }, []);

  // Bannières post-déconnexion / session expirée — auto-disparition
  useEffect(() => {
    if (!loggedOut) return;
    const t = setTimeout(() => setLoggedOut(false), 4500);
    return () => clearTimeout(t);
  }, [loggedOut]);
  useEffect(() => {
    if (!sessionExpired) return;
    const t = setTimeout(() => setSessionExpired(false), 4500);
    return () => clearTimeout(t);
  }, [sessionExpired]);

  // Validation challenge (insensible à la casse pour les réponses texte)
  useEffect(() => {
    const norm = chalAnswer.trim().toLowerCase();
    setChalValid(norm === challenge.a.toLowerCase());
  }, [chalAnswer, challenge]);

  // Décompte visuel du blocage — purement informatif : la porte réelle
  // reste vérifiée par le serveur à la prochaine requête, ce timer ne
  // fait que refléter retryAfterS renvoyé par l'API.
  useEffect(() => {
    if (securityState !== "blocked" || securityRetryAfterS <= 0) return;
    const t = setTimeout(() => setSecurityRetryAfterS(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [securityState, securityRetryAfterS]);

  // Scroll header
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Détection vitesse frappe (bots tapent uniformément)
  const onKeyTyped = useCallback(() => {
    const now = Date.now();
    if (lastKeyTime.current) {
      const delta = now - lastKeyTime.current;
      setTypeSpeed(s => [...s.slice(-10), delta]);
    }
    lastKeyTime.current = now;
  }, []);

  // Est-ce que la vitesse de frappe est humaine ?
  const isBotTyping = useCallback(() => {
    if (typeSpeed.length < 4) return false;
    const diffs = typeSpeed.map((v, i) => i > 0 ? Math.abs(v - typeSpeed[i-1]) : 0).slice(1);
    const variance = diffs.reduce((a,b) => a + b, 0) / diffs.length;
    return variance < 10; // variance < 10ms = robot (trop régulier)
  }, [typeSpeed]);

  // ── Étape 1 ─────────────────────────────────────────────────────────────────
  const handlePhone = async () => {
    if (loading) return; // garde anti double-clic
    setError("");

    // Honeypot
    if (honeypot) { await new Promise(r => setTimeout(r, 2000)); router.push("/"); return; }
    // Bot comportemental (vitesse de frappe)
    if (isBotTyping()) { setError("Un souci est survenu pendant votre saisie. Réessayez tranquillement."); return; }

    if (securityState === "blocked" || securityState === "support_only") { setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }
    if (notFoundTerminal) return; // état terminal — rien à renvoyer tant que le numéro n'a pas changé
    if (!chalValid) { setError("Merci de répondre correctement à la question de sécurité."); return; }

    if (!phoneValidation.valide) { setError(phoneValidation.message || "Ce numéro ne semble pas valide. Vérifiez-le et réessayez."); return; }

    const fullPhone = versE164Guinee(phoneDigitsNormalized);
    setLoading(true);

    try {
      const res = await fetch("/api/citoyen/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const json = await res.json();

      if (json.security?.state) { setSecurityState(json.security.state); setSecurityRetryAfterS(json.security.retryAfterS || 0); }

      if (res.status === 423) {
        setError(json.error || "Accès temporairement protégé.");
        setLoading(false);
        return;
      }

      if (!res.ok || !json.success) {
        // Réponse définitive du serveur ("aucun compte trouvé") — état
        // terminal (brief : le frontend ne doit plus renvoyer la même
        // requête après cette réponse). Modifier le numéro réarme le
        // formulaire, voir l'onChange du champ téléphone plus bas.
        setNotFoundTerminal(true);
        setError("Nous n'avons trouvé aucun compte avec ce numéro.");
        setLoading(false);
        return;
      }

      const displayName = json.user.prenom ? `${json.user.prenom} ${json.user.nom || ""}`.trim() : "Citoyen";
      setUserId(String(json.user.id));
      setUserName(displayName);
      localStorage.setItem("yelen_login_phone", fullPhone);
      setStep("otp");

      // Nouveau challenge pour OTP
      const idx = Math.floor(Math.random() * CHALLENGES.length);
      setChallenge(CHALLENGES[idx]);
      setChalAnswer("");
      setTimeout(() => otpRefs[0].current?.focus(), 300);
    } catch { setError("Un problème de connexion est survenu. Réessayez."); }
    finally { setLoading(false); }
  };

  // Finalise réellement la session (redeem du tokenHash émis par
  // /api/citoyen/auth/verify, .../webauthn/auth-verify ou, si la 2FA TOTP
  // est activée, .../auth/totp/login-verify — les trois renvoient la même
  // forme). Centralisé ici (chantier 2FA TOTP, 25/07/2026) pour n'avoir
  // qu'une seule implémentation du "se souvenir de moi" + redirection.
  const finaliserConnexion = useCallback(async (uid: string, tokenHash: string): Promise<boolean> => {
    const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (sessionError) {
      setError("Nous n'avons pas pu sécuriser votre connexion. Réessayez.");
      return false;
    }

    localStorage.removeItem("yelen_login_phone");
    localStorage.setItem(YELEN224_USER_ID_KEY, uid);

    // Se souvenir de moi — mémorise seulement l'identité (jamais un
    // secret) pour sauter le numéro + la question de sécurité au retour.
    try {
      if (rememberMe) {
        localStorage.setItem(YELEN224_REMEMBERED_KEY, JSON.stringify({ userId: uid, userName, phone }));
      } else {
        localStorage.removeItem(YELEN224_REMEMBERED_KEY);
      }
    } catch {}

    // Micro-animation de succès avant redirection (retour CEO 23/07/2026)
    setSuccess(true);
    await new Promise(r => setTimeout(r, 550));

    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    router.push(redirect ? decodeURIComponent(redirect) : "/");
    return true;
  }, [rememberMe, userName, phone, router]);

  // ── Étape 2 OTP ─────────────────────────────────────────────────────────────
  // Vérification 100% serveur (retour Bryan 25/07/2026) — l'ancienne
  // comparaison client à "123456" est retirée : elle n'empêchait rien (le
  // vrai code circulait déjà en clair dans le bundle JS) et n'était qu'un
  // doublon de la vérification serveur, seule source de vérité réelle.
  const handleVerify = async () => {
    if (loading) return; // garde anti double-clic
    setError("");
    if (securityState === "blocked" || securityState === "support_only") { setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }
    if (honeypot) { await new Promise(r => setTimeout(r, 2000)); return; }

    const entered = code.join("");
    // Le bouton reste désactivé tant que les 6 chiffres ne sont pas saisis —
    // ce garde-fou ne fait plus qu'ignorer un Entrée prématuré, sans message
    // (retour Bryan 09/08/2026 : bandeau perçu comme "faux").
    if (entered.length < 6) return;

    setLoading(true);
    try {
      const storedPhone = localStorage.getItem("yelen_login_phone");
      const res = await fetch("/api/citoyen/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: storedPhone, code: entered }),
      });
      const json = await res.json();

      if (json.security?.state) { setSecurityState(json.security.state); setSecurityRetryAfterS(json.security.retryAfterS || 0); }

      if (res.status === 423) {
        setError(json.error || "Accès temporairement protégé.");
        setCode(["","","","","",""]);
        return;
      }

      if (!res.ok) {
        // Une seule tentative par code (consommé côté serveur qu'il soit
        // juste ou faux, voir lib/auth/otp.ts) — on ramène directement à
        // l'étape numéro plutôt que de laisser ressaisir un code déjà mort.
        if (json.code === "INVALID_CODE") {
          setError(`${json.error} Retournez à l'étape précédente pour recevoir un nouveau code.`);
          setCode(["","","","","",""]);
          return;
        }
        setError(json.error || "Nous n'avons trouvé aucun compte correspondant.");
        return;
      }

      // 2FA TOTP (chantier sécurité citoyen, 25/07/2026) — l'OTP téléphone
      // vient de réussir, mais la session n'est pas encore établie.
      if (json.requiresTotp) {
        setTotpToken(json.totpToken);
        setTotpCode(["","","","","",""]);
        setTotpBackupMode(false);
        setTotpBackupCode("");
        setStep("totp");
        setTimeout(() => totpRefs[0].current?.focus(), 300);
        return;
      }

      if (!json.success || !json.tokenHash) {
        setError("Nous n'avons pas pu sécuriser votre connexion. Réessayez.");
        return;
      }
      await finaliserConnexion(json.userId, json.tokenHash);
    } catch { setError("Un problème de connexion est survenu. Réessayez."); }
    finally { setLoading(false); }
  };

  // ── Écran "Bon retour" (identité mémorisée) ─────────────────────────────────
  const handleBioAuth = async () => {
    if (bioLoading) return; // garde anti double-clic
    setError("");
    setBioLoading(true);
    try {
      const result = await authenticateBiometrie(userId);

      if (!result.ok && result.requiresTotp) {
        setTotpToken(result.totpToken);
        setTotpCode(["","","","","",""]);
        setTotpBackupMode(false);
        setTotpBackupCode("");
        setBioLoading(false);
        setStep("totp");
        setTimeout(() => totpRefs[0].current?.focus(), 300);
        return;
      }
      if (!result.ok) { setError("La biométrie n'a pas fonctionné cette fois. Utilisez le code reçu par SMS."); setBioLoading(false); return; }

      localStorage.setItem(YELEN224_USER_ID_KEY, userId);
      setSuccess(true);
      await new Promise(r => setTimeout(r, 550));
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      router.push(redirect ? decodeURIComponent(redirect) : "/");
    } catch {
      setError("Un problème de connexion est survenu. Réessayez.");
      setBioLoading(false);
    }
  };

  // ── Étape 2FA TOTP ───────────────────────────────────────────────────────────
  const handleTotpVerify = async () => {
    if (loading) return; // garde anti double-clic
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
      const res = await fetch("/api/citoyen/auth/totp/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpToken, code: entered }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.tokenHash) {
        setError(json?.error || "Ce code ne semble pas correct.");
        setTotpCode(["","","","","",""]);
        setTimeout(() => totpRefs[0].current?.focus(), 100);
        return;
      }
      await finaliserConnexion(json.userId, json.tokenHash);
    } catch { setError("Un problème de connexion est survenu. Réessayez."); }
    finally { setLoading(false); }
  };

  const handleTotpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n = [...totpCode]; n[i] = val.slice(-1); setTotpCode(n);
    if (val && i < 5) totpRefs[i+1].current?.focus();
    if (n.join("").length === 6) setTimeout(handleTotpVerify, 200);
  };

  const handleTotpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !totpCode[i] && i > 0) { totpRefs[i-1].current?.focus(); }
    if (e.key === "Enter") handleTotpVerify();
  };

  // Collage/autofill du code (retour Bryan 03/09/2026 : "bon code refusé")
  // — chaque case a `maxLength={1}`, donc coller "123456" (ou "123 456",
  // format d'affichage de Google Authenticator) s'y tronquait nativement à
  // un seul caractère AVANT même que handleTotpChange ne s'exécute : le
  // citoyen collait le bon code, la case n'en gardait qu'un chiffre, et la
  // vérification échouait sans qu'il comprenne pourquoi. preventDefault
  // court-circuite le collage natif pour répartir nous-mêmes chaque chiffre
  // (espaces/tirets retirés) sur les cases à partir du point de collage.
  const handleTotpPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const chiffres = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!chiffres) return;
    e.preventDefault();
    const n = [...totpCode];
    for (let k = 0; k < chiffres.length && i + k < 6; k++) n[i + k] = chiffres[k];
    setTotpCode(n);
    totpRefs[Math.min(i + chiffres.length, 5)].current?.focus();
    if (n.join("").length === 6) setTimeout(handleTotpVerify, 200);
  };

  // Numéro déjà connu (identité mémorisée) — saute directement à l'OTP,
  // sans redemander la question de sécurité (décision CEO 23/07/2026 :
  // elle ne sert qu'à filtrer une saisie "à froid" d'un numéro quelconque).
  // Doit tout de même appeler lookup pour générer un vrai code côté serveur
  // et renseigner yelen_login_phone (retour Bryan 25/07/2026 : ce chemin
  // sautait droit à l'OTP sans jamais le faire, échec systématique depuis
  // le passage au vrai OTP — "Numéro de téléphone invalide" venait du
  // numéro jamais stocké correctement pour cette étape).
  const handleQuickSms = async () => {
    setError("");
    if (securityState === "blocked" || securityState === "support_only") { setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }
    setCode(["","","","","",""]);
    const fullPhone = versE164Guinee(normaliserChiffresPhone(phone));
    setLoading(true);
    try {
      const res = await fetch("/api/citoyen/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const json = await res.json();
      if (json.security?.state) { setSecurityState(json.security.state); setSecurityRetryAfterS(json.security.retryAfterS || 0); }
      if (res.status === 423) { setError(json.error || "Accès temporairement protégé."); return; }
      if (!res.ok || !json.success) { setError("Nous n'avons pas pu envoyer de code pour ce compte. Réessayez."); return; }
      localStorage.setItem("yelen_login_phone", fullPhone);
      setStep("otp");
      setTimeout(() => otpRefs[0].current?.focus(), 300);
    } catch { setError("Un problème de connexion est survenu. Réessayez."); }
    finally { setLoading(false); }
  };

  const handleSwitchAccount = () => {
    try { localStorage.removeItem(YELEN224_REMEMBERED_KEY); } catch {}
    setUserId(""); setUserName(""); setPhone("");
    setError("");
    setStep("phone");
  };

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n = [...code]; n[i] = val.slice(-1); setCode(n);
    if (val && i < 5) otpRefs[i+1].current?.focus();
    if (n.join("").length === 6) setTimeout(handleVerify, 200);
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) { otpRefs[i-1].current?.focus(); }
    if (e.key === "Enter") handleVerify();
  };

  // Tokens
  const inputBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBrd = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const txt1 = isDark ? "#ffffff" : "#0d0d1a";
  const txt2 = isDark ? "#8E8E93" : "#6C6C70";
  const txt3 = isDark ? "#444" : "#bbb";
  // Bandeaux d'erreur — rouge dédié, plus le doré Yelen (retour Bryan
  // 09/08/2026 : le doré doit rester la couleur de marque/action, jamais
  // un signal d'erreur).
  const errBg   = isDark ? "rgba(239,68,68,0.14)" : "#FEE2E2";
  const errBrd  = "#ef4444";
  const bloque  = securityState === "blocked" || securityState === "support_only";
  const errText = isDark ? "#FCA5A5" : "#991B1B";

  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif", overflowX: "hidden" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        @keyframes popIn{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        input::placeholder{color:${txt3}}
        input:focus{border-color:${isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"}!important;outline:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        .otp-input:focus{border-color:${isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"}!important}
        .error-shake{animation:shake 0.4s ease}
        .pop-in{animation:popIn 0.35s cubic-bezier(0.34,1.56,0.64,1)}
        .step-in{animation:fadeUp 0.3s ease}
      `}</style>

      {/* ── HEADER TIKTOK YELEN ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        backgroundColor: scrolled ? (isDark ? "rgba(8,8,15,0.97)" : "rgba(248,248,251,0.97)") : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? `1px solid ${isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)"}` : "none",
        transition: "all 0.3s",
        paddingTop: "calc(12px + env(safe-area-inset-top))", paddingBottom: "12px", paddingLeft: "20px", paddingRight: "20px",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
      }}>
        <Link href="/inscription" style={{ color: "#080812", fontSize: "13px", fontWeight: "800", textDecoration: "none", padding: "7px 14px", borderRadius: "20px", background: "#F5A623", border: "none" }} className="tap">
          S&apos;inscrire
        </Link>
      </header>

      {/* ── HERO JAUNE ── */}
      <div style={{ height: "220px", background: "#F5A623", position: "relative", overflow: "hidden" }}>
        {/* Drapeau */}
        <div style={{ position: "absolute", top: "16px", right: "20px", display: "flex", opacity: 0.4 }}>
          <div style={{ width: "9px", height: "16px", background: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
          <div style={{ width: "9px", height: "16px", background: "#FCD20F" }}/>
          <div style={{ width: "9px", height: "16px", background: "#009A44", borderRadius: "0 2px 2px 0" }}/>
        </div>
        <div style={{ position: "absolute", bottom: "28px", left: "24px", right: "24px" }}>
          <div style={{ color: "rgba(0,0,0,0.55)", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "5px" }}>
            {bloque ? "Sécurité" : step === "phone" ? "Espace citoyen" : step === "remembered" ? "Espace citoyen" : "Vérification"}
          </div>
          <h1 style={{ color: "#080812", fontSize: "26px", fontWeight: "900", margin: "0 0 4px", lineHeight: 1.15, letterSpacing: "-0.5px" }}>
            {bloque ? "Accès protégé" : step === "phone" ? "Bienvenue" : step === "remembered" ? "Bon retour" : step === "totp" ? "Double authentification" : "Saisissez le code"}
          </h1>
          {/* Sous-titre masqué en blocage — AuthSecurityBlockedScreen
              ci-dessous répète déjà toute l'explication en détail, un
              sous-titre générique ("Envoyé au...") serait à la fois
              redondant et faux (le code n'a plus cours pendant le blocage). */}
          {!bloque && (
            <div style={{ color: "rgba(0,0,0,0.6)", fontSize: "14px", fontWeight: "600" }}>
              {step === "phone" ? "Connectez-vous à votre compte." : step === "remembered" ? `${userName.split(" ")[0]}, ravi de vous revoir.` : step === "totp" ? "Entrez le code de votre application d'authentification." : `Un code SMS a été envoyé au ${masquerPhoneGuinee(phone)}.`}
            </div>
          )}
        </div>
      </div>

      {/* ── FORMULAIRE ── */}
      <div style={{ flex: "1", display: "flex", flexDirection: "column", padding: "24px 20px 40px", maxWidth: "480px", width: "100%", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>

        {/* État BLOCKED/SUPPORT_ONLY : remplace tout le formulaire — aucun
            contournement possible en changeant d'étape (brief : "aucune
            possibilité de contourner le blocage en revenant en arrière"). */}
        {(securityState === "blocked" || securityState === "support_only") ? (
          <AuthSecurityBlockedScreen state={securityState} retryAfterS={securityRetryAfterS} dark={isDark} onExpire={() => setSecurityState("normal")} />
        ) : (
        <>
        {recoveryPending && (step === "phone" || step === "remembered") && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", backgroundColor: "transparent", border: "1px solid rgba(245,166,35,0.25)", borderLeft: "3px solid #F5A623", borderRadius: "12px", marginBottom: "18px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: txt1, fontSize: "12.5px", fontWeight: "700", lineHeight: 1.5 }}>
                Une demande de récupération pour {recoveryPending.phone} est déjà en cours (envoyée le {new Date(recoveryPending.submittedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}). Inutile d&apos;en soumettre une nouvelle — un admin la traite sous 48h.
              </div>
            </div>
            <button onClick={dismissRecoveryPending} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: txt2, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {loggedOut && step === "phone" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: isDark ? "rgba(22,163,74,0.12)" : "#DCFCE7", border: "1px solid #16A34A", borderLeft: "3px solid #16A34A", borderRadius: "12px", marginBottom: "18px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ color: "#15803D", fontSize: "13px", fontWeight: "700" }}>Vous avez été déconnecté avec succès</span>
          </div>
        )}
        {sessionExpired && step === "phone" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", marginBottom: "18px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span style={{ color: errText, fontSize: "13px", fontWeight: "700", flex: 1 }}>Votre session est arrivée à expiration pour protéger votre compte. Reconnectez-vous pour continuer.</span>
            <button onClick={() => setSessionExpired(false)} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: errText, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {step === "remembered" && (
          <div key="remembered" className="step-in">
            <div style={{ marginBottom: "22px" }}>
              <div style={{ color: txt1, fontSize: "19px", fontWeight: "900", marginBottom: "4px" }}>Bon retour, {userName.split(" ")[0]}</div>
              <div style={{ color: txt2, fontSize: "13px" }}>{masquerPhoneGuinee(phone)}</div>
            </div>

            {error && (
              <div className="error-shake" style={{ background: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                <span style={{ color: errText, fontSize: "13px", fontWeight: "600", flex: 1 }}>{error}</span>
                <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: errText, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {bioAvailable && (
              <button onClick={handleBioAuth} disabled={bioLoading} className="tap" style={{
                width: "100%", padding: "16px",
                background: success ? "#22c55e" : "#F5A623",
                color: success ? "#fff" : "#080812",
                border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "800",
                cursor: bioLoading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                marginBottom: "10px", transition: "background 0.25s",
              }}>
                {success
                  ? <><svg className="pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Connecté !</>
                  : bioLoading
                  ? <><YelenLoader size={16} color="#080812"/> Vérification…</>
                  : <>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M8 11a4 4 0 0 0 8 0"/><path d="M12 18v4"/><path d="M4 15.5A9 9 0 0 0 20 15"/></svg>
                      Connexion rapide
                    </>
                }
              </button>
            )}

            <button onClick={handleQuickSms} disabled={loading} className="tap" style={{
              width: "100%", padding: "16px",
              background: bioAvailable ? "transparent" : "#F5A623",
              color: bioAvailable ? txt1 : "#080812",
              border: bioAvailable ? `1px solid ${inputBrd}` : "none",
              borderRadius: "16px", fontSize: "15px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "20px", opacity: loading ? 0.7 : 1,
            }}>
              {loading
                ? <><YelenLoader size={16} color="#080812"/> Envoi…</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17v-.08z"/></svg>
                    Recevoir le code SMS
                  </>
              }
            </button>

            <div style={{ textAlign: "center" }}>
              <button onClick={handleSwitchAccount} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Utiliser un autre numéro</button>
            </div>

            <Image src="/illustrations/login-bon-retour.png" alt="" width={969} height={1469} style={{ width: "180px", maxWidth: "100%", height: "auto", margin: "28px auto 0", display: "block" }}/>
          </div>
        )}

        {step === "phone" && (
          <div key="phone" className="step-in">
            {/* Téléphone */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Numéro de téléphone</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "14px 14px", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F5A623" }}/>
                  <span style={{ color: "#F5A623", fontSize: "14px", fontWeight: "800" }}>+224</span>
                </div>
                <input
                  type="tel"
                  placeholder="620 000 000"
                  value={phone}
                  onChange={e => {
                    const raw = filtrerSaisiePhone(e.target.value);
                    // Plafond à 10 chiffres : 9 chiffres réels + 1 "0" initial toléré.
                    if (raw.replace(/\s/g, "").length <= 10) setPhone(raw);
                    // Modifier le numéro réarme le formulaire après une
                    // réponse terminale "aucun compte trouvé" (brief :
                    // aucune nouvelle requête identique tant que la saisie
                    // n'a pas changé).
                    if (notFoundTerminal) { setNotFoundTerminal(false); setError(""); }
                    onKeyTyped();
                  }}
                  onKeyDown={e => { onKeyTyped(); if (e.key === "Enter") handlePhone(); }}
                  style={{ flex: 1, background: inputBg, border: `1px solid ${phoneErreurVisible ? errBrd : inputBrd}`, borderRadius: "14px", padding: "14px 16px", color: txt1, fontSize: "16px", fontWeight: "600", letterSpacing: "1px", transition: "border-color 0.2s" }}
                  autoFocus
                />
              </div>
              <p style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "5px", color: phoneErreurVisible ? errBrd : (phoneValidation.valide ? "#F5A623" : txt2), fontSize: "11px", marginTop: "6px", fontWeight: "600" }}>
                {phoneErreurVisible ? phoneValidation.message : (phoneValidation.valide ? "Numéro valide" : `${phoneDigitsNormalized.length} / 9 chiffres`)}
              </p>
            </div>

            {/* Challenge anti-bot */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Vérification de sécurité</div>
              <div style={{ background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: txt2 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "2px" }}>Question de sécurité</div>
                    <div style={{ color: txt1, fontSize: "14px", fontWeight: "700" }}>{challenge.q}</div>
                  </div>
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={challenge.type === "math" ? "number" : "text"}
                  placeholder="Votre réponse…"
                  value={chalAnswer}
                  onChange={e => { setChalAnswer(e.target.value); onKeyTyped(); }}
                  style={{ width: "100%", background: inputBg, border: `1px solid ${chalValid ? "rgba(245,166,35,0.4)" : inputBrd}`, borderRadius: "14px", padding: "13px 46px 13px 16px", color: txt1, fontSize: "15px", transition: "border-color 0.2s" }}
                />
                <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)" }}>
                  {chalValid
                    ? <svg key="valid" className="pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={txt3} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  }
                </div>
              </div>
            </div>

            {/* Honeypot invisible pour robots */}
            <div style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
              <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} name="website" />
            </div>

            {/* Erreur */}
            {error && (
              <div className="error-shake" style={{ background: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                <span style={{ color: errText, fontSize: "13px", fontWeight: "600", flex: 1 }}>{error}</span>
                <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: errText, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {/* Se souvenir de moi */}
            <div onClick={() => setRememberMe(v => !v)} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 2px", marginBottom: "16px", cursor: "pointer" }}>
              <span style={{ color: txt1, fontSize: "13.5px", fontWeight: "600" }}>Se souvenir de moi</span>
              <div style={{ width: "42px", height: "24px", borderRadius: "12px", background: rememberMe ? "#F5A623" : inputBrd, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: "2px", left: rememberMe ? "20px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}/>
              </div>
            </div>

            {/* CTA — état terminal "aucun compte trouvé" : le bouton
                d'envoi est remplacé par l'action pertinente (brief :
                "proposer l'action pertinente Créer un compte"), jamais
                laissé cliquable pour rejouer la même requête. */}
            {notFoundTerminal ? (
              <Link href="/inscription" className="tap" style={{
                width: "100%", padding: "16px", background: "#F5A623", color: "#080812",
                border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "800",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                marginBottom: "14px", textDecoration: "none",
              }}>
                Créer un compte
              </Link>
            ) : (
              <button onClick={handlePhone} disabled={loading || !chalValid || !phoneValidation.valide} className="tap" style={{
                width: "100%", padding: "16px",
                background: loading || !chalValid || !phoneValidation.valide
                  ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)")
                  : "#F5A623",
                color: loading || !chalValid || !phoneValidation.valide ? txt2 : "#080812",
                border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "800",
                cursor: loading || !chalValid || !phoneValidation.valide ? "not-allowed" : "pointer",
                transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                marginBottom: "14px",
              }}>
                {loading
                  ? <><YelenLoader size={16} color="#080812"/> Envoi…</>
                  : <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17v-.08z"/></svg>
                      Recevoir le code SMS
                    </>
                }
              </button>
            )}

            {/* Sécurité */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "12px", marginBottom: "20px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={txt2} strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span style={{ color: txt2, fontSize: "11px" }}>Connexion sécurisée — vos données sont protégées par Yelen224.</span>
            </div>

            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <span style={{ color: txt2, fontSize: "13px" }}>Pas encore de compte ? </span>
              <Link href="/inscription" style={{ color: "#F5A623", fontWeight: "700", textDecoration: "none", fontSize: "13px" }}>Créer un compte</Link>
            </div>
            {/* Récupération de compte (retour Bryan 25/07/2026) — pour un
                citoyen qui a perdu l'accès à son numéro ou l'a changé. */}
            <div style={{ textAlign: "center" }}>
              <Link href="/recuperation-compte" style={{ color: txt2, fontWeight: "600", textDecoration: "none", fontSize: "12.5px" }}>Numéro perdu ou changé ?</Link>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div key="otp" className="step-in">
            {/* Profil aperçu */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "transparent", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "16px", marginBottom: "22px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>
                {userName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0,2) || "C"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: txt1, fontSize: "14px", fontWeight: "800" }}>{userName}</div>
                <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "600" }}>{masquerPhoneGuinee(phone)}</div>
              </div>
              <button onClick={() => { setStep("phone"); setCode(["","","","","",""]); setError(""); }} className="tap" style={{ background: "none", border: "none", color: txt2, cursor: "pointer", padding: "4px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>

            {/* Inputs OTP */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Code à 6 chiffres</div>
              <div style={{ display: "flex", gap: "9px", justifyContent: "center" }}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={otpRefs[i]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="otp-input"
                    style={{
                      width: "46px", height: "56px", textAlign: "center",
                      fontSize: "22px", fontWeight: "900",
                      background: digit ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : inputBg,
                      border: `2px solid ${digit ? txt1 : inputBrd}`,
                      borderRadius: "14px", color: txt1,
                      transition: "all 0.15s",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Avertissement — tentatives encore possibles mais protection
                renforcée (état WARNING du brief). Modernisé et repassé en
                noir/neutre (retour Bryan 03/09/2026) — plus aucun doré ici,
                réservé à la marque/aux CTA, jamais à un message de sécurité. */}
            {securityState === "warning" && !avertissementFerme && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "14px", padding: "12px 14px", background: inputBg, border: `1px solid ${inputBrd}`, borderLeft: `3px solid ${txt1}`, borderRadius: "12px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={txt1} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                <span style={{ color: txt1, fontSize: "12.5px", fontWeight: "600", flex: 1, lineHeight: 1.4 }}>Yelen a détecté plusieurs tentatives inhabituelles sur ce compte. Il vous reste quelques essais avant une courte pause de sécurité.</span>
                <button onClick={() => setAvertissementFerme(true)} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: txt2, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {/* Indice de code retiré (retour Bryan 25/07/2026) — affichait le
                code en clair à l'écran, faille bien plus grave que le simple
                hardcode côté serveur : n'importe qui le lisait sans même
                inspecter le code source. */}

            {/* Erreur */}
            {error && (
              <div className="error-shake" style={{ background: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                <span style={{ color: errText, fontSize: "13px", fontWeight: "600", flex: 1 }}>{error}</span>
                <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: errText, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {/* CTA */}
            <button onClick={handleVerify} disabled={loading || code.join("").length < 6} className="tap" style={{
              width: "100%", padding: "16px",
              background: success
                ? "#22c55e"
                : loading || code.join("").length < 6
                ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)")
                : "#F5A623",
              color: success ? "#fff" : loading || code.join("").length < 6 ? txt2 : "#080812",
              border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "800",
              cursor: loading || code.join("").length < 6 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "12px", transition: "background 0.25s",
            }}>
              {success
                ? <><svg className="pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Connecté !</>
                : loading
                ? <><YelenLoader size={16} color="#080812"/> Connexion…</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Se connecter
                  </>
              }
            </button>

            <button onClick={() => { setStep("phone"); setCode(["","","","","",""]); setError(""); }} className="tap" style={{ width: "100%", padding: "13px", background: "transparent", border: `1px solid ${inputBrd}`, borderRadius: "14px", color: txt2, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              Modifier le numéro
            </button>

            {/* Visible directement là où quelqu'un bloqué le remarque —
                pas seulement à l'étape numéro (retour Bryan 25/07/2026). */}
            <div style={{ textAlign: "center", marginTop: "14px" }}>
              <Link href="/recuperation-compte" style={{ color: txt2, fontWeight: "600", textDecoration: "none", fontSize: "12.5px" }}>Difficultés pour vous connecter ?</Link>
            </div>
          </div>
        )}

        {step === "totp" && (
          <div key="totp" className="step-in">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "transparent", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "14px", marginBottom: "22px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span style={{ color: txt1, fontSize: "13px", fontWeight: "600" }}>Ce compte a activé la double authentification.</span>
            </div>

            {error && (
              <div className="error-shake" style={{ background: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                <span style={{ color: errText, fontSize: "13px", fontWeight: "600", flex: 1 }}>{error}</span>
                <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: errText, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {!totpBackupMode ? (
              <>
                <div style={{ marginBottom: "8px" }}>
                  <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Code à 6 chiffres</div>
                  <div style={{ display: "flex", gap: "9px", justifyContent: "center" }}>
                    {totpCode.map((digit, i) => (
                      <input
                        key={i}
                        ref={totpRefs[i]}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleTotpChange(i, e.target.value)}
                        onKeyDown={e => handleTotpKeyDown(i, e)}
                        onPaste={e => handleTotpPaste(i, e)}
                        className="otp-input"
                        style={{
                          width: "46px", height: "56px", textAlign: "center",
                          fontSize: "22px", fontWeight: "900",
                          background: digit ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : inputBg,
                          border: `2px solid ${digit ? txt1 : inputBrd}`,
                          borderRadius: "14px", color: txt1,
                          transition: "all 0.15s",
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <button onClick={() => { setTotpBackupMode(true); setError(""); }} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Utiliser un code de secours</button>
                </div>
              </>
            ) : (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Code de secours</div>
                <input
                  type="text"
                  placeholder="XXXX-XXXX"
                  value={totpBackupCode}
                  onChange={e => setTotpBackupCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") handleTotpVerify(); }}
                  style={{ width: "100%", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "14px 16px", color: txt1, fontSize: "16px", fontWeight: "700", letterSpacing: "2px", textAlign: "center", marginBottom: "10px" }}
                  autoFocus
                />
                <div style={{ textAlign: "center" }}>
                  <button onClick={() => { setTotpBackupMode(false); setTotpBackupCode(""); setError(""); }} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Utiliser l&apos;application d&apos;authentification</button>
                </div>
              </div>
            )}

            <button onClick={handleTotpVerify} disabled={loading || (totpBackupMode ? !totpBackupCode.trim() : totpCode.join("").length < 6)} className="tap" style={{
              width: "100%", padding: "16px",
              background: success
                ? "#22c55e"
                : loading || (totpBackupMode ? !totpBackupCode.trim() : totpCode.join("").length < 6)
                ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)")
                : "#F5A623",
              color: success ? "#fff" : loading || (totpBackupMode ? !totpBackupCode.trim() : totpCode.join("").length < 6) ? txt2 : "#080812",
              border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "800",
              cursor: loading || (totpBackupMode ? !totpBackupCode.trim() : totpCode.join("").length < 6) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "12px", transition: "background 0.25s",
            }}>
              {success
                ? <><svg className="pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Connecté !</>
                : loading
                ? <><YelenLoader size={16} color="#080812"/> Vérification…</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Vérifier
                  </>
              }
            </button>

            <button onClick={() => { setStep("phone"); setTotpToken(""); setTotpCode(["","","","","",""]); setTotpBackupMode(false); setTotpBackupCode(""); setError(""); }} className="tap" style={{ width: "100%", padding: "13px", background: "transparent", border: `1px solid ${inputBrd}`, borderRadius: "14px", color: txt2, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              Annuler la connexion
            </button>

            {/* Le point le plus critique : application ET codes de secours
                perdus, plus aucun moyen de passer ce mur sans ce lien
                (retour Bryan 25/07/2026). */}
            <div style={{ textAlign: "center", marginTop: "14px" }}>
              <Link href="/recuperation-compte" style={{ color: txt2, fontWeight: "600", textDecoration: "none", fontSize: "12.5px" }}>Application et codes de secours perdus ?</Link>
            </div>
          </div>
        )}
        </>
        )}

        {/* Footer */}
        <div style={{ marginTop: "auto", paddingTop: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", gap: "0" }}>
            <div style={{ width: "16px", height: "11px", background: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
            <div style={{ width: "16px", height: "11px", background: "#FCD20F" }}/>
            <div style={{ width: "16px", height: "11px", background: "#009A44", borderRadius: "0 2px 2px 0" }}/>
            <span style={{ color: txt2, fontSize: "10px", marginLeft: "8px", fontWeight: "600", alignSelf: "center" }}>République de Guinée</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: txt2, fontSize: "10px", fontWeight: "600" }}>©2026 Yelen224 by</span>
            <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <span style={{ background: "#FE2C55", color: "#fff", fontSize: "10px", fontWeight: "800", padding: "2px 10px", borderRadius: "6px" }}>SEMPYA224</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginCitoyen() {
  return (
    <Suspense fallback={
      <div style={{ height: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F8FB" }}>
        <YelenLoader size={32}/>
      </div>
    }>
      <LoginCitoyenInner/>
    </Suspense>
  );
}

