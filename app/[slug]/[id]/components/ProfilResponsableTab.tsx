"use client";

// Onglet Profil Responsable — identité de la personne responsable de
// l'établissement, séparée du profil entreprise (voir ProfilEntrepriseTab.tsx).
// Table dédiée institution_responsables (migration 20260711000002), pré-remplie
// depuis institutions.responsable_prenom/nom/role (collecté à l'onboarding)
// pour les institutions déjà inscrites au moment de la migration.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { T, type ThemeTokens } from "../theme";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader } from "@/components/YelenLoader";
import { FormField } from "./FormField";

type ResponsableForm = { prenom: string; nom: string; role: string; phone: string; email: string; photo_url: string };

export function ProfilResponsableTab({ instId, onToast, access = "full" }: { instId: string; onToast: (msg: string, color?: string) => void; access?: "full" | "read" }) {
  const readOnly = access === "read";
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [form, setForm] = useState<ResponsableForm>({ prenom: "", nom: "", role: "", phone: "", email: "", photo_url: "" });
  const [baseline, setBaseline] = useState<ResponsableForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        : { prenom: "", nom: "", role: "", phone: "", email: "", photo_url: "" };
      setForm(loaded);
      setBaseline(loaded);
      setLoading(false);
    })();
  }, [instId]);

  const fc = (field: keyof ResponsableForm, value: string) => setForm(f => ({ ...f, [field]: value }));

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
    if (!form.prenom.trim()) { onToast("Le prénom est requis.", C.red); return; }
    if (!form.nom.trim()) { onToast("Le nom est requis.", C.red); return; }
    setSaving(true);
    const res = await fetch("/api/institution/responsable", {
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
    onToast("Profil responsable enregistré.", C.green);
    setBaseline(form);
  }, [form, onToast]);

  // Bouton : "Enregistrer" tant qu'il y a une saisie en attente (isDirty),
  // "Modifier" une fois sauvegardé et sans changement depuis — état neutre,
  // pas désactivé (resoumettre des données identiques est un no-op inoffensif
  // côté API). Désactivé uniquement quand les champs requis manquent, pas
  // selon isDirty : sinon un profil déjà sauvegardé dont on efface un champ
  // requis resterait "cliquable" sans pouvoir réellement enregistrer l'état
  // invalide.
  const requiredOk = form.prenom.trim() !== "" && form.nom.trim() !== "";
  const isDirty = baseline !== null && JSON.stringify(form) !== JSON.stringify(baseline);
  const isSaved = !isDirty && requiredOk;
  const btnDisabled = saving || !requiredOk;

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <YelenLoader size={28}/>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Profil Responsable</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Vos informations personnelles en tant que responsable de l&apos;établissement — distinctes du profil public de l&apos;entreprise.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "18px", marginBottom: "18px" }}>
          <div onClick={() => !readOnly && photoInputRef.current?.click()} className="tap" style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: readOnly ? "default" : "pointer", overflow: "hidden", position: "relative" }}>
            {form.photo_url ? <Image src={form.photo_url} alt="" fill sizes="64px" style={{ objectFit: "cover" }}/> : (
              <span style={{ color: C.gold, fontSize: "20px", fontWeight: "900" }}>{(form.prenom[0] || "") + (form.nom[0] || "")}</span>
            )}
            {uploading && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={16} color="#fff"/></div>}
            {!readOnly && <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoPick(f); }}/>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800" }}>{form.prenom || form.nom ? `${form.prenom} ${form.nom}`.trim() : "Responsable"}</div>
            {form.role && <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{form.role}</div>}
          </div>
        </div>

        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FormField C={C} label="Prénom" required value={form.prenom} onChange={v => fc("prenom", v)} disabled={readOnly} name="prenom" autoComplete="given-name"/>
            <FormField C={C} label="Nom" required value={form.nom} onChange={v => fc("nom", v)} disabled={readOnly} name="nom" autoComplete="family-name"/>
          </div>
          <FormField C={C} label="Rôle dans l'institution" value={form.role} onChange={v => fc("role", v)} placeholder="Ex: Directeur, Gérant, Responsable accueil…" disabled={readOnly} name="role"/>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FormField C={C} label="Téléphone personnel" value={form.phone} onChange={v => fc("phone", v)} disabled={readOnly} name="phone" autoComplete="tel"/>
            <FormField C={C} label="Email personnel" type="email" value={form.email} onChange={v => fc("email", v)} disabled={readOnly} name="email" autoComplete="email"/>
          </div>
        </div>

        {!readOnly && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleSave} disabled={btnDisabled} className="tap" style={{
            backgroundColor: btnDisabled ? C.bg3 : isSaved ? C.bgCard : C.gold,
            color: btnDisabled ? C.t3 : isSaved ? C.t1 : "#000",
            border: isSaved && !btnDisabled ? `1.5px solid ${C.border2}` : "none",
            borderRadius: "12px", padding: "13px 28px", fontSize: "13px", fontWeight: "800",
            cursor: btnDisabled ? "not-allowed" : "pointer",
            boxShadow: (btnDisabled || isSaved) ? "none" : `0 4px 20px ${C.gold}40`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            {saving ? <><YelenLoader size={14} color={C.t3}/>Sauvegarde…</> : isSaved ? "Modifier" : "Enregistrer"}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
