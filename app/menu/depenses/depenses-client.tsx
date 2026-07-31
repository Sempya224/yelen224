"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { CATEGORIES_DEPENSE, formatGNF, type CategorieDepenseId } from "@/lib/depenses";
import { ajouterDepense } from "./actions";

// "Mes dépenses" — chantier engagement du 25/07/2026, inspiré de
// MoneyLion (budget par catégorie + suggestions), décision CEO : pas
// d'info externe nécessaire ici, tout vient de l'activité réelle du
// citoyen — ses RDV payés (paid_bookings, déjà réel) + ce qu'il ajoute
// lui-même (citoyen_depenses, nouvelle table). Pas de plafond de budget
// ni d'alerte de dépassement en V1 (ça viendrait avec une vraie UI de
// configuration par catégorie — hors scope demandé ici) : le "aide à
// réduire" passe par le CTA vers Mes démarches, pas par une limite
// automatique.
type Depense = { id: string; categorie: CategorieDepenseId; montant: number; description: string | null; date_depense: string; created_at: string; source: "manuelle" };
type PaiementRdv = { id: string; montant: number; date_depense: string; created_at: string; description: string | null; institutionNom: string | null; serviceNom: string | null; statut: string; source: "yelen" };
type Ligne = Depense | PaiementRdv;

const Illu: Record<CategorieDepenseId | "yelen", () => React.ReactNode> = {
  sante: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FEE2E2"/><rect x="18" y="11" width="8" height="22" rx="2" fill="#E11D48"/><rect x="11" y="18" width="22" height="8" rx="2" fill="#E11D48"/></svg>),
  transport: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#DBEAFE"/><rect x="9" y="20" width="26" height="10" rx="3" fill="#2563EB"/><path d="M12 20l3-7h14l3 7" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinejoin="round"/><circle cx="15" cy="31" r="2.6" fill="#1E3A8A"/><circle cx="29" cy="31" r="2.6" fill="#1E3A8A"/></svg>),
  alimentation: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FFEDD5"/><path d="M12 20a10 10 0 0 0 20 0z" fill="#EA580C"/><rect x="11" y="18" width="22" height="3" rx="1.5" fill="#EA580C"/></svg>),
  logement: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#CCFBF1"/><path d="M12 34V19l10-8 10 8v15z" fill="#0F766E"/><rect x="19" y="25" width="6" height="9" fill="#CCFBF1"/></svg>),
  education: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#EDE9FE"/><path d="M22 13l14 6-14 6-14-6z" fill="#6D28D9"/><path d="M15 21v6c0 2 3 4 7 4s7-2 7-4v-6" stroke="#6D28D9" strokeWidth="2" fill="none"/></svg>),
  loisirs: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FCE7F3"/><polygon points="22,10 25.5,18 34,19 27.5,24.5 29.5,33 22,28.5 14.5,33 16.5,24.5 10,19 18.5,18" fill="#DB2777"/></svg>),
  autre: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#E2E8F0"/><circle cx="16" cy="22" r="3" fill="#475569"/><circle cx="22" cy="22" r="3" fill="#475569"/><circle cx="28" cy="22" r="3" fill="#475569"/></svg>),
  yelen: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FEF3C7"/><rect x="12" y="12" width="20" height="20" rx="3" fill="#F5A623"/><rect x="16" y="16" width="4" height="4" fill="#fff"/><rect x="24" y="16" width="4" height="4" fill="#fff"/><rect x="16" y="24" width="4" height="4" fill="#fff"/></svg>),
};

const CATEGORIE_LABEL: Record<CategorieDepenseId | "yelen", string> = {
  sante: "Santé", transport: "Transport", alimentation: "Alimentation", logement: "Logement",
  education: "Éducation", loisirs: "Loisirs", autre: "Autre", yelen: "Rendez-vous Yelen",
};

function estCeMois(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// Une dépense manuelle datée dans le futur = une dépense planifiée, pas
// encore réalisée (retour Bryan 29/07/2026 : "planifier des dépenses à
// venir"). Un RDV payé (source "yelen") n'est jamais "à venir" — il
// n'existe qu'une fois le paiement réellement effectué.
function estAVenir(l: Ligne): l is Depense {
  if (l.source !== "manuelle") return false;
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  return new Date(l.date_depense) > aujourdHui;
}

function texteEcheance(dateStr: string): string {
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const cible = new Date(dateStr); cible.setHours(0, 0, 0, 0);
  const jours = Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000);
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Demain";
  return `Dans ${jours} jours`;
}

export function DepensesClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombre = isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)";

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fCategorie, setFCategorie] = useState<CategorieDepenseId>("alimentation");
  const [fMontant, setFMontant] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [detail, setDetail] = useState<Ligne | null>(null);

  const charger = useCallback(async (id: string) => {
    const [depRes, paidRes] = await Promise.all([
      supabase.from("citoyen_depenses").select("id,categorie,montant,description,date_depense,created_at").eq("citoyen_id", id).order("date_depense", { ascending: false }),
      supabase.from("paid_bookings").select("id,montant_paye,created_at,statut,paid_services(nom),institutions!paid_bookings_institution_id_fkey(name)").eq("citoyen_id", id).in("statut", ["confirme", "termine"]),
    ]);
    const manuelles: Depense[] = (depRes.data ?? []).map((d: any) => ({ id: d.id, categorie: d.categorie, montant: d.montant, description: d.description, date_depense: d.date_depense, created_at: d.created_at, source: "manuelle" as const }));
    const paiements: PaiementRdv[] = (paidRes.data ?? []).map((p: any) => ({
      id: p.id, montant: p.montant_paye ?? 0, date_depense: p.created_at, created_at: p.created_at,
      description: `${p.paid_services?.nom ?? "Service"} — ${p.institutions?.name ?? ""}`.trim(),
      institutionNom: p.institutions?.name ?? null, serviceNom: p.paid_services?.nom ?? null, statut: p.statut,
      source: "yelen" as const,
    }));
    setLignes([...manuelles, ...paiements].sort((a, b) => new Date(b.date_depense).getTime() - new Date(a.date_depense).getTime()));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setUserId(id);
    void (async () => { setLoading(true); await charger(id); setLoading(false); })();
  }, [router, charger]);

  // Une dépense planifiée dans le futur n'est pas encore un fait accompli —
  // elle a sa propre section "À venir" et n'entre ni dans le total du mois,
  // ni dans la répartition par catégorie, ni dans "Toutes vos dépenses".
  const aVenir = lignes.filter(estAVenir).sort((a, b) => new Date(a.date_depense).getTime() - new Date(b.date_depense).getTime());
  const aVenirIds = new Set(aVenir.map(d => d.id));
  const historique = lignes.filter(l => !aVenirIds.has(l.id));

  const lignesMois = historique.filter(l => estCeMois(l.date_depense));
  const totalMois = lignesMois.reduce((s, l) => s + l.montant, 0);

  const parCategorie = new Map<CategorieDepenseId | "yelen", number>();
  for (const l of lignesMois) {
    const cle = l.source === "yelen" ? "yelen" : l.categorie;
    parCategorie.set(cle, (parCategorie.get(cle) ?? 0) + l.montant);
  }
  const categoriesTriees = [...parCategorie.entries()].sort((a, b) => b[1] - a[1]);
  const topCategorie = categoriesTriees[0]?.[0];

  const fEstFuture = (() => {
    const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
    return new Date(fDate) > aujourdHui;
  })();

  async function soumettre() {
    if (!userId) return;
    const montant = Number(fMontant.replace(/[^\d]/g, ""));
    if (!montant || montant <= 0) { setToast("Entrez un montant valide."); setTimeout(() => setToast(null), 2000); return; }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); setSaving(false); return; }
    const result = await ajouterDepense(userId, session.access_token, { categorie: fCategorie, montant, description: fDescription, dateDepense: fDate });
    setSaving(false);
    if (result.ok) {
      setFormOpen(false);
      const etaitFuture = fEstFuture;
      setFMontant("");
      setFDescription("");
      await charger(userId);
      setToast(etaitFuture ? "Dépense planifiée." : "Dépense ajoutée.");
    } else {
      setToast(result.error || "Échec de l'ajout.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
        @keyframes screenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <CompteHeader titre="Mes dépenses" fondNeutre retourHref="/?menu=1"/>

      <div style={{ padding: "24px 20px 8px", animation: "screenIn 0.35s ease" }}>
        <div style={{ color: t2, fontSize: "12.5px", fontWeight: "700", marginBottom: "6px" }}>Ce mois-ci</div>
        <div style={{ color: t1, fontSize: "34px", fontWeight: "900", marginBottom: "16px" }}>{formatGNF(totalMois)}</div>
        <button onClick={() => setFormOpen(true)} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800", cursor: "pointer" }}>
          + Ajouter une dépense
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: t3, fontSize: "14px", fontWeight: "600" }}>Chargement…</div>
      ) : lignes.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: t3, fontSize: "13.5px", lineHeight: "1.6" }}>
          Rien à afficher pour l'instant. Ajoutez une dépense (passée ou à venir), ou prenez un rendez-vous payant sur Yelen — il apparaîtra ici automatiquement.
        </div>
      ) : (
        <div style={{ padding: "8px 20px 40px" }}>
          {aVenir.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "10px" }}>À venir</div>
              <div style={{ display: "flex", gap: "10px", overflowX: "auto", margin: "0 -20px", padding: "0 20px 4px" }}>
                {aVenir.map((l, i) => (
                  <button key={l.id} onClick={() => setDetail(l)} className="tap" style={{ flexShrink: 0, minWidth: "132px", textAlign: "left", backgroundColor: card, borderRadius: "18px", padding: "14px", border: "none", borderLeft: "3px solid #F5A623", boxShadow: ombre, cursor: "pointer", animation: `cardIn 0.3s ease ${i * 0.05}s both` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={{ transform: "scale(0.75)", transformOrigin: "left center" }}>{Illu[l.categorie]()}</span>
                      <span style={{ color: "#F5A623", fontSize: "10px", fontWeight: "800" }}>{texteEcheance(l.date_depense)}</span>
                    </div>
                    <div style={{ color: t1, fontSize: "14px", fontWeight: "900", whiteSpace: "nowrap" }}>{formatGNF(l.montant)}</div>
                    <div style={{ color: t2, fontSize: "10.5px", fontWeight: "700", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.description || CATEGORIE_LABEL[l.categorie]}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {categoriesTriees.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "10px" }}>Par catégorie</div>
              <div style={{ display: "flex", gap: "10px", overflowX: "auto", margin: "0 -20px", padding: "0 20px 4px" }}>
                {categoriesTriees.map(([cat, montant], i) => (
                  <div key={cat} style={{ flexShrink: 0, minWidth: "108px", textAlign: "center", backgroundColor: card, borderRadius: "18px", padding: "16px 10px", boxShadow: ombre, animation: `cardIn 0.3s ease ${i * 0.05}s both` }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>{Illu[cat]()}</div>
                    <div style={{ color: t1, fontSize: "13.5px", fontWeight: "900", whiteSpace: "nowrap" }}>{formatGNF(montant)}</div>
                    <div style={{ color: t2, fontSize: "10.5px", fontWeight: "700", marginTop: "3px" }}>{CATEGORIE_LABEL[cat]}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topCategorie && (
            <div style={{ borderRadius: "20px", padding: "18px", marginBottom: "16px", background: "linear-gradient(135deg,#1B1B2B 0%,#3D2E5C 100%)", boxShadow: "0 4px 16px rgba(27,27,43,0.25)", animation: "cardIn 0.35s ease 0.2s both" }}>
              <div style={{ color: "#fff", fontSize: "14px", fontWeight: "800", marginBottom: "6px" }}>
                {CATEGORIE_LABEL[topCategorie]}, c'est votre plus grosse dépense ce mois-ci.
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12.5px", lineHeight: "1.5", marginBottom: "14px" }}>
                Envie de la faire baisser ? Fixez-vous un objectif concret et suivez-le dans Mes démarches.
              </div>
              <Link href="/compte/mes-demarches" className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderRadius: "20px", backgroundColor: "#F5A623", color: "#080812", fontSize: "12.5px", fontWeight: "800", textDecoration: "none" }}>
                Organiser un suivi
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
              </Link>
            </div>
          )}

          {historique.length > 0 && (
            <>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "10px" }}>Historique</div>
              <div style={{ backgroundColor: card, borderRadius: "18px", overflow: "hidden", boxShadow: ombre }}>
                {historique.map((l, i) => (
                  <button key={l.id} onClick={() => setDetail(l)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", width: "100%", border: "none", background: "none", borderBottom: i < historique.length - 1 ? `1px solid ${brd}` : "none", cursor: "pointer", textAlign: "left" }}>
                    {Illu[l.source === "yelen" ? "yelen" : l.categorie]()}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.source === "yelen" ? (l.description || "Rendez-vous Yelen") : (l.description || CATEGORIE_LABEL[l.categorie])}
                      </div>
                      <div style={{ color: t3, fontSize: "11px" }}>{new Date(l.date_depense).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                    </div>
                    <span style={{ color: t1, fontSize: "13px", fontWeight: "800", flexShrink: 0 }}>{formatGNF(l.montant)}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: t3, flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", padding: "10px 18px", borderRadius: "20px", backgroundColor: "#080812", color: "#fff", fontSize: "12.5px", fontWeight: "700", animation: "toastIn 0.25s ease", zIndex: 300 }}>
          {toast}
        </div>
      )}

      {formOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setFormOpen(false)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>{fEstFuture ? "Planifier une dépense" : "Ajouter une dépense"}</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Catégorie</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
              {CATEGORIES_DEPENSE.map(c => (
                <button key={c.id} onClick={() => setFCategorie(c.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px 6px 6px", borderRadius: "24px", border: "none", backgroundColor: fCategorie === c.id ? "#080812" : card2, cursor: "pointer" }}>
                  <span style={{ transform: "scale(0.7)", transformOrigin: "center" }}>{Illu[c.id]()}</span>
                  <span style={{ color: fCategorie === c.id ? "#fff" : t1, fontSize: "12.5px", fontWeight: "700" }}>{c.label}</span>
                </button>
              ))}
            </div>

            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombre }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Montant (GNF)</div>
              <input value={fMontant} onChange={e => setFMontant(e.target.value)} inputMode="numeric" placeholder="Ex : 50000" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "15px", fontWeight: "700", marginBottom: "16px", boxSizing: "border-box" }}/>

              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Description (optionnel)</div>
              <input value={fDescription} onChange={e => setFDescription(e.target.value)} placeholder="Ex : Marché du quartier" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "14px", fontWeight: "600", marginBottom: "16px", boxSizing: "border-box" }}/>

              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Date</div>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "14px", fontWeight: "600", boxSizing: "border-box" }}/>
              {fEstFuture && (
                <div style={{ color: t2, fontSize: "11.5px", lineHeight: "1.5", marginTop: "10px" }}>
                  Date dans le futur : cette dépense sera classée "À venir" jusqu'à cette date.
                </div>
              )}
            </div>

            <button onClick={soumettre} disabled={saving} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1, marginTop: "20px" }}>
              {saving ? "Enregistrement…" : fEstFuture ? "Planifier cette dépense" : "Ajouter"}
            </button>
          </div>
        </div>
      )}

      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setDetail(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>Détail de la dépense</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "24px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                <div style={{ transform: "scale(1.3)" }}>{Illu[detail.source === "yelen" ? "yelen" : detail.categorie]()}</div>
              </div>
              <div style={{ color: t1, fontSize: "26px", fontWeight: "900" }}>{formatGNF(detail.montant)}</div>
              <div style={{ color: t2, fontSize: "13px", fontWeight: "700", marginTop: "4px" }}>{CATEGORIE_LABEL[detail.source === "yelen" ? "yelen" : detail.categorie]}</div>
              {estAVenir(detail) && (
                <div style={{ display: "inline-block", marginTop: "10px", padding: "3px 10px", borderRadius: "20px", background: "rgba(245,166,35,0.14)", border: "1px solid rgba(245,166,35,0.3)", color: "#F5A623", fontSize: "11px", fontWeight: "800" }}>
                  À venir · {texteEcheance(detail.date_depense)}
                </div>
              )}
            </div>

            <div style={{ backgroundColor: card, borderRadius: "18px", overflow: "hidden", boxShadow: ombre, marginBottom: "16px" }}>
              {detail.source === "yelen" ? (
                <>
                  <LigneDetail label="Établissement" valeur={detail.institutionNom || "—"} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Service" valeur={detail.serviceNom || "—"} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Statut du paiement" valeur={detail.statut === "termine" ? "Terminé" : "Confirmé"} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Payé le" valeur={new Date(detail.created_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Heure du paiement" valeur={new Date(detail.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} brd={brd} t2={t2} t1={t1} dernier/>
                </>
              ) : (
                <>
                  {detail.description && <LigneDetail label="Description" valeur={detail.description} brd={brd} t2={t2} t1={t1}/>}
                  <LigneDetail label="Date de la dépense" valeur={new Date(detail.date_depense).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Ajoutée le" valeur={new Date(detail.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="À" valeur={new Date(detail.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} brd={brd} t2={t2} t1={t1} dernier/>
                </>
              )}
            </div>

            <div style={{ color: t3, fontSize: "11.5px", lineHeight: "1.6", textAlign: "center" }}>
              Ces détails restent privés. Ils nous aident seulement à vous proposer, plus tard, des recommandations qui correspondent à votre vraie activité.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LigneDetail({ label, valeur, brd, t2, t1, dernier }: { label: string; valeur: string; brd: string; t2: string; t1: string; dernier?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: dernier ? "none" : `1px solid ${brd}` }}>
      <span style={{ color: t2, fontSize: "12.5px", fontWeight: "600" }}>{label}</span>
      <span style={{ color: t1, fontSize: "13px", fontWeight: "700", textTransform: "capitalize", textAlign: "right", maxWidth: "60%" }}>{valeur}</span>
    </div>
  );
}
