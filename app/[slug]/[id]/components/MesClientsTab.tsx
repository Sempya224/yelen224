"use client";

// Onglet "Mes clients" — fiche client + timeline des RDV avec CETTE
// institution uniquement (jamais tous les citoyens de la plateforme).
// Remplace le prototype MiniCRM (page.tsx, notes en localStorage) : les
// notes internes sont ici persistées côté serveur via notes_clients
// (migration 20260712000003), à travers /api/institution/clients.
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLogo } from "@/components/YelenLogo";
import { EmptyState } from "@/components/EmptyState";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";

// Icône humaine locale — même convention que ACCES_LABEL ci-dessous,
// petit helper dupliqué par fichier plutôt que sur-partagé.
function HumanIcon({ color }: { color: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}

type Paiement = { service_nom: string; prix: number; statut: string };
type Historique = { id: string; date_rdv: string; heure_rdv: string; objet: string | null; statut: string; notes: string | null; paiement: Paiement | null; presence_status: string | null; presence_confirmed_at: string | null };
type Avis = { id: string; note: number; commentaire: string; reponse_institution: string | null; reponse_le: string | null; created_at: string };
type Signalement = { titre: string; motif: string; statut: string; created_at: string };
type Tache = { id: string; titre: string; statut: string; created_at: string };
type FacturesResume = { total: number; payees: number; en_attente: number; a_encaisser: number };
type Client = {
  id: string; nom: string; phone: string; nb_rdv: number;
  dernier_rdv: string; dernier_statut: string; premiere_visite: string; est_nouveau: boolean;
  note: string; historique: Historique[]; avis: Avis[]; signalements: Signalement[]; taches: Tache[];
  factures_resume?: FacturesResume;
};
type TimelineItem = { id: string; date: string; label: string; sublabel?: string; color: string; bg: string };
type AccesEntree = { id: string; membre_nom: string; action: string; created_at: string };
type Message = { id: string; contenu: string; lu: boolean; cree_le: string; emetteur: "citoyen" | "institution" };
type TypeNote = "privee" | "publique" | "commentaire" | "observation" | "compte_rendu";
type NoteEntry = { id: string; type: TypeNote; contenu: string; created_at: string; auteur_nom: string; auteur_moi: boolean };

const NOTE_TYPES: { key: TypeNote; label: string }[] = [
  { key: "privee", label: "Privées" },
  { key: "publique", label: "Publiques" },
  { key: "commentaire", label: "Commentaires" },
  { key: "observation", label: "Observations" },
  { key: "compte_rendu", label: "Compte rendu" },
];

// Sous-ensemble minimal du statut des paid_bookings — même esprit que
// statutInfo() dans ServicesTab.tsx, pas de nouvel export partagé.
const PAIEMENT_STATUT: Record<string, string> = {
  en_attente: "En attente", confirme: "Confirmé", termine: "Terminé",
  no_show: "No-show", annule: "Annulé",
};
function paiementColor(statut: string, C: ThemeTokens): { c: string; bg: string } {
  switch (statut) {
    case "confirme":
    case "termine":  return { c: C.green, bg: C.greenL };
    case "no_show":
    case "annule":   return { c: C.red,   bg: C.redL };
    default:         return { c: C.orange, bg: C.orangeL };
  }
}
function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " " + DEVISE_LABEL;
}

// Sous-ensemble minimal des libellés de JournalTab.tsx (non exporté) —
// seules les actions pouvant cibler un citoyen ou l'un de ses RDV.
const ACCES_LABEL: Record<string, string> = {
  note_client_modifiee: "a modifié la note interne",
  rappel_envoye: "a envoyé un rappel",
  message_envoye: "a envoyé un message",
  rdv_accepte: "a accepté un rendez-vous",
  rdv_refuse: "a refusé un rendez-vous",
  rdv_termine: "a marqué un rendez-vous terminé",
  rdv_absent: "a marqué le client absent",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const j = Math.floor(diff / 86400000);
  if (j < 1) return "Aujourd'hui";
  if (j < 30) return `Il y a ${j}j`;
  if (j < 365) return `Il y a ${Math.floor(j / 30)}mois`;
  return `Il y a ${Math.floor(j / 365)}an(s)`;
}

// Regroupement par jour pour la Timeline — même esprit que libelleJour()
// dans JournalTab.tsx, dupliqué ici (petit helper, convention du projet).
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const hier = new Date(); hier.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Aujourd'hui";
  if (sameDay(d, hier)) return "Hier";
  const diffDays = Math.abs(Math.floor((today.getTime() - d.getTime()) / 86400000));
  if (diffDays <= 6) return d.toLocaleDateString("fr-FR", { weekday: "long" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function stColor(statut: string, C: ThemeTokens): { c: string; bg: string; l: string } {
  switch (statut) {
    case "confirme":   return { c: C.green,  bg: C.greenL,  l: "Confirmé" };
    case "en_attente": return { c: C.gold,   bg: `${C.gold}20`, l: "En attente" };
    case "nouveau":    return { c: C.gold,   bg: `${C.gold}20`, l: "Nouveau" };
    case "annule":     return { c: C.red,    bg: C.redL,    l: "Annulé" };
    case "absent":     return { c: C.red,    bg: C.redL,    l: "Absent" };
    case "en_retard":  return { c: C.orange, bg: C.orangeL, l: "Non traité" };
    case "effectue":   return { c: C.blue,   bg: C.blueL,   l: "Effectué" };
    case "termine":    return { c: C.purple, bg: C.purpleL, l: "Terminé" };
    case "honore":     return { c: C.green,  bg: C.greenL,  l: "Honoré" };
    default:           return { c: C.t2,     bg: C.bg3,     l: statut };
  }
}

type TriClients = "recents" | "fideles" | "nouveaux" | "occasionnels" | "a_reactiver";

export function MesClientsTab({ instId, onToast, isAdmin, access = "full", onOuvrirMessagerie, onVoirFacturation, initialClientId, onInitialClientConsumed, initialSortBy, onInitialSortByConsumed, initialSearch, onInitialSearchConsumed }: { instId: string; onToast: (msg: string, color?: string) => void; isAdmin: boolean; access?: "full" | "read"; onOuvrirMessagerie?: (citoyenId: string) => void; onVoirFacturation?: () => void; initialClientId?: string | null; onInitialClientConsumed?: () => void; initialSortBy?: TriClients | null; onInitialSortByConsumed?: () => void; initialSearch?: string | null; onInitialSearchConsumed?: () => void }) {
  const readOnly = access === "read";
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<TriClients>("recents");
  const [selected, setSelected] = useState<Client | null>(null);
  const [acces, setAcces] = useState<AccesEntree[]>([]);
  const [, setAccesLoading] = useState(false);
  const [sendingRappel, setSendingRappel] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [notesEntries, setNotesEntries] = useState<NoteEntry[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteTypeSelected, setNoteTypeSelected] = useState<TypeNote>("privee");
  const [newNoteText, setNewNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [reponseOuverte, setReponseOuverte] = useState<string | null>(null);
  const [reponseTexte, setReponseTexte] = useState("");
  const [savingReponse, setSavingReponse] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/institution/clients");
      const j = await res.json().catch(() => null);
      setClients(res.ok ? (j?.clients ?? []) : []);
      setLoading(false);
    })();
  }, [instId]);

  // Ouverture directe depuis une autre carte (ex: modale RDV "Voir ce
  // client") — consomme initialClientId une fois trouvé, sans le remettre
  // dans les deps pour ne pas rouvrir la fiche si le citoyen navigue vers
  // un autre client ensuite.
  useEffect(() => {
    if (!initialClientId || clients.length === 0) return;
    const match = clients.find(c => c.id === initialClientId);
    if (match) setSelected(match);
    onInitialClientConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClientId, clients]);

  // Arrivée depuis "Mes clients" du Centre d'Analyse (Voir le segment /
  // Voir tous les clients / recherche) — même pattern de consommation que
  // initialClientId ci-dessus.
  useEffect(() => {
    if (!initialSortBy) return;
    setSortBy(initialSortBy);
    onInitialSortByConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSortBy]);

  useEffect(() => {
    if (initialSearch === undefined || initialSearch === null) return;
    setSearch(initialSearch);
    onInitialSearchConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch]);

  // Hydratation de la fiche détail — la liste ne charge plus que le résumé
  // (voir app/api/institution/clients/route.ts, correctif 09/09/2026 : "Mes
  // clients" nettement plus lent que le reste du dashboard car il
  // rapatriait l'historique/avis/signalements/tâches COMPLETS de TOUS les
  // clients dès le chargement initial). Historique/avis/signalements/
  // tâches réels ne sont chargés qu'ici, à l'ouverture d'une fiche —
  // dépendance sur l'id seul pour ne jamais reboucler quand ce même effet
  // remplace ensuite selected par la version hydratée.
  useEffect(() => {
    if (!selected) return;
    let annule = false;
    (async () => {
      const res = await fetch(`/api/institution/clients?citoyen_id=${selected.id}`);
      const j = await res.json().catch(() => null);
      if (annule || !res.ok || !j?.client) return;
      setSelected(prev => (prev && prev.id === j.client.id) ? { ...prev, ...j.client } : prev);
      setClients(prev => prev.map(c => c.id === j.client.id ? { ...c, ...j.client } : c));
    })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    (async () => {
      setMessagesLoading(true);
      const res = await fetch(`/api/institution/messages?citoyen_id=${selected.id}`);
      const j = await res.json().catch(() => null);
      setMessages(res.ok ? (j?.messages ?? []) : []);
      setMessagesLoading(false);
    })();
  }, [selected]);

  useEffect(() => {
    if (!selected || !isAdmin) { setAcces([]); return; }
    (async () => {
      setAccesLoading(true);
      const ids = [selected.id, ...selected.historique.map(h => h.id)].join(",");
      const res = await fetch(`/api/institution/journal?cible_ids=${ids}&limit=20`);
      const j = await res.json().catch(() => null);
      setAcces(res.ok ? (j?.entrees ?? []) : []);
      setAccesLoading(false);
    })();
  }, [selected, isAdmin]);

  async function loadNotes(citoyenId: string) {
    setNotesLoading(true);
    const res = await fetch(`/api/institution/notes-client?citoyen_id=${citoyenId}`);
    const j = await res.json().catch(() => null);
    setNotesEntries(res.ok ? (j?.notes ?? []) : []);
    setNotesLoading(false);
  }

  useEffect(() => {
    if (!selected) { setNotesEntries([]); return; }
    loadNotes(selected.id);
  }, [selected?.id]);

  const filtered = useMemo(() => {
    return clients
      .filter(c => !search || c.nom.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
      .sort((a, b) => {
        if (sortBy === "fideles") return b.nb_rdv - a.nb_rdv;
        if (sortBy === "nouveaux") return (b.est_nouveau ? 1 : 0) - (a.est_nouveau ? 1 : 0);
        if (sortBy === "occasionnels") {
          const estOcc = (c: Client) => c.nb_rdv >= 2 && c.nb_rdv <= 5 ? 1 : 0;
          return estOcc(b) - estOcc(a);
        }
        if (sortBy === "a_reactiver") return new Date(a.dernier_rdv).getTime() - new Date(b.dernier_rdv).getTime();
        return new Date(b.dernier_rdv).getTime() - new Date(a.dernier_rdv).getTime();
      });
  }, [clients, search, sortBy]);

  // Prochaine étape — le plus proche RDV futur non annulé, mis en avant
  // séparément plutôt que noyé dans le fil du passé.
  const prochaineEtape = useMemo(() => {
    if (!selected) return null;
    const now = new Date();
    return selected.historique
      .filter(h => h.statut !== "annule" && new Date(`${h.date_rdv}T${h.heure_rdv || "00:00"}`) > now)
      .sort((a, b) => new Date(`${a.date_rdv}T${a.heure_rdv || "00:00"}`).getTime() - new Date(`${b.date_rdv}T${b.heure_rdv || "00:00"}`).getTime())[0] ?? null;
  }, [selected]);

  // Timeline — fusion de tout ce qui est déjà chargé pour ce client
  // (historique RDV + présence QR + paiement, avis, signalements admin,
  // tâches liées, historique d'accès admin, messages) en un seul fil
  // chronologique. Rien de manuel : chaque entrée vient d'une donnée
  // déjà écrite ailleurs par le système.
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!selected) return [];
    const items: TimelineItem[] = [];

    for (const h of selected.historique) {
      if (prochaineEtape && h.id === prochaineEtape.id) continue;
      const sc = stColor(h.statut, C);
      items.push({ id: `rdv-${h.id}`, date: `${h.date_rdv}T${h.heure_rdv || "00:00"}`, label: h.objet || "RDV général", sublabel: sc.l, color: sc.c, bg: sc.bg });
      if (h.presence_status === "present" && h.presence_confirmed_at) {
        items.push({ id: `presence-${h.id}`, date: h.presence_confirmed_at, label: "Présence confirmée", sublabel: "Arrivée enregistrée (QR)", color: C.teal, bg: C.tealL });
      }
      if (h.paiement) {
        const pc = paiementColor(h.paiement.statut, C);
        items.push({ id: `paiement-${h.id}`, date: `${h.date_rdv}T${h.heure_rdv || "00:00"}`, label: `${h.paiement.service_nom} · ${formatPrix(h.paiement.prix)}`, sublabel: PAIEMENT_STATUT[h.paiement.statut] ?? h.paiement.statut, color: pc.c, bg: pc.bg });
      }
    }
    // Avis retirés de ce fil générique (Lot E, chantier Avis + Favoris
    // citoyen) — déplacés dans leur propre section ci-dessous, seule façon
    // d'y accrocher une réponse d'établissement sans complexifier
    // TimelineItem (utilisé aussi par rdv/paiement/signalement/tâche/accès/
    // message, aucun autre type n'a besoin d'une action interactive).
    if (isAdmin) {
      for (const s of selected.signalements) {
        items.push({ id: `signal-${s.created_at}`, date: s.created_at, label: `Signalement : ${s.titre}`, sublabel: s.motif, color: C.red, bg: C.redL });
      }
    }
    for (const t of selected.taches) {
      items.push({ id: `tache-${t.id}`, date: t.created_at, label: `Tâche : ${t.titre}`, sublabel: t.statut, color: C.teal, bg: C.tealL });
    }
    if (isAdmin) {
      for (const a of acces) {
        items.push({ id: `acces-${a.id}`, date: a.created_at, label: `${a.membre_nom} ${ACCES_LABEL[a.action] ?? a.action}`, color: C.t2, bg: C.bg3 });
      }
    }
    for (const m of messages) {
      items.push({ id: `msg-${m.id}`, date: m.cree_le, label: m.emetteur === "institution" ? "Message envoyé" : "Message reçu", sublabel: m.contenu, color: C.blue, bg: C.blueL });
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selected, acces, messages, isAdmin, C]);

  const timelineGroups = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const item of timeline) {
      const key = dayLabel(item.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [timeline]);

  async function envoyerReponse(avisId: string) {
    if (!reponseTexte.trim()) return;
    setSavingReponse(true);
    const res = await fetch("/api/institution/avis/repondre", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avisId, reponse: reponseTexte.trim() }),
    });
    const j = await res.json().catch(() => null);
    setSavingReponse(false);
    if (!res.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    const reponseLe = new Date().toISOString();
    setSelected(prev => prev ? { ...prev, avis: prev.avis.map(a => a.id === avisId ? { ...a, reponse_institution: reponseTexte.trim(), reponse_le: reponseLe } : a) } : prev);
    setReponseOuverte(null);
    setReponseTexte("");
    onToast("Réponse envoyée", C.gold);
  }

  async function ajouterNote() {
    if (!selected || !newNoteText.trim()) return;
    setSavingNote(true);
    const res = await fetch("/api/institution/notes-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ citoyen_id: selected.id, type: noteTypeSelected, contenu: newNoteText.trim() }),
    });
    const j = await res.json().catch(() => null);
    setSavingNote(false);
    if (!res.ok) { onToast(j?.error || "Erreur de sauvegarde", C.red); return; }
    setNewNoteText("");
    onToast("Note ajoutée", C.purple);
    loadNotes(selected.id);
  }

  async function envoyerRappel() {
    if (!selected || !selected.historique.length) return;
    const dernier = selected.historique.slice().sort((a, b) => new Date(b.date_rdv).getTime() - new Date(a.date_rdv).getTime())[0];
    setSendingRappel(true);
    const res = await fetch("/api/institution/rdv-historique", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rdv_id: dernier.id }),
    });
    const j = await res.json().catch(() => null);
    setSendingRappel(false);
    if (!res.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    onToast("Rappel envoyé", C.gold);
  }

  function copyPhone() {
    if (!selected?.phone) return;
    navigator.clipboard.writeText(selected.phone);
    setPhoneCopied(true);
    setTimeout(() => setPhoneCopied(false), 1600);
  }

  if (loading) {
    return (
      <div style={{ padding: "16px" }}>
        <style>{`@keyframes client-shimmer{0%{background-position:-120% 0}100%{background-position:120% 0}}`}</style>
        <div style={{ width: "140px", height: "22px", borderRadius: "6px", backgroundColor: C.bg3, marginBottom: "16px" }}/>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
          {[0, 1, 2].map(i => <div key={i} style={{ height: "52px", borderRadius: "12px", backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}/>)}
        </div>
        <Card tokens={toCardTokens(C)} noPadding>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ padding: "13px 16px", borderBottom: i < 3 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: C.bg3, flexShrink: 0 }}/>
              <div style={{ flex: 1 }}>
                <div style={{ width: "45%", height: "12px", borderRadius: "4px", background: `linear-gradient(90deg, ${C.bg3} 25%, ${C.border2} 50%, ${C.bg3} 75%)`, backgroundSize: "200% 100%", animation: "client-shimmer 1.4s ease-in-out infinite", marginBottom: "8px" }}/>
                <div style={{ width: "65%", height: "10px", borderRadius: "4px", background: `linear-gradient(90deg, ${C.bg3} 25%, ${C.border2} 50%, ${C.bg3} 75%)`, backgroundSize: "200% 100%", animation: "client-shimmer 1.4s ease-in-out infinite" }}/>
              </div>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "6px" }}>Mes clients</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px", lineHeight: 1.5 }}>
        Chaque citoyen ayant déjà eu au moins un rendez-vous avec votre établissement, avec son historique complet.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
        {[
          { label: "Total", value: clients.length, color: C.purple },
          { label: "Fidèles (3+)", value: clients.filter(c => c.nb_rdv >= 3).length, color: C.green },
          { label: "Nouveaux (30j)", value: clients.filter(c => c.est_nouveau).length, color: C.gold },
        ].map(s => (
          <Card key={s.label} tokens={toCardTokens(C)} padding="12px 8px" style={{ textAlign: "center" }}>
            <div style={{ color: s.color, fontSize: "18px", fontWeight: "800" }}>{s.value}</div>
            <div style={{ color: C.t3, fontSize: "9px", fontWeight: "700" }}>{s.label}</div>
          </Card>
        ))}
      </div>

      <Card tokens={toCardTokens(C)} padding="0 12px" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client (nom, téléphone)…" style={{ flex: 1, padding: "11px 0", fontSize: "13px" }}/>
      </Card>

      <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
        {([{ key: "recents", label: "Récents" }, { key: "fideles", label: "Fidèles" }, { key: "nouveaux", label: "Nouveaux" }, { key: "occasionnels", label: "Occasionnels" }, { key: "a_reactiver", label: "À réactiver" }] as const).map(s => (
          <button key={s.key} onClick={() => setSortBy(s.key)} className="tap" style={{ flex: 1, backgroundColor: sortBy === s.key ? `${C.purple}20` : C.bgCard, border: `1px solid ${sortBy === s.key ? C.purple + "40" : C.border}`, borderRadius: "10px", padding: "8px", color: sortBy === s.key ? C.purple : C.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>{s.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding={clients.length === 0 ? "12px" : "40px 20px"} style={{ textAlign: "center" }}>
          {clients.length === 0 ? (
            <EmptyState
              variant="clients"
              title="Vos premiers clients apparaîtront ici"
              message="Dès qu'un citoyen prend rendez-vous avec votre établissement, il devient automatiquement un client — avec tout son historique de rendez-vous au même endroit."
              color={C.purple}
              titleColor={C.t1}
              textColor={C.t3}
            />
          ) : (
            <p style={{ color: C.t2, fontSize: "13px" }}>Aucun client ne correspond à votre recherche.</p>
          )}
        </Card>
      ) : (
        <Card tokens={toCardTokens(C)} noPadding>
          {filtered.map(c => {
            const sc = c.dernier_statut ? stColor(c.dernier_statut, C) : null;
            return (
              <div key={c.id} onClick={() => setSelected(c)} className="tap" style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", backgroundColor: selected?.id === c.id ? `${C.purple}08` : "transparent" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: `linear-gradient(135deg, ${C.purple}30, ${C.purple}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "800", color: C.purple, flexShrink: 0, position: "relative" }}>
                  {c.nom.slice(0, 2).toUpperCase()}
                  {c.est_nouveau && <div style={{ position: "absolute", top: "-2px", right: "-2px", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: C.gold, border: `1.5px solid ${C.bgCard}` }}/>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: C.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</span>
                    {c.nb_rdv >= 5 && <span style={{ backgroundColor: `${C.gold}20`, color: C.gold, fontSize: "8px", fontWeight: "800", padding: "1px 6px", borderRadius: "6px", flexShrink: 0 }}>VIP</span>}
                  </div>
                  <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{c.nb_rdv}</span> RDV{c.phone ? ` · ${c.phone}` : ""}
                  </div>
                  {c.note && <div style={{ color: C.t2, fontSize: "10.5px", fontStyle: "italic", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>&quot;{c.note}&quot;</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                  {sc && <span style={{ backgroundColor: sc.bg, color: sc.c, fontSize: "8.5px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px", whiteSpace: "nowrap" }}>{sc.l}</span>}
                  <span style={{ color: C.t3, fontSize: "9.5px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{timeAgo(c.dernier_rdv)}</span>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            );
          })}
        </Card>
      )}

      {selected && (
        <div className="client-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => setSelected(null)}>
          <style>{`
            /* ── Fiche client — bottom sheet mobile par défaut, dialogue
                centré 2 colonnes ≥1024px (même convention que les popovers
                du header dans page.tsx : mobile-first, override desktop) ── */
            @media(min-width:1024px){
              .client-fiche-overlay{align-items:center!important}
              .client-fiche-panel{max-width:920px!important;border-radius:20px!important;max-height:86svh!important}
              .client-fiche-grip{display:none!important}
              .client-fiche-close-x{display:flex!important}
              .client-fiche-body{display:grid!important;grid-template-columns:1.1fr 1fr;gap:24px;align-items:start}
            }
          `}</style>
          <div onClick={e => e.stopPropagation()} className="client-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
            <div className="client-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
            <button onClick={() => setSelected(null)} className="client-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <div className="client-fiche-body">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.purple}30, ${C.purple}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "800", color: C.purple, flexShrink: 0 }}>
                    {selected.nom.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800" }}>{selected.nom}</div>
                    {selected.phone && <div style={{ color: C.t3, fontSize: "12px" }}>{selected.phone}</div>}
                  </div>
                  {selected.phone && (
                    <button onClick={copyPhone} className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }} title="Copier le numéro">
                      {phoneCopied
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                    </button>
                  )}
                  {selected.phone && (
                    <a href={`tel:${selected.phone}`} style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </a>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "18px" }}>
                  {[
                    { label: "RDV total", value: selected.nb_rdv, color: C.purple },
                    { label: "Client depuis", value: timeAgo(selected.premiere_visite), color: C.blue },
                    { label: "Statut", value: selected.est_nouveau ? "Nouveau" : "Régulier", color: C.green },
                  ].map(s => (
                    <div key={s.label} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "9px 10px", textAlign: "center" }}>
                      <div style={{ color: s.color, fontSize: "13px", fontWeight: "800" }}>{s.value}</div>
                      <div style={{ color: C.t3, fontSize: "9px", marginTop: "2px" }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {prochaineEtape && (
                  <div style={{ marginBottom: "16px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.gold, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px" }}>Prochaine étape</div>
                      <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700", marginTop: "2px" }}>{dayLabel(`${prochaineEtape.date_rdv}T${prochaineEtape.heure_rdv || "00:00"}`)} {prochaineEtape.heure_rdv ? `à ${prochaineEtape.heure_rdv}` : ""} — {prochaineEtape.objet || "RDV général"}</div>
                    </div>
                  </div>
                )}

                {selected.avis.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Avis ({selected.avis.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {selected.avis.map(a => (
                        <div key={a.id} style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                            <span style={{ color: C.gold, fontSize: "13px" }}>{"★".repeat(a.note)}{"☆".repeat(5 - a.note)}</span>
                            <span style={{ color: C.t3, fontSize: "10.5px" }}>{dayLabel(a.created_at)}</span>
                          </div>
                          {a.commentaire && <div style={{ color: C.t1, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "8px" }}>{a.commentaire}</div>}

                          {a.reponse_institution ? (
                            <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "8px 10px" }}>
                              <div style={{ color: C.gold, fontSize: "10px", fontWeight: "800", marginBottom: "3px" }}>Votre réponse{a.reponse_le ? ` · ${dayLabel(a.reponse_le)}` : ""}</div>
                              <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.4 }}>{a.reponse_institution}</div>
                            </div>
                          ) : reponseOuverte === a.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              <textarea
                                value={reponseTexte} onChange={e => setReponseTexte(e.target.value)} rows={2} placeholder="Votre réponse..."
                                style={{ width: "100%", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", color: C.t1, resize: "none" }}
                              />
                              <div style={{ display: "flex", gap: "8px" }}>
                                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" style={{ flex: 1 }} loading={savingReponse} disabled={!reponseTexte.trim()} onClick={() => envoyerReponse(a.id)}>Envoyer</Button>
                                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => { setReponseOuverte(null); setReponseTexte(""); }}>Annuler</Button>
                              </div>
                            </div>
                          ) : !readOnly && (
                            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ color: C.gold, border: `1px solid ${C.gold}40` }} onClick={() => { setReponseOuverte(a.id); setReponseTexte(""); }}>Répondre</Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Timeline</div>
                  <div>
                    {timelineGroups.map(([label, items]) => (
                      <div key={label} style={{ marginBottom: "14px" }}>
                        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", marginBottom: "8px", textTransform: "capitalize" as const }}>{label}</div>
                        <div style={{ position: "relative", paddingLeft: "16px" }}>
                          <div style={{ position: "absolute", left: "3px", top: "4px", bottom: "4px", width: "2px", backgroundColor: C.border }}/>
                          {items.map(item => (
                            <div key={item.id} style={{ position: "relative", marginBottom: "12px" }}>
                              <div style={{ position: "absolute", left: "-16px", top: "3px", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color, border: `2px solid ${C.bgCard}` }}/>
                              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "2px" }}>
                                <span style={{ color: C.t3, fontSize: "10px", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatHeure(item.date)}</span>
                                <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{item.label}</span>
                              </div>
                              {item.sublabel && <div style={{ color: C.t2, fontSize: "11px", lineHeight: 1.5, marginLeft: "0" }}>{item.sublabel}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Bloc Notes</div>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "10px", overflowX: "auto" }}>
                    {NOTE_TYPES.map(t => {
                      const active = noteTypeSelected === t.key;
                      return (
                        <button key={t.key} onClick={() => setNoteTypeSelected(t.key)} className="tap" style={{ flexShrink: 0, backgroundColor: active ? `${C.purple}20` : C.bgCard, border: `1px solid ${active ? C.purple + "40" : C.border}`, borderRadius: "20px", padding: "6px 12px", color: active ? C.purple : C.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}</button>
                      );
                    })}
                  </div>
                  <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "4px 10px", maxHeight: "200px", overflowY: "auto", marginBottom: "8px" }}>
                    {notesLoading ? (
                      <div style={{ padding: "14px", display: "flex", justifyContent: "center" }}><YelenLoader size={18}/></div>
                    ) : (() => {
                      const entries = notesEntries.filter(n => n.type === noteTypeSelected);
                      return entries.length === 0 ? (
                        <div style={{ padding: "16px 6px", color: C.t3, fontSize: "11.5px", textAlign: "center", lineHeight: 1.6 }}>
                          Aucune note &quot;{NOTE_TYPES.find(t => t.key === noteTypeSelected)?.label.toLowerCase()}&quot; pour l&apos;instant — ajoutez la première ci-dessous.
                        </div>
                      ) : (
                        entries.map((n, i, arr) => (
                          <div key={n.id} style={{ padding: "10px 4px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                              <span style={{ color: C.t1, fontSize: "11.5px", fontWeight: "700" }}>{n.auteur_moi ? "Vous" : n.auteur_nom}</span>
                              <span style={{ color: C.t3, fontSize: "10px" }}>{timeAgo(n.created_at)}</span>
                            </div>
                            <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6 }}>{n.contenu}</div>
                          </div>
                        ))
                      );
                    })()}
                  </div>
                  {!readOnly && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        value={newNoteText}
                        onChange={e => setNewNoteText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !savingNote) ajouterNote(); }}
                        placeholder={`Ajouter une note ${NOTE_TYPES.find(t => t.key === noteTypeSelected)?.label.toLowerCase()}…`}
                        style={{ flex: 1, backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: C.t1, outline: "none" }}
                      />
                      <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" loading={savingNote} loadingColor="#fff" disabled={!newNoteText.trim()} style={{ backgroundColor: C.purple, borderColor: C.purple, color: "#fff" }} onClick={ajouterNote}>Ajouter</Button>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px" }}>Messagerie</div>
                    {onOuvrirMessagerie && (
                      <button onClick={() => onOuvrirMessagerie(selected.id)} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "800", cursor: "pointer", padding: 0 }}>Ouvrir la conversation</button>
                    )}
                  </div>
                  <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "10px", maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {messagesLoading ? (
                      <div style={{ padding: "10px", display: "flex", justifyContent: "center" }}><YelenLoader size={18}/></div>
                    ) : messages.length === 0 ? (
                      <EmptyState
                        title="Aucun échange pour l'instant"
                        message={`Vos échanges avec ${selected.nom} apparaîtront ici dès qu'une conversation aura eu lieu.`}
                        color={C.gold}
                        titleColor={C.t1}
                        textColor={C.t3}
                      />
                    ) : (
                      messages.map(m => {
                        const isInstitution = m.emetteur === "institution";
                        const avatar = (
                          <div style={{ width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: isInstitution ? `${C.purple}20` : C.bg3, border: `1px solid ${isInstitution ? C.purple + "40" : C.border2}` }}>
                            {isInstitution ? <YelenLogo size={12} color={C.purple}/> : <HumanIcon color={C.t2}/>}
                          </div>
                        );
                        return (
                          <div key={m.id} style={{ display: "flex", flexDirection: isInstitution ? "row-reverse" : "row", alignItems: "flex-end", gap: "6px" }}>
                            {avatar}
                            <div style={{ maxWidth: "72%", backgroundColor: isInstitution ? `${C.purple}20` : C.bgCard, border: `1px solid ${isInstitution ? C.purple + "40" : C.border}`, borderRadius: "12px", padding: "8px 11px" }}>
                              <div style={{ color: C.t1, fontSize: "12px", lineHeight: 1.5 }}>{m.contenu}</div>
                              <div style={{ color: C.t3, fontSize: "9px", marginTop: "3px", textAlign: "right" }}>{timeAgo(m.cree_le)}</div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {selected.factures_resume && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px" }}>Factures</div>
                      {onVoirFacturation && (
                        <button onClick={onVoirFacturation} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "800", cursor: "pointer", padding: 0 }}>Voir toutes les factures</button>
                      )}
                    </div>
                    {selected.factures_resume.total === 0 ? (
                      <div style={{ color: C.t3, fontSize: "11.5px" }}>Aucune facture pour ce client.</div>
                    ) : (
                      <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "10px 12px" }}>
                        <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>{selected.factures_resume.total} facture{selected.factures_resume.total > 1 ? "s" : ""}</div>
                        <div style={{ color: C.t3, fontSize: "11px" }}>{selected.factures_resume.payees} payée{selected.factures_resume.payees > 1 ? "s" : ""} · {selected.factures_resume.en_attente} en attente</div>
                        {selected.factures_resume.a_encaisser > 0 && (
                          <div style={{ color: C.orange, fontSize: "12px", fontWeight: "800", marginTop: "4px" }}>{formatPrix(selected.factures_resume.a_encaisser)} à encaisser</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {!readOnly && (
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth loading={sendingRappel} style={{ color: C.gold, border: `1px solid ${C.gold}40` }} onClick={envoyerRappel}>Envoyer un rappel</Button>
            )}
            <button onClick={() => setSelected(null)} style={{ width: "100%", marginTop: "8px", background: "none", border: "none", color: C.t3, fontSize: "12px", cursor: "pointer", padding: "8px" }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
