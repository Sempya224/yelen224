"use client";

// Écran Messagerie institution — refonte "Customer Communication Workspace"
// (chantier Messagerie V2, 06/09/2026, PC uniquement — mobile citoyen hors
// périmètre, cf. lib/messagerie.ts inchangé). Remplace l'ancien modèle
// "une conversation = un rdv, fermée à son statut terminal" par la vraie
// entité `conversations` (Lot A) : plusieurs fils possibles par citoyen,
// statut indépendant du rdv éventuellement lié, assignable à un membre.
// Consomme /api/institution/conversations* (Lot B) — l'ancien
// /api/institution/messages reste en place pour MesClientsTab.tsx (mode
// historique par citoyen_id, inchangé) et pour l'upload d'image (voir plus
// bas, limitation documentée).
//
// Simplifications assumées pour ce Lot (documentées plutôt que cachées) :
// - Panneau contexte client : profil + rdv lié + assignation + actions
//   rapides seulement, pas encore le compteur "8 conversations / 5 rdv"
//   (nécessiterait une agrégation dédiée, reporté à un lot ultérieur).
// - Panneau contexte client visible uniquement ≥1280px, pas de bouton
//   masquer/réouvrir manuel pour l'instant (Lot F, polish/responsive) —
//   sur les largeurs plus étroites, toutes les actions (assigner, statut)
//   restent accessibles via le menu "⋮" du fil, jamais exclusives au panneau.
// - Envoi d'image : toujours via l'ancienne route (form rdv_id), donc
//   seulement possible pour une conversation liée à un rendez-vous —
//   bouton caméra désactivé sinon (message explicite, pas un échec muet).
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { YelenLoader } from "@/components/YelenLoader";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type ConvStatut = "ouverte" | "en_attente" | "fermee";
type RdvInfo = { id: string; service: string | null; date_rdv: string; heure_rdv: string | null; statut: string };
type MembreInfo = { id: string; nom: string };
type ConversationListItem = {
  id: string; citoyen_id: string; citoyen_nom: string; citoyen_verifie: boolean; citoyen_photo_url: string | null;
  statut: ConvStatut; sujet: string | null; rdv: RdvInfo | null; assigned_membre: MembreInfo | null;
  dernier_message: string | null; dernier_message_type: "texte" | "image" | null; dernier_message_at: string | null;
  non_lus: number; cree_le: string; mis_a_jour_le: string;
};
type ConversationDetail = { id: string; statut: ConvStatut; sujet: string | null; rdv: RdvInfo | null; assigned_membre: MembreInfo | null; cree_le: string; mis_a_jour_le: string };
type CitoyenInfo = { id: string; nom: string; telephone: string | null; email: string | null; ville: string | null; identite_verifiee: boolean; photo_url: string | null };
type AnyMsg = { id: string; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string; mine: boolean; lu: boolean; pending?: boolean };
type RawMsg = { id: string; contenu: string | null; image_url: string | null; type?: "texte" | "image"; cree_le: string; emetteur?: string; lu?: boolean };
type MembreLite = { id: string; prenom: string; nom: string };
type Filtre = "toutes" | "non_lues" | "en_attente" | "terminees";

const P = { pointerEvents: "none" as const };
const Ic = {
  X:       () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  // Repris tel quel de CommunicationTab.tsx/MesOffresTab.tsx (Image) et
  // SignalementsTab.tsx (Paperclip) — même famille d'icônes déjà utilisée
  // ailleurs dans ce dossier, retour Bryan 06/09/2026 ("pousser le champ
  // d'envoi", remplacer caméra par image, ajouter fichier).
  Image2:  () => <svg style={P} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  Paperclip: () => <svg style={P} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  Smile:   () => <svg style={P} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
  Send:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Lock:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Back:    () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  Search:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Dots:    () => <svg style={P} width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>,
  Calendar:() => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Chevron: () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Shield:  () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z"/></svg>,
  // Repris tel quel de MesClientsTab.tsx (Phone/User) et layout.tsx (Pin) —
  // même famille d'icônes (Feather) déjà utilisée partout ailleurs dans ce
  // dossier, pas une nouvelle famille inventée pour cet écran.
  Phone:   () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Mail:    () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>,
  Pin:     () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  User:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Pause:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  Check:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  // Statut d'envoi (retour Bryan 06/09/2026, "en cours d'envoi, reçu, pour
  // être transparent") — même convention visuelle que WhatsApp : horloge en
  // cours, un check envoyé, double check colorée lue.
  Clock:   () => <svg style={P} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>,
  CheckDouble: () => <svg style={P} width="14" height="10" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 8 5 12 12 4"/><polyline points="9 8 13 12 22 2"/></svg>,
};

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
}
// Même composant que ValiderRdvTab.tsx/PaiementsTab.tsx (photo réelle si
// uploadée, sinon initiales sur fond doré plat Yelen — les 3 copies
// harmonisées le même jour, retour Bryan 06/09/2026, l'ancien fond teinté
// transparent ne doit plus apparaître nulle part).
function Avatar({ nom, photoUrl, C, size = 44 }: { nom: string | null | undefined; photoUrl?: string | null; C: ThemeTokens; size?: number }) {
  return (
    <div style={{ width: size, height: size, position: "relative", borderRadius: Math.round(size * 0.32), overflow: "hidden", flexShrink: 0, backgroundColor: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {photoUrl ? (
        <Image src={photoUrl} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }}/>
      ) : (
        <span style={{ color: "#000", fontSize: Math.round(size * 0.36), fontWeight: 800 }}>{getInitials(nom ?? "") || "?"}</span>
      )}
    </div>
  );
}
function formatHeure(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function estMemeJour(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function formatSeparateurJour(dateStr: string): string {
  const auj = new Date(); const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (estMemeJour(dateStr, auj.toISOString())) return "Aujourd'hui";
  if (estMemeJour(dateStr, hier.toISOString())) return "Hier";
  return new Date(dateStr).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function formatApercu(c: { dernier_message: string | null; dernier_message_type: "texte" | "image" | null }): string {
  if (c.dernier_message_type === "image") return "Image";
  return c.dernier_message ?? "Aucun message";
}
function formatDateRdv(dateStr: string, heure: string | null): string {
  const d = new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return heure ? `${d} · ${heure.slice(0, 5)}` : d;
}
function contexteLabel(c: { sujet: string | null; rdv: RdvInfo | null }): string | null {
  if (c.rdv) return `Rendez-vous · ${c.rdv.service ?? "Consultation"}`;
  return c.sujet;
}
function statutMeta(s: ConvStatut, C: ThemeTokens): { label: string; color: string } {
  if (s === "ouverte") return { label: "Ouverte", color: C.green };
  if (s === "en_attente") return { label: "En attente", color: C.orange };
  return { label: "Terminée", color: C.t3 };
}

export function MessagerieTab({ onToast, initialCitoyenId, suspendu, onVoirProfilClient, onVoirRdv, instName, instLogo }: {
  onToast: (msg: string, color?: string) => void;
  initialCitoyenId?: string | null;
  suspendu?: boolean;
  onVoirProfilClient?: (citoyenId: string) => void;
  onVoirRdv?: () => void;
  instName?: string | null;
  instLogo?: string | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [counts, setCounts] = useState({ toutes: 0, non_lues: 0, en_attente: 0, terminees: 0 });
  const [listLoading, setListLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const [recherche, setRecherche] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [citoyenInfo, setCitoyenInfo] = useState<CitoyenInfo | null>(null);
  const [thread, setThread] = useState<AnyMsg[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const [messageText, setMessageText] = useState("");
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [assignSubmenu, setAssignSubmenu] = useState(false);
  const [membres, setMembres] = useState<MembreLite[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // "En train d'écrire…" (retour Bryan 06/09/2026, façon WhatsApp/Messenger)
  // — canal Broadcast Supabase Realtime éphémère, pas de table/RLS
  // impliquée (contrairement à postgres_changes, un Broadcast n'est jamais
  // filtré par une policy de lecture de table). Émission institution
  // fonctionnelle dès maintenant ; réception du côté citoyen dépend d'un
  // ajout côté mobile (lib/messagerie.ts, hors périmètre de ce chantier
  // jusqu'ici) — infrastructure prête des deux côtés de ce fichier, mais
  // rien n'apparaîtra tant que le mobile n'émet pas sur le même canal.
  const [autreEnTrainDecrire, setAutreEnTrainDecrire] = useState(false);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const autreTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const resolveImageUrls = useCallback(async (paths: string[]) => {
    const uniq = [...new Set(paths)];
    if (uniq.length === 0) return;
    try {
      const res = await fetch("/api/institution/messages/image-url", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: uniq }),
      });
      const j = await res.json().catch(() => null);
      if (j?.success) setImageUrls(prev => ({ ...prev, ...j.urls }));
    } catch {}
  }, []);

  const loadConversations = useCallback(async (): Promise<ConversationListItem[]> => {
    setListLoading(true);
    try {
      const res = await fetch("/api/institution/conversations");
      if (res.status === 403) { setForbidden(true); setListLoading(false); return []; }
      const j = await res.json().catch(() => null);
      const list: ConversationListItem[] = res.ok ? (j?.conversations ?? []) : [];
      setConversations(list);
      setCounts(j?.counts ?? { toutes: 0, non_lues: 0, en_attente: 0, terminees: 0 });
      return list;
    } catch {
      onToast("Impossible de charger les conversations.", C.red);
      return [];
    } finally {
      setListLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `silencieux` (retour Bryan 06/09/2026, "envoi et reçois sans recharger
  // le navigateur") : utilisé par le polling ci-dessous — jamais de
  // spinner plein écran sur un rafraîchissement silencieux (même piège que
  // ClockInShiftTab/SignalementsTab, voir CLAUDE.md).
  const loadDetail = useCallback(async (id: string, silencieux = false) => {
    if (!silencieux) setThreadLoading(true);
    try {
      const res = await fetch(`/api/institution/conversations/${id}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Erreur");
      setDetail(j.conversation);
      setCitoyenInfo(j.citoyen);
      const msgs: RawMsg[] = j.messages ?? [];
      const unified: AnyMsg[] = msgs.map(m => ({ id: m.id, contenu: m.contenu, image_url: m.image_url, type: m.type ?? "texte", cree_le: m.cree_le, mine: m.emetteur === "institution", lu: m.lu ?? false }));
      setThread(unified);
      resolveImageUrls(unified.filter(m => m.type === "image" && m.image_url).map(m => m.image_url as string));
      setConversations(prev => prev.map(c => c.id === id ? { ...c, non_lus: 0 } : c));
    } catch {
      if (!silencieux) onToast("Impossible de charger la conversation.", C.red);
    } finally {
      if (!silencieux) setThreadLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveImageUrls]);

  // Réception live des messages (retour Bryan 06/09/2026, "arrange ça au
  // niveau US" après refus d'ouvrir messages/conversations en lecture
  // publique) : le serveur relaie un signal via Server-Sent Events dès
  // qu'un message/statut change pour CETTE conversation (voir
  // app/api/institution/conversations/[id]/stream/route.ts, service_role
  // côté serveur, jamais de policy RLS élargie). EventSource se reconnecte
  // nativement en cas de coupure — filet de sécurité à 25s en plus, au cas
  // où une reconnexion serait manquée (même principe que le polling déjà
  // en place ailleurs dans layout.tsx pour son propre Realtime).
  useEffect(() => {
    if (!selectedId) return;
    const es = new EventSource(`/api/institution/conversations/${selectedId}/stream`);
    es.addEventListener("changed", () => loadDetail(selectedId, true));
    const filet = setInterval(() => loadDetail(selectedId, true), 25000);
    return () => { es.close(); clearInterval(filet); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Clé de canal = rdv_id, pas conversation_id : c'est la seule chose que
  // le mobile citoyen (lib/messagerie.ts, non refondu) connaît. Une
  // conversation sans rdv lié n'a donc pas d'indicateur "en train
  // d'écrire" pour l'instant — même limitation déjà documentée pour
  // l'envoi d'image.
  const rdvIdPourTyping = detail?.rdv?.id ?? null;
  useEffect(() => {
    setAutreEnTrainDecrire(false);
    if (!rdvIdPourTyping) { typingChannelRef.current = null; return; }
    const channel = supabase
      .channel(`typing-rdv-${rdvIdPourTyping}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if ((payload as { from?: string })?.from !== "citoyen") return;
        setAutreEnTrainDecrire(true);
        if (autreTypingTimeoutRef.current) clearTimeout(autreTypingTimeoutRef.current);
        autreTypingTimeoutRef.current = setTimeout(() => setAutreEnTrainDecrire(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      if (autreTypingTimeoutRef.current) clearTimeout(autreTypingTimeoutRef.current);
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [rdvIdPourTyping]);

  function signalerEnTrainDecrire() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: "institution" } });
  }

  useEffect(() => {
    (async () => {
      const list = await loadConversations();
      if (initialCitoyenId) {
        const match = list.find(c => c.citoyen_id === initialCitoyenId && c.statut !== "fermee") ?? list.find(c => c.citoyen_id === initialCitoyenId);
        if (match) setSelectedId(match.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCitoyenId]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    setMenuOpen(false);
    setAssignSubmenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread, selectedId]);

  useEffect(() => {
    if (!assignSubmenu || membres.length > 0) return;
    (async () => {
      try {
        const res = await fetch("/api/institution/membres");
        const j = await res.json().catch(() => null);
        if (res.ok) setMembres(j?.membres ?? []);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignSubmenu]);

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setPendingImageFile(file);
    setPendingImagePreview(URL.createObjectURL(file));
  }
  function cancelPendingImage() {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(null);
    setPendingImagePreview(null);
  }

  async function handleSendImage() {
    if (!pendingImageFile || !selectedId || !detail?.rdv) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("rdv_id", detail.rdv.id);
      if (messageText.trim()) form.append("legende", messageText.trim());
      form.append("file", pendingImageFile);
      const res = await fetch("/api/institution/messages/upload-image", { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error || "Erreur d'envoi de l'image.");

      if (j.path && j.url) setImageUrls(prev => ({ ...prev, [j.path]: j.url }));
      const legende = messageText.trim() || null;
      cancelPendingImage();
      setMessageText("");

      setThread(prev => [...prev, { id: `local-${Date.now()}`, contenu: legende, image_url: j.path, type: "image", cree_le: new Date().toISOString(), mine: true, lu: false }]);
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, dernier_message: null, dernier_message_type: "image", dernier_message_at: new Date().toISOString() } : c));
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Erreur d'envoi de l'image.", C.red);
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (sending || !selectedId) return;
    if (pendingImageFile) { await handleSendImage(); return; }
    const contenu = messageText.trim();
    if (!contenu) return;
    setSending(true);
    // Optimiste affiché tout de suite ("En cours d'envoi...", retour Bryan
    // 06/09/2026) — réconcilié avec l'id réel au retour de la route, ou
    // retiré si l'envoi échoue (jamais laissé "en cours" indéfiniment).
    const localId = `local-${Date.now()}`;
    setThread(prev => [...prev, { id: localId, contenu, image_url: null, type: "texte", cree_le: new Date().toISOString(), mine: true, lu: false, pending: true }]);
    setMessageText("");
    try {
      const res = await fetch(`/api/institution/conversations/${selectedId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenu }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Erreur d'envoi.");
      setThread(prev => prev.map(m => m.id === localId ? { ...m, id: j?.message?.id ?? localId, cree_le: j?.message?.cree_le ?? m.cree_le, pending: false } : m));
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, dernier_message: contenu, dernier_message_type: "texte", dernier_message_at: new Date().toISOString() } : c));
    } catch (e) {
      setThread(prev => prev.filter(m => m.id !== localId));
      onToast(e instanceof Error ? e.message : "Erreur d'envoi. Réessayez.", C.red);
    } finally {
      setSending(false);
    }
  }

  async function doAction(action: "fermer" | "reouvrir" | "mettre_en_attente" | "reprendre") {
    if (!selectedId || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/institution/conversations/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Action impossible.");
      await loadDetail(selectedId);
      loadConversations();
      setMenuOpen(false);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Action impossible.", C.red);
    } finally {
      setActionLoading(false);
    }
  }

  async function doAssign(membreId: string | null) {
    if (!selectedId || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/institution/conversations/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assigner", membre_id: membreId }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Assignation impossible.");
      await loadDetail(selectedId);
      loadConversations();
      setAssignSubmenu(false);
      setMenuOpen(false);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Assignation impossible.", C.red);
    } finally {
      setActionLoading(false);
    }
  }

  const dansUnFil = !!selectedId;
  const fermee = detail?.statut === "fermee";
  const enAttente = detail?.statut === "en_attente";
  // Restriction messagerie institution → citoyen pendant une suspension
  // (retour Bryan 17/08/2026, "côté institutions le plus important") — le
  // support Yelen reste séparé (écran dédié) et n'a plus rien à voir avec
  // cet écran. La vraie barrière vit côté serveur (POST .../messages).
  const suspenduBloque = !fermee && suspendu === true;

  const listeVisibleMobile = !selectedId;
  const detailVisibleMobile = dansUnFil;

  const filtered = conversations.filter(c => {
    if (filtre === "non_lues" && c.non_lus === 0) return false;
    if (filtre === "en_attente" && c.statut !== "en_attente") return false;
    if (filtre === "terminees" && c.statut !== "fermee") return false;
    if (recherche.trim()) {
      const hay = [c.citoyen_nom, c.dernier_message ?? "", c.sujet ?? "", c.rdv?.service ?? ""].join(" ").toLowerCase();
      if (!hay.includes(recherche.trim().toLowerCase())) return false;
    }
    return true;
  });

  const FILTRES: { key: Filtre; label: string; count: number }[] = [
    { key: "toutes", label: "Toutes", count: counts.toutes },
    { key: "non_lues", label: "Non lues", count: counts.non_lues },
    { key: "en_attente", label: "En attente", count: counts.en_attente },
    { key: "terminees", label: "Terminées", count: counts.terminees },
  ];

  if (forbidden) {
    return (
      <Card tokens={toCardTokens(C)} padding="32px 24px" style={{ textAlign: "center" }}>
        <p style={{ color: C.t2, fontSize: "13px" }}>Cet écran est réservé aux rôles autorisés à échanger avec les clients.</p>
      </Card>
    );
  }

  // Hauteur calée sur le vrai en-tête (56px + 1px de bordure, layout.tsx
  // ligne ~3130) pour que le bas de l'écran touche le viewport comme la
  // sidebar (100svh) — l'ancienne valeur "140px" (héritée telle quelle de
  // l'ancien MessagerieTab.tsx, jamais recalculée) laissait ~83px d'espace
  // vide en bas, retour Bryan 06/09/2026.
  return (
    <Card tokens={toCardTokens(C)} noPadding style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 57px)", minHeight: "480px" }}>
      <style>{`
        .msgv2-tap{transition:opacity 0.1s,transform 0.1s;cursor:pointer}
        .msgv2-tap:active{opacity:0.65;transform:scale(0.97)}
        .msgv2-pane{display:none;min-height:0}
        .msgv2-pane-on{display:flex}
        .msgv2-client-pane{display:none}
        @media (min-width:860px){
          .msgv2-pane{display:flex !important}
          .msgv2-body{flex-direction:row !important}
          .msgv2-list-pane{width:300px;flex-shrink:0;border-right:1px solid ${C.border}}
        }
        @media (min-width:1280px){
          .msgv2-client-pane{display:flex !important;width:300px;flex-shrink:0;border-left:1px solid ${C.border};flex-direction:column;overflow-y:auto}
        }
      `}</style>

      <div className="msgv2-body" style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* ── Colonne conversations ── */}
        <div className={`msgv2-pane msgv2-list-pane ${listeVisibleMobile ? "msgv2-pane-on" : ""}`} style={{ flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ color: C.t1, fontSize: 15, fontWeight: 800 }}>Messages</span>
              <span style={{ color: C.t3, fontSize: 11 }}>{counts.toutes} conversation{counts.toutes > 1 ? "s" : ""} · {counts.non_lues} non lue{counts.non_lues > 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: C.bgCard2, borderRadius: 10, padding: "7px 10px", marginBottom: 10 }}>
              <span style={{ color: C.t3, display: "flex" }}>{Ic.Search()}</span>
              <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher une conversation…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.t1, fontSize: 12.5 }}/>
            </div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
              {FILTRES.map(f => (
                <button key={f.key} onClick={() => setFiltre(f.key)} className="msgv2-tap" style={{ flexShrink: 0, background: filtre === f.key ? C.gold : "transparent", color: filtre === f.key ? "#000" : C.t2, border: `1px solid ${filtre === f.key ? C.gold : C.border}`, borderRadius: 8, padding: "5px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {f.label} {f.count}
                </button>
              ))}
            </div>
          </div>

          {listLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={22}/></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 20px", color: C.t3, fontSize: 12.5, lineHeight: 1.6 }}>
              {conversations.length === 0 ? "Aucune conversation pour l'instant — elles apparaîtront ici dès qu'un client vous écrira ou qu'un rendez-vous sera confirmé." : "Aucune conversation ne correspond à ce filtre."}
            </div>
          ) : (
            <div>
              {filtered.map(c => {
                const activeRow = selectedId === c.id;
                const meta = statutMeta(c.statut, C);
                const ctx = contexteLabel(c);
                return (
                  <div key={c.id} onClick={() => setSelectedId(c.id)} className="msgv2-tap" style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 16px", borderLeft: `2px solid ${activeRow ? C.gold : "transparent"}`, background: activeRow ? C.bgCard2 : "transparent", cursor: "pointer" }}>
                    <Avatar nom={c.citoyen_nom} photoUrl={c.citoyen_photo_url} C={C} size={36}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                          <span style={{ color: C.t1, fontSize: 13, fontWeight: c.non_lus > 0 ? 800 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.citoyen_nom}</span>
                          {c.citoyen_verifie && <span style={{ color: C.blue, flexShrink: 0, display: "flex" }} title="Identité Yelen vérifiée">{Ic.Shield()}</span>}
                        </span>
                        {c.dernier_message_at && <span style={{ color: C.t3, fontSize: 10.5, flexShrink: 0 }}>{formatHeure(c.dernier_message_at)}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }}/>
                        <span style={{ color: meta.color, fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{meta.label}</span>
                      </div>
                      <div style={{ color: c.non_lus > 0 ? C.t2 : C.t3, fontSize: 11.5, fontWeight: c.non_lus > 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{formatApercu(c)}</div>
                      {ctx && <div style={{ color: C.t3, fontSize: 10, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ctx}</div>}
                    </div>
                    {c.non_lus > 0 && <span style={{ background: C.red, color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 17, height: 17, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0, marginTop: 2 }}>{c.non_lus}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Colonne conversation ── */}
        <div className={`msgv2-pane msgv2-detail-pane ${detailVisibleMobile ? "msgv2-pane-on" : ""}`} style={{ flexDirection: "column", flex: 1, minHeight: 0 }}>
          {!dansUnFil ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t3, fontSize: 12.5, padding: 24, textAlign: "center" }}>
              Sélectionnez une conversation
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, position: "relative" }}>
                <button onClick={() => setSelectedId(null)} className="msgv2-tap" style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: 0, display: "flex", marginTop: 2 }}>{Ic.Back()}</button>
                <Avatar nom={conversations.find(c => c.id === selectedId)?.citoyen_nom ?? citoyenInfo?.nom} photoUrl={citoyenInfo?.photo_url} C={C} size={32}/>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ color: C.t1, fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {conversations.find(c => c.id === selectedId)?.citoyen_nom ?? citoyenInfo?.nom ?? "…"}
                    </span>
                    {citoyenInfo?.identite_verifiee && <span style={{ color: C.blue, display: "flex", flexShrink: 0 }} title="Identité Yelen vérifiée">{Ic.Shield()}</span>}
                  </div>
                  {detail && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: statutMeta(detail.statut, C).color }}/>
                      <span style={{ color: statutMeta(detail.statut, C).color, fontSize: 10.5, fontWeight: 700 }}>{statutMeta(detail.statut, C).label}</span>
                      {detail.assigned_membre && <span style={{ color: C.t3, fontSize: 10.5 }}>· Assignée à {detail.assigned_membre.nom}</span>}
                    </div>
                  )}
                </div>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <button onClick={() => setMenuOpen(v => !v)} disabled={actionLoading} className="msgv2-tap" style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: 4, display: "flex" }}>{Ic.Dots()}</button>
                  {menuOpen && (
                    <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: C.shadow, minWidth: 200, zIndex: 20, overflow: "hidden" }}>
                      {onVoirProfilClient && citoyenInfo && (
                        <MenuItem C={C} label="Voir le profil" onClick={() => { setMenuOpen(false); onVoirProfilClient(citoyenInfo.id); }}/>
                      )}
                      {detail?.rdv && onVoirRdv && (
                        <MenuItem C={C} label="Voir le rendez-vous" onClick={() => { setMenuOpen(false); onVoirRdv(); }}/>
                      )}
                      <div style={{ position: "relative" }}>
                        <MenuItem C={C} label="Assigner…" onClick={() => setAssignSubmenu(v => !v)}/>
                        {assignSubmenu && (
                          <div style={{ borderTop: `1px solid ${C.border}`, maxHeight: 160, overflowY: "auto" }}>
                            <MenuItem C={C} label="Aucun (désassigner)" small onClick={() => doAssign(null)}/>
                            {membres.map(m => (
                              <MenuItem key={m.id} C={C} label={[m.prenom, m.nom].filter(Boolean).join(" ")} small onClick={() => doAssign(m.id)}/>
                            ))}
                          </div>
                        )}
                      </div>
                      {detail?.statut === "ouverte" && <MenuItem C={C} label="Mettre en attente" onClick={() => doAction("mettre_en_attente")}/>}
                      {detail?.statut === "en_attente" && <MenuItem C={C} label="Reprendre la conversation" onClick={() => doAction("reprendre")}/>}
                      {detail?.statut !== "fermee" && <MenuItem C={C} label="Marquer comme terminée" onClick={() => doAction("fermer")}/>}
                      {detail?.statut === "fermee" && <MenuItem C={C} label="Réouvrir" onClick={() => doAction("reouvrir")}/>}
                    </div>
                  )}
                </div>
              </div>

              {detail?.rdv && (
                <div className="msgv2-tap" onClick={() => onVoirRdv?.()} style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 16px 0", padding: "10px 12px", background: C.bgCard2, borderRadius: 10, flexShrink: 0 }}>
                  <span style={{ color: C.gold, display: "flex" }}>{Ic.Calendar()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t3, fontSize: 10.5 }}>Rendez-vous · {formatDateRdv(detail.rdv.date_rdv, detail.rdv.heure_rdv)}</div>
                    <div style={{ color: C.t1, fontSize: 12.5, fontWeight: 700 }}>{detail.rdv.service ?? "Consultation"}</div>
                  </div>
                  {onVoirRdv && <span style={{ color: C.gold, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Voir →</span>}
                </div>
              )}

              <div ref={scrollRef} className="msgv2-thread-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 20px 8px", display: "flex", flexDirection: "column" }}>
                {threadLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={24}/></div>
                ) : thread.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: C.t3, fontSize: 12.5 }}>
                    Envoyez un premier message.
                  </div>
                ) : thread.map((m, i) => {
                  const prev = thread[i - 1];
                  const showSeparateur = !prev || !estMemeJour(prev.cree_le, m.cree_le);
                  const url = m.image_url ? imageUrls[m.image_url] : null;
                  // Avatar affiché seulement au changement d'émetteur (comme
                  // les inbox modernes) — un espaceur de même largeur garde
                  // l'alignement des bulles groupées d'un même côté.
                  const showAvatar = showSeparateur || !prev || prev.mine !== m.mine;
                  return (
                    <div key={m.id}>
                      {showSeparateur && (
                        <div style={{ textAlign: "center", margin: "16px 0 12px" }}>
                          <span style={{ color: C.t3, fontSize: 10.5, fontWeight: 700, textTransform: "capitalize" }}>{formatSeparateurJour(m.cree_le)}</span>
                        </div>
                      )}
                      {/* alignItems:flex-start (retour Bryan 06/09/2026) —
                          l'avatar doit s'aligner sur la ligne du nom en haut
                          du groupe, pas sur l'horodatage en bas (flex-end
                          plaçait visuellement l'avatar au niveau de l'heure,
                          décalage signalé sur "Bonjour"). */}
                      <div style={{ display: "flex", flexDirection: m.mine ? "row-reverse" : "row", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                        {showAvatar ? (
                          m.mine
                            ? <Avatar nom={instName} photoUrl={instLogo} C={C} size={26}/>
                            : <Avatar nom={citoyenInfo?.nom} photoUrl={citoyenInfo?.photo_url} C={C} size={26}/>
                        ) : <div style={{ width: 26, flexShrink: 0 }}/>}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start", marginBottom: 10, minWidth: 0 }}>
                          {showAvatar && (
                            <span style={{ color: C.t2, fontSize: 11, fontWeight: 800, margin: "0 2px 3px" }}>
                              {m.mine ? (instName ?? "Établissement") : (citoyenInfo?.nom ?? conversations.find(c => c.id === selectedId)?.citoyen_nom ?? "Client")}
                            </span>
                          )}
                          <div style={{ maxWidth: "min(74%, 460px)", background: m.mine ? C.bg3 : C.bgCard2, borderRadius: 14, padding: m.type === "image" ? 6 : "9px 13px" }}>
                            {m.type === "image" && (
                              url ? (
                                <Image src={url} alt="" width={800} height={600} onClick={() => setLightbox(url)} className="msgv2-tap" style={{ display: "block", width: "100%", height: "auto", maxWidth: 220, borderRadius: 9, cursor: "pointer" }}/>
                              ) : (
                                <div style={{ width: 170, height: 125, borderRadius: 9, background: C.bg3, display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={20}/></div>
                              )
                            )}
                            {m.contenu && <div style={{ color: C.t1, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: m.type === "image" ? 6 : 0, padding: m.type === "image" ? "0 4px" : 0 }}>{m.contenu}</div>}
                          </div>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: C.t3, fontSize: 10, marginTop: 4, padding: "0 2px" }}>
                            {m.pending ? "En cours d'envoi…" : formatHeure(m.cree_le)}
                            {m.mine && !m.pending && (
                              <span style={{ display: "flex", color: m.lu ? C.blue : C.t3 }}>{m.lu ? Ic.CheckDouble() : Ic.Check()}</span>
                            )}
                            {m.mine && m.pending && <span style={{ display: "flex" }}>{Ic.Clock()}</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {autreEnTrainDecrire && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <Avatar nom={citoyenInfo?.nom} photoUrl={citoyenInfo?.photo_url} C={C} size={22}/>
                    <div style={{ background: C.bgCard2, borderRadius: 14, padding: "8px 13px", color: C.t3, fontSize: 12, fontStyle: "italic" }}>en train d&apos;écrire…</div>
                  </div>
                )}
              </div>

              {fermee ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 16px", flexShrink: 0, color: C.t3 }}>
                  {Ic.Lock()}
                  <div style={{ fontSize: 11.5 }}>Conversation terminée.</div>
                  <button onClick={() => doAction("reouvrir")} disabled={actionLoading} className="msgv2-tap" style={{ background: "none", border: "none", color: C.gold, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Réouvrir</button>
                </div>
              ) : suspenduBloque ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 16px", flexShrink: 0, color: C.t2 }}>
                  {Ic.Lock()}
                  <div style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                    Votre établissement est suspendu — vous ne pouvez pas envoyer de nouveaux messages aux citoyens pour le moment.{" "}
                    <span style={{ color: C.gold, fontWeight: 700 }}>Besoin de parler à un agent ? Contactez le Support Yelen (panneau Aide et ressources, en-tête).</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "8px 16px 14px", flexShrink: 0 }}>
                  {enAttente && <div style={{ color: C.orange, fontSize: 10.5, fontWeight: 700, marginBottom: 6 }}>En attente — répondre reprendra automatiquement la conversation au prochain message.</div>}
                  {pendingImagePreview && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 9, overflow: "hidden", border: `1px solid ${C.border}` }}>
                        {/* IMG-EXCEPTION: reason=aperçu blob local (URL.createObjectURL) avant envoi, non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pendingImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      </div>
                      <button onClick={cancelPendingImage} className="msgv2-tap" style={{ background: C.bgCard2, border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, cursor: "pointer" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                      <span style={{ color: C.t3, fontSize: 11 }}>Image prête — légende optionnelle.</span>
                    </div>
                  )}
                  {/* Composer 2 lignes (retour Bryan 06/09/2026, "pousser le
                      champ d'envoi comme sur l'image de référence") — saisie
                      pleine largeur au-dessus, actions + Envoyer en dessous.
                      "Réponses rapides" de la maquette volontairement omis :
                      aucune fonctionnalité de réponses enregistrées n'existe
                      dans le produit, on n'ajoute pas un bouton décoratif. */}
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePickFile} style={{ display: "none" }}/>
                  <div style={{ background: C.bgCard2, borderRadius: 16, padding: "10px 14px 8px" }}>
                    <input
                      ref={messageInputRef}
                      value={messageText}
                      onChange={e => { setMessageText(e.target.value); signalerEnTrainDecrire(); }}
                      onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                      placeholder={pendingImageFile ? "Légende (optionnel)…" : "Écrire un message…"}
                      style={{ width: "100%", background: "none", border: "none", padding: "4px 0 8px", fontSize: 13, color: C.t1, outline: "none" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        onClick={() => onToast("Envoi de fichiers bientôt disponible.", C.orange)}
                        disabled={sending}
                        title="Joindre un fichier (bientôt disponible)"
                        className="msgv2-tap"
                        style={{ background: "none", border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.t3, cursor: "pointer", padding: "6px", opacity: 0.5 }}
                      >{Ic.Paperclip()}</button>
                      <button
                        onClick={() => detail?.rdv ? fileInputRef.current?.click() : onToast("Cette conversation n'est liée à aucun rendez-vous — l'envoi d'image n'est pas encore possible ici.", C.orange)}
                        disabled={sending}
                        title="Joindre une image"
                        className="msgv2-tap"
                        style={{ background: "none", border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: detail?.rdv ? C.t2 : C.t3, cursor: "pointer", padding: "6px", opacity: detail?.rdv ? 1 : 0.5 }}
                      >{Ic.Image2()}</button>
                      <button
                        onClick={() => messageInputRef.current?.focus()}
                        title="Emoji (clavier de votre système)"
                        className="msgv2-tap"
                        style={{ background: "none", border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, cursor: "pointer", padding: "6px" }}
                      >{Ic.Smile()}</button>
                      <div style={{ flex: 1 }}/>
                      <button onClick={handleSend} disabled={sending || (!messageText.trim() && !pendingImageFile)} className="msgv2-tap" style={{ display: "flex", alignItems: "center", gap: 6, background: C.gold, color: "#080812", border: "none", borderRadius: 12, padding: "8px 16px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", opacity: sending || (!messageText.trim() && !pendingImageFile) ? 0.5 : 1 }}>
                        {sending ? <YelenLoader size={13} color="#080812"/> : Ic.Send()} Envoyer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Colonne contexte client (≥1280px, voir simplifications en tête de fichier) ── */}
        {dansUnFil && citoyenInfo && detail && (
          <div className="msgv2-client-pane" style={{ padding: 16 }}>
            <div style={{ color: C.t1, fontSize: 12.5, fontWeight: 800, marginBottom: 12 }}>Client</div>
            <div style={{ background: C.bgCard2, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <Avatar nom={citoyenInfo.nom} photoUrl={citoyenInfo.photo_url} C={C} size={40}/>
              <div style={{ height: 10 }}/>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                <span style={{ color: C.t1, fontSize: 14, fontWeight: 800 }}>{citoyenInfo.nom}</span>
                {citoyenInfo.identite_verifiee && <span style={{ color: C.blue, display: "flex" }}>{Ic.Shield()}</span>}
              </div>
              {citoyenInfo.identite_verifiee && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.blueL, color: C.blue, fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 7, marginBottom: 10 }}>
                  {Ic.Shield()} Identité Yelen vérifiée
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, color: C.t2 }}>
                {citoyenInfo.telephone && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: C.t3, display: "flex", flexShrink: 0 }}>{Ic.Phone()}</span>{citoyenInfo.telephone}</div>}
                {citoyenInfo.email && <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><span style={{ color: C.t3, display: "flex", flexShrink: 0 }}>{Ic.Mail()}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{citoyenInfo.email}</span></div>}
                {citoyenInfo.ville && <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: C.t3, display: "flex", flexShrink: 0 }}>{Ic.Pin()}</span>{citoyenInfo.ville}</div>}
              </div>
              {onVoirProfilClient && (
                <button onClick={() => onVoirProfilClient(citoyenInfo.id)} className="msgv2-tap" style={{ marginTop: 10, background: "none", border: "none", color: C.gold, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>Voir le profil complet →</button>
              )}
            </div>

            {detail.rdv && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.t1, fontSize: 12, fontWeight: 800, marginBottom: 8 }}><span style={{ display: "flex" }}>{Ic.Calendar()}</span>Rendez-vous</div>
                <div style={{ background: C.bgCard2, borderRadius: 10, padding: 12 }}>
                  <div style={{ color: C.t3, fontSize: 10.5 }}>{formatDateRdv(detail.rdv.date_rdv, detail.rdv.heure_rdv)}</div>
                  <div style={{ color: C.t1, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{detail.rdv.service ?? "Consultation"}</div>
                  {onVoirRdv && <button onClick={onVoirRdv} className="msgv2-tap" style={{ marginTop: 8, background: "none", border: "none", color: C.gold, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>Voir le rendez-vous →</button>}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.t1, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Conversation</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: statutMeta(detail.statut, C).color }}/>
                <span style={{ color: statutMeta(detail.statut, C).color, fontSize: 11.5, fontWeight: 700 }}>{statutMeta(detail.statut, C).label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.t3, fontSize: 10.5, marginBottom: 4 }}><span style={{ display: "flex" }}>{Ic.User()}</span>Assignée à</div>
              <div style={{ color: C.t1, fontSize: 12, fontWeight: 700 }}>{detail.assigned_membre?.nom ?? "Personne"}</div>
            </div>

            <div>
              <div style={{ color: C.t1, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Actions rapides</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {onVoirProfilClient && <Button tokens={toUiTokens(C)} variant="secondary" size="sm" className="tap" fullWidth icon={Ic.User()} onClick={() => onVoirProfilClient(citoyenInfo.id)}>Voir le profil</Button>}
                {detail.rdv && onVoirRdv && <Button tokens={toUiTokens(C)} variant="secondary" size="sm" className="tap" fullWidth icon={Ic.Calendar()} onClick={onVoirRdv}>Voir le RDV</Button>}
                {detail.statut === "ouverte" && <Button tokens={toUiTokens(C)} variant="secondary" size="sm" className="tap" fullWidth icon={Ic.Pause()} loading={actionLoading} onClick={() => doAction("mettre_en_attente")}>Mettre en attente</Button>}
                {detail.statut === "en_attente" && <Button tokens={toUiTokens(C)} variant="secondary" size="sm" className="tap" fullWidth icon={Ic.Pause()} loading={actionLoading} onClick={() => doAction("reprendre")}>Reprendre</Button>}
                {detail.statut !== "fermee" && <Button tokens={toUiTokens(C)} variant="secondary" size="sm" className="tap" fullWidth icon={Ic.Check()} loading={actionLoading} onClick={() => doAction("fermer")}>Terminer</Button>}
                {detail.statut === "fermee" && <Button tokens={toUiTokens(C)} variant="secondary" size="sm" className="tap" fullWidth icon={Ic.Check()} loading={actionLoading} onClick={() => doAction("reouvrir")}>Réouvrir</Button>}
              </div>
            </div>
          </div>
        )}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <button onClick={() => setLightbox(null)} className="msgv2-tap" style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>{Ic.X()}</button>
          <Image src={lightbox} alt="" width={1200} height={900} style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }}/>
        </div>
      )}
    </Card>
  );
}

function MenuItem({ C, label, onClick, small }: { C: ThemeTokens; label: string; onClick: () => void; small?: boolean }) {
  return (
    <button onClick={onClick} className="msgv2-tap" style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", background: "none", border: "none", padding: small ? "7px 14px 7px 22px" : "9px 14px", color: small ? C.t2 : C.t1, fontSize: small ? 11.5 : 12.5, fontWeight: small ? 500 : 600, cursor: "pointer" }}>
      {label}
    </button>
  );
}
