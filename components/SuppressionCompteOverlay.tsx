"use client";

import { useEffect, useState } from "react";
import { YelenLogo } from "@/components/YelenLogo";

// Parcours de suppression de compte citoyen (retour Bryan 12/09/2026) —
// pop plein écran en 3 temps, remplace l'ancienne modale centrée unique de
// app/compte/confidentialite/confidentialite-client.tsx. Toute la logique
// réseau (feedback, envoi/vérification OTP, vérification PIN/TOTP,
// suppression réelle) reste dans le parent — ce composant est uniquement
// la présentation des 3 écrans et leur enchaînement.
const RAISONS: { id: string; label: string }[] = [
  { id: "non_utilise", label: "Je n'utilise plus l'application" },
  { id: "confidentialite", label: "Je m'inquiète pour la confidentialité de mes données" },
  { id: "fonctionnalites_manquantes", label: "L'application manque de fonctionnalités" },
  { id: "deuxieme_compte", label: "J'ai créé un deuxième compte" },
  { id: "autre", label: "Autre raison" },
];

function maskerPhone(phone: string | null): string {
  if (!phone) return "votre numéro";
  return phone.replace(/(\+224)(\d{2})(\d{3})(\d{4})/, "$1 $2•••$4");
}

function LogoBadge({ isDark }: { isDark: boolean }) {
  return (
    <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "calc(20px + env(safe-area-inset-top)) 0 4px" }}>
      <div style={{ width: "40px", height: "40px", background: "#F5A623", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px rgba(245,166,35,${isDark ? 0.25 : 0.3})` }}>
        <YelenLogo size={20} color="#080812"/>
      </div>
    </div>
  );
}

export function SuppressionCompteOverlay({
  bg, card, t1, t2, brd, isDark, pinConfigure, totpEnabled, phone,
  onClose, onEnvoyerFeedback, onEnvoyerOtp, onVerifierIdentite, onConfirmer,
}: {
  bg: string; card: string; t1: string; t2: string; brd: string; isDark: boolean;
  pinConfigure: boolean; totpEnabled: boolean; phone: string | null;
  onClose: () => void;
  onEnvoyerFeedback: (raison: string | null, detail: string) => Promise<void>;
  onEnvoyerOtp: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onVerifierIdentite: (otp: string, pin: string, totp: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onConfirmer: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [etape, setEtape] = useState<"feedback" | "verification" | "confirmation">("feedback");
  const [raison, setRaison] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [totp, setTotp] = useState("");
  const [verifMsg, setVerifMsg] = useState<string | null>(null);
  const [verifEnCours, setVerifEnCours] = useState(false);
  const [otpMsg, setOtpMsg] = useState<string | null>(null);

  const [suppTexte, setSuppTexte] = useState("");
  const [suppMsg, setSuppMsg] = useState<string | null>(null);
  const [suppEnCours, setSuppEnCours] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f5f5f8", border: `1px solid ${brd}`,
    borderRadius: "12px", padding: "12px 14px", color: t1, fontSize: "14px", fontFamily: "inherit",
  };

  useEffect(() => {
    if (etape !== "verification") return;
    void (async () => {
      setOtpMsg(null);
      const result = await onEnvoyerOtp();
      if (!result.ok) setOtpMsg(result.error);
    })();
    // Envoi automatique une seule fois à l'entrée sur cet écran — pas de
    // dépendance sur onEnvoyerOtp (identité de fonction du parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape]);

  async function continuerVersSuppression() {
    if (raison || detail.trim()) {
      setEnvoiEnCours(true);
      await onEnvoyerFeedback(raison, detail);
      setEnvoiEnCours(false);
    }
    setEtape("verification");
  }

  async function renvoyerOtp() {
    setOtpMsg(null);
    const result = await onEnvoyerOtp();
    if (!result.ok) setOtpMsg(result.error);
    else setOtpMsg("Nouveau code envoyé.");
  }

  async function confirmerIdentite() {
    setVerifMsg(null);
    if (!otp.trim()) { setVerifMsg("Entrez le code reçu par SMS."); return; }
    if (pinConfigure && pin.length < 4) { setVerifMsg("Entrez votre code PIN."); return; }
    if (totpEnabled && !totp.trim()) { setVerifMsg("Entrez le code de votre application d'authentification."); return; }
    setVerifEnCours(true);
    const result = await onVerifierIdentite(otp.trim(), pin, totp.trim());
    setVerifEnCours(false);
    if (!result.ok) { setVerifMsg(result.error); return; }
    setEtape("confirmation");
  }

  async function confirmerSuppression() {
    setSuppMsg(null);
    if (suppTexte.trim().toUpperCase() !== "SUPPRIMER") { setSuppMsg('Tapez "SUPPRIMER" pour confirmer.'); return; }
    setSuppEnCours(true);
    const result = await onConfirmer();
    setSuppEnCours(false);
    if (!result.ok) setSuppMsg(result.error);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: bg, display: "flex", flexDirection: "column" }}>
      {etape === "feedback" && (
        <>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "calc(20px + env(safe-area-inset-top)) 20px 20px" }}>
            <div style={{ color: t1, fontSize: "20px", fontWeight: 900, marginBottom: "6px", lineHeight: 1.25 }}>
              Nous sommes désolés de vous voir partir
            </div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "22px" }}>
              Dites-nous ce qui n&apos;a pas fonctionné. Vos retours nous aident à améliorer Yelen pour tout le monde. (Facultatif)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {RAISONS.map(r => {
                const actif = raison === r.id;
                return (
                  <button key={r.id} type="button" onClick={() => setRaison(actif ? null : r.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderRadius: "16px", border: "none", backgroundColor: card, cursor: "pointer", textAlign: "left" }}>
                    <span style={{ flexShrink: 0, width: "20px", height: "20px", borderRadius: "50%", border: `2px solid ${actif ? "#F5A623" : t2}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {actif && <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#F5A623" }}/>}
                    </span>
                    <span style={{ color: t1, fontSize: "14px", fontWeight: 700 }}>{r.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Un détail à nous partager ?</div>
            <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3} placeholder="Optionnel" style={{ ...inputStyle, resize: "none" }}/>
          </div>

          <div style={{ flexShrink: 0, padding: "12px 20px calc(env(safe-area-inset-bottom) + 20px)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <button onClick={continuerVersSuppression} disabled={envoiEnCours} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "16px", background: t1, border: "none", color: bg, fontWeight: 800, fontSize: "15px", cursor: envoiEnCours ? "default" : "pointer", opacity: envoiEnCours ? 0.7 : 1 }}>
              {envoiEnCours ? "Envoi…" : "Continuer vers la suppression"}
            </button>
            <button onClick={onClose} disabled={envoiEnCours} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "16px", background: "transparent", border: `1px solid ${brd}`, color: t1, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>
              Conserver mon compte
            </button>
          </div>
        </>
      )}

      {etape === "verification" && (
        <>
          <LogoBadge isDark={isDark}/>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <div style={{ maxWidth: "380px", width: "100%" }}>
              <div style={{ color: t1, fontSize: "20px", fontWeight: 900, marginBottom: "10px", lineHeight: 1.25, textAlign: "center" }}>
                Confirmez votre identité
              </div>
              <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "20px", textAlign: "center" }}>
                Un code a été envoyé au {maskerPhone(phone)}. Cette vérification protège votre compte avant une suppression définitive.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ color: t2, fontSize: "12px", fontWeight: 700 }}>Code reçu par SMS :</div>
                <input style={{ ...inputStyle, letterSpacing: "3px", textAlign: "center" }} type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="123456" autoFocus/>
                <button type="button" onClick={renvoyerOtp} className="tap" style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#F5A623", fontWeight: 700, fontSize: "12.5px", cursor: "pointer", padding: 0 }}>
                  Renvoyer le code
                </button>

                {pinConfigure && (
                  <>
                    <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginTop: "6px" }}>Code PIN :</div>
                    <input style={{ ...inputStyle, letterSpacing: "2px", textAlign: "center" }} type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••"/>
                  </>
                )}

                {totpEnabled && (
                  <>
                    <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginTop: "6px" }}>Code de votre application d&apos;authentification :</div>
                    <input style={{ ...inputStyle, letterSpacing: "3px", textAlign: "center" }} type="text" inputMode="text" maxLength={9} value={totp} onChange={(e) => setTotp(e.target.value.toUpperCase())} placeholder="123456"/>
                  </>
                )}

                {otpMsg && <div style={{ color: t2, fontSize: "12.5px" }}>{otpMsg}</div>}
                {verifMsg && <div style={{ color: "#ef4444", fontSize: "12.5px" }}>{verifMsg}</div>}
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0, padding: "12px 20px calc(env(safe-area-inset-bottom) + 20px)", display: "flex", gap: "10px" }}>
            <button onClick={onClose} disabled={verifEnCours} className="tap" style={{ flex: 1, padding: "15px", borderRadius: "16px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`, color: t1, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>
              Annuler
            </button>
            <button onClick={confirmerIdentite} disabled={verifEnCours} className="tap" style={{ flex: 1, padding: "15px", borderRadius: "16px", background: t1, border: "none", color: bg, fontWeight: 800, fontSize: "14px", cursor: "pointer", opacity: verifEnCours ? 0.7 : 1 }}>
              {verifEnCours ? "Vérification…" : "Continuer"}
            </button>
          </div>
        </>
      )}

      {etape === "confirmation" && (
        <>
          <LogoBadge isDark={isDark}/>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <div style={{ maxWidth: "380px", width: "100%" }}>
              <div style={{ color: "#ef4444", fontSize: "20px", fontWeight: 900, marginBottom: "10px", lineHeight: 1.25 }}>
                Supprimer définitivement votre compte ?
              </div>
              <div style={{ color: t1, fontSize: "13px", lineHeight: 1.6, marginBottom: "20px" }}>
                Cette action est irréversible. L&apos;ensemble de vos données (historique, documents, rendez-vous et preuves) sera supprimé, à l&apos;exception des informations conservées selon les obligations légales en vigueur.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ color: t2, fontSize: "12px", fontWeight: 700 }}>Tapez SUPPRIMER pour confirmer :</div>
                <input style={inputStyle} value={suppTexte} onChange={(e) => setSuppTexte(e.target.value)} placeholder="SUPPRIMER" autoFocus/>
                {suppMsg && <div style={{ color: "#ef4444", fontSize: "12.5px" }}>{suppMsg}</div>}
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0, padding: "12px 20px calc(env(safe-area-inset-bottom) + 20px)", display: "flex", gap: "10px" }}>
            <button onClick={onClose} disabled={suppEnCours} className="tap" style={{ flex: 1, padding: "15px", borderRadius: "16px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`, color: t1, fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>
              Annuler
            </button>
            <button onClick={confirmerSuppression} disabled={suppEnCours} className="tap" style={{ flex: 1, padding: "15px", borderRadius: "16px", background: "#ef4444", border: "none", color: "#fff", fontWeight: 800, fontSize: "14px", cursor: "pointer", opacity: suppEnCours ? 0.6 : 1 }}>
              {suppEnCours ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
