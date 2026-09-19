"use client";

// Module Collaboration — Lot A (conversations directes) + Lot B (groupes),
// 16/09/2026. Espace interne membre <-> membre, distinct de "Messagerie"
// (citoyen <-> institution), "Annonces", "Communication" et "Support
// Yelen" — jamais mélangé à ces écrans. Consomme
// /api/institution/collaboration/** (tables collab_*).
//
// Périmètre explicite restant hors de ces deux lots (documenté plutôt que
// caché) : fils de réponse ni @mentions (Lot C), pas de fichiers/
// réactions/édition (Lot D), pas de recherche plein texte dans les
// messages, pas de vraie présence en ligne (Lot E — "Dernière connexion"
// réelle affichée à la place, aucune donnée de présence live n'existe
// aujourd'hui côté serveur). Rafraîchissement par polling (10s), pas de
// canal Realtime pour ces lots.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { YelenLoader } from "@/components/YelenLoader";

// Jamais d'emoji classique sur Yelen — uniquement des SVG maison.
function IconStar({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5" />
    </svg>
  );
}

type ConversationListItem = {
  id: string; type: "directe" | "groupe"; nom: string; role: string | null;
  membre_count: number | null; peut_gerer: boolean;
  favori: boolean; non_lus: number;
  dernier_message: { contenu: string; de_moi: boolean; cree_le: string } | null;
  mis_a_jour_le: string;
};
type ReactionAgregat = { type_reaction: string; count: number; par_moi: boolean };
type FichierMessage = { nom: string; taille: number; type: string; url: string | null };
type Message = { id: string; auteur_membre_id: string | null; auteur_nom?: string | null; auteur_supprime?: boolean; de_moi: boolean; contenu: string | null; supprime: boolean; modifie: boolean; cree_le: string; reponses?: number; fichier?: FichierMessage | null; reactions?: ReactionAgregat[] };
type Participant = { membre_id: string; prenom: string; nom: string; role: string | null; derniere_connexion: string | null };
type MembreRecherchable = { id: string; prenom: string; nom: string };
type MentionItem = { id: string; conversation_id: string; conversation_nom: string | null; message_id: string; parent_message_id: string | null; auteur_nom: string; extrait: string; lu: boolean; cree_le: string };
type RechercheResultat = { id: string; conversation_id: string; conversation_nom: string; auteur_nom: string; extrait: string; est_fichier: boolean; cree_le: string };

// Jamais d'emoji classique sur Yelen — uniquement des SVG maison.
function IconReponses() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function IconSearch() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IconAt() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-5.5 8.28"/></svg>;
}
function IconTrombone() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
}
function IconFichier() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>;
}
function IconCrayon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>;
}
function IconCorbeille() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
}
function IconReactionSourire() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
}

const REACTIONS_DEF: { type: string; label: string; icon: ReactNode }[] = [
  { type: "pouce", label: "Approuver", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> },
  { type: "coeur", label: "J'aime", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
  { type: "valide", label: "Validé", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> },
  { type: "attention", label: "Important", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
];

const MAX_FICHIER_SIZE = 15 * 1024 * 1024;

function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

// Rendu d'un contenu de message avec ses @mentions mises en évidence — pas
// de parsing "intelligent", uniquement les noms exacts des participants
// connus (même logique déterministe que extraireMentions côté serveur).
function rendreContenuAvecMentions(contenu: string, participants: Participant[], C: ThemeTokens): ReactNode {
  const noms = participants.map(p => `${p.prenom} ${p.nom}`).filter(Boolean);
  if (noms.length === 0) return contenu;
  const motif = new RegExp(`@(${noms.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const parts = contenu.split(motif);
  if (parts.length === 1) return contenu;
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} style={{ color: C.gold, fontWeight: 700 }}>@{part}</strong> : <span key={i}>{part}</span>));
}

function formatHeureMsg(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function formatRelatifConv(iso: string): string {
  const d = new Date(iso);
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const cible = new Date(d); cible.setHours(0, 0, 0, 0);
  if (cible.getTime() === aujourdhui.getTime()) return formatHeureMsg(iso);
  const hier = new Date(aujourdhui); hier.setDate(hier.getDate() - 1);
  if (cible.getTime() === hier.getTime()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function formatDerniereConnexion(iso: string | null): string {
  if (!iso) return "Jamais connecté";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 5) return "Actif récemment";
  if (m < 60) return `Actif il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Actif il y a ${h} h`;
  return `Actif ${formatRelatifConv(iso)}`;
}

export function CollaborationTab({ onToast }: { onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [listeChargee, setListeChargee] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [conversationNom, setConversationNom] = useState<string>("");
  const [conversationType, setConversationType] = useState<"directe" | "groupe">("directe");
  const [conversationPeutGerer, setConversationPeutGerer] = useState(false);
  const [suisCreateurGroupe, setSuisCreateurGroupe] = useState(false);
  const [quitterGroupeEnCours, setQuitterGroupeEnCours] = useState(false);
  const [monMembreId, setMonMembreId] = useState<string | null>(null);
  const [threadChargement, setThreadChargement] = useState(false);
  const [texte, setTexte] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [recherche, setRecherche] = useState("");

  const [nouvelleOuverte, setNouvelleOuverte] = useState(false);
  const [membresRecherchables, setMembresRecherchables] = useState<MembreRecherchable[]>([]);
  const [rechercheMembre, setRechercheMembre] = useState("");
  const [demarrageEnCours, setDemarrageEnCours] = useState<string | null>(null);

  const [groupeOuvert, setGroupeOuvert] = useState(false);
  const [nomGroupe, setNomGroupe] = useState("");
  const [membresSelectionnes, setMembresSelectionnes] = useState<Set<string>>(new Set());
  const [creationGroupeEnCours, setCreationGroupeEnCours] = useState(false);

  const [ajoutMembreOuvert, setAjoutMembreOuvert] = useState(false);
  const [ajoutMembreEnCours, setAjoutMembreEnCours] = useState<string | null>(null);
  const [retraitMembreEnCours, setRetraitMembreEnCours] = useState<string | null>(null);

  // Lot C — fils de réponse
  const [discussionMessageId, setDiscussionMessageId] = useState<string | null>(null);
  const [discussionRacine, setDiscussionRacine] = useState<Message | null>(null);
  const [discussionReponses, setDiscussionReponses] = useState<Message[]>([]);
  const [discussionChargement, setDiscussionChargement] = useState(false);
  const [discussionTexte, setDiscussionTexte] = useState("");
  const [discussionEnvoiEnCours, setDiscussionEnvoiEnCours] = useState(false);

  // Lot C — @mentions (autocomplete de la composeuse + vue "Mentions")
  const [mentionsVueOuverte, setMentionsVueOuverte] = useState(false);
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [mentionsNonLues, setMentionsNonLues] = useState(0);

  // Lot D — fichiers, réactions, édition/suppression
  const [envoiFichierEnCours, setEnvoiFichierEnCours] = useState(false);
  const fichierInputRef = useRef<HTMLInputElement>(null);
  const [reactionPickerPour, setReactionPickerPour] = useState<string | null>(null);
  const [editionMessageId, setEditionMessageId] = useState<string | null>(null);
  const [editionTexte, setEditionTexte] = useState("");
  const [editionEnCours, setEditionEnCours] = useState(false);
  const [confirmSuppressionId, setConfirmSuppressionId] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  // Lot E — recherche globale (messages + fichiers de mes conversations)
  const [rechercheGlobaleOuverte, setRechercheGlobaleOuverte] = useState(false);
  const [rechercheGlobaleTexte, setRechercheGlobaleTexte] = useState("");
  const [rechercheGlobaleResultats, setRechercheGlobaleResultats] = useState<RechercheResultat[]>([]);
  const [rechercheGlobaleEnCours, setRechercheGlobaleEnCours] = useState(false);

  const messagesFinRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  const dernierMentionRequeteRef = useRef<string | null>(null);

  const chargerConversations = useCallback(async (silencieux = false) => {
    if (!silencieux) setListeChargee(false);
    const res = await fetch("/api/institution/collaboration/conversations");
    const j = await res.json().catch(() => null);
    setConversations(res.ok ? (j?.conversations ?? []) : []);
    setListeChargee(true);
  }, []);

  const chargerThread = useCallback(async (id: string, silencieux = false) => {
    if (!silencieux) setThreadChargement(true);
    const res = await fetch(`/api/institution/collaboration/conversations/${id}`);
    const j = await res.json().catch(() => null);
    if (selectedIdRef.current !== id) return;
    if (!res.ok) { onToast(j?.error || "Impossible de charger cette conversation.", C.red); setThreadChargement(false); return; }
    setMessages(j.messages ?? []);
    setParticipants(j.participants ?? []);
    setConversationNom(j.conversation?.nom ?? "");
    setConversationType(j.conversation?.type === "groupe" ? "groupe" : "directe");
    setConversationPeutGerer(!!j.conversation?.peut_gerer);
    setSuisCreateurGroupe(!!j.conversation?.suis_createur);
    setMonMembreId(j.conversation?.mon_membre_id ?? null);
    setThreadChargement(false);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, non_lus: 0 } : c));
  }, [C.red, onToast]);

  useEffect(() => { chargerConversations(); }, [chargerConversations]);
  useEffect(() => {
    const t = setInterval(() => chargerConversations(true), 10000);
    return () => clearInterval(t);
  }, [chargerConversations]);

  useEffect(() => {
    if (!selectedId) return;
    chargerThread(selectedId);
    const t = setInterval(() => chargerThread(selectedId, true), 6000);
    return () => clearInterval(t);
  }, [selectedId, chargerThread]);

  useEffect(() => { messagesFinRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  useEffect(() => {
    if (!rechercheGlobaleOuverte || rechercheGlobaleTexte.trim().length < 2) { setRechercheGlobaleResultats([]); return; }
    setRechercheGlobaleEnCours(true);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/institution/collaboration/recherche?q=${encodeURIComponent(rechercheGlobaleTexte.trim())}`);
      const j = await res.json().catch(() => null);
      setRechercheGlobaleResultats(res.ok ? (j?.messages ?? []) : []);
      setRechercheGlobaleEnCours(false);
    }, 350);
    return () => clearTimeout(t);
  }, [rechercheGlobaleTexte, rechercheGlobaleOuverte]);

  function allerVersResultat(r: RechercheResultat) {
    setRechercheGlobaleOuverte(false);
    setSelectedId(r.conversation_id);
  }

  async function envoyerMessage() {
    const contenu = texte.trim();
    if (!contenu || !selectedId || envoiEnCours) return;
    setEnvoiEnCours(true);
    const res = await fetch(`/api/institution/collaboration/conversations/${selectedId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenu }),
    });
    const j = await res.json().catch(() => null);
    setEnvoiEnCours(false);
    if (!res.ok) { onToast(j?.error || "Le message n'a pas pu être envoyé.", C.red); return; }
    setTexte("");
    chargerThread(selectedId, true);
    chargerConversations(true);
  }

  async function toggleFavori(id: string, favoriActuel: boolean) {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, favori: !favoriActuel } : c));
    const res = await fetch(`/api/institution/collaboration/conversations/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favori: !favoriActuel }),
    });
    if (!res.ok) { setConversations(prev => prev.map(c => c.id === id ? { ...c, favori: favoriActuel } : c)); onToast("Impossible de mettre à jour le favori.", C.red); }
  }

  async function ouvrirNouvelleConversation() {
    setNouvelleOuverte(true);
    setRechercheMembre("");
    const res = await fetch("/api/institution/membres");
    const j = await res.json().catch(() => null);
    setMembresRecherchables(res.ok ? (j?.membres ?? []) : []);
  }

  async function demarrerConversation(membreId: string) {
    setDemarrageEnCours(membreId);
    const res = await fetch("/api/institution/collaboration/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membre_id: membreId }),
    });
    const j = await res.json().catch(() => null);
    setDemarrageEnCours(null);
    if (!res.ok) { onToast(j?.error || "Impossible de démarrer cette conversation.", C.red); return; }
    setNouvelleOuverte(false);
    await chargerConversations(true);
    setSelectedId(j.id);
  }

  async function ouvrirNouveauGroupe() {
    setGroupeOuvert(true);
    setNomGroupe("");
    setMembresSelectionnes(new Set());
    setRechercheMembre("");
    const res = await fetch("/api/institution/membres");
    const j = await res.json().catch(() => null);
    setMembresRecherchables(res.ok ? (j?.membres ?? []) : []);
  }

  function basculerMembreSelectionne(id: string) {
    setMembresSelectionnes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function creerGroupe() {
    const nom = nomGroupe.trim();
    if (!nom || membresSelectionnes.size === 0 || creationGroupeEnCours) return;
    setCreationGroupeEnCours(true);
    const res = await fetch("/api/institution/collaboration/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "groupe", nom, membre_ids: [...membresSelectionnes] }),
    });
    const j = await res.json().catch(() => null);
    setCreationGroupeEnCours(false);
    if (!res.ok) { onToast(j?.error || "Ce groupe n'a pas pu être créé.", C.red); return; }
    setGroupeOuvert(false);
    await chargerConversations(true);
    setSelectedId(j.id);
  }

  async function ouvrirAjoutMembre() {
    setAjoutMembreOuvert(true);
    setRechercheMembre("");
    const res = await fetch("/api/institution/membres");
    const j = await res.json().catch(() => null);
    const dejaDedans = new Set(participants.map(p => p.membre_id));
    setMembresRecherchables(res.ok ? (j?.membres ?? []).filter((m: MembreRecherchable) => !dejaDedans.has(m.id)) : []);
  }

  async function ajouterMembreAuGroupe(membreId: string) {
    if (!selectedId) return;
    setAjoutMembreEnCours(membreId);
    const res = await fetch(`/api/institution/collaboration/conversations/${selectedId}/membres`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membre_id: membreId }),
    });
    const j = await res.json().catch(() => null);
    setAjoutMembreEnCours(null);
    if (!res.ok) { onToast(j?.error || "Impossible d'ajouter ce membre.", C.red); return; }
    setAjoutMembreOuvert(false);
    chargerThread(selectedId, true);
  }

  async function retirerMembreDuGroupe(membreId: string) {
    if (!selectedId) return;
    setRetraitMembreEnCours(membreId);
    const res = await fetch(`/api/institution/collaboration/conversations/${selectedId}/membres?membre_id=${membreId}`, { method: "DELETE" });
    const j = await res.json().catch(() => null);
    setRetraitMembreEnCours(null);
    if (!res.ok) { onToast(j?.error || "Impossible de retirer ce membre.", C.red); return; }
    chargerThread(selectedId, true);
  }

  async function quitterGroupe() {
    if (!selectedId || !monMembreId) return;
    setQuitterGroupeEnCours(true);
    const res = await fetch(`/api/institution/collaboration/conversations/${selectedId}/membres?membre_id=${monMembreId}`, { method: "DELETE" });
    const j = await res.json().catch(() => null);
    setQuitterGroupeEnCours(false);
    if (!res.ok) { onToast(j?.error || "Impossible de quitter ce groupe.", C.red); return; }
    setSelectedId(null);
    setConversations(prev => prev.filter(c => c.id !== selectedId));
    onToast("Vous avez quitté le groupe.", C.green);
  }

  const chargerMentions = useCallback(async () => {
    const res = await fetch("/api/institution/collaboration/mentions");
    const j = await res.json().catch(() => null);
    const liste: MentionItem[] = res.ok ? (j?.mentions ?? []) : [];
    setMentions(liste);
    setMentionsNonLues(liste.filter(m => !m.lu).length);
    return liste;
  }, []);

  useEffect(() => { chargerMentions(); }, [chargerMentions]);
  useEffect(() => {
    const t = setInterval(() => chargerMentions(), 30000);
    return () => clearInterval(t);
  }, [chargerMentions]);

  async function ouvrirMentionsVue() {
    setMentionsVueOuverte(true);
    await chargerMentions();
    if (mentionsNonLues > 0) {
      await fetch("/api/institution/collaboration/mentions", { method: "PATCH" });
      setMentionsNonLues(0);
      setMentions(prev => prev.map(m => ({ ...m, lu: true })));
    }
  }

  function allerVersMention(m: MentionItem) {
    setMentionsVueOuverte(false);
    setSelectedId(m.conversation_id);
    if (m.parent_message_id) {
      // La mention est dans une réponse — ouvre directement la discussion
      // du message racine, sinon elle resterait invisible dans le fil.
      // conversationId passé explicitement (jamais via l'état selectedId,
      // qui ne serait pas encore à jour dans cette même fonction).
      ouvrirDiscussion(m.conversation_id, m.parent_message_id);
    }
  }

  async function ouvrirDiscussion(conversationId: string, messageId: string) {
    setDiscussionMessageId(messageId);
    setDiscussionChargement(true);
    setDiscussionTexte("");
    const res = await fetch(`/api/institution/collaboration/conversations/${conversationId}/messages/${messageId}/replies`);
    const j = await res.json().catch(() => null);
    setDiscussionChargement(false);
    if (!res.ok) { onToast(j?.error || "Impossible de charger cette discussion.", C.red); setDiscussionMessageId(null); return; }
    setDiscussionRacine(j.racine ?? null);
    setDiscussionReponses(j.reponses ?? []);
  }

  async function envoyerReponse() {
    const contenu = discussionTexte.trim();
    if (!contenu || !selectedId || !discussionMessageId || discussionEnvoiEnCours) return;
    setDiscussionEnvoiEnCours(true);
    const res = await fetch(`/api/institution/collaboration/conversations/${selectedId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenu, parent_message_id: discussionMessageId }),
    });
    const j = await res.json().catch(() => null);
    setDiscussionEnvoiEnCours(false);
    if (!res.ok) { onToast(j?.error || "La réponse n'a pas pu être envoyée.", C.red); return; }
    setDiscussionTexte("");
    ouvrirDiscussion(selectedId, discussionMessageId);
    chargerThread(selectedId, true);
  }

  function insererMention(p: Participant) {
    setTexte(prev => prev.replace(/@[\wÀ-ÿ]*$/, `@${p.prenom} ${p.nom} `));
  }

  async function envoyerFichier(file: File) {
    if (!selectedId || envoiFichierEnCours) return;
    if (file.size > MAX_FICHIER_SIZE) { onToast("Ce fichier dépasse la taille maximale autorisée (15 Mo).", C.red); return; }
    setEnvoiFichierEnCours(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/institution/collaboration/conversations/${selectedId}/fichiers`, { method: "POST", body: form });
    const j = await res.json().catch(() => null);
    setEnvoiFichierEnCours(false);
    if (!res.ok) { onToast(j?.error || "L'envoi du fichier a échoué.", C.red); return; }
    chargerThread(selectedId, true);
    chargerConversations(true);
  }

  async function basculerReaction(messageId: string, typeReaction: string, dejaReagi: boolean) {
    if (!selectedId) return;
    setReactionPickerPour(null);
    const url = `/api/institution/collaboration/conversations/${selectedId}/messages/${messageId}/reactions`;
    const res = dejaReagi
      ? await fetch(`${url}?type_reaction=${typeReaction}`, { method: "DELETE" })
      : await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type_reaction: typeReaction }) });
    if (!res.ok) { onToast("Impossible d'enregistrer votre réaction.", C.red); return; }
    chargerThread(selectedId, true);
  }

  function commencerEdition(m: Message) {
    setEditionMessageId(m.id);
    setEditionTexte(m.contenu ?? "");
  }

  async function sauvegarderEdition() {
    if (!selectedId || !editionMessageId || editionEnCours) return;
    const contenu = editionTexte.trim();
    setEditionEnCours(true);
    const res = await fetch(`/api/institution/collaboration/conversations/${selectedId}/messages/${editionMessageId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenu }),
    });
    const j = await res.json().catch(() => null);
    setEditionEnCours(false);
    if (!res.ok) { onToast(j?.error || "La modification a échoué.", C.red); return; }
    setEditionMessageId(null);
    chargerThread(selectedId, true);
  }

  async function supprimerMessage(messageId: string) {
    if (!selectedId || suppressionEnCours) return;
    setSuppressionEnCours(true);
    const res = await fetch(`/api/institution/collaboration/conversations/${selectedId}/messages/${messageId}`, { method: "DELETE" });
    const j = await res.json().catch(() => null);
    setSuppressionEnCours(false);
    setConfirmSuppressionId(null);
    if (!res.ok) { onToast(j?.error || "La suppression a échoué.", C.red); return; }
    chargerThread(selectedId, true);
    chargerConversations(true);
  }

  const favoris = conversations.filter(c => c.favori);
  const groupes = conversations
    .filter(c => !c.favori && c.type === "groupe")
    .filter(c => !recherche.trim() || c.nom.toLowerCase().includes(recherche.trim().toLowerCase()));
  const autresConversations = conversations
    .filter(c => !c.favori && c.type === "directe")
    .filter(c => !recherche.trim() || c.nom.toLowerCase().includes(recherche.trim().toLowerCase()));
  const membresFiltres = membresRecherchables.filter(m => `${m.prenom} ${m.nom}`.toLowerCase().includes(rechercheMembre.trim().toLowerCase()));
  const autreParticipant = participants[0] ?? null;

  // @mention — dérivé du texte en cours, pas d'état séparé. Se déclenche
  // dès qu'un "@" suivi d'aucun espace se trouve en fin de saisie.
  const mentionMatch = texte.match(/@([\wÀ-ÿ]*)$/);
  const mentionRequete = mentionMatch ? mentionMatch[1] : null;
  const mentionCandidats = mentionRequete !== null
    ? participants.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(mentionRequete.toLowerCase()))
    : [];
  const mentionOuverte = mentionRequete !== null && mentionCandidats.length > 0;
  const mentionIndexActif = Math.min(mentionIndex, mentionCandidats.length - 1);

  // Revue critique 16/09/2026 (3e passage) : tant que la liste d'autocomplete
  // est ouverte, Entrée était volontairement bloquée (pour ne pas envoyer le
  // message en pleine sélection) mais rien ne permettait de choisir une
  // suggestion au clavier — piège pour qui n'utilise pas la souris. Flèches +
  // Entrée = sélection, comme Slack/Teams. Réinitialisation de l'index
  // pendant le rendu (pattern react.dev "adjusting state" — pas un Effect,
  // pas de rendu intermédiaire perdu à chaque frappe).
  if (mentionRequete !== dernierMentionRequeteRef.current) {
    dernierMentionRequeteRef.current = mentionRequete;
    if (mentionIndex !== 0) setMentionIndex(0);
  }

  function gererClavierComposeur(e: KeyboardEvent<HTMLInputElement>) {
    if (mentionOuverte) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionCandidats.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionCandidats.length) % mentionCandidats.length); return; }
      if (e.key === "Enter") { e.preventDefault(); insererMention(mentionCandidats[mentionIndexActif]); return; }
      if (e.key === "Escape") { e.preventDefault(); setTexte(prev => prev.replace(/@[\wÀ-ÿ]*$/, "")); return; }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyerMessage(); }
  }

  return (
    <div style={{ height: "calc(100vh - 57px)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ color: C.t1, fontSize: "19px", fontWeight: 800, letterSpacing: "-0.3px" }}>Collaboration</h1>
          <p style={{ color: C.t3, fontSize: "12px" }}>Échangez simplement avec les membres de votre équipe.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={() => { setRechercheGlobaleOuverte(true); setRechercheGlobaleTexte(""); setRechercheGlobaleResultats([]); }} className="tap" aria-label="Rechercher" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "none", border: `1px solid ${C.border2}`, borderRadius: "9px", color: C.t1, cursor: "pointer" }}>
            <IconSearch/>
          </button>
          <button onClick={ouvrirMentionsVue} className="tap" style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", background: "none", border: `1px solid ${C.border2}`, borderRadius: "9px", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: "8px 12px", height: "40px" }}>
            <IconAt/> Mentions
            {mentionsNonLues > 0 && (
              <span style={{ background: C.gold, color: "#111", fontSize: "10px", fontWeight: 800, borderRadius: "10px", padding: "1px 6px" }}>{mentionsNonLues}</span>
            )}
          </button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={ouvrirNouvelleConversation}>+ Nouvelle conversation</Button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* ── Colonne conversations ── */}
        <div style={{ width: "280px", flexShrink: 0, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
            <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher une conversation…" style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "9px", padding: "8px 10px", fontSize: "12.5px", color: C.t1, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {!listeChargee ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={22} /></div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center" }}>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700, marginBottom: "4px" }}>Vous n&apos;avez pas encore de conversation</div>
                <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.5 }}>Cliquez sur « Nouvelle conversation » pour échanger avec un collègue.</div>
              </div>
            ) : (
              <>
                {favoris.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "10px 12px 4px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}><IconStar filled color={C.gold}/> Favoris</div>
                    {favoris.map(c => (
                      <ConversationRow key={c.id} c={c} C={C} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} onToggleFavori={() => toggleFavori(c.id, c.favori)} />
                    ))}
                  </div>
                )}
                {groupes.length > 0 && (
                  <div>
                    <div style={{ padding: "10px 12px 4px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>Groupes</div>
                    {groupes.map(c => (
                      <ConversationRow key={c.id} c={c} C={C} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} onToggleFavori={() => toggleFavori(c.id, c.favori)} />
                    ))}
                  </div>
                )}
                <div style={{ padding: "10px 12px 4px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>Conversations</div>
                {autresConversations.length === 0 ? (
                  <div style={{ padding: "8px 14px 20px", color: C.t3, fontSize: "12px" }}>Aucune conversation ne correspond à votre recherche.</div>
                ) : autresConversations.map(c => (
                  <ConversationRow key={c.id} c={c} C={C} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} onToggleFavori={() => toggleFavori(c.id, c.favori)} />
                ))}
              </>
            )}
          </div>
          <button onClick={ouvrirNouveauGroupe} className="tap" style={{ background: "none", border: "none", borderTop: `1px solid ${C.border}`, color: C.gold, fontSize: "12px", fontWeight: 800, cursor: "pointer", padding: "10px 12px", textAlign: "left" }}>+ Nouveau groupe</button>
        </div>

        {/* ── Fil de conversation ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {!selectedId ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "6px" }}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 700 }}>Choisissez une conversation à gauche</div>
              <div style={{ color: C.t3, fontSize: "12px" }}>ou lancez-en une nouvelle avec un collègue.</div>
            </div>
          ) : (
            <>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{conversationNom || "…"}</div>
                {conversationType === "groupe" ? (
                  <div style={{ color: C.t3, fontSize: "11.5px" }}>{participants.length + 1} membre{participants.length + 1 > 1 ? "s" : ""}</div>
                ) : autreParticipant && (
                  <div style={{ color: C.t3, fontSize: "11.5px" }}>{formatDerniereConnexion(autreParticipant.derniere_connexion)}</div>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {threadChargement ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={22} /></div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: "center", color: C.t3, fontSize: "12.5px", padding: "24px" }}>Aucun message pour l&apos;instant — dites bonjour !</div>
                ) : messages.map(m => {
                  const nomAuteur = conversationType === "groupe" && !m.de_moi ? (m.auteur_nom ?? null) : null;
                  const enEdition = editionMessageId === m.id;
                  return (
                    <div key={m.id} style={{ alignSelf: m.de_moi ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                      {conversationType === "groupe" && !m.de_moi && nomAuteur && <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 700, marginBottom: "2px" }}>{nomAuteur}</div>}
                      {enEdition ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <input
                            value={editionTexte}
                            onChange={e => setEditionTexte(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sauvegarderEdition(); } if (e.key === "Escape") setEditionMessageId(null); }}
                            autoFocus
                            style={{ background: C.bg3, border: `1px solid ${C.gold}60`, borderRadius: "10px", padding: "8px 12px", fontSize: "13px", color: C.t1 }}
                          />
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                            <button onClick={() => setEditionMessageId(null)} style={{ background: "none", border: "none", color: C.t3, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>Annuler</button>
                            <button onClick={sauvegarderEdition} disabled={editionEnCours} style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>{editionEnCours ? "…" : "Enregistrer"}</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: m.de_moi ? C.bgCard2 : C.bg3, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "9px 13px", color: m.supprime ? C.t3 : C.t1, fontSize: "13px", lineHeight: 1.5, fontStyle: m.supprime ? "italic" : "normal" }}>
                          {m.supprime ? "Message supprimé" : (
                            <>
                              {m.contenu && <div style={{ marginBottom: m.fichier ? "8px" : 0 }}>{rendreContenuAvecMentions(m.contenu, participants, C)}</div>}
                              {m.fichier && (
                                m.fichier.url ? (
                                  <a href={m.fichier.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "inherit", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "8px 10px" }}>
                                    <span style={{ color: C.gold, flexShrink: 0 }}><IconFichier/></span>
                                    <span style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: "12px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fichier.nom}</div>
                                      <div style={{ fontSize: "10.5px", color: C.t3 }}>{formatTaille(m.fichier.taille)}</div>
                                    </span>
                                  </a>
                                ) : <div style={{ color: C.t3, fontSize: "12px" }}>Fichier indisponible (lien expiré) — rouvrez la conversation.</div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {!m.supprime && (m.reactions?.length ?? 0) > 0 && (
                        <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                          {m.reactions!.map(r => {
                            const def = REACTIONS_DEF.find(d => d.type === r.type_reaction);
                            return (
                              <button key={r.type_reaction} onClick={() => basculerReaction(m.id, r.type_reaction, r.par_moi)} className="tap" title={def?.label} style={{ display: "flex", alignItems: "center", gap: "4px", background: r.par_moi ? C.bgCard2 : "transparent", border: `1px solid ${r.par_moi ? C.gold + "60" : C.border2}`, borderRadius: "20px", padding: "2px 7px", color: r.par_moi ? C.gold : C.t2, fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }}>
                                {def?.icon}{r.count}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {!m.supprime && !enEdition && (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "3px", justifyContent: m.de_moi ? "flex-end" : "flex-start", position: "relative" }}>
                          <span style={{ color: C.t3, fontSize: "10px" }}>{formatHeureMsg(m.cree_le)}{m.modifie ? " · modifié" : ""}</span>
                          <button onClick={() => ouvrirDiscussion(selectedId, m.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", color: (m.reponses ?? 0) > 0 ? C.gold : C.t3, fontSize: "10.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
                            <IconReponses/> {(m.reponses ?? 0) > 0 ? `${m.reponses} réponse${(m.reponses ?? 0) > 1 ? "s" : ""}` : "Répondre"}
                          </button>
                          <button onClick={() => setReactionPickerPour(reactionPickerPour === m.id ? null : m.id)} className="tap" aria-label="Réagir" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: 0, display: "flex" }}>
                            <IconReactionSourire/>
                          </button>
                          {m.de_moi && (
                            <>
                              {!m.fichier && (
                                <button onClick={() => commencerEdition(m)} className="tap" aria-label="Modifier" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: 0, display: "flex" }}><IconCrayon/></button>
                              )}
                              {confirmSuppressionId === m.id ? (
                                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <button onClick={() => supprimerMessage(m.id)} disabled={suppressionEnCours} style={{ background: "none", border: "none", color: C.red, fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }}>{suppressionEnCours ? "…" : "Supprimer ?"}</button>
                                  <button onClick={() => setConfirmSuppressionId(null)} style={{ background: "none", border: "none", color: C.t3, fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }}>Annuler</button>
                                </span>
                              ) : (
                                <button onClick={() => setConfirmSuppressionId(m.id)} className="tap" aria-label="Supprimer" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: 0, display: "flex" }}><IconCorbeille/></button>
                              )}
                            </>
                          )}
                          {reactionPickerPour === m.id && (
                            <div style={{ position: "absolute", bottom: "100%", [m.de_moi ? "right" : "left"]: 0, marginBottom: "4px", display: "flex", gap: "4px", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "20px", padding: "5px 8px", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 10 }}>
                              {REACTIONS_DEF.map(def => (
                                <button key={def.type} onClick={() => basculerReaction(m.id, def.type, !!m.reactions?.find(r => r.type_reaction === def.type && r.par_moi))} className="tap" title={def.label} style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: "2px" }}>{def.icon}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesFinRef} />
              </div>
              <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, position: "relative" }}>
                {mentionOuverte && (
                  <div style={{ position: "absolute", left: "16px", right: "16px", bottom: "calc(100% - 4px)", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxHeight: "180px", overflowY: "auto", zIndex: 10 }}>
                    {mentionCandidats.map((p, i) => (
                      <button key={p.membre_id} onClick={() => insererMention(p)} onMouseEnter={() => setMentionIndex(i)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: i === mentionIndexActif ? C.bg3 : "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: C.t2, flexShrink: 0 }}>
                          {p.prenom.slice(0, 1).toUpperCase()}{p.nom.slice(0, 1).toUpperCase()}
                        </div>
                        <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600 }}>{p.prenom} {p.nom}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input ref={fichierInputRef} type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) envoyerFichier(f); e.target.value = ""; }} />
                  <button onClick={() => fichierInputRef.current?.click()} disabled={envoiFichierEnCours} className="tap" aria-label="Joindre un fichier" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", flexShrink: 0, background: "none", border: `1px solid ${C.border2}`, borderRadius: "10px", color: C.t2, cursor: envoiFichierEnCours ? "default" : "pointer" }}>
                    {envoiFichierEnCours ? <YelenLoader size={16}/> : <IconTrombone/>}
                  </button>
                  <input
                    value={texte}
                    onChange={e => setTexte(e.target.value)}
                    onKeyDown={gererClavierComposeur}
                    placeholder="Écrire un message… (@ pour mentionner un collègue)"
                    style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: C.t1 }}
                  />
                  <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!texte.trim() || envoiEnCours} loading={envoiEnCours} onClick={envoyerMessage}>Envoyer</Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Informations participant / groupe ── */}
        {selectedId && conversationType === "directe" && autreParticipant && (
          <div style={{ width: "260px", flexShrink: 0, borderLeft: `1px solid ${C.border}`, padding: "20px 16px", display: "none" }} className="collab-info-panel">
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 800, color: C.t2, margin: "0 auto 10px" }}>
              {autreParticipant.prenom.slice(0, 1).toUpperCase()}{autreParticipant.nom.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ textAlign: "center", color: C.t1, fontSize: "14px", fontWeight: 800 }}>{autreParticipant.prenom} {autreParticipant.nom}</div>
            {autreParticipant.role && <div style={{ textAlign: "center", color: C.t3, fontSize: "12px", marginBottom: "12px" }}>{autreParticipant.role}</div>}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "12px", paddingTop: "12px" }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Statut</div>
              <div style={{ color: C.t1, fontSize: "12.5px" }}>{formatDerniereConnexion(autreParticipant.derniere_connexion)}</div>
            </div>
          </div>
        )}
        {selectedId && conversationType === "groupe" && (
          <div style={{ width: "260px", flexShrink: 0, borderLeft: `1px solid ${C.border}`, padding: "20px 16px", display: "none", overflowY: "auto" }} className="collab-info-panel">
            <div style={{ textAlign: "center", color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "2px" }}>{conversationNom}</div>
            <div style={{ textAlign: "center", color: C.t3, fontSize: "12px", marginBottom: "14px" }}>{participants.length + 1} membre{participants.length + 1 > 1 ? "s" : ""}</div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Membres</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {participants.map(p => (
                  <div key={p.membre_id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: C.t2, flexShrink: 0 }}>
                      {p.prenom.slice(0, 1).toUpperCase()}{p.nom.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.prenom} {p.nom}</div>
                    </div>
                    {conversationPeutGerer && (
                      <button onClick={() => retirerMembreDuGroupe(p.membre_id)} disabled={retraitMembreEnCours === p.membre_id} aria-label="Retirer du groupe" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                        {retraitMembreEnCours === p.membre_id ? <YelenLoader size={12}/> : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {conversationPeutGerer && (
                <button onClick={ouvrirAjoutMembre} className="tap" style={{ marginTop: "12px", background: "none", border: `1px solid ${C.border2}`, borderRadius: "9px", color: C.t1, fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "8px", width: "100%" }}>+ Ajouter un membre</button>
              )}
              {!suisCreateurGroupe && (
                <button onClick={quitterGroupe} disabled={quitterGroupeEnCours} className="tap" style={{ marginTop: "8px", background: "none", border: `1px solid ${C.red}60`, borderRadius: "9px", color: C.red, fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "8px", width: "100%" }}>{quitterGroupeEnCours ? "Sortie en cours…" : "Quitter le groupe"}</button>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`@media (min-width: 1280px) { .collab-info-panel { display: block !important; } }`}</style>

      {nouvelleOuverte && (
        <div onClick={() => setNouvelleOuverte(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "20px", width: "100%", maxWidth: "400px" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800, marginBottom: "14px" }}>Nouvelle conversation</div>
            <input
              value={rechercheMembre}
              onChange={e => setRechercheMembre(e.target.value)}
              placeholder="Rechercher un membre…"
              autoFocus
              style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, marginBottom: "12px", boxSizing: "border-box" }}
            />
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {membresFiltres.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "12.5px", textAlign: "center", padding: "16px 0" }}>Aucun collègue ne correspond à cette recherche.</div>
              ) : membresFiltres.map(m => (
                <button key={m.id} onClick={() => demarrerConversation(m.id)} disabled={!!demarrageEnCours} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 6px", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: demarrageEnCours ? "default" : "pointer", textAlign: "left" }}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: C.t2, flexShrink: 0 }}>
                    {m.prenom.slice(0, 1).toUpperCase()}{m.nom.slice(0, 1).toUpperCase()}
                  </div>
                  <span style={{ color: C.t1, fontSize: "13px", fontWeight: 600, flex: 1 }}>{m.prenom} {m.nom}</span>
                  {demarrageEnCours === m.id && <YelenLoader size={14} />}
                </button>
              ))}
            </div>
            <button onClick={() => setNouvelleOuverte(false)} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "12px 0 0" }}>Annuler</button>
          </div>
        </div>
      )}

      {groupeOuvert && (
        <div onClick={() => setGroupeOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "20px", width: "100%", maxWidth: "400px" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800, marginBottom: "14px" }}>Créer un groupe</div>
            <label style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "5px" }}>Nom du groupe</label>
            <input
              value={nomGroupe}
              onChange={e => setNomGroupe(e.target.value)}
              placeholder="Ex. Équipe Accueil"
              autoFocus
              style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, marginBottom: "14px", boxSizing: "border-box" }}
            />
            <label style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "5px" }}>Ajouter des membres</label>
            <input
              value={rechercheMembre}
              onChange={e => setRechercheMembre(e.target.value)}
              placeholder="Rechercher un collègue…"
              style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, marginBottom: "10px", boxSizing: "border-box" }}
            />
            <div style={{ maxHeight: "220px", overflowY: "auto", marginBottom: "14px" }}>
              {membresFiltres.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "12.5px", textAlign: "center", padding: "16px 0" }}>Aucun collègue ne correspond à cette recherche.</div>
              ) : membresFiltres.map(m => {
                const selectionne = membresSelectionnes.has(m.id);
                return (
                  <button key={m.id} onClick={() => basculerMembreSelectionne(m.id)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "8px 6px", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "5px", border: `1.5px solid ${selectionne ? C.gold : C.border2}`, background: selectionne ? C.gold : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {selectionne && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ color: C.t1, fontSize: "13px", fontWeight: 600, flex: 1 }}>{m.prenom} {m.nom}</span>
                  </button>
                );
              })}
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth disabled={!nomGroupe.trim() || membresSelectionnes.size === 0 || creationGroupeEnCours} loading={creationGroupeEnCours} onClick={creerGroupe}>Créer le groupe</Button>
            <button onClick={() => setGroupeOuvert(false)} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "12px 0 0" }}>Annuler</button>
          </div>
        </div>
      )}

      {ajoutMembreOuvert && (
        <div onClick={() => setAjoutMembreOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "20px", width: "100%", maxWidth: "360px" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800, marginBottom: "14px" }}>Ajouter un membre</div>
            <input
              value={rechercheMembre}
              onChange={e => setRechercheMembre(e.target.value)}
              placeholder="Rechercher un collègue…"
              autoFocus
              style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, marginBottom: "12px", boxSizing: "border-box" }}
            />
            <div style={{ maxHeight: "260px", overflowY: "auto" }}>
              {membresFiltres.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "12.5px", textAlign: "center", padding: "16px 0" }}>Aucun collègue ne correspond à cette recherche.</div>
              ) : membresFiltres.map(m => (
                <button key={m.id} onClick={() => ajouterMembreAuGroupe(m.id)} disabled={!!ajoutMembreEnCours} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 6px", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: ajoutMembreEnCours ? "default" : "pointer", textAlign: "left" }}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: C.t2, flexShrink: 0 }}>
                    {m.prenom.slice(0, 1).toUpperCase()}{m.nom.slice(0, 1).toUpperCase()}
                  </div>
                  <span style={{ color: C.t1, fontSize: "13px", fontWeight: 600, flex: 1 }}>{m.prenom} {m.nom}</span>
                  {ajoutMembreEnCours === m.id && <YelenLoader size={14} />}
                </button>
              ))}
            </div>
            <button onClick={() => setAjoutMembreOuvert(false)} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "12px 0 0" }}>Fermer</button>
          </div>
        </div>
      )}

      {discussionMessageId && (
        <div onClick={() => setDiscussionMessageId(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px 18px 0 0", padding: "20px", width: "100%", maxWidth: "480px", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800 }}>Discussion</div>
              <button onClick={() => setDiscussionMessageId(null)} aria-label="Fermer" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {discussionChargement ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={22}/></div>
            ) : discussionRacine && (
              <>
                <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "12px", marginBottom: "12px" }}>
                  <div style={{ color: C.t1, fontSize: "13px", lineHeight: 1.5 }}>{rendreContenuAvecMentions(discussionRacine.contenu ?? "", participants, C)}</div>
                  <div style={{ color: C.t3, fontSize: "10px", marginTop: "4px" }}>{formatHeureMsg(discussionRacine.cree_le)}</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
                  {discussionReponses.length === 0 ? (
                    <div style={{ color: C.t3, fontSize: "12.5px", textAlign: "center", padding: "12px" }}>Aucune réponse pour l&apos;instant.</div>
                  ) : discussionReponses.map(r => {
                    const nomAuteur = r.de_moi ? null : (r.auteur_nom ?? null);
                    return (
                      <div key={r.id}>
                        {!r.de_moi && nomAuteur && <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 700, marginBottom: "2px" }}>{nomAuteur}</div>}
                        <div style={{ background: r.de_moi ? C.bgCard2 : C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "8px 12px", color: r.supprime ? C.t3 : C.t1, fontSize: "12.5px", lineHeight: 1.5, fontStyle: r.supprime ? "italic" : "normal", display: "inline-block" }}>
                          {r.supprime ? "Message supprimé" : rendreContenuAvecMentions(r.contenu ?? "", participants, C)}
                        </div>
                        <div style={{ color: C.t3, fontSize: "10px", marginTop: "2px" }}>{formatHeureMsg(r.cree_le)}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={discussionTexte}
                    onChange={e => setDiscussionTexte(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyerReponse(); } }}
                    placeholder="Répondre…"
                    style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px 12px", fontSize: "13px", color: C.t1 }}
                  />
                  <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!discussionTexte.trim() || discussionEnvoiEnCours} loading={discussionEnvoiEnCours} onClick={envoyerReponse}>Envoyer</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mentionsVueOuverte && (
        <div onClick={() => setMentionsVueOuverte(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "20px", width: "100%", maxWidth: "440px", maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800, marginBottom: "14px" }}>Mentions</div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {mentions.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "12.5px", textAlign: "center", padding: "24px 0" }}>Personne ne vous a mentionné pour l&apos;instant.</div>
              ) : mentions.map(m => (
                <button key={m.id} onClick={() => allerVersMention(m)} className="tap" style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "10px 6px", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }}>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{m.auteur_nom}</span>
                    {m.conversation_nom && <span style={{ color: C.t3, fontSize: "11px" }}>· {m.conversation_nom}</span>}
                    {!m.lu && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.gold, marginLeft: "auto", flexShrink: 0 }}/>}
                  </div>
                  <span style={{ color: C.t2, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{m.extrait}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setMentionsVueOuverte(false)} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "12px 0 0" }}>Fermer</button>
          </div>
        </div>
      )}

      {rechercheGlobaleOuverte && (
        <div onClick={() => setRechercheGlobaleOuverte(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px", paddingTop: "10vh" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "16px", width: "100%", maxWidth: "480px", maxHeight: "60vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ color: C.t3, display: "flex" }}><IconSearch/></span>
              <input
                value={rechercheGlobaleTexte}
                onChange={e => setRechercheGlobaleTexte(e.target.value)}
                placeholder="Rechercher dans vos messages et fichiers…"
                autoFocus
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: "14px", color: C.t1 }}
              />
              {rechercheGlobaleEnCours && <YelenLoader size={14}/>}
            </div>
            <div style={{ flex: 1, overflowY: "auto", borderTop: `1px solid ${C.border}` }}>
              {rechercheGlobaleTexte.trim().length < 2 ? (
                <div style={{ color: C.t3, fontSize: "12px", textAlign: "center", padding: "20px 0" }}>Tapez au moins 2 caractères pour lancer la recherche.</div>
              ) : !rechercheGlobaleEnCours && rechercheGlobaleResultats.length === 0 ? (
                <div style={{ color: C.t3, fontSize: "12px", textAlign: "center", padding: "20px 0" }}>Aucun résultat dans vos conversations.</div>
              ) : rechercheGlobaleResultats.map(r => (
                <button key={r.id} onClick={() => allerVersResultat(r)} className="tap" style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "10px 6px", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{r.auteur_nom}</span>
                    <span style={{ color: C.t3, fontSize: "11px" }}>· {r.conversation_nom}</span>
                  </div>
                  <span style={{ color: C.t2, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{r.est_fichier && <IconFichier/>} {r.extrait}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationRow({ c, C, active, onClick, onToggleFavori }: {
  c: ConversationListItem; C: ThemeTokens; active: boolean; onClick: () => void; onToggleFavori: () => void;
}) {
  return (
    <div onClick={onClick} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", cursor: "pointer", background: active ? C.bg3 : "transparent", borderLeft: active ? `2px solid ${C.gold}` : "2px solid transparent" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: C.t2, flexShrink: 0 }}>
        {c.nom.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
          <span style={{ color: C.t1, fontSize: "13px", fontWeight: c.non_lus > 0 ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</span>
          {c.dernier_message && <span style={{ color: C.t3, fontSize: "10px", flexShrink: 0 }}>{formatRelatifConv(c.dernier_message.cree_le)}</span>}
        </div>
        <div style={{ color: c.non_lus > 0 ? C.t1 : C.t3, fontSize: "11.5px", fontWeight: c.non_lus > 0 ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.dernier_message ? `${c.dernier_message.de_moi ? "Vous : " : ""}${c.dernier_message.contenu}` : "Aucun message"}
        </div>
      </div>
      {c.non_lus > 0 && (
        <span style={{ background: C.gold, color: "#111", fontSize: "10px", fontWeight: 800, borderRadius: "10px", padding: "1px 6px", flexShrink: 0 }}>{c.non_lus}</span>
      )}
      <button onClick={e => { e.stopPropagation(); onToggleFavori(); }} aria-label="Favori" style={{ background: "none", border: "none", color: c.favori ? C.gold : C.t3, cursor: "pointer", flexShrink: 0, padding: "2px" }}>
        <IconStar filled={c.favori} color={c.favori ? C.gold : C.t3}/>
      </button>
    </div>
  );
}
