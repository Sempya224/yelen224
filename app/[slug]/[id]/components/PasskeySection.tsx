"use client";

// Passkeys PAR MEMBRE (16/09/2026) — distinct des clés institution-wide du
// compte principal gérées dans SecuriteCompteTab.tsx (parametres-securite,
// admin uniquement). Ici, N'IMPORTE QUEL rôle enregistre SA PROPRE clé,
// utilisable comme alternative au PIN via son identifiant sur l'écran de
// connexion membre (voir MembreLoginSection.tsx). Toutes les routes sont
// scopées par membre_id côté serveur — jamais une clé d'un collègue.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { Button } from "@/components/ui/Button";
import { ReauthModal } from "./ReauthModal";

type Credential = { id: string; device_label: string | null; created_at: string; last_used_at: string | null };

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

export function PasskeySection({ onToast }: { onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [creds, setCreds] = useState<Credential[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [showLabelPrompt, setShowLabelPrompt] = useState(false);
  const [deviceLabelInput, setDeviceLabelInput] = useState("");
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/institution/auth/webauthn/membre");
      const data = await res.json();
      if (res.ok) setCreds(data.credentials ?? []);
    } catch { /* silencieux, garde l'état précédent */ }
  }

  useEffect(() => { load(); }, []);

  async function addDevice() {
    setShowLabelPrompt(false);
    setAdding(true);
    try {
      const optRes = await fetch("/api/institution/auth/webauthn/membre/register-options", { method: "POST" });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setAdding(false);
        if (optData?.code === "REAUTH_REQUIRED") { setPendingAction(() => addDevice); setReauthOpen(true); return; }
        onToast(optData.error || "Impossible de préparer l'ajout de la clé d'accès. Réessayez.", C.red);
        return;
      }

      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: optData.options });
      } catch (err) {
        console.error("[WEBAUTHN MEMBRE REGISTER] échec startRegistration", err);
        if (err instanceof Error && err.name === "SecurityError") {
          onToast("Les clés d'accès nécessitent un vrai nom de domaine (pas une adresse IP) — utilisez localhost ou le domaine Yelen.", C.red);
        } else {
          onToast("Enregistrement annulé.", C.t2);
        }
        setAdding(false);
        return;
      }

      const verifyRes = await fetch("/api/institution/auth/webauthn/membre/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: attestation, challengeToken: optData.challengeToken, deviceLabel: deviceLabelInput.trim() || undefined }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) { onToast(verifyData.error || "La clé d'accès n'a pas pu être enregistrée. Réessayez.", C.red); setAdding(false); return; }

      setDeviceLabelInput("");
      onToast("Clé d'accès ajoutée", C.green);
      load();
    } catch {
      onToast("Impossible de contacter le serveur pendant l'ajout de la clé d'accès. Vérifiez votre connexion et réessayez.", C.red);
    }
    setAdding(false);
  }

  async function revoke(credentialId: string) {
    try {
      const res = await fetch("/api/institution/auth/webauthn/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.code === "REAUTH_REQUIRED") { setPendingAction(() => () => revoke(credentialId)); setReauthOpen(true); return; }
        onToast("Impossible de retirer cette clé d'accès. Réessayez.", C.red);
        return;
      }
      onToast("Clé d'accès retirée", C.green);
      load();
    } catch { onToast("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", C.red); }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: (creds?.length ?? 0) > 0 ? "10px" : 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Clés d&apos;accès (Passkeys)</div>
          <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>
            {creds === null ? <YelenLoader size={10}/> : `${creds.length} clé(s) enregistrée(s) — alternative à votre PIN`}
          </div>
        </div>
        {browserSupportsWebAuthn() && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ color: C.gold, border: `1px solid ${C.gold}30`, flexShrink: 0 }} loading={adding} onClick={() => setShowLabelPrompt(true)}>
            Ajouter cet appareil
          </Button>
        )}
      </div>

      {(creds?.length ?? 0) > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {creds!.map((cred, i) => (
            <div key={cred.id} style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 11px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cred.device_label || `Passkey #${i + 1}`}</div>
                <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{cred.last_used_at ? `Utilisée ${timeAgoShort(cred.last_used_at)}` : `Ajoutée ${timeAgoShort(cred.created_at)}`}</div>
              </div>
              <button onClick={() => revoke(cred.id)} className="tap" style={{ background: "none", border: "none", color: C.red, fontSize: "11px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>Retirer</button>
            </div>
          ))}
        </div>
      )}

      {showLabelPrompt && (
        <div onClick={() => setShowLabelPrompt(false)} className="yelen-confirm-overlay" style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} className="yelen-confirm-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
            <div className="yelen-confirm-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />
            <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800", marginBottom: "6px" }}>Ajouter cet appareil</div>
            <div style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Donnez-lui un nom pour le reconnaître facilement (optionnel).</div>
            <input value={deviceLabelInput} onChange={e => setDeviceLabelInput(e.target.value)} placeholder="Ex. iPhone du bureau" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "14px" }} />
            <Button tokens={toUiTokens(C)} variant="primary" size="md" fullWidth onClick={addDevice} className="tap">Continuer</Button>
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
