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
import { EmptyState } from "@/components/EmptyState";
import { ClientsTable, ClientsSkeleton } from "./clients/ClientsTable";
import { ClientsToolbar } from "./clients/ClientsToolbar";
import { ClientsSummary } from "./clients/ClientsSummary";
import { DEVISE_LABEL } from "@/lib/devise";
import { SIGNALEMENT_MOTIFS_INSTITUTION, SIGNALEMENT_MOTIFS_CITOYEN } from "@/lib/signalementsConstants";
import { ClientFiche } from "./clients/ClientFiche";
import { heureAmPm, heureDepuisHorodatage } from "@/lib/heure";

type Paiement = { service_nom: string; prix: number; statut: string };
// date_depart : chambre hôtel uniquement (chantier "Vraie réservation
// hôtel", 25/09/2026), null pour toute visite classique.
type Historique = { id: string; date_rdv: string; heure_rdv: string; date_depart: string | null; objet: string | null; statut: string; notes: string | null; paiement: Paiement | null; presence_status: string | null; presence_confirmed_at: string | null };
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
type TimelineItem = { id: string; date: string; label: string; sublabel?: string; color: string; bg: string; kind: "rdv" | "message" | "signalement" | "autre" };
type AccesEntree = { id: string; membre_nom: string; action: string; created_at: string };
type Message = { id: string; contenu: string; lu: boolean; cree_le: string; emetteur: "citoyen" | "institution" };
type TypeNote = "privee" | "publique" | "commentaire" | "observation" | "compte_rendu";
type NoteEntry = { id: string; type: TypeNote; contenu: string; created_at: string; auteur_nom: string; auteur_moi: boolean };

// Sous-ensemble minimal du statut des paid_bookings — même esprit que
// statutInfo() dans ServicesTab.tsx, pas de nouvel export partagé.
const PAIEMENT_STATUT: Record<string, string> = {
  en_attente: "En attente", confirme: "Confirmé", termine: "Terminé",
  no_show: "No-show", annule: "Annulé",
};
// Affichage seulement : motif brut (arnaque_fraude…) → libellé des tables
// partagées, repli tolérant si inconnu. La donnée n'est jamais modifiée.
function motifLabel(m: string | null | undefined): string | undefined {
  if (!m) return undefined;
  const connu = SIGNALEMENT_MOTIFS_INSTITUTION.find(x => x.value === m) ?? SIGNALEMENT_MOTIFS_CITOYEN.find(x => x.value === m);
  if (connu) return connu.label;
  const brut = m.replace(/_/g, " ");
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}
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
  return heureDepuisHorodatage(iso);
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
      // Chambre hôtel (h.date_depart) — le label mentionne la date de
      // départ, jamais juste l'arrivée seule (sinon incompréhensible pour
      // un séjour multi-nuits).
      const label = h.date_depart
        ? `${h.objet || "Réservation"} — jusqu'au ${new Date(`${h.date_depart}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
        : h.objet || "RDV général";
      items.push({ id: `rdv-${h.id}`, date: `${h.date_rdv}T${h.heure_rdv || "00:00"}`, label, sublabel: sc.l, color: sc.c, bg: sc.bg, kind: "rdv" });
      if (h.presence_status === "present" && h.presence_confirmed_at) {
        items.push({ id: `presence-${h.id}`, date: h.presence_confirmed_at, label: "Présence confirmée", sublabel: "Arrivée enregistrée (QR)", color: C.teal, bg: C.tealL, kind: "rdv" });
      }
      if (h.paiement) {
        const pc = paiementColor(h.paiement.statut, C);
        items.push({ id: `paiement-${h.id}`, date: `${h.date_rdv}T${h.heure_rdv || "00:00"}`, label: `${h.paiement.service_nom} · ${formatPrix(h.paiement.prix)}`, sublabel: PAIEMENT_STATUT[h.paiement.statut] ?? h.paiement.statut, color: pc.c, bg: pc.bg, kind: "rdv" });
      }
    }
    // Avis retirés de ce fil générique (Lot E, chantier Avis + Favoris
    // citoyen) — déplacés dans leur propre section ci-dessous, seule façon
    // d'y accrocher une réponse d'établissement sans complexifier
    // TimelineItem (utilisé aussi par rdv/paiement/signalement/tâche/accès/
    // message, aucun autre type n'a besoin d'une action interactive).
    if (isAdmin) {
      for (const s of selected.signalements) {
        items.push({ id: `signal-${s.created_at}`, date: s.created_at, label: s.titre ? `Signalement : ${s.titre}` : "Signalement", sublabel: motifLabel(s.motif), color: C.red, bg: C.redL, kind: "signalement" });
      }
    }
    for (const t of selected.taches) {
      items.push({ id: `tache-${t.id}`, date: t.created_at, label: `Tâche : ${t.titre}`, sublabel: t.statut, color: C.teal, bg: C.tealL, kind: "autre" });
    }
    if (isAdmin) {
      for (const a of acces) {
        items.push({ id: `acces-${a.id}`, date: a.created_at, label: `${a.membre_nom} ${ACCES_LABEL[a.action] ?? a.action}`, color: C.t2, bg: C.bg3, kind: "autre" });
      }
    }
    for (const m of messages) {
      items.push({ id: `msg-${m.id}`, date: m.cree_le, label: m.emetteur === "institution" ? "Message envoyé" : "Message reçu", sublabel: m.contenu, color: C.blue, bg: C.blueL, kind: "message" });
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selected, acces, messages, isAdmin, C]);

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

  const pagePad = { maxWidth: "1600px", margin: "0 auto", padding: "24px clamp(24px, 2.5vw, 32px)", paddingBottom: "100px" } as const;

  if (loading) {
    return (
      <div style={pagePad}>
        <div style={{ width: "160px", height: "26px", borderRadius: "6px", backgroundColor: C.bg3, marginBottom: "8px" }}/>
        <div style={{ width: "50%", height: "14px", borderRadius: "5px", backgroundColor: C.bg3, marginBottom: "24px" }}/>
        <ClientsSkeleton C={C}/>
      </div>
    );
  }

  const nbFideles = clients.filter(c => c.nb_rdv >= 3).length;
  const nbNouveaux = clients.filter(c => c.est_nouveau).length;
  const nbOccasionnels = clients.filter(c => c.nb_rdv >= 2 && c.nb_rdv <= 5).length;
  const reinitialiser = () => { setSearch(""); setSortBy("recents"); };

  return (
    <div style={{ ...pagePad, animation: "fadeUp 0.2s ease" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.3px", margin: "0 0 4px" }}>Mes clients</h1>
        <p style={{ color: C.t3, fontSize: "13.5px", margin: 0 }}>
          Chaque citoyen ayant déjà eu au moins un rendez-vous avec votre établissement, avec son historique complet.
        </p>
      </div>

      <ClientsSummary<TriClients>
        C={C} active={sortBy} onSelect={setSortBy}
        items={[
          { key: "recents", label: "Total", value: clients.length },
          { key: "fideles", label: "Fidèles (3+)", value: nbFideles },
          { key: "nouveaux", label: "Nouveaux (30 j)", value: nbNouveaux },
        ]}
      />

      {clients.length > 0 && (
        <ClientsToolbar<TriClients>
          C={C} search={search} onSearch={setSearch} active={sortBy} onActive={setSortBy}
          total={filtered.length} resetVisible={search !== "" || sortBy !== "recents"} onReset={reinitialiser}
          segments={[
            { key: "recents", label: "Récents", count: clients.length },
            { key: "fideles", label: "Fidèles", count: nbFideles },
            { key: "nouveaux", label: "Nouveaux", count: nbNouveaux },
            { key: "occasionnels", label: "Occasionnels", count: nbOccasionnels },
            { key: "a_reactiver", label: "À réactiver" },
          ]}
        />
      )}

      {clients.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="12px" style={{ textAlign: "center" }}>
          <EmptyState
            variant="clients"
            title="Vos premiers clients apparaîtront ici"
            message="Dès qu'un citoyen prend rendez-vous avec votre établissement, il devient automatiquement un client — avec tout son historique de rendez-vous au même endroit."
            color={C.gold}
            titleColor={C.t1}
            textColor={C.t3}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="40px 20px" style={{ textAlign: "center" }}>
          <p style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: "0 0 4px" }}>Aucun résultat pour « {search} »</p>
          <p style={{ color: C.t3, fontSize: "13px", margin: "0 0 16px" }}>Aucun client ne correspond à votre recherche.</p>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={reinitialiser}>Réinitialiser les filtres</Button>
        </Card>
      ) : (
        <ClientsTable C={C} clients={filtered} total={clients.length} selectedId={selected?.id ?? null} onSelect={setSelected}/>
      )}

      {selected && (
        <ClientFiche C={C} client={selected} readOnly={readOnly}
          prochaineLabel={prochaineEtape ? (prochaineEtape.date_depart
            ? `Arrivée le ${new Date(`${prochaineEtape.date_rdv}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → départ le ${new Date(`${prochaineEtape.date_depart}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — ${prochaineEtape.objet || "Réservation"}`
            : `${dayLabel(`${prochaineEtape.date_rdv}T${prochaineEtape.heure_rdv || "00:00"}`)} ${prochaineEtape.heure_rdv ? `à ${heureAmPm(prochaineEtape.heure_rdv) || prochaineEtape.heure_rdv}` : ""} — ${prochaineEtape.objet || "RDV général"}`) : null}
          timeline={timeline} messages={messages} messagesLoading={messagesLoading} notes={notesEntries} notesLoading={notesLoading}
          noteType={noteTypeSelected} onNoteType={setNoteTypeSelected} newNoteText={newNoteText} onNewNoteText={setNewNoteText} savingNote={savingNote} onAddNote={ajouterNote}
          reponseOuverte={reponseOuverte} reponseTexte={reponseTexte} onReponseOuverte={setReponseOuverte} onReponseTexte={setReponseTexte} savingReponse={savingReponse} onSendReponse={envoyerReponse}
          sendingRappel={sendingRappel} onRappel={envoyerRappel} phoneCopied={phoneCopied} onCopy={copyPhone}
          onOuvrirMessagerie={onOuvrirMessagerie} onVoirFacturation={onVoirFacturation} onClose={() => setSelected(null)}/>
      )}
    </div>
  );
}
