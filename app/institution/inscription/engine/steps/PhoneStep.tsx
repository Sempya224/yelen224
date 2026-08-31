"use client";

import { useState } from "react";
import Link from "next/link";
import { ErrorBanner, PrimaryButton, StepHeading } from "../ui";
import { useSignupTheme } from "../theme";
import { SignupState } from "../types";
import { filtrerSaisiePhone, normaliserChiffresPhone, validerFormatPhoneGuinee, versE164Guinee } from "@/lib/phoneGuinee";

function humanizeSendOtpError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "RATE_LIMITED": return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "COOLDOWN": return "Un code a déjà été envoyé récemment. Patientez avant de réessayer.";
    case "OTP_NOT_CONFIGURED": return "L'envoi de code n'est pas disponible pour le moment. Réessayez plus tard.";
    case "ALREADY_REGISTERED": return "Ce numéro est déjà enregistré. Connectez-vous à la place.";
    default: return fallback || "Un souci est survenu lors de l'envoi du code. Réessayez dans un instant.";
  }
}

export function PhoneStep({ updateState, onVerified }: {
  updateState: (patch: Partial<SignupState>) => void;
  onVerified: () => void;
}) {
  const C = useSignupTheme();
  const [phoneInput, setPhoneInput] = useState("");
  const [cgu, setCgu] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validation = validerFormatPhoneGuinee(phoneInput);
  const digits = normaliserChiffresPhone(phoneInput);
  const disabled = loading || !validation.valide || !cgu;

  async function handleSubmit() {
    if (honeypot) return; // bot piégé par le champ invisible — échec silencieux
    setError("");
    if (!validation.valide) return;
    if (!cgu) { setError("Acceptez les conditions d'utilisation pour continuer."); return; }

    setLoading(true);
    const fullPhone = versE164Guinee(digits);

    // La vérification "déjà enregistré" vit désormais uniquement côté
    // serveur (api/institution/auth/send-otp/route.ts, service_role) — plus
    // de pré-vérification ici via le client anon, qui ne voyait que les
    // institutions statut='validee' (RLS publique) et laissait passer les
    // institutions en_attente, incohérence réelle trouvée par Bryan le
    // 20/08/2026. send-otp voit maintenant TOUTES les institutions et
    // renvoie ALREADY_REGISTERED de façon systématique, avant tout envoi
    // d'OTP.
    try {
      const res = await fetch("/api/institution/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(humanizeSendOtpError(data.code, data.error));
        setLoading(false);
        return;
      }

      updateState({ phone: fullPhone, otpSent: true });
      onVerified();
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
    }
    setLoading(false);
  }

  return (
    // .signup-split ne prend effet qu'à partir de 960px (voir SignupShell) —
    // en dessous, ces deux div restent simplement empilées dans leur ordre
    // naturel, rendu mobile strictement inchangé.
    <div className="signup-split">
      <div className="signup-split-side">
        <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        <StepHeading title="Commençons par votre téléphone" subtitle="Nous utiliserons ce numéro pour sécuriser votre espace et vous permettre de vous connecter à Yelen." C={C}/>
      </div>

      <div className="signup-split-body">
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", borderRadius: "14px", border: `1.5px solid ${validation.code === "prefixe_inconnu" || validation.code === "caracteres_invalides" ? C.red : (validation.valide ? C.green : C.border)}`, overflow: "hidden", backgroundColor: C.card, transition: "border-color 0.2s" }}>
          <div style={{ padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", borderRight: `1.5px solid ${C.border}`, backgroundColor: C.goldBg2, flexShrink: 0 }}>
            <span style={{ color: C.gold, fontSize: "15px", fontWeight: 900 }}>+224</span>
          </div>
          <label htmlFor="signup-phone" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Numéro de téléphone</label>
          <input
            id="signup-phone"
            type="tel"
            placeholder="620 000 000"
            value={phoneInput}
            onChange={e => {
              const raw = filtrerSaisiePhone(e.target.value);
              if (raw.replace(/\s/g, "").length <= 10) setPhoneInput(raw);
            }}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            style={{ flex: 1, padding: "15px 16px", fontSize: "17px", fontWeight: 700, letterSpacing: "1.5px", border: "none", background: "transparent", color: C.dark }}
            autoFocus
          />
        </div>
        {validation.message && <p style={{ color: C.red, fontSize: "12px", marginTop: "6px" }}>{validation.message}</p>}
      </div>

      {/* Honeypot — piège anti-bot invisible, aucune friction pour un humain */}
      <div style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} name="url"/>
      </div>

      {/* Vraie case à cocher native (pas un div+role, section 23 du brief :
          jamais de div onClick quand un élément natif existe) — visuellement
          masquée mais focusable/actionnable au clavier, l'apparence
          personnalisée est portée par le <label> qui l'enveloppe. */}
      <label htmlFor="signup-cgu" style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "20px", cursor: "pointer" }}>
        <input id="signup-cgu" type="checkbox" checked={cgu} onChange={e => setCgu(e.target.checked)}
          style={{ position: "absolute", width: "18px", height: "18px", opacity: 0, cursor: "pointer", marginTop: "1px", flexShrink: 0 }}
        />
        <div aria-hidden="true" style={{ width: "18px", height: "18px", borderRadius: "5px", backgroundColor: cgu ? C.gold : "transparent", border: `2px solid ${cgu ? C.gold : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
          {cgu && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </div>
        <div style={{ color: C.gray, fontSize: "12px", lineHeight: 1.6 }}>
          J&apos;accepte les{" "}
          <Link href="/cgu" onClick={e => e.stopPropagation()} style={{ color: C.gold, fontWeight: 700, textDecoration: "none" }}>Conditions d&apos;utilisation</Link>
          {" "}et la{" "}
          <Link href="/confidentialite" onClick={e => e.stopPropagation()} style={{ color: C.gold, fontWeight: 700, textDecoration: "none" }}>Politique de confidentialité</Link>.
        </div>
      </label>

      {error && <ErrorBanner msg={error} C={C}/>}

      <PrimaryButton onClick={handleSubmit} disabled={disabled} loading={loading} loadingLabel="Envoi du code…" C={C}>
        Continuer
      </PrimaryButton>

      <div style={{ textAlign: "center", marginTop: "16px", color: C.gray, fontSize: "13px" }}>
        Déjà inscrit ?{" "}
        <Link href="/institution/connexion" style={{ color: C.gold, fontWeight: 700, textDecoration: "none" }}>Se connecter</Link>
      </div>
      </div>
    </div>
  );
}
