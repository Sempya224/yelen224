"use client";

// Composeur "Yelen Community" — refonte "composer social premium" (retour
// Bryan 21/09/2026, inspiré des standards UX LinkedIn/X sans en copier le
// design) : remplace l'ancien écran façon formulaire (bouton "Ajouter une
// image" séparé, grille des 10 catégories toujours visible) par un composer
// immersif — texte au centre, média/outils dans une barre d'outils fixe,
// catégorie réduite à une propriété discrète de la publication. Refonte
// strictement visuelle/interaction : aucune règle métier, aucun champ
// serveur, aucune validation ne change (toujours texte-ou-image + catégorie
// obligatoire, voir app/api/citoyen/posts/route.ts) — seul le rendu change.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarInstitution, CategorieBadge } from "@/components/CommunautePostCard";
import { YelenLoader } from "@/components/YelenLoader";
import { POST_CATEGORIES, POST_CATEGORIE_LABELS, POST_CATEGORIE_COULEURS, type PostCategorie } from "@/lib/communauteCategories";
import { chargerCiblesMentionnables, type CibleMentionnable } from "@/lib/communauteMentions";
import type { PostSuggestion } from "@/lib/postSuggestions";

const MAX_IMAGES = 4;
const GOLD = "#F5A623";

// Mentions @profil (09/09/2026, Lot mentions) — état 100% local à ce
// composeur (comme menuOuvert dans PostCard), pas remonté à page.tsx : ne
// concerne que l'interaction de frappe dans le textarea, `texte` reste la
// seule chose que le parent connaît. Note honnête : le textarea reste du
// texte brut pendant la frappe — la mention choisie s'insère sous sa forme
// encodée `@[Nom](type:id)`, pas comme une vraie puce visuelle tant que la
// publication n'est pas affichée (ça demanderait un éditeur richtext,
// hors périmètre de ce lot).
function detecterMentionActive(texte: string, position: number): { debut: number; requete: string } | null {
  const avant = texte.slice(0, position);
  const idx = avant.lastIndexOf("@");
  if (idx === -1) return null;
  const precedent = idx > 0 ? avant[idx - 1] : "\n";
  if (!/\s/.test(precedent)) return null;
  const requete = avant.slice(idx + 1);
  if (/\s/.test(requete)) return null;
  return { debut: idx, requete };
}

// Brouillon (section 11 du brief 21/09/2026, retour Bryan) — persistance
// 100% locale (localStorage), volontairement limitée au texte + catégorie :
// les fichiers (File[]) ne sont pas sérialisables, un brouillon avec image
// perd simplement ses images au rechargement plutôt que de planter. Aucun
// impact serveur/schema — try/catch systématique (piège connu localStorage
// mobile, voir CLAUDE.md /pieges-techniques-connus).
const DRAFT_KEY = "yelen224_community_post_draft";
type PostDraft = { texte: string; categorie: string | null };
function lireDraft(): PostDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d?.texte !== "string") return null;
    return { texte: d.texte, categorie: typeof d.categorie === "string" ? d.categorie : null };
  } catch { return null; }
}
function ecrireDraft(d: PostDraft) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {} }
function effacerDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

// ── Icônes SVG sobres (jamais d'emoji Unicode brut comme élément
// d'interface — même règle que le reste de Yelen). ────────────────────────
const P = { pointerEvents: "none" as const };
function IconImage() { return <svg style={P} width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>; }
function IconGif() { return <svg style={P} width="21" height="21" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.8" /><text x="12" y="14.6" textAnchor="middle" fontSize="6.6" fontWeight="800" fill="currentColor" fontFamily="inherit">GIF</text></svg>; }
function IconEmoji() { return <svg style={P} width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>; }
function IconMore() { return <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>; }
function IconPlus() { return <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function IconX({ size = 12, weight = 3 }: { size?: number; weight?: number }) { return <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function IconChevronRight() { return <svg style={P} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>; }
function IconCheck({ color }: { color: string }) { return <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function IconGlobe() { return <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>; }
function IconPoll() { return <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="20" x2="6" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" /></svg>; }
function IconEvent() { return <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>; }
function IconDocument() { return <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>; }
function IconLocation() { return <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>; }

// Bottom sheet générique (même esprit que CarteMapHome.tsx::InstPopup —
// handle, coins très arrondis, backdrop flouté) réutilisé pour le choix de
// catégorie et le panneau "+ Options".
function BottomSheet({ onClose, isDark, brd, children }: { onClose: () => void; isDark: boolean; brd: string; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: isDark ? "#1C1C1E" : "#fff", borderRadius: "24px 24px 0 0", border: `1px solid ${brd}`, borderBottom: "none", paddingBottom: "env(safe-area-inset-bottom)", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 -12px 40px rgba(0,0,0,0.22)" }}>
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.14)", margin: "10px auto 2px" }} />
        {children}
      </div>
    </div>
  );
}

const OPTIONS_A_VENIR: { label: string; desc: string; icon: () => React.ReactElement }[] = [
  { label: "Sondage", desc: "Posez une question à la Communauté", icon: IconPoll },
  { label: "Événement", desc: "Partagez une date à retenir", icon: IconEvent },
  { label: "Document", desc: "Joignez un fichier à votre publication", icon: IconDocument },
  { label: "Localisation", desc: "Indiquez où vous êtes", icon: IconLocation },
];

export default function CreerPostOverlay({
  userName, userPhoto,
  texte, setTexte, fichiers, setFichiers, categorie, setCategorie, envoi,
  fileInputRef, onChoisirFichiers, onPublier, onFermer,
  suggestions, onChoisirSuggestion,
  isDark, bg, card2, t1, t2, brd,
}: {
  userName: string; userPhoto: string | null;
  texte: string; setTexte: (v: string) => void;
  fichiers: File[]; setFichiers: (v: File[] | ((prev: File[]) => File[])) => void;
  categorie: string | null; setCategorie: (v: string | null) => void;
  envoi: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onChoisirFichiers: (f: FileList | null) => void;
  onPublier: () => void;
  onFermer: () => void;
  suggestions: PostSuggestion[];
  onChoisirSuggestion: (s: PostSuggestion) => void;
  isDark: boolean; bg: string; card: string; card2: string; t1: string; t2: string; brd: string;
}) {
  const peutPublier = !!((texte.trim() || fichiers.length > 0) && categorie && !envoi);

  const overlayRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [curseur, setCurseur] = useState(0);
  const [cibles, setCibles] = useState<CibleMentionnable[] | null>(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [optionsSheetOpen, setOptionsSheetOpen] = useState(false);
  const [audienceInfoOpen, setAudienceInfoOpen] = useState(false);
  const [confirmFermerOpen, setConfirmFermerOpen] = useState(false);
  const [bientotMsg, setBientotMsg] = useState<string | null>(null);

  // Chargé une seule fois à l'ouverture du composeur, seulement utilisé si
  // l'utilisateur tape "@" — pas de coût si la publication ne mentionne
  // personne.
  useEffect(() => {
    let annule = false;
    chargerCiblesMentionnables().then(res => { if (!annule) setCibles(res); });
    return () => { annule = true; };
  }, []);

  // Restauration silencieuse d'un brouillon local (composeur ouvert vide) —
  // jamais si l'utilisateur a déjà commencé à écrire dans cette session
  // (ex. venant d'une suggestion pré-remplie).
  useEffect(() => {
    if (texte.trim() || categorie) return;
    const d = lireDraft();
    if (d && (d.texte.trim() || d.categorie)) {
      setTexte(d.texte);
      if (d.categorie) setCategorie(d.categorie);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zone de rédaction en hauteur libre (section 3 du brief) — pas de
  // scrollbar interne, le textarea grandit avec son contenu et c'est le
  // conteneur <main> qui défile.
  const ajusterHauteurTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(() => { ajusterHauteurTextarea(); }, [texte, ajusterHauteurTextarea]);

  // Clavier iOS (section 9 du brief) — `100dvh` seul suffit sur Safari
  // récent, mais visualViewport en renfort pour les versions où un élément
  // `position:fixed` ne suit pas le rétrécissement du viewport visuel à
  // l'apparition du clavier (bug réel visible sur les captures fournies :
  // contenu flouté/coupé derrière une barre blanche flottante).
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    function onResize() { if (overlayRef.current) overlayRef.current.style.height = `${vv!.height}px`; }
    onResize();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!bientotMsg) return;
    const t = setTimeout(() => setBientotMsg(null), 2200);
    return () => clearTimeout(t);
  }, [bientotMsg]);

  // Aperçus image (section 5) — mémoïsés sur l'identité du tableau
  // `fichiers` (pas recréés à chaque frappe dans le textarea, qui
  // re-render tout le composant) et révoqués à leur remplacement/démontage,
  // sinon chaque keystroke pendant qu'une image est jointe fuit un nouveau
  // blob: URL jamais libéré.
  const previewUrls = useMemo(() => fichiers.map(f => URL.createObjectURL(f)), [fichiers]);
  useEffect(() => () => { previewUrls.forEach(u => URL.revokeObjectURL(u)); }, [previewUrls]);

  const mentionActive = useMemo(() => detecterMentionActive(texte, curseur), [texte, curseur]);
  const suggestionsMention = useMemo(() => {
    if (!mentionActive || !cibles) return [];
    const q = mentionActive.requete.toLowerCase();
    return cibles.filter(c => c.nom.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionActive, cibles]);

  function choisirMention(cible: CibleMentionnable) {
    if (!mentionActive) return;
    const avant = texte.slice(0, mentionActive.debut);
    const apres = texte.slice(mentionActive.debut + 1 + mentionActive.requete.length);
    const insere = `@[${cible.nom}](${cible.type}:${cible.id}) `;
    setTexte(avant + insere + apres);
    const position = avant.length + insere.length;
    setCurseur(position);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(position, position);
    });
  }

  function handleFermerClick() {
    // Guard sur `fichiers` en plus de `texte` — un post avec seulement des
    // photos (aucun texte) se fermait jusqu'ici sans aucune confirmation,
    // perdant silencieusement les images sélectionnées.
    if ((texte.trim() || fichiers.length > 0) && !envoi) { setConfirmFermerOpen(true); return; }
    onFermer();
  }
  function confirmerSupprimerBrouillon() { effacerDraft(); setConfirmFermerOpen(false); onFermer(); }
  function confirmerEnregistrerBrouillon() { ecrireDraft({ texte, categorie }); setConfirmFermerOpen(false); onFermer(); }

  // Efface tout brouillon local dès la tentative de publication (pas
  // seulement en cas de succès) : si l'envoi échoue, le formulaire garde de
  // toute façon son contenu en direct (texte/categorie ne sont vidés par le
  // parent qu'en cas de succès), donc l'utilisateur ne perd rien et peut
  // réessayer — inutile de garder l'ancien brouillon localStorage, qui ne
  // ferait que se réinjecter par erreur au prochain composeur vide. Appelé
  // ici plutôt que dans un effet sur `envoi` : le parent ferme le composeur
  // (`composerOuvert=false`) dans le même lot que le succès, donc ce
  // composant se démonte avant qu'un effet basé sur `envoi` ait pu tourner.
  function handlePublierClick() { effacerDraft(); onPublier(); }

  const categorieActive = categorie as PostCategorie | null;
  const couleurCategorie = categorieActive ? POST_CATEGORIE_COULEURS[categorieActive] : t2;

  return (
    <div ref={overlayRef} style={{ position: "fixed", inset: 0, height: "100dvh", zIndex: 1000, background: bg, display: "flex", flexDirection: "column" }}>
      {/* ── Header (section 1) ── */}
      <header style={{ flexShrink: 0, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <button onClick={handleFermerClick} disabled={envoi} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "38px", height: "38px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", opacity: envoi ? 0.4 : 1 }}>
            <IconX size={17} weight={2.6} />
          </button>
          <div style={{ color: t1, fontSize: "15.5px", fontWeight: 800, textAlign: "center", whiteSpace: "nowrap" }}>Créer une publication</div>
          <button
            onClick={handlePublierClick}
            disabled={!peutPublier}
            className="tap"
            style={{
              justifySelf: "end", display: "flex", alignItems: "center", gap: "6px",
              background: peutPublier ? "linear-gradient(135deg,#F5A623,#C8940A)" : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
              border: "none", borderRadius: "20px", padding: "9px 18px",
              color: peutPublier ? "#080812" : t2,
              fontSize: "13px", fontWeight: 800, cursor: peutPublier ? "pointer" : "default",
            }}
          >
            {envoi ? <YelenLoader size={14} color={peutPublier ? "#080812" : t2} /> : "Publier"}
          </button>
        </div>
      </header>

      {/* ── Corps scrollable : auteur, audience, texte, suggestions, médias, catégorie ── */}
      <main style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "18px 20px 28px", width: "100%", maxWidth: "560px", margin: "0 auto", boxSizing: "border-box" }}>

        {/* ── Bloc auteur + audience (section 2) ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <Avatar nom={userName} photo={userPhoto} taille={42} />
          <span style={{ color: t1, fontSize: "14.5px", fontWeight: 800 }}>{userName}</span>
        </div>
        <div style={{ position: "relative", marginBottom: "16px" }}>
          <button onClick={() => setAudienceInfoOpen(v => !v)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.045)", border: "none", borderRadius: "20px", padding: "5px 10px 5px 8px", color: t2, cursor: "pointer" }}>
            <IconGlobe />
            <span style={{ fontSize: "11.5px", fontWeight: 700 }}>Communauté Yelen · Public</span>
            <IconChevronRight />
          </button>
          {audienceInfoOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5, width: "250px", background: isDark ? "#2C2C2E" : "#0D0D1A", color: "#fff", fontSize: "11px", fontWeight: 600, lineHeight: 1.5, padding: "10px 12px", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
              Toutes les publications Community sont visibles par l&apos;ensemble de la Communauté Yelen, une fois validées.
            </div>
          )}
        </div>

        {/* ── Zone de rédaction (section 3) — cœur de l'écran, sans cadre ── */}
        <div style={{ position: "relative", marginBottom: "10px" }}>
          <textarea
            ref={textareaRef}
            autoFocus
            readOnly={envoi}
            value={texte}
            onChange={e => { setTexte(e.target.value); setCurseur(e.target.selectionStart); }}
            onClick={e => setCurseur(e.currentTarget.selectionStart)}
            onKeyUp={e => setCurseur(e.currentTarget.selectionStart)}
            onFocus={() => setAudienceInfoOpen(false)}
            placeholder="Partagez une idée, une expérience professionnelle…"
            rows={1}
            style={{ width: "100%", minHeight: "120px", background: "none", border: "none", outline: "none", color: t1, fontSize: "19px", lineHeight: 1.4, fontFamily: "inherit", fontWeight: 500, resize: "none", overflow: "hidden", boxSizing: "border-box", display: "block" }}
          />
          {/* Autocomplétion "@" (09/09/2026) — sous le textarea plutôt qu'au
              pixel du curseur (mesure de position hors périmètre de ce lot),
              même compromis que les dropdowns simples déjà dans le produit. */}
          {mentionActive && suggestionsMention.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 2, background: isDark ? "#1C1C1E" : "#fff", border: `1px solid ${brd}`, borderRadius: "14px", boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: "6px", marginTop: "4px" }}>
              {suggestionsMention.map(c => (
                <button key={`${c.type}:${c.id}`} onClick={() => choisirMention(c)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px", borderRadius: "10px", cursor: "pointer" }}>
                  {c.type === "citoyen" ? <Avatar nom={c.nom} photo={c.photo} taille={32} /> : <AvatarInstitution nom={c.nom} logo={c.photo} taille={32} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "12.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</div>
                    {c.sousTitre && <div style={{ color: t2, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sousTitre}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {!texte.trim() && (
          <div style={{ color: t2, fontSize: "10.5px", marginBottom: "18px" }}>@ pour mentionner quelqu&apos;un</div>
        )}

        {/* Suggestions dérivées de la vraie activité du citoyen (démarche
            terminée, avis positif récent — voir lib/postSuggestions.ts),
            jamais un "achievement" générique : masquées dès que le champ
            n'est plus vide, pour ne jamais gêner une rédaction en cours. */}
        {suggestions.length > 0 && !texte.trim() && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>
              Suggestions pour vous
            </div>
            <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
              {suggestions.map(s => (
                <button
                  key={s.id}
                  onClick={() => onChoisirSuggestion(s)}
                  className="tap"
                  style={{ flexShrink: 0, width: "220px", textAlign: "left", background: isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.07)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "14px", padding: "12px 14px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <CategorieBadge categorie={s.categorie} taille={26} />
                    <span style={{ color: t1, fontSize: "12px", fontWeight: 800 }}>{s.titre}</span>
                  </div>
                  <div style={{ color: t2, fontSize: "11.5px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.texte}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Grille média (section 5) ── */}
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={e => onChoisirFichiers(e.target.files)} />
        {fichiers.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
            {fichiers.map((_, i) => (
              <div key={i} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "18px", overflow: "hidden", border: `1px solid ${brd}` }}>
                {/* IMG-EXCEPTION: reason=blob: local (URL.createObjectURL), non fetchable par l'optimiseur next/image | reviewed=2026-09-21 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrls[i]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button onClick={() => setFichiers(prev => prev.filter((_, idx) => idx !== i))} aria-label="Retirer l'image" className="tap" style={{ position: "absolute", top: "6px", right: "6px", width: "26px", height: "26px", borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <IconX size={11} weight={3.2} />
                </button>
              </div>
            ))}
            {fichiers.length < MAX_IMAGES && (
              <button onClick={() => fileInputRef.current?.click()} className="tap" style={{ aspectRatio: "1 / 1", borderRadius: "18px", border: `1.5px dashed ${brd}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", color: t2, cursor: "pointer" }}>
                <IconPlus />
                <span style={{ fontSize: "10.5px", fontWeight: 700 }}>Ajouter</span>
              </button>
            )}
          </div>
        )}

        {/* ── Catégorie compacte (section 6) — propriété discrète, plus une
            grille de 10 boutons occupant l'écran. Verrouillée visuellement
            pendant l'envoi (§10 du brief : un état de progression propre,
            pas un plein écran bloqué, mais les contrôles ne doivent pas
            rester modifiables pendant que la requête part avec l'ancienne
            valeur). ── */}
        <div style={{ opacity: envoi ? 0.5 : 1, pointerEvents: envoi ? "none" : "auto" }}>
          {categorieActive ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: `${couleurCategorie}14`, border: `1px solid ${couleurCategorie}40`, borderRadius: "20px", padding: "6px 8px 6px 10px" }}>
              <CategorieBadge categorie={categorieActive} taille={22} />
              <button onClick={() => setCatSheetOpen(true)} className="tap" style={{ background: "none", border: "none", padding: 0, color: couleurCategorie, fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}>
                {POST_CATEGORIE_LABELS[categorieActive]}
              </button>
              <button onClick={() => setCategorie(null)} aria-label="Retirer la catégorie" className="tap" style={{ width: "20px", height: "20px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: couleurCategorie }}>
                <IconX size={9} weight={3.2} />
              </button>
            </div>
          ) : (
            <button onClick={() => setCatSheetOpen(true)} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: `1.5px dashed ${brd}`, borderRadius: "20px", padding: "8px 14px", color: t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
              <IconPlus />
              Ajouter une catégorie
              <span style={{ color: "#ef4444", fontSize: "10px", fontWeight: 800 }}>· requise</span>
            </button>
          )}
        </div>
      </main>

      {/* ── Barre d'outils fixe (sections 4 et 8) — séparée du contenu par
          une ligne très légère, jamais recouverte par le clavier puisqu'elle
          est un vrai frère flex de <main>, pas un élément positionné en
          absolu par-dessus. ── */}
      <footer style={{ flexShrink: 0, borderTop: `1px solid ${brd}`, padding: "8px 14px", paddingBottom: "max(8px, env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: "2px", background: bg, position: "relative" }}>
        {bientotMsg && (
          <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", zIndex: 20, background: "#0D0D1A", color: "#fff", fontSize: "11.5px", fontWeight: 700, padding: "8px 14px", borderRadius: "20px", boxShadow: "0 8px 20px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}>
            {bientotMsg}
          </div>
        )}
        <button onClick={() => fileInputRef.current?.click()} disabled={fichiers.length >= MAX_IMAGES || envoi} aria-label="Ajouter une photo" className="tap" style={{ width: "40px", height: "40px", borderRadius: "50%", border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, cursor: fichiers.length >= MAX_IMAGES ? "default" : "pointer", opacity: fichiers.length >= MAX_IMAGES ? 0.35 : 1 }}>
          <IconImage />
        </button>
        <button onClick={() => setBientotMsg("GIF — bientôt disponible sur Yelen Community.")} disabled={envoi} aria-label="GIF (bientôt disponible)" className="tap" style={{ width: "40px", height: "40px", borderRadius: "50%", border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", opacity: 0.45 }}>
          <IconGif />
        </button>
        <button onClick={() => textareaRef.current?.focus()} disabled={envoi} aria-label="Emoji" className="tap" style={{ width: "40px", height: "40px", borderRadius: "50%", border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, cursor: "pointer", opacity: envoi ? 0.4 : 1 }}>
          <IconEmoji />
        </button>
        <div style={{ width: "1px", height: "22px", background: brd, margin: "0 6px" }} />
        <button onClick={() => setOptionsSheetOpen(true)} disabled={envoi} aria-label="Plus d'options" className="tap" style={{ width: "40px", height: "40px", borderRadius: "50%", border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", opacity: envoi ? 0.4 : 1 }}>
          <IconMore />
        </button>
      </footer>

      {/* ── Bottom sheet catégorie ── */}
      {catSheetOpen && (
        <BottomSheet onClose={() => setCatSheetOpen(false)} isDark={isDark} brd={brd}>
          <div style={{ padding: "6px 18px 18px" }}>
            <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "12px" }}>Catégorie de la publication</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {POST_CATEGORIES.map(cat => {
                const actif = categorie === cat;
                const couleur = POST_CATEGORIE_COULEURS[cat];
                return (
                  <button key={cat} onClick={() => { setCategorie(cat); setCatSheetOpen(false); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left", background: actif ? `${couleur}12` : "none", border: "none", borderRadius: "12px", padding: "9px 10px", cursor: "pointer" }}>
                    <CategorieBadge categorie={cat} taille={34} />
                    <span style={{ flex: 1, color: actif ? couleur : t1, fontSize: "13.5px", fontWeight: actif ? 800 : 600 }}>{POST_CATEGORIE_LABELS[cat]}</span>
                    {actif && <IconCheck color={couleur} />}
                  </button>
                );
              })}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ── Bottom sheet "+ Options" (section 7) — révèle progressivement
          les formats secondaires, honnêtement marqués "Bientôt disponible"
          puisqu'aucun n'est encore supporté par l'API de publication
          (app/api/citoyen/posts/route.ts ne connaît que texte+images+catégorie) —
          jamais un bouton qui prétend fonctionner sans rien faire. ── */}
      {optionsSheetOpen && (
        <BottomSheet onClose={() => setOptionsSheetOpen(false)} isDark={isDark} brd={brd}>
          <div style={{ padding: "6px 18px 18px" }}>
            <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "2px" }}>Plus d&apos;options</div>
            <div style={{ color: t2, fontSize: "11.5px", marginBottom: "14px" }}>Bientôt disponible sur Yelen Community.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {OPTIONS_A_VENIR.map(opt => (
                <div key={opt.label} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "9px 10px", opacity: 0.5 }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", color: t2, flexShrink: 0 }}>{opt.icon()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>{opt.label}</div>
                    <div style={{ color: t2, fontSize: "11px" }}>{opt.desc}</div>
                  </div>
                  <span style={{ color: t2, fontSize: "9.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.3px", border: `1px solid ${brd}`, borderRadius: "20px", padding: "3px 8px", flexShrink: 0, whiteSpace: "nowrap" }}>Bientôt</span>
                </div>
              ))}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ── Confirmation de fermeture / brouillon (section 11) ── */}
      {confirmFermerOpen && (
        <div onClick={() => setConfirmFermerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "0 24px" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "340px", background: isDark ? "#1C1C1E" : "#fff", borderRadius: "20px", padding: "22px 20px", boxShadow: "0 16px 50px rgba(0,0,0,0.3)" }}>
            <div style={{ color: t1, fontSize: "15.5px", fontWeight: 800, marginBottom: "6px", textAlign: "center" }}>Enregistrer votre brouillon ?</div>
            <div style={{ color: t2, fontSize: "12px", textAlign: "center", marginBottom: "20px", lineHeight: 1.5 }}>
              Vous pourrez reprendre votre publication plus tard.
              {/* Honnêteté sur la limite réelle du brouillon (localStorage,
                  texte + catégorie uniquement) — jamais laisser croire que
                  les photos seraient conservées si l'utilisateur choisit
                  "Enregistrer" alors qu'elles ne le seront pas. */}
              {fichiers.length > 0 && " Les photos ajoutées ne seront pas conservées."}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={confirmerSupprimerBrouillon} className="tap" style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `1px solid ${brd}`, background: "none", color: t1, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Supprimer</button>
              <button onClick={confirmerEnregistrerBrouillon} className="tap" style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontSize: "13px", fontWeight: 800, cursor: "pointer" }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
