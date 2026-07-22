"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { YelenLogo } from "@/components/YelenLogo";
import { MembreLoginSection } from "./components/MembreLoginSection";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

// ═══════════════════════════════════════════════════════════
// ACCENT DE MARQUE — fixe, jamais dérivé du thème clair/sombre
// ═══════════════════════════════════════════════════════════
const GOLD = { gold: "#F5A623", goldD: "#C8940A", goldL: "#FDE68A" };

// ═══════════════════════════════════════════════════════════
// DEV CONFIG — retirer avant mise en prod
// ═══════════════════════════════════════════════════════════
const DEV_MODE = true;          // ← passer à false en production
const DEV_OTP  = "123456";      // ← code fictif accepté en dev

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

type RememberedInst = { id: string; name: string };

type Step = "unlock" | "phone" | "preview" | "otp" | "setup" | "success" | "deletion-pending";

type DeletionInfo = { motif: string; scheduled_purge_at: string };

// useSearchParams() (lignes "expired"/"logged_out"/"deletion_requested")
// exige une frontière Suspense en App Router, sinon le build échoue au
// prerendering statique ("Error occurred prerendering page /institution/
// connexion") — corrigé le 22/07/2026, jamais rencontré avant car aucun
// build Netlify n'avait été relancé depuis l'écriture de ce chantier.
function InstitutionConnexionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("expired") === "1";
  const loggedOut = searchParams.get("logged_out") === "1";
  // Bug préexistant (indépendant de ce chantier) : ParametresTab.tsx redirige
  // déjà vers ?deletion_requested=1 après une demande de suppression de
  // compte, mais ce paramètre n'a jamais été lu ici — la bannière
  // correspondante ne s'affichait donc jamais.
  const deletionRequested = searchParams.get("deletion_requested") === "1";
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
    border:  isDark ? "rgba(245,166,35,0.3)" : "rgba(245,166,35,0.2)",
    shadow:  isDark ? "0 4px 24px rgba(0,0,0,0.45)" : "0 4px 24px rgba(245,166,35,0.15)",
    shadow2: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 20px 60px rgba(245,166,35,0.2)",
  };
  const [step, setStep]         = useState<Step>("phone");
  const [phone, setPhone]       = useState("");
  const [otp, setOtp]           = useState(["","","","","",""]);
  const [inst, setInst]         = useState<InstPreview | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [attempts, setAttempts] = useState(0);
  const [blocked, setBlocked]   = useState(false);
  const [blockEnd, setBlockEnd] = useState<number>(0);
  const [timer, setTimer]       = useState(0);
  const [resendTimer, setResendTimer] = useState(0);
  const [challenge, setChallenge]     = useState(generateChallenge);
  const [chalAns, setChalAns]         = useState("");
  const [chalOk, setChalOk]           = useState(false);
  const [justReady, setJustReady]     = useState(false);
  const phoneDigitsNormalized = phone.replace(/[\s\-]/g,"").replace(/^0/,"");
  const otpRefs = useRef<(HTMLInputElement|null)[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ── Se souvenir de moi / déverrouillage rapide ──
  const [rememberMe, setRememberMe]           = useState(false);
  const [remembered, setRemembered]           = useState<RememberedInst | null>(null);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [unlockMode, setUnlockMode]           = useState<"choice" | "pin">("choice");
  const [unlockPin, setUnlockPin]             = useState("");
  const [setupMode, setSetupMode]             = useState<"choice" | "pin">("choice");
  const [setupPin, setSetupPin]               = useState("");

  // ── Compte en cours de suppression (délai de grâce) ──
  const [deletionInfo, setDeletionInfo]       = useState<DeletionInfo | null>(null);
  const [pendingLogin, setPendingLogin]       = useState<{ id: string; name: string } | null>(null);
  const [cancelLoading, setCancelLoading]     = useState(false);

  // Timer bloquage
  useEffect(() => {
    if (!blocked) return;
    intervalRef.current = setInterval(() => {
      const left = Math.ceil((blockEnd - now()) / 1000);
      if (left <= 0) { setBlocked(false); setTimer(0); clearInterval(intervalRef.current); }
      else setTimer(left);
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [blocked, blockEnd]);

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
    if (phoneDigitsNormalized.length !== 9 || !chalOk) return;
    setJustReady(true);
    const t = setTimeout(() => setJustReady(false), 450);
    return () => clearTimeout(t);
  }, [phoneDigitsNormalized, chalOk]);

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
    setTimeout(() => router.push(`/institution/${id}/dashboard`), 1500);
  }

  async function cancelDeletionAndEnter() {
    if (!pendingLogin) return;
    setCancelLoading(true);
    setError("");
    try {
      const res = await fetch("/api/institution/auth/deletion/cancel", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors de l'annulation.");
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
      setError("Erreur réseau.");
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
          : (optData.error || "Erreur lors de la préparation de la vérification."));
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
        setError(verifyData.error || "Échec de la vérification.");
        setLoading(false);
        return;
      }

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
    if (unlockPin.length < 4) { setError("Entrez votre code de déverrouillage."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/institution/auth/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: remembered.id, pin: unlockPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Code incorrect.");
        setUnlockPin("");
        setLoading(false);
        return;
      }
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
    if (blocked) { setError(`Trop de tentatives. Réessayez dans ${timer}s.`); return; }

    // Format guinéen réel : 9 chiffres après +224. On tolère un "0" initial
    // tapé par habitude locale (ex: 0620000000), retiré avant validation.
    const digitsOnly = phone.replace(/[\s\-]/g, "");
    const normalized = digitsOnly.replace(/^0/, "");
    if (normalized.length !== 9) {
      setError(`Le numéro doit contenir exactement 9 chiffres après +224 (format : 6XX XX XX XX). Actuellement : ${normalized.length} chiffre${normalized.length > 1 ? "s" : ""}.`);
      return;
    }
    if (!chalOk) { setError("La réponse ne semble pas correcte, réessayez."); return; }

    setLoading(true);
    const fullPhone = "+224" + normalized;

    try {
      const res = await fetch("/api/institution/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "NOT_FOUND") {
          const n = attempts + 1;
          setAttempts(n);
          if (n >= 5) {
            setBlocked(true);
            setBlockEnd(now() + 5 * 60 * 1000);
            setTimer(300);
            setError("Trop de tentatives. Merci de patienter 5 minutes avant de réessayer.");
          } else {
            setError(`${data.error} ${5-n} tentative(s) restante(s).`);
          }
          setChallenge(generateChallenge());
          setChalAns("");
        } else {
          setError(data.error || "Un souci est survenu. Réessayez dans un instant.");
        }
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

      if (!res.ok) {
        setError(data.error || "Un souci est survenu lors de l'envoi du code. Réessayez dans un instant.");
        setLoading(false);
        return;
      }

      setStep("otp");
      setResendTimer(60);
      setSuccess(
        data.devMode
          ? `[DEV] Code fictif : ${data.code} — SMS désactivé`
          : `Code envoyé au ${inst!.phone}`
      );
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
    }
    setLoading(false);
  }

  // ── ÉTAPE 3 : Vérifier OTP ──
  async function handleVerifyOtp() {
    const code = otp.join("");
    if (code.length < 6) { setError("Il manque encore quelques chiffres — entrez le code à 6 chiffres."); return; }
    if (blocked) { setError(`Encore un instant : réessayez dans ${timer}s.`); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/institution/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: inst!.id, code, rememberMe }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "LOCKED") {
          setBlocked(true);
          setBlockEnd(now() + 5 * 60 * 1000);
          setTimer(300);
          setError(data.error || "Trop de tentatives. Merci de patienter 5 minutes avant de réessayer.");
        } else {
          const n = attempts + 1;
          setAttempts(n);
          setError(data.error || "Ce code ne correspond pas. Vérifiez-le et réessayez.");
        }
        setLoading(false);
        return;
      }

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

  // ── Configuration de l'accès rapide (proposée une fois, après connexion complète) ──
  async function handleSetupBiometric() {
    setError("");
    setLoading(true);
    try {
      const optRes = await fetch("/api/institution/auth/webauthn/register-options", { method: "POST" });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setError(optData.error || "Erreur lors de la préparation.");
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
        setError(verifyData.error || "Échec de l'enregistrement.");
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
    if (setupPin.length < 4) { setError("Le code doit contenir au moins 4 chiffres."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/institution/auth/pin/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: setupPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'enregistrement du code.");
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
  };

  // ── CSS ──
  const css = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    html,body{background:${C.bg};overflow-x:hidden;height:100%}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
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
    .card-hover{transition:transform 0.2s,box-shadow 0.2s}
    .card-hover:hover{transform:translateY(-2px);box-shadow:${C.shadow2}}
    .err-shake{animation:errShake .35s ease}
    .cta-main{transition:transform .15s,box-shadow .15s,filter .15s}
    .cta-main:not(:disabled):hover{transform:translateY(-1px);filter:brightness(1.03)}
    .yelen-conn-root{height:100svh;max-height:100svh;overflow:hidden}

    /* ── Écran de connexion unique (style Mailchimp) : formulaire toujours
       visible et centré, sans page d'accueil marketing ni pop-up à ouvrir ── */
    .yelen-login-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:20px;min-height:0}
    .yelen-login-card{width:100%;max-width:440px;max-height:100%;background:${C.white};border-radius:24px;box-shadow:${C.shadow2};display:flex;flex-direction:column;overflow:hidden;animation:authPop .22s cubic-bezier(.2,.8,.2,1)}
    .yelen-login-scroll{overflow-y:auto;padding:40px 36px 30px;min-height:0}
    .yelen-login-side{text-align:center;margin-bottom:22px}
    .yelen-login-icon{margin:0 auto 12px}

    /* ── Footer ── */
    .yelen-footer{flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px;padding:12px 20px;font-size:11px;color:${C.gray}}
    .yelen-footer a{color:${C.gray};text-decoration:none}
    .yelen-footer a:hover{color:${C.goldD};text-decoration:underline}

    @media (max-width: 640px){
      .yelen-login-wrap{padding:0}
      .yelen-login-card{max-width:100%;height:100%;border-radius:0}
      .yelen-login-scroll{padding:48px 22px 24px}
    }

    /* ── Écran principal (téléphone) en PC : carte large façon Google Sign-in,
       icône/titre à gauche et champs de formulaire à droite au lieu d'empiler
       verticalement — réduit aussi la hauteur nécessaire, donc l'ascenseur
       interne (.yelen-login-scroll) n'apparaît plus sur un écran de bureau. ── */
    @media (min-width: 960px){
      .yelen-login-card.wide{max-width:820px}
      .yelen-login-step-split{display:flex;flex-direction:row;align-items:center;gap:56px}
      .yelen-login-step-split .yelen-login-side{flex:0 0 260px;text-align:left;margin-bottom:0}
      .yelen-login-step-split .yelen-login-icon{margin:0 0 16px 0}
      .yelen-login-step-split .yelen-login-form{flex:1;min-width:0}
    }
  `;

  const Spinner = () => (
    <div style={{ width: "18px", height: "18px", border: "2.5px solid rgba(28,20,0,0.2)", borderTopColor: C.dark, borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }}/>
  );

  const ErrorBanner = ({ msg }: { msg: string }) => (
    <div className="err-shake" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", marginBottom: "16px" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style={{ color: C.red, fontSize: "13px", fontWeight: "600" }}>{msg}</span>
    </div>
  );

  const ctaStyle = (disabled: boolean): React.CSSProperties => ({
    width: "100%", padding: "16px", borderRadius: "14px", border: "none",
    background: disabled ? C.gray3 : `linear-gradient(135deg,${C.gold},${C.goldD})`,
    color: disabled ? C.gray : C.dark, fontSize: "16px", fontWeight: "800",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
    boxShadow: disabled ? "none" : `0 8px 24px ${C.gold}40`, transition: "all 0.2s",
  });

  const secondaryStyle: React.CSSProperties = {
    width: "100%", padding: "14px", borderRadius: "14px", border: `1.5px solid ${C.border}`,
    background: "transparent", color: C.dark2, fontSize: "14px", fontWeight: "700",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
  };

  const FingerprintIcon = ({ color, size = 34 }: { color: string; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
      <path d="M8 11a4 4 0 0 0 8 0"/>
      <path d="M12 18v4"/>
      <path d="M4 15.5A9 9 0 0 0 20 15"/>
    </svg>
  );

  return (
    <div className="yelen-conn-root" style={{ display: "flex", flexDirection: "column", background: C.bg, fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", color: C.dark }}>
      <style>{css}</style>

      {/* HEADER */}
      <header style={{ position: "relative", zIndex: 10, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, backgroundColor: `${C.white}E6`, backdropFilter: "blur(20px)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div style={{ width: "36px", height: "36px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${C.gold}40` }}>
            <YelenLogo size={18} color={C.dark}/>
          </div>
          <div>
            <div style={{ color: C.dark, fontSize: "15px", fontWeight: "900", letterSpacing: "0.5px", lineHeight: 1 }}>YELEN224</div>
            <div style={{ color: C.gold, fontSize: "9px", fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase" }}>Espace Institution</div>
          </div>
        </Link>
        <Link href="/faq" className="tap" aria-label="Aide et guide institution" title="Aide et guide institution" style={{ width: "38px", height: "38px", borderRadius: "50%", border: `1.5px solid ${C.border}`, backgroundColor: `${C.white}99`, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", flexShrink: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </Link>
      </header>

      {/* ÉCRAN DE CONNEXION — style Mailchimp : le formulaire est le contenu
          principal de la page, toujours visible, sans pop-up à ouvrir. */}
      <div className="yelen-login-wrap">
        <div className={`yelen-login-card${step === "phone" || step === "preview" || step === "otp" ? " wide" : ""}`} role="main" aria-label="Connexion institution">
          <div className="yelen-login-scroll">

        {sessionExpired && step !== "success" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: "#FFF3CD", border: "1px solid #FFC107", borderLeft: "3px solid #FFC107", borderRadius: "12px", marginBottom: "20px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span style={{ color: "#856404", fontSize: "13px", fontWeight: "700" }}>Votre session a expiré. Reconnectez-vous pour continuer.</span>
          </div>
        )}

        {loggedOut && step !== "success" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderLeft: `3px solid ${C.green}`, borderRadius: "12px", marginBottom: "20px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ color: C.green, fontSize: "13px", fontWeight: "700" }}>Vous avez été déconnecté avec succès</span>
          </div>
        )}

        {deletionRequested && step !== "success" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: "#FFF3CD", border: "1px solid #FFC107", borderLeft: "3px solid #FFC107", borderRadius: "12px", marginBottom: "20px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span style={{ color: "#856404", fontSize: "13px", fontWeight: "700" }}>Votre demande de suppression de compte a bien été enregistrée.</span>
          </div>
        )}

        {/* ═══ STEP: UNLOCK (déverrouillage rapide) ═══ */}
        {step === "unlock" && remembered && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{ width: "72px", height: "72px", borderRadius: "22px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: C.shadow }}>
                <FingerprintIcon color={C.gold}/>
              </div>
              <h1 style={{ color: C.dark, fontSize: "28px", fontWeight: "900", letterSpacing: "-0.6px", marginBottom: "6px" }}>Bonjour, {remembered.name}</h1>
              <p style={{ color: C.gray, fontSize: "14px" }}>Déverrouillez votre espace pour continuer</p>
            </div>

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
              <button onClick={handleForgetDevice} className="tap" style={{ background: "none", border: "none", color: C.gray, fontSize: "12.5px", fontWeight: "600", cursor: "pointer" }}>
                Ce n&apos;est pas vous ? Se connecter avec un autre compte
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP: PHONE ═══ */}
        {step === "phone" && (
          <div className="yelen-login-step-split" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="yelen-login-side">
              <div className="yelen-login-icon" style={{ width: "56px", height: "56px", borderRadius: "18px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: C.shadow }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
                  <path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/>
                </svg>
              </div>
              <h1 style={{ color: C.dark, fontSize: "30px", fontWeight: "900", letterSpacing: "-0.7px", marginBottom: "5px" }}>Connexion</h1>
              <p style={{ color: C.gray, fontSize: "13.5px", lineHeight: 1.5 }}>Accédez à l&apos;espace sécurisé de votre institution</p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "10px", padding: "5px 12px", backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}35`, borderRadius: "20px" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.goldD} strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ color: C.goldD, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.2px" }}>Connexion sécurisée</span>
              </div>
              {DEV_MODE && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", padding: "5px 12px", backgroundColor: "#FFF3CD", border: "1px solid #FFC107", borderRadius: "20px", justifyContent: "center" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span style={{ color: "#856404", fontSize: "10px", fontWeight: "800" }}>MODE DEV — SMS désactivé</span>
                </div>
              )}
            </div>

            <div className="yelen-login-form">
            {/* Champ téléphone */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ color: C.dark2, fontSize: "11px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Numéro de téléphone</label>
              <div style={{ display: "flex", borderRadius: "18px", border: `1.5px solid ${phoneDigitsNormalized.length === 9 ? C.green : C.border}`, overflow: "hidden", backgroundColor: C.white, boxShadow: "0 2px 8px rgba(245,166,35,0.08)", transition: "border-color 0.2s" }}>
                <div style={{ padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", borderRight: `1.5px solid ${C.border}`, backgroundColor: C.goldBg2, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 0 }}>
                    <div style={{ width: "8px", height: "6px", background: "#CE1126", borderRadius: "1px 0 0 1px" }}/>
                    <div style={{ width: "8px", height: "6px", background: "#FCD20F" }}/>
                    <div style={{ width: "8px", height: "6px", background: "#009A44", borderRadius: "0 1px 1px 0" }}/>
                  </div>
                  <span style={{ color: C.gold, fontSize: "15px", fontWeight: "900" }}>+224</span>
                </div>
                <input
                  className="inp"
                  type="tel"
                  placeholder="620 000 000"
                  value={phone}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^\d\s]/g, "");
                    // Plafond à 10 chiffres : 9 chiffres réels + 1 "0" initial toléré.
                    if (raw.replace(/\s/g, "").length <= 10) setPhone(raw);
                  }}
                  onKeyDown={e => e.key === "Enter" && handlePhoneSubmit()}
                  style={{ flex: 1, padding: "15px 16px", fontSize: "17px", fontWeight: "700", letterSpacing: "1.5px", border: "none", background: "transparent", color: C.dark, transition: "all 0.2s" }}
                  autoFocus
                />
                {phoneDigitsNormalized.length === 9 && (
                  <div style={{ display: "flex", alignItems: "center", paddingRight: "14px", animation: "checkPop .2s ease" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                )}
              </div>
              <p style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "5px", color: phoneDigitsNormalized.length === 9 ? C.green : C.gray, fontSize: "11px", marginTop: "6px", fontWeight: "600" }}>
                {phoneDigitsNormalized.length === 9 ? "Numéro valide" : `${phoneDigitsNormalized.length} / 9 chiffres`}
              </p>
            </div>

            {/* Challenge math */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ color: C.dark2, fontSize: "11px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Vérification de sécurité</label>
              <div style={{ backgroundColor: C.goldBg2, border: `1.5px solid ${C.gold}30`, borderRadius: "14px", padding: "12px 16px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "10px", backgroundColor: `${C.gold}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                </div>
                <span style={{ color: C.dark, fontSize: "14.5px", fontWeight: "700" }}>Combien font <strong style={{ color: C.gold }}>{challenge.q}</strong> ?</span>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  className="inp"
                  type="number"
                  placeholder="Votre réponse…"
                  value={chalAns}
                  onChange={e => setChalAns(e.target.value)}
                  style={{ width: "100%", padding: "12px 46px 12px 16px", borderRadius: "16px", border: `1.5px solid ${chalOk ? C.gold : C.border}`, backgroundColor: chalOk ? `${C.gold}08` : C.white, color: C.dark, fontSize: "15px", fontWeight: "600", transition: "all 0.2s" }}
                />
                <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)" }}>
                  {chalOk
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" style={{ animation: "checkPop .2s ease" }}><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gray2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  }
                </div>
              </div>
              {chalOk && (
                <p style={{ display: "flex", alignItems: "center", gap: "5px", color: C.goldD, fontSize: "11px", marginTop: "6px", fontWeight: "700", animation: "fadeUp .2s ease" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.goldD} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Vérification réussie
                </p>
              )}
            </div>

            {error && <ErrorBanner msg={error}/>}

            {/* Bloquage */}
            {blocked && (
              <div style={{ padding: "14px 16px", backgroundColor: `${C.gold}10`, border: `1px solid ${C.gold}30`, borderRadius: "12px", marginBottom: "16px" }}>
                <div style={{ color: C.dark, fontSize: "12px", fontWeight: "800", marginBottom: "6px" }}>Accès temporairement bloqué — {timer}s</div>
                <div style={{ height: "4px", backgroundColor: C.gray3, borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", backgroundColor: C.gold, borderRadius: "2px", width: `${(timer/300)*100}%`, transition: "width 1s linear" }}/>
                </div>
              </div>
            )}

            <button
              onClick={handlePhoneSubmit}
              disabled={loading || blocked || !chalOk}
              className="tap cta-main"
              style={{ width: "100%", padding: "15px", borderRadius: "16px", border: "none", background: loading || blocked || !chalOk ? C.gray3 : `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: loading || blocked || !chalOk ? C.gray : C.dark, fontSize: "15.5px", fontWeight: "800", cursor: loading || blocked || !chalOk ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: !loading && !blocked && chalOk ? `0 8px 24px ${C.gold}40` : "none", transition: "box-shadow 0.2s, background 0.2s, color 0.2s", animation: justReady ? "readyPulse .45s ease" : "none", letterSpacing: "-0.2px" }}
            >
              {loading ? <><Spinner/> Recherche…</> : <>
                Continuer vers mon institution
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </>}
            </button>

            <div style={{ textAlign: "center", marginTop: "16px", color: C.gray, fontSize: "13px" }}>
              Pas encore inscrit ?{" "}
              <Link href="/institution/inscription" style={{ color: C.gold, fontWeight: "700", textDecoration: "none" }}>Créer un compte</Link>
            </div>
            <MembreLoginSection/>
            </div>
          </div>
        )}

        {/* ═══ STEP: PREVIEW INSTITUTION ═══ */}
        {step === "preview" && inst && (
          <div style={{ animation: "scaleIn 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "20px", marginBottom: "16px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ color: C.green, fontSize: "12px", fontWeight: "800" }}>Institution trouvée</span>
              </div>
              <h2 style={{ color: C.dark, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.4px" }}>Confirmer l&apos;identité</h2>
              <p style={{ color: C.gray, fontSize: "13px", marginTop: "4px" }}>Vérifiez que c&apos;est bien votre institution</p>
            </div>

            {/* Card institution */}
            <div className="card-hover" style={{ backgroundColor: C.white, borderRadius: "20px", padding: "20px", border: `2px solid ${C.gold}30`, boxShadow: C.shadow, marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                {inst.logo ? (
                  <img src={inst.logo} alt={inst.name} style={{ width: "64px", height: "64px", borderRadius: "16px", objectFit: "cover", border: `2px solid ${C.gold}30`, flexShrink: 0 }}/>
                ) : (
                  <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, border: `2px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: C.gold, fontSize: "24px", fontWeight: "900" }}>{inst.name.slice(0,2).toUpperCase()}</span>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ color: C.dark, fontSize: "18px", fontWeight: "900" }}>{inst.name}</span>
                    {inst.badge_verifie && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", backgroundColor: C.greenL, color: C.green, fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "10px" }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: "14px", backgroundColor: C.goldBg, borderRadius: "14px" }}>
                {[
                  { label: "Note", value: inst.moyenne_avis > 0 ? inst.moyenne_avis.toFixed(1) : "—" },
                  { label: "Avis", value: String(inst.nb_avis || 0) },
                  { label: "Statut", value: inst.badge_verifie ? "Vérifié" : "Standard" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: "900", color: C.dark }}>{s.value}</div>
                    <div style={{ fontSize: "10px", color: C.gray, marginTop: "2px" }}>{s.label}</div>
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
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.goldBg2, border: `1px solid ${C.gold}30`, borderRadius: "12px", marginBottom: "20px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.dark, fontSize: "13px", fontWeight: "700" }}>
                    {DEV_MODE
                      ? `[DEV] Code fictif → ${DEV_OTP} (pas de SMS envoyé)`
                      : `Code envoyé au ${inst.phone.replace(/(\+224)(\d{2})(\d{3})(\d{4})/, "$1 $2•••$4")}`
                    }
                  </div>
                  <div style={{ color: C.gray, fontSize: "11px" }}>
                    {DEV_MODE ? "Intégration NIMBA SMS à venir" : "Via SMS sécurisé YELEN224"}
                  </div>
                </div>
              </div>
            )}

            {error && <ErrorBanner msg={error}/>}

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setStep("phone"); setInst(null); setError(""); setChallenge(generateChallenge()); setChalAns(""); }}
                className="tap"
                style={{ flex: canContinueLogin ? 1 : "1 1 100%", padding: "14px", borderRadius: "12px", border: `1.5px solid ${C.border}`, background: "transparent", color: C.gray, fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
                ← Retour
              </button>
              {canContinueLogin && (
                <button onClick={handleSendOtp} disabled={loading} className="tap"
                  style={{ flex: 2, padding: "14px", borderRadius: "12px", border: "none", background: loading ? C.gray3 : `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: loading ? C.gray : C.dark, fontSize: "14px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: !loading ? `0 6px 20px ${C.gold}40` : "none" }}>
                  {loading ? <><Spinner/> Simulation…</> : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    {DEV_MODE ? "Simuler l'envoi du code" : "Envoyer le code SMS"}
                  </>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP: OTP ═══ */}
        {step === "otp" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{ width: "68px", height: "68px", borderRadius: "20px", background: `linear-gradient(135deg, ${C.gold}20, ${C.gold}08)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: C.shadow }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round">
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              </div>
              <h2 style={{ color: C.dark, fontSize: "22px", fontWeight: "900", marginBottom: "6px" }}>Code de vérification</h2>
              <p style={{ color: C.gray, fontSize: "13px" }}>
                {DEV_MODE
                  ? <>Entrez le code fictif <strong style={{ color: C.gold, fontSize: "16px", letterSpacing: "2px" }}>{DEV_OTP}</strong></>
                  : <>Entrez le code à 6 chiffres envoyé au<br/><strong style={{ color: C.dark }}>{inst?.phone.replace(/(\+224)(\d{2})(\d{3})(\d{4})/, "$1 $2•••$4")}</strong></>
                }
              </p>
            </div>

            {/* Bannière DEV */}
            {DEV_MODE && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: "#FFF3CD", border: "1px solid #FFC107", borderLeft: "3px solid #FFC107", borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div>
                  <div style={{ color: "#856404", fontSize: "12px", fontWeight: "800" }}>Mode développement</div>
                  <div style={{ color: "#856404", fontSize: "11px" }}>Code accepté : <strong style={{ letterSpacing: "1px" }}>{DEV_OTP}</strong> — Aucun SMS envoyé</div>
                </div>
              </div>
            )}

            {success && !DEV_MODE && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ color: C.green, fontSize: "13px", fontWeight: "600" }}>{success}</span>
              </div>
            )}

            {/* OTP inputs */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "20px" }}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  className="otp-inp"
                  ref={el => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                  style={{ width: "52px", height: "62px", textAlign: "center", fontSize: "24px", fontWeight: "800", backgroundColor: d ? `${C.gold}12` : C.white, border: `2px solid ${d ? C.gold : C.border}`, borderRadius: "14px", color: C.dark, transition: "all 0.15s" }}
                />
              ))}
            </div>

            {/* Se souvenir de moi */}
            <div onClick={() => setRememberMe(v => !v)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", backgroundColor: rememberMe ? `${C.gold}08` : C.white, border: `1.5px solid ${rememberMe ? C.gold : C.border}`, borderRadius: "12px", marginBottom: "16px", cursor: "pointer", transition: "all 0.2s" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "6px", backgroundColor: rememberMe ? C.gold : "transparent", border: `2px solid ${rememberMe ? C.gold : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                {rememberMe && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <FingerprintIcon color={C.gold} size={16}/>
              <span style={{ color: C.dark2, fontSize: "13px", fontWeight: "700", flex: 1 }}>Se souvenir de moi sur cet appareil</span>
            </div>

            {error && <ErrorBanner msg={error}/>}

            <button onClick={handleVerifyOtp} disabled={loading || otp.join("").length < 6} className="tap cta-main"
              style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: loading || otp.join("").length < 6 ? C.gray3 : `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: loading || otp.join("").length < 6 ? C.gray : C.dark, fontSize: "16px", fontWeight: "800", cursor: loading || otp.join("").length < 6 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: !loading && otp.join("").length === 6 ? `0 8px 24px ${C.gold}40` : "none", marginBottom: "14px" }}>
              {loading ? <><Spinner/> Vérification…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Confirmer le code
              </>}
            </button>

            <div style={{ textAlign: "center" }}>
              {resendTimer > 0 ? (
                <span style={{ color: C.gray, fontSize: "13px" }}>Renvoyer dans {resendTimer}s</span>
              ) : (
                <button onClick={handleSendOtp} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                  {DEV_MODE ? "Re-simuler l'envoi" : "Renvoyer le code"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP: SETUP (configurer l'accès rapide) ═══ */}
        {step === "setup" && inst && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{ width: "72px", height: "72px", borderRadius: "22px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: C.shadow }}>
                <FingerprintIcon color={C.gold}/>
              </div>
              <h2 style={{ color: C.dark, fontSize: "21px", fontWeight: "900", marginBottom: "6px" }}>Configurer l&apos;accès rapide</h2>
              <p style={{ color: C.gray, fontSize: "13px", lineHeight: 1.6 }}>La prochaine fois, déverrouillez votre espace sans repasser par le SMS.</p>
            </div>

            {error && <ErrorBanner msg={error}/>}

            {setupMode === "choice" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
                {webauthnSupported && (
                  <button onClick={handleSetupBiometric} disabled={loading} className="tap cta-main" style={ctaStyle(loading)}>
                    {loading ? <><Spinner/> Configuration…</> : <><FingerprintIcon color={loading ? C.gray : C.dark} size={18}/> Activer Face ID / empreinte</>}
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
              <button onClick={skipSetup} disabled={loading} className="tap" style={{ background: "none", border: "none", color: C.gray, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                Plus tard
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP: SUCCESS ═══ */}
        {step === "success" && (
          <div style={{ textAlign: "center", animation: "fadeUp 0.3s ease", padding: "40px 0" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "24px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "successPop 0.5s ease", boxShadow: `0 12px 32px ${C.gold}50` }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ color: C.dark, fontSize: "24px", fontWeight: "900", marginBottom: "8px" }}>Connexion réussie !</h2>
            <p style={{ color: C.gray, fontSize: "14px" }}>Redirection vers votre dashboard…</p>
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "24px", height: "24px", border: `3px solid ${C.gold}30`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
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
            <button onClick={cancelDeletionAndEnter} disabled={cancelLoading} className="tap" style={{ width: "100%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: C.dark, fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px", border: "none", cursor: "pointer", marginBottom: "10px" }}>
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

          </div>
        </div>
      </div>

      {/* FOOTER — discret, uniquement des routes réelles */}
      <footer className="yelen-footer">
        <span>© {new Date().getFullYear()} Yelen224</span>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/cgu">CGU</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/contact">Contact</Link>
      </footer>
    </div>
  );
}

export default function InstitutionConnexion() {
  return (
    <Suspense fallback={
      <div style={{ height: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFBEB" }}>
        <div style={{ width: "32px", height: "32px", border: "3px solid rgba(245,166,35,0.2)", borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <InstitutionConnexionInner/>
    </Suspense>
  );
}
