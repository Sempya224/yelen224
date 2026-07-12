"use client";

// Onglet Profil Entreprise — identité publique de l'institution, distincte
// du profil du responsable (voir ProfilResponsableTab.tsx). Pré-rempli avec
// ce que l'onboarding a déjà collecté (name/secteur/statut_juridique/ville),
// le reste complété ici. secteur/statut_juridique restent en lecture seule :
// les modifier impacte la validation Yelen et les documents requis — écran
// séparé, à traiter avec "Validation Yelen" plus tard, pas ici.
import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "../theme";

const SECTEUR_LABELS: Record<string, string> = {
  sante: "Santé", administratif: "Administratif", financier: "Financier", juridique: "Juridique",
  beaute_bien_etre: "Beauté / Bien-être", commerce: "Commerce", artisanat: "Artisanat", services_divers: "Services divers",
};
const STATUT_JURIDIQUE_LABELS: Record<string, string> = {
  public: "Public", prive_formel: "Privé formel", liberal: "Libéral", individuel_informel: "Individuel / informel",
};

const LANGUES_OPTIONS = ["Français", "Pular", "Malinké", "Soussou", "Anglais", "Arabe"];

// Suggestions de domaines d'activité par secteur — reprises de
// SERVICES_PAR_SECTEUR (app/institution/inscription/page.tsx) pour rester
// cohérent avec ce qui est proposé dès l'onboarding.
const SERVICES_PAR_SECTEUR: Record<string, string[]> = {
  sante: ["Consultation générale", "Consultation spécialisée", "Urgences", "Vaccination", "Analyses / Laboratoire"],
  administratif: ["Acte d'état civil", "Carte d'identité / Passeport", "Permis", "Légalisation de documents"],
  financier: ["Ouverture de compte", "Demande de crédit", "Transfert d'argent", "Conseil financier"],
  juridique: ["Consultation juridique", "Dépôt de dossier", "Audience", "Médiation"],
  beaute_bien_etre: ["Coiffure", "Soins esthétiques", "Massage", "Spa"],
  commerce: ["Vente en boutique", "Retrait de commande", "Conseil produit", "Livraison"],
  artisanat: ["Commande sur mesure", "Réparation", "Devis", "Retrait d'ouvrage"],
  services_divers: ["Consultation", "Prestation à domicile", "Rendez-vous conseil", "Autre"],
};

type Horaire = { jour: string; ouvert: boolean; debut: string; fin: string };

const JOURS_DEFAUT: Horaire[] = [
  { jour: "Lundi",    ouvert: true,  debut: "08:00", fin: "17:00" },
  { jour: "Mardi",    ouvert: true,  debut: "08:00", fin: "17:00" },
  { jour: "Mercredi", ouvert: true,  debut: "08:00", fin: "17:00" },
  { jour: "Jeudi",    ouvert: true,  debut: "08:00", fin: "17:00" },
  { jour: "Vendredi", ouvert: true,  debut: "08:00", fin: "16:00" },
  { jour: "Samedi",   ouvert: false, debut: "09:00", fin: "13:00" },
  { jour: "Dimanche", ouvert: false, debut: "09:00", fin: "13:00" },
];

type EntrepriseForm = {
  name: string; ville: string; quartier: string; adresse: string; description: string;
  phone: string; whatsapp: string; email: string; website: string; logo: string;
  banniere: string; annee_creation: string; capacite: string;
  langue: string[]; services: string[]; horaires: Horaire[];
};

export function ProfilEntrepriseTab({ instId, secteur, statutJuridique, initial }: {
  instId: string; secteur: string | null; statutJuridique: string | null; initial: EntrepriseForm;
}) {
  const [form, setForm] = useState<EntrepriseForm>(initial);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanniere, setUploadingBanniere] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [serviceCustom, setServiceCustom] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const banniereInputRef = useRef<HTMLInputElement>(null);

  // `initial` est reconstruit en ligne par le parent (dashboard/page.tsx) à
  // chaque render — pas seulement quand `inst` change réellement (ex: chaque
  // événement Realtime rdv/avis déclenche loadData()). Sans ce garde-fou,
  // resynchroniser sur toute nouvelle référence de `initial` écrase les
  // saisies en cours avec les anciennes valeurs serveur. On ne synchronise
  // donc qu'une fois par instId (montage réel de l'onglet).
  const syncedInstId = useRef<string | null>(null);
  useEffect(() => {
    if (syncedInstId.current === instId) return;
    syncedInstId.current = instId;
    setForm({ ...initial, horaires: initial.horaires.length ? initial.horaires : JOURS_DEFAUT });
  }, [instId, initial]);

  const fc = (field: keyof EntrepriseForm, value: string) => setForm(f => ({ ...f, [field]: value }));

  // Upload via route service_role — storage.objects n'a pas de policy RLS
  // pour les institutions (pas de session Supabase Auth), un upload direct
  // depuis le client échoue avec "new row violates row-level security
  // policy". Voir api/institution/upload/route.ts.
  const uploadImage = async (file: File, kind: "logo" | "banniere"): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/institution/upload", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    if (!res.ok) { setError(j?.error || "Échec de l'envoi de l'image."); return null; }
    return j.url as string;
  };

  const handleLogoPick = async (file: File) => {
    setUploadingLogo(true);
    setError(null);
    const url = await uploadImage(file, "logo");
    setUploadingLogo(false);
    if (url) fc("logo", url);
  };

  const handleBannierePick = async (file: File) => {
    setUploadingBanniere(true);
    setError(null);
    const url = await uploadImage(file, "banniere");
    setUploadingBanniere(false);
    if (url) fc("banniere", url);
  };

  const toggleLangue = (l: string) => setForm(f => ({
    ...f, langue: f.langue.includes(l) ? f.langue.filter(x => x !== l) : [...f.langue, l],
  }));

  const toggleService = (s: string) => setForm(f => ({
    ...f, services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s],
  }));
  const addCustomService = () => {
    const s = serviceCustom.trim();
    if (!s || form.services.includes(s)) return;
    setForm(f => ({ ...f, services: [...f.services, s] }));
    setServiceCustom("");
  };
  const removeService = (s: string) => setForm(f => ({ ...f, services: f.services.filter(x => x !== s) }));

  const updateHoraire = (idx: number, field: keyof Horaire, value: string | boolean) => {
    setForm(f => ({ ...f, horaires: f.horaires.map((h, i) => i === idx ? { ...h, [field]: value } : h) }));
  };

  const handleSave = useCallback(async () => {
    setError(null);
    setSaveMsg(null);
    if (!form.name.trim()) { setError("Le nom de l'institution est requis."); return; }
    if (!form.ville.trim()) { setError("La ville est requise."); return; }
    setSaving(true);
    const res = await fetch("/api/institution/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setError(j?.error || "Erreur lors de l'enregistrement.");
      return;
    }
    setSaveMsg("Profil entreprise enregistré.");
    setTimeout(() => setSaveMsg(null), 3000);
  }, [form]);

  const suggestionsSecteur = secteur ? (SERVICES_PAR_SECTEUR[secteur] || []) : [];

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Profil Entreprise</h1>
        <p style={{ color: T.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Identité publique de votre institution — visible par les citoyens sur Yelen224.
        </p>

        {error && (
          <div style={{ backgroundColor: T.redL, border: `1px solid ${T.red}25`, borderLeft: `3px solid ${T.red}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
            <p style={{ color: T.red, fontSize: "13px", margin: 0, fontWeight: "600" }}>{error}</p>
          </div>
        )}
        {saveMsg && (
          <div style={{ backgroundColor: T.greenL, border: `1px solid ${T.green}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
            <p style={{ color: T.green, fontSize: "13px", margin: 0, fontWeight: "600" }}>{saveMsg}</p>
          </div>
        )}

        {/* ── Identité visuelle ── */}
        <SectionLabel>Identité visuelle</SectionLabel>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border2}`, borderRadius: "18px", padding: "18px", marginBottom: "18px" }}>
          <label style={fieldLabel}>Bannière de couverture</label>
          <div onClick={() => banniereInputRef.current?.click()} className="tap" style={{ position: "relative", width: "100%", height: "110px", borderRadius: "14px", backgroundColor: T.bg3, border: `1.5px dashed ${T.border2}`, cursor: "pointer", overflow: "hidden", marginBottom: "16px" }}>
            {form.banniere ? <img src={form.banniere} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span style={{ color: T.t3, fontSize: "11px", fontWeight: "600" }}>Ajouter une bannière (1200×400px)</span>
              </div>
            )}
            {uploadingBanniere && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "18px", height: "18px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/></div>}
            <input ref={banniereInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleBannierePick(f); }}/>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div onClick={() => logoInputRef.current?.click()} className="tap" style={{ width: "64px", height: "64px", borderRadius: "16px", backgroundColor: T.bg3, border: `1.5px dashed ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", overflow: "hidden", position: "relative" }}>
              {form.logo ? <img src={form.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              )}
              {uploadingLogo && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/></div>}
              <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoPick(f); }}/>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {secteur && (
                <span style={{ backgroundColor: `${T.gold}12`, border: `1px solid ${T.gold}30`, color: T.gold, fontSize: "11px", fontWeight: "700", padding: "5px 11px", borderRadius: "20px" }}>{SECTEUR_LABELS[secteur] || secteur}</span>
              )}
              {statutJuridique && (
                <span style={{ backgroundColor: T.bg3, border: `1px solid ${T.border2}`, color: T.t2, fontSize: "11px", fontWeight: "700", padding: "5px 11px", borderRadius: "20px" }}>{STATUT_JURIDIQUE_LABELS[statutJuridique] || statutJuridique}</span>
              )}
              <div style={{ width: "100%", color: T.t3, fontSize: "10.5px", marginTop: "2px" }}>Secteur et statut juridique modifiables via Validation Yelen</div>
            </div>
          </div>
        </div>

        {/* ── Informations générales ── */}
        <SectionLabel>Informations générales</SectionLabel>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          <div>
            <label style={fieldLabel}>Nom officiel *</label>
            <input value={form.name} onChange={e => fc("name", e.target.value)} style={fieldInput}/>
          </div>
          <div>
            <label style={fieldLabel}>Description publique</label>
            <textarea value={form.description} onChange={e => fc("description", e.target.value)} rows={4} style={{ ...fieldInput, resize: "none", lineHeight: 1.6 }}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Année de création</label>
              <input value={form.annee_creation} onChange={e => fc("annee_creation", e.target.value)} placeholder="Ex: 1998" style={fieldInput}/>
            </div>
            <div>
              <label style={fieldLabel}>Capacité d'accueil</label>
              <input value={form.capacite} onChange={e => fc("capacite", e.target.value)} placeholder="Ex: 50" style={fieldInput}/>
            </div>
          </div>
        </div>

        {/* ── Domaines d'activité ── */}
        <SectionLabel>Domaines d'activité</SectionLabel>
        <p style={{ color: T.t3, fontSize: "11.5px", lineHeight: 1.5, margin: "-8px 0 10px" }}>
          Aide les citoyens à vous trouver dans la recherche — distinct de l'onglet <strong style={{ color: T.t2 }}>Services</strong> (paiements et réservations).
        </p>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          {suggestionsSecteur.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {suggestionsSecteur.map(s => (
                <button key={s} onClick={() => toggleService(s)} className="tap" style={{ backgroundColor: form.services.includes(s) ? `${T.gold}15` : T.bg3, border: `1.5px solid ${form.services.includes(s) ? T.gold + "50" : T.border2}`, borderRadius: "20px", padding: "7px 14px", color: form.services.includes(s) ? T.gold : T.t2, fontSize: "12px", fontWeight: form.services.includes(s) ? "700" : "500", cursor: "pointer" }}>
                  {form.services.includes(s) ? "✓ " : "+ "}{s}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={serviceCustom} onChange={e => setServiceCustom(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomService()} placeholder="Ajouter un domaine personnalisé…" style={{ ...fieldInput, flex: 1 }}/>
            <button onClick={addCustomService} className="tap" style={{ backgroundColor: T.gold, color: "#000", border: "none", borderRadius: "10px", padding: "0 16px", fontWeight: "800", fontSize: "13px", cursor: "pointer", flexShrink: 0 }}>Ajouter</button>
          </div>
          {form.services.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {form.services.map(s => (
                <span key={s} style={{ backgroundColor: `${T.gold}10`, border: `1px solid ${T.gold}25`, color: T.gold, fontSize: "12px", fontWeight: "700", padding: "5px 10px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
                  {s}
                  <button onClick={() => removeService(s)} style={{ background: "none", border: "none", color: T.gold, cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Langues de service ── */}
        <SectionLabel>Langues de service</SectionLabel>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "16px", marginBottom: "18px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {LANGUES_OPTIONS.map(l => (
              <button key={l} onClick={() => toggleLangue(l)} className="tap" style={{ backgroundColor: form.langue.includes(l) ? `${T.gold}15` : T.bg3, border: `1.5px solid ${form.langue.includes(l) ? T.gold + "50" : T.border2}`, borderRadius: "20px", padding: "7px 14px", color: form.langue.includes(l) ? T.gold : T.t2, fontSize: "12px", fontWeight: form.langue.includes(l) ? "700" : "500", cursor: "pointer" }}>
                {form.langue.includes(l) ? "✓ " : ""}{l}
              </button>
            ))}
          </div>
        </div>

        {/* ── Contact & Localisation ── */}
        <SectionLabel>Contact & Localisation</SectionLabel>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Ville *</label>
              <input value={form.ville} onChange={e => fc("ville", e.target.value)} style={fieldInput}/>
            </div>
            <div>
              <label style={fieldLabel}>Quartier</label>
              <input value={form.quartier} onChange={e => fc("quartier", e.target.value)} style={fieldInput}/>
            </div>
          </div>
          <div>
            <label style={fieldLabel}>Adresse complète</label>
            <input value={form.adresse} onChange={e => fc("adresse", e.target.value)} style={fieldInput}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Téléphone</label>
              <input value={form.phone} onChange={e => fc("phone", e.target.value)} style={fieldInput}/>
            </div>
            <div>
              <label style={fieldLabel}>WhatsApp</label>
              <input value={form.whatsapp} onChange={e => fc("whatsapp", e.target.value)} style={fieldInput}/>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Email</label>
              <input type="email" value={form.email} onChange={e => fc("email", e.target.value)} style={fieldInput}/>
            </div>
            <div>
              <label style={fieldLabel}>Site web</label>
              <input value={form.website} onChange={e => fc("website", e.target.value)} style={fieldInput}/>
            </div>
          </div>
        </div>

        {/* ── Horaires ──
            institutions.horaires (7 jours, ouvert/fermé + début/fin) pilote
            uniquement le badge public "Ouvert/Fermé maintenant" — colonne
            distincte de institutions.disponibilites (onglet Disponibilités),
            qui génère les vrais créneaux réservables pour la prise de RDV.
            Dette connue : deux mécanismes séparés pour un concept proche,
            fusion reportée faute de temps avant le lancement (3 semaines,
            juillet 2026). Voir mémoire projet. Ne pas fusionner ici sans
            revalider l'impact sur DisponibilitesTab. */}
        <SectionLabel>Horaires</SectionLabel>
        <div style={{ backgroundColor: `${T.blue}08`, border: `1px solid ${T.blue}20`, borderRadius: "12px", padding: "12px 14px", marginBottom: "12px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style={{ color: T.t2, fontSize: "11px", lineHeight: 1.6 }}>
            Ces horaires déterminent le badge <strong style={{ color: T.blue }}>Ouvert / Fermé</strong> affiché sur votre fiche publique. Ils sont distincts des créneaux de rendez-vous configurés dans l'onglet <strong style={{ color: T.t1 }}>Disponibilités</strong> — les deux restent séparés pour le moment.
          </div>
        </div>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "8px", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "18px" }}>
          {form.horaires.map((h, i) => (
            <div key={h.jour} style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: "10px", alignItems: "center", padding: "8px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div onClick={() => updateHoraire(i, "ouvert", !h.ouvert)} className="tap" style={{ width: "34px", height: "20px", borderRadius: "10px", backgroundColor: h.ouvert ? T.gold : T.bg3, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "2px", left: h.ouvert ? "16px" : "2px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: h.ouvert ? "#000" : T.t3, transition: "left 0.15s" }}/>
                </div>
                <span style={{ color: h.ouvert ? T.t1 : T.t3, fontSize: "12px", fontWeight: "700" }}>{h.jour}</span>
              </div>
              {h.ouvert ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input type="time" value={h.debut} onChange={e => updateHoraire(i, "debut", e.target.value)} style={{ ...fieldInput, padding: "7px 9px", fontSize: "12px" }}/>
                  <span style={{ color: T.t3, fontSize: "11px" }}>→</span>
                  <input type="time" value={h.fin} onChange={e => updateHoraire(i, "fin", e.target.value)} style={{ ...fieldInput, padding: "7px 9px", fontSize: "12px" }}/>
                </div>
              ) : (
                <span style={{ color: T.t3, fontSize: "12px", fontStyle: "italic" }}>Fermé ce jour</span>
              )}
              <span/>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleSave} disabled={saving} className="tap" style={{ backgroundColor: saving ? T.bg3 : T.gold, color: saving ? T.t3 : "#000", border: "none", borderRadius: "12px", padding: "13px 28px", fontSize: "13px", fontWeight: "800", cursor: saving ? "not-allowed" : "pointer", boxShadow: saving ? "none" : `0 4px 20px ${T.gold}40` }}>
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ color: T.t1, fontSize: "13px", fontWeight: "800", marginBottom: "10px", marginTop: "4px" }}>{children}</div>;
}

const fieldLabel: React.CSSProperties = { color: T.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" };
const fieldInput: React.CSSProperties = { width: "100%", backgroundColor: T.bg3, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "11px 13px", color: T.t1, fontSize: "13px", fontFamily: "inherit" };
