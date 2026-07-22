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

const C = {
  gold: "#F5A623", goldD: "#C8940A", goldBg: "#FFFBEB", goldBg2: "#FEF3C7",
  white: "#FFFFFF", dark: "#1C1400", dark2: "#3D2E00", gray: "#92836A", gray3: "#EDE8D8",
  red: "#DC2626", redL: "#FEF2F2", border: "rgba(245,166,35,0.2)",
};

export function MembreLoginSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [headerH, setHeaderH] = useState(70);
  const [identifiant, setIdentifiant] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [doitChangerPin, setDoitChangerPin] = useState<{ institutionId: string; membreId: string } | null>(null);
  const [nouveauPin, setNouveauPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

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

  function close() {
    setOpen(false);
    setError("");
  }

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
    if (j.doitChangerPin) { setDoitChangerPin({ institutionId: j.institutionId, membreId: j.membreId }); return; }
    router.push(`/institution/${j.institutionId}/dashboard`);
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
  };

  const css = `
    @keyframes membreSlideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes membreScaleIn{from{transform:translate(-50%,-50%) scale(0.96);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}
    @keyframes membreFadeIn{from{opacity:0}to{opacity:1}}
    .membre-modal-backdrop{ display:none; }
    .membre-modal-sheet{
      position:fixed; left:0; right:0; bottom:0; top:${headerH}px; z-index:201;
      background:${C.white}; border-radius:20px 20px 0 0;
      display:flex; flex-direction:column; overflow:hidden;
      animation: membreSlideUp .28s cubic-bezier(.2,.8,.2,1);
      box-shadow: 0 -8px 40px rgba(28,20,0,0.18);
    }
    @media (min-width: 860px){
      .membre-modal-backdrop{
        display:block; position:fixed; inset:0; z-index:200;
        background:rgba(20,15,0,0.55); backdrop-filter:blur(4px);
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
        Vous êtes un membre de l'équipe ? <span style={{ color: C.gold }}>Connectez-vous ici</span>
      </button>

      {open && (
        <>
          <style>{css}</style>
          <div className="membre-modal-backdrop" onClick={close} />
          <div className="membre-modal-sheet" role="dialog" aria-modal="true" aria-label="Connexion membre de l'équipe">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ color: C.dark2, fontSize: "12px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase" }}>
                {doitChangerPin ? "Premier accès" : "Accès membre"}
              </span>
              <button onClick={close} className="tap" aria-label="Fermer" style={{ width: "32px", height: "32px", borderRadius: "10px", border: "none", background: C.gray3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px", minHeight: 0 }}>
              {!doitChangerPin ? (
                <div style={{ animation: "membreFadeIn .2s ease" }}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <h2 style={{ color: C.dark, fontSize: "19px", fontWeight: "900", textAlign: "center", marginBottom: "4px" }}>Connexion membre</h2>
                  <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "20px" }}>Identifiant et code PIN fournis par votre institution</p>

                  {error && <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px", textAlign: "center" }}>{error}</div>}

                  <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Identifiant</label>
                  <input value={identifiant} onChange={e => setIdentifiant(e.target.value)} placeholder="ex. jdupont" style={inputStyle} autoFocus/>

                  <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Code PIN</label>
                  <input type="password" inputMode="numeric" maxLength={6} placeholder="6 chiffres" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && connexion()} style={{ ...inputStyle, marginBottom: "18px", fontSize: "18px", letterSpacing: "5px", textAlign: "center" }}/>

                  <button onClick={connexion} disabled={loading || !identifiant.trim() || pin.length !== 6} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: C.dark, fontWeight: "800", fontSize: "14.5px", cursor: "pointer", opacity: loading || !identifiant.trim() || pin.length !== 6 ? 0.5 : 1, boxShadow: `0 6px 20px ${C.gold}35` }}>
                    {loading ? "…" : "Se connecter"}
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

                  <input type="password" inputMode="numeric" maxLength={6} placeholder="Nouveau PIN (6 chiffres)" value={nouveauPin} onChange={e => setNouveauPin(e.target.value.replace(/\D/g, ""))} style={{ ...inputStyle, fontSize: "18px", letterSpacing: "5px", textAlign: "center" }} autoFocus/>
                  <input type="password" inputMode="numeric" maxLength={6} placeholder="Confirmer le PIN" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))} style={{ ...inputStyle, marginBottom: "18px", fontSize: "18px", letterSpacing: "5px", textAlign: "center" }}/>

                  <button onClick={changerPin} disabled={loading || nouveauPin.length !== 6} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: C.dark, fontWeight: "800", fontSize: "14.5px", cursor: "pointer", opacity: loading || nouveauPin.length !== 6 ? 0.5 : 1, boxShadow: `0 6px 20px ${C.gold}35` }}>
                    {loading ? "…" : "Valider"}
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
