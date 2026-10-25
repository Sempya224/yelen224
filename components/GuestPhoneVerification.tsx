"use client";

// Réservation invité (ADR-001 E0.1, design A) — vérification téléphonique
// avant la création du RDV. Deux étapes : identité (prénom, nom, numéro) puis
// code OTP. Aucune donnée n'est créée côté serveur avant le succès du code
// (voir app/api/citoyen/auth/invite/*). Monté par app/rdv/[id]/page.tsx
// uniquement quand NEXT_PUBLIC_RESERVATION_INVITE_ENABLED === "true".

import { useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import type { ThemeTokens } from "@/lib/theme";

const GOLD = "#F5A623";

type Props = {
  C: ThemeTokens;
  /** Appelé une fois la session Supabase établie et le userId stocké. */
  onVerified: () => void;
  onClose: () => void;
};

export function GuestPhoneVerification({ C, onVerified, onClose }: Props) {
  const [etape, setEtape] = useState<"identite" | "code">("identite");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [chiffres, setChiffres] = useState("");
  const [code, setCode] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dejaInscrit, setDejaInscrit] = useState(false);
  const enCours = useRef(false);

  const phone = `+224${chiffres}`;
  const identiteValide = prenom.trim().length > 0 && nom.trim().length > 0 && /^\d{8,9}$/.test(chiffres);

  async function envoyerCode() {
    if (enCours.current || !identiteValide) return;
    enCours.current = true;
    setChargement(true);
    setErreur(null);
    setDejaInscrit(false);
    try {
      const res = await fetch("/api/citoyen/auth/invite/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) { setEtape("code"); return; }
      if (json?.code === "ALREADY_REGISTERED") { setDejaInscrit(true); setErreur("Un compte existe déjà avec ce numéro."); return; }
      setErreur(json?.error || "Nous n'avons pas pu envoyer le code. Réessayez.");
    } catch {
      setErreur("Un problème de connexion est survenu.");
    } finally {
      setChargement(false);
      enCours.current = false;
    }
  }

  async function verifierCode() {
    if (enCours.current || code.length !== 6) return;
    enCours.current = true;
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch("/api/citoyen/auth/invite/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, prenom: prenom.trim(), nom: nom.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (json?.code === "ALREADY_REGISTERED") { setDejaInscrit(true); setErreur("Un compte existe déjà avec ce numéro."); return; }
        // Le code est à usage unique : toute erreur de code impose d'en redemander un.
        if (json?.code === "INVALID_CODE") { setCode(""); setEtape("identite"); }
        setErreur(json?.error || "Nous n'avons pas pu vérifier le code. Réessayez.");
        return;
      }
      if (!json.tokenHash) { setErreur("Nous n'avons pas pu sécuriser votre connexion. Réessayez."); return; }
      const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: "email" });
      if (sessionError) { setErreur("Nous n'avons pas pu sécuriser votre connexion. Réessayez."); return; }
      try { localStorage.setItem(YELEN224_USER_ID_KEY, json.userId); } catch {}
      onVerified();
    } catch {
      setErreur("Un problème de connexion est survenu.");
    } finally {
      setChargement(false);
      enCours.current = false;
    }
  }

  const champ = {
    width: "100%", boxSizing: "border-box" as const, padding: "12px 14px", borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.pageBg, color: C.text, fontSize: 15, outline: "none",
  };
  const libelle = { display: "block", fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 } as const;

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Vérification du numéro de téléphone"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ width: "100%", maxWidth: 420, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>
            {etape === "identite" ? "Confirmez votre numéro" : "Entrez le code reçu"}
          </h2>
          <button
            type="button" onClick={onClose} aria-label="Fermer"
            style={{ background: "none", border: "none", color: C.textSubtle, fontSize: 22, lineHeight: 1, cursor: "pointer", padding: 4 }}
          >
            ×
          </button>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
          {etape === "identite"
            ? "Pour réserver sans compte, nous vérifions votre numéro. Votre créneau n'est réservé qu'après cette étape."
            : `Un code à 6 chiffres a été envoyé au ${phone}. Il est valable 5 minutes.`}
        </p>

        {etape === "identite" ? (
          <form onSubmit={e => { e.preventDefault(); void envoyerCode(); }} style={{ display: "grid", gap: 14 }}>
            <div>
              <label htmlFor="invite-prenom" style={libelle}>Prénom</label>
              <input id="invite-prenom" value={prenom} onChange={e => setPrenom(e.target.value)} autoComplete="given-name" style={champ} />
            </div>
            <div>
              <label htmlFor="invite-nom" style={libelle}>Nom</label>
              <input id="invite-nom" value={nom} onChange={e => setNom(e.target.value)} autoComplete="family-name" style={champ} />
            </div>
            <div>
              <label htmlFor="invite-phone" style={libelle}>Téléphone</label>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ ...champ, width: "auto", display: "flex", alignItems: "center", color: C.textMuted }}>+224</span>
                <input
                  id="invite-phone" value={chiffres} inputMode="numeric" autoComplete="tel-national"
                  onChange={e => setChiffres(e.target.value.replace(/\D/g, "").slice(0, 9))} style={champ}
                />
              </div>
            </div>
            <button
              type="submit" disabled={!identiteValide || chargement}
              style={{ marginTop: 4, padding: "13px 16px", borderRadius: 10, border: "none", background: GOLD, color: "#000", fontSize: 15, fontWeight: 800, cursor: !identiteValide || chargement ? "not-allowed" : "pointer", opacity: !identiteValide || chargement ? 0.5 : 1 }}
            >
              {chargement ? "Envoi…" : "Recevoir le code"}
            </button>
          </form>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void verifierCode(); }} style={{ display: "grid", gap: 14 }}>
            <div>
              <label htmlFor="invite-code" style={libelle}>Code de vérification</label>
              <input
                id="invite-code" value={code} inputMode="numeric" autoComplete="one-time-code" autoFocus
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{ ...champ, letterSpacing: 6, fontSize: 20, textAlign: "center" }}
              />
            </div>
            <button
              type="submit" disabled={code.length !== 6 || chargement}
              style={{ padding: "13px 16px", borderRadius: 10, border: "none", background: GOLD, color: "#000", fontSize: 15, fontWeight: 800, cursor: code.length !== 6 || chargement ? "not-allowed" : "pointer", opacity: code.length !== 6 || chargement ? 0.5 : 1 }}
            >
              {chargement ? "Vérification…" : "Confirmer et réserver"}
            </button>
            <button
              type="button" onClick={() => { setCode(""); setErreur(null); setEtape("identite"); }}
              style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", padding: 4 }}
            >
              Modifier mon numéro ou renvoyer le code
            </button>
          </form>
        )}

        {erreur && (
          <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "#e5484d", lineHeight: 1.5 }}>
            {erreur}
            {dejaInscrit && (
              <>
                {" "}
                <Link
                  href={`/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
                  style={{ color: GOLD, fontWeight: 700 }}
                >
                  Se connecter
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
