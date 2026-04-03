"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type Annonce = {
  id: string;
  titre: string;
  contenu: string;
  type: string;
  statut: string;
  date_expiration: string | null;
  date_publication: string | null;
  nb_vues: number;
  nb_clics: number;
  image_url: string | null;
  created_at: string;
  epingle: boolean;
  regions_cibles: string[] | null;
};

type Institution = {
  name: string;
  category: string;
  logo: string | null;
  plan: string | null;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const TYPES = [
  { id: "information",  label: "Information",         color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: "ℹ️",  desc: "Horaires, fermetures, changements" },
  { id: "offre",        label: "Offre / Promotion",   color: "#22c55e", bg: "rgba(34,197,94,0.12)",   icon: "🎯",  desc: "Tarifs spéciaux, nouveaux services" },
  { id: "urgent",       label: "Urgent",              color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: "🚨",  desc: "Alerte, interruption de service" },
  { id: "evenement",    label: "Événement",           color: "#a855f7", bg: "rgba(168,85,247,0.12)",  icon: "📅",  desc: "Portes ouvertes, campagnes" },
  { id: "communique",   label: "Communiqué officiel", color: "#F5A623", bg: "rgba(245,166,35,0.12)",  icon: "📢",  desc: "Déclaration institutionnelle" },
];

const REGIONS = [
  "Conakry", "Boké", "Kindia", "Mamou", "Labé", "Faranah", "Kankan", "Nzérékoré",
  "France", "États-Unis", "Belgique", "Canada", "Royaume-Uni", "Allemagne", "Espagne", "Maroc", "Sénégal"
];

const TEMPLATES: Record<string, { titre: string; contenu: string }[]> = {
  information: [
    { titre: "Fermeture exceptionnelle", contenu: "Nous vous informons que notre établissement sera fermé le [DATE] en raison de [MOTIF]. Nous vous prions de nous excuser pour la gêne occasionnée et restons disponibles par téléphone." },
    { titre: "Changement d'horaires", contenu: "À compter du [DATE], nos horaires d'ouverture seront modifiés comme suit : [NOUVEAUX HORAIRES]. Nous vous remercions de votre compréhension." },
    { titre: "Nouveau service disponible", contenu: "Nous avons le plaisir de vous annoncer la disponibilité d'un nouveau service : [NOM DU SERVICE]. Prenez rendez-vous dès maintenant sur Yelen224." },
  ],
  urgent: [
    { titre: "Interruption de service", contenu: "🚨 URGENT : En raison de [MOTIF], nos services sont temporairement indisponibles. Nous mettons tout en œuvre pour rétablir la situation dans les meilleurs délais. Merci de votre patience." },
    { titre: "Alerte importante", contenu: "⚠️ INFORMATION URGENTE : [CONTENU DE L'ALERTE]. Pour toute urgence, contactez-nous au [NUMÉRO DE TÉLÉPHONE]." },
  ],
  evenement: [
    { titre: "Journée portes ouvertes", contenu: "Nous vous invitons à notre journée portes ouvertes le [DATE] de [HEURE DÉBUT] à [HEURE FIN]. Venez découvrir nos services, rencontrer nos équipes et bénéficier d'offres spéciales. Entrée libre !" },
    { titre: "Campagne gratuite", contenu: "À l'occasion de [ÉVÉNEMENT], nous organisons une campagne gratuite de [SERVICE] le [DATE] de [HEURE] à [HEURE]. Places limitées — réservez votre créneau dès maintenant." },
  ],
  offre: [
    { titre: "Offre spéciale", contenu: "🎯 OFFRE LIMITÉE : Du [DATE DÉBUT] au [DATE FIN], bénéficiez de [DESCRIPTION OFFRE]. Profitez-en dès maintenant en prenant rendez-vous sur Yelen224 !" },
    { titre: "Nouveau tarif préférentiel", contenu: "Nous avons le plaisir de vous proposer un nouveau tarif préférentiel pour [SERVICE] : [DÉTAILS TARIF]. Offre valable jusqu'au [DATE]." },
  ],
  communique: [
    { titre: "Communiqué officiel", contenu: "Par la présente, [NOM DE L'INSTITUTION] informe l'ensemble de ses clients et partenaires que [CONTENU DU COMMUNIQUÉ]. Pour toute information complémentaire, notre équipe reste à votre disposition." },
  ],
};

const STATUT_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  publiee:    { label: "Publiée",          color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.25)",   icon: "✅" },
  brouillon:  { label: "Brouillon",        color: "#F5A623", bg: "rgba(245,166,35,0.08)",  border: "rgba(245,166,35,0.25)",  icon: "📝" },
  planifiee:  { label: "Planifiée",        color: "#a855f7", bg: "rgba(168,85,247,0.08)",  border: "rgba(168,85,247,0.25)",  icon: "⏰" },
  expiree:    { label: "Expirée",          color: "#64748b", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.25)", icon: "🕐" },
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function fmtFull(d: string) {
  return new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CentreCommunication() {
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"liste" | "creer" | "stats">("liste");
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [filterType, setFilterType] = useState("tous");
  const [filterStatut, setFilterStatut] = useState("tous");
  const [searchQ, setSearchQ] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editAnnonce, setEditAnnonce] = useState<Annonce | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [institutionId, setInstitutionId] = useState<string | null>(null);

  const [form, setForm] = useState({
    titre: "",
    contenu: "",
    type: "information",
    date_expiration: "",
    date_publication: "",
    statut: "publiee",
    epingle: false,
    regions_cibles: [] as string[],
  });

  const showNotif = (type: "success" | "error", msg: string) => {
    setNotif({ type, msg });
    setTimeout(() => setNotif(null), 4000);
  };

  useEffect(() => {
    const id = localStorage.getItem("yelen224_institution_id");
    if (!id) { router.push("/institution/connexion"); return; }
    setInstitutionId(id);
    fetchData(id);
  }, []);

  const fetchData = async (id: string) => {
    const [instRes, annRes] = await Promise.all([
      supabase.from("institutions").select("name, category, logo, plan").eq("id", id).single(),
      supabase.from("annonces").select("*").eq("institution_id", id).order("epingle", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    setInstitution(instRes.data || null);
    setAnnonces(annRes.data || []);
    setLoading(false);
  };

  const handleCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const loadTemplate = (t: { titre: string; contenu: string }) => {
    setForm(prev => ({ ...prev, titre: t.titre, contenu: t.contenu }));
    setShowTemplates(false);
  };

  const loadEditForm = (a: Annonce) => {
    setForm({
      titre: a.titre,
      contenu: a.contenu,
      type: a.type,
      date_expiration: a.date_expiration ? a.date_expiration.slice(0, 10) : "",
      date_publication: a.date_publication ? a.date_publication.slice(0, 16) : "",
      statut: a.statut,
      epingle: a.epingle,
      regions_cibles: a.regions_cibles || [],
    });
    if (a.image_url) setCoverPreview(a.image_url);
    setEditAnnonce(a);
    setTab("creer");
  };

  const handleDuplicate = async (a: Annonce) => {
    if (!institutionId) return;
    await supabase.from("annonces").insert({
      institution_id: institutionId,
      titre: `[Copie] ${a.titre}`,
      contenu: a.contenu,
      type: a.type,
      statut: "brouillon",
      date_expiration: null,
      date_publication: null,
      image_url: a.image_url,
      epingle: false,
      regions_cibles: a.regions_cibles,
      nb_vues: 0,
      nb_clics: 0,
    });
    showNotif("success", "Annonce dupliquée en brouillon.");
    fetchData(institutionId);
  };

  const handleToggleEpingle = async (a: Annonce) => {
    if (!institutionId) return;
    await supabase.from("annonces").update({ epingle: !a.epingle }).eq("id", a.id);
    fetchData(institutionId);
  };

  const handleToggleStatut = async (a: Annonce) => {
    if (!institutionId) return;
    const newStatut = a.statut === "publiee" ? "brouillon" : "publiee";
    await supabase.from("annonces").update({ statut: newStatut }).eq("id", a.id);
    fetchData(institutionId);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("annonces").delete().eq("id", id);
    showNotif("success", "Annonce supprimée.");
    setDeleteId(null);
    if (institutionId) fetchData(institutionId);
  };

  const resetForm = () => {
    setForm({ titre: "", contenu: "", type: "information", date_expiration: "", date_publication: "", statut: "publiee", epingle: false, regions_cibles: [] });
    setCoverFile(null);
    setCoverPreview(null);
    setEditAnnonce(null);
    setShowTemplates(false);
  };

  const handleSubmit = async () => {
    if (!form.titre.trim() || !form.contenu.trim()) {
      showNotif("error", "Le titre et le contenu sont obligatoires.");
      return;
    }
    if (!institutionId) return;
    setSaving(true);

    try {
      let imageUrl: string | null = editAnnonce?.image_url || null;

      if (coverFile) {
        const ext = coverFile.name.split(".").pop();
        const path = `annonces/${institutionId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("documents").upload(path, coverFile, { upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }
      }

      // Déterminer statut final
      let finalStatut = form.statut;
      if (form.date_publication && new Date(form.date_publication) > new Date()) {
        finalStatut = "planifiee";
      }

      const payload = {
        institution_id: institutionId,
        titre: form.titre.trim(),
        contenu: form.contenu.trim(),
        type: form.type,
        statut: finalStatut,
        date_expiration: form.date_expiration || null,
        date_publication: form.date_publication || null,
        image_url: imageUrl,
        epingle: form.epingle,
        regions_cibles: form.regions_cibles.length > 0 ? form.regions_cibles : null,
      };

      let error;
      if (editAnnonce) {
        ({ error } = await supabase.from("annonces").update(payload).eq("id", editAnnonce.id));
      } else {
        ({ error } = await supabase.from("annonces").insert({ ...payload, nb_vues: 0, nb_clics: 0 }));
      }

      if (error) {
        showNotif("error", "Erreur lors de la sauvegarde.");
      } else {
        showNotif("success", editAnnonce ? "Annonce mise à jour." : finalStatut === "planifiee" ? "Annonce planifiée avec succès." : "Annonce publiée avec succès.");
        resetForm();
        setTab("liste");
        fetchData(institutionId);
      }
    } catch {
      showNotif("error", "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Filtres ──────────────────────────────────────────────────────────────

  const filtered = annonces.filter(a => {
    const isExpired = a.date_expiration && new Date(a.date_expiration) < new Date();
    const realStatut = isExpired ? "expiree" : a.statut;
    if (filterType !== "tous" && a.type !== filterType) return false;
    if (filterStatut !== "tous" && realStatut !== filterStatut) return false;
    if (searchQ && !a.titre.toLowerCase().includes(searchQ.toLowerCase()) && !a.contenu.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: annonces.length,
    publiees: annonces.filter(a => a.statut === "publiee").length,
    brouillons: annonces.filter(a => a.statut === "brouillon").length,
    planifiees: annonces.filter(a => a.statut === "planifiee").length,
    vues: annonces.reduce((acc, a) => acc + (a.nb_vues || 0), 0),
    clics: annonces.reduce((acc, a) => acc + (a.nb_clics || 0), 0),
    epinglees: annonces.filter(a => a.epingle).length,
  };

  const getType = (id: string) => TYPES.find(t => t.id === id) || TYPES[0];

  // ─── Styles ───────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "#f9f9fb",
    border: `1px solid ${C.borderCard}`,
    borderRadius: "10px",
    padding: "11px 14px",
    color: C.text,
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    color: C.textSubtle,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    display: "block",
    marginBottom: "7px",
    fontWeight: "600",
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "36px", height: "36px", border: `3px solid ${C.borderSubtle}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.pageBg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", transition: "background-color 0.3s ease" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .ann-card:hover { border-color: rgba(245,166,35,0.25) !important; }
        .ann-card { transition: all 0.15s ease; }
        .action-btn:hover { opacity: 0.8; }
        .action-btn { transition: opacity 0.15s; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #F5A623 !important; box-shadow: 0 0 0 3px rgba(245,166,35,0.12) !important; }
        .type-card:hover { transform: translateY(-1px); }
        .type-card { transition: all 0.15s; cursor: pointer; }
        .region-tag:hover { border-color: rgba(245,166,35,0.5) !important; }
        .region-tag { transition: all 0.15s; cursor: pointer; }
      `}</style>

      {/* ── NOTIFICATION ── */}
      {notif && (
        <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 1000, backgroundColor: notif.type === "success" ? (theme === "dark" ? "rgba(34,197,94,0.12)" : "#f0faf5") : (theme === "dark" ? "rgba(239,68,68,0.12)" : "#fef2f2"), border: `1px solid ${notif.type === "success" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`, borderLeft: `4px solid ${notif.type === "success" ? "#22c55e" : "#ef4444"}`, borderRadius: "12px", padding: "14px 20px", animation: "slideIn 0.3s ease", maxWidth: "340px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
          <p style={{ color: notif.type === "success" ? "#22c55e" : "#ef4444", fontSize: "13px", margin: 0, fontWeight: "700" }}>{notif.msg}</p>
        </div>
      )}

      {/* ── MODAL SUPPRESSION ── */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "16px", padding: "32px", maxWidth: "380px", width: "100%", textAlign: "center" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "24px" }}>🗑️</div>
            <h3 style={{ color: C.text, fontSize: "16px", fontWeight: "800", margin: "0 0 8px" }}>Supprimer cette annonce ?</h3>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 24px" }}>Cette action est irréversible. L'annonce sera définitivement supprimée.</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, backgroundColor: "transparent", border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "11px", color: C.textMuted, fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>Annuler</button>
              <button onClick={() => handleDelete(deleteId)} style={{ flex: 1, backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "11px", color: "#ef4444", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, backgroundColor: theme === "dark" ? "rgba(8,8,18,0.97)" : "rgba(248,248,251,0.97)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.borderCard}`, padding: "0 24px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button onClick={() => router.push("/institution/dashboard")} style={{ background: "transparent", border: "none", color: C.textSubtle, fontSize: "20px", cursor: "pointer" }}>←</button>
              <div style={{ width: "36px", height: "36px", borderRadius: "9px", backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {institution?.logo ? <img src={institution.logo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : <span style={{ color: "#F5A623", fontSize: "14px", fontWeight: "800" }}>{institution?.name?.[0]?.toUpperCase() || "Y"}</span>}
              </div>
              <div>
                <h1 style={{ color: C.text, fontSize: "15px", fontWeight: "700", margin: 0 }}>{institution?.name}</h1>
                <p style={{ color: C.textSubtle, fontSize: "11px", margin: 0 }}>Centre de communication</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {tab !== "creer" && (
                <button
                  onClick={() => { resetForm(); setTab("creer"); }}
                  style={{ backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "9px", padding: "9px 18px", fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  + Nouvelle annonce
                </button>
              )}
              <span style={{ color: "#F5A623", fontSize: "15px", fontWeight: "800", letterSpacing: "2px" }}>YELEN224</span>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0" }}>
            {[
              { id: "liste", label: `📋 Annonces (${annonces.length})` },
              { id: "stats", label: "📊 Statistiques" },
              { id: "creer", label: editAnnonce ? "✏️ Modifier" : "✨ Créer" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => { if (t.id !== "creer") { resetForm(); } setTab(t.id as any); }}
                style={{ backgroundColor: tab === t.id ? "rgba(245,166,35,0.08)" : "transparent", border: "none", borderBottom: tab === t.id ? "2px solid #F5A623" : "2px solid transparent", color: tab === t.id ? "#F5A623" : C.textSubtle, fontSize: "13px", fontWeight: tab === t.id ? "700" : "400", padding: "10px 18px", cursor: "pointer", transition: "all 0.15s" }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 24px 80px" }}>

        {/* ══ STATS RAPIDES ══ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px", marginBottom: "24px" }}>
          {[
            { label: "Total", value: stats.total, color: C.text },
            { label: "Publiées", value: stats.publiees, color: "#22c55e" },
            { label: "Brouillons", value: stats.brouillons, color: "#F5A623" },
            { label: "Planifiées", value: stats.planifiees, color: "#a855f7" },
            { label: "Épinglées", value: stats.epinglees, color: "#f97316" },
            { label: "Vues totales", value: stats.vues, color: "#3b82f6" },
            { label: "Clics totaux", value: stats.clics, color: "#06b6d4" },
          ].map((s, i) => (
            <div key={i} style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "12px", padding: "14px 16px", animation: "fadeUp 0.3s ease" }}>
              <p style={{ color: C.textSubtle, fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 6px", fontWeight: "600" }}>{s.label}</p>
              <p style={{ color: s.color, fontSize: "24px", fontWeight: "900", margin: 0, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ══ LISTE ══ */}
        {tab === "liste" && (
          <div>
            {/* Filtres et recherche */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
              {/* Recherche */}
              <div style={{ position: "relative", flex: "1", minWidth: "200px" }}>
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Rechercher une annonce..."
                  style={{ ...inputStyle, paddingLeft: "36px" }}
                />
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: C.textFaint, fontSize: "14px" }}>🔍</span>
              </div>

              {/* Filtre type */}
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: "auto", minWidth: "140px" }}>
                <option value="tous">Tous les types</option>
                {TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>

              {/* Filtre statut */}
              <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...inputStyle, width: "auto", minWidth: "140px" }}>
                <option value="tous">Tous les statuts</option>
                <option value="publiee">Publiées</option>
                <option value="brouillon">Brouillons</option>
                <option value="planifiee">Planifiées</option>
                <option value="expiree">Expirées</option>
              </select>

              <span style={{ color: C.textFaint, fontSize: "12px", flexShrink: 0 }}>{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</span>
            </div>

            {filtered.length === 0 ? (
              <div style={{ backgroundColor: C.cardBg, border: `1px dashed ${C.borderCard}`, borderRadius: "16px", padding: "60px", textAlign: "center" }}>
                <p style={{ fontSize: "40px", margin: "0 0 12px" }}>📢</p>
                <p style={{ color: C.text, fontSize: "16px", fontWeight: "700", margin: "0 0 8px" }}>Aucune annonce trouvée</p>
                <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 24px" }}>Commencez à communiquer avec vos clients.</p>
                <button onClick={() => { resetForm(); setTab("creer"); }} style={{ backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "10px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
                  Créer une annonce
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {filtered.map(annonce => {
                  const t = getType(annonce.type);
                  const isExpired = annonce.date_expiration && new Date(annonce.date_expiration) < new Date();
                  const realStatut = isExpired ? "expiree" : annonce.statut;
                  const statCfg = STATUT_CFG[realStatut] || STATUT_CFG.publiee;

                  return (
                    <div key={annonce.id} className="ann-card" style={{ backgroundColor: C.cardBg, border: `1px solid ${annonce.epingle ? "rgba(245,166,35,0.3)" : C.borderCard}`, borderLeft: `4px solid ${annonce.epingle ? "#F5A623" : t.color}`, borderRadius: "14px", overflow: "hidden", opacity: realStatut === "expiree" ? 0.7 : 1, animation: "fadeUp 0.2s ease" }}>
                      {annonce.image_url && (
                        <div style={{ width: "100%", height: "160px", overflow: "hidden" }}>
                          <img src={annonce.image_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                        </div>
                      )}
                      <div style={{ padding: "18px 22px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: "200px" }}>
                            {/* Badges */}
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                              <span style={{ backgroundColor: t.bg, border: `1px solid ${t.color}44`, color: t.color, fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{t.icon} {t.label.toUpperCase()}</span>
                              <span style={{ backgroundColor: statCfg.bg, border: `1px solid ${statCfg.border}`, color: statCfg.color, fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>{statCfg.icon} {statCfg.label}</span>
                              {annonce.epingle && <span style={{ backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)", color: "#F5A623", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>📌 Épinglée</span>}
                              {annonce.regions_cibles && annonce.regions_cibles.length > 0 && (
                                <span style={{ backgroundColor: C.borderSubtle, border: `1px solid ${C.borderCard}`, color: C.textSubtle, fontSize: "10px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px" }}>
                                  🎯 {annonce.regions_cibles.length} région{annonce.regions_cibles.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>

                            <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "700", margin: "0 0 6px", lineHeight: 1.4 }}>{annonce.titre}</h3>
                            <p style={{ color: C.textMuted, fontSize: "13px", margin: "0 0 10px", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{annonce.contenu}</p>

                            {/* Métriques */}
                            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                              <span style={{ color: C.textFaint, fontSize: "11px" }}>👁️ {annonce.nb_vues || 0} vues</span>
                              <span style={{ color: C.textFaint, fontSize: "11px" }}>🖱️ {annonce.nb_clics || 0} clics</span>
                              <span style={{ color: C.textFaint, fontSize: "11px" }}>📅 {fmt(annonce.created_at)}</span>
                              {annonce.date_publication && annonce.statut === "planifiee" && (
                                <span style={{ color: "#a855f7", fontSize: "11px" }}>⏰ Publiée le {fmtFull(annonce.date_publication)}</span>
                              )}
                              {annonce.date_expiration && (
                                <span style={{ color: isExpired ? "#ef4444" : C.textFaint, fontSize: "11px" }}>⏳ Expire le {fmt(annonce.date_expiration)}</span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "7px", minWidth: "130px" }}>
                            <button className="action-btn" onClick={() => loadEditForm(annonce)} style={{ backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "8px", padding: "8px 12px", color: "#F5A623", fontSize: "12px", fontWeight: "700", cursor: "pointer", textAlign: "center" }}>
                              ✏️ Modifier
                            </button>
                            <button className="action-btn" onClick={() => handleToggleStatut(annonce)} style={{ backgroundColor: annonce.statut === "publiee" ? C.borderSubtle : "rgba(34,197,94,0.08)", border: `1px solid ${annonce.statut === "publiee" ? C.borderCard : "rgba(34,197,94,0.25)"}`, borderRadius: "8px", padding: "8px 12px", color: annonce.statut === "publiee" ? C.textSubtle : "#22c55e", fontSize: "12px", fontWeight: "700", cursor: "pointer", textAlign: "center" }}>
                              {annonce.statut === "publiee" ? "📝 Brouillon" : "✅ Publier"}
                            </button>
                            <button className="action-btn" onClick={() => handleToggleEpingle(annonce)} style={{ backgroundColor: annonce.epingle ? "rgba(245,166,35,0.08)" : "transparent", border: `1px solid ${annonce.epingle ? "rgba(245,166,35,0.25)" : C.borderCard}`, borderRadius: "8px", padding: "8px 12px", color: annonce.epingle ? "#F5A623" : C.textSubtle, fontSize: "12px", fontWeight: "600", cursor: "pointer", textAlign: "center" }}>
                              📌 {annonce.epingle ? "Désépingler" : "Épingler"}
                            </button>
                            <button className="action-btn" onClick={() => handleDuplicate(annonce)} style={{ backgroundColor: "transparent", border: `1px solid ${C.borderCard}`, borderRadius: "8px", padding: "8px 12px", color: C.textSubtle, fontSize: "12px", fontWeight: "600", cursor: "pointer", textAlign: "center" }}>
                              📋 Dupliquer
                            </button>
                            <button className="action-btn" onClick={() => setDeleteId(annonce.id)} style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "8px 12px", color: "#ef4444", fontSize: "12px", fontWeight: "700", cursor: "pointer", textAlign: "center" }}>
                              🗑️ Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STATISTIQUES ══ */}
        {tab === "stats" && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
              {/* Top annonces par vues */}
              <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "24px" }}>
                <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: "0 0 16px" }}>👁️ Top annonces par vues</h3>
                {annonces.sort((a, b) => (b.nb_vues || 0) - (a.nb_vues || 0)).slice(0, 5).map((a, i) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: i < 4 ? `1px solid ${C.borderSubtle}` : "none" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: i === 0 ? "rgba(245,166,35,0.15)" : C.borderSubtle, color: i === 0 ? "#F5A623" : C.textFaint, fontSize: "11px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: C.text, fontSize: "13px", fontWeight: "600", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titre}</p>
                      <p style={{ color: C.textFaint, fontSize: "11px", margin: 0 }}>{fmt(a.created_at)}</p>
                    </div>
                    <span style={{ color: "#3b82f6", fontSize: "13px", fontWeight: "700", flexShrink: 0 }}>{a.nb_vues || 0} vues</span>
                  </div>
                ))}
                {annonces.length === 0 && <p style={{ color: C.textSubtle, fontSize: "13px" }}>Aucune donnée</p>}
              </div>

              {/* Répartition par type */}
              <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "24px" }}>
                <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: "0 0 16px" }}>📊 Répartition par type</h3>
                {TYPES.map(t => {
                  const count = annonces.filter(a => a.type === t.id).length;
                  const pct = annonces.length > 0 ? Math.round((count / annonces.length) * 100) : 0;
                  return (
                    <div key={t.id} style={{ marginBottom: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: C.textMuted, fontSize: "12px" }}>{t.icon} {t.label}</span>
                        <span style={{ color: t.color, fontSize: "12px", fontWeight: "700" }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ height: "6px", borderRadius: "3px", backgroundColor: C.borderSubtle, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: "3px", backgroundColor: t.color, width: `${pct}%`, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tableau détaillé */}
            <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.borderSubtle}` }}>
                <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: 0 }}>📋 Détail de toutes les annonces</h3>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}>
                      {["Titre", "Type", "Statut", "Vues", "Clics", "Date création", "Expiration"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${C.borderSubtle}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {annonces.map((a, i) => {
                      const t = getType(a.type);
                      const isExpired = a.date_expiration && new Date(a.date_expiration) < new Date();
                      return (
                        <tr key={a.id} style={{ borderBottom: i < annonces.length - 1 ? `1px solid ${C.borderSubtle}` : "none" }}>
                          <td style={{ padding: "12px 16px", color: C.text, fontSize: "13px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.epingle ? "📌 " : ""}{a.titre}</td>
                          <td style={{ padding: "12px 16px" }}><span style={{ backgroundColor: t.bg, color: t.color, fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>{t.label}</span></td>
                          <td style={{ padding: "12px 16px" }}><span style={{ color: isExpired ? "#64748b" : STATUT_CFG[a.statut]?.color, fontSize: "12px", fontWeight: "700" }}>{isExpired ? "Expirée" : STATUT_CFG[a.statut]?.label}</span></td>
                          <td style={{ padding: "12px 16px", color: "#3b82f6", fontSize: "13px", fontWeight: "700" }}>{a.nb_vues || 0}</td>
                          <td style={{ padding: "12px 16px", color: "#06b6d4", fontSize: "13px", fontWeight: "700" }}>{a.nb_clics || 0}</td>
                          <td style={{ padding: "12px 16px", color: C.textSubtle, fontSize: "12px" }}>{fmt(a.created_at)}</td>
                          <td style={{ padding: "12px 16px", color: isExpired ? "#ef4444" : C.textSubtle, fontSize: "12px" }}>{a.date_expiration ? fmt(a.date_expiration) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {annonces.length === 0 && <p style={{ color: C.textSubtle, fontSize: "13px", padding: "24px", textAlign: "center" }}>Aucune annonce créée</p>}
              </div>
            </div>
          </div>
        )}

        {/* ══ CRÉER / MODIFIER ══ */}
        {tab === "creer" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: "28px", alignItems: "flex-start", animation: "fadeUp 0.2s ease" }}>

            {/* ── Formulaire ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>
                  {editAnnonce ? "✏️ Modifier l'annonce" : "✨ Nouvelle annonce"}
                </h2>
                <p style={{ color: C.textSubtle, fontSize: "13px", margin: 0 }}>
                  {editAnnonce ? "Modifiez et republiez votre annonce." : "Votre annonce sera visible sur votre profil Yelen224."}
                </p>
              </div>

              {/* Type */}
              <div>
                <label style={labelStyle}>Type d'annonce *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {TYPES.map(t => (
                    <div key={t.id} className="type-card" onClick={() => setForm(prev => ({ ...prev, type: t.id }))} style={{ backgroundColor: form.type === t.id ? t.bg : C.cardBg, border: `2px solid ${form.type === t.id ? t.color : C.borderCard}`, borderRadius: "10px", padding: "11px 14px" }}>
                      <p style={{ color: form.type === t.id ? t.color : C.text, fontSize: "12px", fontWeight: "700", margin: "0 0 2px" }}>{t.icon} {t.label}</p>
                      <p style={{ color: form.type === t.id ? t.color + "99" : C.textSubtle, fontSize: "11px", margin: 0 }}>{t.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Templates */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Templates</label>
                  <button onClick={() => setShowTemplates(!showTemplates)} style={{ backgroundColor: "transparent", border: `1px solid ${C.borderCard}`, borderRadius: "7px", padding: "4px 10px", color: "#F5A623", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                    {showTemplates ? "Fermer" : "📋 Voir les templates"}
                  </button>
                </div>
                {showTemplates && (
                  <div style={{ backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {(TEMPLATES[form.type] || []).map((tpl, i) => (
                      <button key={i} onClick={() => loadTemplate(tpl)} style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "8px", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(245,166,35,0.4)"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = C.borderCard}
                      >
                        <p style={{ color: C.text, fontSize: "12px", fontWeight: "700", margin: "0 0 2px" }}>{tpl.titre}</p>
                        <p style={{ color: C.textSubtle, fontSize: "11px", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.contenu.slice(0, 80)}...</p>
                      </button>
                    ))}
                    {!TEMPLATES[form.type] && <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0, textAlign: "center" }}>Aucun template pour ce type</p>}
                  </div>
                )}
              </div>

              {/* Image */}
              <div>
                <label style={labelStyle}>Photo de couverture</label>
                <label style={{ display: "flex", alignItems: "center", gap: "14px", backgroundColor: C.cardBg, border: `1px dashed ${C.borderCard}`, borderRadius: "10px", padding: "14px 16px", cursor: "pointer" }}>
                  {coverPreview ? (
                    <div style={{ width: "72px", height: "48px", borderRadius: "7px", overflow: "hidden", flexShrink: 0 }}>
                      <img src={coverPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                    </div>
                  ) : (
                    <div style={{ width: "72px", height: "48px", borderRadius: "7px", backgroundColor: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ color: "#F5A623", fontSize: "20px" }}>📷</span>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ color: coverPreview ? "#22c55e" : C.text, fontSize: "13px", fontWeight: "600", margin: "0 0 2px" }}>{coverPreview ? "Image sélectionnée" : "Ajouter une image"}</p>
                    <p style={{ color: C.textFaint, fontSize: "11px", margin: 0 }}>JPG, PNG — max 5MB</p>
                  </div>
                  {coverPreview && (
                    <button onClick={e => { e.preventDefault(); setCoverFile(null); setCoverPreview(null); }} style={{ backgroundColor: "transparent", border: "none", color: "#ef4444", fontSize: "18px", cursor: "pointer" }}>✕</button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCover} style={{ display: "none" }} />
                </label>
              </div>

              {/* Titre */}
              <div>
                <label style={labelStyle}>Titre *</label>
                <input value={form.titre} onChange={e => setForm(prev => ({ ...prev, titre: e.target.value }))} placeholder="Ex: Fermeture exceptionnelle le 28 mars" style={inputStyle} />
              </div>

              {/* Contenu */}
              <div>
                <label style={labelStyle}>Contenu *</label>
                <textarea value={form.contenu} onChange={e => setForm(prev => ({ ...prev, contenu: e.target.value }))} placeholder="Rédigez votre annonce officielle..." rows={5} style={{ ...inputStyle, resize: "none", lineHeight: "1.7" }} />
                <p style={{ color: C.textFaint, fontSize: "11px", textAlign: "right", margin: "4px 0 0" }}>{form.contenu.length} caractères</p>
              </div>

              {/* Planification */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>📅 Date / heure de publication</label>
                  <input type="datetime-local" value={form.date_publication} onChange={e => setForm(prev => ({ ...prev, date_publication: e.target.value }))} style={inputStyle} />
                  <p style={{ color: C.textFaint, fontSize: "11px", margin: "4px 0 0" }}>Laisser vide = publication immédiate</p>
                </div>
                <div>
                  <label style={labelStyle}>⏳ Date d'expiration</label>
                  <input type="date" value={form.date_expiration} onChange={e => setForm(prev => ({ ...prev, date_expiration: e.target.value }))} style={inputStyle} />
                  <p style={{ color: C.textFaint, fontSize: "11px", margin: "4px 0 0" }}>L'annonce sera archivée après cette date</p>
                </div>
              </div>

              {/* Statut + Épingler */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Statut</label>
                  <select value={form.statut} onChange={e => setForm(prev => ({ ...prev, statut: e.target.value }))} style={inputStyle}>
                    <option value="publiee">✅ Publier maintenant</option>
                    <option value="brouillon">📝 Sauvegarder en brouillon</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Options</label>
                  <div
                    onClick={() => setForm(prev => ({ ...prev, epingle: !prev.epingle }))}
                    style={{ ...inputStyle, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: form.epingle ? "rgba(245,166,35,0.08)" : (theme === "dark" ? "rgba(255,255,255,0.04)" : "#f9f9fb"), borderColor: form.epingle ? "rgba(245,166,35,0.35)" : C.borderCard }}
                  >
                    <span style={{ color: form.epingle ? "#F5A623" : C.textMuted, fontSize: "14px" }}>📌 Épingler en haut</span>
                    <div style={{ width: "36px", height: "20px", borderRadius: "10px", backgroundColor: form.epingle ? "#F5A623" : C.borderSubtle, position: "relative", transition: "all 0.2s" }}>
                      <div style={{ position: "absolute", top: "2px", left: form.epingle ? "18px" : "2px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: form.epingle ? "#080812" : C.textFaint, transition: "all 0.2s" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Ciblage régions */}
              <div>
                <label style={labelStyle}>🎯 Ciblage par région / pays (optionnel)</label>
                <p style={{ color: C.textFaint, fontSize: "11px", margin: "0 0 10px" }}>Laisser vide = visible partout. Cliquez pour sélectionner.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {REGIONS.map(r => {
                    const selected = form.regions_cibles.includes(r);
                    return (
                      <button
                        key={r}
                        className="region-tag"
                        onClick={() => setForm(prev => ({
                          ...prev,
                          regions_cibles: selected ? prev.regions_cibles.filter(x => x !== r) : [...prev.regions_cibles, r]
                        }))}
                        style={{ backgroundColor: selected ? "rgba(245,166,35,0.12)" : C.cardBg, border: `1px solid ${selected ? "rgba(245,166,35,0.4)" : C.borderCard}`, borderRadius: "20px", padding: "5px 12px", color: selected ? "#F5A623" : C.textSubtle, fontSize: "12px", fontWeight: selected ? "700" : "500", cursor: "pointer" }}
                      >
                        {selected ? "✓ " : ""}{r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Avertissement */}
              <div style={{ backgroundColor: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "10px", padding: "12px 16px", display: "flex", gap: "10px" }}>
                <span style={{ color: "#F5A623", fontSize: "13px" }}>ℹ️</span>
                <p style={{ color: C.textMuted, fontSize: "12px", margin: 0, lineHeight: "1.6" }}>Tout contenu faux, trompeur ou abusif entraîne la suspension immédiate du compte. Les annonces sont modérées par l'équipe Yelen224.</p>
              </div>

              {/* Boutons */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { resetForm(); setTab("liste"); }} style={{ flex: 1, backgroundColor: "transparent", border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "13px", color: C.textMuted, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                  Annuler
                </button>
                <button
                  onClick={() => { setForm(prev => ({ ...prev, statut: "brouillon" })); setTimeout(handleSubmit, 0); }}
                  disabled={saving}
                  style={{ flex: 1, backgroundColor: "transparent", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "10px", padding: "13px", color: "#F5A623", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}
                >
                  📝 Sauvegarder brouillon
                </button>
                <button onClick={handleSubmit} disabled={saving} style={{ flex: 2, backgroundColor: saving ? C.borderSubtle : "#F5A623", color: saving ? C.textFaint : "#080812", border: "none", borderRadius: "10px", padding: "13px", fontSize: "14px", fontWeight: "800", cursor: saving ? "not-allowed" : "pointer" }}>
                  {saving ? "⏳ Sauvegarde..." : form.date_publication && new Date(form.date_publication) > new Date() ? "⏰ Planifier" : editAnnonce ? "✅ Mettre à jour" : "🚀 Publier maintenant"}
                </button>
              </div>
            </div>

            {/* ── Aperçu ── */}
            <div style={{ position: "sticky", top: "90px" }}>
              <label style={labelStyle}>Aperçu en temps réel</label>
              {!form.titre && !form.contenu && !coverPreview ? (
                <div style={{ backgroundColor: C.cardBg, border: `1px dashed ${C.borderCard}`, borderRadius: "14px", padding: "48px 24px", textAlign: "center" }}>
                  <p style={{ fontSize: "32px", margin: "0 0 10px" }}>📱</p>
                  <p style={{ color: C.textSubtle, fontSize: "13px", margin: 0 }}>L'aperçu apparaît ici en temps réel.</p>
                </div>
              ) : (
                <div style={{ backgroundColor: C.cardBg, border: `1px solid ${getType(form.type).color}44`, borderLeft: `4px solid ${getType(form.type).color}`, borderRadius: "14px", overflow: "hidden", boxShadow: `0 0 24px ${getType(form.type).color}18` }}>
                  {coverPreview && (
                    <div style={{ width: "100%", height: "180px", overflow: "hidden", position: "relative" }}>
                      <img src={coverPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.6) 100%)" }} />
                    </div>
                  )}
                  <div style={{ padding: "18px" }}>
                    {form.epingle && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                        <span style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700" }}>📌 ANNONCE ÉPINGLÉE</span>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ width: "38px", height: "38px", borderRadius: "9px", backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                        {institution?.logo ? <img src={institution.logo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : <span style={{ color: "#F5A623", fontSize: "14px", fontWeight: "800" }}>{institution?.name?.[0]?.toUpperCase() || "Y"}</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: C.text, fontSize: "13px", fontWeight: "700", margin: 0 }}>{institution?.name || "Votre institution"}</p>
                        <p style={{ color: C.textSubtle, fontSize: "11px", margin: "1px 0 0" }}>{institution?.category} — Maintenant</p>
                      </div>
                      <span style={{ backgroundColor: getType(form.type).bg, border: `1px solid ${getType(form.type).color}44`, color: getType(form.type).color, fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>
                        {getType(form.type).icon} {getType(form.type).label.toUpperCase()}
                      </span>
                    </div>
                    {form.titre && <h3 style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: "0 0 8px", lineHeight: 1.35 }}>{form.titre}</h3>}
                    {form.contenu && <p style={{ color: C.textMuted, fontSize: "13px", margin: "0 0 12px", lineHeight: 1.65 }}>{form.contenu.slice(0, 220)}{form.contenu.length > 220 ? "..." : ""}</p>}
                    {form.regions_cibles.length > 0 && (
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
                        {form.regions_cibles.map(r => <span key={r} style={{ backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", color: "#F5A623", fontSize: "10px", fontWeight: "600", padding: "2px 7px", borderRadius: "20px" }}>{r}</span>)}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "10px", borderTop: `1px solid ${C.borderSubtle}` }}>
                      <span style={{ color: C.textFaint, fontSize: "11px" }}>👁️ 0 vue · 🖱️ 0 clic</span>
                      {form.date_expiration && <span style={{ color: C.textFaint, fontSize: "11px" }}>Expire le {fmt(form.date_expiration)}</span>}
                      <span style={{ backgroundColor: form.date_publication && new Date(form.date_publication) > new Date() ? "rgba(168,85,247,0.1)" : "rgba(34,197,94,0.1)", border: `1px solid ${form.date_publication && new Date(form.date_publication) > new Date() ? "rgba(168,85,247,0.25)" : "rgba(34,197,94,0.25)"}`, color: form.date_publication && new Date(form.date_publication) > new Date() ? "#a855f7" : "#22c55e", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>
                        {form.date_publication && new Date(form.date_publication) > new Date() ? "⏰ PLANIFIÉE" : form.statut === "brouillon" ? "📝 BROUILLON" : "✅ PUBLIÉE"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Info visibilité */}
              <div style={{ marginTop: "14px", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "10px", padding: "12px 16px" }}>
                <p style={{ color: C.textSubtle, fontSize: "11px", margin: "0 0 4px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px" }}>Visibilité</p>
                <p style={{ color: C.textMuted, fontSize: "12px", margin: 0, lineHeight: 1.6 }}>
                  {form.regions_cibles.length > 0
                    ? `Visible uniquement pour les citoyens de : ${form.regions_cibles.join(", ")}`
                    : `Visible publiquement sur le profil de ${institution?.name || "votre institution"} — accessible à tous les citoyens Yelen224.`}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}