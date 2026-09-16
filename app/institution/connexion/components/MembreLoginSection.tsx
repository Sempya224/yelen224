"use client";

// Connexion membre de l'équipe (identifiant + PIN) — composant autonome,
// monté sous le flux téléphone+OTP existant de la page connexion, sans en
// modifier la logique. Fondation multi-comptes (migration 20260714000001).
//
// Rendu en overlay plutôt qu'en expansion inline : sur mobile un panneau
// plein écran sous le header (style feuille), sur PC une boîte de dialogue
// centrée avec fond assombri — évite l'allongement/scroll de la page de
// connexion que provoquait l'ancienne version accordéon.
import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YelenLoader } from "@/components/YelenLoader";
import { ROLE_LABELS, type MembreRole } from "@/lib/institutionPermissions";
import { AvatarInstitution } from "@/components/CommunautePostCard";

// Accent de marque — fixe, jamais dérivé du thème clair/sombre (même
// convention que app/institution/connexion/page.tsx).
const GOLD = { gold: "#F5A623", goldD: "#C8940A" };

type OnboardingData = {
  institution: { name: string; logo: string | null; secteurLabel: string | null; ville: string | null; adresse: string | null; pays: string | null; email: string | null; phone: string | null };
  inviteur: { prenom: string; nom: string; role: MembreRole } | null;
  moi: { prenom: string; nom: string; role: MembreRole; fonction: string | null };
  permissions: string[];
};
type OnboardingStep = "reconnaissance" | "nonreconnu" | "confirmation" | "bienvenue";

type ColorTokens = {
  gold: string; goldD: string; white: string; dark: string; dark2: string;
  gray: string; gray3: string; red: string; redL: string; border: string; shadow: string;
};

// Sas de confiance de première connexion — composant module-level (pas
// imbriqué dans MembreLoginSection) : un composant défini à l'intérieur
// d'un parent perd le focus de ses inputs à chaque frappe (React
// démonte/remonte le sous-arbre), piège déjà rencontré ailleurs sur ce
// projet (voir CLAUDE.md, /pieges-techniques-connus).
function OnboardingContent({
  C, step, data, relationOk, setRelationOk, cguOk, setCguOk, busy, error, setError,
  onContinuerReconnaissance, onNonReconnu, onQuitter, onRetourReconnaissance, onConfirmer, onAcceder,
  ctaStyle, inputStyle,
}: {
  C: ColorTokens;
  step: OnboardingStep;
  data: OnboardingData | null;
  relationOk: boolean; setRelationOk: (v: boolean) => void;
  cguOk: boolean; setCguOk: (v: boolean) => void;
  busy: boolean;
  error: string; setError: (v: string) => void;
  onContinuerReconnaissance: () => void;
  onNonReconnu: () => void;
  onQuitter: () => void;
  onRetourReconnaissance: () => void;
  onConfirmer: () => void;
  onAcceder: () => void;
  ctaStyle: (disabled: boolean) => React.CSSProperties;
  inputStyle: React.CSSProperties;
}) {
  if (!data) return <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={24}/></div>;

  const errorBanner = error ? (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px" }}>
      <span style={{ flex: 1 }}>{error}</span>
      <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  ) : null;

  const inst = data.institution;
  const localisation = [inst.adresse, inst.ville, inst.pays].filter(Boolean).join(", ");

  const carteEtablissement = (
    <div style={{ border: `1.5px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: (localisation || data.inviteur) ? "12px" : 0 }}>
        <AvatarInstitution nom={inst.name} logo={inst.logo} taille={44} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.dark, fontWeight: 800, fontSize: "14.5px" }}>{inst.name}</div>
          {inst.secteurLabel && <div style={{ color: C.gray, fontSize: "11.5px" }}>{inst.secteurLabel}</div>}
        </div>
      </div>
      {localisation && (
        <div style={{ color: C.dark2, fontSize: "12px", marginBottom: data.inviteur ? "10px" : 0 }}>{localisation}</div>
      )}
      {data.inviteur && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "10px", fontSize: "12px" }}>
          <span style={{ color: C.gray }}>Invité par </span>
          <span style={{ color: C.dark, fontWeight: 700 }}>{data.inviteur.prenom} {data.inviteur.nom}</span>
          <span style={{ color: C.gray }}> · {ROLE_LABELS[data.inviteur.role]}</span>
        </div>
      )}
    </div>
  );

  if (step === "reconnaissance") {
    return (
      <div style={{ animation: "membreFadeIn .2s ease" }}>
        <h2 style={{ color: C.dark, fontSize: "18px", fontWeight: "900", textAlign: "center", marginBottom: "6px", lineHeight: 1.3 }}>Vous avez été invité à rejoindre une organisation</h2>
        <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "18px" }}>
          <strong style={{ color: C.dark }}>{inst.name}</strong> vous a invité à rejoindre son espace Yelen.
        </p>

        {carteEtablissement}

        <p style={{ color: C.dark2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "10px" }}>
          Prenez quelques secondes pour vérifier ces informations. Cette invitation vous donne accès à l&apos;espace Yelen de cette organisation.
        </p>
        <p style={{ color: C.dark, fontSize: "12.5px", fontWeight: 700, lineHeight: 1.5, marginBottom: "20px" }}>
          Si vous ne reconnaissez pas cette organisation ou si vous n&apos;attendiez pas cette invitation, ne continuez pas.
        </p>

        <button onClick={onContinuerReconnaissance} className="tap" style={ctaStyle(false)}>Continuer</button>
        <div style={{ textAlign: "center", marginTop: "12px" }}>
          <button onClick={onNonReconnu} className="tap" style={{ background: "none", border: "none", color: C.red, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
            Je ne reconnais pas cette organisation
          </button>
        </div>
      </div>
    );
  }

  if (step === "nonreconnu") {
    return (
      <div style={{ animation: "membreFadeIn .2s ease" }}>
        <h2 style={{ color: C.dark, fontSize: "18px", fontWeight: "900", textAlign: "center", marginBottom: "6px" }}>Vous n&apos;êtes pas sûr de cette invitation ?</h2>
        <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "18px" }}>
          Pour votre sécurité, nous n&apos;allons pas vous donner accès à cet espace.
        </p>

        {data.inviteur && (
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px", fontSize: "12.5px" }}>
            <div style={{ color: C.gray, marginBottom: "4px" }}>Cette invitation a été envoyée par</div>
            <div style={{ color: C.dark, fontWeight: 700 }}>{data.inviteur.prenom} {data.inviteur.nom}</div>
            <div style={{ color: C.gray }}>{ROLE_LABELS[data.inviteur.role]} de {inst.name}</div>
          </div>
        )}

        {(inst.email || inst.phone) && (
          <a
            href={inst.email ? `mailto:${inst.email}` : `tel:${inst.phone}`}
            className="tap"
            style={{ ...ctaStyle(false), textDecoration: "none", marginBottom: "10px" }}
          >
            Contacter l&apos;organisation
          </a>
        )}

        <button onClick={onQuitter} disabled={busy} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "12px", border: `1.5px solid ${C.border}`, background: "none", color: C.dark2, fontWeight: 800, fontSize: "13.5px", cursor: busy ? "not-allowed" : "pointer", marginBottom: "10px" }}>
          {busy ? <YelenLoader size={16} color={C.dark2}/> : "Quitter"}
        </button>
        <div style={{ textAlign: "center" }}>
          <button onClick={onRetourReconnaissance} className="tap" style={{ background: "none", border: "none", color: C.dark2, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
            Revenir en arrière
          </button>
        </div>
      </div>
    );
  }

  if (step === "confirmation") {
    const canContinuer = relationOk && cguOk;
    return (
      <div style={{ animation: "membreFadeIn .2s ease" }}>
        <h2 style={{ color: C.dark, fontSize: "18px", fontWeight: "900", textAlign: "center", marginBottom: "6px" }}>Confirmez votre accès</h2>
        <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "20px", lineHeight: 1.5 }}>
          Pour protéger votre compte et l&apos;organisation qui vous accueille, nous avons besoin de vérifier deux choses avant de vous donner accès à Yelen.
        </p>

        {errorBanner}

        <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "16px", cursor: "pointer" }}>
          <input type="checkbox" checked={relationOk} onChange={e => setRelationOk(e.target.checked)} style={{ marginTop: "3px", width: "16px", height: "16px", flexShrink: 0, accentColor: C.gold }} />
          <span style={{ fontSize: "12.5px", lineHeight: 1.5 }}>
            <span style={{ color: C.dark, fontWeight: 700 }}>Je reconnais cette organisation et je confirme avoir une relation professionnelle avec elle.</span>
            <br/><span style={{ color: C.gray }}>Je confirme que je travaille avec cette organisation, que je suis mandaté(e) par elle ou que j&apos;ai été autorisé(e) à rejoindre cet espace Yelen.</span>
          </span>
        </label>

        <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "22px", cursor: "pointer" }}>
          <input type="checkbox" checked={cguOk} onChange={e => setCguOk(e.target.checked)} style={{ marginTop: "3px", width: "16px", height: "16px", flexShrink: 0, accentColor: C.gold }} />
          <span style={{ fontSize: "12.5px", lineHeight: 1.5 }}>
            <span style={{ color: C.dark, fontWeight: 700 }}>J&apos;accepte les Conditions d&apos;utilisation et les règles de la plateforme Yelen.</span>
            <br/><span style={{ color: C.gray }}>
              En continuant, vous acceptez les <a href="/cgu" target="_blank" rel="noopener noreferrer" style={{ color: C.goldD, fontWeight: 700 }}>Conditions d&apos;utilisation</a> et la <a href="/confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: C.goldD, fontWeight: 700 }}>Politique de confidentialité</a> de Yelen.
            </span>
          </span>
        </label>

        <button onClick={onConfirmer} disabled={!canContinuer || busy} className="tap" style={ctaStyle(!canContinuer || busy)}>
          {busy ? <YelenLoader size={16} color={C.dark}/> : "Continuer"}
        </button>
      </div>
    );
  }

  // step === "bienvenue"
  const moi = data.moi;
  return (
    <div style={{ animation: "membreFadeIn .2s ease" }}>
      <h2 style={{ color: C.dark, fontSize: "19px", fontWeight: "900", textAlign: "center", marginBottom: "4px" }}>Bienvenue, {moi.prenom} 👋</h2>
      <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "18px" }}>Votre espace Yelen est prêt.</p>

      {carteEtablissement}

      <div style={{ background: `${C.gold}0d`, border: `1px solid ${C.gold}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
        <div style={{ color: C.dark, fontSize: "12.5px", fontWeight: 700, marginBottom: "2px" }}>Pourquoi avez-vous accès à cet espace ?</div>
        <div style={{ color: C.dark2, fontSize: "12px", lineHeight: 1.5 }}>
          {inst.name} vous a ajouté à son équipe Yelen en tant que <strong style={{ color: C.dark }}>{ROLE_LABELS[moi.role]}</strong>.
          Votre accès est limité aux fonctionnalités nécessaires à votre rôle.
        </div>
      </div>

      {data.permissions.length > 0 && (
        <div style={{ marginBottom: "18px" }}>
          <div style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Vous pourrez notamment</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {data.permissions.map(p => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: C.dark }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
        <div style={{ fontSize: "11.5px", color: C.gray }}>🔐 Cet espace est personnel — ne partagez jamais vos identifiants.</div>
        <div style={{ fontSize: "11.5px", color: C.gray }}>👤 Votre administrateur peut modifier votre rôle ou vos accès à tout moment.</div>
      </div>

      <button onClick={onAcceder} className="tap" style={ctaStyle(false)}>Accéder à mon espace Yelen →</button>
    </div>
  );
}

export function MembreLoginSection() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = T[theme];
  const C = {
    gold: GOLD.gold, goldD: GOLD.goldD,
    white:  t.cardBg,
    dark:   t.text,
    dark2:  t.textMuted,
    gray:   t.textSubtle,
    gray3:  isDark ? "rgba(255,255,255,0.08)" : "#EDE8D8",
    red:    "#DC2626",
    redL:   isDark ? "rgba(220,38,38,0.14)" : "#FEF2F2",
    // Neutre au repos (décision Bryan 14/08/2026, même correctif que la page
    // de connexion principale) — le doré n'apparaît plus qu'au focus d'un
    // champ (voir .membre-inp:focus), jamais comme halo permanent.
    border: isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.14)",
    shadow: isDark ? "0 -8px 40px rgba(0,0,0,0.5)" : "0 -8px 40px rgba(20,20,30,0.14)",
  };
  const [open, setOpen] = useState(false);
  const [headerH, setHeaderH] = useState(70);
  const [identifiant, setIdentifiant] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [doitChangerPin, setDoitChangerPin] = useState<{ institutionId: string; membreId: string } | null>(null);
  const [nouveauPin, setNouveauPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Sas de confiance de première connexion (16/09/2026) — inséré entre le
  // changement de PIN obligatoire et l'ouverture du dashboard, jamais à une
  // reconnexion normale (doit_changer_pin redevient false dès ce moment).
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(null);
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [relationOk, setRelationOk] = useState(false);
  const [cguOk, setCguOk] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  // 2FA TOTP (chantier sécurité institution, 25/07/2026) — ce composant
  // gère sa propre connexion de bout en bout (pas de "setup" d'accès rapide
  // ici, contrairement au flux principal), donc son propre sous-état TOTP.
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBackupMode, setTotpBackupMode] = useState(false);

  // Passkey par membre (16/09/2026) — alternative au PIN, jamais un
  // remplacement (voir PasskeySection.tsx côté "Administration & accès"
  // pour l'enregistrement). Même identifiant que le formulaire PIN, la
  // bascule ne fait que changer ce qu'on demande ensuite.
  const [passkeyMode, setPasskeyMode] = useState(false);

  function close() {
    setOpen(false);
    setError("");
  }

  // Verrouille le scroll de la page derrière l'overlay et mesure la hauteur
  // réelle du header pour ne jamais le recouvrir sur mobile.
  useEffect(() => {
    if (!open) return;
    const headerEl = document.querySelector("header");
    if (headerEl) setHeaderH(headerEl.getBoundingClientRect().height);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function connexion() {
    if (!identifiant.trim() || pin.length !== 6) return;
    setLoading(true); setError("");
    const res = await fetch("/api/institution/auth/membre/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiant: identifiant.trim(), pin }),
    });
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) { setError(j?.error || "Nous n'avons pas pu vous connecter. Vérifiez vos identifiants et réessayez."); return; }
    if (j.requiresTotp) { setTotpToken(j.totpToken); setTotpCode(""); setTotpBackupMode(false); setError(""); return; }
    if (j.doitChangerPin) { setDoitChangerPin({ institutionId: j.institutionId, membreId: j.membreId }); return; }
    router.push(`/institution/${j.institutionId}/dashboard`);
  }

  async function connexionPasskey() {
    if (!identifiant.trim()) return;
    setLoading(true); setError("");
    try {
      const optRes = await fetch("/api/institution/auth/webauthn/membre/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiant: identifiant.trim() }),
      });
      const optData = await optRes.json().catch(() => null);
      if (!optRes.ok) { setLoading(false); setError(optData?.error || "Impossible de vous connecter avec cette clé d'accès."); return; }

      let assertion;
      try {
        assertion = await startAuthentication({ optionsJSON: optData.options });
      } catch {
        setLoading(false); setError("Connexion annulée.");
        return;
      }

      const verifyRes = await fetch("/api/institution/auth/webauthn/membre/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiant: identifiant.trim(), credential: assertion, challengeToken: optData.challengeToken }),
      });
      const j = await verifyRes.json().catch(() => null);
      setLoading(false);
      if (!verifyRes.ok) { setError(j?.error || "Nous n'avons pas pu vous connecter avec cette clé d'accès."); return; }
      if (j.requiresTotp) { setTotpToken(j.totpToken); setTotpCode(""); setTotpBackupMode(false); setError(""); return; }
      router.push(`/institution/${j.institutionId}/dashboard`);
    } catch {
      setLoading(false); setError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
    }
  }

  async function verifierTotp() {
    if (!totpToken || !totpCode.trim()) return;
    setLoading(true); setError("");
    const res = await fetch("/api/institution/auth/totp/login-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totpToken, code: totpCode.trim() }),
    });
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !j?.success) { setError(j?.error || "Ce code ne semble pas correct."); return; }
    router.push(`/institution/${j.institution.id}/dashboard`);
  }

  async function changerPin() {
    if (nouveauPin.length !== 6 || nouveauPin !== confirmPin) { setError("Les deux codes doivent être identiques et contenir 6 chiffres."); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/institution/membres", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: doitChangerPin!.membreId, pin: nouveauPin }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { setLoading(false); setError(j?.error || "Nous n'avons pas pu enregistrer votre nouveau code. Réessayez."); return; }
    await chargerOnboarding();
  }

  // Ne bloque jamais l'accès si cet appel échoue (dashboard réel disponible
  // dans tous les cas) — un problème sur ce sas ne doit jamais empêcher un
  // membre légitime de travailler.
  async function chargerOnboarding() {
    const res = await fetch("/api/institution/auth/premiere-connexion");
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !j) { router.push(`/institution/${doitChangerPin!.institutionId}/dashboard`); return; }
    setOnboardingData(j);
    setOnboardingStep("reconnaissance");
  }

  async function confirmerOnboarding() {
    if (!relationOk || !cguOk) return;
    setOnboardingBusy(true); setError("");
    const res = await fetch("/api/institution/auth/premiere-connexion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirmer" }),
    });
    setOnboardingBusy(false);
    if (!res.ok) { setError("Nous n'avons pas pu enregistrer votre confirmation. Réessayez."); return; }
    setOnboardingStep("bienvenue");
  }

  async function signalerNonReconnu() {
    setOnboardingBusy(true);
    await fetch("/api/institution/auth/premiere-connexion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "non_reconnu" }),
    }).catch(() => {});
    setOnboardingBusy(false);
    close();
    setOnboardingStep(null); setOnboardingData(null); setDoitChangerPin(null);
    setIdentifiant(""); setPin(""); setNouveauPin(""); setConfirmPin("");
  }

  function accederAuDashboard() {
    router.push(`/institution/${doitChangerPin!.institutionId}/dashboard`);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", borderRadius: "12px",
    border: `1.5px solid ${C.border}`, marginBottom: "10px",
    fontSize: "15px", color: C.dark, backgroundColor: C.white,
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const ctaStyle = (disabled: boolean): React.CSSProperties => ({
    width: "100%", padding: "14px", borderRadius: "12px", border: "none",
    background: disabled ? C.gray3 : C.gold,
    color: disabled ? C.gray : C.dark, fontWeight: "800", fontSize: "14.5px",
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : `0 8px 24px ${C.gold}40`,
    display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
  });

  const css = `
    @keyframes membreSlideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes membreScaleIn{from{transform:translate(-50%,-50%) scale(0.96);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}
    @keyframes membreFadeIn{from{opacity:0}to{opacity:1}}
    .membre-inp:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(245,166,35,0.12)!important;outline:none}
    .membre-modal-backdrop{ display:none; }
    .membre-modal-sheet{
      position:fixed; left:0; right:0; bottom:0; top:${headerH}px; z-index:201;
      background:${C.white}; border-radius:20px 20px 0 0;
      display:flex; flex-direction:column; overflow:hidden;
      animation: membreSlideUp .28s cubic-bezier(.2,.8,.2,1);
      box-shadow: ${C.shadow};
    }
    @media (min-width: 860px){
      .membre-modal-backdrop{
        display:block; position:fixed; inset:0; z-index:200;
        background:rgba(10,10,15,0.6); backdrop-filter:blur(4px);
        animation: membreFadeIn .18s ease;
      }
      .membre-modal-sheet{
        top:50%; left:50%; right:auto; bottom:auto; transform:translate(-50%,-50%);
        width:420px; max-width:92vw; max-height:88vh; border-radius:20px;
        animation: membreScaleIn .2s cubic-bezier(.2,.8,.2,1);
      }
      .membre-modal-sheet.onboarding{ width:480px; }
    }
  `;

  return (
    <div style={{ marginTop: "18px", textAlign: "center" }}>
      <button onClick={() => setOpen(true)} className="tap" style={{ background: "none", border: "none", color: C.gray, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>
        Vous êtes un membre de l&apos;équipe ? <span style={{ color: C.dark, fontWeight: "800" }}>Connectez-vous ici</span>
      </button>

      {open && (
        <>
          <style>{css}</style>
          <div className="membre-modal-backdrop" onClick={close} />
          <div className={`membre-modal-sheet${onboardingStep ? " onboarding" : ""}`} role="dialog" aria-modal="true" aria-label="Connexion membre de l'équipe">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ color: C.dark2, fontSize: "12px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase" }}>
                {onboardingStep === "reconnaissance" ? "Vérification" : onboardingStep === "nonreconnu" ? "Sécurité" : onboardingStep === "confirmation" ? "Confirmation" : onboardingStep === "bienvenue" ? "Bienvenue" : doitChangerPin ? "Premier accès" : totpToken ? "Double authentification" : "Accès membre"}
              </span>
              <button onClick={close} className="tap" aria-label="Fermer" style={{ width: "32px", height: "32px", borderRadius: "10px", border: "none", background: C.gray3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: onboardingStep ? "flex-start" : "center", padding: "28px 24px", minHeight: 0 }}>
              {onboardingStep ? (
                <OnboardingContent
                  C={C}
                  step={onboardingStep}
                  data={onboardingData}
                  relationOk={relationOk} setRelationOk={setRelationOk}
                  cguOk={cguOk} setCguOk={setCguOk}
                  busy={onboardingBusy}
                  error={error} setError={setError}
                  onContinuerReconnaissance={() => setOnboardingStep("confirmation")}
                  onNonReconnu={() => setOnboardingStep("nonreconnu")}
                  onQuitter={signalerNonReconnu}
                  onRetourReconnaissance={() => setOnboardingStep("reconnaissance")}
                  onConfirmer={confirmerOnboarding}
                  onAcceder={accederAuDashboard}
                  ctaStyle={ctaStyle}
                  inputStyle={inputStyle}
                />
              ) : totpToken ? (
                <div style={{ animation: "membreFadeIn .2s ease" }}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h2 style={{ color: C.dark, fontSize: "19px", fontWeight: "900", textAlign: "center", marginBottom: "4px" }}>Saisissez le code</h2>
                  <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "20px" }}>
                    {totpBackupMode ? "Entrez un code de secours" : "Entrez le code de votre application d'authentification"}
                  </p>

                  {error && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px" }}>
                      <span style={{ flex: 1 }}>{error}</span>
                      <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}

                  <input
                    className="membre-inp"
                    type="text"
                    inputMode={totpBackupMode ? "text" : "numeric"}
                    maxLength={totpBackupMode ? 9 : 6}
                    placeholder={totpBackupMode ? "XXXX-XXXX" : "6 chiffres"}
                    value={totpCode}
                    onChange={e => setTotpCode(totpBackupMode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
                    onKeyDown={e => e.key === "Enter" && verifierTotp()}
                    style={{ ...inputStyle, fontSize: "18px", letterSpacing: "4px", textAlign: "center" }}
                    autoFocus
                  />

                  <button onClick={verifierTotp} disabled={loading || !totpCode.trim()} className="tap" style={{ ...ctaStyle(loading || !totpCode.trim()), marginTop: "4px", marginBottom: "12px" }}>
                    {loading ? <YelenLoader size={16} color={C.dark}/> : "Vérifier"}
                  </button>

                  <div style={{ textAlign: "center" }}>
                    <button onClick={() => { setTotpBackupMode(v => !v); setTotpCode(""); setError(""); }} className="tap" style={{ background: "none", border: "none", color: C.dark2, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>
                      {totpBackupMode ? "Utiliser l'application d'authentification" : "Utiliser un code de secours"}
                    </button>
                  </div>
                </div>
              ) : !doitChangerPin ? (
                <div style={{ animation: "membreFadeIn .2s ease" }}>
                  <Image src="/illustrations/connexion-membre.png" alt="Connexion des membres de l'équipe" width={1536} height={1024} style={{ width: "200px", maxWidth: "100%", height: "auto", margin: "0 auto 18px", display: "block" }}/>
                  <h2 style={{ color: C.dark, fontSize: "19px", fontWeight: "900", textAlign: "center", marginBottom: "4px" }}>Connexion membre</h2>
                  <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "20px" }}>Identifiant et code PIN fournis par votre institution</p>

                  {error && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px" }}>
                      <span style={{ flex: 1 }}>{error}</span>
                      <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}

                  <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Identifiant</label>
                  <input className="membre-inp" value={identifiant} onChange={e => setIdentifiant(e.target.value)} placeholder="ex. jdupont" style={inputStyle} autoFocus/>

                  {passkeyMode ? (
                    <button onClick={connexionPasskey} disabled={loading || !identifiant.trim()} className="tap" style={{ ...ctaStyle(loading || !identifiant.trim()), marginTop: "4px" }}>
                      {loading ? <YelenLoader size={16} color={C.dark}/> : "Continuer avec ma clé d'accès"}
                    </button>
                  ) : (
                    <>
                      <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Code PIN</label>
                      <input className="membre-inp" type="password" inputMode="numeric" maxLength={6} placeholder="6 chiffres" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && connexion()} style={{ ...inputStyle, marginBottom: "18px", fontSize: "18px", letterSpacing: "5px", textAlign: "center" }}/>

                      <button onClick={connexion} disabled={loading || !identifiant.trim() || pin.length !== 6} className="tap" style={ctaStyle(loading || !identifiant.trim() || pin.length !== 6)}>
                        {loading ? <YelenLoader size={16} color={C.dark}/> : "Se connecter"}
                      </button>
                    </>
                  )}

                  {browserSupportsWebAuthn() && (
                    <div style={{ textAlign: "center", marginTop: "14px" }}>
                      <button onClick={() => { setPasskeyMode(v => !v); setError(""); }} className="tap" style={{ background: "none", border: "none", color: C.dark2, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>
                        {passkeyMode ? "Utiliser mon code PIN à la place" : "Se connecter avec une clé d'accès"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ animation: "membreFadeIn .2s ease" }}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h2 style={{ color: C.dark, fontSize: "19px", fontWeight: "900", textAlign: "center", marginBottom: "4px" }}>Choisissez votre PIN</h2>
                  <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "18px" }}>Premier accès — définissez un code personnel à 6 chiffres</p>

                  {error && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px" }}>
                      <span style={{ flex: 1 }}>{error}</span>
                      <button onClick={() => setError("")} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}

                  <input className="membre-inp" type="password" inputMode="numeric" maxLength={6} placeholder="Nouveau PIN (6 chiffres)" value={nouveauPin} onChange={e => setNouveauPin(e.target.value.replace(/\D/g, ""))} style={{ ...inputStyle, fontSize: "18px", letterSpacing: "5px", textAlign: "center" }} autoFocus/>
                  <input className="membre-inp" type="password" inputMode="numeric" maxLength={6} placeholder="Confirmer le PIN" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))} style={{ ...inputStyle, marginBottom: "18px", fontSize: "18px", letterSpacing: "5px", textAlign: "center" }}/>

                  <button onClick={changerPin} disabled={loading || nouveauPin.length !== 6} className="tap" style={ctaStyle(loading || nouveauPin.length !== 6)}>
                    {loading ? <YelenLoader size={16} color={C.dark}/> : "Valider"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
