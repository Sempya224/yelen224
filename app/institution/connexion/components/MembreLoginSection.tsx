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
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YelenLoader } from "@/components/YelenLoader";

// Accent de marque — fixe, jamais dérivé du thème clair/sombre (même
// convention que app/institution/connexion/page.tsx).
const GOLD = { gold: "#F5A623", goldD: "#C8940A" };

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

  // 2FA TOTP (chantier sécurité institution, 25/07/2026) — ce composant
  // gère sa propre connexion de bout en bout (pas de "setup" d'accès rapide
  // ici, contrairement au flux principal), donc son propre sous-état TOTP.
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBackupMode, setTotpBackupMode] = useState(false);

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
    if (!res.ok) { setError(j?.error || "Erreur de connexion"); return; }
    if (j.requiresTotp) { setTotpToken(j.totpToken); setTotpCode(""); setTotpBackupMode(false); setError(""); return; }
    if (j.doitChangerPin) { setDoitChangerPin({ institutionId: j.institutionId, membreId: j.membreId }); return; }
    router.push(`/institution/${j.institutionId}/dashboard`);
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
    if (!res.ok || !j?.success) { setError(j?.error || "Code invalide"); return; }
    router.push(`/institution/${j.institution.id}/dashboard`);
  }

  async function changerPin() {
    if (nouveauPin.length !== 6 || nouveauPin !== confirmPin) { setError("Les deux codes doivent correspondre (6 chiffres)"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/institution/membres", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: doitChangerPin!.membreId, pin: nouveauPin }),
    });
    setLoading(false);
    if (!res.ok) { setError("Erreur lors du changement de PIN"); return; }
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
          <div className="membre-modal-sheet" role="dialog" aria-modal="true" aria-label="Connexion membre de l'équipe">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ color: C.dark2, fontSize: "12px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase" }}>
                {doitChangerPin ? "Premier accès" : totpToken ? "Double authentification" : "Accès membre"}
              </span>
              <button onClick={close} className="tap" aria-label="Fermer" style={{ width: "32px", height: "32px", borderRadius: "10px", border: "none", background: C.gray3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px", minHeight: 0 }}>
              {totpToken ? (
                <div style={{ animation: "membreFadeIn .2s ease" }}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h2 style={{ color: C.dark, fontSize: "19px", fontWeight: "900", textAlign: "center", marginBottom: "4px" }}>Code de vérification</h2>
                  <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "20px" }}>
                    {totpBackupMode ? "Entrez un code de secours" : "Entrez le code de votre application d'authentification"}
                  </p>

                  {error && <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px", textAlign: "center" }}>{error}</div>}

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
                  <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <h2 style={{ color: C.dark, fontSize: "19px", fontWeight: "900", textAlign: "center", marginBottom: "4px" }}>Connexion membre</h2>
                  <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "20px" }}>Identifiant et code PIN fournis par votre institution</p>

                  {error && <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px", textAlign: "center" }}>{error}</div>}

                  <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Identifiant</label>
                  <input className="membre-inp" value={identifiant} onChange={e => setIdentifiant(e.target.value)} placeholder="ex. jdupont" style={inputStyle} autoFocus/>

                  <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Code PIN</label>
                  <input className="membre-inp" type="password" inputMode="numeric" maxLength={6} placeholder="6 chiffres" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && connexion()} style={{ ...inputStyle, marginBottom: "18px", fontSize: "18px", letterSpacing: "5px", textAlign: "center" }}/>

                  <button onClick={connexion} disabled={loading || !identifiant.trim() || pin.length !== 6} className="tap" style={ctaStyle(loading || !identifiant.trim() || pin.length !== 6)}>
                    {loading ? <YelenLoader size={16} color={C.dark}/> : "Se connecter"}
                  </button>
                </div>
              ) : (
                <div style={{ animation: "membreFadeIn .2s ease" }}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h2 style={{ color: C.dark, fontSize: "19px", fontWeight: "900", textAlign: "center", marginBottom: "4px" }}>Choisissez votre PIN</h2>
                  <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "18px" }}>Premier accès — définissez un code personnel à 6 chiffres</p>

                  {error && <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px", textAlign: "center" }}>{error}</div>}

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
