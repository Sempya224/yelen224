"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY, YELEN224_CGU_LIEN_OUVERT_KEY } from "@/lib/auth/constants";
import { VILLES_GUINEE } from "@/lib/villes";
import { YelenLoader } from "@/components/YelenLoader";
import { validerFormatPhoneGuinee, normaliserChiffresPhone, versE164Guinee, filtrerSaisiePhone, masquerPhoneGuinee } from "@/lib/phoneGuinee";
import { AuthSecurityBlockedScreen } from "@/components/security/AuthSecurityBlockedScreen";

// ─── Anti-bot ─────────────────────────────────────────────────────────────────
const CHALLENGES = [
  { q: "Combien font 8 + 7 ?",              a: "15" },
  { q: "Combien font 16 - 9 ?",             a: "7"  },
  { q: "Combien font 6 × 3 ?",              a: "18" },
  { q: "Combien font 21 ÷ 3 ?",             a: "7"  },
  { q: "Quel est le double de 8 ?",         a: "16" },
  { q: "Combien font 12 + 9 - 4 ?",         a: "17" },
  { q: "Combien de jours en une semaine ?", a: "7"  },
];

// Message générique pour l'état bloqué/support_only (chantier Auth
// Security 28/08/2026, voir lib/security/authSecurity.ts) — utilisé
// uniquement pour la garde locale avant l'envoi d'une requête.
function messageBlocageActuel(state: "blocked" | "support_only", retryAfterS: number): string {
  if (state === "support_only") return "Contactez le support pour réactiver l'inscription sur cet appareil.";
  return retryAfterS > 0 ? `Accès temporairement protégé. Réessayez dans ${retryAfterS}s.` : "Accès temporairement protégé. Réessayez dans un instant.";
}

// Parcours "1 étape = 1 écran" (retour Bryan 11/09/2026, principe NN/g de
// séquencement mobile) — remplace l'ancien formulaire "info" unique.
// Mêmes données, mêmes validations (handleSubmitInfo inchangée), seule la
// présentation est découpée. STEPS_ORDER pilote à la fois le retour arrière
// et les points de progression.
type Step = "intro" | "identite" | "telephone" | "ville" | "securite" | "otp";
const STEPS_ORDER: Step[] = ["identite", "telephone", "ville", "securite"];

// Titre/sous-titre du hero par écran — "otp" a un sous-titre dynamique
// (numéro masqué), géré à part au point d'affichage.
const HERO_TEXT: Record<Step, { titre: string; sousTitre: string }> = {
  intro:     { titre: "Bienvenue sur Yelen",           sousTitre: "Simplifiez vos démarches et interactions institutionnelles en toute sécurité." },
  identite:  { titre: "Faisons connaissance",          sousTitre: "Entrez votre nom pour personnaliser votre espace Yelen." },
  telephone: { titre: "Quel est votre numéro ?",    sousTitre: "Il permettra d'accéder à votre compte et de sécuriser vos données." },
  ville:     { titre: "Où vous trouvez-vous ?",         sousTitre: "Choisissez votre ville pour afficher les services et institutions à proximité." },
  securite:  { titre: "Dernière étape",               sousTitre: "Confirmez votre sécurité pour finaliser la création de votre compte." },
  otp:       { titre: "Code de vérification",         sousTitre: "" },
};

export default function InscriptionCitoyen() {
  const router   = useRouter();
  const { theme } = useTheme();
  const C        = T[theme];
  const isDark   = theme === "dark";

  const [step, setStep]     = useState<Step>("intro");
  // Repart à zéro à chaque nouvelle tentative d'inscription (appareil
  // partagé) — sinon un clic CGU d'un compte précédent masquerait à tort le
  // rappel plein écran (app/page.tsx::RappelCguOverlay) pour ce nouveau compte.
  useEffect(() => { try { localStorage.removeItem(YELEN224_CGU_LIEN_OUVERT_KEY); } catch {} }, []);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false); // micro-animation avant redirection
  const [error, setError]   = useState("");
  // Fermeture locale de l'avertissement "tentatives détectées" — n'affecte
  // jamais securityState, seulement l'affichage du bandeau (même logique
  // que app/login/page.tsx).
  const [avertissementFerme, setAvertissementFerme] = useState(false);
  // Compte déjà existant à ce numéro — message + lien "Se connecter" dédiés
  // (retour Bryan 09/08/2026, message plus humain qu'une simple erreur).
  const [accountExists, setAccountExists] = useState(false);
  // Demande de récupération de compte déjà en cours (retour Bryan
  // 09/08/2026) — même trace locale que app/login/page.tsx, pour éviter
  // qu'un citoyen recrée un compte par erreur en attendant sa récupération.
  const [recoveryPending, setRecoveryPending] = useState<{ phone: string; submittedAt: number } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [acceptCGU, setAcceptCGU] = useState(false);
  const [form, setForm]     = useState({ prenom: "", nom: "", phone: "", ville: "" });
  const phoneDigitsNormalized = normaliserChiffresPhone(form.phone);
  const phoneValidation = validerFormatPhoneGuinee(form.phone);
  const phoneErreurVisible = phoneValidation.code === "prefixe_inconnu" || phoneValidation.code === "caracteres_invalides";
  const [code, setCode]     = useState(["","","","","",""]);

  // Anti-bot
  const [challenge, setChallenge]   = useState(CHALLENGES[0]);
  const [chalAnswer, setChalAnswer] = useState("");
  const [chalValid, setChalValid]   = useState(false);
  const [honeypot, setHoneypot]     = useState("");
  // État anti-abus piloté par le serveur (chantier Auth Security
  // 28/08/2026) — remplace l'ancien compteur cosmétique local. Alimenté
  // par le champ `security` renvoyé par /api/citoyen/auth/register.
  const [securityState, setSecurityState] = useState<"normal" | "warning" | "blocked" | "support_only">("normal");
  const [securityRetryAfterS, setSecurityRetryAfterS] = useState(0);
  const lastKey = useRef(0);
  const speeds  = useRef<number[]>([]);
  // Garde anti-double-appel synchrone — `loading` (state React) ne se met à
  // jour qu'au rendu suivant, donc un auto-submit (setTimeout ci-dessous) et
  // une touche Entrée/tap déclenchés dans la même fenêtre passent tous les
  // deux la garde `if (loading) return`. Un ref est lu/écrit immédiatement,
  // aucune fenêtre de course possible entre les deux.
  const verifyingRef = useRef(false);
  const prenomInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef  = useRef<HTMLInputElement>(null);

  // Focus différé après l'animation d'entrée de l'écran (retour Bryan
  // 11/09/2026) — même piège déjà documenté sur le sheet "Choisir une
  // institution" de app/signalement/page.tsx : un focus (donc l'ouverture
  // du clavier) simultané à l'animation `step-in`/`fadeUp` (0.3s) casse le
  // rendu sur iOS (écran qui reste "tiré" vers le haut tant qu'on n'a pas
  // scrollé manuellement). On attend la fin de l'animation avant de focus.
  useEffect(() => {
    if (step !== "identite" && step !== "telephone") return;
    const ref = step === "identite" ? prenomInputRef : phoneInputRef;
    const t = setTimeout(() => ref.current?.focus(), 320);
    return () => clearTimeout(t);
  }, [step]);

  const otpRefs = [
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    const i = Math.floor(Math.random() * CHALLENGES.length);
    setChallenge(CHALLENGES[i]);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("yelen224_recuperation_pending");
      if (raw) {
        const parsed = JSON.parse(raw) as { phone: string; submittedAt: number };
        if (parsed?.phone && parsed?.submittedAt) setRecoveryPending(parsed);
      }
    } catch {}
  }, []);

  const dismissRecoveryPending = () => {
    try { localStorage.removeItem("yelen224_recuperation_pending"); } catch {}
    setRecoveryPending(null);
  };

  useEffect(() => {
    setChalValid(chalAnswer.trim() === challenge.a);
  }, [chalAnswer, challenge]);

  // Décompte visuel du blocage — purement informatif : la porte réelle
  // reste vérifiée par le serveur à la prochaine requête.
  useEffect(() => {
    if (securityState !== "blocked" || securityRetryAfterS <= 0) return;
    const t = setTimeout(() => setSecurityRetryAfterS(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [securityState, securityRetryAfterS]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Validité par étape — mêmes règles que handleSubmitInfo, juste éclatées
  // pour piloter l'avance automatique de chaque écran.
  const validIdentite = form.prenom.trim().length > 0 && form.nom.trim().length > 0;
  const validTelephone = phoneValidation.valide;

  // Auto-avance retirée (retour Bryan 11/09/2026, quelques heures après
  // l'avoir demandée) : avec le clavier qui s'ouvre immédiatement + la
  // détection du numéro déjà saisi sur l'appareil, un remplissage rapide ou
  // un autofill déclenchait l'avance avant que "Continuer" ait un sens.
  // Chaque écran avance désormais uniquement par tap explicite (ou Entrée).

  const onKey = useCallback(() => {
    const now = Date.now();
    if (lastKey.current) speeds.current = [...speeds.current.slice(-8), now - lastKey.current];
    lastKey.current = now;
  }, []);

  const isBotSpeed = useCallback(() => {
    if (speeds.current.length < 4) return false;
    const diffs = speeds.current.map((v,i) => i > 0 ? Math.abs(v - speeds.current[i-1]) : 0).slice(1);
    return diffs.reduce((a,b) => a+b, 0) / diffs.length < 8;
  }, []);

  const fc = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  // Retour arrière du parcours en écrans — écran 1 (identite) revient à
  // l'intro, chaque écran suivant revient au précédent de STEPS_ORDER.
  const goBack = () => {
    const idx = STEPS_ORDER.indexOf(step);
    setStep(idx <= 0 ? "intro" : STEPS_ORDER[idx - 1]);
  };

  const handleSubmitInfo = async () => {
    if (loading) return; // garde anti double-clic
    setError("");
    if (honeypot) { await new Promise(r => setTimeout(r, 2000)); return; }
    if (isBotSpeed()) { setError("Un souci est survenu pendant votre saisie. Réessayez tranquillement."); return; }
    if (securityState === "blocked" || securityState === "support_only") { setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }
    if (!form.prenom.trim()) { setError("Merci d'indiquer votre prénom."); return; }
    if (!form.nom.trim()) { setError("Merci d'indiquer votre nom."); return; }
    if (!form.ville) { setError("Merci de sélectionner votre ville."); return; }
    if (!acceptCGU) { setError("Merci d'accepter les conditions d'utilisation pour continuer."); return; }
    if (!chalValid) { setError("Merci de répondre correctement à la question de sécurité."); return; }
    if (!phoneValidation.valide) { setError(phoneValidation.message || "Ce numéro ne semble pas valide. Vérifiez-le et réessayez."); return; }

    const fullPhone = versE164Guinee(phoneDigitsNormalized);
    localStorage.setItem("inscription_phone",  fullPhone);
    localStorage.setItem("inscription_prenom", form.prenom.trim());
    localStorage.setItem("inscription_nom",    form.nom.trim());
    localStorage.setItem("inscription_ville",  form.ville);
    setStep("otp");
    setTimeout(() => otpRefs[0].current?.focus(), 300);
  };

  // Vérification 100% serveur (retour Bryan 25/07/2026) — la comparaison
  // client à YELEN224_OTP_SIMULE est retirée, même raisonnement que
  // app/login/page.tsx : /api/citoyen/auth/register revalidait déjà le code
  // en entier côté serveur ("ne fait jamais confiance à un état vérifié
  // déclaré par le client"), le check client était redondant et exposait le
  // code en clair dans le bundle JS.
  const handleVerify = async () => {
    if (verifyingRef.current) return; // garde anti double-appel (voir verifyingRef)
    verifyingRef.current = true;
    setError("");
    setAccountExists(false);
    if (securityState === "blocked" || securityState === "support_only") { verifyingRef.current = false; setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }
    const entered = code.join("");
    // Le bouton reste désactivé tant que les 6 chiffres ne sont pas saisis
    // (voir disabled={... code.join("").length < 6} plus bas) — ce garde-fou
    // ne sert plus qu'à ignorer un Entrée prématuré, jamais à afficher un
    // message (retour Bryan 09/08/2026 : bandeau perçu comme "faux").
    if (entered.length < 6) { verifyingRef.current = false; return; }
    setLoading(true);
    try {
      const phone  = localStorage.getItem("inscription_phone");
      const prenom = localStorage.getItem("inscription_prenom");
      const nom    = localStorage.getItem("inscription_nom");
      const ville  = localStorage.getItem("inscription_ville");
      const res  = await fetch("/api/citoyen/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: entered, prenom, nom, ...(ville ? { ville } : {}) }),
      });
      const json = await res.json();
      if (json.security?.state) { setSecurityState(json.security.state); setSecurityRetryAfterS(json.security.retryAfterS || 0); }

      if (res.status === 423) {
        setError(json.error || "Accès temporairement protégé.");
        setCode(["","","","","",""]);
        return;
      }

      if (!res.ok || !json.success) {
        if (json.code === "ALREADY_REGISTERED") { setError("Un compte existe déjà avec ce numéro."); setAccountExists(true); return; }
        if (json.code === "INVALID_CODE") {
          setError(json.error || "Ce code ne semble pas correct.");
          setCode(["","","","","",""]); setTimeout(() => otpRefs[0].current?.focus(), 100);
          return;
        }
        setError("Nous n'avons pas pu créer votre compte. Réessayez.");
        return;
      }

      if (!json.tokenHash) {
        setError("Nous n'avons pas pu sécuriser votre connexion. Réessayez.");
        return;
      }
      const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: "email" });
      if (sessionError) {
        setError("Nous n'avons pas pu sécuriser votre connexion. Réessayez.");
        return;
      }

      ["inscription_phone","inscription_prenom","inscription_nom","inscription_ville"].forEach(k => localStorage.removeItem(k));
      localStorage.setItem(YELEN224_USER_ID_KEY, json.userId);

      // Micro-animation de succès avant redirection (retour CEO 23/07/2026)
      setSuccess(true);
      await new Promise(r => setTimeout(r, 550));
      router.push("/premiers-pas");
    } catch { setError("Un problème de connexion est survenu."); }
    finally { setLoading(false); verifyingRef.current = false; }
  };

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n = [...code]; n[i] = val.slice(-1); setCode(n);
    if (val && i < 5) otpRefs[i+1].current?.focus();
    if (n.join("").length === 6) setTimeout(handleVerify, 200);
  };
  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) otpRefs[i-1].current?.focus();
    if (e.key === "Enter") handleVerify();
  };

  const canSubmit = chalValid && acceptCGU && securityState !== "blocked" && securityState !== "support_only" && !loading && phoneValidation.valide;

  // ── Tokens thème auto ─────────────────────────────────────────────────────
  const inputBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBrd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const txt1 = isDark ? "#F0EEE8" : "#0d0d1a";
  const txt2 = isDark ? "#6E6E7A" : "#6C6C70";
  const txt3 = isDark ? "#333345" : "#bbb";
  // Bandeaux d'erreur — rouge dédié, le doré reste réservé à la marque/aux
  // actions (retour Bryan 09/08/2026, même correctif que app/login/page.tsx).
  const errBg   = isDark ? "rgba(239,68,68,0.14)" : "#FEE2E2";
  const errBrd  = "#ef4444";
  const errText = isDark ? "#FCA5A5" : "#991B1B";
  const bloque  = securityState === "blocked" || securityState === "support_only";

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif", color: txt1, overflow: "hidden", transition: "background-color 0.3s" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html{height:100%;overflow:hidden}
        body{background:${C.pageBg};position:fixed;inset:0;width:100%;height:100%;overflow:hidden;transition:background-color 0.3s}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glowPulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes popIn{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        input::placeholder{color:${txt3}}
        input:focus,select:focus{border-color:${isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"}!important;outline:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        select option{background:${isDark ? "#12121F" : "#fff"};color:${txt1}}
        .otp-box:focus{border-color:${isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"}!important}
        .pop-in{animation:popIn 0.35s cubic-bezier(0.34,1.56,0.64,1)}
        .step-in{animation:fadeUp 0.3s ease}
      `}</style>

      {/* ── HEADER TIKTOK YELEN ──
          `position: sticky` + wrapper `height: 0` plutôt que `fixed` (retour
          Bryan 11/09/2026, bug confirmé par capture) : sur iOS, un header
          `fixed` se recalcule mal quand le clavier ouvre en même temps que
          `env(safe-area-inset-top)` — le header apparaît collé/coupé sous la
          barre de statut tant qu'aucun scroll manuel ne force un recalcul.
          `sticky` est ancré au flux du document (jamais affecté par ce bug
          clavier), et le wrapper à hauteur 0 + `overflow: visible` laisse le
          header déborder visuellement sans pousser le hero vers le bas —
          même rendu qu'avant, sans le bug. */}
      <div style={{ position: "sticky", top: 0, zIndex: 200, height: 0, overflow: "visible" }}>
      <header style={{
        backgroundColor: scrolled ? (isDark ? "rgba(8,8,15,0.97)" : "rgba(248,248,251,0.97)") : "transparent",
        backdropFilter: scrolled ? "blur(24px)" : "none",
        borderBottom: scrolled ? `1px solid ${isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)"}` : "none",
        transition: "all 0.3s",
        paddingTop: "calc(13px + env(safe-area-inset-top))", paddingBottom: "13px", paddingLeft: "20px", paddingRight: "20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Retour + points de progression — discret, présent uniquement sur
            les 4 écrans du parcours (retour Bryan 11/09/2026, "pas un gros
            stepper"). Le bouton Connexion reste inchangé à droite sur tous
            les écrans, y compris l'intro. */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {STEPS_ORDER.includes(step) && (
            <>
              <button onClick={goBack} aria-label="Étape précédente" className="tap" style={{ background: "none", border: "none", padding: "4px", margin: "-4px", color: isDark ? txt1 : "#080812", cursor: "pointer", display: "flex", alignItems: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div style={{ display: "flex", gap: "5px" }}>
                {STEPS_ORDER.map((s, i) => (
                  <div key={s} style={{ width: "6px", height: "6px", borderRadius: "50%", background: i <= STEPS_ORDER.indexOf(step) ? "#F5A623" : (isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)") }}/>
                ))}
              </div>
            </>
          )}
        </div>
        <Link href="/login" className="tap" style={{ color: "#080812", fontSize: "12px", fontWeight: "800", textDecoration: "none", padding: "7px 14px", borderRadius: "20px", background: "#F5A623" }}>
          Connexion
        </Link>
      </header>
      </div>

      {/* ── HERO ── */}
      <div style={{ position: "relative", height: "220px", background: isDark ? "linear-gradient(160deg,#0F0E1A 0%,#110F1E 60%,#1A1008 100%)" : "#F5A623", overflow: "hidden" }}>
        {/* Drapeau */}
        <div style={{ position: "absolute", top: "68px", right: "22px", display: "flex", opacity: isDark ? 0.3 : 0.4 }}>
          <div style={{ width: "9px", height: "16px", background: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
          <div style={{ width: "9px", height: "16px", background: "#FCD20F" }}/>
          <div style={{ width: "9px", height: "16px", background: "#009A44", borderRadius: "0 2px 2px 0" }}/>
        </div>
        <div style={{ position: "absolute", bottom: "28px", left: "24px", right: "24px" }}>
          {isDark && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "20px", marginBottom: "8px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#F5A623" }}/>
              <span style={{ color: "#F5A623", fontSize: "9px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase" }}>{bloque ? "Sécurité" : "Espace Citoyen"}</span>
            </div>
          )}
          <h1 style={{ color: isDark ? txt1 : "#080812", fontSize: "26px", fontWeight: "900", margin: "0 0 5px", lineHeight: 1.15, letterSpacing: "-0.5px" }}>
            {bloque ? "Accès protégé"
              : step === "otp" ? "Saisissez le code"
              : step === "intro" && isDark ? <>Bienvenue sur <span style={{ color: "#F5A623" }}>Yelen</span></>
              : HERO_TEXT[step].titre}
          </h1>
          {/* Sous-titre masqué en blocage — AuthSecurityBlockedScreen
              ci-dessous répète déjà toute l'explication en détail (même
              correctif que app/login/page.tsx). */}
          {!bloque && (
            <div style={{ color: isDark ? txt2 : "rgba(0,0,0,0.6)", fontSize: "13px", fontWeight: "500" }}>
              {step === "otp" ? `Un code SMS a été envoyé au ${masquerPhoneGuinee(form.phone)}.` : HERO_TEXT[step].sousTitre}
            </div>
          )}
        </div>
      </div>

      {/* ── FORMULAIRE ── */}
      <div style={{ flex: "1", display: "flex", flexDirection: "column", padding: "22px 20px 48px", maxWidth: "480px", width: "100%", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>

        {(securityState === "blocked" || securityState === "support_only") ? (
          <AuthSecurityBlockedScreen state={securityState} retryAfterS={securityRetryAfterS} dark={isDark} onExpire={() => setSecurityState("normal")} />
        ) : (
        <>
        {recoveryPending && step === "intro" && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", backgroundColor: "transparent", border: "1px solid rgba(245,166,35,0.25)", borderLeft: "3px solid #F5A623", borderRadius: "12px", marginBottom: "18px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: txt1, fontSize: "12.5px", fontWeight: "700", lineHeight: 1.5 }}>
                Une demande de récupération pour {recoveryPending.phone} est déjà en cours (envoyée le {new Date(recoveryPending.submittedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}). Inutile de créer un nouveau compte — un admin la traite sous 48h.
              </div>
            </div>
            <button onClick={dismissRecoveryPending} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: txt2, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Honeypot — présent sur tout le parcours "identité → conditions"
            (retour Bryan 11/09/2026), pas seulement le dernier écran, pour
            attraper un bot qui remplirait tous les champs d'un coup. */}
        {step !== "intro" && step !== "otp" && (
          <div style={{ position: "absolute", left: "-9999px", top: 0, opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} name="website"/>
          </div>
        )}

        {/* ── Écran 0 — Introduction ── */}
        {step === "intro" && (
          <div key="intro" className="step-in">
            <button onClick={() => setStep("identite")} className="tap" style={{
              width: "100%", padding: "16px", background: "#F5A623", color: "#080812", border: "none",
              borderRadius: "16px", fontSize: "15px", fontWeight: "900", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "14px",
            }}>
              Commençons <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
            <div style={{ textAlign: "center" }}>
              <span style={{ color: txt2, fontSize: "13px" }}>Déjà un compte ? </span>
              <Link href="/login" style={{ color: "#F5A623", fontWeight: "700", textDecoration: "none", fontSize: "13px" }}>Se connecter</Link>
            </div>
          </div>
        )}

        {/* ── Écran 1/4 — Identité ── */}
        {step === "identite" && (
          <div key="identite" className="step-in">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px" }}>
              {[{ key: "prenom", label: "Prénom", ph: "Mamadou" }, { key: "nom", label: "Nom", ph: "Diallo" }].map(f => (
                <div key={f.key}>
                  <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>{f.label} *</div>
                  <input
                    ref={f.key === "prenom" ? prenomInputRef : undefined}
                    autoComplete={f.key === "prenom" ? "given-name" : "family-name"}
                    value={form[f.key as "prenom" | "nom"]}
                    onChange={e => { fc(f.key, e.target.value); onKey(); }}
                    onKeyDown={e => { onKey(); if (e.key === "Enter" && validIdentite) setStep("telephone"); }}
                    placeholder={f.ph}
                    style={{ width: "100%", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "13px 14px", color: txt1, fontSize: "14px", fontWeight: "600", transition: "border-color 0.2s" }}
                  />
                </div>
              ))}
            </div>
            <button onClick={() => setStep("telephone")} disabled={!validIdentite} className="tap" style={{
              width: "100%", padding: "16px",
              background: validIdentite ? "#F5A623" : inputBg, color: validIdentite ? "#080812" : txt2,
              border: validIdentite ? "none" : `1px solid ${inputBrd}`,
              borderRadius: "16px", fontSize: "15px", fontWeight: "900", cursor: validIdentite ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.2s",
            }}>
              Continuer <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {/* ── Écran 2/4 — Téléphone ── */}
        {step === "telephone" && (
          <div key="telephone" className="step-in">
            <div style={{ marginBottom: "18px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>Téléphone *</div>
              <div style={{ display: "flex", gap: "8px", border: `1px solid ${phoneErreurVisible ? errBrd : inputBrd}`, borderRadius: "14px", overflow: "hidden", transition: "border-color 0.2s" }}>
                <div style={{ background: inputBg, padding: "13px 14px", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, borderRight: `1px solid ${inputBrd}` }}>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F5A623" }}/>
                  <span style={{ color: "#F5A623", fontSize: "14px", fontWeight: "800" }}>+224</span>
                </div>
                <input
                  ref={phoneInputRef}
                  type="tel" autoComplete="tel-national" inputMode="numeric" value={form.phone}
                  onChange={e => {
                    const raw = filtrerSaisiePhone(e.target.value);
                    // Plafond à 10 chiffres : 9 chiffres réels + 1 "0" initial toléré.
                    if (raw.replace(/\s/g, "").length <= 10) fc("phone", raw);
                    onKey();
                  }}
                  onKeyDown={e => { onKey(); if (e.key === "Enter" && validTelephone) setStep("ville"); }}
                  placeholder="620 000 000"
                  style={{ flex: 1, background: "transparent", border: "none", padding: "13px 14px", color: txt1, fontSize: "15px", fontWeight: "600", letterSpacing: "0.5px" }}
                />
              </div>
              <p style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "5px", color: phoneErreurVisible ? errBrd : (phoneValidation.valide ? "#F5A623" : txt2), fontSize: "11px", marginTop: "6px", fontWeight: "600" }}>
                {phoneErreurVisible ? phoneValidation.message : (phoneValidation.valide ? "Numéro valide" : `${phoneDigitsNormalized.length} / 9 chiffres`)}
              </p>
            </div>
            <button onClick={() => setStep("ville")} disabled={!validTelephone} className="tap" style={{
              width: "100%", padding: "16px",
              background: validTelephone ? "#F5A623" : inputBg, color: validTelephone ? "#080812" : txt2,
              border: validTelephone ? "none" : `1px solid ${inputBrd}`,
              borderRadius: "16px", fontSize: "15px", fontWeight: "900", cursor: validTelephone ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.2s",
            }}>
              Continuer <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {/* ── Écran 3/4 — Ville ── */}
        {step === "ville" && (
          <div key="ville" className="step-in">
            <div style={{ marginBottom: "18px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>Ville *</div>
              <div style={{ display: "flex", border: `1px solid ${inputBrd}`, borderRadius: "14px", overflow: "hidden" }}>
                <div style={{ background: inputBg, padding: "13px 14px", display: "flex", alignItems: "center", flexShrink: 0, borderRight: `1px solid ${inputBrd}`, color: txt2 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div style={{ position: "relative", flex: 1 }}>
                  <select
                    value={form.ville}
                    onChange={e => {
                      const v = e.target.value;
                      fc("ville", v);
                      // Sélection = action décisive, pas besoin de debounce
                      // (contrairement à Identité/Téléphone) — juste un
                      // court délai pour laisser voir le choix effectué.
                      if (v) setTimeout(() => setStep("securite"), 250);
                    }}
                    style={{ width: "100%", background: "transparent", border: "none", padding: "13px 34px 13px 14px", color: form.ville ? txt1 : txt2, fontSize: "14px", fontWeight: "600", appearance: "none", cursor: "pointer" }}
                  >
                    <option value="">Sélectionner votre ville</option>
                    {VILLES_GUINEE.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: txt2 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setStep("securite")} disabled={!form.ville} className="tap" style={{
              width: "100%", padding: "16px",
              background: form.ville ? "#F5A623" : inputBg, color: form.ville ? "#080812" : txt2,
              border: form.ville ? "none" : `1px solid ${inputBrd}`,
              borderRadius: "16px", fontSize: "15px", fontWeight: "900", cursor: form.ville ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.2s",
            }}>
              Continuer <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {/* ── Écran 4/4 — Sécurité & conditions ── */}
        {step === "securite" && (
          <div key="securite" className="step-in">
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>Vérification de sécurité *</div>
              <div style={{ background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "13px 16px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: txt2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <span style={{ color: txt1, fontSize: "14px", fontWeight: "700" }}>{challenge.q}</span>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type="number" value={chalAnswer}
                  onChange={e => { setChalAnswer(e.target.value); onKey(); }}
                  placeholder="Votre réponse…"
                  style={{ width: "100%", background: inputBg, border: `1px solid ${chalValid ? "rgba(245,166,35,0.4)" : inputBrd}`, borderRadius: "12px", padding: "13px 46px 13px 16px", color: txt1, fontSize: "15px", transition: "border-color 0.2s" }}
                />
                <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)" }}>
                  {chalValid
                    ? <svg key="valid" className="pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={txt3} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  }
                </div>
              </div>
            </div>

            {/* CGU */}
            <div onClick={() => setAcceptCGU(v => !v)} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 16px", background: inputBg, border: `1px solid ${acceptCGU ? "rgba(245,166,35,0.25)" : inputBrd}`, borderRadius: "14px", marginBottom: "18px", cursor: "pointer", transition: "border-color 0.2s" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "6px", background: acceptCGU ? "#F5A623" : "transparent", border: `2px solid ${acceptCGU ? "#F5A623" : inputBrd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px", transition: "all 0.15s" }}>
                {acceptCGU && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <div style={{ color: txt2, fontSize: "12px", lineHeight: 1.6 }}>
                J&apos;accepte les{" "}
                <Link href="/cgu" onClick={e => { e.stopPropagation(); try { localStorage.setItem(YELEN224_CGU_LIEN_OUVERT_KEY, "1"); } catch {} }} style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Conditions d&apos;utilisation</Link>
                {" "}et la{" "}
                <Link href="/confidentialite" onClick={e => { e.stopPropagation(); try { localStorage.setItem(YELEN224_CGU_LIEN_OUVERT_KEY, "1"); } catch {} }} style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Politique de confidentialité</Link>
                {" "}de Yelen224.
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>
                </svg>
                <span style={{ color: errText, fontSize: "13px", fontWeight: "600", flex: 1 }}>{error}</span>
                <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: errText, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            <button onClick={handleSubmitInfo} disabled={!canSubmit} className="tap" style={{
              width: "100%", padding: "16px",
              background: canSubmit ? "#F5A623" : inputBg,
              color: canSubmit ? "#080812" : txt2,
              border: canSubmit ? "none" : `1px solid ${inputBrd}`,
              borderRadius: "16px", fontSize: "15px", fontWeight: "900",
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "14px", transition: "all 0.2s",
            }}>
              {loading
                ? <><YelenLoader size={16} color="#080812"/> Vérification…</>
                : <>Continuer <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg></>
              }
            </button>
          </div>
        )}

        {step === "otp" && (
          <div key="otp" className="step-in">
            {/* Récap profil */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "transparent", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "16px", marginBottom: "22px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>
                {`${form.prenom[0]||""}${form.nom[0]||""}`.toUpperCase() || "C"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: txt1, fontSize: "14px", fontWeight: "800" }}>{form.prenom} {form.nom}</div>
                <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "600" }}>{masquerPhoneGuinee(form.phone)}</div>
              </div>
              <button onClick={() => { setStep("identite"); setCode(["","","","","",""]); setError(""); }} className="tap" style={{ background: "none", border: "none", color: txt2, cursor: "pointer", padding: "4px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>

            {/* OTP inputs */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Code à 6 chiffres</div>
              <div style={{ display: "flex", gap: "9px", justifyContent: "center" }}>
                {code.map((digit, i) => (
                  <input key={i} ref={otpRefs[i]} type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="otp-box"
                    style={{ width: "46px", height: "56px", textAlign: "center", fontSize: "22px", fontWeight: "900", background: digit ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : inputBg, border: `2px solid ${digit ? txt1 : inputBrd}`, borderRadius: "14px", color: txt1, transition: "all 0.15s" }}
                  />
                ))}
              </div>
            </div>

            {/* Modernisé et repassé en noir/neutre (retour Bryan 03/09/2026,
                même correctif que app/login/page.tsx) — plus aucun doré sur
                un message de sécurité. */}
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
                code en clair à l'écran. */}

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", marginBottom: "14px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>
                </svg>
                <span style={{ color: errText, fontSize: "13px", fontWeight: "600", flex: 1 }}>{error}</span>
                <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: errText, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}
            {accountExists && (
              <div style={{ textAlign: "center", marginTop: "-6px", marginBottom: "14px" }}>
                <Link href="/login" style={{ color: "#F5A623", fontWeight: "700", fontSize: "13px", textDecoration: "none" }}>Se connecter avec ce numéro →</Link>
              </div>
            )}

            <button onClick={handleVerify} disabled={loading || code.join("").length < 6} className="tap" style={{
              width: "100%", padding: "16px",
              background: success ? "#22c55e" : !loading && code.join("").length === 6 ? "#F5A623" : inputBg,
              color: success ? "#fff" : !loading && code.join("").length === 6 ? "#080812" : txt2,
              border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "900",
              cursor: !loading && code.join("").length === 6 ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "12px", transition: "background 0.25s",
            }}>
              {success
                ? <><svg className="pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Compte créé !</>
                : loading
                ? <><YelenLoader size={16} color="#080812"/> Création du compte…</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Confirmer et créer mon compte
                  </>
              }
            </button>
            <button onClick={() => { setStep("identite"); setCode(["","","","","",""]); setError(""); }} className="tap" style={{ width: "100%", padding: "13px", background: "transparent", border: `1px solid ${inputBrd}`, borderRadius: "14px", color: txt2, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              Modifier les informations
            </button>
          </div>
        )}
        </>
        )}

      </div>
    </div>
  );
}