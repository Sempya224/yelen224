"use client";

// Modale partagée de réauthentification pour actions sensibles (moteur
// 16/09/2026, mirroring l'écran équivalent admin) — appelée par n'importe
// quel onglet institution quand une route répond 403 { code:
// "REAUTH_REQUIRED" }. Le PIN est le seul facteur personnel réel d'un
// membre (institution_membres.pin_hash) ; le TOTP n'est demandé en second
// temps que si /api/institution/auth/reauth répond { requiresTotp: true }
// (membre ayant déjà activé la 2FA). Sur succès, appelle onSuccess() —
// à charge de l'appelant de rejouer l'action d'origine.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";

export function ReauthModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [pin, setPin] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [backupMode, setBackupMode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  function reinitialiser() {
    setPin(""); setTotpCode(""); setNeedsTotp(false); setBackupMode(false); setError(""); setLoading(false);
  }

  function fermer() {
    reinitialiser();
    onClose();
  }

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/institution/auth/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, totp_code: needsTotp ? totpCode : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.requiresTotp) { setNeedsTotp(true); setLoading(false); return; }
      if (!res.ok) { setError(data?.error || "La confirmation a échoué. Réessayez."); setLoading(false); return; }
      reinitialiser();
      onSuccess();
    } catch {
      setError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
      setLoading(false);
    }
  }

  const pret = needsTotp
    ? (backupMode ? totpCode.trim().length > 0 : totpCode.length === 6)
    : pin.length === 6;

  return (
    <div onClick={fermer} className="yelen-confirm-overlay" style={{ position: "fixed", inset: 0, zIndex: 1550, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
      <div onClick={e => e.stopPropagation()} className="yelen-confirm-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
        <div className="yelen-confirm-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />
        <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800", marginBottom: "6px" }}>Confirmez votre identité</div>
        <div style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>
          {!needsTotp
            ? "Cette action est sensible — entrez votre PIN pour continuer."
            : backupMode ? "Entrez un de vos codes de secours." : "Entrez le code de votre application d'authentification."}
        </div>
        {!needsTotp ? (
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="PIN à 6 chiffres"
            style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "16px", letterSpacing: "3px", textAlign: "center", color: C.t1, marginBottom: "10px" }}
          />
        ) : (
          <>
            <input
              type="text"
              inputMode={backupMode ? "text" : "numeric"}
              maxLength={backupMode ? 9 : 6}
              value={totpCode}
              onChange={e => setTotpCode(backupMode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
              placeholder={backupMode ? "XXXX-XXXX" : "Code à 6 chiffres"}
              style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "16px", letterSpacing: "3px", textAlign: "center", color: C.t1, marginBottom: "10px" }}
            />
            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <button onClick={() => { setBackupMode(v => !v); setTotpCode(""); setError(""); }} className="tap" style={{ background: "none", border: "none", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                {backupMode ? "Utiliser l'application d'authentification" : "Utiliser un code de secours"}
              </button>
            </div>
          </>
        )}
        {error && <div style={{ color: C.red, fontSize: "11px", fontWeight: "700", marginBottom: "10px" }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={fermer}>Annuler</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!pret} loading={loading} onClick={submit}>Confirmer</Button>
        </div>
      </div>
    </div>
  );
}
