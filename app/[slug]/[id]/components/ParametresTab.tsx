"use client";

// Onglet Paramètres — sections Sécurité du compte / Notifications (ParametresTab) et
// Zone dangereuse / suppression de compte (ParametresDangerZone), extraites de page.tsx.
// Compte, Apparence, Abonnement et Support & Légal restent inline dans page.tsx (inchangés,
// pas de raison de les déplacer). Toutes les actions passent par des routes serveur avec
// vérification d'ownership JWT (cf. lib/institutionAuth.ts) — aucun appel Supabase client
// direct ici, ces tables n'ont pas de policy RLS anon/authenticated.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { souscrirePush } from "@/lib/pushClient";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { LogoutFlow, INSTITUTION_LOGOUT_COPY } from "./LogoutFlow";
import { YelenLoader } from "@/components/YelenLoader";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

// ─── Types ────────────────────────────────────────────────────────────

type WebauthnCredential = { id: string; device_label: string | null; created_at: string; last_used_at: string | null };
type RememberDevice = { id: string; user_agent: string | null; created_at: string; expires_at: string; is_current_device: boolean };
type SecurityStatus = { pin_configured: boolean; totp_enabled: boolean; webauthn_credentials: WebauthnCredential[]; remember_devices: RememberDevice[] };

type NotifCategory = "confirmation" | "rappels" | "annulation_report" | "rdv_termine";
type ChannelPrefs = { inapp: boolean; email: boolean; sms: boolean };
type NotificationPrefs = Record<NotifCategory, ChannelPrefs>;

const DEFAULT_PREFS: NotificationPrefs = {
  confirmation: { inapp: true, email: false, sms: false },
  rappels: { inapp: true, email: false, sms: false },
  annulation_report: { inapp: true, email: false, sms: false },
  rdv_termine: { inapp: true, email: false, sms: false },
};

const NOTIF_LABELS: Record<NotifCategory, { titre: string; desc: string }> = {
  confirmation: { titre: "Confirmations de RDV", desc: "Un nouveau rendez-vous est confirmé" },
  rappels: { titre: "Rappels avant RDV", desc: "24h, 30 min et à l'heure du rendez-vous" },
  annulation_report: { titre: "Annulations & reports", desc: "Un RDV est annulé ou reporté" },
  rdv_termine: { titre: "RDV terminés", desc: "Un rendez-vous est marqué terminé" },
};

const MOTIFS_SUPPRESSION: { key: string; label: string }[] = [
  { key: "trop_cher", label: "C'est trop cher" },
  { key: "pas_assez_rdv", label: "Pas assez de rendez-vous" },
  { key: "autre_solution", label: "J'ai changé de solution" },
  { key: "fermeture", label: "Mon établissement a fermé" },
  { key: "autre", label: "Autre raison" },
];

// ─── Helpers ──────────────────────────────────────────────────────────

function formatUserAgent(ua: string | null): string {
  if (!ua) return "Appareil inconnu";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "Appareil";
  const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Navigateur";
  return `${browser} sur ${os}`;
}

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function SectionCard({ C, titre, children }: { C: ThemeTokens; titre: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{titre}</div>
      <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", border: `1px solid ${C.border}`, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Toggle({ C, checked, onChange, disabled }: { C: ThemeTokens; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      className={disabled ? undefined : "tap"}
      disabled={disabled}
      style={{ width: "38px", height: "22px", borderRadius: "20px", border: "none", padding: "2px", backgroundColor: disabled ? C.bg3 : checked ? C.gold : C.border2, cursor: disabled ? "not-allowed" : "pointer", display: "flex", justifyContent: checked ? "flex-end" : "flex-start", flexShrink: 0, opacity: disabled ? 0.5 : 1 }}
    >
      <div style={{ width: "18px", height: "18px", borderRadius: "50%", backgroundColor: disabled ? C.t3 : checked ? "#000" : C.t1 }} />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SÉCURITÉ DU COMPTE + NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════

export function ParametresTab({ }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<NotifCategory | null>(null);
  const [msg, setMsg] = useState<{ text: string; color: string } | null>(null);

  const [pinModal, setPinModal] = useState<null | "set" | "delete">(null);
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const [addingDevice, setAddingDevice] = useState(false);
  const [deviceLabelInput, setDeviceLabelInput] = useState("");
  const [showLabelPrompt, setShowLabelPrompt] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const uiTokens = toUiTokens(C);

  // 2FA TOTP (chantier sécurité institution, 25/07/2026) — par membre
  // connecté (mirroring citoyen), pas par institution : "Modifier"
  // affecte uniquement le compte actuellement connecté, pas les autres
  // membres de l'équipe.
  const [totpModal, setTotpModal] = useState<null | "activer" | "desactiver">(null);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpConfirmCode, setTotpConfirmCode] = useState("");
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[] | null>(null);
  const [totpError, setTotpError] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);

  // Chantier "Yelen Assistant" (20/07/2026), Lot D — push navigateur.
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  function notify(text: string, color: string) {
    setMsg({ text, color });
    setTimeout(() => setMsg(null), 3500);
  }

  useEffect(() => {
    (async () => {
      try {
        if (!("serviceWorker" in navigator)) return;
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        setPushEnabled(!!sub);
      } catch { /* silencieux */ }
    })();
  }, []);

  async function activerPush() {
    setPushLoading(true);
    try {
      const sub = await souscrirePush();
      if (!sub) { notify("Activation impossible — vérifiez la permission de notifications du navigateur.", C.red); return; }
      const res = await fetch("/api/institution/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent }),
      });
      if (!res.ok) { notify("Erreur lors de l'activation.", C.red); return; }
      setPushEnabled(true);
      notify("Notifications push activées sur cet appareil.", C.green);
    } finally { setPushLoading(false); }
  }

  async function loadSecurity() {
    setSecurityLoading(true);
    try {
      const res = await fetch("/api/institution/security-status");
      const data = await res.json();
      if (res.ok) setSecurity(data);
    } catch { /* silencieux, écran garde son état précédent */ }
    setSecurityLoading(false);
  }

  async function loadPrefs() {
    setPrefsLoading(true);
    try {
      const res = await fetch("/api/institution/notification-prefs");
      const data = await res.json();
      if (res.ok && data.prefs) setPrefs(data.prefs);
    } catch { /* garde les défauts */ }
    setPrefsLoading(false);
  }

  useEffect(() => { loadSecurity(); loadPrefs(); }, []);

  async function togglePref(category: NotifCategory) {
    const nextValue = !prefs[category].inapp;
    setSavingCategory(category);
    setPrefs(p => ({ ...p, [category]: { ...p[category], inapp: nextValue } }));
    try {
      const res = await fetch("/api/institution/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, inapp: nextValue }),
      });
      if (!res.ok) {
        setPrefs(p => ({ ...p, [category]: { ...p[category], inapp: !nextValue } }));
        notify("Erreur lors de l'enregistrement", C.red);
      }
    } catch {
      setPrefs(p => ({ ...p, [category]: { ...p[category], inapp: !nextValue } }));
      notify("Erreur réseau", C.red);
    }
    setSavingCategory(null);
  }

  async function submitSetPin() {
    setPinError("");
    if (!/^\d{4,8}$/.test(pinValue)) { setPinError("Le code doit contenir entre 4 et 8 chiffres."); return; }
    if (pinValue !== pinConfirm) { setPinError("Les deux codes ne correspondent pas."); return; }
    setPinLoading(true);
    try {
      const res = await fetch("/api/institution/auth/pin/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinValue }),
      });
      const data = await res.json();
      if (!res.ok) { setPinError(data.error || "Erreur lors de l'enregistrement."); setPinLoading(false); return; }
      setPinModal(null); setPinValue(""); setPinConfirm("");
      notify("Code PIN enregistré", C.green);
      loadSecurity();
    } catch { setPinError("Erreur réseau."); }
    setPinLoading(false);
  }

  async function submitDeletePin() {
    setPinError("");
    if (!pinValue) { setPinError("Saisissez votre code actuel."); return; }
    setPinLoading(true);
    try {
      const res = await fetch("/api/institution/auth/pin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinValue }),
      });
      const data = await res.json();
      if (!res.ok) { setPinError(data.error || "Code incorrect."); setPinLoading(false); return; }
      setPinModal(null); setPinValue("");
      notify("Code PIN supprimé", C.green);
      loadSecurity();
    } catch { setPinError("Erreur réseau."); }
    setPinLoading(false);
  }

  async function addWebauthnDevice() {
    setShowLabelPrompt(false);
    setAddingDevice(true);
    try {
      const optRes = await fetch("/api/institution/auth/webauthn/register-options", { method: "POST" });
      const optData = await optRes.json();
      if (!optRes.ok) { notify(optData.error || "Erreur lors de la préparation.", C.red); setAddingDevice(false); return; }

      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: optData.options });
      } catch {
        notify("Enregistrement annulé.", C.t2);
        setAddingDevice(false);
        return;
      }

      const verifyRes = await fetch("/api/institution/auth/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: attestation, challengeToken: optData.challengeToken, deviceLabel: deviceLabelInput.trim() || undefined }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) { notify(verifyData.error || "Échec de l'enregistrement.", C.red); setAddingDevice(false); return; }

      setDeviceLabelInput("");
      notify("Appareil biométrique ajouté", C.green);
      loadSecurity();
    } catch {
      notify("Erreur réseau", C.red);
    }
    setAddingDevice(false);
  }

  async function revokeWebauthn(credentialId: string) {
    try {
      const res = await fetch("/api/institution/auth/webauthn/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      if (!res.ok) { notify("Erreur lors de la révocation", C.red); return; }
      notify("Appareil retiré", C.green);
      loadSecurity();
    } catch { notify("Erreur réseau", C.red); }
  }

  async function revokeRememberDevice(tokenId: string) {
    try {
      const res = await fetch("/api/institution/auth/remember/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      });
      if (!res.ok) { notify("Erreur lors de la révocation", C.red); return; }
      notify("Appareil déconnecté", C.green);
      loadSecurity();
    } catch { notify("Erreur réseau", C.red); }
  }

  async function revokeAllRememberDevices() {
    try {
      const res = await fetch("/api/institution/auth/remember/revoke-all", { method: "POST" });
      if (!res.ok) { notify("Erreur lors de la révocation", C.red); return; }
      notify("Tous les autres appareils ont été déconnectés", C.green);
      loadSecurity();
    } catch { notify("Erreur réseau", C.red); }
  }

  async function startTotpActivation() {
    setTotpLoading(true); setTotpError("");
    try {
      const res = await fetch("/api/institution/securite/totp/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { notify(data.error || "Erreur lors de la préparation.", C.red); setTotpLoading(false); return; }
      setTotpQr(data.qrDataUrl); setTotpSecret(data.secret); setTotpModal("activer");
    } catch { notify("Erreur réseau", C.red); }
    setTotpLoading(false);
  }

  async function confirmTotpActivation() {
    setTotpError("");
    if (!totpConfirmCode.trim()) { setTotpError("Entrez le code affiché par votre application."); return; }
    setTotpLoading(true);
    try {
      const res = await fetch("/api/institution/securite/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpConfirmCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setTotpError(data.error || "Code invalide."); setTotpLoading(false); return; }
      setTotpBackupCodes(data.backupCodes);
      setTotpQr(null); setTotpSecret(null); setTotpConfirmCode("");
      loadSecurity();
    } catch { setTotpError("Erreur réseau."); }
    setTotpLoading(false);
  }

  async function confirmTotpDisable() {
    setTotpError("");
    if (!totpDisableCode.trim()) { setTotpError("Entrez un code TOTP ou de secours."); return; }
    setTotpLoading(true);
    try {
      const res = await fetch("/api/institution/securite/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpDisableCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setTotpError(data.error || "Code incorrect."); setTotpLoading(false); return; }
      setTotpModal(null); setTotpDisableCode("");
      notify("Double authentification désactivée", C.green);
      loadSecurity();
    } catch { setTotpError("Erreur réseau."); }
    setTotpLoading(false);
  }

  return (
    <>
      {msg && (
        <div style={{ position: "fixed", top: "66px", left: "50%", transform: "translateX(-50%)", zIndex: 950, backgroundColor: C.bgCard2, border: `1px solid ${msg.color}40`, borderLeft: `3px solid ${msg.color}`, borderRadius: "12px", padding: "10px 16px", color: C.t1, fontSize: "12px", fontWeight: "700", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {msg.text}
        </div>
      )}

      {/* ── SÉCURITÉ DU COMPTE ── */}
      <SectionCard C={C} titre="Sécurité du compte">
        {/* PIN */}
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Code PIN</div>
            <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>
              {securityLoading ? <YelenLoader size={10}/> : security?.pin_configured ? "Configuré — déverrouillage rapide actif" : "Non configuré"}
            </div>
          </div>
          {!securityLoading && (
            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              <button onClick={() => { setPinModal("set"); setPinValue(""); setPinConfirm(""); setPinError(""); }} className="tap" style={{ background: `${C.gold}12`, border: `1px solid ${C.gold}30`, color: C.gold, fontSize: "11px", fontWeight: "700", padding: "7px 11px", borderRadius: "9px", cursor: "pointer" }}>
                {security?.pin_configured ? "Modifier" : "Définir"}
              </button>
              {security?.pin_configured && (
                <button onClick={() => { setPinModal("delete"); setPinValue(""); setPinError(""); }} className="tap" style={{ background: C.redL, border: `1px solid ${C.red}25`, color: C.red, fontSize: "11px", fontWeight: "700", padding: "7px 11px", borderRadius: "9px", cursor: "pointer" }}>
                  Supprimer
                </button>
              )}
            </div>
          )}
        </div>

        {/* Biométrie */}
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: (security?.webauthn_credentials.length ?? 0) > 0 ? "10px" : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Biométrie (Face ID / empreinte)</div>
              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>
                {securityLoading ? <YelenLoader size={10}/> : `${security?.webauthn_credentials.length ?? 0} appareil(s) enregistré(s)`}
              </div>
            </div>
            {browserSupportsWebAuthn() && (
              <button onClick={() => setShowLabelPrompt(true)} disabled={addingDevice} className="tap" style={{ background: `${C.gold}12`, border: `1px solid ${C.gold}30`, color: C.gold, fontSize: "11px", fontWeight: "700", padding: "7px 11px", borderRadius: "9px", cursor: addingDevice ? "default" : "pointer", flexShrink: 0, opacity: addingDevice ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {addingDevice ? <YelenLoader size={11} color={C.gold}/> : "Ajouter cet appareil"}
              </button>
            )}
          </div>
          {(security?.webauthn_credentials.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {security!.webauthn_credentials.map(cred => (
                <div key={cred.id} style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 11px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cred.device_label || "Appareil biométrique"}</div>
                    <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{cred.last_used_at ? `Utilisé ${timeAgoShort(cred.last_used_at)}` : `Ajouté ${timeAgoShort(cred.created_at)}`}</div>
                  </div>
                  <button onClick={() => revokeWebauthn(cred.id)} className="tap" style={{ background: "none", border: "none", color: C.red, fontSize: "11px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>Retirer</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2FA TOTP */}
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Double authentification (2FA)</div>
            <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>
              {securityLoading ? <YelenLoader size={10}/> : security?.totp_enabled ? "Activée — code demandé à chaque connexion" : "Non activée · protège votre compte personnel"}
            </div>
          </div>
          {!securityLoading && (
            security?.totp_enabled
              ? <button onClick={() => { setTotpModal("desactiver"); setTotpDisableCode(""); setTotpError(""); }} className="tap" style={{ background: C.redL, border: `1px solid ${C.red}25`, color: C.red, fontSize: "11px", fontWeight: "700", padding: "7px 11px", borderRadius: "9px", cursor: "pointer", flexShrink: 0 }}>Désactiver</button>
              : <button onClick={startTotpActivation} disabled={totpLoading} className="tap" style={{ background: `${C.gold}12`, border: `1px solid ${C.gold}30`, color: C.gold, fontSize: "11px", fontWeight: "700", padding: "7px 11px", borderRadius: "9px", cursor: "pointer", flexShrink: 0, opacity: totpLoading ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{totpLoading ? <YelenLoader size={11} color={C.gold}/> : "Activer"}</button>
          )}
        </div>

        {/* Appareils mémorisés */}
        <div style={{ padding: "13px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: (security?.remember_devices.length ?? 0) > 0 ? "10px" : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Appareils mémorisés</div>
              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>Déverrouillage rapide sans OTP à chaque connexion</div>
            </div>
            {(security?.remember_devices.length ?? 0) > 1 && (
              <button onClick={() => setConfirmRevokeAll(true)} className="tap" style={{ background: C.redL, border: `1px solid ${C.red}25`, color: C.red, fontSize: "11px", fontWeight: "700", padding: "7px 11px", borderRadius: "9px", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                Déconnecter les autres
              </button>
            )}
          </div>
          {(security?.remember_devices.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {security!.remember_devices.map(dev => (
                <div key={dev.id} style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 11px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                      {formatUserAgent(dev.user_agent)}
                      {dev.is_current_device && <span style={{ backgroundColor: `${C.green}15`, color: C.green, fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "8px" }}>Cet appareil</span>}
                    </div>
                    <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>Mémorisé {timeAgoShort(dev.created_at)}</div>
                  </div>
                  <button onClick={() => revokeRememberDevice(dev.id)} className="tap" style={{ background: "none", border: "none", color: C.red, fontSize: "11px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>Déconnecter</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── NOTIFICATIONS ── */}
      <SectionCard C={C} titre="Notifications">
        <div style={{ padding: "10px 16px 4px", display: "flex", gap: "8px", color: C.t3, fontSize: "9px", fontWeight: "800", textTransform: "uppercase" }}>
          <span style={{ flex: 1 }} />
          <span style={{ width: "38px", textAlign: "center" }}>App</span>
          <span style={{ width: "50px", textAlign: "center" }}>Email</span>
          <span style={{ width: "44px", textAlign: "center" }}>SMS</span>
        </div>
        {(Object.keys(NOTIF_LABELS) as NotifCategory[]).map((cat, i, arr) => (
          <div key={cat} style={{ padding: "11px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>{NOTIF_LABELS[cat].titre}</div>
              <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{NOTIF_LABELS[cat].desc}</div>
            </div>
            <div style={{ width: "38px", display: "flex", justifyContent: "center" }}>
              <Toggle C={C} checked={prefs[cat].inapp} onChange={() => togglePref(cat)} disabled={prefsLoading || savingCategory === cat} />
            </div>
            <div style={{ width: "50px", display: "flex", justifyContent: "center" }} title="Bientôt disponible">
              <Toggle C={C} checked={false} onChange={() => {}} disabled />
            </div>
            <div style={{ width: "44px", display: "flex", justifyContent: "center" }} title="Bientôt disponible">
              <Toggle C={C} checked={false} onChange={() => {}} disabled />
            </div>
          </div>
        ))}
        <div style={{ padding: "11px 16px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>Notifications push (navigateur)</div>
            <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>Reçues même app fermée, sur cet appareil</div>
          </div>
          {pushEnabled ? (
            <span style={{ color: C.green, fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>Activées</span>
          ) : (
            <button onClick={activerPush} disabled={pushLoading} className="tap" style={{ backgroundColor: `${C.gold}15`, color: C.gold, border: `1px solid ${C.gold}40`, borderRadius: "10px", padding: "7px 14px", fontSize: "11px", fontWeight: "800", cursor: "pointer" }}>
              {pushLoading ? "…" : "Activer"}
            </button>
          )}
        </div>
        <div style={{ padding: "10px 16px", backgroundColor: C.bg3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <div>
            <div style={{ color: C.t2, fontSize: "12px", fontWeight: "700" }}>RDV dépassés — action requise</div>
            <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>Alerte opérationnelle, toujours active</div>
          </div>
          <span style={{ color: C.t3, fontSize: "9px", fontWeight: "800", textTransform: "uppercase" }}>Toujours actif</span>
        </div>
        <div style={{ padding: "9px 16px", color: C.t3, fontSize: "10px", lineHeight: 1.5 }}>
          Email et SMS arrivent bientôt — pour l&apos;instant, toutes les notifications sont envoyées dans l&apos;application.
        </div>
      </SectionCard>

      {/* ── MODALE PIN ── */}
      {pinModal && (
        <div onClick={() => setPinModal(null)} style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />
            <div style={{ color: C.t1, fontSize: "17px", fontWeight: "900", marginBottom: "16px" }}>
              {pinModal === "set" ? "Code PIN" : "Supprimer le code PIN"}
            </div>
            {pinModal === "set" ? (
              <>
                <input type="password" inputMode="numeric" maxLength={8} value={pinValue} onChange={e => setPinValue(e.target.value.replace(/\D/g, ""))} placeholder="Nouveau code (4 à 8 chiffres)" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
                <input type="password" inputMode="numeric" maxLength={8} value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ""))} placeholder="Confirmez le code" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
              </>
            ) : (
              <input type="password" inputMode="numeric" maxLength={8} value={pinValue} onChange={e => setPinValue(e.target.value.replace(/\D/g, ""))} placeholder="Code actuel" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
            )}
            {pinError && <div style={{ color: C.red, fontSize: "11px", fontWeight: "700", marginBottom: "10px" }}>{pinError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
              <button onClick={() => setPinModal(null)} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", cursor: "pointer" }}>Annuler</button>
              <button onClick={pinModal === "set" ? submitSetPin : submitDeletePin} disabled={pinLoading} className="tap" style={{ backgroundColor: pinModal === "delete" ? C.redL : `${C.gold}18`, color: pinModal === "delete" ? C.red : C.gold, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${pinModal === "delete" ? C.red + "30" : C.gold + "30"}`, cursor: "pointer" }}>
                {pinLoading ? "..." : pinModal === "set" ? "Enregistrer" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALE 2FA TOTP ── */}
      {(totpModal || totpBackupCodes) && (
        <div onClick={() => { if (!totpBackupCodes) { setTotpModal(null); setTotpQr(null); setTotpSecret(null); setTotpConfirmCode(""); setTotpError(""); } }} style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />

            {totpBackupCodes ? (
              <>
                <div style={{ color: C.t1, fontSize: "17px", fontWeight: "900", marginBottom: "8px" }}>Notez vos codes de secours</div>
                <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px", lineHeight: 1.5 }}>
                  Ils ne seront plus jamais affichés. Chacun ne fonctionne qu&apos;une seule fois, en remplacement de votre application si vous la perdez.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                  {totpBackupCodes.map(c => (
                    <code key={c} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 10px", color: C.t1, fontSize: "13px", textAlign: "center" }}>{c}</code>
                  ))}
                </div>
                <button onClick={() => { setTotpBackupCodes(null); setTotpModal(null); notify("Double authentification activée", C.green); }} className="tap" style={{ width: "100%", backgroundColor: `${C.gold}18`, color: C.gold, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${C.gold}30`, cursor: "pointer" }}>
                  J&apos;ai noté mes codes
                </button>
              </>
            ) : totpModal === "activer" ? (
              <>
                <div style={{ color: C.t1, fontSize: "17px", fontWeight: "900", marginBottom: "12px" }}>Activer la 2FA</div>
                <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px" }}>Scannez ce QR code avec Google Authenticator, Microsoft Authenticator ou équivalent, ou saisissez le secret manuellement.</div>
                {totpQr && (
                  // IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode.toDataURL), non fetchable par l'optimiseur next/image | reviewed=2026-08-08
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={totpQr} alt="QR code 2FA" style={{ width: "160px", height: "160px", borderRadius: "10px", border: `1px solid ${C.border2}`, display: "block", margin: "0 auto 14px" }} />
                )}
                {totpSecret && <code style={{ display: "block", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 10px", color: C.t1, fontSize: "12px", textAlign: "center", wordBreak: "break-all", marginBottom: "14px" }}>{totpSecret}</code>}
                <input type="text" inputMode="numeric" maxLength={6} value={totpConfirmCode} onChange={e => setTotpConfirmCode(e.target.value.replace(/\D/g, ""))} placeholder="Code à 6 chiffres" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "16px", letterSpacing: "3px", textAlign: "center", color: C.t1, marginBottom: "10px" }} />
                {totpError && <div style={{ color: C.red, fontSize: "11px", fontWeight: "700", marginBottom: "10px" }}>{totpError}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
                  <button onClick={() => { setTotpModal(null); setTotpQr(null); setTotpSecret(null); setTotpConfirmCode(""); setTotpError(""); }} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", cursor: "pointer" }}>Annuler</button>
                  <button onClick={confirmTotpActivation} disabled={totpLoading} className="tap" style={{ backgroundColor: `${C.gold}18`, color: C.gold, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${C.gold}30`, cursor: "pointer" }}>
                    {totpLoading ? "..." : "Confirmer"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ color: C.t1, fontSize: "17px", fontWeight: "900", marginBottom: "12px" }}>Désactiver la 2FA</div>
                <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px" }}>Entrez un code de votre application (ou un code de secours) pour confirmer.</div>
                <input type="text" maxLength={9} value={totpDisableCode} onChange={e => setTotpDisableCode(e.target.value.toUpperCase())} placeholder="Code TOTP ou de secours" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "16px", letterSpacing: "3px", textAlign: "center", color: C.t1, marginBottom: "10px" }} />
                {totpError && <div style={{ color: C.red, fontSize: "11px", fontWeight: "700", marginBottom: "10px" }}>{totpError}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
                  <button onClick={() => { setTotpModal(null); setTotpDisableCode(""); setTotpError(""); }} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", cursor: "pointer" }}>Annuler</button>
                  <button onClick={confirmTotpDisable} disabled={totpLoading} className="tap" style={{ backgroundColor: C.redL, color: C.red, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${C.red}30`, cursor: "pointer" }}>
                    {totpLoading ? "..." : "Confirmer la désactivation"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MODALE LABEL APPAREIL AVANT AJOUT WEBAUTHN ── */}
      {showLabelPrompt && (
        <div onClick={() => setShowLabelPrompt(false)} style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />
            <div style={{ color: C.t1, fontSize: "17px", fontWeight: "900", marginBottom: "6px" }}>Ajouter cet appareil</div>
            <div style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Donnez-lui un nom pour le reconnaître facilement (optionnel).</div>
            <input value={deviceLabelInput} onChange={e => setDeviceLabelInput(e.target.value)} placeholder="Ex. iPhone du bureau" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "14px" }} />
            <button onClick={addWebauthnDevice} className="tap" style={{ width: "100%", backgroundColor: `${C.gold}18`, color: C.gold, fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1px solid ${C.gold}30`, cursor: "pointer" }}>Continuer</button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        onConfirm={async () => { await revokeAllRememberDevices(); setConfirmRevokeAll(false); }}
        tokens={uiTokens}
        level={1}
        title="Déconnecter les autres appareils ?"
        description={`${(security?.remember_devices.length ?? 1) - 1} appareil(s) mémorisé(s) devront se reconnecter — celui-ci reste connecté.`}
        reversible
        confirmLabel="Déconnecter"
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ZONE DANGEREUSE — déconnexion + suppression de compte
// ═══════════════════════════════════════════════════════════════════════

type DeletionStep = null | "sondage" | "transparence" | "confirmation";

export function ParametresDangerZone({ instName }: { instId: string; instName: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const router = useRouter();

  const [step, setStep] = useState<DeletionStep>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);

  function closeDeletionFlow() {
    setStep(null); setMotif(null); setCommentaire(""); setConfirmInput(""); setDeletionError("");
  }

  async function confirmDeletion() {
    if (!motif) return;
    setDeletionError("");
    if (confirmInput.trim() !== instName.trim()) {
      setDeletionError("Le nom saisi ne correspond pas exactement.");
      return;
    }
    setDeletionLoading(true);
    try {
      const res = await fetch("/api/institution/auth/deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif, commentaire: commentaire.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setDeletionError(data.error || "Erreur lors de la demande."); setDeletionLoading(false); return; }
      router.push("/institution/connexion?deletion_requested=1");
    } catch {
      setDeletionError("Erreur réseau.");
      setDeletionLoading(false);
    }
  }

  return (
    <>
      <SectionCard C={C} titre="Zone dangereuse">
        <button onClick={() => setLogoutOpen(true)} className="tap" style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, padding: "13px 16px", color: C.red, fontWeight: "800", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          Se déconnecter
        </button>
        <button onClick={() => setStep("sondage")} className="tap" style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", color: C.t2, fontWeight: "700", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          Supprimer mon compte
        </button>
      </SectionCard>

      {/* ── ÉCRAN PLEIN ÉCRAN DE SUPPRESSION ── */}
      {step && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, backgroundColor: C.bg, overflowY: "auto" }}>
          <div style={{ maxWidth: "520px", margin: "0 auto", padding: "20px 20px 48px" }}>
            <button onClick={step === "sondage" ? closeDeletionFlow : () => setStep(s => s === "confirmation" ? "transparence" : "sondage")} className="tap" style={{ background: "none", border: "none", color: C.t2, display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "700", padding: "8px 0", marginBottom: "16px", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              {step === "sondage" ? "Annuler" : "Retour"}
            </button>

            {step === "sondage" && (
              <>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: "900", marginBottom: "6px" }}>Avant de partir...</div>
                <div style={{ color: C.t3, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>Aidez-nous à comprendre pourquoi — ça reste entre nous, ça nous aide à améliorer Yelen224.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  {MOTIFS_SUPPRESSION.map(m => (
                    <div key={m.key} onClick={() => setMotif(m.key)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: motif === m.key ? `${C.gold}12` : C.bgCard, border: `1px solid ${motif === m.key ? C.gold + "40" : C.border}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${motif === m.key ? C.gold : C.t3}`, backgroundColor: motif === m.key ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {motif === m.key && <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#000" }} />}
                      </div>
                      <span style={{ color: motif === m.key ? C.t1 : C.t2, fontSize: "13px", fontWeight: motif === m.key ? "700" : "500" }}>{m.label}</span>
                    </div>
                  ))}
                </div>
                {motif === "autre" && (
                  <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Dites-nous en plus (optionnel)..." rows={3} style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: C.t1, marginBottom: "16px" }} />
                )}
                <button onClick={() => motif && setStep("transparence")} disabled={!motif} className="tap" style={{ width: "100%", backgroundColor: motif ? C.redL : C.bg3, color: motif ? C.red : C.t3, fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px", border: `1px solid ${motif ? C.red + "30" : C.border}`, cursor: motif ? "pointer" : "not-allowed" }}>Continuer</button>
              </>
            )}

            {step === "transparence" && (
              <>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: "900", marginBottom: "6px" }}>Voici ce qui va se passer</div>
                <div style={{ color: C.t3, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>On préfère être clairs avant de continuer.</div>
                <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { icon: "🔒", text: "Votre accès au dashboard est coupé immédiatement." },
                    { icon: "👁", text: "Votre fiche n'est plus visible des citoyens dès maintenant." },
                    { icon: "⏳", text: "Vos données sont définitivement supprimées dans 30 jours." },
                    { icon: "↩️", text: "Vous pouvez annuler à tout moment avant cette date en vous reconnectant." },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "16px", flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>{item.text}</span>
                    </div>
                  ))}
                </div>
                <a href="mailto:support@yelen224.com" style={{ display: "block", textAlign: "center", color: C.gold, fontSize: "12px", fontWeight: "700", textDecoration: "none", padding: "10px", marginBottom: "10px" }}>Besoin d&apos;aide plutôt ? Contactez le support</a>
                <button onClick={() => setStep("confirmation")} className="tap" style={{ width: "100%", backgroundColor: C.redL, color: C.red, fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px", border: `1px solid ${C.red}30`, cursor: "pointer" }}>Je comprends, continuer</button>
              </>
            )}

            {step === "confirmation" && (
              <>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: "900", marginBottom: "6px" }}>Confirmer la suppression</div>
                <div style={{ color: C.t3, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>
                  Pour confirmer, tapez le nom exact de votre établissement : <strong style={{ color: C.t1 }}>{instName}</strong>
                </div>
                <input value={confirmInput} onChange={e => setConfirmInput(e.target.value)} placeholder={instName} style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
                {deletionError && <div style={{ color: C.red, fontSize: "11px", fontWeight: "700", marginBottom: "10px" }}>{deletionError}</div>}
                <button onClick={confirmDeletion} disabled={confirmInput.trim() !== instName.trim() || deletionLoading} className="tap" style={{ width: "100%", backgroundColor: confirmInput.trim() === instName.trim() ? C.red : C.bg3, color: confirmInput.trim() === instName.trim() ? "#fff" : C.t3, fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px", border: "none", cursor: confirmInput.trim() === instName.trim() ? "pointer" : "not-allowed" }}>
                  {deletionLoading ? "..." : "Supprimer définitivement mon compte"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {logoutOpen && (
        <LogoutFlow
          onClose={() => setLogoutOpen(false)}
          redirectTo="/institution/connexion?logged_out=1"
          copy={INSTITUTION_LOGOUT_COPY}
        />
      )}
    </>
  );
}
