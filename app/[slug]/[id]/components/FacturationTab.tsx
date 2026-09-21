"use client";

// Facturation clients V3 (18/09/2026) — Établissement → Client. Aucun
// rapport avec "Facturation Yelen" (Yelen Business, Yelen → Établissement,
// voir YelenFacturationTab.tsx) — nom délibérément différent ("Facturation
// clients") pour ne jamais les confondre. Reçu HTML imprimable
// (Ctrl+P/window.print(), pas de PDF serveur, décision Bryan 22/07/2026)
// conservé pour le flux existant "générer depuis un paiement confirmé".
//
// Bandeau permanent "Domaine protégé du comptable" retiré (retour Bryan
// 18/09/2026) — la vraie protection reste serveur (POST /api/institution/
// factures, accesUrgenceAdminDebloque, inchangée), seul le bouton "+
// Nouvelle facture" est gaté côté UI, jamais un texte permanent juste
// pour consulter.
//
// Pas construit dans cette passe (voir plan) : "+ Créer un nouveau
// client" dans le wizard — CLAUDE.md /backlog-produit bloque
// explicitement la saisie manuelle d'un client sans validation Bryan ;
// menu "⋯" au niveau du header (les actions contextuelles vivent dans le
// drawer) ; rappels automatiques configurables (bouton manuel seulement).
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";
import { can, type MembreRole } from "@/lib/institutionPermissions";
import { StatusDot } from "./YelenBusinessShared";
import {
  FACTURE_STATUT_META, METHODES_PAIEMENT, METHODE_PAIEMENT_LABELS, estEnRetard, resteAPayer,
  type Facture, type FactureDetail, type FactureStatut, type MethodePaiement,
} from "@/lib/facturationClients";

type PaiementSansFacture = { id: string; reference: string; citoyen_nom: string; service_nom: string; montant: number; date_rdv: string };
type ClientRecherche = { id: string; nom: string; phone: string };

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " " + DEVISE_LABEL; }
function formatDate(iso: string | null): string { return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"; }
function formatDateHeure(iso: string): string { return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

const FILTRES_STATUT: { key: FactureStatut | "toutes" | "en_retard"; label: string }[] = [
  { key: "toutes", label: "Toutes" },
  { key: "brouillon", label: "Brouillons" },
  { key: "envoyee", label: "En attente de paiement" },
  { key: "partiellement_payee", label: "Partiellement payées" },
  { key: "payee", label: "Payées" },
  { key: "en_retard", label: "En retard" },
  { key: "annulee", label: "Annulées" },
  { key: "remboursee", label: "Remboursées" },
];

export function FacturationTab({ instId, onToast, isAdmin, membreRole, onVoirClient }: { instId: string; onToast: (msg: string, color?: string) => void; isAdmin: boolean; membreRole: MembreRole | null; onVoirClient?: (citoyenId: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<typeof FILTRES_STATUT[number]["key"]>("toutes");
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showGenererDepuisPaiement, setShowGenererDepuisPaiement] = useState(false);

  const peutCreer = membreRole !== null && can(membreRole, "facturation.write");

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/institution/factures");
    const j = await res.json().catch(() => null);
    setFactures(res.ok ? (j?.factures ?? []) : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [instId]);

  const rechercheNorm = recherche.trim().toLowerCase();
  const facturesFiltrees = factures.filter(f => {
    if (rechercheNorm) {
      const cible = `${f.numero} ${f.citoyenNom} ${f.citoyenPhone ?? ""} ${f.citoyenEmail ?? ""}`.toLowerCase();
      if (!cible.includes(rechercheNorm)) return false;
    }
    if (filtreStatut === "toutes") return true;
    if (filtreStatut === "en_retard") return estEnRetard(f);
    return f.statut === filtreStatut;
  });

  const nonSoldees = factures.filter(f => f.statut !== "annulee" && f.statut !== "brouillon");
  const aEncaisser = nonSoldees.reduce((s, f) => s + resteAPayer(f), 0);
  const enRetardMontant = factures.filter(estEnRetard).reduce((s, f) => s + resteAPayer(f), 0);
  const encaisse = factures.reduce((s, f) => s + f.montantPaye, 0);
  const facturesOuvertes = nonSoldees.filter(f => f.statut !== "payee").length;

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px" }}>Facturation clients</h1>
        {peutCreer && (
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setShowWizard(true)}>+ Nouvelle facture</Button>
        )}
      </div>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Suivez ce que vos clients doivent, ce qui a été payé et ce qui reste à encaisser.</p>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>
      ) : factures.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="40px 20px" style={{ textAlign: "center" }}>
          <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, marginBottom: "8px" }}>Votre facturation client commencera ici</div>
          <p style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "360px", margin: "0 auto 16px" }}>Créez une facture pour demander un paiement à un client et suivre automatiquement son règlement.</p>
          {peutCreer && <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => setShowWizard(true)}>+ Créer une facture</Button>}
          <p style={{ color: C.t3, fontSize: "11px", marginTop: "12px" }}>Les factures peuvent être liées à une réservation, une prestation ou une commande.</p>
        </Card>
      ) : (
        <>
          {/* ── Bandeau financier ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px", marginBottom: "14px" }}>
            {[
              { label: "À encaisser", valeur: formatPrix(aEncaisser), couleur: C.t1 },
              { label: "En retard", valeur: formatPrix(enRetardMontant), couleur: C.red },
              { label: "Encaissé", valeur: formatPrix(encaisse), couleur: C.green },
              { label: "Factures ouvertes", valeur: String(facturesOuvertes), couleur: C.t1 },
            ].map(k => (
              <Card key={k.label} tokens={toCardTokens(C)} padding="12px 14px">
                <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>{k.label}</div>
                <div style={{ color: k.couleur, fontSize: "16px", fontWeight: 800 }}>{k.valeur}</div>
              </Card>
            ))}
          </div>

          <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
            {FILTRES_STATUT.map(f => (
              <button key={f.key} onClick={() => setFiltreStatut(f.key)} className="tap" style={{ backgroundColor: filtreStatut === f.key ? `${C.purple}20` : C.bgCard, border: `1px solid ${filtreStatut === f.key ? C.purple + "40" : C.border}`, borderRadius: "10px", padding: "7px 12px", color: filtreStatut === f.key ? C.purple : C.t2, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>{f.label}</button>
            ))}
          </div>

          <Card tokens={toCardTokens(C)} padding="0 12px" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher une facture ou un client…" style={{ flex: 1, padding: "11px 0", fontSize: "13px", background: "none", border: "none", color: C.t1 }}/>
          </Card>

          {peutCreer && (
            <button onClick={() => setShowGenererDepuisPaiement(true)} className="tap" style={{ background: "none", border: "none", color: C.blue, fontSize: "11.5px", fontWeight: 700, padding: 0, marginBottom: "12px", cursor: "pointer" }}>Générer un reçu depuis un paiement confirmé →</button>
          )}

          {/* ── Tableau ── */}
          {facturesFiltrees.length === 0 ? (
            <Card tokens={toCardTokens(C)} padding="30px 20px" style={{ textAlign: "center", color: C.t3, fontSize: "12.5px" }}>Aucune facture ne correspond à cette recherche/ce filtre.</Card>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", minWidth: "620px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Facture", "Client", "Émission", "Échéance", "Montant", "Payé", "Reste", "Statut"].map(h => (
                      <th key={h} style={{ textAlign: h === "Facture" || h === "Client" ? "left" : "right", color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", padding: "8px 6px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {facturesFiltrees.map(f => {
                    const enRetard = estEnRetard(f);
                    const meta = FACTURE_STATUT_META[f.statut];
                    return (
                      <tr key={f.id} onClick={() => setSelectionId(f.id)} className="tap" style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                        <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 700, whiteSpace: "nowrap" }}>{f.numero}</td>
                        <td style={{ padding: "8px 6px", color: C.t2, whiteSpace: "nowrap" }}>{f.citoyenNom}</td>
                        <td style={{ padding: "8px 6px", color: C.t3, textAlign: "right", whiteSpace: "nowrap" }}>{formatDate(f.dateEmission)}</td>
                        <td style={{ padding: "8px 6px", color: C.t3, textAlign: "right", whiteSpace: "nowrap" }}>{formatDate(f.dateEcheance)}</td>
                        <td style={{ padding: "8px 6px", color: C.t1, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{formatPrix(f.montantTtc)}</td>
                        <td style={{ padding: "8px 6px", color: C.t2, textAlign: "right", whiteSpace: "nowrap" }}>{formatPrix(f.montantPaye)}</td>
                        <td style={{ padding: "8px 6px", color: resteAPayer(f) > 0 ? C.orange : C.t3, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{formatPrix(resteAPayer(f))}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: enRetard ? C.red : meta.couleur, fontSize: "10.5px", fontWeight: 800 }}>
                            <StatusDot couleur={enRetard ? C.red : meta.couleur}/>{enRetard ? "En retard" : meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showGenererDepuisPaiement && (
        <GenererDepuisPaiementModal C={C} onClose={() => setShowGenererDepuisPaiement(false)} onToast={onToast} onGenere={load} facturesExistantes={factures}/>
      )}

      {showWizard && (
        <NouvelleFactureWizard C={C} onClose={() => setShowWizard(false)} onToast={onToast} onCree={load}/>
      )}

      {selectionId && (
        <FactureDrawer C={C} factureId={selectionId} onClose={() => setSelectionId(null)} onToast={onToast} onChange={load} isAdmin={isAdmin} membreRole={membreRole} onVoirClient={onVoirClient}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Flux existant — générer un reçu depuis un paiement déjà confirmé
// ═══════════════════════════════════════════════════════════════════════
function GenererDepuisPaiementModal({ C, onClose, onToast, onGenere, facturesExistantes }: { C: ThemeTokens; onClose: () => void; onToast: (msg: string, color?: string) => void; onGenere: () => void; facturesExistantes: Facture[] }) {
  const [candidats, setCandidats] = useState<PaiementSansFacture[]>([]);
  const [loading, setLoading] = useState(true);
  const [genererId, setGenererId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/institution/paiements?statut=confirme");
      const j = await res.json().catch(() => null);
      const dejaFacture = new Set(facturesExistantes.map(f => f.id));
      setCandidats((res.ok ? (j?.paiements ?? []) : []).filter((p: { id: string }) => !dejaFacture.has(p.id)));
      setLoading(false);
    })();
  }, [facturesExistantes]);

  async function genererFacture(paidBookingId: string) {
    setGenererId(paidBookingId);
    const res = await fetch("/api/institution/factures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid_booking_id: paidBookingId }) });
    const j = await res.json().catch(() => null);
    setGenererId(null);
    if (!res.ok) { onToast(j?.error || "Erreur lors de la génération", C.red); return; }
    onToast(`Facture ${j.numero} générée`, C.green);
    onGenere();
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px", maxHeight: "80svh", overflowY: "auto" }}>
        <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "14px" }}>Paiements sans facture</div>
        {loading ? <YelenLoader size={22}/> : candidats.length === 0 ? (
          <p style={{ color: C.t2, fontSize: "13px" }}>Tous les paiements confirmés ont déjà une facture.</p>
        ) : candidats.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>{p.citoyen_nom}</div>
              <div style={{ color: C.t3, fontSize: "11px" }}>{p.service_nom} · {formatPrix(p.montant)}</div>
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" loading={genererId === p.id} onClick={() => genererFacture(p.id)}>Générer</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Wizard — nouvelle facture (client existant uniquement, voir contexte)
// ═══════════════════════════════════════════════════════════════════════
type LigneForm = { description: string; quantite: string; prixUnitaire: string; remise: string };

function NouvelleFactureWizard({ C, onClose, onToast, onCree }: { C: ThemeTokens; onClose: () => void; onToast: (msg: string, color?: string) => void; onCree: () => void }) {
  const [rechercheClient, setRechercheClient] = useState("");
  const [clients, setClients] = useState<ClientRecherche[]>([]);
  const [clientSelectionne, setClientSelectionne] = useState<ClientRecherche | null>(null);
  const [lignes, setLignes] = useState<LigneForm[]>([{ description: "", quantite: "1", prixUnitaire: "", remise: "0" }]);
  const [dateEcheance, setDateEcheance] = useState("");
  const [envoi, setEnvoi] = useState<"brouillon" | "envoyer">("envoyer");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!rechercheClient.trim()) { setClients([]); return; }
    let annule = false;
    (async () => {
      const res = await fetch("/api/institution/clients");
      const j = await res.json().catch(() => null);
      if (annule || !res.ok) return;
      const terme = rechercheClient.trim().toLowerCase();
      const liste = (j?.clients ?? []) as { id: string; nom: string; phone: string }[];
      setClients(liste.filter(c => c.nom.toLowerCase().includes(terme) || c.phone.includes(terme)).slice(0, 8));
    })();
    return () => { annule = true; };
  }, [rechercheClient]);

  function majLigne(i: number, champ: keyof LigneForm, valeur: string) {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, [champ]: valeur } : l));
  }
  function ajouterLigne() { setLignes(prev => [...prev, { description: "", quantite: "1", prixUnitaire: "", remise: "0" }]); }
  function retirerLigne(i: number) { setLignes(prev => prev.filter((_, idx) => idx !== i)); }

  const total = lignes.reduce((s, l) => {
    const q = Number(l.quantite) || 0, p = Number(l.prixUnitaire) || 0, r = Number(l.remise) || 0;
    return s + (q * p - r);
  }, 0);

  const pretAEnvoyer = clientSelectionne !== null && lignes.every(l => l.description.trim() && Number(l.prixUnitaire) >= 0);

  async function soumettre() {
    if (!clientSelectionne) return;
    setSaving(true);
    const res = await fetch("/api/institution/factures", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        citoyen_id: clientSelectionne.id,
        lignes: lignes.map(l => ({ description: l.description.trim(), quantite: Number(l.quantite) || 1, prix_unitaire: Number(l.prixUnitaire) || 0, remise: Number(l.remise) || 0 })),
        date_echeance: dateEcheance || null,
        envoyer: envoi === "envoyer",
      }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Erreur lors de la création", C.red); return; }
    onToast(envoi === "envoyer" ? `Facture ${j.numero} envoyée` : `Facture ${j.numero} enregistrée comme brouillon`, C.green);
    onCree();
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 220, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <style>{`@media(min-width:1024px){.facture-wizard-panel{align-items:center!important;max-width:640px!important;border-radius:20px!important}}`}</style>
      <div onClick={e => e.stopPropagation()} className="facture-wizard-panel" style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "640px", maxHeight: "88svh", overflowY: "auto" }}>
        <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800, marginBottom: "16px" }}>Nouvelle facture</div>

        <div style={{ marginBottom: "18px" }}>
          <div style={{ color: C.t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>À qui facturez-vous ?</div>
          {clientSelectionne ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
              <div>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700 }}>{clientSelectionne.nom}</div>
                <div style={{ color: C.t3, fontSize: "11px" }}>{clientSelectionne.phone}</div>
              </div>
              <button onClick={() => setClientSelectionne(null)} className="tap" style={{ background: "none", border: "none", color: C.blue, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>Changer</button>
            </div>
          ) : (
            <>
              <input value={rechercheClient} onChange={e => setRechercheClient(e.target.value)} placeholder="Rechercher un client (nom, téléphone)…" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", color: C.t1, fontSize: "13px" }}/>
              {clients.length > 0 && (
                <div style={{ marginTop: "6px", border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden" }}>
                  {clients.map(c => (
                    <button key={c.id} onClick={() => { setClientSelectionne(c); setRechercheClient(""); setClients([]); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, padding: "9px 12px", cursor: "pointer" }}>
                      <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{c.nom}</div>
                      <div style={{ color: C.t3, fontSize: "10.5px" }}>{c.phone}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ marginBottom: "18px" }}>
          <div style={{ color: C.t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Prestations</div>
          {lignes.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 70px 100px 90px 24px", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
              <input value={l.description} onChange={e => majLigne(i, "description", e.target.value)} placeholder="Prestation" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px", color: C.t1, fontSize: "12px" }}/>
              <input value={l.quantite} onChange={e => majLigne(i, "quantite", e.target.value)} type="number" min="1" placeholder="Qté" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px", color: C.t1, fontSize: "12px" }}/>
              <input value={l.prixUnitaire} onChange={e => majLigne(i, "prixUnitaire", e.target.value)} type="number" min="0" placeholder="Prix" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px", color: C.t1, fontSize: "12px" }}/>
              <input value={l.remise} onChange={e => majLigne(i, "remise", e.target.value)} type="number" min="0" placeholder="Remise" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px", color: C.t1, fontSize: "12px" }}/>
              {lignes.length > 1 && <button onClick={() => retirerLigne(i)} className="tap" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "16px" }}>×</button>}
            </div>
          ))}
          <button onClick={ajouterLigne} className="tap" style={{ background: "none", border: "none", color: C.blue, fontSize: "11.5px", fontWeight: 700, padding: 0, marginTop: "4px", cursor: "pointer" }}>+ Ajouter une prestation</button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>Date d&apos;échéance</div>
            <input value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} type="date" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px", color: C.t1, fontSize: "12px" }}/>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>Total</div>
            <div style={{ color: C.t1, fontSize: "18px", fontWeight: 800 }}>{formatPrix(total)}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth disabled={!pretAEnvoyer} loading={saving && envoi === "brouillon"} onClick={() => { setEnvoi("brouillon"); soumettre(); }}>Enregistrer comme brouillon</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth disabled={!pretAEnvoyer} loading={saving && envoi === "envoyer"} onClick={() => { setEnvoi("envoyer"); soumettre(); }}>Envoyer au client</Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Drawer — détail d'une facture
// ═══════════════════════════════════════════════════════════════════════
function FactureDrawer({ C, factureId, onClose, onToast, onChange, membreRole, onVoirClient }: { C: ThemeTokens; factureId: string; onClose: () => void; onToast: (msg: string, color?: string) => void; onChange: () => void; isAdmin: boolean; membreRole: MembreRole | null; onVoirClient?: (citoyenId: string) => void }) {
  const [facture, setFacture] = useState<FactureDetail | null>(null);
  const [showPaiementForm, setShowPaiementForm] = useState(false);
  const [envoiRappel, setEnvoiRappel] = useState(false);
  const [impression, setImpression] = useState(false);

  const peutAgir = membreRole !== null && can(membreRole, "facturation.write");

  async function charger() {
    const res = await fetch(`/api/institution/factures/${factureId}`);
    const j = await res.json().catch(() => null);
    if (res.ok) setFacture(j.facture);
  }
  useEffect(() => { charger(); }, [factureId]);

  async function envoyerRappel() {
    setEnvoiRappel(true);
    const res = await fetch(`/api/institution/factures/${factureId}/rappel`, { method: "POST" });
    const j = await res.json().catch(() => null);
    setEnvoiRappel(false);
    if (!res.ok) { onToast(j?.error || "Erreur lors de l'envoi", C.red); return; }
    onToast("Rappel envoyé au client", C.green);
    charger();
  }

  if (!facture) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <YelenLoader size={28}/>
    </div>
  );

  const meta = FACTURE_STATUT_META[facture.statut];
  const enRetard = estEnRetard(facture);
  const reste = resteAPayer(facture);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 250, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, width: "100%", maxWidth: "440px", height: "100%", overflowY: "auto", padding: "22px", borderLeft: `1px solid ${C.border}` }}>
        <button onClick={onClose} className="tap" style={{ background: "none", border: "none", color: C.t3, fontSize: "13px", fontWeight: 700, padding: 0, marginBottom: "14px", cursor: "pointer" }}>← Fermer</button>

        <div style={{ color: C.t1, fontSize: "17px", fontWeight: 800 }}>Facture {facture.numero}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", marginBottom: "18px" }}>
          <StatusDot couleur={enRetard ? C.red : meta.couleur}/>
          <span style={{ color: enRetard ? C.red : meta.couleur, fontSize: "12px", fontWeight: 800 }}>{enRetard ? "En retard" : meta.label}</span>
        </div>

        <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>Client</div>
        <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 700, marginBottom: "2px" }}>{facture.citoyenNom}</div>
        {facture.citoyenPhone && <div style={{ color: C.t3, fontSize: "11.5px" }}>{facture.citoyenPhone}</div>}
        {facture.citoyenEmail && <div style={{ color: C.t3, fontSize: "11.5px" }}>{facture.citoyenEmail}</div>}
        {onVoirClient && (
          <button onClick={() => onVoirClient(facture.citoyenId)} className="tap" style={{ background: "none", border: "none", color: C.blue, fontSize: "11px", fontWeight: 700, padding: 0, marginTop: "6px", cursor: "pointer" }}>Voir le client →</button>
        )}

        <div style={{ color: C.t2, fontSize: "12px", fontWeight: 800, marginTop: "18px", marginBottom: "10px" }}>Résumé</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px" }}>
          <div><div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Total</div><div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{formatPrix(facture.montantTtc)}</div></div>
          <div><div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Payé</div><div style={{ color: C.green, fontSize: "14px", fontWeight: 800 }}>{formatPrix(facture.montantPaye)}</div></div>
          <div><div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Reste à payer</div><div style={{ color: reste > 0 ? C.orange : C.t3, fontSize: "14px", fontWeight: 800 }}>{formatPrix(reste)}</div></div>
          <div><div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Échéance</div><div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{formatDate(facture.dateEcheance)}</div></div>
        </div>

        {facture.lignes.length > 0 && (
          <>
            <div style={{ color: C.t2, fontSize: "12px", fontWeight: 800, marginBottom: "10px" }}>Détail</div>
            <div style={{ marginBottom: "18px" }}>
              {facture.lignes.map(l => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: "12px" }}>
                  <span style={{ color: C.t2 }}>{l.description} {l.quantite > 1 ? `× ${l.quantite}` : ""}</span>
                  <span style={{ color: C.t1, fontWeight: 700 }}>{formatPrix(l.montantTotal)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ color: C.t2, fontSize: "12px", fontWeight: 800, marginBottom: "10px" }}>Paiements</div>
        {facture.paiements.length === 0 ? (
          <p style={{ color: C.t3, fontSize: "11.5px", marginBottom: "18px" }}>Aucun paiement enregistré pour l&apos;instant.</p>
        ) : (
          <div style={{ marginBottom: "18px" }}>
            {facture.paiements.map(p => (
              <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.t1, fontSize: "13px", fontWeight: 700 }}>{formatPrix(p.montant)}</span>
                  <span style={{ color: C.t3, fontSize: "11px" }}>{formatDate(p.datePaiement)}</span>
                </div>
                <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{METHODE_PAIEMENT_LABELS[p.methode]}{p.reference ? ` · Réf. ${p.reference}` : ""}</div>
              </div>
            ))}
          </div>
        )}

        {peutAgir && reste > 0 && facture.statut !== "annulee" && facture.statut !== "remboursee" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => setShowPaiementForm(true)}>Encaisser un paiement</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" loading={envoiRappel} onClick={envoyerRappel}>Envoyer un rappel</Button>
          </div>
        )}
        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => setImpression(true)}>Télécharger PDF</Button>

        {facture.evenements.length > 0 && (
          <>
            <div style={{ color: C.t2, fontSize: "12px", fontWeight: 800, marginTop: "18px", marginBottom: "10px" }}>Activité</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {facture.evenements.map(e => (
                <div key={e.id} style={{ fontSize: "11.5px" }}>
                  <span style={{ color: C.t1, fontWeight: 700 }}>{e.libelle}</span>
                  <div style={{ color: C.t3, fontSize: "10.5px" }}>{formatDateHeure(e.date)}{e.auteurNom ? ` · Par ${e.auteurNom}` : ""}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showPaiementForm && (
        <PaiementForm C={C} factureId={factureId} reste={reste} onClose={() => setShowPaiementForm(false)} onToast={onToast} onEnregistre={() => { charger(); onChange(); }}/>
      )}
      {impression && <FactureImprimable facture={facture} onClose={() => setImpression(false)}/>}
    </div>
  );
}

function PaiementForm({ C, factureId, reste, onClose, onToast, onEnregistre }: { C: ThemeTokens; factureId: string; reste: number; onClose: () => void; onToast: (msg: string, color?: string) => void; onEnregistre: () => void }) {
  const [montant, setMontant] = useState(String(reste));
  const [methode, setMethode] = useState<MethodePaiement>("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function enregistrer() {
    const montantNum = Number(montant);
    if (!montantNum || montantNum <= 0) { onToast("Montant invalide", C.red); return; }
    setSaving(true);
    const res = await fetch(`/api/institution/factures/${factureId}/paiements`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ montant: montantNum, methode, reference: reference.trim() || undefined, note: note.trim() || undefined }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Erreur lors de l'enregistrement", C.red); return; }
    onToast("Paiement enregistré", C.green);
    onEnregistre();
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 260, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "440px" }}>
        <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, marginBottom: "16px" }}>Encaisser un paiement</div>
        <div style={{ marginBottom: "12px" }}>
          <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>Montant</div>
          <input value={montant} onChange={e => setMontant(e.target.value)} type="number" min="1" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px", color: C.t1, fontSize: "14px" }}/>
        </div>
        <div style={{ marginBottom: "12px" }}>
          <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>Méthode</div>
          <select value={methode} onChange={e => setMethode(e.target.value as MethodePaiement)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px", color: C.t1, fontSize: "13px" }}>
            {METHODES_PAIEMENT.map(m => <option key={m} value={m}>{METHODE_PAIEMENT_LABELS[m]}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: "12px" }}>
          <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>Référence (optionnel)</div>
          <input value={reference} onChange={e => setReference(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px", color: C.t1, fontSize: "13px" }}/>
        </div>
        <div style={{ marginBottom: "18px" }}>
          <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>Note (optionnel)</div>
          <input value={note} onChange={e => setNote(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px", color: C.t1, fontSize: "13px" }}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={onClose}>Annuler</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth loading={saving} onClick={enregistrer}>Enregistrer</Button>
        </div>
      </div>
    </div>
  );
}

function FactureImprimable({ facture, onClose }: { facture: FactureDetail; onClose: () => void }) {
  return (
    <div className="facture-print-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={e => e.stopPropagation()} className="facture-print-content" style={{ backgroundColor: "#fff", color: "#111", borderRadius: "16px", padding: "36px", width: "100%", maxWidth: "520px", maxHeight: "90svh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          <div style={{ fontSize: "20px", fontWeight: 800 }}>Facture {facture.numero}</div>
          <div style={{ fontSize: "12px", color: "#666" }}>{formatDate(facture.dateEmission)}</div>
        </div>
        <div style={{ fontSize: "13px", color: "#444", marginBottom: "20px" }}>
          <div><strong>Client :</strong> {facture.citoyenNom}{facture.citoyenPhone ? ` — ${facture.citoyenPhone}` : ""}</div>
          {facture.dateEcheance && <div><strong>Échéance :</strong> {formatDate(facture.dateEcheance)}</div>}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "20px" }}>
          <tbody>
            {facture.lignes.length > 0 ? facture.lignes.map(l => (
              <tr key={l.id}><td style={{ padding: "6px 0" }}>{l.description}{l.quantite > 1 ? ` × ${l.quantite}` : ""}</td><td style={{ padding: "6px 0", textAlign: "right" }}>{formatPrix(l.montantTotal)}</td></tr>
            )) : (
              <tr><td style={{ padding: "6px 0" }}>Montant HT</td><td style={{ padding: "6px 0", textAlign: "right" }}>{formatPrix(facture.montantHt)}</td></tr>
            )}
            <tr style={{ borderTop: "1px solid #ddd", fontWeight: 800 }}><td style={{ padding: "10px 0" }}>Total TTC</td><td style={{ padding: "10px 0", textAlign: "right" }}>{formatPrix(facture.montantTtc)}</td></tr>
          </tbody>
        </table>
        <div className="facture-print-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button onClick={onClose} style={{ backgroundColor: "#eee", color: "#333", fontWeight: 700, fontSize: "13px", padding: "12px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Fermer</button>
          <button onClick={() => window.print()} style={{ backgroundColor: "#111", color: "#fff", fontWeight: 800, fontSize: "13px", padding: "12px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Imprimer / Enregistrer PDF</button>
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .facture-print-content, .facture-print-content * { visibility: visible; }
          .facture-print-content { position: fixed; inset: 0; max-height: none; border-radius: 0; }
          .facture-print-actions { display: none !important; }
        }
      `}</style>
    </div>
  );
}
