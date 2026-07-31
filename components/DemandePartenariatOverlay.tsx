"use client";

// Formulaire plein écran de demande de partenariat Yelen (chantier
// 26/07/2026). Convention "plein écran, header X + titre" du chantier
// citoyen /chantier-menu-engagement, adaptée à la palette du dashboard
// institution (lib local ../../app/institution/[id]/dashboard/theme.ts
// n'est pas exportable proprement hors du dossier dashboard — ce
// composant vit dans components/ car réutilisé tel quel par PartenariatTab,
// donc ses tokens sont dupliqués ici en dur plutôt que de créer un import
// relatif fragile vers un dossier de route dynamique).
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader } from "@/components/YelenLoader";

const D = {
  dark:  { bg: "#0A0A0F", bgCard: "#111118", bgCard2: "#16161F", border: "rgba(255,255,255,0.07)", t1: "#FFFFFF", t2: "#9999B3", t3: "#55556A", gold: "#F5A623", goldD: "#B87D1A", red: "#FF4757" },
  light: { bg: "#F5F5F8", bgCard: "#FFFFFF", bgCard2: "#F0F0F5", border: "rgba(10,10,18,0.08)", t1: "#0A0A12", t2: "#47475C", t3: "#767686", gold: "#F5A623", goldD: "#B87D1A", red: "#D62839" },
} as const;

const CATEGORIES = [
  { key: "telecom_media",  label: "Télécom & Média" },
  { key: "commerce_pme",   label: "Commerce & PME" },
  { key: "service_public", label: "Services publics" },
  { key: "evenement",      label: "Événements" },
  { key: "autre",          label: "Autre" },
];

const EMPTY = {
  description_organisation: "", type_offres: "", impact_communaute: "",
  categorie: CATEGORIES[0].key, contact_nom: "", contact_email: "",
  contact_telephone: "", infos_complementaires: "", conditions_acceptees: false,
};

export function DemandePartenariatOverlay({ instId, onClose, onSubmitted }: {
  instId: string; onClose: () => void; onSubmitted: () => void;
}) {
  const { theme } = useTheme();
  const C = D[theme];
  const [profil, setProfil] = useState<{ name: string; secteur: string; ville: string; website: string } | null>(null);
  const [loadingProfil, setLoadingProfil] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/institution/profile?institution_id=${instId}`)
      .then(r => r.json())
      .then(j => setProfil(j?.institution ? { name: j.institution.name, secteur: j.institution.secteur, ville: j.institution.ville, website: j.institution.website } : null))
      .finally(() => setLoadingProfil(false));
  }, [instId]);

  const siteWebManquant = !loadingProfil && !profil?.website?.trim();

  async function submit() {
    setError(null);
    if (!form.description_organisation.trim() || !form.type_offres.trim() || !form.impact_communaute.trim() || !form.contact_nom.trim() || !form.contact_email.trim()) {
      setError("Merci de compléter tous les champs requis.");
      return;
    }
    if (!form.conditions_acceptees) {
      setError("Vous devez accepter les conditions du partenariat pour soumettre votre demande.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/institution/partenariat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const j = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) { setError(j?.error || "Une erreur est survenue."); return; }
    onSubmitted();
  }

  const inputStyle = {
    width: "100%", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "10px",
    padding: "11px 13px", color: C.t1, fontSize: "13.5px", marginBottom: "14px",
  };
  const labelStyle = { color: C.t2, fontSize: "11.5px", fontWeight: 700, marginBottom: "6px", display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.bgCard2, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h1 style={{ color: C.t1, fontSize: "16px", fontWeight: 900, margin: 0 }}>Demande de partenariat Yelen</h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px", maxWidth: "620px", width: "100%", margin: "0 auto" }}>
        {loadingProfil ? (
          <div style={{ color: C.t2, fontSize: "13px", textAlign: "center", padding: "40px 0" }}>Chargement du profil…</div>
        ) : siteWebManquant ? (
          <div style={{ background: `${C.red}12`, border: `1px solid ${C.red}40`, borderRadius: "14px", padding: "18px" }}>
            <div style={{ color: C.red, fontWeight: 800, fontSize: "14px", marginBottom: "6px" }}>Site web requis</div>
            <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
              Un site web officiel doit être renseigné dans votre Profil Entreprise avant de pouvoir soumettre une
              demande de partenariat. Rendez-vous dans l&apos;onglet Profil Entreprise, ajoutez votre site web, puis
              revenez ici.
            </p>
          </div>
        ) : (
          <>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "20px" }}>
              <div style={{ color: C.t2, fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>Informations de votre profil (auto-remplies)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "13px" }}>
                <div><span style={{ color: C.t3 }}>Organisation : </span><span style={{ color: C.t1, fontWeight: 700 }}>{profil?.name}</span></div>
                <div><span style={{ color: C.t3 }}>Ville : </span><span style={{ color: C.t1, fontWeight: 700 }}>{profil?.ville}</span></div>
                <div style={{ gridColumn: "1 / -1" }}><span style={{ color: C.t3 }}>Site web : </span><span style={{ color: C.t1, fontWeight: 700 }}>{profil?.website}</span></div>
              </div>
            </div>

            <label style={labelStyle}>Description de votre organisation *</label>
            <textarea style={{ ...inputStyle, minHeight: "70px", resize: "vertical" as const }} value={form.description_organisation} onChange={e => setForm(f => ({ ...f, description_organisation: e.target.value }))}/>

            <label style={labelStyle}>Type d&apos;offres envisagées *</label>
            <textarea style={{ ...inputStyle, minHeight: "60px", resize: "vertical" as const }} placeholder="Ex. remises ponctuelles, lancement de nouveaux services, promotions saisonnières…" value={form.type_offres} onChange={e => setForm(f => ({ ...f, type_offres: e.target.value }))}/>

            <label style={labelStyle}>Impact attendu pour la communauté *</label>
            <textarea style={{ ...inputStyle, minHeight: "60px", resize: "vertical" as const }} value={form.impact_communaute} onChange={e => setForm(f => ({ ...f, impact_communaute: e.target.value }))}/>

            <label style={labelStyle}>Catégorie</label>
            <select style={inputStyle} value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
              <div>
                <label style={labelStyle}>Nom du contact *</label>
                <input style={inputStyle} value={form.contact_nom} onChange={e => setForm(f => ({ ...f, contact_nom: e.target.value }))}/>
              </div>
              <div>
                <label style={labelStyle}>Téléphone du contact</label>
                <input style={inputStyle} value={form.contact_telephone} onChange={e => setForm(f => ({ ...f, contact_telephone: e.target.value }))}/>
              </div>
            </div>
            <label style={labelStyle}>Email du contact *</label>
            <input style={inputStyle} type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}/>

            <label style={labelStyle}>Informations complémentaires</label>
            <textarea style={{ ...inputStyle, minHeight: "60px", resize: "vertical" as const }} value={form.infos_complementaires} onChange={e => setForm(f => ({ ...f, infos_complementaires: e.target.value }))}/>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: "6px 0 18px", cursor: "pointer" }}>
              <input type="checkbox" checked={form.conditions_acceptees} onChange={e => setForm(f => ({ ...f, conditions_acceptees: e.target.checked }))} style={{ marginTop: "2px" }}/>
              J&apos;accepte les conditions du programme de partenariat Yelen et je confirme que les informations
              fournies sont exactes.
            </label>

            {error && <div style={{ color: C.red, fontSize: "12.5px", marginBottom: "14px" }}>{error}</div>}

            <button
              onClick={submit}
              disabled={submitting}
              style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: `linear-gradient(135deg,${C.gold},${C.goldD})`, color: "#080812", fontWeight: 900, fontSize: "14px", cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.75 : 1, marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
            >
              {submitting ? <YelenLoader size={18} color="#080812"/> : "Soumettre ma demande"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
