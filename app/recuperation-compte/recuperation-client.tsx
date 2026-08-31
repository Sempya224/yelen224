"use client";

// Récupération de compte citoyen (téléphone perdu/changé/2FA inaccessible)
// — retour Bryan 25/07/2026, volet 2 de la faille de sécurité prioritaire.
// Modèle semi-automatique : vérification CIN par un admin, puis délai de
// sécurité de 48h avant activation (voir app/api/citoyen/recuperation et
// app/admin/recuperation-comptes pour le reste du flux).
// Plein écran façon "Avis" de la fiche institution (retour Bryan
// 25/07/2026 : même gabarit — header sticky avec X carré à gauche, pas de
// simple lien "< Retour" flottant) pour rester cohérent avec le seul autre
// plein écran du produit.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YelenLoader } from "@/components/YelenLoader";

const DELAI_SECURITE_HEURES = 48;

function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  return digits.match(/.{1,3}/g)?.join(" ") ?? "";
}

export function RecuperationCompteClient() {
  const t = useTranslations("authentication.recovery");
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  const [type, setType] = useState<"numero" | "totp">("numero");
  const [ancienPhone, setAncienPhone] = useState("");
  const [nouveauPhone, setNouveauPhone] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [envoye, setEnvoye] = useState(false);

  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBrd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  async function handleSubmit() {
    if (loading) return;
    setError("");
    if (honeypot) { await new Promise(r => setTimeout(r, 2000)); return; }

    const ac = ancienPhone.replace(/\s/g, "");
    const nc = nouveauPhone.replace(/\s/g, "");
    if (ac.length !== 9) { setError(t("errors.oldPhoneInvalid")); return; }
    if (type === "numero") {
      if (nc.length !== 9) { setError(t("errors.newPhoneInvalid")); return; }
      if (ac === nc) { setError(t("errors.samePhone")); return; }
    }
    if (!prenom.trim() || !nom.trim()) { setError(t("errors.nameRequired")); return; }
    if (!file) { setError(t("errors.documentRequired")); return; }

    setLoading(true);
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("ancien_phone", "+224" + ac);
      form.set("nouveau_phone", type === "numero" ? "+224" + nc : "+224" + ac);
      form.set("prenom", prenom.trim());
      form.set("nom", nom.trim());
      form.set("file", file);

      const res = await fetch("/api/citoyen/recuperation", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.error || t("errors.sendFailed")); return; }
      // Trace locale (pas de session possible ici par définition) pour
      // avertir l'utilisateur sur connexion/inscription et éviter qu'il
      // soumette une 2e demande en double (retour Bryan 09/08/2026).
      try {
        localStorage.setItem("yelen224_recuperation_pending", JSON.stringify({
          phone: type === "numero" ? "+224" + nc : "+224" + ac,
          submittedAt: Date.now(),
        }));
      } catch {}
      setEnvoye(true);
    } catch { setError(t("errors.network")); }
    finally { setLoading(false); }
  }

  const header = (titre: string) => (
    <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
      <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
        <button onClick={() => router.back()} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBrd}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>{titre}</div>
        <div/>
      </div>
    </header>
  );

  if (envoye) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
        {header(t("headerTitleCompact"))}
        <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: "420px", margin: "0 auto" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 style={{ color: C.text, fontSize: "18px", fontWeight: "900", margin: "0 0 10px" }}>{t("success.title")}</h1>
          <p style={{ color: C.textSubtle, fontSize: "13px", lineHeight: 1.7, margin: "0 0 20px" }}>
            {type === "totp" ? t("success.bodyTotp", { hours: DELAI_SECURITE_HEURES }) : t("success.bodyNumero", { hours: DELAI_SECURITE_HEURES })}
          </p>
          <Link href="/login" style={{ display: "inline-block", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "13px", padding: "12px 22px", borderRadius: "12px", textDecoration: "none" }}>{t("success.backToLogin")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto" }}>
      {header(t("headerTitle"))}

      <div style={{ padding: "20px 16px 40px", maxWidth: "460px", margin: "0 auto" }}>
        <h1 style={{ color: C.text, fontSize: "19px", fontWeight: "900", margin: "0 0 6px" }}>{t("title")}</h1>
        <p style={{ color: C.textSubtle, fontSize: "13px", lineHeight: 1.6, margin: "0 0 20px" }}>
          {t("subtitle")}
        </p>

        {/* Sélecteur de motif — deux chemins distincts (retour Bryan
            25/07/2026) : changement de numéro, ou perte de l'accès au 2FA
            (téléphone perdu ET codes de secours épuisés/perdus). */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button onClick={() => setType("numero")} className="tap" style={{ flex: 1, padding: "12px", borderRadius: "12px", border: type === "numero" ? "2px solid #F5A623" : `1.5px solid ${inputBrd}`, background: type === "numero" ? "rgba(245,166,35,0.1)" : C.cardBg, color: type === "numero" ? "#F5A623" : C.text, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>
            {t("reasons.numberLost")}
          </button>
          <button onClick={() => setType("totp")} className="tap" style={{ flex: 1, padding: "12px", borderRadius: "12px", border: type === "totp" ? "2px solid #F5A623" : `1.5px solid ${inputBrd}`, background: type === "totp" ? "rgba(245,166,35,0.1)" : C.cardBg, color: type === "totp" ? "#F5A623" : C.text, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>
            {t("reasons.totpUnavailable")}
          </button>
        </div>

        <input type="text" value={honeypot} onChange={e => setHoneypot(e.target.value)} name="site_web" autoComplete="off" tabIndex={-1} style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }} aria-hidden="true"/>

        <div style={{ background: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "18px", padding: "18px", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          <div>
            <label style={{ display: "block", color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{type === "totp" ? t("fields.oldPhoneTotp") : t("fields.oldPhoneNumero")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "12px", padding: "0 14px" }}>
              <span style={{ color: C.textSubtle, fontSize: "14px", fontWeight: "700" }}>+224</span>
              <input value={ancienPhone} onChange={e => setAncienPhone(formatPhoneInput(e.target.value))} placeholder="000 000 000" inputMode="numeric" style={{ flex: 1, background: "none", border: "none", padding: "13px 0", fontSize: "14px", color: C.text, outline: "none" }}/>
            </div>
          </div>
          {type === "numero" && (
            <div>
              <label style={{ display: "block", color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{t("fields.newPhone")}</label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "12px", padding: "0 14px" }}>
                <span style={{ color: C.textSubtle, fontSize: "14px", fontWeight: "700" }}>+224</span>
                <input value={nouveauPhone} onChange={e => setNouveauPhone(formatPhoneInput(e.target.value))} placeholder="000 000 000" inputMode="numeric" style={{ flex: 1, background: "none", border: "none", padding: "13px 0", fontSize: "14px", color: C.text, outline: "none" }}/>
              </div>
            </div>
          )}
          {type === "totp" && (
            <div style={{ display: "flex", gap: "8px", padding: "10px 12px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "10px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <p style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.6, margin: 0 }}>{t("totpNotice")}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{t("fields.firstName")}</label>
              <input value={prenom} onChange={e => setPrenom(e.target.value)} style={{ width: "100%", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.text, outline: "none" }}/>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{t("fields.lastName")}</label>
              <input value={nom} onChange={e => setNom(e.target.value)} style={{ width: "100%", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.text, outline: "none" }}/>
            </div>
          </div>
          <div>
            <label style={{ display: "block", color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{t("fields.idDocument")}</label>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", background: inputBg, border: `1.5px dashed ${inputBrd}`, borderRadius: "12px", padding: "14px", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span style={{ color: file ? C.text : C.textSubtle, fontSize: "12.5px", fontWeight: "600" }}>{file ? file.name : t("fields.idDocumentPlaceholder")}</span>
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }}/>
            </label>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: "14px", padding: "12px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "12px", color: "#ef4444", fontSize: "13px" }}>{error}</div>
        )}

        <button onClick={handleSubmit} disabled={loading} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: loading ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)") : "#F5A623", color: loading ? C.textSubtle : "#080812", fontSize: "15px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          {loading ? <><YelenLoader size={16} color={C.textSubtle}/>{t("submitting")}</> : t("submit")}
        </button>
        <p style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.6, textAlign: "center", margin: "12px 0 0" }}>
          {t("disclaimer")}
        </p>
      </div>
    </div>
  );
}
