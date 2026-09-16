"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";
import { isWebAuthnSupported, registerBiometrie } from "@/lib/auth/citoyenBiometrie";
import type { NiveauSecurite } from "@/lib/citoyenSecurite";

// Défini au niveau module (pas à l'intérieur de SecuriteClient) — un
// composant redéfini à chaque rendu obtient une nouvelle identité de
// fonction à chaque frappe, ce qui fait démonter/remonter tout son
// sous-arbre par React (perte de focus des champs à l'intérieur, bug
// remonté par Bryan : "obligé de cliquer dans le champ après chaque
// chiffre"). Reçoit `t1` en prop plutôt que de fermer sur une variable
// locale du composant appelant.
function Section({ titre, t2, children }: { titre: string; t2: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "28px" }}>
      <div style={{ color: t2, fontSize: "12px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{titre}</div>
      {children}
    </section>
  );
}

const P = { pointerEvents: "none" as const };
const Ic = {
  Pin:    () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Finger: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M8 11a4 4 0 0 0 8 0"/><path d="M12 18v4"/><path d="M4 15.5A9 9 0 0 0 20 15"/></svg>,
  Device: () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  Trash:  () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
  Check:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Info:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Shield: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

const CONSEILS_SECURITE = [
  "Ne partagez jamais votre code PIN ou vos codes de vérification, même avec le service client.",
  "Yelen ne vous demandera jamais votre code PIN par téléphone, SMS ou message.",
  "Vérifiez régulièrement vos appareils mémorisés et retirez ceux que vous ne reconnaissez pas.",
  "Activez la biométrie en plus du PIN : deux verrous valent mieux qu'un.",
];

type Credential = { id: string; device_label: string | null; created_at: string; last_used_at: string | null };
type RememberDevice = Credential & { user_agent: string | null; ip: string | null; expires_at: string; is_current_device: boolean };
type Statut = {
  pin_configured: boolean;
  totp_enabled: boolean;
  webauthn_credentials: Credential[];
  remember_devices: RememberDevice[];
  score: { valeur: number; niveau: NiveauSecurite; conseils: string[] };
};

function formatDate(iso: string | null): string {
  if (!iso) return "Jamais";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const NIVEAU_COULEUR: Record<NiveauSecurite, string> = { faible: "#ef4444", moyen: "#eab308", fort: "#22c55e" };
const NIVEAU_LABEL: Record<NiveauSecurite, string> = { faible: "Faible", moyen: "Moyenne", fort: "Forte" };

export function SecuriteClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [userId, setUserId] = useState<string | null>(null);
  const [statut, setStatut] = useState<Statut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // id de l'action en cours (bouton désactivé ciblé)

  const [pinForm, setPinForm] = useState<"aucun" | "creer" | "supprimer">("aucun");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinActuel, setPinActuel] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  const [bioForm, setBioForm] = useState<"aucun" | "nommer">("aucun");
  const [bioLabel, setBioLabel] = useState("");

  // 2FA TOTP (chantier sécurité citoyen, 25/07/2026) — mirroring exact du
  // flux admin (app/admin/security/page.tsx) : préparer → confirmer → codes
  // de secours affichés une fois ; désactiver demande un code TOTP (pas de
  // mot de passe côté citoyen, voir /totp/disable).
  const [totpForm, setTotpForm] = useState<"aucun" | "activer" | "desactiver">("aucun");
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpConfirmCode, setTotpConfirmCode] = useState("");
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[] | null>(null);
  const [totpMsg, setTotpMsg] = useState<string | null>(null);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const charger = useCallback(async () => {
    setError(null);
    const accessToken = await getAccessToken();
    if (!accessToken) { setError("Session expirée, reconnectez-vous."); return; }
    const res = await fetch("/api/citoyen/securite/status", { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) { setError(json?.error ?? "Impossible de charger votre statut de sécurité."); return; }
    setStatut(json);
  }, [getAccessToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setUserId(id);
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [router, charger]);

  async function handleActiverBiometrie(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!isWebAuthnSupported()) { setError("La biométrie n'est pas disponible sur cet appareil."); setBioForm("aucun"); return; }
    setBusy("biometrie-activer");
    setError(null);
    const result = await registerBiometrie(userId, bioLabel.trim() || undefined);
    setBusy(null);
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        unsupported: "Aucun capteur d'empreinte/Face ID détecté sur cet appareil.",
        cancelled: "Vérification annulée. Réessayez.",
        server_error: "L'enregistrement biométrique a échoué. Réessayez.",
      };
      setError(messages[result.reason]);
      return;
    }
    setBioForm("aucun"); setBioLabel("");
    await charger();
  }

  async function handleRevoquerCredential(id: string) {
    if (!window.confirm("Retirer cet appareil biométrique ?")) return;
    setBusy(`cred-${id}`);
    setError(null);
    const accessToken = await getAccessToken();
    if (!accessToken) { setError("Session expirée, reconnectez-vous."); setBusy(null); return; }
    const res = await fetch("/api/citoyen/securite/webauthn/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, credentialId: id }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !json?.success) { setError(json?.error ?? "Impossible de retirer cet appareil."); return; }
    if (localStorage.getItem(YELEN224_USER_ID_KEY)) localStorage.removeItem("yelen224_bio_registered");
    await charger();
  }

  async function handleRevoquerAppareil(id: string) {
    if (!window.confirm("Déconnecter cet appareil mémorisé ?")) return;
    setBusy(`dev-${id}`);
    setError(null);
    const accessToken = await getAccessToken();
    if (!accessToken) { setError("Session expirée, reconnectez-vous."); setBusy(null); return; }
    const res = await fetch("/api/citoyen/securite/remember/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, tokenId: id }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !json?.success) { setError(json?.error ?? "Impossible de déconnecter cet appareil."); return; }
    await charger();
  }

  async function handleRevoquerTout() {
    if (!window.confirm("Déconnecter tous les autres appareils mémorisés ?")) return;
    setBusy("dev-all");
    setError(null);
    const accessToken = await getAccessToken();
    if (!accessToken) { setError("Session expirée, reconnectez-vous."); setBusy(null); return; }
    const res = await fetch("/api/citoyen/securite/remember/revoke-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !json?.success) { setError(json?.error ?? "Impossible de déconnecter les autres appareils."); return; }
    await charger();
  }

  async function handleCreerPin(e: React.FormEvent) {
    e.preventDefault();
    setPinMsg(null);
    if (pin1.length < 4) { setPinMsg("Le code doit contenir entre 4 et 8 chiffres."); return; }
    if (pin1 !== pin2) { setPinMsg("Les deux codes ne correspondent pas."); return; }
    setBusy("pin-creer");
    const accessToken = await getAccessToken();
    if (!accessToken) { setPinMsg("Session expirée, reconnectez-vous."); setBusy(null); return; }
    const res = await fetch("/api/citoyen/securite/pin/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, pin: pin1 }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !json?.success) { setPinMsg(json?.error ?? "Impossible d'enregistrer ce code."); return; }
    setPin1(""); setPin2(""); setPinForm("aucun"); setPinMsg(null);
    await charger();
  }

  async function handleSupprimerPin(e: React.FormEvent) {
    e.preventDefault();
    setPinMsg(null);
    if (!pinActuel) { setPinMsg("Entrez votre code PIN actuel."); return; }
    setBusy("pin-supprimer");
    const accessToken = await getAccessToken();
    if (!accessToken) { setPinMsg("Session expirée, reconnectez-vous."); setBusy(null); return; }
    const res = await fetch("/api/citoyen/securite/pin", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, pin: pinActuel }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !json?.success) { setPinMsg(json?.error ?? "Code incorrect."); return; }
    setPinActuel(""); setPinForm("aucun"); setPinMsg(null);
    await charger();
  }

  async function handleTotpDemarrer() {
    setTotpMsg(null);
    setBusy("totp-demarrer");
    const accessToken = await getAccessToken();
    if (!accessToken) { setTotpMsg("Session expirée, reconnectez-vous."); setBusy(null); return; }
    const res = await fetch("/api/citoyen/securite/totp/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !json?.qrDataUrl) { setTotpMsg(json?.error ?? "Impossible de préparer la double authentification."); return; }
    setTotpQr(json.qrDataUrl); setTotpSecret(json.secret); setTotpForm("activer");
  }

  async function handleTotpConfirmer(e: React.FormEvent) {
    e.preventDefault();
    setTotpMsg(null);
    if (!totpConfirmCode.trim()) { setTotpMsg("Entrez le code affiché par votre application."); return; }
    setBusy("totp-confirmer");
    const accessToken = await getAccessToken();
    if (!accessToken) { setTotpMsg("Session expirée, reconnectez-vous."); setBusy(null); return; }
    const res = await fetch("/api/citoyen/securite/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, code: totpConfirmCode.trim() }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !json?.success) { setTotpMsg(json?.error ?? "Code invalide."); return; }
    setTotpBackupCodes(json.backupCodes);
    setTotpForm("aucun"); setTotpQr(null); setTotpSecret(null); setTotpConfirmCode(""); setTotpMsg(null);
    await charger();
  }

  async function handleTotpDesactiver(e: React.FormEvent) {
    e.preventDefault();
    setTotpMsg(null);
    if (!totpDisableCode.trim()) { setTotpMsg("Entrez un code TOTP ou de secours."); return; }
    setBusy("totp-desactiver");
    const accessToken = await getAccessToken();
    if (!accessToken) { setTotpMsg("Session expirée, reconnectez-vous."); setBusy(null); return; }
    const res = await fetch("/api/citoyen/securite/totp/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, code: totpDisableCode.trim() }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !json?.success) { setTotpMsg(json?.error ?? "Code incorrect."); return; }
    setTotpDisableCode(""); setTotpForm("aucun"); setTotpMsg(null);
    await charger();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f5f5f8", border: `1px solid ${brd}`,
    borderRadius: "12px", padding: "12px 14px", color: t1, fontSize: "15px", letterSpacing: "2px", textAlign: "center",
  };
  const btnPrimary: React.CSSProperties = {
    background: t1, color: isDark ? "#0A0A0F" : "#FFFFFF", fontWeight: 800, fontSize: "13.5px",
    padding: "10px 16px", borderRadius: "12px", border: "none", cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontWeight: 700, fontSize: "13px",
    padding: "10px 16px", borderRadius: "12px", border: `1px solid ${brd}`, cursor: "pointer",
  };
  const btnDanger: React.CSSProperties = {
    background: "rgba(239,68,68,0.1)", color: "#ef4444", fontWeight: 700, fontSize: "12.5px",
    padding: "8px 12px", borderRadius: "10px", border: "1px solid rgba(239,68,68,0.25)", cursor: "pointer",
  };

  if (loading) {
    return <CompteLoadingScreen titre="Sécurité"/>;
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      <CompteHeader titre="Sécurité"/>
      <PullToRefresh onRefresh={charger} isDark={isDark}>
      <main style={{ padding: "16px 16px 40px" }}>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "12px", padding: "12px 14px", marginBottom: "18px", color: "#ef4444", fontSize: "13px", fontWeight: 600 }}>
            {error}
          </div>
        )}

        {statut && (
          <>
            {/* Score de sécurité */}
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "20px", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" }}>Niveau de sécurité</div>
                <div style={{ color: NIVEAU_COULEUR[statut.score.niveau], fontSize: "13px", fontWeight: 800 }}>{NIVEAU_LABEL[statut.score.niveau]}</div>
              </div>
              <div style={{ height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: statut.score.conseils.length ? "14px" : 0 }}>
                <div style={{ height: "100%", width: `${statut.score.valeur}%`, background: NIVEAU_COULEUR[statut.score.niveau], borderRadius: "4px", transition: "width 0.3s" }}/>
              </div>
              {statut.score.conseils.map((c, i) => (
                <div key={i} style={{ color: t2, fontSize: "12.5px", marginTop: i === 0 ? 0 : "6px", lineHeight: 1.4 }}>• {c}</div>
              ))}
            </div>

            {/* Verrouillage rapide — PIN + Biométrie regroupés dans une
                seule carte (trait de séparation), plutôt que 2 cartes
                empilées : rendu "liste groupée" façon Paramètres. */}
            <Section titre="Verrouillage rapide" t2={t2}>
              <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden" }}>

                {/* PIN */}
                <div style={{ padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                    <div style={{ color: t2, flexShrink: 0, marginTop: "2px" }}><Ic.Pin/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Code PIN</div>
                      <div style={{ color: t2, fontSize: "12.5px" }}>{statut.pin_configured ? "Configuré" : "Non configuré"}</div>
                    </div>
                    {pinForm === "aucun" && (
                      statut.pin_configured
                        ? <button className="tap" style={btnDanger} onClick={() => { setPinForm("supprimer"); setPinMsg(null); }}>Supprimer</button>
                        : <button className="tap" style={btnPrimary} onClick={() => { setPinForm("creer"); setPinMsg(null); }}>Configurer</button>
                    )}
                  </div>

                  {pinForm === "creer" && (
                    <form onSubmit={handleCreerPin} style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <input style={inputStyle} type="password" inputMode="numeric" maxLength={8} placeholder="Nouveau code (4-8 chiffres)" value={pin1} onChange={e => setPin1(e.target.value.replace(/\D/g, ""))}/>
                      <input style={inputStyle} type="password" inputMode="numeric" maxLength={8} placeholder="Confirmez le code" value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ""))}/>
                      {pinMsg && <div style={{ color: "#ef4444", fontSize: "12.5px" }}>{pinMsg}</div>}
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="submit" disabled={busy === "pin-creer"} className="tap" style={{ ...btnPrimary, flex: 1, opacity: busy === "pin-creer" ? 0.6 : 1 }}>{busy === "pin-creer" ? "Enregistrement…" : "Enregistrer"}</button>
                        <button type="button" className="tap" style={btnGhost} onClick={() => { setPinForm("aucun"); setPin1(""); setPin2(""); setPinMsg(null); }}>Annuler</button>
                      </div>
                    </form>
                  )}

                  {pinForm === "supprimer" && (
                    <form onSubmit={handleSupprimerPin} style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <input style={inputStyle} type="password" inputMode="numeric" maxLength={8} placeholder="Code PIN actuel" value={pinActuel} onChange={e => setPinActuel(e.target.value.replace(/\D/g, ""))}/>
                      {pinMsg && <div style={{ color: "#ef4444", fontSize: "12.5px" }}>{pinMsg}</div>}
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="submit" disabled={busy === "pin-supprimer"} className="tap" style={{ ...btnDanger, flex: 1, padding: "10px 16px", opacity: busy === "pin-supprimer" ? 0.6 : 1 }}>{busy === "pin-supprimer" ? "Suppression…" : "Confirmer la suppression"}</button>
                        <button type="button" className="tap" style={btnGhost} onClick={() => { setPinForm("aucun"); setPinActuel(""); setPinMsg(null); }}>Annuler</button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Biométrie */}
                <div style={{ padding: "16px", borderTop: `1px solid ${brd}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: (statut.webauthn_credentials.length || bioForm === "nommer") ? "14px" : 0 }}>
                    <div style={{ color: t2, flexShrink: 0, marginTop: "2px" }}><Ic.Finger/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Empreinte / Face ID</div>
                      <div style={{ color: t2, fontSize: "12.5px" }}>
                        {statut.webauthn_credentials.length > 0
                          ? `${statut.webauthn_credentials.length} appareil${statut.webauthn_credentials.length > 1 ? "s" : ""} enregistré${statut.webauthn_credentials.length > 1 ? "s" : ""}`
                          : "Non activée"}
                      </div>
                    </div>
                    {bioForm === "aucun" && (
                      <button className="tap" style={btnPrimary} onClick={() => setBioForm("nommer")}>Ajouter</button>
                    )}
                  </div>

                  {bioForm === "nommer" && (
                    <form onSubmit={handleActiverBiometrie} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <input
                        style={{ ...inputStyle, letterSpacing: "normal", textAlign: "left" }}
                        type="text" maxLength={40} placeholder="Nom de l'appareil (ex. iPhone de Bryan)"
                        value={bioLabel} onChange={e => setBioLabel(e.target.value)} autoFocus
                      />
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="submit" disabled={busy === "biometrie-activer"} className="tap" style={{ ...btnPrimary, flex: 1, opacity: busy === "biometrie-activer" ? 0.6 : 1 }}>
                          {busy === "biometrie-activer" ? "Vérification…" : "Continuer"}
                        </button>
                        <button type="button" className="tap" style={btnGhost} onClick={() => { setBioForm("aucun"); setBioLabel(""); }}>Annuler</button>
                      </div>
                    </form>
                  )}

                  {statut.webauthn_credentials.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${brd}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: t1, fontSize: "13px", fontWeight: 600 }}>{c.device_label ?? "Appareil"}</div>
                        <div style={{ color: t3, fontSize: "11.5px" }}>Dernière utilisation : {formatDate(c.last_used_at)}</div>
                      </div>
                      <button disabled={busy === `cred-${c.id}`} className="tap" style={{ ...btnDanger, opacity: busy === `cred-${c.id}` ? 0.6 : 1, flexShrink: 0 }} onClick={() => handleRevoquerCredential(c.id)}>
                        <Ic.Trash/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* Authentification à deux facteurs (TOTP) */}
            <Section titre="Authentification à deux facteurs" t2={t2}>
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px" }}>
                {totpBackupCodes ? (
                  <div>
                    <div style={{ color: t1, fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>Notez vos codes de secours</div>
                    <div style={{ color: t2, fontSize: "12.5px", marginBottom: "12px", lineHeight: 1.5 }}>
                      Ils ne seront plus jamais affichés. Chacun ne fonctionne qu&apos;une seule fois, en remplacement de votre application si vous la perdez.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                      {totpBackupCodes.map(c => (
                        <code key={c} style={{ backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f5f5f8", border: `1px solid ${brd}`, borderRadius: "8px", padding: "8px 10px", color: t1, fontSize: "13px", textAlign: "center" }}>{c}</code>
                      ))}
                    </div>
                    <button className="tap" style={btnPrimary} onClick={() => setTotpBackupCodes(null)}>J&apos;ai noté mes codes</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: totpForm !== "aucun" ? "14px" : 0 }}>
                      <div style={{ color: t2, flexShrink: 0, marginTop: "2px" }}><Ic.Shield/></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: t1, fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Application d&apos;authentification</div>
                        <div style={{ color: t2, fontSize: "12.5px" }}>
                          {statut.totp_enabled ? "Activée — un code sera demandé à chaque connexion" : "Non activée"}
                        </div>
                      </div>
                      {totpForm === "aucun" && (
                        statut.totp_enabled
                          ? <button className="tap" style={btnDanger} onClick={() => { setTotpForm("desactiver"); setTotpMsg(null); }}>Désactiver</button>
                          : <button disabled={busy === "totp-demarrer"} className="tap" style={{ ...btnPrimary, opacity: busy === "totp-demarrer" ? 0.6 : 1 }} onClick={handleTotpDemarrer}>{busy === "totp-demarrer" ? "Préparation…" : "Activer"}</button>
                      )}
                    </div>

                    {totpForm === "activer" && (
                      <form onSubmit={handleTotpConfirmer} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ color: t2, fontSize: "12.5px" }}>Scannez ce QR code avec Google Authenticator, Microsoft Authenticator ou équivalent, ou saisissez le secret manuellement.</div>
                        {totpQr && (
                          // IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode.toDataURL), non fetchable par l'optimiseur next/image | reviewed=2026-08-08
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={totpQr} alt="QR code 2FA" style={{ width: "160px", height: "160px", borderRadius: "10px", border: `1px solid ${brd}`, alignSelf: "center" }} />
                        )}
                        {totpSecret && <code style={{ backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f5f5f8", border: `1px solid ${brd}`, borderRadius: "8px", padding: "8px 10px", color: t1, fontSize: "12px", textAlign: "center", wordBreak: "break-all" }}>{totpSecret}</code>}
                        <input style={{ ...inputStyle, letterSpacing: "3px" }} type="text" inputMode="numeric" maxLength={6} placeholder="Code à 6 chiffres" value={totpConfirmCode} onChange={e => setTotpConfirmCode(e.target.value.replace(/\D/g, ""))}/>
                        {totpMsg && <div style={{ color: "#ef4444", fontSize: "12.5px" }}>{totpMsg}</div>}
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button type="submit" disabled={busy === "totp-confirmer"} className="tap" style={{ ...btnPrimary, flex: 1, opacity: busy === "totp-confirmer" ? 0.6 : 1 }}>{busy === "totp-confirmer" ? "Vérification…" : "Confirmer"}</button>
                          <button type="button" className="tap" style={btnGhost} onClick={() => { setTotpForm("aucun"); setTotpQr(null); setTotpSecret(null); setTotpConfirmCode(""); setTotpMsg(null); }}>Annuler</button>
                        </div>
                      </form>
                    )}

                    {totpForm === "desactiver" && (
                      <form onSubmit={handleTotpDesactiver} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ color: t2, fontSize: "12.5px" }}>Entrez un code de votre application (ou un code de secours) pour confirmer la désactivation.</div>
                        <input style={{ ...inputStyle, letterSpacing: "3px" }} type="text" inputMode="text" maxLength={9} placeholder="Code TOTP ou de secours" value={totpDisableCode} onChange={e => setTotpDisableCode(e.target.value.toUpperCase())}/>
                        {totpMsg && <div style={{ color: "#ef4444", fontSize: "12.5px" }}>{totpMsg}</div>}
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button type="submit" disabled={busy === "totp-desactiver"} className="tap" style={{ ...btnDanger, flex: 1, padding: "10px 16px", opacity: busy === "totp-desactiver" ? 0.6 : 1 }}>{busy === "totp-desactiver" ? "Désactivation…" : "Confirmer la désactivation"}</button>
                          <button type="button" className="tap" style={btnGhost} onClick={() => { setTotpForm("aucun"); setTotpDisableCode(""); setTotpMsg(null); }}>Annuler</button>
                        </div>
                      </form>
                    )}

                    {totpForm === "aucun" && totpMsg && <div style={{ color: "#ef4444", fontSize: "12.5px", marginTop: "10px" }}>{totpMsg}</div>}
                  </>
                )}
              </div>
            </Section>

            {/* Appareils mémorisés */}
            <Section titre="Appareils mémorisés" t2={t2}>
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px" }}>
                {statut.remember_devices.length === 0 && (
                  <div style={{ color: t2, fontSize: "12.5px" }}>Aucun appareil mémorisé.</div>
                )}
                {statut.remember_devices.map((d, i) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${brd}` }}>
                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ color: t3, flexShrink: 0 }}><Ic.Device/></div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: t1, fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                          {d.device_label ?? "Appareil"}
                          {d.is_current_device && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "rgba(34,197,94,0.12)", color: "#22c55e", fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "6px" }}>
                              <Ic.Check/> Cet appareil
                            </span>
                          )}
                        </div>
                        <div style={{ color: t3, fontSize: "11.5px" }}>Connecté le {formatDate(d.created_at)}</div>
                      </div>
                    </div>
                    {!d.is_current_device && (
                      <button disabled={busy === `dev-${d.id}`} className="tap" style={{ ...btnDanger, opacity: busy === `dev-${d.id}` ? 0.6 : 1, flexShrink: 0 }} onClick={() => handleRevoquerAppareil(d.id)}>
                        <Ic.Trash/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {statut.remember_devices.length > 1 && (
                <button disabled={busy === "dev-all"} className="tap" style={{ ...btnGhost, width: "100%", marginTop: "12px", opacity: busy === "dev-all" ? 0.6 : 1 }} onClick={handleRevoquerTout}>
                  {busy === "dev-all" ? "Déconnexion…" : "Déconnecter tous les autres appareils"}
                </button>
              )}
            </Section>

            {/* Guide de sécurité */}
            <Section titre="Guide de sécurité" t2={t2}>
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ color: t2, flexShrink: 0 }}><Ic.Info/></div>
                  <div style={{ color: t1, fontSize: "13.5px", fontWeight: 700 }}>Protégez votre compte</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {CONSEILS_SECURITE.map((c, i) => (
                    <div key={i} style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>• {c}</div>
                  ))}
                </div>
              </div>
            </Section>
          </>
        )}
      </main>
      </PullToRefresh>
    </div>
  );
}
