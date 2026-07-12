"use client";

// Onglet Profil Responsable — identité de la personne responsable de
// l'établissement, séparée du profil entreprise (voir ProfilEntrepriseTab.tsx).
// Table dédiée institution_responsables (migration 20260711000002), pré-remplie
// depuis institutions.responsable_prenom/nom/role (collecté à l'onboarding)
// pour les institutions déjà inscrites au moment de la migration.
import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "../theme";

type ResponsableForm = { prenom: string; nom: string; role: string; phone: string; email: string; photo_url: string };

export function ProfilResponsableTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
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
    if (!res.ok) { onToast(j?.error || "Échec de l'envoi de la photo.", T.red); return; }
    fc("photo_url", j.url as string);
  };

  const handleSave = useCallback(async () => {
    if (!form.prenom.trim()) { onToast("Le prénom est requis.", T.red); return; }
    if (!form.nom.trim()) { onToast("Le nom est requis.", T.red); return; }
    setSaving(true);
    const res = await fetch("/api/institution/responsable", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      onToast(j?.error || "Erreur lors de l'enregistrement.", T.red);
      return;
    }
    onToast("Profil responsable enregistré.", T.green);
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
        <div style={{ width: "28px", height: "28px", border: `2px solid ${T.gold}20`, borderTopColor: T.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Profil Responsable</h1>
        <p style={{ color: T.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Vos informations personnelles en tant que responsable de l'établissement — distinctes du profil public de l'entreprise.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", backgroundColor: T.bgCard, border: `1px solid ${T.border2}`, borderRadius: "18px", padding: "18px", marginBottom: "18px" }}>
          <div onClick={() => photoInputRef.current?.click()} className="tap" style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: T.bg3, border: `1.5px dashed ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", overflow: "hidden", position: "relative" }}>
            {form.photo_url ? <img src={form.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : (
              <span style={{ color: T.gold, fontSize: "20px", fontWeight: "900" }}>{(form.prenom[0] || "") + (form.nom[0] || "")}</span>
            )}
            {uploading && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/></div>}
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoPick(f); }}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: T.t1, fontSize: "16px", fontWeight: "800" }}>{form.prenom || form.nom ? `${form.prenom} ${form.nom}`.trim() : "Responsable"}</div>
            {form.role && <div style={{ color: T.t3, fontSize: "12px", marginTop: "2px" }}>{form.role}</div>}
          </div>
        </div>

        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Prénom *</label>
              <input value={form.prenom} onChange={e => fc("prenom", e.target.value)} style={fieldInput}/>
            </div>
            <div>
              <label style={fieldLabel}>Nom *</label>
              <input value={form.nom} onChange={e => fc("nom", e.target.value)} style={fieldInput}/>
            </div>
          </div>
          <div>
            <label style={fieldLabel}>Rôle dans l'institution</label>
            <input value={form.role} onChange={e => fc("role", e.target.value)} placeholder="Ex: Directeur, Gérant, Responsable accueil…" style={fieldInput}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Téléphone personnel</label>
              <input value={form.phone} onChange={e => fc("phone", e.target.value)} style={fieldInput}/>
            </div>
            <div>
              <label style={fieldLabel}>Email personnel</label>
              <input type="email" value={form.email} onChange={e => fc("email", e.target.value)} style={fieldInput}/>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleSave} disabled={btnDisabled} className="tap" style={{
            backgroundColor: btnDisabled ? T.bg3 : isSaved ? T.bgCard : T.gold,
            color: btnDisabled ? T.t3 : isSaved ? T.t1 : "#000",
            border: isSaved && !btnDisabled ? `1.5px solid ${T.border2}` : "none",
            borderRadius: "12px", padding: "13px 28px", fontSize: "13px", fontWeight: "800",
            cursor: btnDisabled ? "not-allowed" : "pointer",
            boxShadow: (btnDisabled || isSaved) ? "none" : `0 4px 20px ${T.gold}40`,
          }}>
            {saving ? "Sauvegarde…" : isSaved ? "Modifier" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = { color: T.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" };
const fieldInput: React.CSSProperties = { width: "100%", backgroundColor: T.bg3, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "11px 13px", color: T.t1, fontSize: "13px", fontFamily: "inherit" };
