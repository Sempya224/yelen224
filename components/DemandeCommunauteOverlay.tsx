"use client";

// Formulaire plein écran de demande d'adhésion à Yelen Community
// (23/08/2026, retour Bryan : "même flux que demande de partenariat").
// Mirroring structurel de DemandePartenariatOverlay.tsx (même convention
// plein écran header X + titre, mêmes tokens dupliqués en dur — ce
// composant vit dans components/ pour être réutilisé tel quel par
// CommunauteProTab.tsx, hors du dossier de route dynamique).
//
// Contact auto-rempli (23/08/2026, retour Bryan : "seule la description
// text qu'il doit saisir, les autres info on les remplit avec les info
// entreprise profile") — email/téléphone viennent de institutions.email/
// phone (Profil Entreprise), le nom du contact vient du membre connecté
// (institution_membres.prenom/nom, JWT) : aucun champ de contact saisi
// manuellement, résolu côté serveur dans
// app/api/institution/communaute-demande (jamais fourni tel quel par le
// client). Seule l'intention de publication reste à saisir.
import { useEffect, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader } from "@/components/YelenLoader";

const D = {
  dark:  { bg: "#0A0A0F", bgCard: "#111118", bgCard2: "#16161F", border: "rgba(255,255,255,0.07)", t1: "#FFFFFF", t2: "#9999B3", t3: "#55556A", gold: "#F5A623", goldD: "#B87D1A", red: "#FF4757" },
  light: { bg: "#F5F5F8", bgCard: "#FFFFFF", bgCard2: "#F0F0F5", border: "rgba(10,10,18,0.08)", t1: "#0A0A12", t2: "#47475C", t3: "#767686", gold: "#F5A623", goldD: "#B87D1A", red: "#D62839" },
} as const;

const ICON_USER = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></svg>;
const ICON_MAIL = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>;
const ICON_PHONE = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;

export function DemandeCommunauteOverlay({ instId, onClose, onSubmitted }: {
  instId: string; onClose: () => void; onSubmitted: () => void;
}) {
  const { theme } = useTheme();
  const C = D[theme];
  const [profil, setProfil] = useState<{ name: string; logo: string | null; email: string; phone: string; contact: string } | null>(null);
  const [loadingProfil, setLoadingProfil] = useState(true);
  const [intention, setIntention] = useState("");
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/institution/profile?institution_id=${instId}`)
      .then(r => r.json())
      .then(j => setProfil(j?.institution ? {
        name: j.institution.name,
        logo: j.institution.logo || null,
        email: j.institution.email || "",
        phone: j.institution.phone || "",
        contact: [j.institution.institution_membres?.prenom, j.institution.institution_membres?.nom].filter(Boolean).join(" "),
      } : null))
      .finally(() => setLoadingProfil(false));
  }, [instId]);

  async function submit() {
    setError(null);
    if (!intention.trim()) {
      setError("Merci de décrire ce que vous comptez partager avec la communauté.");
      return;
    }
    if (!conditionsAcceptees) {
      setError("Vous devez accepter les règles de publication de Yelen Community pour soumettre votre demande.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/institution/communaute-demande", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intention, conditions_acceptees: true }),
    });
    const j = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) { setError(j?.error || "Une erreur est survenue."); return; }
    onSubmitted();
  }

  const inputStyle = {
    width: "100%", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "10px",
    padding: "11px 13px", color: C.t1, fontSize: "13.5px", marginBottom: "14px",
  };
  const labelStyle = { color: C.t2, fontSize: "11.5px", fontWeight: 700, marginBottom: "6px", display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.bgCard2, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <h1 style={{ color: C.t1, fontSize: "16px", fontWeight: 900, margin: 0 }}>Rejoindre Yelen Community</h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px", maxWidth: "620px", width: "100%", margin: "0 auto" }}>
        {loadingProfil ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={24} label="Chargement du profil…" labelColor={C.t2} /></div>
        ) : (
          <>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", paddingBottom: "14px", borderBottom: `1px solid ${C.border}` }}>
                {profil?.logo ? (
                  <div style={{ position: "relative", width: "42px", height: "42px", borderRadius: "12px", overflow: "hidden", flexShrink: 0, background: C.bgCard2 }}>
                    <Image src={profil.logo} alt={profil.name} fill sizes="42px" style={{ objectFit: "cover" }} />
                  </div>
                ) : (
                  <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: `${C.gold}18`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "16px", flexShrink: 0 }}>
                    {(profil?.name || "Y").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "14.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profil?.name || "—"}</div>
                  <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>Contact rempli depuis votre Profil Entreprise</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {profil?.contact && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "9px", background: C.bgCard2, color: C.t2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ICON_USER}</div>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600 }}>{profil.contact}</span>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "9px", background: C.bgCard2, color: C.t2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ICON_MAIL}</div>
                  <span style={{ color: profil?.email ? C.t1 : C.t3, fontSize: "12.5px", fontWeight: 600, fontStyle: profil?.email ? "normal" : "italic" }}>{profil?.email || "Email non renseigné"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "9px", background: C.bgCard2, color: C.t2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ICON_PHONE}</div>
                  <span style={{ color: profil?.phone ? C.t1 : C.t3, fontSize: "12.5px", fontWeight: 600, fontStyle: profil?.phone ? "normal" : "italic" }}>{profil?.phone || "Téléphone non renseigné"}</span>
                </div>
              </div>
            </div>

            <label style={labelStyle}>Qu&apos;est-ce que votre établissement compte partager avec la communauté ? *</label>
            <textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" as const }} placeholder="Ex. actualités de l'établissement, conseils métier, opportunités professionnelles…" value={intention} onChange={e => setIntention(e.target.value)} />

            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: "6px 0 18px", cursor: "pointer" }}>
              <input type="checkbox" checked={conditionsAcceptees} onChange={e => setConditionsAcceptees(e.target.checked)} style={{ marginTop: "2px" }} />
              J&apos;accepte que chaque publication de mon établissement soit validée par l&apos;équipe Yelen avant diffusion, et je confirme que les informations ci-dessus sont exactes.
            </label>

            {error && <div style={{ color: C.red, fontSize: "12.5px", marginBottom: "14px" }}>{error}</div>}

            <button
              onClick={submit}
              disabled={submitting}
              style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: C.gold, color: "#080812", fontWeight: 900, fontSize: "14px", cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.75 : 1, marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
            >
              {submitting ? <YelenLoader size={18} color="#080812" /> : "Soumettre ma demande"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
