"use client";

// Fiche client (modale ouverte depuis « Mes clients », refonte UI 20/10/2026).
// Composant purement présentationnel : MesClientsTab.tsx garde le
// chargement, la timeline, les notes, les réponses aux avis, le rappel et
// toutes les mutations ; on dessine seulement ce qu'on nous passe.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DEVISE_LABEL } from "@/lib/devise";
import { type ThemeTokens, toUiTokens } from "../../theme";
import { ClockStyles, ClockModal, ClockTabs, AttendanceSummary, StatusPill, nomPropre, heure12 } from "../ClockInShiftUi";

export type FAvis = { id: string; note: number; commentaire: string; reponse_institution: string | null; reponse_le: string | null; created_at: string };
export type FMessage = { id: string; contenu: string; lu: boolean; cree_le: string; emetteur: "citoyen" | "institution" };
export type FNoteType = "privee" | "publique" | "commentaire" | "observation" | "compte_rendu";
export type FNote = { id: string; type: FNoteType; contenu: string; created_at: string; auteur_nom: string; auteur_moi: boolean };
export type FEntry = { id: string; date: string; label: string; sublabel?: string; kind: "rdv" | "message" | "signalement" | "autre" };
export type FClient = {
  id: string; nom: string; phone: string; nb_rdv: number; premiere_visite: string; est_nouveau: boolean; avis: FAvis[];
  factures_resume?: { total: number; payees: number; en_attente: number; a_encaisser: number };
};

const NOTE_TYPES: { key: FNoteType; label: string; vide: string; champ: string; placeholder: string }[] = [
  { key: "privee", label: "Privées", vide: "Aucune note privée", champ: "Nouvelle note privée", placeholder: "Écrire une note privée…" },
  { key: "publique", label: "Publiques", vide: "Aucune note publique", champ: "Nouvelle note publique", placeholder: "Écrire une note publique…" },
  { key: "commentaire", label: "Commentaires", vide: "Aucun commentaire", champ: "Nouveau commentaire", placeholder: "Écrire un commentaire…" },
  { key: "observation", label: "Observations", vide: "Aucune observation", champ: "Nouvelle observation", placeholder: "Écrire une observation…" },
  { key: "compte_rendu", label: "Compte rendu", vide: "Aucun compte rendu", champ: "Nouveau compte rendu", placeholder: "Écrire un compte rendu…" },
];

// ── Présentation ─────────────────────────────────────────────────────────
function formatTelephone(brut: string): string {
  const chiffres = brut.replace(/\D/g, "");
  if (chiffres.startsWith("224") && chiffres.length === 12) {
    const n = chiffres.slice(3);
    return `+224 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
  }
  return brut;
}
function ilYa(iso: string): string {
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (j < 1) return "aujourd'hui";
  if (j < 30) return `il y a ${j} j`;
  if (j < 365) return `il y a ${Math.floor(j / 30)} mois`;
  const a = Math.floor(j / 365);
  return `il y a ${a} an${a > 1 ? "s" : ""}`;
}
function dateCourte(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
function dateLongue(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " à " + heure12(iso); }
function jourGroupe(iso: string): string {
  const d = new Date(iso); const auj = new Date(); const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (d.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === hier.toDateString()) return "Hier";
  return dateCourte(iso);
}
function formatPrix(p: number): string { return p.toLocaleString("fr-FR") + " " + DEVISE_LABEL; }
function initiales(nom: string): string { return nom.trim().split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join("").toUpperCase() || "?"; }

function Etoiles({ C, note }: { C: ThemeTokens; note: number }) {
  return (
    <span role="img" aria-label={`${note} sur 5`} style={{ display: "inline-flex", gap: "1px", fontSize: "15px", lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map(i => <span key={i} aria-hidden="true" style={{ color: i <= note ? C.orange : C.border2 }}>★</span>)}
    </span>
  );
}

const IcoCopier = <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const IcoOk = <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoTel = <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const IcoVide = <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;

function EtatVide({ C, titre, aide, action }: { C: ThemeTokens; titre: string; aide?: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 16px", color: C.t3 }}>
      {IcoVide}
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, marginTop: "8px" }}>{titre}</div>
      {aide && <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px" }}>{aide}</div>}
      {action && <div style={{ marginTop: "12px" }}>{action}</div>}
    </div>
  );
}

function Synthese({ C, titre, onVoirTout, children }: { C: ThemeTokens; titre: string; onVoirTout?: () => void; children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <h3 style={{ margin: 0, color: C.t1, fontSize: "14px", fontWeight: 600 }}>{titre}</h3>
        {onVoirTout && <button type="button" className="cix-btn tap" onClick={onVoirTout} style={{ background: "none", border: "none", color: C.t2, fontSize: "13px", cursor: "pointer", textDecoration: "underline", padding: "2px 4px" }}>Voir tout</button>}
      </div>
      {children}
    </section>
  );
}

const lignes = (n: number): React.CSSProperties => ({ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" });
const couleurKind = (k: FEntry["kind"], C: ThemeTokens) => k === "message" ? C.blue : k === "signalement" ? C.red : k === "rdv" ? C.green : C.t3;
const libelleKind = (k: FEntry["kind"]) => k === "message" ? "Message" : k === "signalement" ? "Signalement" : k === "rdv" ? "Rendez-vous" : "Autre";

type Onglet = "apercu" | "avis" | "messages" | "notes" | "factures" | "historique";

export function ClientFiche({
  C, client, readOnly, prochaineLabel, timeline, messages, messagesLoading, notes, notesLoading,
  noteType, onNoteType, newNoteText, onNewNoteText, savingNote, onAddNote,
  reponseOuverte, reponseTexte, onReponseOuverte, onReponseTexte, savingReponse, onSendReponse,
  sendingRappel, onRappel, phoneCopied, onCopy, onOuvrirMessagerie, onVoirFacturation, onClose,
}: {
  C: ThemeTokens; client: FClient; readOnly: boolean; prochaineLabel: string | null; timeline: FEntry[];
  messages: FMessage[]; messagesLoading: boolean; notes: FNote[]; notesLoading: boolean;
  noteType: FNoteType; onNoteType: (t: FNoteType) => void; newNoteText: string; onNewNoteText: (v: string) => void; savingNote: boolean; onAddNote: () => void;
  reponseOuverte: string | null; reponseTexte: string; onReponseOuverte: (id: string | null) => void; onReponseTexte: (v: string) => void; savingReponse: boolean; onSendReponse: (id: string) => void;
  sendingRappel: boolean; onRappel: () => void; phoneCopied: boolean; onCopy: () => void;
  onOuvrirMessagerie?: (citoyenId: string) => void; onVoirFacturation?: () => void; onClose: () => void;
}) {
  const ui = toUiTokens(C);
  const [onglet, setOnglet] = useState<Onglet>("apercu");
  const [filtre, setFiltre] = useState<"tout" | "message" | "rdv" | "signalement">("tout");
  const [deplies, setDeplies] = useState<string[]>([]);
  const nom = nomPropre(client.nom);
  const tel = client.phone ? formatTelephone(client.phone) : "";
  const moyenne = client.avis.length > 0 ? client.avis.reduce((s, a) => s + a.note, 0) / client.avis.length : null;
  const derniereNote = useMemo(() => notes.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null, [notes]);
  const noteDef = NOTE_TYPES.find(t => t.key === noteType) ?? NOTE_TYPES[0];
  const notesDuType = notes.filter(n => n.type === noteType);
  const soumettreNote = () => { if (!savingNote && newNoteText.trim()) onAddNote(); };

  const carre: React.CSSProperties = { height: "34px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "13px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", boxSizing: "border-box" };

  const tabs = [
    { key: "apercu", label: "Vue d'ensemble" },
    { key: "avis", label: "Avis", count: client.avis.length },
    { key: "messages", label: "Messages" },
    { key: "notes", label: "Notes" },
    { key: "factures", label: "Factures" },
    { key: "historique", label: "Historique" },
  ];

  const entete = (
    <div style={{ display: "flex", alignItems: "center", gap: "12px 16px", flex: 1, minWidth: 0, flexWrap: "wrap" }}>
      <span aria-hidden="true" style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "20px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initiales(client.nom)}</span>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <h2 id="client-fiche-titre" style={{ margin: 0, color: C.t1, fontSize: "20px", fontWeight: 600, overflowWrap: "anywhere" }}>{nom}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
          {tel && <button type="button" className="cix-btn tap" onClick={onCopy} title="Copier le numéro" style={{ background: "none", border: "none", padding: 0, color: C.t2, fontSize: "13px", cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{tel}</button>}
          <StatusPill label={client.est_nouveau ? "Nouveau" : "Régulier"} color={client.est_nouveau ? C.blue : C.green}/>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {tel && (
          <>
            <button type="button" className="cix-btn tap" onClick={onCopy} aria-label="Copier le numéro" style={carre}>{phoneCopied ? IcoOk : IcoCopier}<span className="cf-lbl">{phoneCopied ? "Copié" : "Copier le numéro"}</span></button>
            <a href={`tel:${client.phone}`} className="cix-btn tap" aria-label="Appeler" style={carre}>{IcoTel}<span className="cf-lbl">Appeler</span></a>
          </>
        )}
        {!readOnly && <Button tokens={ui} className="tap" variant="primary" size="sm" loading={sendingRappel} onClick={onRappel}>Envoyer un rappel</Button>}
      </div>
    </div>
  );

  const sousEntete = (
    <div style={{ flexShrink: 0, padding: "16px 24px 0" }}>
      <AttendanceSummary C={C} items={[
        { key: "rdv", label: "Rendez-vous", value: String(client.nb_rdv) },
        { key: "depuis", label: "Client depuis", titre: ilYa(client.premiere_visite), value: new Date(client.premiere_visite).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) },
        { key: "statut", label: "Statut", value: client.est_nouveau ? "Nouveau" : "Régulier" },
      ]}/>
      <ClockTabs C={C} tabs={tabs} active={onglet} onChange={k => setOnglet(k as Onglet)} marge={0} ariaLabel="Sections de la fiche client" idPrefix="cf-tab"/>
    </div>
  );

  // ── Panneaux ───────────────────────────────────────────────────────────
  const dernierMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const dernierAvis = client.avis.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  const apercu = (
    <div className="cf-grid">
      {prochaineLabel && (
        <Synthese C={C} titre="Prochaine étape"><div style={{ color: C.t1, fontSize: "14px", overflowWrap: "anywhere" }}>{prochaineLabel}</div></Synthese>
      )}
      <Synthese C={C} titre="Dernier avis" onVoirTout={client.avis.length > 0 ? () => setOnglet("avis") : undefined}>
        {dernierAvis ? (<>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><Etoiles C={C} note={dernierAvis.note}/><span title={dateLongue(dernierAvis.created_at)} style={{ color: C.t3, fontSize: "12px" }}>{ilYa(dernierAvis.created_at)}</span></div>
          {dernierAvis.commentaire ? <p style={{ margin: 0, color: C.t2, fontSize: "13px", lineHeight: 1.5, ...lignes(2) }}>{dernierAvis.commentaire}</p> : <p style={{ margin: 0, color: C.t3, fontSize: "13px", fontStyle: "italic" }}>Aucun commentaire</p>}
        </>) : <span style={{ color: C.t3, fontSize: "13px" }}>Aucun avis</span>}
      </Synthese>
      <Synthese C={C} titre="Dernier message" onVoirTout={messages.length > 0 ? () => setOnglet("messages") : undefined}>
        {dernierMsg ? (<>
          <div style={{ color: C.t3, fontSize: "12px" }}>{dernierMsg.emetteur === "institution" ? "Message envoyé" : "Message reçu"} · <span title={dateLongue(dernierMsg.cree_le)}>{ilYa(dernierMsg.cree_le)}</span></div>
          <p style={{ margin: 0, color: C.t2, fontSize: "13px", lineHeight: 1.5, ...lignes(2) }}>{dernierMsg.contenu}</p>
        </>) : <span style={{ color: C.t3, fontSize: "13px" }}>{messagesLoading ? "Chargement…" : "Aucun message"}</span>}
      </Synthese>
      <Synthese C={C} titre="Dernière note" onVoirTout={notes.length > 0 ? () => setOnglet("notes") : undefined}>
        {derniereNote ? (<>
          <div style={{ color: C.t3, fontSize: "12px" }}>{derniereNote.auteur_moi ? "Vous" : derniereNote.auteur_nom} · <span title={dateLongue(derniereNote.created_at)}>{ilYa(derniereNote.created_at)}</span></div>
          <p style={{ margin: 0, color: C.t2, fontSize: "13px", lineHeight: 1.5, ...lignes(2) }}>{derniereNote.contenu}</p>
        </>) : <span style={{ color: C.t3, fontSize: "13px" }}>{notesLoading ? "Chargement…" : "Aucune note"}</span>}
      </Synthese>
      <Synthese C={C} titre="Dernière facture" onVoirTout={client.factures_resume && client.factures_resume.total > 0 ? () => setOnglet("factures") : undefined}>
        {client.factures_resume && client.factures_resume.total > 0
          ? <div style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{client.factures_resume.total} facture{client.factures_resume.total > 1 ? "s" : ""} · {client.factures_resume.payees} payée{client.factures_resume.payees > 1 ? "s" : ""} · {client.factures_resume.en_attente} en attente</div>
          : <span style={{ color: C.t3, fontSize: "13px" }}>Aucune facture</span>}
      </Synthese>
      <Synthese C={C} titre="Derniers événements" onVoirTout={timeline.length > 0 ? () => setOnglet("historique") : undefined}>
        {timeline.length === 0 ? <span style={{ color: C.t3, fontSize: "13px" }}>Aucun événement</span> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            {timeline.slice(0, 3).map(e => (
              <li key={e.id} style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: couleurKind(e.kind, C), flexShrink: 0 }}/>
                <span style={{ color: C.t1, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{e.label}</span>
                <span style={{ color: C.t3, fontSize: "12px", whiteSpace: "nowrap" }}>{dateCourte(e.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Synthese>
    </div>
  );

  const avis = client.avis.length === 0 ? <EtatVide C={C} titre="Aucun avis" aide="Les avis laissés par ce client apparaîtront ici."/> : (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div aria-live="polite" style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{client.avis.length} avis{moyenne !== null && <> · Note moyenne {moyenne.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 5</>}</div>
      {client.avis.map(a => {
        const long = a.commentaire.length > 220;
        const ouvert = deplies.includes(a.id);
        return (
          <article key={a.id} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
              <Etoiles C={C} note={a.note}/>
              <span title={dateLongue(a.created_at)} style={{ color: C.t3, fontSize: "12px" }}>{ilYa(a.created_at)} · {dateCourte(a.created_at)}</span>
            </div>
            {a.commentaire ? (<>
              <p style={{ margin: 0, color: C.t1, fontSize: "14px", lineHeight: 1.55, ...(long && !ouvert ? lignes(4) : { overflowWrap: "anywhere" }) }}>{a.commentaire}</p>
              {long && <button type="button" className="cix-btn tap" onClick={() => setDeplies(d => ouvert ? d.filter(x => x !== a.id) : [...d, a.id])} style={{ background: "none", border: "none", padding: "4px 0 0", color: C.t2, fontSize: "13px", textDecoration: "underline", cursor: "pointer" }}>{ouvert ? "Voir moins" : "Voir plus"}</button>}
            </>) : <p style={{ margin: 0, color: C.t3, fontSize: "13px", fontStyle: "italic" }}>Aucun commentaire</p>}

            {a.reponse_institution ? (
              <div style={{ marginTop: "12px", marginLeft: "12px", borderLeft: `2px solid ${C.gold}`, backgroundColor: C.bgCard2, padding: "10px 12px", borderRadius: "0 8px 8px 0" }}>
                <div style={{ color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "2px" }}>Votre réponse{a.reponse_le ? ` · ${dateCourte(a.reponse_le)}` : ""}</div>
                <div style={{ color: C.t1, fontSize: "13px", lineHeight: 1.5, overflowWrap: "anywhere" }}>{a.reponse_institution}</div>
              </div>
            ) : reponseOuverte === a.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                <textarea aria-label="Votre réponse" className="cix-input" value={reponseTexte} onChange={e => onReponseTexte(e.target.value)} rows={3} placeholder="Votre réponse…"
                  style={{ width: "100%", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "10px 12px", fontSize: "14px", color: C.t1, resize: "vertical", fontFamily: "inherit" }}/>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => { onReponseOuverte(null); onReponseTexte(""); }}>Annuler</Button>
                  <Button tokens={ui} className="tap" variant="primary" size="sm" loading={savingReponse} disabled={!reponseTexte.trim()} onClick={() => onSendReponse(a.id)}>Envoyer</Button>
                </div>
              </div>
            ) : !readOnly && (
              <div style={{ marginTop: "12px" }}><Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => { onReponseOuverte(a.id); onReponseTexte(""); }}>Répondre</Button></div>
            )}
          </article>
        );
      })}
    </div>
  );

  let dernierJour = "";
  const messagesUi = (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {onOuvrirMessagerie && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="cix-btn tap" onClick={() => onOuvrirMessagerie(client.id)} style={carre}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Ouvrir la conversation
          </button>
        </div>
      )}
      {messagesLoading ? <div role="status" aria-label="Chargement des messages" className="cix-skel" style={{ height: "120px", borderRadius: "12px" }}/>
        : messages.length === 0 ? <EtatVide C={C} titre="Aucun échange pour l'instant" aide={`Vos échanges avec ${nom} apparaîtront ici dès qu'une conversation aura eu lieu.`}/>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {messages.map(m => {
              const jour = jourGroupe(m.cree_le);
              const sep = jour !== dernierJour; dernierJour = jour;
              const envoye = m.emetteur === "institution";
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {sep && <div style={{ textAlign: "center", color: C.t3, fontSize: "12px", margin: "6px 0 2px" }}>{jour}</div>}
                  <div style={{ display: "flex", justifyContent: envoye ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "75%", backgroundColor: envoye ? `${C.gold}1a` : C.bg3, borderRadius: "12px", padding: "8px 12px" }}>
                      <div style={{ color: C.t1, fontSize: "14px", lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{m.contenu}</div>
                      <div title={dateLongue(m.cree_le)} style={{ color: C.t3, fontSize: "12px", marginTop: "2px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{envoye ? "Envoyé" : "Reçu"} · {heure12(m.cree_le)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );

  const notesUi = (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div role="group" aria-label="Type de note" style={{ display: "flex", gap: "2px", overflowX: "auto", borderBottom: `1px solid ${C.border}` }}>
        {NOTE_TYPES.map(t => {
          const on = t.key === noteType;
          return (
            <button key={t.key} type="button" aria-pressed={on} onClick={() => onNoteType(t.key)} className="cix-btn tap"
              style={{ height: "36px", padding: "0 10px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, marginBottom: "-1px", color: on ? C.t1 : C.t2, fontSize: "13.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {t.label}<span style={{ color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{notes.filter(n => n.type === t.key).length}</span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {notesLoading ? <div role="status" aria-label="Chargement des notes" className="cix-skel" style={{ height: "96px", borderRadius: "12px" }}/>
          : notesDuType.length === 0 ? <EtatVide C={C} titre={noteDef.vide} aide={readOnly ? undefined : "Ajoutez la première ci-dessous."}/>
          : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard }}>
              {notesDuType.map((n, i) => (
                <li key={n.id} style={{ padding: "12px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ color: C.t1, fontSize: "13px", fontWeight: 600 }}>{n.auteur_moi ? "Vous" : n.auteur_nom}</span>
                    <span title={dateLongue(n.created_at)} style={{ color: C.t3, fontSize: "12px" }}>{ilYa(n.created_at)} · {dateCourte(n.created_at)}</span>
                  </div>
                  <div style={{ color: C.t2, fontSize: "14px", lineHeight: 1.55, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{n.contenu}</div>
                </li>
              ))}
            </ul>
          )}
      </div>
      {!readOnly && (
        <div>
          <label htmlFor="cf-note" style={{ display: "block", color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>{noteDef.champ}</label>
          <textarea id="cf-note" className="cix-input" rows={3} value={newNoteText} onChange={e => onNewNoteText(e.target.value)} placeholder={noteDef.placeholder}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); soumettreNote(); } }}
            style={{ width: "100%", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "10px 12px", fontSize: "14px", color: C.t1, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}/>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "8px" }}>
            <span style={{ color: C.t3, fontSize: "12px" }}>Ctrl + Entrée pour ajouter</span>
            <Button tokens={ui} className="tap" variant="primary" size="md" loading={savingNote} disabled={!newNoteText.trim()} onClick={soumettreNote}>Ajouter</Button>
          </div>
        </div>
      )}
    </div>
  );

  const fr = client.factures_resume;
  const facturesUi = !fr || fr.total === 0 ? (
    <EtatVide C={C} titre="Aucune facture pour ce client" action={onVoirFacturation ? <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onVoirFacturation}>Voir toutes les factures</Button> : undefined}/>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden" }}>
        <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Résumé des factures</caption>
        <thead><tr style={{ backgroundColor: C.bgCard2 }}><th scope="col" style={{ textAlign: "left", padding: "10px 16px", color: C.t2, fontSize: "12px", fontWeight: 500 }}>Statut</th><th scope="col" style={{ textAlign: "right", padding: "10px 16px", color: C.t2, fontSize: "12px", fontWeight: 500 }}>Factures</th></tr></thead>
        <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
          {[{ l: "Total", v: fr.total }, { l: "Payées", v: fr.payees }, { l: "En attente", v: fr.en_attente }].map(r => (
            <tr key={r.l}><th scope="row" style={{ textAlign: "left", padding: "10px 16px", borderTop: `1px solid ${C.border}`, color: C.t1, fontSize: "14px", fontWeight: 400 }}>{r.l}</th><td style={{ textAlign: "right", padding: "10px 16px", borderTop: `1px solid ${C.border}`, color: C.t1, fontSize: "14px" }}>{r.v}</td></tr>
          ))}
          {fr.a_encaisser > 0 && <tr><th scope="row" style={{ textAlign: "left", padding: "10px 16px", borderTop: `1px solid ${C.border}`, color: C.t1, fontSize: "14px", fontWeight: 400 }}>À encaisser</th><td style={{ textAlign: "right", padding: "10px 16px", borderTop: `1px solid ${C.border}`, color: C.orange, fontSize: "14px", fontWeight: 600 }}>{formatPrix(fr.a_encaisser)}</td></tr>}
        </tbody>
      </table>
      {onVoirFacturation && <div><Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onVoirFacturation}>Voir toutes les factures</Button></div>}
    </div>
  );

  const visibles = timeline.filter(e => filtre === "tout" || e.kind === filtre);
  const groupes = (() => { const m = new Map<string, FEntry[]>(); for (const e of visibles) { const k = jourGroupe(e.date); m.set(k, [...(m.get(k) ?? []), e]); } return [...m.entries()]; })();
  const historique = timeline.length === 0 ? <EtatVide C={C} titre="Aucun événement" aide="L'historique de ce client apparaîtra ici."/> : (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div role="group" aria-label="Filtrer l'historique" style={{ display: "flex", gap: "2px", overflowX: "auto", borderBottom: `1px solid ${C.border}` }}>
        {([["tout", "Tout"], ["message", "Messages"], ["rdv", "Rendez-vous"], ["signalement", "Signalements"]] as const).map(([k, l]) => {
          const on = filtre === k;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => setFiltre(k)} className="cix-btn tap"
              style={{ height: "36px", padding: "0 10px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, marginBottom: "-1px", color: on ? C.t1 : C.t2, fontSize: "13.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>
          );
        })}
      </div>
      <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {groupes.length === 0 && <span style={{ color: C.t3, fontSize: "13px" }}>Aucun événement de ce type.</span>}
        {groupes.map(([jour, items]) => (
          <section key={jour}>
            <h3 style={{ margin: "0 0 8px", color: C.t1, fontSize: "13px", fontWeight: 600 }}>{jour}</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map(e => (
                <li key={e.id} style={{ display: "grid", gridTemplateColumns: "72px 10px minmax(0,1fr)", gap: "10px", alignItems: "baseline" }}>
                  <span style={{ color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{heure12(e.date)}</span>
                  <span role="img" aria-label={libelleKind(e.kind)} style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: couleurKind(e.kind, C), alignSelf: "center" }}/>
                  <div style={{ minWidth: 0 }}>
                    {e.kind === "message" ? (
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ color: C.t1, fontSize: "14px" }}>{e.label}</span>
                        {e.sublabel && <span style={{ color: C.t3, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "320px" }}>{e.sublabel}</span>}
                        <button type="button" className="cix-btn tap" onClick={() => setOnglet("messages")} style={{ background: "none", border: "none", padding: 0, color: C.t2, fontSize: "13px", textDecoration: "underline", cursor: "pointer" }}>Voir dans Messages</button>
                      </div>
                    ) : (<>
                      <div style={{ color: C.t1, fontSize: "14px", overflowWrap: "anywhere" }}>{e.label}</div>
                      {e.sublabel && <div style={{ color: C.t3, fontSize: "13px", overflowWrap: "anywhere" }}>{e.sublabel}</div>}
                    </>)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );

  const panneaux: Record<Onglet, React.ReactNode> = { apercu, avis, messages: messagesUi, notes: notesUi, factures: facturesUi, historique };

  return (
    <>
      <ClockStyles C={C}/>
      <style>{`
        .cf-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
        @media(min-width:1024px){.cf-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .cf-lbl{display:none}
        @media(min-width:1024px){.cf-lbl{display:inline}}
        @media(max-width:767px){.cix-modal{max-height:100svh!important;height:100svh;border-radius:0!important}}
      `}</style>
      <ClockModal C={C} titre={nom} labelId="client-fiche-titre" largeur={1040} onClose={onClose} modifie={false} entete={entete} sousEntete={sousEntete}>
        <div role="tabpanel" id={`cf-panel-${onglet}`} aria-labelledby={`cf-tab-${onglet}`}>{panneaux[onglet]}</div>
      </ClockModal>
    </>
  );
}
