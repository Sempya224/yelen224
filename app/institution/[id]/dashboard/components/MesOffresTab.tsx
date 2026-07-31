"use client";

// Onglet "Mes offres" — gestion des offres du partenaire (chantier
// 26/07/2026). Accessible uniquement une fois institutions.
// partenaire_statut='approuve' (filtré côté nav dans page.tsx). Chaque
// offre est rédigée ici par le partenaire, jamais par Yelen — la
// modération admin (app/admin/offres) décide de la publication.
// Lot design 26/07/2026 : ajout des lignes de faits (clé/valeur, carte
// citoyenne) et des listes avantages/limites (onglets Pros/Cons de la
// fiche détail) — cf. migration 20260726000011_offres_faits_avantages.
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader } from "@/components/YelenLoader";
import { T, type ThemeTokens } from "../theme";
import { OFFRE_GENRES, OFFRE_GENRE_LABELS } from "@/lib/offresCategories";

type Fait = { label: string; valeur: string };

type Offre = {
  id: string; titre: string; description_courte: string; description_longue: string;
  categorie: string; genre: string; partenaire_logo: string | null; cta_label: string | null; cta_url: string | null;
  statut: string; motif_refus: string | null; nb_clics: number; created_at: string;
  faits: Fait[]; avantages: string[]; limites: string[];
};

const CATEGORIES = [
  { key: "telecom_media",  label: "Télécom & Média" },
  { key: "commerce_pme",   label: "Commerce & PME" },
  { key: "service_public", label: "Services publics" },
  { key: "evenement",      label: "Événements" },
  { key: "autre",          label: "Autre" },
];

const MAX_FAITS = 4;

const EMPTY_FORM = {
  titre: "", description_courte: "", description_longue: "", categorie: CATEGORIES[0].key,
  genre: OFFRE_GENRES[0] as string,
  cta_label: "", cta_url: "",
  faits: [] as Fait[], avantages: [] as string[], limites: [] as string[],
};

export function MesOffresTab({ instId, onToast, access }: {
  instId: string; onToast: (msg: string, color?: string) => void; access: "full" | "read";
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [items, setItems] = useState<Offre[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [avantageDraft, setAvantageDraft] = useState("");
  const [limiteDraft, setLimiteDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/institution/offres`);
    const j = await res.json().catch(() => null);
    setItems(res.ok ? (j ?? []) : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true); }
  function openEdit(o: Offre) {
    setEditingId(o.id);
    setForm({
      titre: o.titre, description_courte: o.description_courte, description_longue: o.description_longue,
      categorie: o.categorie, genre: o.genre || OFFRE_GENRES[0], cta_label: o.cta_label || "", cta_url: o.cta_url || "",
      faits: o.faits || [], avantages: o.avantages || [], limites: o.limites || [],
    });
    setFormOpen(true);
  }

  async function submitForm(soumettre: boolean) {
    setSaving(true);
    const body: Record<string, unknown> = { ...form };
    if (soumettre) body.action = "soumettre";
    const res = editingId
      ? await fetch(`/api/institution/offres/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch(`/api/institution/offres`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Erreur", C.red); return; }
    if (soumettre && !editingId && j?.id) {
      await fetch(`/api/institution/offres/${j.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "soumettre" }) });
    }
    setFormOpen(false);
    onToast(soumettre ? "Offre soumise à la modération Yelen" : "Brouillon enregistré", C.green);
    load();
  }

  async function action(id: string, act: "suspendre" | "archiver" | "soumettre") {
    setBusyId(id);
    const res = await fetch(`/api/institution/offres/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: act }) });
    setBusyId(null);
    if (res.ok) { onToast("Mise à jour effectuée", C.green); load(); }
  }

  async function supprimer(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/institution/offres/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) setItems(prev => prev.filter(o => o.id !== id));
  }

  function addFait() {
    if (form.faits.length >= MAX_FAITS) return;
    setForm(f => ({ ...f, faits: [...f.faits, { label: "", valeur: "" }] }));
  }
  function updateFait(i: number, key: "label" | "valeur", value: string) {
    setForm(f => ({ ...f, faits: f.faits.map((ft, idx) => idx === i ? { ...ft, [key]: value } : ft) }));
  }
  function removeFait(i: number) {
    setForm(f => ({ ...f, faits: f.faits.filter((_, idx) => idx !== i) }));
  }
  function addAvantage() {
    if (!avantageDraft.trim()) return;
    setForm(f => ({ ...f, avantages: [...f.avantages, avantageDraft.trim()] }));
    setAvantageDraft("");
  }
  function addLimite() {
    if (!limiteDraft.trim()) return;
    setForm(f => ({ ...f, limites: [...f.limites, limiteDraft.trim()] }));
    setLimiteDraft("");
  }

  const STATUT_INFO: Record<string, { label: string; color: string }> = {
    brouillon:             { label: "Brouillon",       color: C.t2 },
    en_attente_validation: { label: "En modération",   color: C.orange },
    publiee:               { label: "Publiée",         color: C.green },
    refusee:               { label: "Refusée",         color: C.red },
    suspendue:             { label: "Suspendue",        color: C.orange },
    archivee:              { label: "Archivée",         color: C.t3 },
  };

  const inputStyle = { width: "100%", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 13px", color: C.t1, fontSize: "13px", marginBottom: "12px" };
  const labelStyle = { color: C.t2, fontSize: "11.5px", fontWeight: 700, marginBottom: "5px", display: "block" };

  return (
    <div style={{ padding: "16px", maxWidth: "820px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h1 style={{ color: C.t1, fontSize: "20px", fontWeight: 900, margin: 0 }}>Mes offres</h1>
        {access === "full" && (
          <button onClick={openCreate} style={{ background: `linear-gradient(135deg,${C.gold},${C.goldD})`, border: "none", color: "#080812", fontWeight: 800, fontSize: "13px", padding: "10px 18px", borderRadius: "10px", cursor: "pointer" }}>
            + Nouvelle offre
          </button>
        )}
      </div>

      {formOpen && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px", marginBottom: "20px" }}>
          <h2 style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "14px" }}>{editingId ? "Modifier l'offre" : "Nouvelle offre"}</h2>
          <label style={labelStyle}>Titre</label>
          <input style={inputStyle} value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}/>
          <label style={labelStyle}>Description courte (carte)</label>
          <input style={inputStyle} value={form.description_courte} onChange={e => setForm(f => ({ ...f, description_courte: e.target.value }))}/>
          <label style={labelStyle}>Description longue (détail)</label>
          <textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" as const }} value={form.description_longue} onChange={e => setForm(f => ({ ...f, description_longue: e.target.value }))}/>

          {/* Lignes de faits — max 4, affichées sur la carte citoyenne.
              Placeholders avec exemple concret dans les champs eux-mêmes
              (pas seulement au-dessus du groupe) : des prestataires
              entraient des nombres bruts sans aucun libellé compréhensible
              pour le citoyen (retour Bryan 26/07/2026). */}
          <label style={labelStyle}>Lignes de faits — décrivez ce que le citoyen doit comprendre, pas juste un chiffre — max {MAX_FAITS}</label>
          {form.faits.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input placeholder={`Ex : "Frais d'inscription"`} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={f.label} onChange={e => updateFait(i, "label", e.target.value)}/>
              <input placeholder={`Ex : "8 000 GNF"`} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={f.valeur} onChange={e => updateFait(i, "valeur", e.target.value)}/>
              <button onClick={() => removeFait(i)} style={{ background: C.redL, border: `1px solid ${C.red}30`, color: C.red, borderRadius: "8px", padding: "0 12px", cursor: "pointer" }}>×</button>
            </div>
          ))}
          {form.faits.length < MAX_FAITS && (
            <button onClick={addFait} style={{ background: "none", border: `1px dashed ${C.border}`, color: C.t2, fontSize: "12px", fontWeight: 700, padding: "8px", borderRadius: "8px", cursor: "pointer", width: "100%", marginBottom: "12px" }}>
              + Ajouter une ligne de fait
            </button>
          )}

          {/* Avantages / Limites — onglets Pros/Cons de la fiche détail */}
          <label style={labelStyle}>Avantages (onglet "Avantages" du détail)</label>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={avantageDraft} onChange={e => setAvantageDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAvantage(); } }}/>
            <button onClick={addAvantage} style={{ background: C.greenL, border: `1px solid ${C.green}30`, color: C.green, borderRadius: "8px", padding: "0 14px", cursor: "pointer", fontWeight: 700 }}>+</button>
          </div>
          {form.avantages.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
              {form.avantages.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bgCard2, borderRadius: "8px", padding: "7px 10px", fontSize: "12.5px", color: C.t1 }}>
                  <span>{a}</span>
                  <button onClick={() => setForm(f => ({ ...f, avantages: f.avantages.filter((_, idx) => idx !== i) }))} style={{ background: "none", border: "none", color: C.t2, cursor: "pointer" }}>×</button>
                </div>
              ))}
            </div>
          )}

          <label style={labelStyle}>Limites (onglet "Limites" du détail)</label>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={limiteDraft} onChange={e => setLimiteDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLimite(); } }}/>
            <button onClick={addLimite} style={{ background: C.orangeL, border: `1px solid ${C.orange}30`, color: C.orange, borderRadius: "8px", padding: "0 14px", cursor: "pointer", fontWeight: 700 }}>+</button>
          </div>
          {form.limites.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
              {form.limites.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bgCard2, borderRadius: "8px", padding: "7px 10px", fontSize: "12.5px", color: C.t1 }}>
                  <span>{l}</span>
                  <button onClick={() => setForm(f => ({ ...f, limites: f.limites.filter((_, idx) => idx !== i) }))} style={{ background: "none", border: "none", color: C.t2, cursor: "pointer" }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <div>
              <label style={labelStyle}>Genre d&apos;offre — ce que le citoyen verra en premier</label>
              <select style={inputStyle} value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}>
                {OFFRE_GENRES.map(g => <option key={g} value={g}>{OFFRE_GENRE_LABELS[g]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Catégorie</label>
              <select style={inputStyle} value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <label style={labelStyle}>Libellé du bouton</label>
          <input style={inputStyle} value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))}/>
          <label style={labelStyle}>Lien externe vers votre offre (obligatoire pour soumettre)</label>
          <input style={inputStyle} value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))}/>
          <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
            <button onClick={() => submitForm(false)} disabled={saving || !form.titre} style={{ background: C.bgCard2, border: `1px solid ${C.border}`, color: C.t1, fontWeight: 700, fontSize: "13px", padding: "10px 18px", borderRadius: "10px", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
              {saving ? <YelenLoader size={15} color={C.t1}/> : "Enregistrer en brouillon"}
            </button>
            <button onClick={() => submitForm(true)} disabled={saving || !form.titre || !form.description_courte || !form.description_longue || !form.cta_url} style={{ background: `linear-gradient(135deg,${C.gold},${C.goldD})`, border: "none", color: "#080812", fontWeight: 800, fontSize: "13px", padding: "10px 18px", borderRadius: "10px", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
              {saving ? <YelenLoader size={15} color="#080812"/> : "Soumettre à Yelen"}
            </button>
            <button onClick={() => setFormOpen(false)} style={{ background: "none", border: "none", color: C.t2, fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: C.t2, fontSize: "13px", textAlign: "center", padding: "40px 0" }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "32px", textAlign: "center", color: C.t2, fontSize: "13px" }}>
          Aucune offre pour le moment.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {items.map(o => {
            const si = STATUT_INFO[o.statut] ?? { label: o.statut, color: C.t2 };
            return (
              <div key={o.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <span style={{ color: si.color, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px" }}>{si.label}</span>
                  <span style={{ color: C.t2, fontSize: "10px", fontWeight: 700, background: C.bgCard2, padding: "2px 8px", borderRadius: "20px" }}>{OFFRE_GENRE_LABELS[o.genre as keyof typeof OFFRE_GENRE_LABELS] || o.genre}</span>
                  <span style={{ color: C.t3, fontSize: "11px" }}>{o.nb_clics} clic{o.nb_clics > 1 ? "s" : ""}</span>
                </div>
                <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "2px" }}>{o.titre}</div>
                <div style={{ color: C.t2, fontSize: "12.5px", marginBottom: "10px" }}>{o.description_courte}</div>
                {o.statut === "refusee" && o.motif_refus && (
                  <div style={{ color: C.red, fontSize: "12px", marginBottom: "10px" }}>Motif : {o.motif_refus}</div>
                )}
                {access === "full" && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {(o.statut === "brouillon" || o.statut === "refusee") && (
                      <button onClick={() => openEdit(o)} style={{ background: C.blueL, border: `1px solid ${C.blue}30`, color: C.blue, fontSize: "12px", fontWeight: 700, padding: "7px 13px", borderRadius: "8px", cursor: "pointer" }}>Modifier</button>
                    )}
                    {o.statut === "publiee" && (
                      <button onClick={() => action(o.id, "suspendre")} disabled={busyId === o.id} style={{ background: C.orangeL, border: `1px solid ${C.orange}30`, color: C.orange, fontSize: "12px", fontWeight: 700, padding: "7px 13px", borderRadius: "8px", cursor: busyId === o.id ? "default" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>{busyId === o.id ? <YelenLoader size={13} color={C.orange}/> : "Suspendre"}</button>
                    )}
                    {o.statut === "suspendue" && (
                      <button onClick={() => action(o.id, "soumettre")} disabled={busyId === o.id} style={{ background: C.greenL, border: `1px solid ${C.green}30`, color: C.green, fontSize: "12px", fontWeight: 700, padding: "7px 13px", borderRadius: "8px", cursor: busyId === o.id ? "default" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>{busyId === o.id ? <YelenLoader size={13} color={C.green}/> : "Republier (modération)"}</button>
                    )}
                    {o.statut !== "archivee" && (
                      <button onClick={() => action(o.id, "archiver")} disabled={busyId === o.id} style={{ background: C.bgCard2, border: `1px solid ${C.border}`, color: C.t2, fontSize: "12px", fontWeight: 700, padding: "7px 13px", borderRadius: "8px", cursor: busyId === o.id ? "default" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>{busyId === o.id ? <YelenLoader size={13} color={C.t2}/> : "Archiver"}</button>
                    )}
                    {o.statut === "brouillon" && (
                      <button onClick={() => supprimer(o.id)} disabled={busyId === o.id} style={{ background: C.redL, border: `1px solid ${C.red}30`, color: C.red, fontSize: "12px", fontWeight: 700, padding: "7px 13px", borderRadius: "8px", cursor: busyId === o.id ? "default" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>{busyId === o.id ? <YelenLoader size={13} color={C.red}/> : "Supprimer"}</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
