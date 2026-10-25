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
// Refonte visuelle 23/10/2026 : gabarit de lignes de Paramètres
// (SecuriteUi.tsx), bandeau de statut honnête, erreur de chargement explicite.
// Aucune logique PIN / passkeys / TOTP / déconnexion n'a changé.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { dateHeureComplete } from "@/lib/heure";
import { ReauthModal } from "./ReauthModal";
import { TotpSection } from "./TotpSection";
import { HelpCenterGuide } from "./HelpCenterGuide";
import {
  BandeauStatut, EtatTexte, LigneSecurite, ModaleSecurite, SectionSecurite, SkeletonSecurite, SousLigneSecurite, StylesSecurite,
  dateHeureCourte, dateLongue, tempsRelatif,
} from "./SecuriteUi";

type WebauthnCredential = { id: string; device_label: string | null; created_at: string; last_used_at: string | null };
type RememberDevice = {
  id: string; user_agent: string | null; status: string; created_at: string; expires_at: string; is_current_device: boolean;
  device_label: string | null; device_type: string | null; last_used_at: string | null; ip: string | null;
};
type SecurityStatus = {
  pin_configured: boolean; totp_enabled: boolean;
  recovery_email: string | null; recovery_phone: string | null;
  webauthn_credentials: WebauthnCredential[]; remember_devices: RememberDevice[];
};

// "Activité de sécurité" — Journal d'activité déjà existant
// (journal_activite/api/institution/journal), filtré sur la catégorie
// authentification du membre courant : connexions, vérifications d'identité,
// ajout/retrait de clé d'accès, activation/désactivation de la 2FA, pose/retrait
// du PIN et déconnexion d'appareils (journalisés côté serveur depuis le
// 23/10/2026). Les échecs de connexion ne sont pas journalisés.
type JournalEntry = { id: string; action: string; navigateur: string | null; os: string | null; created_at: string };

// Libellés d'affichage par action (la donnée n'est pas modifiée). Action
// inconnue : repli neutre, jamais "Connexion".
const LIBELLES_JOURNAL: Record<string, string> = {
  connexion: "Connexion",
  reauth_reussie: "Vérification d'identité réussie",
  reauth_echec: "Échec de vérification d'identité",
  passkey_ajoutee: "Clé d'accès ajoutée",
  passkey_retiree: "Clé d'accès retirée",
  totp_active: "2FA activée",
  totp_desactive: "2FA désactivée",
  pin_defini: "Code PIN défini",
  pin_retire: "Code PIN retiré",
  appareil_deconnecte: "Appareil déconnecté",
  appareils_deconnectes: "Autres appareils déconnectés",
};

function formatUserAgent(ua: string | null): string {
  if (!ua) return "Appareil inconnu";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "Appareil";
  const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Navigateur";
  return `${browser} sur ${os}`;
}

// Confirmation en deux temps, en ligne (comme « Refuser » d'un RDV) : un premier
// clic demande confirmation, un second exécute. Échap ou « Annuler » abandonne.
function ActionDeuxTemps({ tokens, C, enConfirmation, libelle, libelleConfirmer, ariaDemande, ariaConfirmer, ariaAnnuler, onDemander, onConfirmer, onAnnuler }: {
  tokens: ReturnType<typeof toUiTokens>; C: ThemeTokens; enConfirmation: boolean;
  libelle: string; libelleConfirmer: string; ariaDemande: string; ariaConfirmer: string; ariaAnnuler: string;
  onDemander: () => void; onConfirmer: () => void | Promise<void>; onAnnuler: () => void;
}) {
  const classeBouton = "tap yelen-focus-ring";
  if (!enConfirmation) {
    return (
      <Button tokens={tokens} className={classeBouton} variant="secondary" size="md" style={{ color: C.red, border: `1px solid ${C.red}40` }} ariaLabel={ariaDemande} onClick={onDemander}>
        {libelle}
      </Button>
    );
  }
  return (
    <span data-confirmer="true" role="group" aria-label="Confirmation requise" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onAnnuler(); } }} style={{ display: "inline-flex", gap: "8px" }}>
      <Button tokens={tokens} className={classeBouton} variant="danger" size="md" ariaLabel={ariaConfirmer} onClick={onConfirmer}>{libelleConfirmer}</Button>
      <Button tokens={tokens} className={classeBouton} variant="secondary" size="md" ariaLabel={ariaAnnuler} onClick={onAnnuler}>Annuler</Button>
    </span>
  );
}

export function SecuriteCompteTab({ }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [securityError, setSecurityError] = useState(false);
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
  // Ligne dont le retrait / la déconnexion attend sa confirmation (une seule à la fois).
  const [aConfirmer, setAConfirmer] = useState<{ type: "passkey" | "appareil"; id: string } | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [reauthReason, setReauthReason] = useState<string | undefined>(undefined);
  const uiTokens = toUiTokens(C);

  function notify(text: string, color: string = C.t2) {
    setMsg({ text, color });
    setTimeout(() => setMsg(null), 3500);
  }

  async function loadSecurity() {
    setSecurityLoading(true);
    setSecurityError(false);
    try {
      const res = await fetch("/api/institution/security-status");
      if (res.status === 403) { setForbidden(true); setSecurityLoading(false); return; }
      const data = await res.json();
      if (res.ok) setSecurity(data);
      else setSecurityError(true);
    } catch { setSecurityError(true); }
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

  // Le focus passe sur « Confirmer » quand la confirmation apparaît.
  useEffect(() => {
    if (aConfirmer) document.querySelector<HTMLElement>("[data-confirmer] button")?.focus();
  }, [aConfirmer]);

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
        if (optData?.code === "REAUTH_REQUIRED") { setPendingAction(() => addWebauthnDevice); setReauthReason("Vous êtes sur le point d'ajouter une nouvelle clé d'accès à votre compte — entrez votre PIN pour confirmer."); setReauthOpen(true); return; }
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
        if (data?.code === "REAUTH_REQUIRED") { setPendingAction(() => () => revokeWebauthn(credentialId)); setReauthReason("Vous êtes sur le point de retirer cette clé d'accès de votre compte — entrez votre PIN pour confirmer."); setReauthOpen(true); return; }
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

  // Numérotation d'affichage seulement : « Chrome sur Windows · appareil 2 »
  // quand plusieurs appareils partagent le même navigateur et système.
  const nomsAppareils = activeDevices.map(d => formatUserAgent(d.user_agent));
  const nomAffiche = (index: number): string => {
    const base = nomsAppareils[index];
    if (nomsAppareils.filter(n => n === base).length < 2) return base;
    return `${base} · appareil ${nomsAppareils.slice(0, index + 1).filter(n => n === base).length}`;
  };

  // Statut de sécurité — calculé côté client à partir des données déjà
  // chargées (même principe que score_sante sur l'Accueil : jamais
  // persisté, recalculé à chaque affichage). Protection forte = au moins une
  // clé d'accès OU la 2FA du membre connecté ; le PIN seul ne suffit pas (il
  // ne sert qu'au déverrouillage rapide). Pas de notion d'"alerte" : aucun
  // moteur de détection de risque n'existe encore.
  const nbCles = security?.webauthn_credentials.length ?? 0;
  const protectionForte = nbCles > 0 || !!security?.totp_enabled;
  const chips = security ? [
    security.pin_configured ? "PIN actif" : "PIN non défini",
    nbCles === 0 ? "Aucune clé d'accès" : nbCles === 1 ? "1 clé d'accès" : `${nbCles} clés d'accès`,
    security.totp_enabled ? "2FA activée" : "2FA non activée",
    activeDevices.length === 0 ? "Aucun appareil mémorisé" : `${activeDevices.length} appareil${activeDevices.length > 1 ? "s" : ""} mémorisé${activeDevices.length > 1 ? "s" : ""}`,
  ] : [];

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

  const premierChargement = securityLoading && security === null;
  const erreurChargement = !securityLoading && security === null && securityError;
  const boutonRougeDoux = { color: C.red, border: `1px solid ${C.red}40` } as const;
  const classeBouton = "tap yelen-focus-ring";

  return (
    <div className="yelen-page" style={{ padding: "20px 16px 100px" }}>
      <StylesSecurite C={C}/>
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Sécurité du compte</h1>
            <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>Protégez l&apos;accès à votre établissement</p>
          </div>
          <HelpCenterGuide tab="parametres-securite" />
        </div>

        {msg && (
          <div role="status" aria-live="polite" style={{ position: "fixed", top: "66px", left: "50%", transform: "translateX(-50%)", zIndex: 950, backgroundColor: C.bgCard2, border: `1px solid ${msg.color}40`, borderLeft: `3px solid ${msg.color}`, borderRadius: "12px", padding: "10px 16px", color: C.t1, fontSize: "13px", fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", maxWidth: "calc(100vw - 32px)" }}>
            {msg.text}
          </div>
        )}

        {premierChargement && <SkeletonSecurite C={C}/>}

        {erreurChargement && (
          <div role="alert" className="sec-carte" style={{ padding: "16px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>Informations de sécurité indisponibles</div>
              <div style={{ color: C.t2, fontSize: "13px", marginTop: "1px" }}>Aucun état de protection n&apos;est affiché tant que les données ne sont pas chargées.</div>
            </div>
            <Button tokens={uiTokens} variant="secondary" size="md" className={classeBouton} loading={securityLoading} onClick={loadSecurity}>Réessayer</Button>
          </div>
        )}

        {security && (
          <>
            <BandeauStatut C={C} fort={protectionForte} chips={chips}/>

            {/* ── CONNEXION & AUTHENTIFICATION ── */}
            <SectionSecurite C={C} id="sec-connexion" titre="Connexion & authentification">
              {/* Mot de passe — pas encore de changement self-service (voir
                  lib/institutionAuth.ts) : ligne informative uniquement, jamais
                  de bouton qui ne mènerait nulle part. */}
              <LigneSecurite
                C={C} icone="mot-de-passe" titre="Mot de passe" description="Modification en ligne bientôt disponible"
                etat={<EtatTexte C={C} libelle="Bientôt"/>}
              />

              {/* Clés d'accès (Passkeys / WebAuthn) — anciennement "Biométrie" :
                  la biométrie de l'appareil ne fait que débloquer localement la
                  clé, Yelen ne stocke jamais de donnée biométrique (voir
                  register-verify/route.ts, credential_id + clé publique
                  uniquement). */}
              <LigneSecurite
                C={C} icone="cle" titre="Clés d'accès (Passkeys)" description={`${nbCles} clé(s) enregistrée(s)`}
                etat={<EtatTexte C={C} ok={nbCles > 0} libelle={nbCles > 0 ? "Configuré" : "Non activé"}/>}
                action={browserSupportsWebAuthn() ? (
                  <Button tokens={uiTokens} className={classeBouton} variant="secondary" size="md" loading={addingDevice} onClick={() => setShowLabelPrompt(true)}>
                    Ajouter cet appareil
                  </Button>
                ) : undefined}
              >
                {nbCles > 0 && (
                  <div role="group" aria-label="Clés d'accès enregistrées">
                    {security.webauthn_credentials.map((cred, i) => {
                      const nom = cred.device_label || `Passkey #${i + 1}`;
                      return (
                        <SousLigneSecurite
                          key={cred.id} C={C} titre={nom}
                          description={cred.last_used_at ? `Utilisée le ${dateLongue(cred.last_used_at)}` : `Ajoutée le ${dateLongue(cred.created_at)}`}
                          action={
                            <ActionDeuxTemps
                              tokens={uiTokens} C={C} enConfirmation={aConfirmer?.type === "passkey" && aConfirmer.id === cred.id}
                              libelle="Retirer" libelleConfirmer="Confirmer le retrait"
                              ariaDemande={`Retirer la clé d'accès ${nom}`} ariaConfirmer={`Confirmer le retrait de la clé d'accès ${nom}`} ariaAnnuler={`Annuler le retrait de la clé d'accès ${nom}`}
                              onDemander={() => setAConfirmer({ type: "passkey", id: cred.id })}
                              onConfirmer={async () => { setAConfirmer(null); await revokeWebauthn(cred.id); }}
                              onAnnuler={() => setAConfirmer(null)}
                            />
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </LigneSecurite>

              {/* PIN */}
              <LigneSecurite
                C={C} icone="pin" titre="Code PIN Yelen" description={security.pin_configured ? "Configuré — déverrouillage rapide actif" : "Non configuré"}
                etat={<EtatTexte C={C} ok={security.pin_configured} libelle={security.pin_configured ? "Configuré" : "Non activé"}/>}
                action={
                  <>
                    <Button tokens={uiTokens} className={classeBouton} variant="secondary" size="md" ariaLabel={security.pin_configured ? "Modifier le code PIN" : "Définir le code PIN"} onClick={() => { setPinModal("set"); setPinValue(""); setPinConfirm(""); setPinError(""); }}>
                      {security.pin_configured ? "Modifier" : "Définir"}
                    </Button>
                    {security.pin_configured && (
                      <Button tokens={uiTokens} className={classeBouton} variant="secondary" size="md" style={boutonRougeDoux} ariaLabel="Supprimer le code PIN" onClick={() => { setPinModal("delete"); setPinValue(""); setPinError(""); }}>
                        Supprimer
                      </Button>
                    )}
                  </>
                }
              />

              {/* 2FA TOTP — TotpSection.tsx, partagée avec ProfilTab.tsx
                  (Administration & accès, tous rôles) depuis le 16/09/2026. */}
              <TotpSection variante="ligne" onToast={notify} onChange={loadSecurity}/>
            </SectionSecurite>

            {/* ── APPAREILS & SESSIONS ── */}
            <SectionSecurite C={C} id="sec-appareils" titre="Appareils & sessions">
              <LigneSecurite
                C={C} icone="appareil" titre="Appareils mémorisés" description="Déverrouillage rapide sans OTP à chaque connexion"
                action={activeDevices.length > 1 ? (
                  <Button tokens={uiTokens} className={classeBouton} variant="secondary" size="md" style={{ ...boutonRougeDoux, whiteSpace: "nowrap" }} ariaLabel={`Déconnecter les ${activeDevices.length - 1} autres appareils`} onClick={() => setConfirmRevokeAll(true)}>
                    Déconnecter les autres ({activeDevices.length - 1})
                  </Button>
                ) : undefined}
              />
              {activeDevices.length > 0 ? activeDevices.map((dev, i) => {
                const nom = nomAffiche(i);
                const memorise = dateHeureCourte(dev.created_at);
                return (
                  <LigneSecurite
                    key={dev.id} C={C} icone="appareil"
                    titre={
                      <>
                        {nom}
                        {dev.is_current_device && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: `1px solid ${C.green}60`, color: C.t1, fontSize: "12px", fontWeight: 500, padding: "1px 8px", borderRadius: "10px" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                            Cet appareil
                          </span>
                        )}
                      </>
                    }
                    description={
                      `${dev.device_label ? `${dev.device_label} · ` : ""}Mémorisé le ${memorise} (${tempsRelatif(dev.created_at)})${dev.last_used_at ? ` · Dernière utilisation ${tempsRelatif(dev.last_used_at)}` : ""}`
                    }
                    action={!dev.is_current_device ? (
                      <ActionDeuxTemps
                        tokens={uiTokens} C={C} enConfirmation={aConfirmer?.type === "appareil" && aConfirmer.id === dev.id}
                        libelle="Déconnecter" libelleConfirmer="Confirmer la déconnexion"
                        ariaDemande={`Déconnecter l'appareil ${nom} mémorisé le ${memorise}`} ariaConfirmer={`Confirmer la déconnexion de l'appareil ${nom} mémorisé le ${memorise}`} ariaAnnuler={`Annuler la déconnexion de l'appareil ${nom}`}
                        onDemander={() => setAConfirmer({ type: "appareil", id: dev.id })}
                        onConfirmer={async () => { setAConfirmer(null); await revokeRememberDevice(dev.id); }}
                        onAnnuler={() => setAConfirmer(null)}
                      />
                    ) : undefined}
                  />
                );
              }) : (
                <div className="sec-ligne">
                  <div className="sec-tete" style={{ minHeight: "48px" }}>
                    <div style={{ color: C.t2, fontSize: "13px" }}>Aucun appareil mémorisé pour l&apos;instant.</div>
                  </div>
                </div>
              )}
            </SectionSecurite>
          </>
        )}

        {/* ── ACTIVITÉ DE SÉCURITÉ ── */}
        <SectionSecurite C={C} id="sec-activite" titre="Activité de sécurité">
          {journal === null ? (
            <div className="sec-ligne">
              <div className="sec-tete" style={{ minHeight: "48px" }} aria-busy="true">
                <div className="sec-skel" style={{ height: "14px", width: "55%" }}/>
              </div>
            </div>
          ) : journal.length > 0 ? journal.map(e => (
            <div key={e.id} className="sec-ligne">
              <div className="sec-tete" style={{ minHeight: "48px", paddingTop: "8px", paddingBottom: "8px" }}>
                <div className="sec-corps">
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500 }}>{LIBELLES_JOURNAL[e.action] ?? "Activité de sécurité"}</div>
                  <div style={{ color: C.t2, fontSize: "13px" }}>{e.navigateur || "Navigateur"} sur {e.os || "appareil"}</div>
                </div>
                <time dateTime={e.created_at} title={dateHeureComplete(e.created_at)} style={{ color: C.t2, fontSize: "13px", flexShrink: 0 }}>{tempsRelatif(e.created_at)}</time>
              </div>
            </div>
          )) : (
            <div className="sec-ligne">
              <div className="sec-tete" style={{ minHeight: "48px" }}>
                <div style={{ color: C.t2, fontSize: "13px" }}>Aucune connexion récente enregistrée.</div>
              </div>
            </div>
          )}
          {/* Honnêteté explicite (protocole CLAUDE.md) : le PIN et les
              révocations d'appareils ne sont pas encore journalisés — ne pas
              fabriquer ces lignes tant que la donnée n'existe pas réellement. */}
          <div className="sec-ligne" style={{ padding: "12px 16px", color: C.t2, fontSize: "12px", lineHeight: 1.5 }}>
            Historique complet dans le Journal d&apos;activité.
          </div>
        </SectionSecurite>

        {/* ── RÉCUPÉRATION DU COMPTE ── */}
        {security && (
          <SectionSecurite C={C} id="sec-recuperation" titre="Récupération du compte">
            <LigneSecurite C={C} icone="telephone" titre="Téléphone" description={security.recovery_phone ? maskPhone(security.recovery_phone) : "Non renseigné"}/>
            <LigneSecurite C={C} icone="email" titre="Email" description={security.recovery_email ? maskEmail(security.recovery_email) : "Non renseigné"}/>
          </SectionSecurite>
        )}
        {/* Codes de récupération — réels, vivent sous la 2FA (voir
            TotpSection.tsx ci-dessus, "Codes de récupération : X
            restants") : ils n'existent qu'en tant que secours TOTP, jamais
            un mécanisme indépendant fabriqué de toutes pièces ici. */}

        {/* ── MODALE PIN ── */}
        {pinModal && (
          <ModaleSecurite C={C} titre={pinModal === "set" ? "Code PIN" : "Supprimer le code PIN"} onClose={() => setPinModal(null)}>
            {pinModal === "set" ? (
              <>
                <input type="password" inputMode="numeric" maxLength={8} value={pinValue} onChange={e => setPinValue(e.target.value.replace(/\D/g, ""))} placeholder="Nouveau code (4 à 8 chiffres)" aria-label="Nouveau code PIN, 4 à 8 chiffres" className="yelen-focus-ring" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
                <input type="password" inputMode="numeric" maxLength={8} value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ""))} placeholder="Confirmez le code" aria-label="Confirmez le code PIN" className="yelen-focus-ring" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
              </>
            ) : (
              <input type="password" inputMode="numeric" maxLength={8} value={pinValue} onChange={e => setPinValue(e.target.value.replace(/\D/g, ""))} placeholder="Code actuel" aria-label="Code PIN actuel" className="yelen-focus-ring" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
            )}
            {pinError && <div role="alert" style={{ color: C.red, fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>{pinError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
              <Button tokens={uiTokens} className={classeBouton} variant="secondary" size="md" onClick={() => setPinModal(null)}>Annuler</Button>
              <Button tokens={uiTokens} variant={pinModal === "delete" ? "danger" : "primary"} size="md" loading={pinLoading} onClick={pinModal === "set" ? submitSetPin : submitDeletePin} className={classeBouton}>
                {pinModal === "set" ? "Enregistrer" : "Supprimer"}
              </Button>
            </div>
          </ModaleSecurite>
        )}

        {/* ── MODALE LABEL APPAREIL AVANT AJOUT WEBAUTHN ── */}
        {showLabelPrompt && (
          <ModaleSecurite C={C} titre="Ajouter cet appareil" sousTitre="Donnez-lui un nom pour le reconnaître facilement (optionnel)." onClose={() => setShowLabelPrompt(false)}>
            <input value={deviceLabelInput} onChange={e => setDeviceLabelInput(e.target.value)} placeholder="Ex. iPhone du bureau" aria-label="Nom de l'appareil (optionnel)" className="yelen-focus-ring" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "14px" }} />
            <Button tokens={uiTokens} variant="primary" size="md" fullWidth onClick={addWebauthnDevice} className={classeBouton}>Continuer</Button>
          </ModaleSecurite>
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
          reason={reauthReason}
          onClose={() => { setReauthOpen(false); setPendingAction(null); setReauthReason(undefined); }}
          onSuccess={() => { const action = pendingAction; setReauthOpen(false); setPendingAction(null); setReauthReason(undefined); action?.(); }}
        />
      </div>
    </div>
  );
}
