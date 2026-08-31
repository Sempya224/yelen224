"use client";

// Onglet Profil Entreprise — identité publique de l'institution, distincte
// du profil du responsable (voir ProfilResponsableTab.tsx). Pré-rempli avec
// ce que l'onboarding a déjà collecté (name/catégorie+activité/statut_juridique/
// ville), le reste complété ici. Catégorie+activité/statut_juridique sont
// éditables via un sélecteur en 3 étapes (TaxoModal) — nécessaire pour les
// comptes créés avant que ces champs soient obligatoires à l'onboarding (NULL
// en base), qui bloquaient sinon l'onglet Documents. statut_juridique se
// verrouille côté API dès qu'un document a été soumis (voir
// api/institution/profile) pour ne pas désynchroniser des documents déjà
// examinés.
//
// Chantier Taxonomie des activités (Phase 3, 20/08/2026) — l'ancien
// sélecteur secteur plat (1 étape, SECTEURS) est remplacé par catégorie puis
// activité principale (+ secondaires optionnelles), même modèle que
// app/institution/inscription/engine/steps/ActiviteStep.tsx.
// institutions.secteur reste gelée (jamais réécrite par cet écran depuis
// cette phase, voir lib/institutionTaxonomy.tsx).
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { T, type ThemeTokens } from "../theme";
import { useTheme } from "@/components/ThemeProvider";
import { STATUTS_JURIDIQUES, type StatutJuridiqueId } from "@/lib/institutionTaxonomy";
import { validerUrlExterne } from "@/lib/urlValidation";
import { ACTIVITE_CATEGORIE_COLORS, ActiviteCategorieIcon } from "@/lib/activiteVisuels";
import { supabase } from "@/lib/supabase";
import { YelenLoader } from "@/components/YelenLoader";
import { FormField, fieldLabel, inputFieldStyle as fieldInput } from "./FormField";

// react-leaflet touche `window` dès l'évaluation du module (pas seulement
// au montage) — même en "use client", Next.js App Router fait un premier
// rendu côté serveur pour l'hydratation, donc un import statique plante en
// `ReferenceError: window is not defined`. ssr:false saute ce rendu serveur.
const LocationPicker = dynamic(() => import("./LocationPicker").then(m => m.LocationPicker), {
  ssr: false,
  loading: () => <div style={{ borderRadius: "14px", border: "1px solid rgba(128,128,128,0.2)", height: "240px", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={24}/></div>,
});

const STATUT_JURIDIQUE_LABEL_BY_ID: Record<string, string> = Object.fromEntries(STATUTS_JURIDIQUES.map(s => [s.id, s.label]));

type Categorie = { id: string; code: string; label: string };
type Activite = { id: string; code: string; label: string; categorie_id: string };

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
  latitude: number | null; longitude: number | null;
};

const EMPTY_FORM: EntrepriseForm = {
  name: "", ville: "", quartier: "", adresse: "", description: "",
  phone: "", whatsapp: "", email: "", website: "", logo: "", banniere: "",
  annee_creation: "", capacite: "", langue: [], horaires: JOURS_DEFAUT,
  latitude: null, longitude: null,
};

export function ProfilEntrepriseTab({ instId, onToast }: {
  instId: string; onToast: (msg: string, color?: string) => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [form, setForm] = useState<EntrepriseForm>(EMPTY_FORM);
  // Snapshot de la dernière version connue comme enregistrée (chargement ou
  // sauvegarde réussie) — pilote le bouton Enregistrer/Modifier ci-dessous :
  // désactivé et libellé "Modifier" tant que `form` ne diverge pas de ce
  // snapshot, retour à "Enregistrer" (actif) dès la moindre modification.
  const [savedForm, setSavedForm] = useState<EntrepriseForm | null>(null);
  // Erreurs de validation par champ (bordure rouge sur le champ concerné,
  // en plus du toast global — un toast seul est invisible si le formulaire
  // est long et que l'utilisateur ne le voit/lit pas). Clé = nom de champ
  // `EntrepriseForm`, purgée dès que l'utilisateur retouche ce champ précis.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof EntrepriseForm, string>>>({});
  const [statutJuridique, setStatutJuridique] = useState<string | null>(null);
  const [activiteCategorieId, setActiviteCategorieId] = useState<string | null>(null);
  const [activitePrincipaleId, setActivitePrincipaleId] = useState<string | null>(null);
  const [activitesSecondairesIds, setActivitesSecondairesIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanniere, setUploadingBanniere] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const banniereInputRef = useRef<HTMLInputElement>(null);

  // Catégories/activités — chargées une fois (tables publiques, lecture
  // directe sans risque de RLS quel que soit le statut de l'institution,
  // contrairement à institution_activites — voir api/institution/profile).
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const categorieLabelById: Record<string, string> = Object.fromEntries(categories.map(c => [c.id, c.label]));
  const activiteLabelById: Record<string, string> = Object.fromEntries(activites.map(a => [a.id, a.label]));

  // Sélecteur catégorie/activité/statut_juridique — voir TaxoModal plus bas.
  const [taxoModalOpen, setTaxoModalOpen] = useState(false);
  const [taxoStep, setTaxoStep] = useState<1 | 2 | 3>(1);
  const [pendingStatut, setPendingStatut] = useState<StatutJuridiqueId | "">("");
  const [pendingCategorieId, setPendingCategorieId] = useState<string>("");
  const [pendingActivitePrincipaleId, setPendingActivitePrincipaleId] = useState<string>("");
  const [pendingActivitesSecondairesIds, setPendingActivitesSecondairesIds] = useState<string[]>([]);
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
      const loaded: EntrepriseForm = {
        name: inst?.name || "", ville: inst?.ville || "", quartier: inst?.quartier || "", adresse: inst?.adresse || "",
        description: inst?.description || "", phone: inst?.phone || "", whatsapp: inst?.whatsapp || "",
        email: inst?.email || "", website: inst?.website || "", logo: inst?.logo || "",
        banniere: inst?.banniere || "", annee_creation: inst?.annee_creation || "", capacite: inst?.capacite || "",
        langue: inst?.langue || [],
        horaires: (inst?.horaires && inst.horaires.length) ? inst.horaires : JOURS_DEFAUT,
        latitude: typeof inst?.latitude === "number" ? inst.latitude : null,
        longitude: typeof inst?.longitude === "number" ? inst.longitude : null,
      };
      setForm(loaded);
      setSavedForm(loaded);
      setStatutJuridique(inst?.statut_juridique ?? null);
      setActiviteCategorieId(inst?.activite_categorie_id ?? null);
      setActivitePrincipaleId(inst?.activite_principale_id ?? null);
      setActivitesSecondairesIds(Array.isArray(inst?.activites_secondaires_ids) ? inst.activites_secondaires_ids : []);
      setLoading(false);
    })();
  }, [instId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("activite_categories").select("id,code,label").eq("actif", true).order("ordre");
      setCategories(data ?? []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("activites").select("id,code,label,categorie_id").eq("statut", "active").order("ordre");
      setActivites(data ?? []);
    })();
  }, []);

  const fc = (field: keyof EntrepriseForm, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setFieldErrors(fe => (fe[field] ? { ...fe, [field]: undefined } : fe));
  };
  const dirty = savedForm ? JSON.stringify(form) !== JSON.stringify(savedForm) : false;
  const setPosition = (lat: number, lng: number) => setForm(f => ({ ...f, latitude: lat, longitude: lng }));

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
    const errors: Partial<Record<keyof EntrepriseForm, string>> = {};
    if (!form.name.trim()) errors.name = "Le nom de l'institution est requis.";
    if (!form.ville.trim()) errors.ville = "La ville est requise.";
    const websiteValidation = validerUrlExterne(form.website);
    if (!websiteValidation.valid) errors.website = websiteValidation.error;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      onToast(Object.values(errors)[0] as string, C.red);
      return;
    }
    setFieldErrors({});
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
    setSavedForm(form);
    onToast("Profil entreprise enregistré.", C.green);
  }, [form, onToast]);

  // Ouvre le sélecteur — si statut_juridique est déjà connu, vérifie d'abord
  // si des documents ont été soumis (verrou : les documents requis sont
  // dérivés uniquement de statut_juridique, le changer romprait la cohérence
  // avec ce qui a déjà été examiné). L'API refait cette vérification côté
  // serveur de toute façon — ce contrôle client n'est là que pour l'UX.
  const openTaxoModal = useCallback(async () => {
    setPendingStatut((statutJuridique as StatutJuridiqueId) || "");
    setPendingCategorieId(activiteCategorieId || "");
    setPendingActivitePrincipaleId(activitePrincipaleId || "");
    setPendingActivitesSecondairesIds(activitesSecondairesIds);
    setTaxoStep(1);
    setDocsLocked(false);
    if (statutJuridique) {
      const res = await fetch("/api/institution/documents");
      const j = res.ok ? await res.json().catch(() => null) : null;
      const docs = Array.isArray(j?.documents) ? j.documents as { statut: string | null }[] : [];
      setDocsLocked(docs.some(d => d.statut));
    }
    setTaxoModalOpen(true);
  }, [activiteCategorieId, activitePrincipaleId, activitesSecondairesIds, statutJuridique]);

  const chooseStatut = (id: StatutJuridiqueId) => {
    if (docsLocked) return;
    setPendingStatut(id);
    setTaxoStep(2);
  };

  const selectCategorie = (id: string) => {
    setPendingCategorieId(id);
    setPendingActivitePrincipaleId("");
    setPendingActivitesSecondairesIds([]);
    setTaxoStep(3);
  };

  const selectPrincipale = (id: string) => {
    setPendingActivitePrincipaleId(id);
    setPendingActivitesSecondairesIds(prev => prev.filter(s => s !== id));
  };

  const toggleSecondaire = (id: string) => {
    setPendingActivitesSecondairesIds(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const saveTaxonomy = useCallback(async () => {
    if (!pendingActivitePrincipaleId) return;
    setSavingTaxo(true);
    const res = await fetch("/api/institution/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statut_juridique: pendingStatut,
        activite_categorie_id: pendingCategorieId,
        activite_principale_id: pendingActivitePrincipaleId,
        activites_secondaires_ids: pendingActivitesSecondairesIds,
      }),
    });
    setSavingTaxo(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      onToast(j?.error || "Erreur lors de l'enregistrement.", C.red);
      return;
    }
    setStatutJuridique(pendingStatut);
    setActiviteCategorieId(pendingCategorieId);
    setActivitePrincipaleId(pendingActivitePrincipaleId);
    setActivitesSecondairesIds(pendingActivitesSecondairesIds);
    setTaxoModalOpen(false);
    onToast("Statut juridique et activité enregistrés.", C.green);
  }, [pendingStatut, pendingCategorieId, pendingActivitePrincipaleId, pendingActivitesSecondairesIds, onToast]);

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <YelenLoader size={28}/>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      {/* maxWidth 720px = mobile/tablette (inchangé). ≥1024px : le panneau
          dashboard va jusqu'à 1280px (.yelen-page, page.tsx) — 720px y
          laissait un vide énorme des deux côtés (retour Bryan 21/08/2026),
          même défaut déjà corrigé sur DisponibilitesTab. Élargi à 1000px,
          pas jusqu'à 1280 : au-delà les champs texte en grille 2 colonnes
          deviendraient inutilement larges. */}
      <div className="profil-entreprise-form" style={{ maxWidth: "720px", margin: "0 auto" }}>
        <style>{`
          @media(min-width:1024px){
            .profil-entreprise-form{max-width:1000px!important}
          }
        `}</style>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Profil Entreprise</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Identité publique de votre institution — visible par les citoyens sur Yelen224.
        </p>

        {/* ── Identité visuelle ── */}
        <SectionLabel>Identité visuelle</SectionLabel>
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "18px", marginBottom: "18px" }}>
          <label style={fieldLabel(C)}>Bannière de couverture</label>
          <div onClick={() => banniereInputRef.current?.click()} className="tap" style={{ position: "relative", width: "100%", height: "110px", borderRadius: "14px", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, cursor: "pointer", overflow: "hidden", marginBottom: "16px" }}>
            {form.banniere ? <Image src={form.banniere} alt="" fill sizes="(min-width: 640px) 600px, 100vw" style={{ objectFit: "cover" }}/> : (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>Ajouter une bannière (1200×400px)</span>
              </div>
            )}
            {uploadingBanniere && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={18} color="#fff"/></div>}
            <input ref={banniereInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleBannierePick(f); }}/>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div onClick={() => logoInputRef.current?.click()} className="tap" style={{ width: "64px", height: "64px", borderRadius: "16px", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", overflow: "hidden", position: "relative" }}>
              {form.logo ? <Image src={form.logo} alt="" fill sizes="64px" style={{ objectFit: "cover" }}/> : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              )}
              {uploadingLogo && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={16} color="#fff"/></div>}
              <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoPick(f); }}/>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              {activitePrincipaleId && (
                <span style={{ backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}30`, color: C.gold, fontSize: "11px", fontWeight: "700", padding: "5px 11px", borderRadius: "20px" }}>
                  {activiteLabelById[activitePrincipaleId] || "…"}
                  {activiteCategorieId && categorieLabelById[activiteCategorieId] ? ` — ${categorieLabelById[activiteCategorieId]}` : ""}
                </span>
              )}
              {statutJuridique && (
                <span style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, color: C.t2, fontSize: "11px", fontWeight: "700", padding: "5px 11px", borderRadius: "20px" }}>{STATUT_JURIDIQUE_LABEL_BY_ID[statutJuridique] || statutJuridique}</span>
              )}
              {activitePrincipaleId && statutJuridique && (
                <button onClick={openTaxoModal} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "2px", textDecoration: "underline" }}>
                  Modifier
                </button>
              )}
            </div>
          </div>
        </div>

        {(!activitePrincipaleId || !statutJuridique) && (
          <div style={{ backgroundColor: C.orangeL, border: `1px solid ${C.orange}40`, borderRadius: "14px", padding: "14px 16px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.orange, fontSize: "12.5px", fontWeight: "800" }}>Statut juridique et activité manquants</div>
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
          <FormField C={C} label="Nom officiel" required value={form.name} onChange={v => fc("name", v)} name="name" error={fieldErrors.name}/>
          <div>
            <label style={fieldLabel(C)}>Description publique</label>
            <textarea value={form.description} onChange={e => fc("description", e.target.value)} rows={4} style={{ ...fieldInput(C), resize: "none", lineHeight: 1.6 }}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FormField C={C} label="Année de création" value={form.annee_creation} onChange={v => fc("annee_creation", v)} placeholder="Ex: 1998" name="annee_creation"/>
            <FormField C={C} label="Capacité d'accueil" value={form.capacite} onChange={v => fc("capacite", v)} placeholder="Ex: 50" name="capacite"/>
          </div>
        </div>

        {/* ── Services proposés — déplacé dans l'onglet "Services" (section
             "Offre générale"), pour ne plus cohabiter avec Services payants
             dans deux écrans différents ── */}
        <SectionLabel>Services proposés</SectionLabel>
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "16px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, margin: 0 }}>
            La liste de ce que vous proposez à vos clients se gère maintenant depuis l&apos;onglet <strong style={{ color: C.t1 }}>Services</strong> (section &quot;Offre gratuite&quot;).
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
            <FormField C={C} label="Ville" required value={form.ville} onChange={v => fc("ville", v)} name="ville" autoComplete="address-level2" error={fieldErrors.ville}/>
            <FormField C={C} label="Quartier" value={form.quartier} onChange={v => fc("quartier", v)} name="quartier"/>
          </div>
          <FormField C={C} label="Adresse complète" value={form.adresse} onChange={v => fc("adresse", v)} name="adresse" autoComplete="street-address"/>
          <div>
            <label style={fieldLabel(C)}>Position sur la carte</label>
            <LocationPicker latitude={form.latitude} longitude={form.longitude} ville={form.ville} onChange={setPosition} C={C}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FormField C={C} label="Téléphone" value={form.phone} onChange={v => fc("phone", v)} name="phone" autoComplete="tel"/>
            <FormField C={C} label="WhatsApp" value={form.whatsapp} onChange={v => fc("whatsapp", v)} name="whatsapp" autoComplete="tel"/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FormField C={C} label="Email" type="email" value={form.email} onChange={v => fc("email", v)} name="email" autoComplete="email"/>
            <FormField C={C} label="Site web" type="url" value={form.website} onChange={v => fc("website", v)} name="website" error={fieldErrors.website}/>
          </div>
        </div>

        {/* ── Identité internationale (chantier Taxonomie des activités,
             Phase 4, 20/08/2026) — composant autonome (état/chargement/
             sauvegarde propres), séparé du reste du profil car gouverné par
             une route API dédiée (institution_identite_internationale, RLS
             Pattern C service_role seul) et par une logique de visibilité
             conditionnelle (origine_type) indépendante du formulaire
             principal ci-dessus. ── */}
        <IdentiteInternationaleSection onToast={onToast}/>

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
            Ces horaires déterminent le badge <strong style={{ color: C.blue }}>Ouvert / Fermé</strong> affiché sur votre fiche publique. Ils sont distincts des créneaux de rendez-vous configurés dans l&apos;onglet <strong style={{ color: C.t1 }}>Disponibilités</strong> — les deux restent séparés pour le moment.
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
          <button onClick={handleSave} disabled={saving || !dirty} className="tap" style={{ backgroundColor: saving || !dirty ? C.bg3 : C.gold, color: saving || !dirty ? C.t3 : "#000", border: "none", borderRadius: "12px", padding: "13px 28px", fontSize: "13px", fontWeight: "800", cursor: saving || !dirty ? "not-allowed" : "pointer", boxShadow: saving || !dirty ? "none" : `0 4px 20px ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            {saving ? <><YelenLoader size={14} color={C.t3}/>Sauvegarde…</> : dirty ? "Enregistrer" : "Modifier"}
          </button>
        </div>
      </div>

      <TaxoModal
        open={taxoModalOpen}
        step={taxoStep}
        pendingStatut={pendingStatut}
        categories={categories}
        activites={activites}
        pendingCategorieId={pendingCategorieId}
        pendingActivitePrincipaleId={pendingActivitePrincipaleId}
        pendingActivitesSecondairesIds={pendingActivitesSecondairesIds}
        docsLocked={docsLocked}
        saving={savingTaxo}
        onClose={() => setTaxoModalOpen(false)}
        onChooseStatut={chooseStatut}
        onNextFromStatut={() => setTaxoStep(2)}
        onBackToStatut={() => setTaxoStep(1)}
        onChooseCategorie={selectCategorie}
        onBackToCategorie={() => setTaxoStep(2)}
        onChoosePrincipale={selectPrincipale}
        onToggleSecondaire={toggleSecondaire}
        onSave={saveTaxonomy}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "10px", marginTop: "4px" }}>{children}</div>;
}

const STATUT_PRESENCE_GUINEE_OPTIONS: { id: string; label: string }[] = [
  { id: "societe_guineenne_groupe_etranger", label: "Société guinéenne appartenant à un groupe étranger" },
  { id: "filiale", label: "Filiale d'une société étrangère" },
  { id: "succursale", label: "Succursale d'une société étrangère" },
  { id: "bureau_representation", label: "Bureau de représentation" },
  { id: "prestataire_depuis_etranger", label: "Prestataire opérant depuis l'étranger" },
  { id: "partenariat_representation_locale", label: "Partenariat / représentation locale" },
  { id: "autre_a_verifier", label: "Autre — à examiner par Yelen" },
];

type IdentiteInternationaleForm = {
  pays_origine: string; denomination_legale_officielle: string; nom_commercial_international: string;
  numero_immatriculation_origine: string; type_identifiant_registre: string; nom_registre_origine: string;
  siege_social_origine: string; site_web_officiel: string; type_structure_internationale: string;
  statut_presence_guinee: string; zone_intervention: string;
};

const EMPTY_IDENTITE_FORM: IdentiteInternationaleForm = {
  pays_origine: "", denomination_legale_officielle: "", nom_commercial_international: "",
  numero_immatriculation_origine: "", type_identifiant_registre: "", nom_registre_origine: "",
  siege_social_origine: "", site_web_officiel: "", type_structure_internationale: "",
  statut_presence_guinee: "", zone_intervention: "",
};

// Chantier Taxonomie des activités (Phase 4, 20/08/2026, spec §3ter) — bloc
// "Identité internationale", visible seulement si l'institution se déclare
// origine_type='etrangere'. Aucune publication automatique : la vérification
// réelle passe par le dossier Yelen Trust existant (axe identité,
// app/admin/verification/page.tsx), pas par ce formulaire — voir le contrôle
// ajouté dans api/admin/institutions/[id]/valider/route.ts.
function IdentiteInternationaleSection({ onToast }: { onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [origineType, setOrigineType] = useState<"guinee" | "etrangere">("guinee");
  const [form, setForm] = useState<IdentiteInternationaleForm>(EMPTY_IDENTITE_FORM);
  const [savedForm, setSavedForm] = useState<IdentiteInternationaleForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof IdentiteInternationaleForm, string>>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/institution/identite-internationale");
      const j = res.ok ? await res.json().catch(() => null) : null;
      setOrigineType(j?.origine_type === "etrangere" ? "etrangere" : "guinee");
      const id = j?.identite;
      if (id) {
        const loaded: IdentiteInternationaleForm = {
          pays_origine: id.pays_origine || "", denomination_legale_officielle: id.denomination_legale_officielle || "",
          nom_commercial_international: id.nom_commercial_international || "", numero_immatriculation_origine: id.numero_immatriculation_origine || "",
          type_identifiant_registre: id.type_identifiant_registre || "", nom_registre_origine: id.nom_registre_origine || "",
          siege_social_origine: id.siege_social_origine || "", site_web_officiel: id.site_web_officiel || "",
          type_structure_internationale: id.type_structure_internationale || "", statut_presence_guinee: id.statut_presence_guinee || "",
          zone_intervention: id.zone_intervention || "",
        };
        setForm(loaded);
        setSavedForm(loaded);
      }
      setLoading(false);
    })();
  }, []);

  const fc = (field: keyof IdentiteInternationaleForm, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setFieldErrors(fe => (fe[field] ? { ...fe, [field]: undefined } : fe));
  };
  const dirty = savedForm ? JSON.stringify(form) !== JSON.stringify(savedForm) : false;

  async function changeOrigine(next: "guinee" | "etrangere") {
    setOrigineType(next);
    const res = await fetch("/api/institution/identite-internationale", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origine_type: next }),
    });
    if (!res.ok) { onToast("Erreur lors de l'enregistrement de l'origine.", C.red); return; }
  }

  async function handleSave() {
    const errors: Partial<Record<keyof IdentiteInternationaleForm, string>> = {};
    if (!form.pays_origine.trim()) errors.pays_origine = "Le pays d'origine est requis.";
    if (!form.denomination_legale_officielle.trim()) errors.denomination_legale_officielle = "La dénomination légale officielle est requise.";
    if (!form.statut_presence_guinee) errors.statut_presence_guinee = "Le statut de présence en Guinée est requis.";
    const siteWebValidation = validerUrlExterne(form.site_web_officiel);
    if (!siteWebValidation.valid) errors.site_web_officiel = siteWebValidation.error;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      onToast(Object.values(errors)[0] as string, C.red);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    const res = await fetch("/api/institution/identite-internationale", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      onToast(j?.error || "Erreur lors de l'enregistrement.", C.red);
      return;
    }
    setSavedForm(form);
    onToast("Identité internationale enregistrée.", C.green);
  }

  if (loading) return null;

  return (
    <>
      <SectionLabel>Origine de l&apos;organisation</SectionLabel>
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "18px", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: origineType === "etrangere" ? "18px" : 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "700", marginBottom: "3px" }}>Organisation basée à l&apos;étranger</div>
            <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.5 }}>À activer uniquement si votre organisation opère réellement en Guinée depuis une base à l&apos;étranger.</div>
          </div>
          <div onClick={() => changeOrigine(origineType === "etrangere" ? "guinee" : "etrangere")} className="tap" style={{ width: "44px", height: "25px", borderRadius: "13px", backgroundColor: origineType === "etrangere" ? C.gold : C.bg3, position: "relative", cursor: "pointer", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: "3px", left: origineType === "etrangere" ? "22px" : "3px", width: "19px", height: "19px", borderRadius: "50%", backgroundColor: origineType === "etrangere" ? "#000" : C.t3, transition: "left 0.2s" }}/>
          </div>
        </div>

        {origineType === "etrangere" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ backgroundColor: `${C.blue}0c`, border: `1px solid ${C.blue}25`, borderRadius: "12px", padding: "10px 12px" }}>
              <p style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.55, margin: 0 }}>
                Cette identité sera vérifiée par l&apos;équipe Yelen (axe Identité, voir onglet Documents) avant toute publication publique de votre établissement — aucune organisation étrangère n&apos;est visible sur simple déclaration.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FormField C={C} label="Pays d'origine" required value={form.pays_origine} onChange={v => fc("pays_origine", v)} name="pays_origine" error={fieldErrors.pays_origine}/>
              <FormField C={C} label="Dénomination légale officielle" required value={form.denomination_legale_officielle} onChange={v => fc("denomination_legale_officielle", v)} name="denomination_legale_officielle" error={fieldErrors.denomination_legale_officielle}/>
            </div>
            <FormField C={C} label="Nom commercial international" value={form.nom_commercial_international} onChange={v => fc("nom_commercial_international", v)} name="nom_commercial_international"/>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FormField C={C} label="Numéro d'immatriculation d'origine" value={form.numero_immatriculation_origine} onChange={v => fc("numero_immatriculation_origine", v)} name="numero_immatriculation_origine"/>
              <FormField C={C} label="Type d'identifiant (ex: Company Number)" value={form.type_identifiant_registre} onChange={v => fc("type_identifiant_registre", v)} name="type_identifiant_registre"/>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FormField C={C} label="Registre d'origine (ex: Companies House)" value={form.nom_registre_origine} onChange={v => fc("nom_registre_origine", v)} name="nom_registre_origine"/>
              <FormField C={C} label="Siège social d'origine" value={form.siege_social_origine} onChange={v => fc("siege_social_origine", v)} name="siege_social_origine"/>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FormField C={C} label="Site web officiel" type="url" value={form.site_web_officiel} onChange={v => fc("site_web_officiel", v)} name="site_web_officiel" error={fieldErrors.site_web_officiel}/>
              <FormField C={C} label="Type de structure (ex: société mère)" value={form.type_structure_internationale} onChange={v => fc("type_structure_internationale", v)} name="type_structure_internationale"/>
            </div>

            <div>
              <label style={fieldLabel(C)}>Statut de présence en Guinée *</label>
              <select value={form.statut_presence_guinee} onChange={e => fc("statut_presence_guinee", e.target.value)} style={{ ...fieldInput(C), cursor: "pointer", border: `1px solid ${fieldErrors.statut_presence_guinee ? C.red : C.border}` }}>
                <option value="">Sélectionner…</option>
                {STATUT_PRESENCE_GUINEE_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              {fieldErrors.statut_presence_guinee && (
                <p style={{ color: C.red, fontSize: "11px", fontWeight: "600", margin: "6px 0 0" }}>{fieldErrors.statut_presence_guinee}</p>
              )}
            </div>
            <FormField C={C} label="Zone d'intervention" value={form.zone_intervention} onChange={v => fc("zone_intervention", v)} placeholder="Ex: toute la Guinée, Conakry uniquement, à distance…" name="zone_intervention"/>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleSave} disabled={saving || !dirty} className="tap" style={{ backgroundColor: saving || !dirty ? C.bg3 : C.gold, color: saving || !dirty ? C.t3 : "#000", border: "none", borderRadius: "12px", padding: "12px 24px", fontSize: "13px", fontWeight: "800", cursor: saving || !dirty ? "not-allowed" : "pointer" }}>
                {saving ? "Enregistrement…" : dirty ? "Enregistrer l'identité internationale" : "Modifier"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Sélecteur catégorie/activité/statut_juridique en 3 étapes — bottom-sheet,
// même famille visuelle que le reste du dashboard (thème T, pas les couleurs
// claires codées en dur de app/institution/inscription/page.tsx). Étape 1 =
// statut juridique (verrouillable si docsLocked), étape 2 = catégorie,
// étape 3 = activité principale (+ secondaires optionnelles, jusqu'à 3) —
// sauvegarde par le bouton "Enregistrer" de l'étape 3 (contrairement à
// l'ancien sélecteur secteur qui sauvegardait immédiatement au clic, une
// activité secondaire optionnelle nécessite un vrai bouton de validation).
function TaxoModal({
  open, step, pendingStatut, categories, activites, pendingCategorieId, pendingActivitePrincipaleId, pendingActivitesSecondairesIds,
  docsLocked, saving, onClose, onChooseStatut, onNextFromStatut, onBackToStatut, onChooseCategorie, onBackToCategorie, onChoosePrincipale, onToggleSecondaire, onSave,
}: {
  open: boolean; step: 1 | 2 | 3; pendingStatut: StatutJuridiqueId | "";
  categories: Categorie[]; activites: Activite[];
  pendingCategorieId: string; pendingActivitePrincipaleId: string; pendingActivitesSecondairesIds: string[];
  docsLocked: boolean; saving: boolean; onClose: () => void;
  onChooseStatut: (id: StatutJuridiqueId) => void; onNextFromStatut: () => void; onBackToStatut: () => void;
  onChooseCategorie: (id: string) => void; onBackToCategorie: () => void;
  onChoosePrincipale: (id: string) => void; onToggleSecondaire: (id: string) => void; onSave: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  if (!open) return null;
  const activitesDeLaCategorie = activites.filter(a => a.categorie_id === pendingCategorieId);
  const secondairesDisponibles = activitesDeLaCategorie.filter(a => a.id !== pendingActivitePrincipaleId);
  const stepTitle = step === 1 ? "Statut juridique" : step === 2 ? "Catégorie d'activité" : "Activité principale";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard2, borderRadius: "24px 24px 0 0", maxHeight: "82vh", overflowY: "auto", animation: "slideUp 0.25s ease", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
        <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "100px", margin: "14px auto 0" }}/>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900" }}>{stepTitle}</div>
            <div style={{ color: C.t3, fontSize: "11px", fontWeight: "600", marginTop: "2px" }}>Étape {step} / 3</div>
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
                <button onClick={onNextFromStatut} disabled={!pendingStatut} className="tap" style={{ width: "100%", marginTop: "14px", backgroundColor: pendingStatut ? C.gold : C.bg3, color: pendingStatut ? "#000" : C.t3, border: "none", borderRadius: "12px", padding: "12px", fontSize: "13px", fontWeight: "800", cursor: pendingStatut ? "pointer" : "not-allowed" }}>
                  Suivant
                </button>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <button onClick={onBackToStatut} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer", marginBottom: "14px", padding: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
                Retour
              </button>
              {categories.length === 0 ? (
                <p style={{ color: C.t3, fontSize: "13px" }}>Chargement…</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {categories.map(cat => {
                    const selected = pendingCategorieId === cat.id;
                    const color = ACTIVITE_CATEGORIE_COLORS[cat.code] ?? C.gold;
                    return (
                      <div key={cat.id} onClick={() => onChooseCategorie(cat.id)} className="tap"
                        style={{ padding: "16px 10px", borderRadius: "14px", cursor: "pointer", border: `1.5px solid ${selected ? C.gold : C.border2}`, backgroundColor: selected ? `${C.gold}14` : C.bg3, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", transition: "all 0.2s" }}>
                        <ActiviteCategorieIcon code={cat.code} color={selected ? C.gold : color}/>
                        <span style={{ color: selected ? C.gold : C.t1, fontSize: "12px", fontWeight: selected ? "800" : "600", textAlign: "center" }}>{cat.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <button onClick={onBackToCategorie} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer", marginBottom: "14px", padding: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
                Changer de catégorie
              </button>
              {activitesDeLaCategorie.length === 0 ? (
                <p style={{ color: C.t3, fontSize: "13px" }}>Aucune activité disponible pour cette catégorie pour le moment.</p>
              ) : (
                <>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  {activitesDeLaCategorie.map(a => {
                    const selected = pendingActivitePrincipaleId === a.id;
                    return (
                      <div key={a.id} onClick={() => onChoosePrincipale(a.id)} className="tap"
                        style={{ padding: "13px 16px", borderRadius: "14px", cursor: "pointer", border: `1.5px solid ${selected ? C.gold : C.border2}`, backgroundColor: selected ? `${C.gold}14` : C.bg3, transition: "all 0.2s" }}>
                        <div style={{ color: selected ? C.gold : C.t1, fontSize: "14px", fontWeight: selected ? "800" : "600" }}>{a.label}</div>
                      </div>
                    );
                  })}
                </div>

                {pendingActivitePrincipaleId && secondairesDisponibles.length > 0 && (
                  <details style={{ marginBottom: "16px" }}>
                    <summary style={{ color: C.gold, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                      Activités secondaires (optionnel, jusqu&apos;à 3)
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                      {secondairesDisponibles.map(a => {
                        const checked = pendingActivitesSecondairesIds.includes(a.id);
                        const disabled = !checked && pendingActivitesSecondairesIds.length >= 3;
                        return (
                          <label key={a.id} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "12px", border: `1.5px solid ${checked ? C.gold : C.border2}`, backgroundColor: checked ? `${C.gold}14` : C.bg3, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
                            <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggleSecondaire(a.id)}/>
                            <span style={{ color: C.t1, fontSize: "13px", fontWeight: 600 }}>{a.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                )}

                <button onClick={onSave} disabled={!pendingActivitePrincipaleId || saving} className="tap" style={{ width: "100%", backgroundColor: pendingActivitePrincipaleId ? C.gold : C.bg3, color: pendingActivitePrincipaleId ? "#000" : C.t3, border: "none", borderRadius: "12px", padding: "12px", fontSize: "13px", fontWeight: "800", cursor: pendingActivitePrincipaleId && !saving ? "pointer" : "not-allowed" }}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
