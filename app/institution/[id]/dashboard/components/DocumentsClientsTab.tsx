"use client";

// Documents clients — écran dédié (18/07/2026, chantier "Activités
// passées" citoyen), volontairement séparé de MesClientsTab.tsx (déjà
// chargé, retour explicite de Bryan) et de /api/institution/clients
// (gated "mes-clients", inaccessible au comptable depuis la décision CEO
// du 22/07/2026 — cet écran reste autonome, gated "documents-clients"
// uniquement). L'établissement demande un document à un citoyen (celui-ci
// le téléverse) ou lui envoie directement un document (facture/rapport/
// reçu) — toujours rattaché à un RDV réel entre les deux, n'importe
// lequel (pas seulement en cours/à venir).
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";

type Sens = "demande" | "envoi";
type Statut = "en_attente" | "televerse" | "envoye" | "annule";

type DocumentClient = {
  id: string; citoyen_id: string; citoyen_nom: string; rdv_id: string;
  sens: Sens; type: string; label: string; description: string | null;
  statut: Statut; taille: number | null; type_mime: string | null;
  created_at: string; traite_le: string | null;
  rdv: { date_rdv: string; objet: string | null } | null;
};

type ClientRdv = { id: string; date_rdv: string; heure_rdv: string; objet: string | null; statut: string };
type Client = { id: string; nom: string; phone: string; rdv: ClientRdv[] };

const TYPES_DEMANDE = [
  { value: "piece_identite", label: "Pièce d'identité" },
  { value: "justificatif", label: "Justificatif" },
  { value: "autre", label: "Autre document" },
];
const TYPES_ENVOI = [
  { value: "facture", label: "Facture" },
  { value: "recu", label: "Reçu" },
  { value: "rapport", label: "Rapport" },
  { value: "autre", label: "Autre document" },
];

const STATUT_LABEL: Record<Statut, string> = {
  en_attente: "En attente de réception", televerse: "Reçu", envoye: "Envoyé", annule: "Annulé",
};

function formatTaille(o: number | null): string {
  if (!o) return "";
  if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
  return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function DocumentsClientsTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [documents, setDocuments] = useState<DocumentClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [rdvId, setRdvId] = useState("");
  const [sens, setSens] = useState<Sens>("demande");
  const [type, setType] = useState("piece_identite");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const fichierInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/institution/documents-citoyen");
    const j = await res.json().catch(() => null);
    setDocuments(res.ok ? (j?.documents ?? []) : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [instId]);

  async function ouvrirModal() {
    setShowModal(true);
    if (clients.length === 0) {
      const res = await fetch("/api/institution/documents-citoyen/clients");
      const j = await res.json().catch(() => null);
      if (res.ok) setClients(j?.clients ?? []);
    }
  }

  const clientsFiltres = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => c.nom.toLowerCase().includes(q) || c.phone.includes(q));
  }, [clients, clientQuery]);

  const clientSelectionne = clients.find(c => c.id === clientId) ?? null;

  useEffect(() => { setType(sens === "demande" ? "piece_identite" : "facture"); }, [sens]);

  async function envoyer() {
    if (!clientId || !rdvId || !label.trim()) return;
    if (sens === "envoi" && !fichier) return;
    setSending(true);
    const fd = new FormData();
    fd.append("citoyenId", clientId);
    fd.append("rdvId", rdvId);
    fd.append("type", type);
    fd.append("label", label.trim());
    if (description.trim()) fd.append("description", description.trim());
    if (fichier) fd.append("file", fichier);

    const res = await fetch("/api/institution/documents-citoyen", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    onToast(sens === "demande" ? "Demande envoyée" : "Document envoyé", C.gold);
    setShowModal(false);
    setClientId(""); setRdvId(""); setLabel(""); setDescription(""); setFichier(null); setClientQuery("");
    load();
  }

  async function telecharger(id: string) {
    const res = await fetch(`/api/institution/documents-citoyen?download=${id}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { onToast("Erreur de téléchargement", C.red); return; }
    window.open(j.url, "_blank");
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Documents clients</h1>
        <button onClick={ouvrirModal} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "9px 14px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Nouveau</button>
      </div>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "10px" }}>Demandez un document à un client ou envoyez-lui une facture, un reçu ou un rapport.</p>

      <div style={{ background: `${C.gold}0d`, border: `1px solid ${C.gold}30`, borderRadius: "12px", padding: "10px 12px", marginBottom: "16px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.5 }}>La protection et la confidentialité des documents échangés ici relèvent de la responsabilité de votre établissement. Yelen peut vous redemander de justifier de leur bon usage en cas de litige signalé par un citoyen.</span>
      </div>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/></div>
      ) : documents.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "40px 20px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Aucun document échangé avec un client pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {documents.map(d => (
            <div key={d.id} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label} — {d.citoyen_nom}</div>
                <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>
                  {d.sens === "demande" ? "Demande" : "Envoi"} · {STATUT_LABEL[d.statut]}{d.taille ? ` · ${formatTaille(d.taille)}` : ""} · {formatDate(d.created_at)}
                  {d.rdv?.date_rdv ? ` · RDV du ${formatDate(d.rdv.date_rdv)}` : ""}
                </div>
              </div>
              {(d.statut === "televerse" || d.statut === "envoye") && (
                <button onClick={() => telecharger(d.id)} className="tap" style={{ width: "32px", height: "32px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="doc-clients-overlay" onClick={() => setShowModal(false)} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <style>{`
            /* Bottom sheet mobile par défaut, dialogue centré ≥1024px —
               même convention que .client-fiche-overlay/panel dans
               MesClientsTab.tsx (retour Bryan : jamais mobile-only). */
            @media(min-width:1024px){
              .doc-clients-overlay{align-items:center!important}
              .doc-clients-panel{max-width:520px!important;border-radius:20px!important}
            }
          `}</style>
          <div onClick={e => e.stopPropagation()} className="doc-clients-panel" style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px", maxHeight: "88svh", overflowY: "auto" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "14px" }}>Nouveau document client</div>

            <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Type d'échange</label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              {(["demande", "envoi"] as Sens[]).map(s => (
                <button key={s} onClick={() => setSens(s)} className="tap" style={{ flex: 1, padding: "10px", borderRadius: "10px", border: `1.5px solid ${sens === s ? C.gold : C.border2}`, background: sens === s ? `${C.gold}15` : C.bg3, color: sens === s ? C.gold : C.t2, fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}>
                  {s === "demande" ? "Demander un document" : "Envoyer un document"}
                </button>
              ))}
            </div>

            <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Client</label>
            <input value={clientId ? clientSelectionne?.nom ?? "" : clientQuery} onChange={e => { setClientQuery(e.target.value); setClientId(""); setRdvId(""); }} placeholder="Rechercher un client (nom, téléphone)…" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", color: C.t1, marginBottom: clientId ? "12px" : "4px" }}/>
            {!clientId && clientQuery.trim() && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", marginBottom: "12px", maxHeight: "160px", overflowY: "auto" }}>
                {clientsFiltres.length === 0 ? (
                  <div style={{ padding: "10px", color: C.t3, fontSize: "12px" }}>Aucun client trouvé.</div>
                ) : clientsFiltres.map(c => (
                  <div key={c.id} onClick={() => setClientId(c.id)} className="tap" style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", color: C.t1, fontSize: "12.5px" }}>{c.nom} <span style={{ color: C.t3 }}>· {c.phone}</span></div>
                ))}
              </div>
            )}

            {clientSelectionne && (
              <>
                <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Rendez-vous concerné</label>
                <select value={rdvId} onChange={e => setRdvId(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", color: C.t1, marginBottom: "12px" }}>
                  <option value="">Sélectionner un RDV…</option>
                  {clientSelectionne.rdv.map(r => (
                    <option key={r.id} value={r.id}>{formatDate(r.date_rdv)} {r.heure_rdv} — {r.objet || "RDV général"} ({r.statut})</option>
                  ))}
                </select>
              </>
            )}

            <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Type de document</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", color: C.t1, marginBottom: "12px" }}>
              {(sens === "demande" ? TYPES_DEMANDE : TYPES_ENVOI).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Libellé</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder={sens === "demande" ? "Ex. Pièce d'identité du responsable" : "Ex. Facture consultation du 12/07"} maxLength={100} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", color: C.t1, marginBottom: "12px" }}/>

            <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Description (optionnel)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", color: C.t1, marginBottom: "12px", resize: "none" }}/>

            {sens === "envoi" && (
              <>
                <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Fichier (PDF, JPG, PNG)</label>
                <input ref={fichierInputRef} type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setFichier(e.target.files?.[0] ?? null)} style={{ display: "none" }}/>
                <button
                  type="button"
                  onClick={() => fichierInputRef.current?.click()}
                  className="tap"
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, color: C.t1, fontWeight: "700", fontSize: "13px", padding: "12px", borderRadius: "10px", cursor: "pointer", marginBottom: "8px" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                  {fichier ? "Changer le fichier" : "Ajouter un fichier"}
                </button>
                {fichier && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <div style={{ flex: 1, color: C.t2, fontSize: "12px", wordBreak: "break-all" }}>{fichier.name}</div>
                    <button
                      type="button"
                      onClick={() => { setFichier(null); if (fichierInputRef.current) fichierInputRef.current.value = ""; }}
                      className="tap"
                      aria-label="Retirer le fichier"
                      style={{ width: "24px", height: "24px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "50%", cursor: "pointer" }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                )}
              </>
            )}

            <div style={{ color: C.t3, fontSize: "10.5px", lineHeight: 1.5, marginBottom: "16px" }}>
              En confirmant, vous engagez votre établissement à assurer la sécurité et la confidentialité de ce document conformément aux conditions d'utilisation Yelen.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button onClick={() => setShowModal(false)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "13px", padding: "13px", borderRadius: "10px", cursor: "pointer" }}>Annuler</button>
              <button
                onClick={envoyer}
                disabled={sending || !clientId || !rdvId || !label.trim() || (sens === "envoi" && !fichier)}
                style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "13px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: sending || !clientId || !rdvId || !label.trim() || (sens === "envoi" && !fichier) ? 0.5 : 1 }}
              >
                {sending ? "…" : sens === "demande" ? "Envoyer la demande" : "Envoyer le document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
