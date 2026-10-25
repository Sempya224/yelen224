"use client";

// Onglet Profil Responsable — identité de la personne responsable de
// l'établissement, séparée du profil entreprise (voir ProfilEntrepriseTab.tsx).
// Table dédiée institution_responsables (migration 20260711000002), pré-remplie
// depuis institutions.responsable_prenom/nom/role (collecté à l'onboarding)
// pour les institutions déjà inscrites au moment de la migration.
//
// Structure alignée sur ProfilEntrepriseTab (19/10/2026) : sections
// "label à gauche / carte à droite" (ProfileSection), suivi des champs
// modifiés (useDirtyForm), barre d'enregistrement sticky (SaveBar). Aucun
// champ ni aucune règle d'API ajoutés — présentation uniquement.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { T, type ThemeTokens } from "../theme";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader } from "@/components/YelenLoader";
import { FormField, ModifiedMark } from "./FormField";
import { HelpCenterGuide } from "./HelpCenterGuide";
import { ProfileSection } from "./ProfileSection";
import { SaveBar, FormStatusIndicator } from "./SaveBar";
import { useDirtyForm } from "./useDirtyForm";

type ResponsableForm = { prenom: string; nom: string; role: string; phone: string; email: string; photo_url: string };

const EMPTY_FORM: ResponsableForm = { prenom: "", nom: "", role: "", phone: "", email: "", photo_url: "" };

export function ProfilResponsableTab({ instId, onToast, access = "full" }: { instId: string; onToast: (msg: string, color?: string) => void; access?: "full" | "read" }) {
  const readOnly = access === "read";
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const {
    values: form, setValues: setForm, init: initForm, dirtyFields, flashFields, status: saveStatus,
    setSaving: setSavingState, lastSavedAt, markSaved, markError, reset: cancelChanges,
  } = useDirtyForm<ResponsableForm>(EMPTY_FORM);
  const saving = saveStatus === "saving";
  const isModified = (f: keyof ResponsableForm) => dirtyFields.has(f);
  const isFlashing = (f: keyof ResponsableForm) => flashFields.has(f);
  // Même principe que ProfilEntrepriseTab : bordure rouge sur le champ requis
  // manquant, en plus du toast, purgée dès que le champ est retouché.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ResponsableForm, string>>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/institution/responsable");
      const j = res.ok ? await res.json().catch(() => null) : null;
      const loaded: ResponsableForm = j?.responsable
        ? {
            prenom: j.responsable.prenom || "", nom: j.responsable.nom || "", role: j.responsable.role || "",
            phone: j.responsable.phone || "", email: j.responsable.email || "", photo_url: j.responsable.photo_url || "",
          }
        : EMPTY_FORM;
      initForm(loaded);
      setLoading(false);
    })();
  }, [instId, initForm]);

  const fc = (field: keyof ResponsableForm, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setFieldErrors(fe => (fe[field] ? { ...fe, [field]: undefined } : fe));
  };
  const annuler = useCallback(() => { cancelChanges(); setFieldErrors({}); }, [cancelChanges]);

  // Upload via route service_role — storage.objects n'a pas de policy RLS
  // pour les institutions (pas de session Supabase Auth), un upload direct
  // depuis le client échoue avec "new row violates row-level security
  // policy". Voir api/institution/upload/route.ts.
  const handlePhotoPick = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "responsable_photo");
    const res = await fetch("/api/institution/upload", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    setUploading(false);
    if (!res.ok) { onToast(j?.error || "Échec de l'envoi de la photo.", C.red); return; }
    fc("photo_url", j.url as string);
  };

  const handleSave = useCallback(async () => {
    const errors: Partial<Record<keyof ResponsableForm, string>> = {};
    if (!form.prenom.trim()) errors.prenom = "Le prénom est requis.";
    if (!form.nom.trim()) errors.nom = "Le nom est requis.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      onToast(Object.values(errors)[0] as string, C.red);
      return;
    }
    setFieldErrors({});
    setSavingState(true);
    let res: Response;
    try {
      res = await fetch("/api/institution/responsable", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } catch {
      setSavingState(false);
      markError();
      onToast("L'enregistrement a échoué. Vérifiez votre connexion puis réessayez.", C.red);
      return;
    }
    setSavingState(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      markError();
      onToast(j?.error || "Erreur lors de l'enregistrement.", C.red);
      return;
    }
    markSaved(form);
    onToast("Profil responsable enregistré.", C.green);
  }, [form, onToast, C.red, C.green, setSavingState, markError, markSaved]);

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <YelenLoader size={28}/>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      {/* Même gabarit que ProfilEntrepriseTab : 720px mobile/tablette, 1000px
          et grille label/carte dès 1024px. La règle .profil-section est
          redéclarée ici à l'identique (ProfileSection ne l'embarque pas, voir
          son en-tête) pour ne pas dépendre du montage de l'autre onglet. */}
      <div className="profil-responsable-form" style={{ maxWidth: "720px", margin: "0 auto" }}>
        <style>{`
          .profil-section{display:flex;flex-direction:column;gap:12px;margin-bottom:32px}
          @media(min-width:1024px){
            .profil-responsable-form{max-width:1000px!important}
            .profil-section{display:grid!important;grid-template-columns:260px 1fr!important;gap:32px!important;align-items:start!important}
          }
        `}</style>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "6px" }}>
          <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px" }}>Profil Responsable</h1>
          <HelpCenterGuide tab="profil-responsable" />
        </div>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "10px", lineHeight: 1.5 }}>
          Vos informations personnelles en tant que responsable de l&apos;établissement — distinctes du profil public de l&apos;entreprise.
        </p>
        {!readOnly && <FormStatusIndicator status={saveStatus} count={dirtyFields.size} lastSavedAt={lastSavedAt}/>}

        {/* ── Identité ── */}
        <ProfileSection title="Identité" description="Photo, nom et rôle au sein de l'établissement." cardPadding="18px">
          {isModified("photo_url") && <div style={{ marginBottom: "10px", marginLeft: "-8px" }}><ModifiedMark C={C}/></div>}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div onClick={() => !readOnly && photoInputRef.current?.click()} className="tap" style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: readOnly ? "default" : "pointer", overflow: "hidden", position: "relative" }}>
              {form.photo_url ? <Image src={form.photo_url} alt="" fill sizes="64px" style={{ objectFit: "cover" }}/> : (
                <span style={{ color: C.gold, fontSize: "20px", fontWeight: "800" }}>{(form.prenom[0] || "") + (form.nom[0] || "")}</span>
              )}
              {uploading && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={16} color="#fff"/></div>}
              {!readOnly && <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoPick(f); }}/>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800" }}>{form.prenom || form.nom ? `${form.prenom} ${form.nom}`.trim() : "Responsable"}</div>
              {form.role && <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{form.role}</div>}
            </div>
          </div>

          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FormField C={C} label="Prénom" required value={form.prenom} onChange={v => fc("prenom", v)} disabled={readOnly} name="prenom" autoComplete="given-name" error={fieldErrors.prenom} modified={isModified("prenom")} justSaved={isFlashing("prenom")} readOnly={saving}/>
              <FormField C={C} label="Nom" required value={form.nom} onChange={v => fc("nom", v)} disabled={readOnly} name="nom" autoComplete="family-name" error={fieldErrors.nom} modified={isModified("nom")} justSaved={isFlashing("nom")} readOnly={saving}/>
            </div>
            <FormField C={C} label="Rôle dans l'institution" value={form.role} onChange={v => fc("role", v)} placeholder="Ex: Directeur, Gérant, Responsable accueil…" disabled={readOnly} name="role" modified={isModified("role")} justSaved={isFlashing("role")} readOnly={saving}/>
          </div>
        </ProfileSection>

        {/* ── Coordonnées ── */}
        <ProfileSection title="Coordonnées personnelles" description="Moyens de joindre le responsable, distincts des coordonnées publiques de l'entreprise." cardPadding="16px">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FormField C={C} label="Téléphone personnel" value={form.phone} onChange={v => fc("phone", v)} disabled={readOnly} name="phone" autoComplete="tel" modified={isModified("phone")} justSaved={isFlashing("phone")} readOnly={saving}/>
            <FormField C={C} label="Email personnel" type="email" value={form.email} onChange={v => fc("email", v)} disabled={readOnly} name="email" autoComplete="email" modified={isModified("email")} justSaved={isFlashing("email")} readOnly={saving}/>
          </div>
        </ProfileSection>

        {!readOnly && <SaveBar status={saveStatus} count={dirtyFields.size} onSave={handleSave} onCancel={annuler}/>}
      </div>
    </div>
  );
}
