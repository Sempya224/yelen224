"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";

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

// ─── Constantes ───────────────────────────────────────────────────────────────

const MOTIFS_CITOYEN = [
  { value: "comportement_irrespectueux", label: "😡 Comportement irrespectueux", desc: "Agent ou personnel irrespectueux lors du RDV" },
  { value: "rdv_non_honore",             label: "📭 RDV non honoré",             desc: "L'institution n'a pas respecté le rendez-vous confirmé" },
  { value: "informations_fausses",       label: "⚠️ Informations fausses",       desc: "Les informations publiées ne correspondent pas à la réalité" },
  { value: "arnaque_fraude",             label: "🚨 Arnaque / Fraude",           desc: "Tentative d'escroquerie ou comportement frauduleux" },
  { value: "autre",                      label: "📝 Autre",                      desc: "Autre motif non listé ci-dessus" },
];

const STATUT_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  en_cours: { label: "En cours d'examen", color: "#F5A623", bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.25)", icon: "⏳" },
  traite:   { label: "Traité",            color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.25)",   icon: "✅" },
  rejete:   { label: "Rejeté",            color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   icon: "❌" },
};

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
    fetchHistorique(uid);
  }, []);

  const fetchInstitutions = async () => {
    const { data } = await supabase
      .from("institutions")
      .select("id, name, logo")
      .eq("statut", "validee")
      .order("name");
    setInstitutions(data || []);
  };

  const fetchHistorique = async (uid: string) => {
    setLoadingHist(true);
    const { data } = await supabase
      .from("signalements")
      .select("id, motif, description, preuve_url, statut, created_at, institution_id")
      .eq("citoyen_id", uid)
      .eq("type_signaleur", "citoyen")
      .order("created_at", { ascending: false });

    if (data) {
      const enriched = await Promise.all(data.map(async (s) => {
        const { data: inst } = await supabase
          .from("institutions").select("name, logo").eq("id", s.institution_id).single();
        return { ...s, institution_name: inst?.name || "Institution", institution_logo: inst?.logo || null };
      }));
      setHistorique(enriched);
    }
    setLoadingHist(false);
  };

  const handleSubmit = async () => {
    setError("");
    if (!institutionId) { setError("Sélectionnez une institution."); return; }
    if (!motif) { setError("Choisissez un motif de signalement."); return; }
    if (!description.trim() || description.length < 20) { setError("Décrivez le problème en au moins 20 caractères."); return; }
    if (!userId) return;

    setLoading(true);
    try {
      let preuveUrl: string | null = null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `signalements/${userId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("documents").upload(path, imageFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
          preuveUrl = urlData.publicUrl;
        }
      }

      const { error: insertError } = await supabase.from("signalements").insert({
        citoyen_id: userId,
        institution_id: institutionId,
        type_signaleur: "citoyen",
        type_cible: "institution",
        motif,
        description: description.trim(),
        preuve_url: preuveUrl,
        rdv_id: rdvIdParam || null,
        statut: "en_cours",
      });

      if (insertError) { setError("Erreur lors de l'envoi. Réessayez."); setLoading(false); return; }

      await supabase.from("notifications").insert({
        destinataire_id: institutionId,
        destinataire_type: "institution",
        rdv_id: rdvIdParam || null,
        type: "signalement",
        titre: "🚨 Nouveau signalement reçu",
        message: `Un citoyen a signalé votre institution pour : ${MOTIFS_CITOYEN.find(m => m.value === motif)?.label || motif}`,
      });

      setSuccess(true);
      showToast("Signalement envoyé avec succès.");
      fetchHistorique(userId);
      setMotif(""); setDescription(""); setImageFile(null); setImagePreview(null);
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        textarea:focus, select:focus, input:focus { outline: none; border-color: #F5A623 !important; box-shadow: 0 0 0 3px rgba(245,166,35,0.12) !important; }
        .motif-card { cursor: pointer; transition: all 0.18s ease; }
        .motif-card:hover { transform: translateY(-1px); }
        .tab-btn { transition: all 0.15s ease; }
      `}</style>

      <div style={{ minHeight: "100vh", backgroundColor: C.pageBg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: "60px", transition: "background-color 0.3s ease, color 0.3s ease" }}>

        {/* ── HEADER ── */}
        <header style={{
          backgroundColor: theme === "dark" ? "rgba(8,8,18,0.97)" : "rgba(248,248,251,0.97)",
          borderBottom: `1px solid ${C.borderCard}`,
          padding: "0 20px",
          position: "sticky", top: 0, zIndex: 100,
          backdropFilter: "blur(16px)",
        }}>
          <div style={{ maxWidth: "680px", margin: "0 auto", height: "60px", display: "flex", alignItems: "center", gap: "14px" }}>
            <button onClick={() => router.back()} style={{ background: "transparent", border: "none", color: C.textSubtle, fontSize: "20px", cursor: "pointer", padding: "4px" }}>←</button>
            <span style={{ fontSize: "17px", fontWeight: "800", color: "#F5A623", flex: 1 }}>YELEN224</span>
            <span style={{ fontSize: "12px", color: C.textFaint }}>Centre de signalement</span>
          </div>
        </header>

        <div style={{ maxWidth: "680px", margin: "0 auto", padding: "28px 20px 0" }}>

          {/* ── HERO ── */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", flexShrink: 0 }}>🚨</div>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: "900", color: C.text, margin: 0, letterSpacing: "-0.5px" }}>Signalement</h1>
                <p style={{ fontSize: "13px", color: C.textSubtle, margin: 0 }}>Signalez un problème avec une institution</p>
              </div>
            </div>
            <div style={{ backgroundColor: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.18)", borderLeft: "3px solid #F5A623", borderRadius: "10px", padding: "12px 16px", fontSize: "12px", color: C.textMuted, lineHeight: "1.7" }}>
              ⚠️ Les signalements abusifs ou frauduleux peuvent entraîner la suspension de votre compte. Yelen224 traite chaque signalement avec sérieux sous 48h ouvrées.
            </div>
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
                {t === "nouveau" ? "🚨 Nouveau signalement" : `📋 Mes signalements (${historique.length})`}
              </button>
            ))}
          </div>

          {/* ══ NOUVEAU SIGNALEMENT ══ */}
          {tab === "nouveau" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeUp 0.2s ease" }}>

              {/* Succès */}
              {success && (
                <div style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "12px", padding: "16px 20px", display: "flex", gap: "12px", alignItems: "center" }}>
                  <span style={{ fontSize: "24px" }}>✅</span>
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
                <p style={{ fontSize: "11px", color: description.length >= 20 ? "#22c55e" : C.textFaint, marginTop: "4px", textAlign: "right" }}>
                  {description.length} caractères {description.length >= 20 ? "✓" : `(${20 - description.length} manquants)`}
                </p>
              </div>

              {/* Preuve photo */}
              <div>
                <label style={labelStyle}>Preuve photo (optionnel)</label>
                {imagePreview ? (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img src={imagePreview} style={{ height: "80px", borderRadius: "8px", objectFit: "cover", border: `1px solid ${C.borderCard}` }} alt="" />
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      style={{ position: "absolute", top: "-8px", right: "-8px", backgroundColor: "#ef4444", border: "none", color: "#fff", width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ width: "100%", backgroundColor: C.cardBg, border: `1px dashed ${C.borderCard}`, borderRadius: "10px", padding: "20px", color: C.textSubtle, fontSize: "13px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
                  >
                    <span style={{ fontSize: "24px" }}>📎</span>
                    <span>Ajouter une capture d'écran ou photo</span>
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
                  ⚠️ {error}
                </div>
              )}

              {/* Bouton envoi */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{ width: "100%", backgroundColor: loading ? "rgba(239,68,68,0.2)" : "#ef4444", border: "none", borderRadius: "12px", padding: "14px", color: "#fff", fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {loading
                  ? <><div style={{ width: "18px", height: "18px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Envoi en cours...</>
                  : "🚨 Envoyer le signalement"
                }
              </button>

              {/* Info légale */}
              <p style={{ fontSize: "11px", color: C.textFaint, textAlign: "center", lineHeight: "1.6" }}>
                En soumettant ce signalement, vous acceptez nos <a href="/cgu" style={{ color: "#F5A623", textDecoration: "none" }}>CGU</a> et confirmez l'exactitude des informations fournies.
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
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>📋</div>
                  <p style={{ fontSize: "15px", color: C.textSubtle, marginBottom: "6px" }}>Aucun signalement envoyé</p>
                  <p style={{ fontSize: "13px", color: C.textFaint }}>Vos signalements apparaîtront ici</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {historique.map(s => {
                    const cfg = STATUT_CFG[s.statut] || STATUT_CFG.en_cours;
                    const motifLabel = MOTIFS_CITOYEN.find(m => m.value === s.motif)?.label || s.motif;
                    return (
                      <div
                        key={s.id}
                        style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px 18px", animation: "fadeUp 0.2s ease" }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: "14px", fontWeight: "700", color: C.text, margin: "0 0 3px" }}>{s.institution_name}</p>
                            <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>{motifLabel}</p>
                          </div>
                          <span style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px", flexShrink: 0, display: "flex", alignItems: "center", gap: "4px" }}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </div>
                        {s.description && (
                          <p style={{ fontSize: "12px", color: C.textMuted, lineHeight: "1.6", marginBottom: "8px", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "8px 10px", border: `1px solid ${C.borderSubtle}` }}>
                            {s.description}
                          </p>
                        )}
                        {s.preuve_url && (
                          <img
                            src={s.preuve_url}
                            onClick={() => window.open(s.preuve_url!, "_blank")}
                            style={{ height: "60px", borderRadius: "8px", objectFit: "cover", cursor: "pointer", border: `1px solid ${C.borderCard}`, marginBottom: "8px" }}
                            alt="preuve"
                          />
                        )}
                        <p style={{ fontSize: "11px", color: C.textFaint, margin: 0 }}>
                          📅 {formatDate(s.created_at)} · #{s.id.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
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
        <div style={{ width: "32px", height: "32px", border: "3px solid rgba(245,166,35,0.2)", borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <SignalementInner />
    </Suspense>
  );
}