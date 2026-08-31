"use client";

// Onglet "Profil" — écran personnel, accessible à tous les rôles (contraste
// avec "Paramètres", institutionnel et réservé admin). Réutilise
// PATCH /api/institution/membres (isSelfPinChange, déjà existant) pour le
// changement de PIN — aucune nouvelle route.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { ROLE_LABELS, isMembreRole, type MembreRole } from "@/lib/institutionPermissions";
import { YelenLoader } from "@/components/YelenLoader";

export function ProfilTab({ onToast }: { onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [loading, setLoading] = useState(true);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState<MembreRole | null>(null);
  const [showChangerPin, setShowChangerPin] = useState(false);
  const [nouveauPin, setNouveauPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/institution/membres");
      const j = await res.json().catch(() => null);
      if (res.ok && isMembreRole(j?.role)) {
        setRole(j.role);
        const moi = (j?.membres ?? []).find((m: { id: string }) => m.id === j.membreId);
        if (moi) { setPrenom(moi.prenom ?? ""); setNom(moi.nom ?? ""); }
      }
      setLoading(false);
    })();
  }, []);

  async function changerPin() {
    if (!/^\d{6}$/.test(nouveauPin)) return;
    setSaving(true);
    const res = await fetch("/api/institution/membres", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: nouveauPin }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Erreur lors du changement de PIN", C.red); return; }
    setShowChangerPin(false); setNouveauPin("");
    onToast("PIN mis à jour", C.green);
  }

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <YelenLoader size={28}/>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Profil</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px" }}>Vos informations personnelles de connexion.</p>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "18px", marginBottom: "18px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: C.gold, flexShrink: 0 }}>
            {(prenom[0] ?? "").toUpperCase()}{(nom[0] ?? "").toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800" }}>{prenom} {nom}</div>
            <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{role ? ROLE_LABELS[role] : ""}</div>
          </div>
        </div>

        {showChangerPin ? (
          <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "10px" }}>Nouveau PIN à 6 chiffres</div>
            <input value={nouveauPin} onChange={e => setNouveauPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} placeholder="6 chiffres" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "10px", fontSize: "15px", color: C.t1, textAlign: "center", letterSpacing: "3px", marginBottom: "12px" }}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button onClick={() => { setShowChangerPin(false); setNouveauPin(""); }} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "13px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>Annuler</button>
              <button onClick={changerPin} disabled={saving || !/^\d{6}$/.test(nouveauPin)} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: saving || !/^\d{6}$/.test(nouveauPin) ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{saving ? <YelenLoader size={14} color="#000"/> : "Valider"}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowChangerPin(true)} className="tap" style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, color: C.t1, fontWeight: "700", fontSize: "13px", padding: "13px", borderRadius: "12px", cursor: "pointer" }}>Changer mon PIN</button>
        )}
      </div>
    </div>
  );
}
