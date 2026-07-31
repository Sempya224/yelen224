"use client";

// Onglet Profil Entreprise — identité publique de l'institution, distincte
// du profil du responsable (voir ProfilResponsableTab.tsx). Pré-rempli avec
// ce que l'onboarding a déjà collecté (name/secteur/statut_juridique/ville),
// le reste complété ici. secteur/statut_juridique sont éditables via un
// sélecteur en 2 étapes (TaxoModal) — nécessaire pour les comptes créés avant
// que ces champs soient obligatoires à l'onboarding (NULL en base), qui
// bloquaient sinon l'onglet Documents. statut_juridique se verrouille côté
// API dès qu'un document a été soumis (voir api/institution/profile) pour ne
// pas désynchroniser des documents déjà examinés.
import { useCallback, useEffect, useRef, useState } from "react";
import { T, type ThemeTokens } from "../theme";
import { useTheme } from "@/components/ThemeProvider";
import { SECTEURS, STATUTS_JURIDIQUES, SecteurIcon, type SecteurId, type StatutJuridiqueId } from "@/lib/institutionTaxonomy";

const SECTEUR_LABEL_BY_ID: Record<string, string> = Object.fromEntries(SECTEURS.map(s => [s.id, s.label]));
const STATUT_JURIDIQUE_LABEL_BY_ID: Record<string, string> = Object.fromEntries(STATUTS_JURIDIQUES.map(s => [s.id, s.label]));

const LANGUES_OPTIONS = ["Français", "Pular", "Malinké", "Soussou", "Anglais", "Arabe"];

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
  langue: string[]; horaires: Horaire[];
};

const EMPTY_FORM: EntrepriseForm = {
  name: "", ville: "", quartier: "", adresse: "", description: "",
  phone: "", whatsapp: "", email: "", website: "", logo: "", banniere: "",
  annee_creation: "", capacite: "", langue: [], horaires: JOURS_DEFAUT,
};

export function ProfilEntrepriseTab({ instId, onToast }: {
  instId: string; onToast: (msg: string, color?: string) => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [form, setForm] = useState<EntrepriseForm>(EMPTY_FORM);
  const [secteur, setSecteur] = useState<string | null>(null);
  const [statutJuridique, setStatutJuridique] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanniere, setUploadingBanniere] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const banniereInputRef = useRef<HTMLInputElement>(null);

  // Sélecteur secteur/statut_juridique — voir TaxoModal plus bas.
  const [taxoModalOpen, setTaxoModalOpen] = useState(false);
  const [taxoStep, setTaxoStep] = useState<1 | 2>(1);
  const [pendingStatut, setPendingStatut] = useState<StatutJuridiqueId | "">("");
  const [pendingSecteur, setPendingSecteur] = useState<SecteurId | "">("");
  const [docsLocked, setDocsLocked] = useState(false);
  const [savingTaxo, setSavingTaxo] = useState(false);

  // Charge ses propres données à chaque montage (comme ProfilResponsableTab),
  // au lieu de recevoir un `initial` calculé par le parent. Le parent
  // (dashboard/page.tsx) ne re-fetch `inst` qu'au montage du dashboard et sur
  // événements Realtime rdv/avis — jamais après une sauvegarde de profil —
  // donc quitter puis revenir sur cet onglet resynchronisait sur les
  // anciennes données du parent, écrasant une sauvegarde pourtant réussie
  // côté serveur. Un fetch propre à l'onglet, dépendant uniquement de
  // `instId` (stable), élimine ce problème.
  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/institution/profile?institution_id=${instId}`);
      const j = res.ok ? await res.json().catch(() => null) : null;
      const inst = j?.institution;
      setForm({
        name: inst?.name || "", ville: inst?.ville || "", quartier: inst?.quartier || "", adresse: inst?.adresse || "",
        description: inst?.description || "", phone: inst?.phone || "", whatsapp: inst?.whatsapp || "",
        email: inst?.email || "", website: inst?.website || "", logo: inst?.logo || "",
        banniere: inst?.banniere || "", annee_creation: inst?.annee_creation || "", capacite: inst?.capacite || "",
        langue: inst?.langue || [],
        horaires: (inst?.horaires && inst.horaires.length) ? inst.horaires : JOURS_DEFAUT,
      });
      setSecteur(inst?.secteur ?? null);
      setStatutJuridique(inst?.statut_juridique ?? null);
      setLoading(false);
    })();
  }, [instId]);

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
    if (!res.ok) { onToast(j?.error || "Échec de l'envoi de l'image.", C.red); return null; }
    return j.url as string;
  };

  const handleLogoPick = async (file: File) => {
    setUploadingLogo(true);
    const url = await uploadImage(file, "logo");
    setUploadingLogo(false);
    if (url) fc("logo", url);
  };

  const handleBannierePick = async (file: File) => {
    setUploadingBanniere(true);
    const url = await uploadImage(file, "banniere");
    setUploadingBanniere(false);
    if (url) fc("banniere", url);
  };

  const toggleLangue = (l: string) => setForm(f => ({
    ...f, langue: f.langue.includes(l) ? f.langue.filter(x => x !== l) : [...f.langue, l],
  }));

  const updateHoraire = (idx: number, field: keyof Horaire, value: string | boolean) => {
    setForm(f => ({ ...f, horaires: f.horaires.map((h, i) => i === idx ? { ...h, [field]: value } : h) }));
  };

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { onToast("Le nom de l'institution est requis.", C.red); return; }
    if (!form.ville.trim()) { onToast("La ville est requise.", C.red); return; }
    setSaving(true);
    const res = await fetch("/api/institution/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      onToast(j?.error || "Erreur lors de l'enregistrement.", C.red);
      return;
    }
    onToast("Profil entreprise enregistré.", C.green);
  }, [form, onToast]);

  // Ouvre le sélecteur — si statut_juridique est déjà connu, vérifie d'abord
  // si des documents ont été soumis (verrou : les documents requis sont
  // dérivés uniquement de statut_juridique, le changer romprait la cohérence
  // avec ce qui a déjà été examiné). L'API refait cette vérification côté
  // serveur de toute façon — ce contrôle client n'est là que pour l'UX.
  const openTaxoModal = useCallback(async () => {
    setPendingStatut((statutJuridique as StatutJuridiqueId) || "");
    setPendingSecteur((secteur as SecteurId) || "");
    setTaxoStep(1);
    setDocsLocked(false);
    if (statutJuridique) {
      const res = await fetch("/api/institution/documents");
      const j = res.ok ? await res.json().catch(() => null) : null;
      const docs = Array.isArray(j?.documents) ? j.documents as { statut: string | null }[] : [];
      setDocsLocked(docs.some(d => d.statut));
    }
    setTaxoModalOpen(true);
  }, [secteur, statutJuridique]);

  const chooseStatut = (id: StatutJuridiqueId) => {
    if (docsLocked) return;
    setPendingStatut(id);
    setTaxoStep(2);
  };

  const saveTaxonomy = useCallback(async (finalSecteur: SecteurId) => {
    setPendingSecteur(finalSecteur);
    setSavingTaxo(true);
    const res = await fetch("/api/institution/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut_juridique: pendingStatut, secteur: finalSecteur }),
    });
    setSavingTaxo(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      onToast(j?.error || "Erreur lors de l'enregistrement.", C.red);
      return;
    }
    setStatutJuridique(pendingStatut);
    setSecteur(finalSecteur);
    setTaxoModalOpen(false);
    onToast("Statut juridique et secteur d'activité enregistrés.", C.green);
  }, [pendingStatut, onToast]);

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Profil Entreprise</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Identité publique de votre institution — visible par les citoyens sur Yelen224.
        </p>

        {/* ── Identité visuelle ── */}
        <SectionLabel>Identité visuelle</SectionLabel>
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "18px", marginBottom: "18px" }}>
          <label style={fieldLabel(C)}>Bannière de couverture</label>
          <div onClick={() => banniereInputRef.current?.click()} className="tap" style={{ position: "relative", width: "100%", height: "110px", borderRadius: "14px", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, cursor: "pointer", overflow: "hidden", marginBottom: "16px" }}>
            {form.banniere ? <img src={form.banniere} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>Ajouter une bannière (1200×400px)</span>
              </div>
            )}
            {uploadingBanniere && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "18px", height: "18px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/></div>}
            <input ref={banniereInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleBannierePick(f); }}/>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div onClick={() => logoInputRef.current?.click()} className="tap" style={{ width: "64px", height: "64px", borderRadius: "16px", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", overflow: "hidden", position: "relative" }}>
              {form.logo ? <img src={form.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              )}
              {uploadingLogo && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/></div>}
              <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoPick(f); }}/>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              {secteur && (
                <span style={{ backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}30`, color: C.gold, fontSize: "11px", fontWeight: "700", padding: "5px 11px", borderRadius: "20px" }}>{SECTEUR_LABEL_BY_ID[secteur] || secteur}</span>
              )}
              {statutJuridique && (
                <span style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, color: C.t2, fontSize: "11px", fontWeight: "700", padding: "5px 11px", borderRadius: "20px" }}>{STATUT_JURIDIQUE_LABEL_BY_ID[statutJuridique] || statutJuridique}</span>
              )}
              {secteur && statutJuridique && (
                <button onClick={openTaxoModal} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "2px", textDecoration: "underline" }}>
                  Modifier
                </button>
              )}
            </div>
          </div>
        </div>

        {(!secteur || !statutJuridique) && (
          <div style={{ backgroundColor: C.orangeL, border: `1px solid ${C.orange}40`, borderRadius: "14px", padding: "14px 16px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.orange, fontSize: "12.5px", fontWeight: "800" }}>Statut juridique et secteur d'activité manquants</div>
              <div style={{ color: C.t2, fontSize: "11.5px", marginTop: "2px", lineHeight: 1.5 }}>Requis pour soumettre vos documents de vérification Yelen224.</div>
            </div>
            <button onClick={openTaxoModal} className="tap" style={{ backgroundColor: C.orange, color: "#000", border: "none", borderRadius: "10px", padding: "9px 14px", fontSize: "12px", fontWeight: "800", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
              Compléter maintenant
            </button>
          </div>
        )}

        {/* ── Informations générales ── */}
        <SectionLabel>Informations générales</SectionLabel>
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          <div>
            <label style={fieldLabel(C)}>Nom officiel *</label>
            <input value={form.name} onChange={e => fc("name", e.target.value)} style={fieldInput(C)}/>
          </div>
          <div>
            <label style={fieldLabel(C)}>Description publique</label>
            <textarea value={form.description} onChange={e => fc("description", e.target.value)} rows={4} style={{ ...fieldInput(C), resize: "none", lineHeight: 1.6 }}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel(C)}>Année de création</label>
              <input value={form.annee_creation} onChange={e => fc("annee_creation", e.target.value)} placeholder="Ex: 1998" style={fieldInput(C)}/>
            </div>
            <div>
              <label style={fieldLabel(C)}>Capacité d'accueil</label>
              <input value={form.capacite} onChange={e => fc("capacite", e.target.value)} placeholder="Ex: 50" style={fieldInput(C)}/>
            </div>
          </div>
        </div>

        {/* ── Services proposés — déplacé dans l'onglet "Services" (section
             "Offre générale"), pour ne plus cohabiter avec Services payants
             dans deux écrans différents ── */}
        <SectionLabel>Services proposés</SectionLabel>
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "16px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, margin: 0 }}>
            La liste de ce que vous proposez à vos clients se gère maintenant depuis l'onglet <strong style={{ color: C.t1 }}>Services</strong> (section "Offre gratuite").
          </p>
        </div>

        {/* ── Langues de service ── */}
        <SectionLabel>Langues de service</SectionLabel>
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", marginBottom: "18px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {LANGUES_OPTIONS.map(l => (
              <button key={l} onClick={() => toggleLangue(l)} className="tap" style={{ backgroundColor: form.langue.includes(l) ? `${C.gold}15` : C.bg3, border: `1.5px solid ${form.langue.includes(l) ? C.gold + "50" : C.border2}`, borderRadius: "20px", padding: "7px 14px", color: form.langue.includes(l) ? C.gold : C.t2, fontSize: "12px", fontWeight: form.langue.includes(l) ? "700" : "500", cursor: "pointer" }}>
                {form.langue.includes(l) ? "✓ " : ""}{l}
              </button>
            ))}
          </div>
        </div>

        {/* ── Contact & Localisation ── */}
        <SectionLabel>Contact & Localisation</SectionLabel>
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel(C)}>Ville *</label>
              <input value={form.ville} onChange={e => fc("ville", e.target.value)} style={fieldInput(C)}/>
            </div>
            <div>
              <label style={fieldLabel(C)}>Quartier</label>
              <input value={form.quartier} onChange={e => fc("quartier", e.target.value)} style={fieldInput(C)}/>
            </div>
          </div>
          <div>
            <label style={fieldLabel(C)}>Adresse complète</label>
            <input value={form.adresse} onChange={e => fc("adresse", e.target.value)} style={fieldInput(C)}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel(C)}>Téléphone</label>
              <input value={form.phone} onChange={e => fc("phone", e.target.value)} style={fieldInput(C)}/>
            </div>
            <div>
              <label style={fieldLabel(C)}>WhatsApp</label>
              <input value={form.whatsapp} onChange={e => fc("whatsapp", e.target.value)} style={fieldInput(C)}/>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel(C)}>Email</label>
              <input type="email" value={form.email} onChange={e => fc("email", e.target.value)} style={fieldInput(C)}/>
            </div>
            <div>
              <label style={fieldLabel(C)}>Site web</label>
              <input value={form.website} onChange={e => fc("website", e.target.value)} style={fieldInput(C)}/>
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
        <div style={{ backgroundColor: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: "12px", padding: "12px 14px", marginBottom: "12px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style={{ color: C.t2, fontSize: "11px", lineHeight: 1.6 }}>
            Ces horaires déterminent le badge <strong style={{ color: C.blue }}>Ouvert / Fermé</strong> affiché sur votre fiche publique. Ils sont distincts des créneaux de rendez-vous configurés dans l'onglet <strong style={{ color: C.t1 }}>Disponibilités</strong> — les deux restent séparés pour le moment.
          </div>
        </div>
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "8px", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "18px" }}>
          {form.horaires.map((h, i) => (
            <div key={h.jour} style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: "10px", alignItems: "center", padding: "8px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div onClick={() => updateHoraire(i, "ouvert", !h.ouvert)} className="tap" style={{ width: "34px", height: "20px", borderRadius: "10px", backgroundColor: h.ouvert ? C.gold : C.bg3, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "2px", left: h.ouvert ? "16px" : "2px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: h.ouvert ? "#000" : C.t3, transition: "left 0.15s" }}/>
                </div>
                <span style={{ color: h.ouvert ? C.t1 : C.t3, fontSize: "12px", fontWeight: "700" }}>{h.jour}</span>
              </div>
              {h.ouvert ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input type="time" value={h.debut} onChange={e => updateHoraire(i, "debut", e.target.value)} style={{ ...fieldInput(C), padding: "7px 9px", fontSize: "12px" }}/>
                  <span style={{ color: C.t3, fontSize: "11px" }}>→</span>
                  <input type="time" value={h.fin} onChange={e => updateHoraire(i, "fin", e.target.value)} style={{ ...fieldInput(C), padding: "7px 9px", fontSize: "12px" }}/>
                </div>
              ) : (
                <span style={{ color: C.t3, fontSize: "12px", fontStyle: "italic" }}>Fermé ce jour</span>
              )}
              <span/>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleSave} disabled={saving} className="tap" style={{ backgroundColor: saving ? C.bg3 : C.gold, color: saving ? C.t3 : "#000", border: "none", borderRadius: "12px", padding: "13px 28px", fontSize: "13px", fontWeight: "800", cursor: saving ? "not-allowed" : "pointer", boxShadow: saving ? "none" : `0 4px 20px ${C.gold}40` }}>
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>

      <TaxoModal
        open={taxoModalOpen}
        step={taxoStep}
        pendingStatut={pendingStatut}
        pendingSecteur={pendingSecteur}
        docsLocked={docsLocked}
        saving={savingTaxo}
        onClose={() => setTaxoModalOpen(false)}
        onChooseStatut={chooseStatut}
        onNext={() => setTaxoStep(2)}
        onBack={() => setTaxoStep(1)}
        onChooseSecteur={saveTaxonomy}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "10px", marginTop: "4px" }}>{children}</div>;
}

// Sélecteur secteur/statut_juridique en 2 étapes — bottom-sheet, même famille
// visuelle que le reste du dashboard (thème T, pas les couleurs claires
// codées en dur de app/institution/inscription/page.tsx). Étape 1 = statut
// juridique (verrouillable si docsLocked), étape 2 = secteur (sauvegarde
// immédiate à la sélection, pas besoin du bouton "Enregistrer" global).
function TaxoModal({ open, step, pendingStatut, pendingSecteur, docsLocked, saving, onClose, onChooseStatut, onNext, onBack, onChooseSecteur }: {
  open: boolean; step: 1 | 2; pendingStatut: StatutJuridiqueId | ""; pendingSecteur: SecteurId | "";
  docsLocked: boolean; saving: boolean; onClose: () => void;
  onChooseStatut: (id: StatutJuridiqueId) => void; onNext: () => void; onBack: () => void;
  onChooseSecteur: (id: SecteurId) => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard2, borderRadius: "24px 24px 0 0", maxHeight: "82vh", overflowY: "auto", animation: "slideUp 0.25s ease", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
        <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "100px", margin: "14px auto 0" }}/>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900" }}>{step === 1 ? "Statut juridique" : "Secteur d'activité"}</div>
            <div style={{ color: C.t3, fontSize: "11px", fontWeight: "600", marginTop: "2px" }}>Étape {step} / 2</div>
          </div>
          <button onClick={onClose} className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.bg3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: "16px 20px 28px" }}>
          {step === 1 && (
            <>
              {docsLocked && (
                <div style={{ backgroundColor: C.orangeL, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "10px 12px", marginBottom: "14px" }}>
                  <p style={{ color: C.orange, fontSize: "11.5px", lineHeight: 1.5, margin: 0, fontWeight: "600" }}>
                    Verrouillé — des documents ont déjà été soumis avec ce statut. Contactez le support Yelen224 pour le corriger.
                  </p>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {STATUTS_JURIDIQUES.map(s => {
                  const selected = pendingStatut === s.id;
                  return (
                    <div key={s.id} onClick={() => onChooseStatut(s.id)} className={docsLocked ? "" : "tap"}
                      style={{ padding: "13px 16px", borderRadius: "14px", cursor: docsLocked ? "not-allowed" : "pointer", border: `1.5px solid ${selected ? C.gold : C.border2}`, backgroundColor: selected ? `${C.gold}14` : C.bg3, opacity: docsLocked && !selected ? 0.45 : 1, transition: "all 0.2s" }}>
                      <div style={{ color: selected ? C.gold : C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "2px" }}>{s.label}</div>
                      <div style={{ color: C.t3, fontSize: "11.5px" }}>{s.description}</div>
                    </div>
                  );
                })}
              </div>
              {docsLocked && (
                <button onClick={onNext} disabled={!pendingStatut} className="tap" style={{ width: "100%", marginTop: "14px", backgroundColor: pendingStatut ? C.gold : C.bg3, color: pendingStatut ? "#000" : C.t3, border: "none", borderRadius: "12px", padding: "12px", fontSize: "13px", fontWeight: "800", cursor: pendingStatut ? "pointer" : "not-allowed" }}>
                  Suivant
                </button>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <button onClick={onBack} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer", marginBottom: "14px", padding: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
                Retour
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {SECTEURS.map(s => {
                  const selected = pendingSecteur === s.id;
                  return (
                    <div key={s.id} onClick={() => !saving && onChooseSecteur(s.id)} className="tap"
                      style={{ padding: "16px 10px", borderRadius: "14px", cursor: saving ? "not-allowed" : "pointer", border: `1.5px solid ${selected ? C.gold : C.border2}`, backgroundColor: selected ? `${C.gold}14` : C.bg3, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", transition: "all 0.2s", opacity: saving && !selected ? 0.5 : 1 }}>
                      <SecteurIcon id={s.id} color={selected ? C.gold : C.t2} size={24}/>
                      <span style={{ color: selected ? C.gold : C.t1, fontSize: "12px", fontWeight: selected ? "800" : "600", textAlign: "center" }}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
              {saving && <div style={{ textAlign: "center", marginTop: "14px", color: C.t3, fontSize: "12px" }}>Enregistrement…</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const fieldLabel = (C: ThemeTokens): React.CSSProperties => ({ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" });
const fieldInput = (C: ThemeTokens): React.CSSProperties => ({ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "11px 13px", color: C.t1, fontSize: "13px", fontFamily: "inherit" });
