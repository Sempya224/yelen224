"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type Horaire = { jour: string; ouvert: boolean; debut: string; fin: string };

const JOURS: Horaire[] = [
  { jour: "Lundi",    ouvert: true,  debut: "08:00", fin: "17:00" },
  { jour: "Mardi",    ouvert: true,  debut: "08:00", fin: "17:00" },
  { jour: "Mercredi", ouvert: true,  debut: "08:00", fin: "17:00" },
  { jour: "Jeudi",    ouvert: true,  debut: "08:00", fin: "17:00" },
  { jour: "Vendredi", ouvert: true,  debut: "08:00", fin: "16:00" },
  { jour: "Samedi",   ouvert: false, debut: "09:00", fin: "13:00" },
  { jour: "Dimanche", ouvert: false, debut: "09:00", fin: "13:00" },
];

const CATEGORIES = [
  "Hopital / Clinique", "Ecole / Universite", "Mairie / Administration",
  "Banque / Microfinance", "Pharmacie", "Cabinet medical",
  "Tribunal / Justice", "Transport / Logistique", "ONG / Association", "Autre",
];

const VILLES = ["Conakry", "Boké", "Kindia", "Mamou", "Labé", "Faranah", "Kankan", "Nzérékoré"];
const LANGUES_OPTIONS = ["Français", "Pular", "Malinké", "Soussou", "Anglais", "Arabe"];

const SERVICES_SUGGESTIONS: Record<string, string[]> = {
  "Hopital / Clinique": ["Consultation générale", "Consultation spécialisée", "Urgences", "Chirurgie", "Maternité", "Pédiatrie", "Radiologie", "Laboratoire", "Pharmacie interne", "Vaccination"],
  "Banque / Microfinance": ["Ouverture de compte", "Demande de crédit", "Transfert international", "Mobile Banking", "Consultation conseiller", "Domiciliation de salaire", "Assurance"],
  "Ecole / Universite": ["Inscription", "Examen d'entrée", "Conseil académique", "Demande de diplôme", "Bibliothèque", "Orientation"],
  "Mairie / Administration": ["Acte de naissance", "Carte d'identité", "Permis de construire", "Déclaration de naissance", "Légalisation"],
  "Pharmacie": ["Délivrance d'ordonnance", "Conseil pharmaceutique", "Vaccins", "Parapharmacie"],
  "Cabinet medical": ["Consultation", "Bilan de santé", "Suivi médical", "Certificat médical"],
  "Tribunal / Justice": ["Audience civile", "Audience pénale", "Dépôt de dossier", "Consultation greffe"],
  "Transport / Logistique": ["Réservation de billet", "Livraison", "Suivi de colis", "Devis transport"],
  "ONG / Association": ["Inscription programme", "Aide humanitaire", "Formation", "Consultation sociale"],
  "Autre": ["Service 1", "Service 2", "Service 3"],
};

const STEPS = ["Identité", "Services", "Horaires", "Contact & Localisation"];
const STEP_ICONS = ["🏛️", "⚙️", "🕐", "📍"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfilSetup() {
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const logoInputRef = useRef<HTMLInputElement>(null);
  const banniereInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [saveCount, setSaveCount] = useState(0); // Pour animation feedback

  // Fichiers
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [banniereFile, setBanniereFile] = useState<File | null>(null);
  const [bannierePreview, setBannierePreview] = useState("");

  // Formulaire
  const [form, setForm] = useState({
    name: "",
    category: "",
    description: "",
    phone: "",
    whatsapp: "",
    email: "",
    site_web: "",
    adresse: "",
    ville: "",
    quartier: "",
    annee_creation: "",
    capacite: "",
    langue: [] as string[],
    services: [] as string[],
    service_custom: "",
  });

  const [horaires, setHoraires] = useState<Horaire[]>(JOURS);

  // ── Charger données existantes ────────────────────────────────────────────
  useEffect(() => {
    const id = localStorage.getItem("yelen224_institution_id");
    if (!id) {
      router.push("/institution/connexion");
      return;
    }
    setInstitutionId(id);

    supabase.from("institutions").select("*").eq("id", id).single().then(({ data }) => {
      if (data) {
        setForm(prev => ({
          ...prev,
          name: data.name || "",
          category: data.category || "",
          description: data.description || "",
          phone: data.phone || "",
          whatsapp: data.whatsapp || "",
          email: data.email || "",
          site_web: data.site_web || "",
          adresse: data.adresse || "",
          ville: data.ville || "",
          quartier: data.quartier || "",
          annee_creation: data.annee_creation || "",
          capacite: data.capacite || "",
          langue: Array.isArray(data.langue) ? data.langue : (data.langue ? [data.langue] : []),
          services: Array.isArray(data.services) ? data.services : [],
        }));
        if (data.logo) setLogoPreview(data.logo);
        if (data.banniere) setBannierePreview(data.banniere);
        if (data.horaires && Array.isArray(data.horaires)) setHoraires(data.horaires);
      }
      setLoadingData(false);
    });
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fc = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleService = (s: string) => {
    setForm(prev => ({
      ...prev,
      services: prev.services.includes(s)
        ? prev.services.filter(x => x !== s)
        : [...prev.services, s],
    }));
  };

  const addCustomService = () => {
    const s = form.service_custom.trim();
    if (!s || form.services.includes(s)) return;
    setForm(prev => ({ ...prev, services: [...prev.services, s], service_custom: "" }));
  };

  const removeService = (s: string) =>
    setForm(prev => ({ ...prev, services: prev.services.filter(x => x !== s) }));

  const toggleLangue = (l: string) => {
    setForm(prev => ({
      ...prev,
      langue: prev.langue.includes(l) ? prev.langue.filter(x => x !== l) : [...prev.langue, l],
    }));
  };

  const updateHoraire = (idx: number, field: keyof Horaire, value: any) => {
    setHoraires(prev => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
  };

  // ── Upload fichier ─────────────────────────────────────────────────────────
  const uploadFile = async (file: File, path: string, bucket: string): Promise<string | null> => {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  // ── Sauvegarde centrale ────────────────────────────────────────────────────
  // Retourne true si succès, false si erreur
  const saveData = async (): Promise<boolean> => {
    setError("");
    if (!institutionId) return false;
    setLoading(true);

    try {
      let logoUrl = logoPreview;
      let banniereUrl = bannierePreview;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const url = await uploadFile(logoFile, `logos/${institutionId}.${ext}`, "avatars");
        if (url) logoUrl = url;
      }
      if (banniereFile) {
        const ext = banniereFile.name.split(".").pop();
        const url = await uploadFile(banniereFile, `bannieres/${institutionId}.${ext}`, "avatars");
        if (url) banniereUrl = url;
      }

      const payload: Record<string, any> = {
        name: form.name,
        category: form.category,
        description: form.description,
        phone: form.phone,
        whatsapp: form.whatsapp,
        email: form.email,
        site_web: form.site_web,
        adresse: form.adresse,
        ville: form.ville,
        quartier: form.quartier,
        annee_creation: form.annee_creation,
        capacite: form.capacite,
        langue: form.langue,
        services: form.services,
        horaires: horaires,
      };
      if (logoUrl) payload.logo = logoUrl;
      if (banniereUrl) payload.banniere = banniereUrl;

      const { data: updated, error: updateError } = await supabase
        .from("institutions")
        .update(payload)
        .eq("id", institutionId)
        .select("id");

      if (updateError) throw updateError;
      if (!updated || updated.length === 0) throw new Error("Aucune ligne mise à jour — vérifiez les droits Supabase (RLS).");
      return true;
    } catch (err: any) {
      setError(err?.message || "Erreur lors de la sauvegarde. Réessayez.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ── Actions boutons ────────────────────────────────────────────────────────

  // Sauvegarde simple (reste sur l'étape)
  const handleSave = async () => {
    const ok = await saveData();
    if (ok) {
      setSaveCount(n => n + 1);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  // Sauvegarde + avancer à l'étape suivante
  const handleNext = async () => {
    const ok = await saveData();
    if (ok) setStep(prev => prev + 1);
  };

  // Sauvegarde finale + retour dashboard
  const handleFinalSave = async () => {
    const ok = await saveData();
    if (ok) {
      // ✅ Même route que le login : /institution/[id]/dashboard
      router.push(`/institution/${institutionId}/dashboard`);
    }
  };

  // Retour précédent (sans sauvegarde forcée)
  const handlePrev = () => setStep(prev => prev - 1);

  // ── Retour dashboard (bouton header) ──────────────────────────────────────
  const handleBackToDashboard = () => {
    // ✅ Même route que le login : /institution/[id]/dashboard
    router.push(`/institution/${institutionId}/dashboard`);
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const progressPercent = ((step - 1) / (STEPS.length - 1)) * 100;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "#f9f9fb",
    border: `1.5px solid ${C.borderCard}`,
    borderRadius: "12px",
    padding: "13px 16px",
    color: C.text,
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    color: C.textSubtle,
    fontSize: "10.5px",
    display: "block",
    marginBottom: "7px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    fontWeight: "700",
  };

  if (loadingData)
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: C.pageBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: `3px solid ${C.borderSubtle}`,
            borderTopColor: "#F5A623",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span style={{ color: C.textSubtle, fontSize: "13px", fontWeight: "600", letterSpacing: "1px" }}>
          CHARGEMENT…
        </span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: C.pageBg,
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: C.text,
        transition: "background-color 0.3s ease",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
        @keyframes slideIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
        input::placeholder, textarea::placeholder { color: #555; }
        input:focus, textarea:focus, select:focus {
          border-color: rgba(245,166,35,0.6) !important;
          outline: none;
          box-shadow: 0 0 0 4px rgba(245,166,35,0.07);
        }
        select option { background-color: #13132A; color: #fff; }
        .upload-zone:hover { border-color: rgba(245,166,35,0.5) !important; background-color: rgba(245,166,35,0.04) !important; }
        .service-tag { transition: all 0.15s; cursor: pointer; }
        .service-tag:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .jour-row { transition: all 0.15s; }
        .jour-row:hover { transform: translateX(2px); }
        .btn-nav { transition: all 0.18s; }
        .btn-nav:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(245,166,35,0.25); }
        .btn-nav:active:not(:disabled) { transform: translateY(0); }
        .btn-back { transition: all 0.18s; }
        .btn-back:hover { background-color: rgba(245,166,35,0.08) !important; border-color: rgba(245,166,35,0.3) !important; color: #F5A623 !important; }
        .step-dot { transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
      `}</style>

      {/* ══ HEADER ══ */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backgroundColor:
            theme === "dark" ? "rgba(8,8,18,0.97)" : "rgba(248,248,251,0.97)",
          backdropFilter: "blur(24px)",
          borderBottom: `1px solid ${C.borderCard}`,
        }}
      >
        {/* Progress bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: "2px",
            width: `${progressPercent}%`,
            background: "linear-gradient(90deg, #F5A623, #ffcc70)",
            transition: "width 0.5s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        />

        <div
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            height: "64px",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          {/* Logo */}
          <span
            style={{
              color: "#F5A623",
              fontSize: "16px",
              fontWeight: "900",
              letterSpacing: "2.5px",
              flexShrink: 0,
            }}
          >
            YELEN<span style={{ color: C.text }}>224</span>
          </span>

          {/* Stepper */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "center" }}>
            {STEPS.map((s, i) => {
              const done = step > i + 1;
              const active = step === i + 1;
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div
                    className="step-dot"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      cursor: done ? "pointer" : "default",
                      opacity: !done && !active ? 0.45 : 1,
                    }}
                    onClick={() => done && setStep(i + 1)}
                  >
                    <div
                      style={{
                        width: active ? "28px" : "24px",
                        height: active ? "28px" : "24px",
                        borderRadius: "50%",
                        backgroundColor: done
                          ? "#22c55e"
                          : active
                          ? "#F5A623"
                          : C.borderSubtle,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: done ? "11px" : active ? "11px" : "10px",
                        fontWeight: "800",
                        color: done || active ? "#080812" : C.textFaint,
                        boxShadow: active
                          ? "0 0 0 4px rgba(245,166,35,0.18)"
                          : done
                          ? "0 0 0 3px rgba(34,197,94,0.15)"
                          : "none",
                      }}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <span
                      style={{
                        color: active ? C.text : C.textFaint,
                        fontSize: "11px",
                        fontWeight: active ? "700" : "500",
                        display: active ? "block" : "none",
                        whiteSpace: "nowrap",
                        animation: active ? "slideIn 0.25s ease" : "none",
                      }}
                    >
                      {s}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      style={{
                        width: "24px",
                        height: "1.5px",
                        backgroundColor: done ? "#22c55e" : C.borderSubtle,
                        transition: "background-color 0.3s",
                        borderRadius: "2px",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ✅ FIX: Bouton retour tableau de bord — router.push correct */}
          <button
            className="btn-back"
            onClick={handleBackToDashboard}
            style={{
              backgroundColor: "transparent",
              border: `1.5px solid ${C.borderCard}`,
              borderRadius: "10px",
              padding: "7px 14px",
              color: C.textSubtle,
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span style={{ fontSize: "14px" }}>←</span>
            <span>Dashboard</span>
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "36px 24px 100px" }}>

        {/* Titre étape */}
        <div style={{ marginBottom: "28px", animation: "fadeUp 0.3s ease" }}>
          <p style={{ color: "#F5A623", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 6px", fontWeight: "700" }}>
            {STEP_ICONS[step - 1]} Étape {step} / {STEPS.length} — {STEPS[step - 1]}
          </p>
          <h1 style={{ color: C.text, fontSize: "22px", fontWeight: "900", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
            {step === 1 && "Identité de votre établissement"}
            {step === 2 && "Services proposés"}
            {step === 3 && "Horaires d'ouverture"}
            {step === 4 && "Contact et localisation"}
          </h1>
          <p style={{ color: C.textSubtle, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
            {step === 1 && "Ces informations apparaissent sur votre profil public Yelen224."}
            {step === 2 && "Listez les services pour lesquels les citoyens peuvent prendre RDV."}
            {step === 3 && "Configurez vos jours et heures d'ouverture — utilisés pour afficher Ouvert/Fermé."}
            {step === 4 && "Coordonnées et localisation affichées sur votre fiche publique."}
          </p>
        </div>

        {/* ══ STEP 1 — IDENTITÉ ══ */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeUp 0.2s ease" }}>

            {/* Bannière */}
            <div>
              <label style={labelStyle}>Bannière de couverture (optionnel)</label>
              <label className="upload-zone" style={{ display: "block", height: "120px", backgroundColor: C.cardBg, border: `1.5px dashed ${C.borderCard}`, borderRadius: "14px", cursor: "pointer", overflow: "hidden", position: "relative", transition: "all 0.2s" }}>
                {bannierePreview
                  ? <img src={bannierePreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                  : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "28px" }}>🖼️</span>
                      <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600" }}>Ajouter une bannière (1200×400px)</span>
                    </div>
                }
                {bannierePreview && (
                  <button onClick={e => { e.preventDefault(); setBanniereFile(null); setBannierePreview(""); }} style={{ position: "absolute", top: "8px", right: "8px", backgroundColor: "rgba(0,0,0,0.65)", border: "none", color: "#fff", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                )}
                <input ref={banniereInputRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setBanniereFile(f); setBannierePreview(URL.createObjectURL(f)); } }} style={{ display: "none" }} />
              </label>
            </div>

            {/* Logo + Nom */}
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "20px", alignItems: "flex-start" }}>
              <div>
                <label style={labelStyle}>Logo *</label>
                <label className="upload-zone" style={{ display: "block", width: "90px", height: "90px", borderRadius: "18px", backgroundColor: "rgba(245,166,35,0.06)", border: "2px dashed rgba(245,166,35,0.35)", cursor: "pointer", overflow: "hidden", transition: "all 0.2s" }}>
                  {logoPreview
                    ? <img src={logoPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "4px" }}>
                        <span style={{ color: "#F5A623", fontSize: "26px", fontWeight: "300", lineHeight: 1 }}>+</span>
                        <span style={{ color: "rgba(245,166,35,0.6)", fontSize: "9px", fontWeight: "700" }}>LOGO</span>
                      </div>
                  }
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); } }} style={{ display: "none" }} />
                </label>
                <p style={{ color: C.textFaint, fontSize: "10px", margin: "5px 0 0", textAlign: "center" }}>PNG/JPG<br/>max 2MB</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Nom officiel *</label>
                  <input value={form.name} onChange={e => fc("name", e.target.value)} placeholder="Ex: Ecobank Guinée — Agence Matam" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Catégorie *</label>
                  <select value={form.category} onChange={e => fc("category", e.target.value)} style={inputStyle}>
                    <option value="">Sélectionner une catégorie</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description publique *</label>
              <textarea value={form.description} onChange={e => fc("description", e.target.value)} placeholder="Décrivez votre établissement, vos services, votre mission..." rows={4} style={{ ...inputStyle, resize: "none", lineHeight: "1.7" }} />
              <p style={{ color: C.textFaint, fontSize: "11px", textAlign: "right", margin: "4px 0 0" }}>{form.description.length} caractères</p>
            </div>

            {/* Infos complémentaires */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Année de création</label>
                <input value={form.annee_creation} onChange={e => fc("annee_creation", e.target.value)} placeholder="Ex: 1998" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Capacité d'accueil</label>
                <input value={form.capacite} onChange={e => fc("capacite", e.target.value)} placeholder="Ex: 50 patients/jour" style={inputStyle} />
              </div>
            </div>

            {/* Langues */}
            <div>
              <label style={labelStyle}>Langues de service</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {LANGUES_OPTIONS.map(l => (
                  <button key={l} className="service-tag" onClick={() => toggleLangue(l)} style={{ backgroundColor: form.langue.includes(l) ? "rgba(245,166,35,0.12)" : C.cardBg, border: `1.5px solid ${form.langue.includes(l) ? "rgba(245,166,35,0.45)" : C.borderCard}`, borderRadius: "20px", padding: "7px 15px", color: form.langue.includes(l) ? "#F5A623" : C.textMuted, fontSize: "13px", fontWeight: form.langue.includes(l) ? "700" : "500" }}>
                    {form.langue.includes(l) ? "✓ " : ""}{l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ STEP 2 — SERVICES ══ */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeUp 0.2s ease" }}>
            <div style={{ backgroundColor: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "12px", padding: "13px 16px", fontSize: "13px", color: C.textMuted, lineHeight: 1.6 }}>
              💡 Sélectionnez les services proposés. Ils apparaissent sur votre profil public et aident les citoyens à trouver ce qu'ils cherchent.
            </div>

            {form.category && SERVICES_SUGGESTIONS[form.category] && (
              <div>
                <label style={labelStyle}>Suggestions pour {form.category}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {SERVICES_SUGGESTIONS[form.category].map(s => (
                    <button key={s} className="service-tag" onClick={() => toggleService(s)} style={{ backgroundColor: form.services.includes(s) ? "rgba(245,166,35,0.12)" : C.cardBg, border: `1.5px solid ${form.services.includes(s) ? "rgba(245,166,35,0.45)" : C.borderCard}`, borderRadius: "20px", padding: "7px 15px", color: form.services.includes(s) ? "#F5A623" : C.textMuted, fontSize: "13px", fontWeight: form.services.includes(s) ? "700" : "500" }}>
                      {form.services.includes(s) ? "✓ " : "+ "}{s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Ajouter un service personnalisé</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input value={form.service_custom} onChange={e => fc("service_custom", e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomService()} placeholder="Ex: Consultation cardiologie..." style={{ ...inputStyle, flex: 1 }} />
                <button onClick={addCustomService} style={{ backgroundColor: "#F5A623", color: "#080812", border: "none", borderRadius: "12px", padding: "12px 18px", fontWeight: "800", fontSize: "13px", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
                  Ajouter
                </button>
              </div>
            </div>

            {form.services.length > 0 && (
              <div>
                <label style={labelStyle}>Services sélectionnés ({form.services.length})</label>
                <div style={{ backgroundColor: C.cardBg, border: `1.5px solid ${C.borderCard}`, borderRadius: "14px", padding: "14px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {form.services.map(s => (
                    <span key={s} style={{ backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", color: "#F5A623", fontSize: "12px", fontWeight: "700", padding: "5px 10px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
                      {s}
                      <button onClick={() => removeService(s)} style={{ background: "none", border: "none", color: "#F5A623", cursor: "pointer", fontSize: "15px", padding: 0, lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 3 — HORAIRES ══ */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", animation: "fadeUp 0.2s ease" }}>
            <div style={{ backgroundColor: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "12px", padding: "13px 16px", fontSize: "13px", color: C.textMuted, lineHeight: 1.6, marginBottom: "8px" }}>
              🕐 Ces horaires affichent <strong style={{ color: "#22c55e" }}>Ouvert maintenant</strong> ou <strong style={{ color: "#ef4444" }}>Fermé</strong> en temps réel sur votre fiche publique.
            </div>

            {horaires.map((h, i) => (
              <div key={h.jour} className="jour-row" style={{ backgroundColor: C.cardBg, border: `1.5px solid ${h.ouvert ? "rgba(245,166,35,0.22)" : C.borderSubtle}`, borderLeft: `3px solid ${h.ouvert ? "#F5A623" : C.borderCard}`, borderRadius: "12px", padding: "14px 18px", display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div onClick={() => updateHoraire(i, "ouvert", !h.ouvert)} style={{ width: "38px", height: "22px", borderRadius: "11px", backgroundColor: h.ouvert ? "#F5A623" : C.borderSubtle, position: "relative", cursor: "pointer", transition: "background-color 0.2s", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: "3px", left: h.ouvert ? "19px" : "3px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: h.ouvert ? "#080812" : C.textFaint, transition: "left 0.2s" }} />
                  </div>
                  <span style={{ color: h.ouvert ? C.text : C.textSubtle, fontSize: "13px", fontWeight: "700" }}>{h.jour}</span>
                </div>

                {h.ouvert ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input type="time" value={h.debut} onChange={e => updateHoraire(i, "debut", e.target.value)} style={{ ...inputStyle, width: "120px", padding: "8px 12px", fontSize: "13px" }} />
                    <span style={{ color: C.textSubtle, fontSize: "13px" }}>→</span>
                    <input type="time" value={h.fin} onChange={e => updateHoraire(i, "fin", e.target.value)} style={{ ...inputStyle, width: "120px", padding: "8px 12px", fontSize: "13px" }} />
                    <span style={{ color: "#22c55e", fontSize: "11px", fontWeight: "800", marginLeft: "4px" }}>OUVERT</span>
                  </div>
                ) : (
                  <span style={{ color: C.textFaint, fontSize: "13px", fontStyle: "italic" }}>Fermé ce jour</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ══ STEP 4 — CONTACT & LOCALISATION ══ */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "fadeUp 0.2s ease" }}>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Téléphone principal *</label>
                <input value={form.phone} onChange={e => fc("phone", e.target.value)} placeholder="+224 620 000 000" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>WhatsApp professionnel</label>
                <input value={form.whatsapp} onChange={e => fc("whatsapp", e.target.value)} placeholder="+224 620 000 000" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Email professionnel</label>
                <input type="email" value={form.email} onChange={e => fc("email", e.target.value)} placeholder="contact@institution.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Site web</label>
                <input value={form.site_web} onChange={e => fc("site_web", e.target.value)} placeholder="https://www.institution.com" style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Adresse complète</label>
              <input value={form.adresse} onChange={e => fc("adresse", e.target.value)} placeholder="Rue, numéro, bâtiment..." style={inputStyle} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Ville *</label>
                <select value={form.ville} onChange={e => fc("ville", e.target.value)} style={inputStyle}>
                  <option value="">Sélectionner une ville</option>
                  {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Quartier / Commune</label>
                <input value={form.quartier} onChange={e => fc("quartier", e.target.value)} placeholder="Ex: Matam, Kaloum, Ratoma..." style={inputStyle} />
              </div>
            </div>

            {/* Récapitulatif */}
            <div style={{ backgroundColor: C.cardBg, border: `1.5px solid ${C.borderCard}`, borderRadius: "16px", padding: "20px", marginTop: "8px" }}>
              <p style={{ color: "#F5A623", fontSize: "11px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase", margin: "0 0 14px" }}>Récapitulatif du profil</p>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                {logoPreview && (
                  <img src={logoPreview} style={{ width: "56px", height: "56px", borderRadius: "12px", objectFit: "cover", border: `1.5px solid ${C.borderCard}`, flexShrink: 0 }} alt="" />
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ color: C.text, fontSize: "16px", fontWeight: "800", margin: "0 0 4px" }}>{form.name || "—"}</p>
                  <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 8px" }}>{form.category}{form.ville && ` · ${form.ville}`}{form.quartier && `, ${form.quartier}`}</p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e", fontSize: "10px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>
                      {form.services.length} services
                    </span>
                    <span style={{ backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", color: "#F5A623", fontSize: "10px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>
                      {horaires.filter(h => h.ouvert).length} jours ouverts
                    </span>
                    {form.langue.length > 0 && (
                      <span style={{ backgroundColor: C.borderSubtle, border: `1px solid ${C.borderCard}`, color: C.textSubtle, fontSize: "10px", fontWeight: "600", padding: "3px 9px", borderRadius: "20px" }}>
                        {form.langue.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Notifications ── */}
        {error && (
          <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "12px", padding: "13px 16px", marginTop: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <p style={{ color: "#ef4444", fontSize: "13px", margin: 0, fontWeight: "600" }}>{error}</p>
          </div>
        )}

        {success && (
          <div style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "12px", padding: "13px 16px", marginTop: "20px", display: "flex", alignItems: "center", gap: "10px", animation: "fadeUp 0.2s ease" }}>
            <span style={{ fontSize: "16px" }}>✅</span>
            <p style={{ color: "#22c55e", fontSize: "13px", margin: 0, fontWeight: "600" }}>Sauvegardé avec succès.</p>
          </div>
        )}

        {/* ── Navigation ── */}
        <div style={{ display: "flex", gap: "10px", marginTop: "28px" }}>
          {step > 1 && (
            <button className="btn-nav" onClick={handlePrev} style={{ flex: 1, backgroundColor: "transparent", border: `1.5px solid ${C.borderCard}`, borderRadius: "12px", padding: "14px", color: C.textMuted, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              ← Précédent
            </button>
          )}

          <button className="btn-nav" onClick={handleSave} disabled={loading} style={{ flex: 1, backgroundColor: "transparent", border: "1.5px solid rgba(245,166,35,0.4)", borderRadius: "12px", padding: "14px", color: "#F5A623", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
            {loading ? "⏳" : "💾"} Sauvegarder
          </button>

          {step < STEPS.length ? (
            <button className="btn-nav" onClick={handleNext} disabled={loading} style={{ flex: 2, backgroundColor: loading ? C.borderSubtle : "#F5A623", color: loading ? C.textFaint : "#080812", border: "none", borderRadius: "12px", padding: "14px", fontSize: "14px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "⏳ Sauvegarde..." : `Suivant — ${STEPS[step]} →`}
            </button>
          ) : (
            <button className="btn-nav" onClick={handleFinalSave} disabled={loading} style={{ flex: 2, backgroundColor: loading ? C.borderSubtle : "#F5A623", color: loading ? C.textFaint : "#080812", border: "none", borderRadius: "12px", padding: "14px", fontSize: "14px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "⏳ Finalisation..." : "✅ Finaliser et publier"}
            </button>
          )}
        </div>

      </main>
    </div>
  );
}