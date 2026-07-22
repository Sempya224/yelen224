"use client";

// Onglet Services — catalogue de services payants niveau SaaS Enterprise
// (spec CEO 16/07/2026 : titre, KPI, sélecteur, action principale, recherche/
// filtres, tableau desktop / cartes mobile, pagination, bloc encouragement).
// Catégorie = colonne réelle `paid_services.categorie` (migration
// 20260720000002), dropdown basé sur la taxonomie SECTEURS déjà utilisée pour
// institutions.secteur (lib/institutionTaxonomy.tsx) + option "Autre" texte
// libre — pas de nouvelle liste inventée. Statut = mappé sur le booléen réel
// is_active (Actif/Suspendu), pas un enum à 4 valeurs qui n'existe pas en base.
import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { SECTEURS, SERVICES_PAR_SECTEUR, type SecteurId } from "@/lib/institutionTaxonomy";

// Lot C (refonte wizard RDV citoyen, 16/07/2026) : champs demandés au
// citoyen à la réservation, configurés par l'institution — jamais imposés
// par Yelen. Type partagé entre les services payants (colonne réelle
// paid_services.champs_complementaires, migration 20260720000006) et l'offre
// générale (vit directement dans chaque entrée de institutions.services,
// déjà un jsonb flexible, aucune colonne dédiée nécessaire).
type ChampComplementaire = { label: string; type: "texte" | "tel" | "numero"; requis: boolean };

type PaidService = {
  id: string;
  institution_id: string;
  nom: string;
  prix: number;
  duree_minutes: number;
  description: string | null;
  categorie: string | null;
  champs_complementaires: ChampComplementaire[];
  is_active: boolean;
  created_at: string;
  taux_taxe: number;
  prix_promo: number | null;
  promo_actif: boolean;
};

type PaidBooking = {
  id: string;
  service_id: string;
  citoyen_id: string;
  institution_id: string;
  date_rdv: string;
  heure_rdv: string;
  confirmation_code: string;
  statut: string;
  created_at: string;
  citoyen_nom?: string;
  citoyen_phone?: string;
};

type StatutFilter = "tous" | "actif" | "suspendu";
type SortBy = "recent" | "nom" | "prix";
type CategoryColorKey = "green" | "blue" | "purple" | "orange" | "teal" | "red";

const CATEGORIE_AUTRE = "Autre (préciser)";
const CATEGORIE_OPTIONS = [...SECTEURS.map(s => s.label), CATEGORIE_AUTRE];

const SECTEUR_COLOR: Record<string, CategoryColorKey> = {
  "Santé": "red", "Administratif": "blue", "Financier": "green", "Juridique": "purple",
  "Beauté / Bien-être": "teal", "Commerce": "orange", "Artisanat": "orange", "Services divers": "teal",
};

function hashColor(s: string): CategoryColorKey {
  const palette: CategoryColorKey[] = ["green", "blue", "purple", "orange", "teal", "red"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function categoryColor(label: string | null, C: ThemeTokens): { c: string; bg: string } {
  if (!label) return { c: C.t3, bg: C.bg3 };
  const key = SECTEUR_COLOR[label] ?? hashColor(label);
  const map: Record<CategoryColorKey, { c: string; bg: string }> = {
    green: { c: C.green, bg: C.greenL }, blue: { c: C.blue, bg: C.blueL },
    purple: { c: C.purple, bg: C.purpleL }, orange: { c: C.orange, bg: C.orangeL },
    teal: { c: C.teal, bg: C.tealL }, red: { c: C.red, bg: C.redL },
  };
  return map[key];
}

function monthKey(d: Date): number { return d.getFullYear() * 12 + d.getMonth(); }
function isThisMonth(iso: string): boolean { return monthKey(new Date(iso)) === monthKey(new Date()); }
function isLastMonth(iso: string): boolean { return monthKey(new Date(iso)) === monthKey(new Date()) - 1; }

function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " FCFA";
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}
function statutInfo(s: string, C: ThemeTokens) {
  switch (s) {
    case "en_attente": return { c: C.orange, bg: C.orangeL, l: "En attente" };
    case "confirme":   return { c: C.green,  bg: C.greenL,  l: "Confirmé" };
    case "termine":    return { c: C.blue,   bg: C.blueL,   l: "Terminé" };
    case "no_show":    return { c: C.red,    bg: C.redL,    l: "No-show" };
    case "annule":     return { c: C.red,    bg: C.redL,    l: "Annulé" };
    default:           return { c: C.t3,     bg: C.bg3,     l: s };
  }
}

function selectStyle(C: ThemeTokens): React.CSSProperties {
  return { height: "44px", padding: "0 12px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", color: C.t1, fontSize: "13px", fontWeight: 600, cursor: "pointer" };
}
function squareBtn(C: ThemeTokens): React.CSSProperties {
  return { width: "32px", height: "32px", borderRadius: "9px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };
}
function pageBtnStyle(C: ThemeTokens, disabled: boolean): React.CSSProperties {
  return { width: "32px", height: "32px", borderRadius: "9px", border: `1px solid ${C.border}`, backgroundColor: C.bgCard, color: C.t2, fontSize: "13px", fontWeight: 700, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" };
}

const CHAMP_TYPES: { value: ChampComplementaire["type"]; label: string }[] = [
  { value: "texte", label: "Texte" }, { value: "tel", label: "Téléphone" }, { value: "numero", label: "Numéro/référence" },
];

// Builder partagé services payants (ServiceForm) / offre générale
// (OffreGeneraleSection) — Lot C, refonte wizard RDV citoyen. Chaque champ
// ajouté sera demandé au citoyen à l'étape "Informations complémentaires" du
// wizard, seulement si ce service en a au moins un.
function ChampsComplementairesBuilder({ champs, onChange, C }: { champs: ChampComplementaire[]; onChange: (next: ChampComplementaire[]) => void; C: ThemeTokens }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ChampComplementaire["type"]>("texte");
  const [requis, setRequis] = useState(true);

  function add() {
    const l = label.trim();
    if (!l) return;
    onChange([...champs, { label: l, type, requis }]);
    setLabel(""); setType("texte"); setRequis(true);
  }
  function remove(i: number) { onChange(champs.filter((_, idx) => idx !== i)); }

  const inputStyle: React.CSSProperties = { flex: 1, backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "9px 12px", fontSize: "12.5px", color: C.t1, fontFamily: "inherit" };

  return (
    <div>
      <label style={{ display: "block", color: C.t2, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>
        Informations demandées au citoyen <span style={{ fontWeight: "500", textTransform: "none", fontSize: "10px" }}>(facultatif)</span>
      </label>
      {champs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
          {champs.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "8px 10px" }}>
              <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700, flex: 1 }}>{c.label}</span>
              <span style={{ color: C.t3, fontSize: "10.5px" }}>{CHAMP_TYPES.find(t => t.value === c.type)?.label}{c.requis ? " · requis" : ""}</span>
              <button onClick={() => remove(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "6px" }}>
        <input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Ex: Numéro client" style={inputStyle}/>
        <select value={type} onChange={e => setType(e.target.value as ChampComplementaire["type"])} style={{ ...inputStyle, flex: "0 0 auto", width: "120px", cursor: "pointer" }}>
          {CHAMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={() => setRequis(r => !r)} title="Obligatoire ?" style={{ flexShrink: 0, backgroundColor: requis ? C.blueL : C.bg3, border: `1.5px solid ${requis ? C.blue + "50" : C.border}`, color: requis ? C.blue : C.t3, borderRadius: "10px", padding: "0 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>Requis</button>
        <button onClick={add} className="tap" style={{ flexShrink: 0, backgroundColor: C.bgCard, border: `1.5px solid ${C.border2}`, color: C.t1, borderRadius: "10px", padding: "0 14px", fontWeight: 800, fontSize: "12.5px", cursor: "pointer" }}>+</button>
      </div>
    </div>
  );
}

function Toast({ msg, color, onDismiss }: { msg: string; color: string; onDismiss: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  useEffect(() => { const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div onClick={onDismiss} style={{ position: "fixed", top: "70px", left: "50%", transform: "translateX(-50%)", zIndex: 999, backgroundColor: C.bgCard2, border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: "14px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "fadeUp 0.22s ease", cursor: "pointer", minWidth: "220px", maxWidth: "calc(100vw - 32px)" }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }}/>
      <span style={{ color: C.t1, fontSize: "12px", fontWeight: "700", flex: 1 }}>{msg}</span>
    </div>
  );
}

function KpiIcon({ name, color }: { name: "wallet" | "calendar" | "check" | "trending"; color: string }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none" as const, stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "wallet":   return <svg {...p}><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "check":    return <svg {...p}><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>;
    case "trending": return <svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
  }
}

function KpiCard({ label, value, color, bg, icon, delta }: { label: string; value: string; color: string; bg: string; icon: "wallet" | "calendar" | "check" | "trending"; delta: string | null }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: "20px", display: "flex", alignItems: "flex-start", gap: "14px" }}>
      <div style={{ width: "52px", height: "52px", borderRadius: "50%", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <KpiIcon name={icon} color={color}/>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.t1, fontSize: "26px", fontWeight: 900, letterSpacing: "-0.6px", lineHeight: 1.1 }}>{value}</div>
        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "6px" }}>{label}</div>
        {delta && (
          <div style={{ color: C.green, fontSize: "11px", fontWeight: 700, marginTop: "6px", display: "flex", alignItems: "center", gap: "3px" }}>
            {delta}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceActionsMenu({ service, isOpen, onToggle, onClose, onEdit, onDuplicate, onToggleActive, onDelete, togglingActive, showToggleActive, direction = "down" }: {
  service: PaidService; isOpen: boolean; onToggle: () => void; onClose: () => void;
  onEdit: () => void; onDuplicate: () => void; onToggleActive: () => void; onDelete: () => void;
  togglingActive: boolean; showToggleActive: boolean; direction?: "down" | "up";
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div style={{ display: "flex", gap: "6px", justifyContent: "center", position: "relative" }}>
      <button onClick={onEdit} className="tap" title="Modifier" style={squareBtn(C)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
      </button>
      <button onClick={onDuplicate} className="tap" title="Dupliquer" style={squareBtn(C)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button onClick={onToggle} className="tap" title="Plus d'actions" style={squareBtn(C)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={C.t2} stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button>
      {isOpen && (
        <>
          <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
          <div style={{ position: "absolute", [direction === "down" ? "top" : "bottom"]: "calc(100% + 6px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", overflow: "hidden", minWidth: "180px", animation: "fadeUp 0.15s ease" }}>
            {showToggleActive && (
              <>
                <button onClick={onToggleActive} disabled={togglingActive} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                  {service.is_active ? "Désactiver" : "Activer"}
                </button>
                <div style={{ height: "1px", backgroundColor: C.border }}/>
              </>
            )}
            <button onClick={onDelete} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.red, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
              Supprimer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ServiceForm({ onSave, onCancel, saving, initial }: {
  onSave: (d: { nom: string; prix: number; duree_minutes: number; description: string; categorie: string | null; champs_complementaires: ChampComplementaire[]; taux_taxe: number; prix_promo: number | null; promo_actif: boolean }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  initial?: PaidService | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [nom, setNom]     = useState(initial?.nom ?? "");
  const [prix, setPrix]   = useState(initial ? String(initial.prix) : "");
  const [duree, setDuree] = useState(initial ? String(initial.duree_minutes) : "");
  const [desc, setDesc]   = useState(initial?.description ?? "");
  const [champs, setChamps] = useState<ChampComplementaire[]>(initial?.champs_complementaires ?? []);
  const [tauxTaxe, setTauxTaxe] = useState(initial ? String(initial.taux_taxe ?? 0) : "0");
  const [prixPromo, setPrixPromo] = useState(initial?.prix_promo != null ? String(initial.prix_promo) : "");
  const [promoActif, setPromoActif] = useState(initial?.promo_actif ?? false);
  const initialKnown = !!(initial?.categorie && CATEGORIE_OPTIONS.includes(initial.categorie) && initial.categorie !== CATEGORIE_AUTRE);
  const [categorieSel, setCategorieSel]       = useState(initial?.categorie ? (initialKnown ? initial.categorie : CATEGORIE_AUTRE) : "");
  const [categorieCustom, setCategorieCustom] = useState(initial?.categorie && !initialKnown ? initial.categorie : "");
  const [err, setErr]     = useState("");
  const isEdit = !!initial;

  async function submit() {
    setErr("");
    if (!nom.trim())                            { setErr("Le nom est obligatoire"); return; }
    if (!prix || isNaN(+prix) || +prix <= 0)    { setErr("Entrez un prix valide en FCFA (ex: 5000)"); return; }
    if (!duree || isNaN(+duree) || +duree <= 0) { setErr("Entrez une durée valide en minutes (ex: 30)"); return; }
    if (tauxTaxe && (isNaN(+tauxTaxe) || +tauxTaxe < 0)) { setErr("Le taux de taxe doit être un nombre positif"); return; }
    if (promoActif && (!prixPromo || isNaN(+prixPromo) || +prixPromo <= 0)) { setErr("Entrez un prix promotionnel valide"); return; }
    const categorieFinal = categorieSel === CATEGORIE_AUTRE ? (categorieCustom.trim() || null) : (categorieSel || null);
    await onSave({
      nom: nom.trim(), prix: +prix, duree_minutes: +duree, description: desc.trim(), categorie: categorieFinal, champs_complementaires: champs,
      taux_taxe: tauxTaxe ? +tauxTaxe : 0, prix_promo: promoActif && prixPromo ? +prixPromo : null, promo_actif: promoActif,
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border}`,
    borderRadius: "12px", padding: "12px 14px", fontSize: "14px", color: C.t1, fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = { display: "block", color: C.t2, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <div>
          <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900", letterSpacing: "-0.3px" }}>{isEdit ? "Modifier le service" : "Nouveau service payant"}</div>
          <div style={{ color: C.t3, fontSize: "11px", marginTop: "1px" }}>Visible sur votre fiche profil</div>
        </div>
      </div>

      <div className="svc-form-fields">
        <div className="svc-form-span2">
          <label style={labelStyle}>Nom du service *</label>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Consultation médicale, Coupe homme, Massage…" style={inputStyle}/>
        </div>

        <div>
          <label style={labelStyle}>Catégorie</label>
          <select value={categorieSel} onChange={e => setCategorieSel(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="">Sans catégorie</option>
            {CATEGORIE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {categorieSel === CATEGORIE_AUTRE && (
            <input value={categorieCustom} onChange={e => setCategorieCustom(e.target.value)} placeholder="Précisez la catégorie…" style={{ ...inputStyle, marginTop: "8px" }}/>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={labelStyle}>Prix (FCFA) *</label>
            <input type="number" value={prix} onChange={e => setPrix(e.target.value)} placeholder="5000" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Durée (min) *</label>
            <input type="number" value={duree} onChange={e => setDuree(e.target.value)} placeholder="30" style={inputStyle}/>
          </div>
        </div>

        <div className="svc-form-span2">
          <label style={labelStyle}>
            Description <span style={{ fontWeight: "500", textTransform: "none", fontSize: "10px" }}>(facultatif)</span>
          </label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Décrivez brièvement ce service pour les clients…" rows={3} style={{ ...inputStyle, resize: "none", lineHeight: 1.65 }}/>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={labelStyle}>Taux de taxe (%)</label>
            <input type="number" value={tauxTaxe} onChange={e => setTauxTaxe(e.target.value)} placeholder="0" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>
              <span onClick={() => setPromoActif(v => !v)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "28px", height: "16px", borderRadius: "10px", backgroundColor: promoActif ? C.gold : C.bg3, position: "relative", display: "inline-block", border: `1px solid ${promoActif ? C.gold : C.border2}`, transition: "background-color 0.15s" }}>
                  <span style={{ position: "absolute", top: "1px", left: promoActif ? "13px" : "1px", width: "12px", height: "12px", borderRadius: "50%", backgroundColor: promoActif ? "#000" : C.t3, transition: "left 0.15s" }}/>
                </span>
                Prix promo actif
              </span>
            </label>
            <input type="number" value={prixPromo} onChange={e => setPrixPromo(e.target.value)} disabled={!promoActif} placeholder="Prix réduit" style={{ ...inputStyle, opacity: promoActif ? 1 : 0.5 }}/>
          </div>
        </div>

        <div className="svc-form-span2">
          <ChampsComplementairesBuilder champs={champs} onChange={setChamps} C={C}/>
        </div>

        <div className="svc-form-span2" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`, borderRadius: "12px", padding: "11px 14px", display: "flex", gap: "10px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style={{ color: C.t2, fontSize: "11px", lineHeight: 1.65 }}>
            Le client sera clairement informé que ce RDV est <strong style={{ color: C.gold }}>payant — paiement sur place</strong>. Un code de confirmation Yelen à 6 chiffres sera généré.
          </div>
        </div>

        {err && (
          <div className="svc-form-span2" style={{ backgroundColor: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", padding: "10px 14px", borderRadius: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {err}
          </div>
        )}

        <div className="svc-form-span2" style={{ display: "grid", gridTemplateColumns: "1fr 1.7fr", gap: "10px" }}>
          <button onClick={onCancel} className="tap" style={{ backgroundColor: C.bg3, color: C.t2, fontWeight: "700", fontSize: "14px", padding: "14px", borderRadius: "14px", border: `1.5px solid ${C.border2}`, cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={saving} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "900", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", opacity: saving ? 0.7 : 1 }}>
            {saving ? <div style={{ width: "14px", height: "14px", border: "2px solid rgba(0,0,0,0.3)", borderTopColor: "#000", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            {saving ? (isEdit ? "Enregistrement…" : "Création…") : (isEdit ? "Enregistrer les modifications" : "Créer le service")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ServiceFormSheet({ target, onSave, onCancel, saving }: {
  target: "new" | PaidService; onSave: (d: { nom: string; prix: number; duree_minutes: number; description: string; categorie: string | null; champs_complementaires: ChampComplementaire[]; taux_taxe: number; prix_promo: number | null; promo_actif: boolean }) => Promise<void>; onCancel: () => void; saving: boolean;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div className="svc-form-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onCancel}>
      <style>{`
        .svc-form-fields{display:flex;flex-direction:column;gap:14px}
        @media(min-width:1024px){
          .svc-form-overlay{align-items:center!important}
          .svc-form-panel{max-width:720px!important;border-radius:20px!important;max-height:90svh!important}
          .svc-form-grip{display:none!important}
          .svc-form-close-x{display:flex!important}
          .svc-form-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px}
          .svc-form-span2{grid-column:1/-1}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="svc-form-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: "560px", maxHeight: "90svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div className="svc-form-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
        <button onClick={onCancel} className="svc-form-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <ServiceForm onSave={onSave} onCancel={onCancel} saving={saving} initial={target === "new" ? null : target}/>
      </div>
    </div>
  );
}

function EncourageIllustration({ C }: { C: ThemeTokens }) {
  return (
    <svg width="180" height="130" viewBox="0 0 180 130" fill="none">
      <rect x="8" y="50" width="60" height="60" rx="10" fill={`${C.gold}18`} stroke={C.gold} strokeWidth="1.5"/>
      <path d="M18 50l4-16h32l4 16" stroke={C.gold} strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
      <rect x="70" y="30" width="46" height="32" rx="6" fill={`${C.blue}18`} stroke={C.blue} strokeWidth="1.5"/>
      <line x1="70" y1="42" x2="116" y2="42" stroke={C.blue} strokeWidth="1.5"/>
      <rect x="122" y="60" width="50" height="50" rx="8" fill={`${C.green}18`} stroke={C.green} strokeWidth="1.5"/>
      <line x1="132" y1="72" x2="162" y2="72" stroke={C.green} strokeWidth="1.5"/>
      <line x1="132" y1="84" x2="152" y2="84" stroke={C.green} strokeWidth="1.5"/>
      <circle cx="95" cy="95" r="16" fill={`${C.purple}18`} stroke={C.purple} strokeWidth="1.5"/>
      <circle cx="95" cy="90" r="4.5" fill={C.purple}/>
      <path d="M87 104c0-5 4-8 8-8s8 3 8 8" fill="none" stroke={C.purple} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ServiceRow({ service, resaCount, resaDelta, menuOpen, onMenuToggle, onMenuClose, onEdit, onDuplicate, onToggleActive, onDelete, toggling }: {
  service: PaidService; resaCount: number; resaDelta: number; menuOpen: boolean;
  onMenuToggle: () => void; onMenuClose: () => void; onEdit: () => void; onDuplicate: () => void; onToggleActive: () => void; onDelete: () => void; toggling: boolean;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const cat = categoryColor(service.categorie, C);
  return (
    <tr className="svc-row" style={{ borderBottom: `1px solid ${C.border}` }}>
      <td style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "11px", backgroundColor: `${C.gold}15`, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800 }}>{service.nom}</div>
            {service.description && <div style={{ color: C.t3, fontSize: "11.5px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "240px" }}>{service.description}</div>}
          </div>
        </div>
      </td>
      <td style={{ padding: "14px 16px" }}>
        <span style={{ backgroundColor: cat.bg, color: cat.c, fontSize: "10.5px", fontWeight: 800, padding: "4px 10px", borderRadius: "20px", whiteSpace: "nowrap" }}>{service.categorie || "Non classé"}</span>
      </td>
      <td style={{ padding: "14px 16px", textAlign: "center", color: C.t1, fontSize: "13px", fontWeight: 800 }}>{formatPrix(service.prix)}</td>
      <td style={{ padding: "14px 16px", textAlign: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "12.5px", fontWeight: 700 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>
          {service.duree_minutes} min
        </span>
      </td>
      <td style={{ padding: "14px 16px", textAlign: "center" }}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>{resaCount}</div>
        {resaDelta > 0 && <div style={{ color: C.green, fontSize: "10.5px", fontWeight: 700, marginTop: "1px" }}>+{resaDelta}</div>}
      </td>
      <td style={{ padding: "14px 16px", textAlign: "center" }}>
        <span style={{ backgroundColor: service.is_active ? C.greenL : C.bg3, color: service.is_active ? C.green : C.t3, fontSize: "10.5px", fontWeight: 800, padding: "4px 10px", borderRadius: "20px" }}>{service.is_active ? "Actif" : "Suspendu"}</span>
      </td>
      <td style={{ padding: "14px 16px" }}>
        <ServiceActionsMenu service={service} isOpen={menuOpen} onToggle={onMenuToggle} onClose={onMenuClose} onEdit={onEdit} onDuplicate={onDuplicate} onToggleActive={onToggleActive} onDelete={onDelete} togglingActive={toggling} showToggleActive/>
      </td>
    </tr>
  );
}

function ServiceCardMobile({ service, bookings, resaDelta, menuOpen, onMenuToggle, onMenuClose, onToggleActive, onEdit, onDuplicate, onDelete, toggling }: {
  service: PaidService; bookings: PaidBooking[]; resaDelta: number; menuOpen: boolean;
  onMenuToggle: () => void; onMenuClose: () => void; onToggleActive: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; toggling: boolean;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [expanded, setExpanded] = useState(false);
  const cat = categoryColor(service.categorie, C);
  const nbTotal     = bookings.length;
  const nbConfirmes = bookings.filter(b => ["confirme", "termine"].includes(b.statut)).length;
  const nbAttente   = bookings.filter(b => b.statut === "en_attente").length;

  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1.5px solid ${service.is_active ? C.border2 : C.border}`, marginBottom: "12px", overflow: "hidden", opacity: service.is_active ? 1 : 0.6 }}>
      <div style={{ height: "3px", background: service.is_active ? `linear-gradient(90deg, ${C.gold}, ${C.goldL}, ${C.gold})` : C.border }}/>
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
          <div style={{ width: "46px", height: "46px", borderRadius: "14px", background: service.is_active ? `${C.gold}18` : C.bg3, border: `1.5px solid ${service.is_active ? C.border2 : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={service.is_active ? C.gold : C.t3} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "15px", fontWeight: 900, marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{service.nom}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ color: C.gold, fontSize: "16px", fontWeight: 900 }}>{formatPrix(service.prix)}</span>
              <span style={{ color: C.t3, fontSize: "11px" }}>·</span>
              <span style={{ color: C.t3, fontSize: "12px", fontWeight: 600 }}>{service.duree_minutes} min</span>
            </div>
            <span style={{ display: "inline-block", marginTop: "6px", backgroundColor: cat.bg, color: cat.c, fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px" }}>{service.categorie || "Non classé"}</span>
          </div>
          <div onClick={onToggleActive} className="tap" style={{ width: "44px", height: "25px", borderRadius: "13px", backgroundColor: service.is_active ? C.gold : C.bg3, position: "relative", cursor: "pointer", flexShrink: 0, opacity: toggling ? 0.5 : 1, transition: "background-color 0.3s" }}>
            <div style={{ position: "absolute", top: "3px", left: service.is_active ? "22px" : "3px", width: "19px", height: "19px", borderRadius: "50%", backgroundColor: service.is_active ? "#000" : C.t3, transition: "left 0.25s ease" }}/>
          </div>
        </div>

        {service.description && (
          <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.65, marginBottom: "12px", padding: "9px 12px", backgroundColor: C.bg3, borderRadius: "10px", border: `1px solid ${C.border}` }}>{service.description}</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "12px" }}>
          {[
            { label: "Réservations", value: nbTotal,     color: C.blue },
            { label: "Confirmés",    value: nbConfirmes, color: C.green },
            { label: "En attente",   value: nbAttente,   color: nbAttente > 0 ? C.orange : C.t3 },
          ].map(m => (
            <div key={m.label} style={{ backgroundColor: C.bg3, borderRadius: "11px", padding: "9px", textAlign: "center", border: `1px solid ${C.border}` }}>
              <div style={{ color: m.color, fontSize: "16px", fontWeight: 900, lineHeight: 1 }}>{m.value}</div>
              <div style={{ color: C.t3, fontSize: "8.5px", fontWeight: 700, marginTop: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{m.label}</div>
            </div>
          ))}
        </div>
        {resaDelta > 0 && <div style={{ color: C.green, fontSize: "10.5px", fontWeight: 700, marginBottom: "10px" }}>+{resaDelta} réservation{resaDelta > 1 ? "s" : ""} ce mois</div>}

        <div style={{ display: "flex", gap: "8px", marginBottom: nbTotal > 0 ? "10px" : 0 }}>
          <button onClick={onEdit} className="tap" style={{ flex: 1, backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, color: C.t1, fontWeight: 700, fontSize: "12px", padding: "10px", borderRadius: "11px", cursor: "pointer" }}>Modifier</button>
          <button onClick={onDuplicate} className="tap" style={{ flex: 1, backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, color: C.t1, fontWeight: 700, fontSize: "12px", padding: "10px", borderRadius: "11px", cursor: "pointer" }}>Dupliquer</button>
          <ServiceActionsMenu service={service} isOpen={menuOpen} onToggle={onMenuToggle} onClose={onMenuClose} onEdit={onEdit} onDuplicate={onDuplicate} onToggleActive={onToggleActive} onDelete={onDelete} togglingActive={toggling} showToggleActive={false} direction="up"/>
        </div>

        {nbTotal > 0 && (
          <button onClick={() => setExpanded(e => !e)} className="tap" style={{ width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, color: C.gold, fontWeight: 700, fontSize: "12px", padding: "10px", borderRadius: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round">{expanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}</svg>
            {expanded ? "Masquer" : `Voir ${nbTotal} RDV`}
          </button>
        )}
      </div>

      {expanded && nbTotal > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, animation: "fadeUp 0.22s ease" }}>
          <div style={{ padding: "12px 16px 8px", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.7px" }}>Réservations — {service.nom}</div>
          {bookings.map((b, i) => {
            const si = statutInfo(b.statut, C);
            return (
              <div key={b.id} style={{ padding: "11px 16px", borderBottom: i < bookings.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "900", color: C.gold, flexShrink: 0, border: `1px solid ${C.border}` }}>{(b.citoyen_nom || "C").slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.citoyen_nom || "Citoyen"}</div>
                  <div style={{ color: C.t3, fontSize: "11px", marginTop: "1px" }}>{formatDate(b.date_rdv)} · {b.heure_rdv}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                  <span style={{ backgroundColor: si.bg, color: si.c, fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "20px", textTransform: "uppercase" }}>{si.l}</span>
                  <span style={{ color: C.t3, fontSize: "10px", fontFamily: "monospace", letterSpacing: "1.5px", backgroundColor: C.bg3, padding: "2px 7px", borderRadius: "6px", border: `1px solid ${C.border}` }}>#{b.confirmation_code}</span>
                </div>
              </div>
            );
          })}
          <div style={{ padding: "8px" }}/>
        </div>
      )}
    </div>
  );
}

type OffreService = { nom: string; description: string; duree_minutes: number; champs_complementaires: ChampComplementaire[] };

// Convertit une entrée quelconque venue de la base (ancien format : simple
// string ; nouveau format : objet structuré) vers OffreService — rétro-
// compatible avec les libellés déjà enregistrés cette semaine, avant que
// cette structure n'existe (Lot A, refonte wizard RDV, 16/07/2026).
function toOffreService(raw: unknown): OffreService | null {
  if (typeof raw === "string") {
    const nom = raw.trim();
    return nom ? { nom, description: "", duree_minutes: 0, champs_complementaires: [] } : null;
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const nom = String(o.nom ?? "").trim();
    if (!nom) return null;
    return {
      nom,
      description: typeof o.description === "string" ? o.description : "",
      duree_minutes: typeof o.duree_minutes === "number" ? o.duree_minutes : 0,
      champs_complementaires: Array.isArray(o.champs_complementaires) ? o.champs_complementaires as ChampComplementaire[] : [],
    };
  }
  return null;
}

// Offre générale — ce que l'institution propose, structuré (nom + description
// + durée) depuis le Lot A (refonte wizard RDV côté citoyen, 16/07/2026) : le
// wizard affiche chaque service — gratuit ou payant — comme une carte
// complète, impossible avec de simples libellés texte. Colonne réelle
// institutions.services (jsonb), gérée via /api/institution/profile déjà
// existant (service_role + JWT), aucun changement de schéma nécessaire (le
// contrat applicatif change, pas la colonne). Sauvegarde immédiate à chaque
// ajout/retrait/modification. Couleur bleue partout (le doré est réservé à
// la marque/aux services payants).
function OffreGeneraleSection({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [services, setServices] = useState<OffreService[]>([]);
  const [secteur, setSecteur]   = useState<string | null>(null);
  const [nom, setNom]           = useState("");
  const [duree, setDuree]       = useState("");
  const [desc, setDesc]         = useState("");
  const [champs, setChamps]     = useState<ChampComplementaire[]>([]);
  const [err, setErr]           = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/institution/profile?institution_id=${instId}`);
      const j = res.ok ? await res.json().catch(() => null) : null;
      const raw = Array.isArray(j?.institution?.services) ? j.institution.services : [];
      setServices(raw.map(toOffreService).filter((s: OffreService | null): s is OffreService => s !== null));
      setSecteur(j?.institution?.secteur ?? null);
      setLoading(false);
    })();
  }, [instId]);

  async function persist(next: OffreService[]) {
    setServices(next);
    setSaving(true);
    await fetch("/api/institution/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ services: next }),
    });
    setSaving(false);
  }

  function resetForm() { setNom(""); setDuree(""); setDesc(""); setChamps([]); setErr(""); setEditingIndex(null); }

  function startEdit(i: number) {
    const s = services[i];
    setNom(s.nom); setDuree(s.duree_minutes > 0 ? String(s.duree_minutes) : ""); setDesc(s.description); setChamps(s.champs_complementaires); setErr(""); setEditingIndex(i);
  }

  function submit() {
    setErr("");
    if (!nom.trim()) { setErr("Le nom est obligatoire"); return; }
    if (!duree || isNaN(+duree) || +duree <= 0) { setErr("Entrez une durée valide en minutes (ex: 20)"); return; }
    const entry: OffreService = { nom: nom.trim(), description: desc.trim(), duree_minutes: +duree, champs_complementaires: champs };
    const next = editingIndex !== null
      ? services.map((s, i) => i === editingIndex ? entry : s)
      : [...services, entry];
    persist(next);
    resetForm();
  }

  function remove(i: number) {
    persist(services.filter((_, idx) => idx !== i));
    if (editingIndex === i) resetForm();
  }

  const suggestions = secteur ? (SERVICES_PAR_SECTEUR[secteur as SecteurId] || []) : [];
  const inputStyle: React.CSSProperties = { width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "12px", padding: "11px 14px", fontSize: "13px", color: C.t1, fontFamily: "inherit" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "20px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", backgroundColor: C.blueL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.t1, fontSize: "16px", fontWeight: 900, letterSpacing: "-0.3px" }}>Offre générale</div>
          <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.55, marginTop: "2px" }}>
            Ce que vous proposez à vos clients — <strong style={{ color: C.t1 }}>toujours gratuit</strong>, réservable par les citoyens et visible sur votre fiche publique. Totalement différent du catalogue <strong style={{ color: C.t1 }}>Services payants</strong>.
          </div>
        </div>
        {saving && <div style={{ width: "14px", height: "14px", border: `2px solid ${C.blue}30`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0, marginTop: "3px" }}/>}
      </div>

      {loading ? (
        <div style={{ color: C.t3, fontSize: "12px" }}>Chargement…</div>
      ) : (
        <>
          {services.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {services.map((s, i) => (
                <div key={i} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>{s.nom}</span>
                      {s.duree_minutes > 0 && <span style={{ color: C.blue, fontSize: "11px", fontWeight: 700 }}>· {s.duree_minutes} min</span>}
                    </div>
                    {s.description && <div style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.5, marginTop: "3px" }}>{s.description}</div>}
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    <button onClick={() => startEdit(i)} className="tap" title="Modifier" style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                    </button>
                    <button onClick={() => remove(i)} className="tap" title="Supprimer" style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {suggestions.length > 0 && editingIndex === null && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
              {suggestions.filter(s => !services.some(x => x.nom === s)).map(s => (
                <button key={s} onClick={() => setNom(s)} className="tap" style={{ backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "20px", padding: "7px 14px", color: C.t2, fontSize: "12px", fontWeight: 500, cursor: "pointer" }}>
                  + {s}
                </button>
              ))}
            </div>
          )}

          <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom du service (ex: Ouverture de compte)" style={inputStyle}/>
            <div style={{ display: "flex", gap: "8px" }}>
              <input type="number" value={duree} onChange={e => setDuree(e.target.value)} placeholder="Durée (min)" style={{ ...inputStyle, maxWidth: "140px" }}/>
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (facultatif)" style={inputStyle}/>
            </div>
            <ChampsComplementairesBuilder champs={champs} onChange={setChamps} C={C}/>
            {err && <div style={{ color: C.red, fontSize: "11.5px", fontWeight: 700 }}>{err}</div>}
            <div style={{ display: "flex", gap: "8px" }}>
              {editingIndex !== null && (
                <button onClick={resetForm} className="tap" style={{ backgroundColor: C.bg3, color: C.t2, border: `1.5px solid ${C.border2}`, borderRadius: "12px", padding: "0 16px", height: "38px", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}>Annuler</button>
              )}
              <button onClick={submit} className="tap" style={{ flex: 1, backgroundColor: C.blue, color: "#fff", border: "none", borderRadius: "12px", height: "38px", fontWeight: 800, fontSize: "13px", cursor: "pointer" }}>
                {editingIndex !== null ? "Enregistrer" : "Ajouter à l'offre"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Ouvre "Offre générale" dans son propre popup (bottom-sheet mobile / dialogue
// centré desktop, même convention que ServiceFormSheet) — volontairement
// séparé de l'écran principal (demande CEO 16/07/2026 : l'écran Services
// payants était surchargé, la valeur du catalogue payant n'était plus
// immédiate). Classes CSS dédiées (svc-offre-*) pour rester indépendant de
// ServiceFormSheet même si les deux popups ne sont jamais ouverts ensemble.
function OffreGeneraleSheet({ instId, onClose }: { instId: string; onClose: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div className="svc-offre-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media(min-width:1024px){
          .svc-offre-overlay{align-items:center!important}
          .svc-offre-panel{max-width:640px!important;border-radius:20px!important;max-height:88svh!important}
          .svc-offre-grip{display:none!important}
          .svc-offre-close-x{display:flex!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="svc-offre-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: "560px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div className="svc-offre-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
        <button onClick={onClose} className="svc-offre-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <OffreGeneraleSection instId={instId}/>
      </div>
    </div>
  );
}

export function ServicesTab({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [services, setServices] = useState<PaidService[]>([]);
  const [bookings, setBookings] = useState<PaidBooking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [formTarget, setFormTarget] = useState<"new" | PaidService | null>(null);
  const [saving, setSaving]     = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toast, setToast]       = useState<{ msg: string; color: string } | null>(null);
  const [subTab, setSubTab]     = useState<"services" | "reservations">("services");
  const [search, setSearch]           = useState("");
  const [statutFilter, setStatutFilter] = useState<StatutFilter>("tous");
  const [categorieFilter, setCategorieFilter] = useState<string>("toutes");
  const [sortBy, setSortBy]           = useState<SortBy>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen]   = useState(false);
  const [offreOpen, setOffreOpen]   = useState(false);

  function showToast(msg: string, color: string = C.green) { setToast({ msg, color }); }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/institution/services");
      const j = res.ok ? await res.json().catch(() => null) : null;
      setServices(j?.services ?? []);
      setBookings(j?.bookings ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSaveForm(data: { nom: string; prix: number; duree_minutes: number; description: string; categorie: string | null; champs_complementaires: ChampComplementaire[]; taux_taxe: number; prix_promo: number | null; promo_actif: boolean }) {
    setSaving(true);
    const isEdit = formTarget && formTarget !== "new";
    const res = await fetch("/api/institution/services", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { id: (formTarget as PaidService).id, ...data } : data),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { showToast("Erreur : " + (j?.error ?? "inconnue"), C.red); setSaving(false); return; }
    showToast(isEdit ? "Service mis à jour" : "Service créé avec succès", C.green);
    setFormTarget(null);
    await loadData();
    setSaving(false);
  }

  async function handleDuplicate(service: PaidService) {
    setMenuOpenId(null);
    const res = await fetch("/api/institution/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom: `${service.nom} (copie)`, prix: service.prix, duree_minutes: service.duree_minutes, description: service.description, categorie: service.categorie, champs_complementaires: service.champs_complementaires, is_active: service.is_active, taux_taxe: service.taux_taxe, prix_promo: service.prix_promo, promo_actif: service.promo_actif }),
    });
    if (!res.ok) { showToast("Erreur duplication", C.red); return; }
    showToast("Service dupliqué", C.green);
    await loadData();
  }

  async function handleToggle(service: PaidService) {
    setToggling(service.id);
    const res = await fetch("/api/institution/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: service.id, is_active: !service.is_active }),
    });
    if (res.ok) {
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: !s.is_active } : s));
      showToast(service.is_active ? "Service désactivé" : "Service activé", service.is_active ? C.orange : C.green);
    } else {
      showToast("Erreur de mise à jour", C.red);
    }
    setToggling(null);
    setMenuOpenId(null);
  }

  async function handleDelete(id: string) {
    setMenuOpenId(null);
    const hasBk = bookings.some(b => b.service_id === id);
    const msg = hasBk ? "Ce service a des réservations. Supprimer quand même ?" : "Supprimer ce service définitivement ?";
    if (!window.confirm(msg)) return;
    const res = await fetch(`/api/institution/services?id=${id}`, { method: "DELETE" });
    if (!res.ok) { showToast("Erreur suppression", C.red); return; }
    setServices(prev => prev.filter(s => s.id !== id));
    setBookings(prev => prev.filter(b => b.service_id !== id));
    showToast("Service supprimé", C.orange);
  }

  const servicesActifs = services.filter(s => s.is_active).length;
  const totalResa      = bookings.length;
  const totalConfirmes = bookings.filter(b => ["confirme", "termine"].includes(b.statut)).length;
  const revenuEstime   = bookings.filter(b => ["confirme", "termine"].includes(b.statut)).reduce((acc, b) => acc + (services.find(s => s.id === b.service_id)?.prix ?? 0), 0);

  const newActifsThisMonth    = services.filter(s => s.is_active && isThisMonth(s.created_at)).length;
  const newResaThisMonth      = bookings.filter(b => isThisMonth(b.created_at)).length;
  const newConfirmesThisMonth = bookings.filter(b => ["confirme", "termine"].includes(b.statut) && isThisMonth(b.created_at)).length;
  const revenueThisMonthOnly  = bookings.filter(b => ["confirme", "termine"].includes(b.statut) && isThisMonth(b.created_at)).reduce((acc, b) => acc + (services.find(s => s.id === b.service_id)?.prix ?? 0), 0);
  const revenueLastMonthOnly  = bookings.filter(b => ["confirme", "termine"].includes(b.statut) && isLastMonth(b.created_at)).reduce((acc, b) => acc + (services.find(s => s.id === b.service_id)?.prix ?? 0), 0);
  const revenuDeltaPct = revenueLastMonthOnly > 0 ? Math.round(((revenueThisMonthOnly - revenueLastMonthOnly) / revenueLastMonthOnly) * 100) : null;

  const kpis: { label: string; value: string; color: string; bg: string; icon: "wallet" | "calendar" | "check" | "trending"; delta: string | null }[] = [
    { label: "Services actifs", value: String(servicesActifs), color: C.orange, bg: C.orangeL, icon: "wallet",   delta: newActifsThisMonth > 0 ? `+${newActifsThisMonth} ce mois` : null },
    { label: "Réservations",    value: String(totalResa),      color: C.blue,   bg: C.blueL,   icon: "calendar", delta: newResaThisMonth > 0 ? `+${newResaThisMonth} ce mois` : null },
    { label: "Confirmés",       value: String(totalConfirmes), color: C.green,  bg: C.greenL,  icon: "check",    delta: newConfirmesThisMonth > 0 ? `+${newConfirmesThisMonth} ce mois` : null },
    { label: "Revenu estimé",   value: revenuEstime > 0 ? formatPrix(revenuEstime) : "—", color: C.purple, bg: C.purpleL, icon: "trending", delta: revenuDeltaPct !== null ? `${revenuDeltaPct >= 0 ? "+" : ""}${revenuDeltaPct}%` : (revenueThisMonthOnly > 0 ? "Nouveau" : null) },
  ];

  const availableCategories = Array.from(new Set(services.map(s => s.categorie).filter((c): c is string => !!c)));

  const q = search.trim().toLowerCase();
  const filteredServices = services.filter(s => {
    if (q && !(s.nom.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q))) return false;
    if (statutFilter === "actif" && !s.is_active) return false;
    if (statutFilter === "suspendu" && s.is_active) return false;
    if (categorieFilter !== "toutes" && (s.categorie ?? "") !== categorieFilter) return false;
    return true;
  });
  const sortedServices = [...filteredServices].sort((a, b) => {
    if (sortBy === "nom") return a.nom.localeCompare(b.nom);
    if (sortBy === "prix") return a.prix - b.prix;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const totalPages = Math.max(1, Math.ceil(sortedServices.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedServices = sortedServices.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  if (loading) return (
    <div style={{ padding: "60px 16px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "36px", height: "36px", border: `3px solid ${C.border}`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
    </div>
  );

  const allBookingsSorted = [...bookings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      <style>{`
        .svc-table-wrap{display:none}
        .svc-cards-wrap{display:block}
        .svc-kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
        .svc-filters-row{display:flex;flex-direction:column;gap:10px}
        .svc-row:hover{background-color:${C.bgCard2}}
        .svc-encourage-illu{display:none}
        .svc-header-actions{display:flex;flex-direction:column;gap:8px;width:100%}
        .svc-header-btn{width:100%}
        @media(min-width:640px){
          .svc-kpi-grid{grid-template-columns:repeat(4,1fr);gap:14px}
          .svc-encourage-illu{display:block}
          .svc-header-actions{width:auto;align-items:flex-end}
          .svc-header-btn{width:auto}
        }
        @media(min-width:768px){
          .svc-filters-row{flex-direction:row;align-items:center}
        }
        @media(min-width:1024px){
          .svc-table-wrap{display:block}
          .svc-cards-wrap{display:none}
        }
      `}</style>

      {toast && <Toast msg={toast.msg} color={toast.color} onDismiss={() => setToast(null)}/>}
      {formTarget && <ServiceFormSheet target={formTarget} onSave={handleSaveForm} onCancel={() => setFormTarget(null)} saving={saving}/>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div>
          <h1 className="yelen-h1" style={{ color: C.t1, marginBottom: "6px" }}>Mes services</h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>Gérez vos services payants, vos réservations et votre code de confirmation Yelen.</p>
        </div>
        <div className="svc-header-actions">
          <div style={{ position: "relative" }}>
            <button onClick={() => setGuideOpen(o => !o)} className="tap svc-header-btn" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: C.t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              Guide des services
            </button>
            {guideOpen && (
              <>
                <div onClick={() => setGuideOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
                <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "16px", boxShadow: "0 16px 40px rgba(0,0,0,0.3)", padding: "18px", width: "280px", maxWidth: "calc(100vw - 32px)" }}>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "8px" }}>Comment fonctionnent les services payants ?</div>
                  <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6 }}>Chaque service payant est visible sur votre fiche publique. Le client réserve, paie sur place, et reçoit un code de confirmation Yelen à 6 chiffres à présenter le jour du rendez-vous.</div>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setOffreOpen(true)} className="tap svc-header-btn" style={{ backgroundColor: C.blueL, border: `1px solid ${C.blue}40`, borderRadius: "14px", padding: "10px 16px", color: C.blue, fontWeight: "800", fontSize: "12.5px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", whiteSpace: "nowrap" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Offre générale
          </button>
          <button onClick={() => setFormTarget("new")} className="tap svc-header-btn" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "900", fontSize: "12.5px", padding: "10px 16px", borderRadius: "14px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", whiteSpace: "nowrap" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Créer un service payant
          </button>
        </div>
      </div>

      {offreOpen && <OffreGeneraleSheet instId={instId} onClose={() => setOffreOpen(false)}/>}

      <div style={{ backgroundColor: C.orangeL, border: `1px solid ${C.orange}30`, borderRadius: "14px", padding: "12px 16px", marginBottom: "16px", display: "flex", gap: "10px" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "2px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style={{ color: C.t1, fontSize: "12px", lineHeight: 1.6 }}>
          <strong>Fonctionnalité par abonnement.</strong> Les rendez-vous payants (réservation en ligne + code de confirmation Yelen) seront activés selon le plan de votre institution au lancement. Vous pouvez dès maintenant préparer votre catalogue ci-dessous — les citoyens ne pourront pas encore réserver tant que cette fonctionnalité n'est pas activée pour votre compte.
        </div>
      </div>

      <div className="svc-kpi-grid" style={{ marginBottom: "16px" }}>
        {kpis.map(k => <KpiCard key={k.label} {...k}/>)}
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", backgroundColor: C.bgCard2, borderRadius: "18px", padding: "4px", border: `1px solid ${C.border}` }}>
        {([
          { key: "services",     label: "Mes services", count: services.length },
          { key: "reservations", label: "Réservations", count: totalResa },
        ] as { key: typeof subTab; label: string; count: number }[]).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} className="tap" style={{ flex: 1, backgroundColor: subTab === t.key ? C.bgCard : "transparent", border: subTab === t.key ? `1.5px solid ${C.gold}50` : "1.5px solid transparent", borderRadius: "14px", padding: "10px 8px", color: subTab === t.key ? C.gold : C.t3, fontSize: "12px", fontWeight: subTab === t.key ? "800" : "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", transition: "all 0.2s" }}>
            {t.label}
            {t.count > 0 && <span style={{ backgroundColor: subTab === t.key ? C.gold : C.border2, color: subTab === t.key ? "#000" : C.t2, fontSize: "9px", fontWeight: "900", padding: "2px 7px", borderRadius: "20px" }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {subTab === "services" && (
        <>
          {services.length === 0 ? (
            <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1.5px solid ${C.border}`, padding: "44px 24px", textAlign: "center" }}>
              <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: `${C.gold}15`, border: `1.5px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              </div>
              <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900", marginBottom: "8px" }}>Aucun service payant</div>
              <div style={{ color: C.t3, fontSize: "13px", lineHeight: 1.65, marginBottom: "20px" }}>Créez votre premier service payant pour commencer à recevoir des réservations via Yelen.</div>
              <button onClick={() => setFormTarget("new")} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "14px", padding: "13px 28px", borderRadius: "14px", border: "none", cursor: "pointer" }}>Créer mon premier service</button>
            </div>
          ) : (
            <>
              <div className="svc-filters-row" style={{ marginBottom: "16px" }}>
                <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher un service..." style={{ width: "100%", height: "44px", paddingLeft: "38px", paddingRight: "14px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", color: C.t1, fontSize: "13px" }}/>
                </div>
                <select value={statutFilter} onChange={e => { setStatutFilter(e.target.value as StatutFilter); setPage(1); }} style={selectStyle(C)}>
                  <option value="tous">Tous les statuts</option>
                  <option value="actif">Actif</option>
                  <option value="suspendu">Suspendu</option>
                </select>
                <select value={categorieFilter} onChange={e => { setCategorieFilter(e.target.value); setPage(1); }} style={selectStyle(C)}>
                  <option value="toutes">Toutes catégories</option>
                  {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => setFiltersOpen(o => !o)} className="tap" style={{ height: "44px", padding: "0 16px", backgroundColor: filtersOpen ? `${C.gold}15` : C.bgCard, border: `1px solid ${filtersOpen ? C.gold + "50" : C.border}`, borderRadius: "14px", color: filtersOpen ? C.gold : C.t2, fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
                  Filtres
                </button>
              </div>

              {filtersOpen && (
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", padding: "12px 14px", backgroundColor: C.bgCard2, borderRadius: "14px", border: `1px solid ${C.border}` }}>
                  <span style={{ color: C.t3, fontSize: "11px", fontWeight: 700 }}>Trier par</span>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={selectStyle(C)}>
                    <option value="recent">Plus récent</option>
                    <option value="nom">Nom (A→Z)</option>
                    <option value="prix">Prix croissant</option>
                  </select>
                </div>
              )}

              <div className="svc-table-wrap" style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: "hidden", marginBottom: "16px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {[["Service", "left"], ["Catégorie", "left"], ["Prix", "center"], ["Durée", "center"], ["Réservations", "center"], ["Statut", "center"], ["Actions", "center"]].map(([h, align]) => (
                        <th key={h} style={{ textAlign: align as "left" | "center", padding: "12px 16px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedServices.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", color: C.t3, fontSize: "13px" }}>Aucun service ne correspond à ces critères.</td></tr>
                    )}
                    {pagedServices.map(s => {
                      const svcBookings = bookings.filter(b => b.service_id === s.id);
                      return (
                        <ServiceRow key={s.id} service={s} resaCount={svcBookings.length} resaDelta={svcBookings.filter(b => isThisMonth(b.created_at)).length}
                          menuOpen={menuOpenId === s.id} onMenuToggle={() => setMenuOpenId(menuOpenId === s.id ? null : s.id)} onMenuClose={() => setMenuOpenId(null)}
                          onEdit={() => setFormTarget(s)} onDuplicate={() => handleDuplicate(s)} onToggleActive={() => handleToggle(s)} onDelete={() => handleDelete(s.id)} toggling={toggling === s.id}/>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="svc-cards-wrap">
                {pagedServices.length === 0 && (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: C.t3, fontSize: "13px" }}>Aucun service ne correspond à ces critères.</div>
                )}
                {pagedServices.map(s => {
                  const svcBookings = bookings.filter(b => b.service_id === s.id);
                  return (
                    <ServiceCardMobile key={s.id} service={s} bookings={svcBookings} resaDelta={svcBookings.filter(b => isThisMonth(b.created_at)).length}
                      menuOpen={menuOpenId === s.id} onMenuToggle={() => setMenuOpenId(menuOpenId === s.id ? null : s.id)} onMenuClose={() => setMenuOpenId(null)}
                      onToggleActive={() => handleToggle(s)} onEdit={() => setFormTarget(s)} onDuplicate={() => handleDuplicate(s)} onDelete={() => handleDelete(s.id)} toggling={toggling === s.id}/>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "20px" }}>
                <span style={{ color: C.t3, fontSize: "12px" }}>
                  {sortedServices.length === 0 ? "Aucun service" : `Affichage ${(pageSafe - 1) * pageSize + 1} à ${Math.min(pageSafe * pageSize, sortedServices.length)} sur ${sortedServices.length} service${sortedServices.length > 1 ? "s" : ""}`}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageSafe <= 1} className="tap" style={pageBtnStyle(C, pageSafe <= 1)}>‹</button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const n = i + 1;
                    return <button key={n} onClick={() => setPage(n)} className="tap" style={{ ...pageBtnStyle(C, false), backgroundColor: n === pageSafe ? C.gold : C.bgCard, color: n === pageSafe ? "#000" : C.t2, border: `1px solid ${n === pageSafe ? C.gold : C.border}` }}>{n}</button>;
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages} className="tap" style={pageBtnStyle(C, pageSafe >= totalPages)}>›</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: C.t3, fontSize: "12px" }}>Lignes par page</span>
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} style={selectStyle(C)}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div style={{ backgroundColor: C.bgCard, borderRadius: "24px", border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: "32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 320px", display: "flex", alignItems: "flex-start", gap: "18px" }}>
                  <div style={{ width: "64px", height: "64px", borderRadius: "18px", backgroundColor: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l1.5 5M18 2l-1.5 5M3 7h18l-1.4 13a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z"/></svg>
                  </div>
                  <div>
                    <div style={{ color: C.t1, fontSize: "17px", fontWeight: 900, marginBottom: "6px" }}>Développez votre offre de services</div>
                    <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "16px", maxWidth: "420px" }}>Ajoutez de nouveaux services payants pour répondre aux besoins de vos clients et augmenter vos revenus.</div>
                    <button onClick={() => setFormTarget("new")} className="tap" style={{ backgroundColor: C.bgCard, border: `1.5px solid ${C.gold}`, color: C.gold, fontWeight: 800, fontSize: "13px", padding: "12px 22px", borderRadius: "13px", cursor: "pointer" }}>Créer mon premier service</button>
                  </div>
                </div>
                <div className="svc-encourage-illu" style={{ flexShrink: 0 }}>
                  <EncourageIllustration C={C}/>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {subTab === "reservations" && (
        allBookingsSorted.length === 0 ? (
          <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1.5px solid ${C.border}`, padding: "44px 24px", textAlign: "center" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: `${C.gold}15`, border: `1.5px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900", marginBottom: "8px" }}>Aucune réservation</div>
            <div style={{ color: C.t3, fontSize: "13px", lineHeight: 1.65 }}>Les réservations de vos services payants apparaîtront ici avec leur code Yelen.</div>
          </div>
        ) : (
          <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1.5px solid ${C.border2}`, overflow: "hidden" }}>
            {allBookingsSorted.map((b, i) => {
              const si  = statutInfo(b.statut, C);
              const svc = services.find(s => s.id === b.service_id);
              return (
                <div key={b.id} style={{ padding: "14px 16px", borderBottom: i < allBookingsSorted.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "13px", background: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "900", color: C.gold, flexShrink: 0, border: `1px solid ${C.border}` }}>{(b.citoyen_nom || "C").slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.citoyen_nom || "Citoyen"}</div>
                    <div style={{ color: C.t3, fontSize: "11px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc?.nom ?? "Service"}{svc ? ` · ${formatPrix(svc.prix)}` : ""}</div>
                    <div style={{ color: C.t3, fontSize: "10px", marginTop: "2px" }}>{formatDate(b.date_rdv)} · {b.heure_rdv} · {timeAgo(b.created_at)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
                    <span style={{ backgroundColor: si.bg, color: si.c, fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "20px", textTransform: "uppercase" }}>{si.l}</span>
                    <span style={{ color: C.t2, fontSize: "10px", fontFamily: "monospace", letterSpacing: "1.5px", backgroundColor: C.bg3, padding: "2px 8px", borderRadius: "7px", border: `1px solid ${C.border}` }}>#{b.confirmation_code}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
