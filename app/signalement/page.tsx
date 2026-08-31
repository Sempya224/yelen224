"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Inter } from "next/font/google";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

// Auto-hébergée (Lot 1.5, 13/08/2026) — voir app/ambassades/page.tsx pour
// le raisonnement complet.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-inter" });
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { YelenLoader } from "@/components/YelenLoader";
import { CompteHeader } from "@/components/CompteEcranVide";
import { SIGNALEMENT_STATUTS, SIGNALEMENT_STATUT_LABELS, SIGNALEMENT_MOTIFS_CITOYEN } from "@/lib/signalementsConstants";

// ─── Types ────────────────────────────────────────────────────────────────────

type Signalement = {
  id: string;
  motif: string;
  description: string | null;
  preuve_url: string | null;
  statut: string;
  created_at: string;
  institution_id: string;
  institution_name?: string;
  institution_logo?: string | null;
};
type RdvOption = { id: string; objet: string | null; date_rdv: string; heure_rdv: string };

// ─── Constantes ───────────────────────────────────────────────────────────────

// Source unique désormais lib/signalementsConstants.ts (chantier RDV
// obligatoire + nettoyage emoji, 15/08/2026) — le nom local MOTIFS_CITOYEN
// est conservé pour ne pas toucher aux usages existants dans ce fichier.
const MOTIFS_CITOYEN = SIGNALEMENT_MOTIFS_CITOYEN;

// Clés/libellés sourcés de lib/signalementsConstants.ts (source unique du
// lifecycle, Lot 1 case management 08/08/2026) — avant cette correction,
// cet objet n'avait que 3 clés à la main (en_cours/traite/rejete) qui ne
// reconnaissaient jamais les vraies valeurs écrites par l'admin
// (resolu/ignore), affichant "En cours d'examen" indéfiniment après
// traitement. Plus d'icône emoji (nettoyage 15/08/2026) — la couleur +
// bordure de la pastille suffisent à distinguer les états, même logique que
// SIG_STATUT_CFG côté institution (SignalementsTab.tsx).
const STATUT_CFG: Record<string, { label: string; color: string; bg: string; border: string }> =
  Object.fromEntries(SIGNALEMENT_STATUTS.map(s => {
    const traite = s === "resolu" || s === "cloture";
    const ecarte = s === "rejete" || s === "doublon";
    const color = traite ? "#22c55e" : ecarte ? "#ef4444" : "#F5A623";
    return [s, {
      label: SIGNALEMENT_STATUT_LABELS[s],
      color,
      bg: traite ? "rgba(34,197,94,0.08)" : ecarte ? "rgba(239,68,68,0.08)" : "rgba(245,166,35,0.08)",
      border: traite ? "rgba(34,197,94,0.25)" : ecarte ? "rgba(239,68,68,0.25)" : "rgba(245,166,35,0.25)",
    }];
  }));

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// ─── Inner Component ──────────────────────────────────────────────────────────

function SignalementInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const institutionIdParam = searchParams.get("institution_id");
  const rdvIdParam = searchParams.get("rdv_id");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { theme } = useTheme();
  const C = T[theme];

  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"nouveau" | "historique">("nouveau");
  const [motif, setMotif] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [institutionId, setInstitutionId] = useState(institutionIdParam || "");
  const [institutions, setInstitutions] = useState<{ id: string; name: string; logo: string | null }[]>([]);
  const [rdvId, setRdvId] = useState("");
  const [rdvsEligibles, setRdvsEligibles] = useState<RdvOption[]>([]);
  const [loadingRdvs, setLoadingRdvs] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [detailSig, setDetailSig] = useState<Signalement | null>(null);
  const [historique, setHistorique] = useState<Signalement[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let uid: string | null = null;
    try { uid = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!uid) { router.push("/login"); return; }
    setUserId(uid);
    fetchInstitutions();
    fetchHistorique();
  }, []);

  const fetchInstitutions = async () => {
    const { data } = await supabase
      .from("institutions")
      .select("id, name, logo")
      .eq("statut", "validee")
      .order("name");
    setInstitutions(data || []);
  };

  // RDV éligibles pour l'institution choisie — un signalement doit
  // documenter un fait précis, donc seuls les RDV déjà passés ou en cours
  // (date/heure atteinte) sont proposés, même règle que côté institution
  // (SignalementsTab.tsx / rdv-eligibles/route.ts). RLS `auth.uid() =
  // citoyen_id` déjà en place sur `rdv`, requête directe légitime ici.
  useEffect(() => {
    setRdvId(""); setRdvsEligibles([]);
    if (!institutionId || !userId) return;
    setLoadingRdvs(true);
    (async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const nowTime = now.toTimeString().slice(0, 5);
      const { data } = await supabase
        .from("rdv")
        .select("id, objet, date_rdv, heure_rdv")
        .eq("citoyen_id", userId)
        .eq("institution_id", institutionId)
        .lte("date_rdv", todayStr)
        .order("date_rdv", { ascending: false })
        .order("heure_rdv", { ascending: false })
        .limit(30);
      const eligibles = (data || []).filter(r => r.date_rdv < todayStr || r.heure_rdv <= nowTime);
      setRdvsEligibles(eligibles);
      if (rdvIdParam && eligibles.some(r => r.id === rdvIdParam)) setRdvId(rdvIdParam);
      setLoadingRdvs(false);
    })();
  }, [institutionId, userId, rdvIdParam]);

  const fetchHistorique = async () => {
    setLoadingHist(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoadingHist(false); return; }
    const res = await fetch(`/api/citoyen/signalements?accessToken=${encodeURIComponent(session.access_token)}`);
    const json = await res.json().catch(() => null);
    if (res.ok && json?.signalements) setHistorique(json.signalements);
    setLoadingHist(false);
  };

  const handleSubmit = async () => {
    setError("");
    if (!institutionId) { setError("Sélectionnez une institution."); return; }
    if (!rdvId) { setError("Sélectionnez le rendez-vous concerné."); return; }
    if (!motif) { setError("Choisissez un motif de signalement."); return; }
    if (!description.trim() || description.length < 20) { setError("Décrivez le problème en au moins 20 caractères."); return; }
    if (!userId) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Session expirée, reconnectez-vous."); setLoading(false); return; }

      const form = new FormData();
      form.set("accessToken", session.access_token);
      form.set("institution_id", institutionId);
      form.set("rdv_id", rdvId);
      form.set("motif", motif);
      form.set("description", description.trim());
      if (imageFile) form.set("file", imageFile);

      const res = await fetch("/api/citoyen/signalements", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setError(json?.error || "Erreur lors de l'envoi. Réessayez."); setLoading(false); return; }

      setSuccess(true);
      showToast("Signalement envoyé avec succès.");
      fetchHistorique();
      setRdvId(""); setMotif(""); setDescription(""); setImageFile(null); setImagePreview(null);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles dynamiques ────────────────────────────────────────────────────

  const inputStyle = {
    width: "100%",
    backgroundColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "#f9f9fb",
    border: `1px solid ${C.borderCard}`,
    borderRadius: "10px",
    padding: "12px 14px",
    color: C.text,
    fontSize: "14px",
    fontFamily: "inherit",
  };

  const labelStyle = {
    display: "block",
    fontSize: "11px",
    color: C.textSubtle,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: "8px",
    fontWeight: "600" as const,
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        textarea:focus, select:focus, input:focus { outline: none; border-color: #F5A623 !important; box-shadow: 0 0 0 3px rgba(245,166,35,0.12) !important; }
        .motif-card { cursor: pointer; transition: all 0.18s ease; }
        .motif-card:hover { transform: translateY(-1px); }
        .tab-btn { transition: all 0.15s ease; }
      `}</style>

      <div className={inter.variable} style={{ minHeight: "100vh", backgroundColor: C.pageBg, color: C.text, fontFamily: "var(--font-inter), -apple-system, sans-serif", paddingBottom: "60px", transition: "background-color 0.3s ease, color 0.3s ease" }}>

        {/* ── HEADER — standard des ~29 écrans /compte/*, plus de header
            maison (retour Bryan, 15/08/2026) ── */}
        <CompteHeader titre="Centre de signalement"/>

        <div style={{ maxWidth: "680px", margin: "0 auto", padding: "28px 20px 0" }}>

          {/* ── HERO ── */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#ef4444" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
              </div>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: "900", color: C.text, margin: 0, letterSpacing: "-0.5px" }}>Signalement</h1>
                <p style={{ fontSize: "13px", color: C.textSubtle, margin: 0 }}>Signalez un problème avec une institution</p>
              </div>
            </div>
            {!bannerDismissed && (
              <div style={{ position: "relative", backgroundColor: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.18)", borderLeft: "3px solid #F5A623", borderRadius: "10px", padding: "12px 40px 12px 16px", fontSize: "12px", color: C.textMuted, lineHeight: "1.7" }}>
                Un signalement est examiné par l&apos;équipe Yelen et peut entraîner une décision sur le compte de l&apos;institution concernée : avertissement, restriction d&apos;accès, correction de données, ou aucune action si le signalement n&apos;est pas fondé. Documentez uniquement un fait réel et précis, survenu lors du rendez-vous que vous sélectionnez ci-dessous — un signalement infondé ou abusif expose son auteur aux mêmes conséquences sur son propre compte.
                <button onClick={() => setBannerDismissed(true)} aria-label="Fermer" style={{ position: "absolute", top: "10px", right: "10px", background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: "4px", display: "flex" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}
          </div>

          {/* ── TABS ── */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
            {(["nouveau", "historique"] as const).map(t => (
              <button
                key={t}
                className="tab-btn"
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: "10px",
                  border: `1px solid ${tab === t ? "rgba(239,68,68,0.3)" : C.borderCard}`,
                  backgroundColor: tab === t ? "rgba(239,68,68,0.08)" : C.cardBg,
                  color: tab === t ? "#ef4444" : C.textSubtle,
                  fontSize: "13px", fontWeight: tab === t ? "700" : "500", cursor: "pointer",
                }}
              >
                {t === "nouveau" ? "Nouveau signalement" : `Mes signalements (${historique.length})`}
              </button>
            ))}
          </div>

          {/* ══ NOUVEAU SIGNALEMENT ══ */}
          {tab === "nouveau" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeUp 0.2s ease" }}>

              {/* Succès */}
              {success && (
                <div style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "12px", padding: "16px 20px", display: "flex", gap: "12px", alignItems: "center" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <p style={{ color: "#22c55e", fontWeight: "700", fontSize: "14px", margin: "0 0 2px" }}>Signalement envoyé !</p>
                    <p style={{ color: "rgba(34,197,94,0.7)", fontSize: "12px", margin: 0 }}>Notre équipe va examiner votre signalement sous 48h ouvrées.</p>
                  </div>
                </div>
              )}

              {/* Sélection institution */}
              <div>
                <label style={labelStyle}>Institution concernée *</label>
                <select
                  value={institutionId}
                  onChange={e => setInstitutionId(e.target.value)}
                  style={{ ...inputStyle, color: institutionId ? C.text : C.textSubtle }}
                >
                  <option value="">Sélectionner une institution...</option>
                  {institutions.map(inst => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
              </div>

              {/* Rendez-vous concerné */}
              {institutionId && (
                <div>
                  <label style={labelStyle}>Rendez-vous concerné *</label>
                  {loadingRdvs ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: C.textSubtle, fontSize: "12.5px", padding: "10px 0" }}>
                      <YelenLoader size={14}/> Chargement de vos rendez-vous…
                    </div>
                  ) : rdvsEligibles.length === 0 ? (
                    <p style={{ color: C.textSubtle, fontSize: "11.5px", lineHeight: "1.6", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "12px 14px" }}>
                      Vous n&apos;avez aucun rendez-vous déjà passé avec cette institution. Un signalement doit documenter un fait précis survenu lors d&apos;un rendez-vous — impossible d&apos;en envoyer un sans rendez-vous concerné.
                    </p>
                  ) : (
                    <select
                      value={rdvId}
                      onChange={e => setRdvId(e.target.value)}
                      style={{ ...inputStyle, color: rdvId ? C.text : C.textSubtle }}
                    >
                      <option value="">Sélectionner le rendez-vous...</option>
                      {rdvsEligibles.map(r => (
                        <option key={r.id} value={r.id}>{formatDate(r.date_rdv)} à {r.heure_rdv?.slice(0, 5)} — {r.objet || "RDV général"}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Motif */}
              <div>
                <label style={labelStyle}>Motif du signalement *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {MOTIFS_CITOYEN.map(m => (
                    <div
                      key={m.value}
                      className="motif-card"
                      onClick={() => setMotif(m.value)}
                      style={{
                        backgroundColor: motif === m.value ? "rgba(239,68,68,0.06)" : C.cardBg,
                        border: `1px solid ${motif === m.value ? "rgba(239,68,68,0.3)" : C.borderCard}`,
                        borderRadius: "12px", padding: "12px 16px",
                        display: "flex", alignItems: "center", gap: "12px",
                      }}
                    >
                      <div style={{
                        width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${motif === m.value ? "#ef4444" : C.borderCard}`,
                        backgroundColor: motif === m.value ? "#ef4444" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {motif === m.value && <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#fff" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "13px", fontWeight: "600", color: motif === m.value ? "#ef4444" : C.text, margin: "0 0 2px" }}>{m.label}</p>
                        <p style={{ fontSize: "11px", color: C.textSubtle, margin: 0 }}>{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>
                  Description détaillée * <span style={{ color: C.textFaint, textTransform: "none", letterSpacing: 0, fontWeight: "500" }}>(min. 20 caractères)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Décrivez précisément ce qui s'est passé, avec les dates et faits..."
                  style={{ ...inputStyle, resize: "none", lineHeight: "1.6" }}
                />
                <p style={{ fontSize: "11px", color: description.length >= 20 ? "#22c55e" : C.textFaint, marginTop: "4px", textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                  {description.length} caractères {description.length >= 20
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : `(${20 - description.length} manquants)`}
                </p>
              </div>

              {/* Preuve photo */}
              <div>
                <label style={labelStyle}>Preuve photo (optionnel)</label>
                {imagePreview ? (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    {/* IMG-EXCEPTION: reason=aperçu blob local (URL.createObjectURL) avant envoi, non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} style={{ height: "80px", borderRadius: "8px", objectFit: "cover", border: `1px solid ${C.borderCard}` }} alt="" />
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      style={{ position: "absolute", top: "-8px", right: "-8px", backgroundColor: "#ef4444", border: "none", color: "#fff", width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    ><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ width: "100%", backgroundColor: C.cardBg, border: `1px dashed ${C.borderCard}`, borderRadius: "10px", padding: "20px", color: C.textSubtle, fontSize: "13px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    <span>Ajouter une capture d&apos;écran ou photo</span>
                    <span style={{ fontSize: "11px", color: C.textFaint }}>JPG, PNG — max 5MB</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImageFile(file);
                    setImagePreview(URL.createObjectURL(file));
                  }}
                  style={{ display: "none" }}
                />
              </div>

              {/* Erreur */}
              {error && (
                <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "12px 16px", color: "#ef4444", fontSize: "13px" }}>
                  {error}
                </div>
              )}

              {/* Bouton envoi */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{ width: "100%", backgroundColor: loading ? "rgba(239,68,68,0.2)" : "#ef4444", border: "none", borderRadius: "12px", padding: "14px", color: "#fff", fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {loading
                  ? <><YelenLoader size={18} color="#fff"/> Envoi en cours…</>
                  : "Envoyer le signalement"
                }
              </button>

              {/* Info légale */}
              <p style={{ fontSize: "11px", color: C.textFaint, textAlign: "center", lineHeight: "1.6" }}>
                En soumettant ce signalement, vous acceptez nos <a href="/cgu" style={{ color: "#F5A623", textDecoration: "none" }}>CGU</a> et confirmez l&apos;exactitude des informations fournies.
              </p>
            </div>
          )}

          {/* ══ HISTORIQUE ══ */}
          {tab === "historique" && (
            <div style={{ animation: "fadeUp 0.2s ease" }}>
              {loadingHist ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                  <div style={{ width: "32px", height: "32px", border: `3px solid ${C.borderSubtle}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : historique.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: C.textSubtle }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
                  </div>
                  <p style={{ fontSize: "15px", color: C.textSubtle, marginBottom: "6px" }}>Aucun signalement envoyé</p>
                  <p style={{ fontSize: "13px", color: C.textFaint }}>Vos signalements apparaîtront ici</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {historique.map(s => {
                    const cfg = STATUT_CFG[s.statut] || STATUT_CFG.en_cours;
                    const motifLabel = MOTIFS_CITOYEN.find(m => m.value === s.motif)?.label || s.motif;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setDetailSig(s)}
                        style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px 18px", animation: "fadeUp 0.2s ease", fontFamily: "inherit" }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: "14px", fontWeight: "700", color: C.text, margin: "0 0 3px" }}>{s.institution_name}</p>
                            <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>{motifLabel}</p>
                          </div>
                          <span style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px", flexShrink: 0 }}>
                            {cfg.label}
                          </span>
                        </div>
                        {s.description && (
                          <p style={{ fontSize: "12px", color: C.textMuted, lineHeight: "1.6", marginBottom: "8px", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "8px 10px", border: `1px solid ${C.borderSubtle}` }}>
                            {s.description}
                          </p>
                        )}
                        {s.preuve_url && (
                          <Image
                            src={s.preuve_url}
                            width={240}
                            height={80}
                            onClick={e => { e.stopPropagation(); window.open(s.preuve_url!, "_blank"); }}
                            style={{ height: "60px", width: "auto", borderRadius: "8px", objectFit: "cover", cursor: "pointer", border: `1px solid ${C.borderCard}`, marginBottom: "8px" }}
                            alt="preuve"
                          />
                        )}
                        <p style={{ fontSize: "11px", color: C.textFaint, margin: 0, display: "flex", alignItems: "center", gap: "5px" }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          {formatDate(s.created_at)} · #{s.id.slice(0, 8).toUpperCase()}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── DÉTAIL D'UN SIGNALEMENT — même convention que
          app/compte/activites/activites-client.tsx (useState<T|null> +
          overlay backdrop, stopPropagation sur le panneau) ── */}
      {detailSig && (() => {
        const cfg = STATUT_CFG[detailSig.statut] || STATUT_CFG.en_cours;
        const motifLabel = MOTIFS_CITOYEN.find(m => m.value === detailSig.motif)?.label || detailSig.motif;
        return (
          <div onClick={() => setDetailSig(null)} style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.cardBg, borderRadius: "24px", padding: "24px", maxWidth: "400px", width: "100%", border: `1px solid ${C.borderCard}`, maxHeight: "85svh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: "800", color: C.text, margin: "0 0 4px" }}>{detailSig.institution_name}</p>
                  <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>{motifLabel}</p>
                </div>
                <button onClick={() => setDetailSig(null)} style={{ background: "none", border: "none", color: C.textSubtle, cursor: "pointer", padding: "4px", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <span style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px", display: "inline-block", marginBottom: "16px" }}>
                {cfg.label}
              </span>
              {detailSig.description && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={{ fontSize: "11px", color: C.textFaint, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Description</p>
                  <p style={{ fontSize: "13px", color: C.textMuted, lineHeight: "1.6", margin: 0, backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "10px 12px", border: `1px solid ${C.borderSubtle}` }}>{detailSig.description}</p>
                </div>
              )}
              {detailSig.preuve_url && (
                <Image src={detailSig.preuve_url} width={360} height={160} onClick={() => window.open(detailSig.preuve_url!, "_blank")} style={{ width: "100%", height: "auto", borderRadius: "10px", objectFit: "cover", cursor: "pointer", border: `1px solid ${C.borderCard}`, marginBottom: "16px" }} alt="preuve"/>
              )}
              <p style={{ fontSize: "11px", color: C.textFaint, margin: 0, display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {formatDate(detailSig.created_at)} · #{detailSig.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: "500",
          zIndex: 999, animation: "slideUp 0.25s ease",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (theme === "dark" ? "#0F2A1A" : "#f0faf5") : (theme === "dark" ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          {toast.type === "success"
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>}
          {toast.msg}
        </div>
      )}
    </>
  );
}

// ─── Page export avec Suspense (requis pour useSearchParams) ──────────────────

export default function SignalementPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#080812" }}>
        <YelenLoader size={32}/>
      </div>
    }>
      <SignalementInner />
    </Suspense>
  );
}