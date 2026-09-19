"use client";

// Écran dédié "Sécurité du compte" — extrait de ParametresTab.tsx (chantier
// éclatement de Paramètres, 14/09/2026), puis restructuré en Security
// Center Phase 1 (16/09/2026, brief CEO) : statut calculé, Connexion &
// authentification (mot de passe/passkeys/PIN/2FA), Appareils & sessions,
// Activité de sécurité (Journal d'activité filtré), Récupération du compte.
// Phase 1 = UI uniquement, réutilise les données déjà existantes (webauthn,
// remember_devices, journal_activite) — moteur de ré-authentification
// centralisé, notifications de sécurité, récupération de compte réelle et
// moteur de risque restent des phases suivantes, non construites ici.
// Toutes les actions passent par des routes serveur avec vérification
// d'ownership JWT (cf. lib/institutionAuth.ts) — aucun appel Supabase
// client direct ici, ces tables n'ont pas de policy RLS anon/authenticated.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ReauthModal } from "./ReauthModal";
import { TotpSection } from "./TotpSection";

type WebauthnCredential = { id: string; device_label: string | null; created_at: string; last_used_at: string | null };
type RememberDevice = { id: string; user_agent: string | null; status: string; created_at: string; expires_at: string; is_current_device: boolean };
type SecurityStatus = {
  pin_configured: boolean; totp_enabled: boolean;
  recovery_email: string | null; recovery_phone: string | null;
  webauthn_credentials: WebauthnCredential[]; remember_devices: RememberDevice[];
};

// "Activité de sécurité" — Journal d'activité déjà existant
// (journal_activite/api/institution/journal), filtré sur les connexions du
// membre courant. Seule "connexion" est journalisée aujourd'hui côté
// authentification (vérifié dans lib/journalTaxonomie.ts) — changement de
// PIN/2FA/passkey n'y écrivent pas encore, d'où la note affichée à côté de
// cette carte plutôt que des sections fabriquées sans données réelles.
type JournalEntry = { id: string; action: string; navigateur: string | null; os: string | null; created_at: string };

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

function SectionTitle({ C, label }: { C: ThemeTokens; label: string }) {
  return <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{label}</div>;
}

export function SecuriteCompteTab({ }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [msg, setMsg] = useState<{ text: string; color: string } | null>(null);
  const [journal, setJournal] = useState<JournalEntry[] | null>(null);

  const [pinModal, setPinModal] = useState<null | "set" | "delete">(null);
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const [addingDevice, setAddingDevice] = useState(false);
  const [deviceLabelInput, setDeviceLabelInput] = useState("");
  const [showLabelPrompt, setShowLabelPrompt] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const uiTokens = toUiTokens(C);

  function notify(text: string, color: string = C.t2) {
    setMsg({ text, color });
    setTimeout(() => setMsg(null), 3500);
  }

  async function loadSecurity() {
    setSecurityLoading(true);
    try {
      const res = await fetch("/api/institution/security-status");
      if (res.status === 403) { setForbidden(true); setSecurityLoading(false); return; }
      const data = await res.json();
      if (res.ok) setSecurity(data);
    } catch { /* silencieux, écran garde son état précédent */ }
    setSecurityLoading(false);
  }

  async function loadJournal() {
    try {
      const meRes = await fetch("/api/institution/auth/me");
      const me = meRes.ok ? await meRes.json().catch(() => null) : null;
      if (!me?.membreId) { setJournal([]); return; }
      const res = await fetch(`/api/institution/journal?categorie=authentification&membre_id=${me.membreId}&limit=5`);
      const data = await res.json().catch(() => null);
      setJournal(res.ok ? (data?.entrees ?? []) : []);
    } catch { setJournal([]); }
  }

  useEffect(() => { loadSecurity(); loadJournal(); }, []);

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
      if (!res.ok) { setPinError(data.error || "Le code PIN n'a pas pu être enregistré. Réessayez dans un instant."); setPinLoading(false); return; }
      setPinModal(null); setPinValue(""); setPinConfirm("");
      notify("Code PIN enregistré", C.green);
      loadSecurity();
    } catch { setPinError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez."); }
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
      if (!res.ok) { setPinError(data.error || "Le code actuel est incorrect."); setPinLoading(false); return; }
      setPinModal(null); setPinValue("");
      notify("Code PIN supprimé", C.green);
      loadSecurity();
    } catch { setPinError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez."); }
    setPinLoading(false);
  }

  async function addWebauthnDevice() {
    setShowLabelPrompt(false);
    setAddingDevice(true);
    try {
      const optRes = await fetch("/api/institution/auth/webauthn/register-options", { method: "POST" });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setAddingDevice(false);
        if (optData?.code === "REAUTH_REQUIRED") { setPendingAction(() => addWebauthnDevice); setReauthOpen(true); return; }
        notify(optData.error || "Impossible de préparer l'ajout de la clé d'accès. Réessayez.", C.red);
        return;
      }

      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: optData.options });
      } catch (err) {
        // SecurityError = le RP ID dérivé de l'URL courante n'est pas un
        // nom de domaine valide (ex. accès via une IP LAN type
        // 192.168.x.x plutôt que localhost/un vrai domaine) — la spec
        // WebAuthn interdit une IP comme RP ID, aucun appareil n'affiche
        // même de prompt dans ce cas. Cause réelle trouvée le 16/09/2026,
        // pas un simple clic "Annuler" comme les autres DOMException
        // (NotAllowedError etc.) tombant dans le message générique.
        console.error("[WEBAUTHN REGISTER] échec startRegistration", err);
        if (err instanceof Error && err.name === "SecurityError") {
          notify("Les clés d'accès nécessitent un vrai nom de domaine (pas une adresse IP) — utilisez localhost ou le domaine Yelen.", C.red);
        } else {
          notify("Enregistrement annulé.", C.t2);
        }
        setAddingDevice(false);
        return;
      }

      const verifyRes = await fetch("/api/institution/auth/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: attestation, challengeToken: optData.challengeToken, deviceLabel: deviceLabelInput.trim() || undefined }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) { notify(verifyData.error || "La clé d'accès n'a pas pu être enregistrée. Réessayez.", C.red); setAddingDevice(false); return; }

      setDeviceLabelInput("");
      notify("Appareil biométrique ajouté", C.green);
      loadSecurity();
    } catch {
      notify("Impossible de contacter le serveur pendant l'ajout de la clé d'accès. Vérifiez votre connexion et réessayez.", C.red);
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.code === "REAUTH_REQUIRED") { setPendingAction(() => () => revokeWebauthn(credentialId)); setReauthOpen(true); return; }
        notify("Impossible de retirer cette clé d'accès. Réessayez.", C.red);
        return;
      }
      notify("Appareil retiré", C.green);
      loadSecurity();
    } catch { notify("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", C.red); }
  }

  async function revokeRememberDevice(tokenId: string) {
    try {
      const res = await fetch("/api/institution/auth/remember/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      });
      if (!res.ok) { notify("Impossible de déconnecter cet appareil. Réessayez.", C.red); return; }
      notify("Appareil déconnecté", C.green);
      loadSecurity();
    } catch { notify("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", C.red); }
  }

  async function revokeAllRememberDevices() {
    try {
      const res = await fetch("/api/institution/auth/remember/revoke-all", { method: "POST" });
      if (!res.ok) { notify("Impossible de déconnecter les autres appareils. Réessayez.", C.red); return; }
      notify("Tous les autres appareils ont été déconnectés", C.green);
      loadSecurity();
    } catch { notify("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", C.red); }
  }

  // Appareils actifs seulement — un appareil révoqué (status='revoked')
  // reste en base pour l'historique (voir remember/revoke/route.ts) mais
  // ne doit plus apparaître comme connecté. Bug réel trouvé en
  // restructurant cet écran : l'ancienne liste ne filtrait pas du tout par
  // statut.
  const activeDevices = (security?.remember_devices ?? []).filter(d => d.status !== "revoked");

  // Statut de sécurité — calculé côté client à partir des données déjà
  // chargées (même principe que score_sante sur l'Accueil : jamais
  // persisté, recalculé à chaque affichage). Pas de notion d'"alerte" :
  // aucun moteur de détection de risque n'existe encore (voir Phase
  // suivante du chantier Security Center), l'afficher inventerait un
  // signal qui n'existe pas.
  const protectionsActives = [security?.pin_configured, security?.totp_enabled, (security?.webauthn_credentials.length ?? 0) > 0].filter(Boolean).length;

  function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!domain) return email;
    return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 2))}@${domain}`;
  }
  function maskPhone(phone: string): string {
    return phone.length > 4 ? `${phone.slice(0, -4).replace(/\d/g, "*")}${phone.slice(-4)}` : phone;
  }

  if (forbidden) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: C.t2, fontSize: "13px" }}>Cet écran est réservé aux administrateurs de l&apos;institution.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "16px" }}>Sécurité du compte</h1>

        {msg && (
          <div style={{ position: "fixed", top: "66px", left: "50%", transform: "translateX(-50%)", zIndex: 950, backgroundColor: C.bgCard2, border: `1px solid ${msg.color}40`, borderLeft: `3px solid ${msg.color}`, borderRadius: "12px", padding: "10px 16px", color: C.t1, fontSize: "12px", fontWeight: "700", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
            {msg.text}
          </div>
        )}

        {/* ── STATUT DE SÉCURITÉ ── */}
        <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px", border: `1px solid ${protectionsActives > 0 ? C.green + "40" : C.gold + "40"}` }}>
          {securityLoading ? (
            <YelenLoader size={16}/>
          ) : protectionsActives > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.green}25, ${C.green}10)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5z"/><path d="M9 12l2 2 4-4"/></svg>
                </div>
                <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Votre compte est protégé</span>
              </div>
              <div style={{ color: C.t3, fontSize: "11.5px" }}>{protectionsActives} protection{protectionsActives > 1 ? "s" : ""} active{protectionsActives > 1 ? "s" : ""} · {activeDevices.length} appareil{activeDevices.length > 1 ? "s" : ""} connecté{activeDevices.length > 1 ? "s" : ""}</div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5z"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <span style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Votre compte peut être mieux protégé</span>
              </div>
              <div style={{ color: C.t3, fontSize: "11.5px" }}>Activez un code PIN, la double authentification ou une clé d&apos;accès ci-dessous.</div>
            </>
          )}
        </Card>

        {/* ── CONNEXION & AUTHENTIFICATION ── */}
        <SectionTitle C={C} label="Connexion & authentification"/>
        <Card tokens={toCardTokens(C)} noPadding style={{ marginBottom: "14px" }}>
          {/* Mot de passe — pas encore de changement self-service (voir
              lib/institutionAuth.ts) : ligne informative uniquement, jamais
              de bouton qui ne mènerait nulle part. */}
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Mot de passe</div>
              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>Modification en ligne bientôt disponible</div>
            </div>
            <span style={{ color: C.t3, fontSize: "9px", fontWeight: "800", textTransform: "uppercase", flexShrink: 0 }}>Bientôt</span>
          </div>

          {/* Clés d'accès (Passkeys / WebAuthn) — anciennement "Biométrie" :
              la biométrie de l'appareil ne fait que débloquer localement la
              clé, Yelen ne stocke jamais de donnée biométrique (voir
              register-verify/route.ts, credential_id + clé publique
              uniquement). */}
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: (security?.webauthn_credentials.length ?? 0) > 0 ? "10px" : 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Clés d&apos;accès (Passkeys)</div>
                <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>
                  {securityLoading ? <YelenLoader size={10}/> : `${security?.webauthn_credentials.length ?? 0} clé(s) enregistrée(s)`}
                </div>
              </div>
              {browserSupportsWebAuthn() && (
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ color: C.gold, border: `1px solid ${C.gold}30`, flexShrink: 0 }} loading={addingDevice} onClick={() => setShowLabelPrompt(true)}>
                  Ajouter cet appareil
                </Button>
              )}
            </div>
            {(security?.webauthn_credentials.length ?? 0) > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {security!.webauthn_credentials.map((cred, i) => (
                  <div key={cred.id} style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 11px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cred.device_label || `Passkey #${i + 1}`}</div>
                      <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{cred.last_used_at ? `Utilisée ${timeAgoShort(cred.last_used_at)}` : `Ajoutée ${timeAgoShort(cred.created_at)}`}</div>
                    </div>
                    <button onClick={() => revokeWebauthn(cred.id)} className="tap" style={{ background: "none", border: "none", color: C.red, fontSize: "11px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>Retirer</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PIN */}
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Code PIN Yelen</div>
              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>
                {securityLoading ? <YelenLoader size={10}/> : security?.pin_configured ? "Configuré — déverrouillage rapide actif" : "Non configuré"}
              </div>
            </div>
            {!securityLoading && (
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ color: C.gold, border: `1px solid ${C.gold}30` }} onClick={() => { setPinModal("set"); setPinValue(""); setPinConfirm(""); setPinError(""); }}>
                  {security?.pin_configured ? "Modifier" : "Définir"}
                </Button>
                {security?.pin_configured && (
                  <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="sm" onClick={() => { setPinModal("delete"); setPinValue(""); setPinError(""); }}>
                    Supprimer
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 2FA TOTP — TotpSection.tsx, partagée avec ProfilTab.tsx
              (Administration & accès, tous rôles) depuis le 16/09/2026. */}
          <div style={{ padding: "13px 16px" }}>
            <TotpSection onToast={notify} onChange={loadSecurity}/>
          </div>
        </Card>

        {/* ── APPAREILS & SESSIONS ── */}
        <SectionTitle C={C} label="Appareils & sessions"/>
        <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: activeDevices.length > 0 ? "10px" : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t3, fontSize: "11px" }}>Déverrouillage rapide sans OTP à chaque connexion</div>
            </div>
            {activeDevices.length > 1 && (
              <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="sm" style={{ flexShrink: 0, whiteSpace: "nowrap" }} onClick={() => setConfirmRevokeAll(true)}>
                Déconnecter les autres
              </Button>
            )}
          </div>
          {activeDevices.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {activeDevices.map(dev => (
                <div key={dev.id} style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 11px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                      {formatUserAgent(dev.user_agent)}
                      {dev.is_current_device && <span style={{ backgroundColor: `${C.green}15`, color: C.green, fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "8px" }}>Cet appareil</span>}
                    </div>
                    <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>Mémorisé {timeAgoShort(dev.created_at)}</div>
                  </div>
                  {!dev.is_current_device && (
                    <button onClick={() => revokeRememberDevice(dev.id)} className="tap" style={{ background: "none", border: "none", color: C.red, fontSize: "11px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>Déconnecter</button>
                  )}
                </div>
              ))}
            </div>
          ) : !securityLoading && (
            <div style={{ color: C.t3, fontSize: "11px" }}>Aucun appareil mémorisé pour l&apos;instant.</div>
          )}
        </Card>

        {/* ── ACTIVITÉ DE SÉCURITÉ ── */}
        <SectionTitle C={C} label="Activité de sécurité"/>
        <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
          {journal === null ? (
            <YelenLoader size={16}/>
          ) : journal.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
              {journal.map(e => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 11px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>Connexion — {e.navigateur || "Navigateur"} sur {e.os || "appareil"}</div>
                    <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{timeAgoShort(e.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: C.t3, fontSize: "11px", marginBottom: "10px" }}>Aucune connexion récente enregistrée.</div>
          )}
          {/* Honnêteté explicite (protocole CLAUDE.md) : PIN/2FA/passkey ne
              sont pas encore journalisés — ne pas fabriquer ces catégories
              tant que la donnée n'existe pas réellement. */}
          <div style={{ color: C.t3, fontSize: "10px", lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>
            Le suivi des changements de sécurité (PIN, 2FA, clés d&apos;accès) arrive bientôt. Historique complet des connexions dans le Journal d&apos;activité.
          </div>
        </Card>

        {/* ── RÉCUPÉRATION DU COMPTE ── */}
        <SectionTitle C={C} label="Récupération du compte"/>
        <Card tokens={toCardTokens(C)} noPadding>
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Téléphone</div>
            <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{securityLoading ? <YelenLoader size={10}/> : security?.recovery_phone ? maskPhone(security.recovery_phone) : "Non renseigné"}</div>
          </div>
          <div style={{ padding: "13px 16px" }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Email</div>
            <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{securityLoading ? <YelenLoader size={10}/> : security?.recovery_email ? maskEmail(security.recovery_email) : "Non renseigné"}</div>
          </div>
        </Card>
        {/* Codes de récupération — réels, vivent sous la 2FA (voir
            TotpSection.tsx ci-dessus, "Codes de récupération : X
            restants") : ils n'existent qu'en tant que secours TOTP, jamais
            un mécanisme indépendant fabriqué de toutes pièces ici. */}

        {/* ── MODALE PIN ── */}
        {pinModal && (
          <div onClick={() => setPinModal(null)} className="yelen-confirm-overlay" style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
            <div onClick={e => e.stopPropagation()} className="yelen-confirm-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
              <div className="yelen-confirm-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />
              <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800", marginBottom: "16px" }}>
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
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => setPinModal(null)}>Annuler</Button>
                <Button tokens={toUiTokens(C)} variant={pinModal === "delete" ? "danger" : "primary"} size="md" loading={pinLoading} onClick={pinModal === "set" ? submitSetPin : submitDeletePin} className="tap">
                  {pinModal === "set" ? "Enregistrer" : "Supprimer"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODALE LABEL APPAREIL AVANT AJOUT WEBAUTHN ── */}
        {showLabelPrompt && (
          <div onClick={() => setShowLabelPrompt(false)} className="yelen-confirm-overlay" style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
            <div onClick={e => e.stopPropagation()} className="yelen-confirm-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
              <div className="yelen-confirm-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />
              <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800", marginBottom: "6px" }}>Ajouter cet appareil</div>
              <div style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Donnez-lui un nom pour le reconnaître facilement (optionnel).</div>
              <input value={deviceLabelInput} onChange={e => setDeviceLabelInput(e.target.value)} placeholder="Ex. iPhone du bureau" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "14px" }} />
              <Button tokens={toUiTokens(C)} variant="primary" size="md" fullWidth onClick={addWebauthnDevice} className="tap">Continuer</Button>
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
          description={`${Math.max(activeDevices.length - 1, 0)} appareil(s) mémorisé(s) devront se reconnecter — celui-ci reste connecté.`}
          reversible
          confirmLabel="Déconnecter"
        />

        <ReauthModal
          open={reauthOpen}
          onClose={() => { setReauthOpen(false); setPendingAction(null); }}
          onSuccess={() => { const action = pendingAction; setReauthOpen(false); setPendingAction(null); action?.(); }}
        />
      </div>
    </div>
  );
}
