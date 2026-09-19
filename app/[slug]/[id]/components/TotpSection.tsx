"use client";

// 2FA TOTP par membre — extrait de SecuriteCompteTab.tsx (16/09/2026) pour
// être réutilisable ailleurs que dans "Sécurité du compte" (onglet
// parametres-securite, réservé au rôle admin). totp_enabled/totp_secret/
// totp_backup_codes vivent sur institution_membres (pas institutions) —
// c'est un réglage PERSONNEL de CE membre, contrairement au PIN/passkeys/
// appareils institution-wide qui restent exclusifs à "Sécurité du
// compte". GET /api/institution/security-status n'a aucune restriction de
// rôle côté route (seul le TAB_MATRIX empêchait les 4 autres rôles d'y
// accéder) — safe à appeler depuis n'importe quel onglet self-scope.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { Button } from "@/components/ui/Button";
import { ReauthModal } from "./ReauthModal";

export function TotpSection({ onToast, onChange }: { onToast: (msg: string, color?: string) => void; onChange?: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [enabled, setEnabled] = useState(false);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(0);
  const [statusLoading, setStatusLoading] = useState(true);

  const [totpModal, setTotpModal] = useState<null | "activer" | "desactiver">(null);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpConfirmCode, setTotpConfirmCode] = useState("");
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[] | null>(null);
  const [backupCodesJustRegenerated, setBackupCodesJustRegenerated] = useState(false);
  const [totpError, setTotpError] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  async function loadStatus() {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/institution/security-status");
      const data = await res.json();
      if (res.ok) { setEnabled(!!data.totp_enabled); setBackupCodesRemaining(data.totp_backup_codes_remaining ?? 0); }
    } catch { /* silencieux, garde l'état précédent */ }
    setStatusLoading(false);
  }

  useEffect(() => { loadStatus(); }, []);

  async function startTotpActivation() {
    setTotpLoading(true); setTotpError("");
    try {
      const res = await fetch("/api/institution/securite/totp/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTotpLoading(false);
        if (data?.code === "REAUTH_REQUIRED") { setPendingAction(() => startTotpActivation); setReauthOpen(true); return; }
        onToast(data.error || "Impossible de préparer la double authentification. Réessayez.", C.red);
        return;
      }
      setTotpQr(data.qrDataUrl); setTotpSecret(data.secret); setTotpModal("activer");
    } catch { onToast("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", C.red); }
    setTotpLoading(false);
  }

  async function confirmTotpActivation() {
    setTotpError("");
    if (!totpConfirmCode.trim()) { setTotpError("Entrez le code à 6 chiffres affiché par votre application d'authentification."); return; }
    setTotpLoading(true);
    try {
      const res = await fetch("/api/institution/securite/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpConfirmCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setTotpError(data.error || "Ce code est incorrect ou a expiré. Vérifiez l'heure de votre téléphone et réessayez avec le nouveau code affiché."); setTotpLoading(false); return; }
      setTotpBackupCodes(data.backupCodes);
      setTotpQr(null); setTotpSecret(null); setTotpConfirmCode("");
      loadStatus(); onChange?.();
    } catch { setTotpError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez."); }
    setTotpLoading(false);
  }

  async function confirmTotpDisable() {
    setTotpError("");
    if (!totpDisableCode.trim()) { setTotpError("Entrez un code de votre application d'authentification, ou un code de secours."); return; }
    setTotpLoading(true);
    try {
      const res = await fetch("/api/institution/securite/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpDisableCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setTotpError(data.error || "Ce code est incorrect ou déjà utilisé. Vérifiez l'heure de votre téléphone ou essayez un code de secours."); setTotpLoading(false); return; }
      setTotpModal(null); setTotpDisableCode("");
      onToast("Double authentification désactivée", C.green);
      loadStatus(); onChange?.();
    } catch { setTotpError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez."); }
    setTotpLoading(false);
  }

  async function regenererCodesSecours() {
    setRegenLoading(true);
    try {
      const res = await fetch("/api/institution/securite/totp/backup-codes/regenerate", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRegenLoading(false);
        if (data?.code === "REAUTH_REQUIRED") { setPendingAction(() => regenererCodesSecours); setReauthOpen(true); return; }
        onToast(data?.error || "Impossible de régénérer vos codes de récupération. Réessayez.", C.red);
        return;
      }
      setBackupCodesJustRegenerated(true);
      setTotpBackupCodes(data.backupCodes);
      loadStatus(); onChange?.();
    } catch { onToast("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", C.red); }
    setRegenLoading(false);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Authentification à deux facteurs (2FA)</div>
          <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>
            {statusLoading ? <YelenLoader size={10}/> : enabled ? "Activée — code demandé à chaque connexion" : "Non activée · protège votre compte personnel"}
          </div>
        </div>
        {!statusLoading && (
          enabled
            ? <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="sm" style={{ flexShrink: 0 }} onClick={() => { setTotpModal("desactiver"); setTotpDisableCode(""); setTotpError(""); }}>Désactiver</Button>
            : <Button tokens={toUiTokens(C)} variant="secondary" size="sm" style={{ color: C.gold, border: `1px solid ${C.gold}30`, flexShrink: 0 }} loading={totpLoading} onClick={startTotpActivation} className="tap">Activer</Button>
        )}
      </div>

      {/* Codes de récupération — n'existent qu'en tant que secours de la 2FA
          (institution_membres.totp_backup_codes), jamais un mécanisme
          indépendant fabriqué de toutes pièces. */}
      {!statusLoading && enabled && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Codes de récupération</div>
            <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{backupCodesRemaining} code{backupCodesRemaining > 1 ? "s" : ""} restant{backupCodesRemaining > 1 ? "s" : ""}</div>
          </div>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ flexShrink: 0 }} loading={regenLoading} onClick={regenererCodesSecours}>Régénérer</Button>
        </div>
      )}

      {(totpModal || totpBackupCodes) && (
        <div onClick={() => { if (!totpBackupCodes) { setTotpModal(null); setTotpQr(null); setTotpSecret(null); setTotpConfirmCode(""); setTotpError(""); } }} className="yelen-confirm-overlay" style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} className="yelen-confirm-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="yelen-confirm-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />

            {totpBackupCodes ? (
              <>
                <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800", marginBottom: "8px" }}>Notez vos codes de secours</div>
                <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px", lineHeight: 1.5 }}>
                  {backupCodesJustRegenerated
                    ? "Les anciens codes ne fonctionnent plus. Chacun de ces nouveaux codes ne fonctionne qu'une seule fois."
                    : "Ils ne seront plus jamais affichés. Chacun ne fonctionne qu'une seule fois, en remplacement de votre application si vous la perdez."}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                  {totpBackupCodes.map(c => (
                    <code key={c} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 10px", color: C.t1, fontSize: "13px", textAlign: "center" }}>{c}</code>
                  ))}
                </div>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={() => {
                  const regenere = backupCodesJustRegenerated;
                  setTotpBackupCodes(null); setTotpModal(null); setBackupCodesJustRegenerated(false);
                  onToast(regenere ? "Codes de récupération régénérés" : "Double authentification activée", C.green);
                }}>
                  J&apos;ai noté mes codes
                </Button>
              </>
            ) : totpModal === "activer" ? (
              <>
                <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800", marginBottom: "12px" }}>Activer la 2FA</div>
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
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => { setTotpModal(null); setTotpQr(null); setTotpSecret(null); setTotpConfirmCode(""); setTotpError(""); }}>Annuler</Button>
                  <Button tokens={toUiTokens(C)} variant="primary" size="md" loading={totpLoading} onClick={confirmTotpActivation} className="tap">
                    Confirmer
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800", marginBottom: "12px" }}>Désactiver la 2FA</div>
                <div style={{ color: C.t3, fontSize: "12px", marginBottom: "14px" }}>Entrez un code de votre application (ou un code de secours) pour confirmer.</div>
                <input type="text" maxLength={9} value={totpDisableCode} onChange={e => setTotpDisableCode(e.target.value.toUpperCase())} placeholder="Code TOTP ou de secours" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "16px", letterSpacing: "3px", textAlign: "center", color: C.t1, marginBottom: "10px" }} />
                {totpError && <div style={{ color: C.red, fontSize: "11px", fontWeight: "700", marginBottom: "10px" }}>{totpError}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => { setTotpModal(null); setTotpDisableCode(""); setTotpError(""); }}>Annuler</Button>
                  <Button tokens={toUiTokens(C)} variant="danger" size="md" loading={totpLoading} onClick={confirmTotpDisable} className="tap">
                    Confirmer la désactivation
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ReauthModal
        open={reauthOpen}
        onClose={() => { setReauthOpen(false); setPendingAction(null); }}
        onSuccess={() => { const action = pendingAction; setReauthOpen(false); setPendingAction(null); action?.(); }}
      />
    </>
  );
}
