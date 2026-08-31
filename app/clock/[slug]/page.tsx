"use client";

// Portail employé Clock In Shift — yelen224.com/clock/{institution}
// (décision CEO 26/07/2026, URL V1 sans sous-domaine). Écran public,
// distinct du dashboard institution : volontairement simple (un login,
// un bouton), pensé pour un kiosque partagé ou le téléphone personnel de
// l'employé, "en quelques secondes" (brief CEO). Palette calquée sur
// MembreLoginSection.tsx (app/institution/connexion/components/) — carte
// blanche + accent doré, indépendante du thème dark/light du reste du
// site, même convention que l'autre écran de connexion par Identifiant+PIN
// le plus proche.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { YelenLogo } from "@/components/YelenLogo";
import { YelenLoader } from "@/components/YelenLoader";

const C = {
  gold: "#F5A623", goldD: "#C8940A",
  white: "#FFFFFF", pageBg: "#FAFAF7", dark: "#1C1400", dark2: "#3D2E00",
  gray: "#92836A", gray3: "#EDE8D8", green: "#0F8A5F", greenL: "#ECFDF5",
  red: "#DC2626", redL: "#FEF2F2", border: "rgba(245,166,35,0.2)",
};

const PIN_REGEX = /^\d{4}$/;

type Employe = { employeeId: string; role: string; nom: string; prenom: string };
type DernierPointage = { typeAction: "entree" | "sortie"; horodatage: string; message: string };

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: "12px",
  border: `1.5px solid ${C.border}`, marginBottom: "10px",
  fontSize: "15px", color: C.dark, backgroundColor: C.white,
};

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ClockPortalPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [phase, setPhase] = useState<"chargement" | "connexion" | "pointage">("chargement");
  const [employe, setEmploye] = useState<Employe | null>(null);
  const [identifiant, setIdentifiant] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dernier, setDernier] = useState<DernierPointage | null>(null);

  const verifierSession = useCallback(async () => {
    const res = await fetch("/api/clock/auth/me");
    if (res.ok) {
      const j = await res.json();
      setEmploye(j);
      setPhase("pointage");
    } else {
      setPhase("connexion");
    }
  }, []);

  useEffect(() => { verifierSession(); }, [verifierSession]);

  async function connexion() {
    if (!identifiant.trim() || !PIN_REGEX.test(pin)) return;
    setLoading(true); setError("");
    const res = await fetch("/api/clock/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, identifiant: identifiant.trim(), pin }),
    });
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) { setError(j?.error || "Erreur de connexion"); return; }
    setEmploye({ employeeId: j.employeeId, role: j.role, nom: j.nom, prenom: j.prenom });
    setPin("");
    setPhase("pointage");
  }

  async function pointer() {
    setLoading(true); setError(""); setDernier(null);
    const res = await fetch("/api/clock/pointage", { method: "POST" });
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) { setError(j?.error || "Erreur de pointage"); return; }
    setDernier({ typeAction: j.typeAction, horodatage: j.horodatage, message: j.message });
  }

  async function deconnexion() {
    await fetch("/api/clock/auth/logout", { method: "POST" });
    setEmploye(null); setDernier(null); setIdentifiant(""); setPin(""); setError("");
    setPhase("connexion");
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
        <YelenLogo size={20} color={C.gold}/>
        <span style={{ color: C.dark, fontSize: "14px", fontWeight: 900, letterSpacing: "-0.3px" }}>Yelen224</span>
        <span style={{ color: C.gray, fontSize: "12px", fontWeight: 700 }}>Clock In Shift</span>
      </div>

      <div style={{ backgroundColor: C.white, borderRadius: "20px", padding: "32px 26px", width: "100%", maxWidth: "380px", boxShadow: "0 8px 40px rgba(28,20,0,0.10)", border: `1px solid ${C.border}` }}>
        {phase === "chargement" && (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={24} color={C.gold}/></div>
        )}

        {phase === "connexion" && (
          <>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
            </div>
            <h1 style={{ color: C.dark, fontSize: "19px", fontWeight: 900, textAlign: "center", marginBottom: "4px" }}>Pointage employé</h1>
            <p style={{ color: C.gray, fontSize: "12.5px", textAlign: "center", marginBottom: "20px" }}>Identifiant et code PIN fournis par votre employeur</p>

            {error && <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: 700, padding: "10px 12px", borderRadius: "10px", marginBottom: "12px", textAlign: "center" }}>{error}</div>}

            <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Identifiant</label>
            <input value={identifiant} onChange={e => setIdentifiant(e.target.value)} placeholder="ex. ECO-00123" style={inputStyle} autoFocus/>

            <label style={{ color: C.dark2, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Code PIN</label>
            <input type="password" inputMode="numeric" maxLength={4} placeholder="4 chiffres" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={e => e.key === "Enter" && connexion()} style={{ ...inputStyle, marginBottom: "18px", fontSize: "18px", letterSpacing: "6px", textAlign: "center" }}/>

            <button onClick={connexion} disabled={loading || !identifiant.trim() || !PIN_REGEX.test(pin)} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: C.dark, fontWeight: 800, fontSize: "14.5px", cursor: "pointer", opacity: loading || !identifiant.trim() || !PIN_REGEX.test(pin) ? 0.5 : 1, boxShadow: `0 6px 20px ${C.gold}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {loading ? <YelenLoader size={16} color={C.dark}/> : "Se connecter"}
            </button>
          </>
        )}

        {phase === "pointage" && employe && (
          <>
            <div style={{ textAlign: "center", marginBottom: "22px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: "18px", fontWeight: 900, color: C.goldD }}>
                {employe.prenom.slice(0, 1).toUpperCase()}{employe.nom.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ color: C.dark, fontSize: "17px", fontWeight: 900 }}>{employe.prenom} {employe.nom}</div>
            </div>

            {error && <div style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: 700, padding: "10px 12px", borderRadius: "10px", marginBottom: "14px", textAlign: "center" }}>{error}</div>}

            {dernier && (
              <div style={{ backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "12px", padding: "14px", marginBottom: "16px", textAlign: "center" }}>
                <div style={{ color: C.green, fontSize: "14px", fontWeight: 800 }}>{dernier.message}</div>
                <div style={{ color: C.gray, fontSize: "12px", marginTop: "3px" }}>{formatHeure(dernier.horodatage)}</div>
              </div>
            )}

            <button onClick={pointer} disabled={loading} className="tap" style={{ width: "100%", padding: "22px", borderRadius: "16px", border: "none", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: C.dark, fontWeight: 900, fontSize: "16px", cursor: "pointer", opacity: loading ? 0.6 : 1, boxShadow: `0 8px 28px ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "14px" }}>
              {loading ? <YelenLoader size={18} color={C.dark}/> : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                  Pointer ma présence
                </>
              )}
            </button>

            <button onClick={deconnexion} style={{ width: "100%", background: "none", border: "none", color: C.gray, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: "8px" }}>Se déconnecter</button>
          </>
        )}
      </div>
    </div>
  );
}
