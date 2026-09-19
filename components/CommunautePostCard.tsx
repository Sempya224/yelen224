"use client";

// Pièces de rendu du fil "Yelen Community" (onglet Communauté de
// app/page.tsx) — extraites dans leur propre fichier pour ne pas alourdir
// davantage page.tsx (même logique que OffreFicheOverlay.tsx), mais
// l'état/les effets/les handlers restent dans page.tsx (même convention
// que l'onglet Offres, retour Bryan 27/07/2026 : "un onglet ici, pas un
// écran externe").
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { YelenLoader } from "@/components/YelenLoader";
import { POST_CATEGORIE_LABELS, POST_CATEGORIE_COULEURS, type PostCategorie } from "@/lib/communauteCategories";
import { InstitutionBadgeVerifie } from "@/lib/institutionBadge";

// Liens cliquables + mentions @profil dans le texte d'une publication
// (retour Bryan 09/09/2026, référence LinkedIn) — affichage uniquement,
// aucune donnée modifiée. Une mention est encodée directement dans le texte
// stocké au moment de la publication : `@[Nom](citoyen:id)` ou
// `@[Nom](institution:id)` — jamais visible tel quel une fois publiée,
// jamais de table dédiée (décision Bryan 09/09/2026). Ponctuation finale
// (. , ; : ! ?)) exclue d'un lien URL pour ne pas casser une adresse en fin
// de phrase.
const MENTION_OU_URL_REGEX = /(@\[[^\]]+\]\((?:citoyen|institution):[0-9a-fA-F-]+\)|(?:https?:\/\/|www\.)[^\s]+)/g;
const MENTION_REGEX = /^@\[([^\]]+)\]\((citoyen|institution):([0-9a-fA-F-]+)\)$/;

function rendreContenuAvecLiens(texte: string, onOuvrirMention?: (type: "citoyen" | "institution", id: string, nom: string) => void): React.ReactNode[] {
  const segments = texte.split(MENTION_OU_URL_REGEX);
  const noeuds: React.ReactNode[] = [];
  segments.forEach((seg, i) => {
    if (i % 2 === 1) {
      const mention = seg.match(MENTION_REGEX);
      if (mention) {
        const [, nom, type, id] = mention;
        noeuds.push(
          <span key={i} onClick={e => { e.stopPropagation(); onOuvrirMention?.(type as "citoyen" | "institution", id, nom); }} style={{ color: "#2563EB", fontWeight: 700, cursor: "pointer" }}>@{nom}</span>
        );
        return;
      }
      // "www.xxx" tapé sans protocole (cas fréquent) — même affichage que
      // saisi, mais href complété en https:// pour rester cliquable
      // (retour Bryan 10/09/2026 : les liens sans "http(s)://" ne
      // s'ouvraient jamais).
      const match = seg.match(/^((?:https?:\/\/|www\.)[^\s]+?)([.,;:!?)]*)$/);
      const url = match ? match[1] : seg;
      const suffixe = match ? match[2] : "";
      const href = /^https?:\/\//.test(url) ? url : `https://${url}`;
      noeuds.push(
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: "#2563EB", textDecoration: "underline", wordBreak: "break-all" }}>{url}</a>
      );
      if (suffixe) noeuds.push(suffixe);
    } else if (seg) {
      noeuds.push(seg);
    }
  });
  return noeuds;
}

export type Post = {
  id: string;
  auteur_id: string | null;
  // Institutions dans Yelen Community (22/08/2026) — un post a soit
  // auteur_id (citoyen), soit institution_auteur_id, jamais les deux (même
  // contrainte exclusive posée en base, migration
  // 20260822000010_posts_auteur_institution.sql).
  auteur_type: "citoyen" | "institution";
  institution_auteur_id: string | null;
  categorie: string;
  author_nom: string;
  author_photo_url: string | null;
  author_verifie: boolean;
  author_membre_depuis: string;
  contenu: string | null;
  images: string[] | null;
  nb_partages: number;
  created_at: string;
};

export type Commentaire = {
  id: string;
  post_id: string;
  citoyen_id: string;
  citoyen_nom: string;
  citoyen_photo_url: string | null;
  contenu: string;
  created_at: string;
  parent_id: string | null;
};

// Une ligne du sheet "Interactions" (Tous/J'aime/Commentaires, 22/08/2026)
// — résolue côté serveur par GET /api/citoyen/posts/[id]/interactions,
// jamais un join direct côté client (aucune policy de lecture publique sur
// `users`). `types` porte les interactions présentes pour ce citoyen (un
// même citoyen peut apparaître avec les deux dans l'onglet "Tous").
export type PostInteraction = {
  citoyen_id: string;
  nom: string;
  photo_url: string | null;
  verifie: boolean;
  types: ("like" | "commentaire")[];
  created_at: string;
};

export type PostInteractionsData = {
  tous: PostInteraction[];
  likes: PostInteraction[];
  commentateurs: PostInteraction[];
};

export function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// "Il y a X" (retour Bryan 27/07/2026 : un simple "15 min" nu ne disait
// pas "posté il y a") — "À l'instant" reste tel quel, déjà une phrase
// complète.
export function tempsRelatif(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `Il y a ${j} j`;
  return `Le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

// Illustration d'état vide — même esprit que NotifEmptyIllustration
// (components/NotifPanel.tsx) : trait, sans emoji, teinte de marque.
export function CommunauteEmptyIllustration() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="34" stroke="#F5A62330" strokeWidth="1.5" />
      <circle cx="28" cy="32" r="8" stroke="#F5A623" strokeWidth="2" />
      <circle cx="44" cy="32" r="8" stroke="#F5A623" strokeWidth="2" />
      <path d="M18 48c1-5 5-8 10-8s9 3 10 8" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M34 48c1-5 5-8 10-8s9 3 10 8" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Avatar({ nom, photo, taille }: { nom: string; photo: string | null; taille: number }) {
  return photo ? (
    <div style={{ position: "relative", width: taille, height: taille, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
      <Image src={photo} alt={nom} fill sizes={`${taille}px`} style={{ objectFit: "cover" }} />
    </div>
  ) : (
    <div style={{ width: taille, height: taille, borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", fontWeight: 900, fontSize: taille * 0.4, flexShrink: 0 }}>
      {(nom || "Y").slice(0, 2).toUpperCase()}
    </div>
  );
}

// Logo institution — carré arrondi (jamais circulaire) pour distinguer un
// post institution d'un post citoyen au premier coup d'œil dans le fil
// (22/08/2026, retour Bryan : "fais en sorte que le rendu des posts
// entreprise soit différent des posts communauté utilisateur").
export function AvatarInstitution({ nom, logo, taille }: { nom: string; logo: string | null; taille: number }) {
  return logo ? (
    <div style={{ position: "relative", width: taille, height: taille, borderRadius: taille * 0.28, overflow: "hidden", flexShrink: 0, background: "#f2f2f2" }}>
      <Image src={logo} alt={nom} fill sizes={`${taille}px`} style={{ objectFit: "cover" }} />
    </div>
  ) : (
    <div style={{ width: taille, height: taille, borderRadius: taille * 0.28, background: "linear-gradient(135deg,#0095F6,#0468B8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: taille * 0.4, flexShrink: 0 }}>
      {(nom || "Y").slice(0, 2).toUpperCase()}
    </div>
  );
}

// Texte "Vérifié par Yelen" — remplace l'ancienne pastille bleue pour les
// citoyens (23/08/2026, retour Bryan : la pastille bleue passe désormais
// aux profils institution sans badge premium, voir
// lib/institutionBadge.tsx::PastilleVerifie ; les citoyens reprennent
// l'ancien texte simple d'institution non premium).
export function BadgeVerifie() {
  return <span style={{ color: "#8E8E93", fontSize: "11px", fontWeight: 700 }}>Vérifié par Yelen</span>;
}

// Glyphe par catégorie — un tracé distinct par catégorie, jamais une
// icône générique répétée (même logique que les genres d'offre).
const CATEGORIE_GLYPHES: Record<PostCategorie, string> = {
  entrepreneuriat: "M12 2 4 14h6l-1 8 9-13h-6z",
  carriere_emploi: "M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16",
  finance_argent: "M12 3v18M8 7.5c0-1.4 1.6-2.5 4-2.5s4 1 4 2.5-1.6 2-4 2.5-4 1.5-4 3S9.6 17 12 17s4-1 4-2.5",
  marketing_vente: "M3 11l18-8-8 18-2-8-8-2z",
  technologie_innovation: "M12 2a6 6 0 0 0-4 10.5V16h8v-3.5A6 6 0 0 0 12 2zM9 20h6M10 16v2M14 16v2",
  developpement_personnel: "M12 20V10M12 10 6 4M12 10l6-6M4 20h16",
  reseautage: "M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 8v3l6 5M18 8v3l-6 5",
  actualites_business: "M4 4h13a2 2 0 0 1 2 2v13a1 1 0 0 1-1.7.7L15 17H6a2 2 0 0 1-2-2zM7 8h9M7 11h9M7 14h5",
  conseils_pratiques: "M12 3c-3.9 0-7 3.1-7 7 0 2.7 1.5 4.9 3.5 6.2V18h7v-1.8c2-1.3 3.5-3.5 3.5-6.2 0-3.9-3.1-7-7-7zM9.5 21h5",
  reussite_temoignage: "M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z",
};

// Fond de couleur retiré (retour Bryan 09/09/2026) — l'icône garde sa
// couleur propre par catégorie, plus de pastille de fond teintée derrière.
export function CategorieBadge({ categorie, taille = 32 }: { categorie: string; taille?: number }) {
  const c = categorie as PostCategorie;
  const couleur = POST_CATEGORIE_COULEURS[c] || "#8E8E93";
  const glyphe = CATEGORIE_GLYPHES[c];
  return (
    <div style={{ width: taille, height: taille, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={taille * 0.52} height={taille * 0.52} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={glyphe} />
      </svg>
    </div>
  );
}

export function CategorieChip({ categorie, actif, onClick, texteCouleur }: { categorie: string; actif?: boolean; onClick?: () => void; texteCouleur: string }) {
  const c = categorie as PostCategorie;
  const couleur = POST_CATEGORIE_COULEURS[c] || "#8E8E93";
  const label = POST_CATEGORIE_LABELS[c] || categorie;
  return (
    <button onClick={onClick} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: onClick ? "pointer" : "default", padding: 0, flexShrink: 0, width: "64px" }}>
      <div style={{ boxShadow: actif ? `0 0 0 2px ${couleur}` : "none", borderRadius: "50%" }}>
        <CategorieBadge categorie={categorie} taille={44} />
      </div>
      <span style={{ color: actif ? couleur : texteCouleur, fontSize: "10px", fontWeight: actif ? 800 : 600, textAlign: "center", lineHeight: 1.2 }}>{label}</span>
    </button>
  );
}

// "S'abonner"/"✓ Abonné" — Chaîne Yelen (23/08/2026, retour Bryan,
// référence LinkedIn : avant abonnement = pilule dorée qui attire l'œil ;
// une fois abonné = coche dans un cercle discret (contour seul, jamais
// colorié) + texte, plus de chrome de bouton plein — même esprit que
// "✓ Following" sur un post LinkedIn. `stopPropagation` interne : jamais
// déclencher l'ouverture du post/de la fiche en cliquant dessus.
export function SAbonnerButton({ abonne, onToggle, t2 }: { abonne: boolean; onToggle: () => void; t2: string }) {
  if (abonne) {
    return (
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        className="tap"
        style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "4px 2px", color: t2, fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}
      >
        <span style={{ width: "18px", height: "18px", borderRadius: "50%", border: `1.5px solid ${t2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        Abonné
      </button>
    );
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className="tap"
      style={{ flexShrink: 0, background: "none", border: "1.5px solid #F5A623", borderRadius: "20px", padding: "6px 13px", color: "#F5A623", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}
    >
      S&apos;abonner
    </button>
  );
}

// Sheet de confirmation abonnement/désabonnement — Chaîne Yelen
// (23/08/2026, retour Bryan, référence LinkedIn : bottom sheet affichée
// après l'action de suivre/ne plus suivre). Contrairement à LinkedIn, pas
// de second bloc "Activer les notifications" — aucun système de
// notification par publication d'institution n'existe aujourd'hui, jamais
// un bouton qui ne ferait rien en réalité (retour Bryan). Auto-masquée
// après 2.2s, un tap sur le fond la ferme aussi tôt — même mécanique de
// bottom sheet que CommentsSheet ci-dessous, en plus léger (pas de
// contenu défilant).
export function AbonnementConfirmationSheet({
  nom, type, card, t1, t2, brd, onClose,
}: { nom: string; type: "abonne" | "desabonne"; card: string; t1: string; t2: string; brd: string; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 2200);
    return () => clearTimeout(id);
  }, [onClose]);

  const abonne = type === "abonne";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <style>{`@keyframes abonnementSheetUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "440px", background: card, borderRadius: "24px 24px 0 0", padding: "10px 24px calc(28px + env(safe-area-inset-bottom))", textAlign: "center", animation: "abonnementSheetUp 0.2s ease" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "4px", background: brd, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
          {abonne ? (
            <Image src="/illustrations/communaute-abonnement-confirme.png" alt="" width={1536} height={1024} style={{ width: "140px", maxWidth: "100%", height: "auto", display: "block" }}/>
          ) : (
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: `${t2}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="8" x2="22" y2="13" /><line x1="22" y1="8" x2="17" y2="13" /></svg>
            </div>
          )}
        </div>
        <div style={{ color: t1, fontSize: "15.5px", fontWeight: 800, lineHeight: 1.4 }}>
          {abonne ? <>Vous êtes abonné à {nom}</> : <>Vous ne suivez plus {nom}</>}
        </div>
        {abonne && (
          <div style={{ color: t2, fontSize: "12.5px", marginTop: "6px" }}>Ses publications apparaîtront dans votre fil Communauté.</div>
        )}
      </div>
    </div>
  );
}

export function PostCard({
  post, card, t1, t2, t3, brd,
  liked, likeCount, commentCount, onToggleLike, onPartager,
  onOpenAuteur, onOpenPost, onSignalerPost, onSignalerAuteur, onOuvrirImage, onOuvrirInteractions,
  estAbonne, onToggleAbonnement, onOuvrirMention,
}: {
  post: Post; card: string; t1: string; t2: string; t3: string; brd: string;
  liked: boolean; likeCount: number; commentCount: number;
  onToggleLike: () => void; onPartager: () => void;
  onOpenAuteur: () => void; onOpenPost: () => void;
  onSignalerPost: () => void; onSignalerAuteur: () => void;
  onOuvrirImage: (images: string[], index: number) => void;
  onOuvrirInteractions: () => void;
  estAbonne: boolean; onToggleAbonnement: () => void;
  onOuvrirMention?: (type: "citoyen" | "institution", id: string, nom: string) => void;
}) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [descriptionOuverte, setDescriptionOuverte] = useState(false);
  const couleurCat = POST_CATEGORIE_COULEURS[post.categorie as PostCategorie];
  const labelCat = POST_CATEGORIE_LABELS[post.categorie as PostCategorie];

  // Aperçu tronqué à ~3 lignes en JS plutôt qu'en CSS pur (retour Bryan
  // 22/08/2026, même choix que la légende de la visionneuse : fiabilité
  // avant tout). "Voir plus" ouvre le même LegendePostSheet que la
  // visionneuse — pas un second sheet.
  const CONTENU_MAX = 220;
  const contenu = post.contenu ?? "";
  const contenuTronque = contenu.length > CONTENU_MAX || contenu.split("\n").length > 3;
  const contenuApercu = contenuTronque ? contenu.split("\n").slice(0, 3).join("\n").slice(0, CONTENU_MAX).trimEnd() : contenu;

  // Illustrations d'interaction — remplacent la date à droite de la barre
  // d'actions (retour Bryan 22/08/2026, référence LinkedIn : petits badges
  // ronds superposés résumant les types d'engagement présents, jamais un
  // chiffre redondant — chaque compteur existe déjà à gauche de son bouton).
  const badgesInteraction: { couleur: string; icone: React.ReactElement }[] = [];
  if (likeCount > 0) badgesInteraction.push({
    couleur: "#F5A623",
    icone: <svg width="10" height="10" viewBox="0 0 24 24" fill="#080812" stroke="#080812" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>,
  });
  if (commentCount > 0) badgesInteraction.push({
    couleur: "#2563EB",
    icone: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  });
  if (post.nb_partages > 0) badgesInteraction.push({
    couleur: "#10B981",
    icone: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>,
  });

  const estInstitution = post.auteur_type === "institution";

  return (
    <div onClick={onOpenPost} className="tap" style={{ background: card, border: `1px solid ${brd}`, borderRadius: estInstitution ? "0px" : "16px", padding: "16px", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "10px" }}>
        <button onClick={e => { e.stopPropagation(); onOpenAuteur(); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          {estInstitution ? (
            <AvatarInstitution nom={post.author_nom} logo={post.author_photo_url} taille={40} />
          ) : (
            <Avatar nom={post.author_nom} photo={post.author_photo_url} taille={40} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: t1, fontSize: "13.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.author_nom}</span>
              {!estInstitution && post.author_verifie && <BadgeVerifie />}
            </div>
            {estInstitution ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <InstitutionBadgeVerifie verifie={post.author_verifie} couleurTexte={t2} taille={11.5} />
                <span style={{ color: t3, fontSize: "11px" }}>· {tempsRelatif(post.created_at)}</span>
              </div>
            ) : (
              <div style={{ color: t2, fontSize: "11px" }}>{tempsRelatif(post.created_at)}</div>
            )}
          </div>
        </button>
        {estInstitution && <SAbonnerButton abonne={estAbonne} onToggle={onToggleAbonnement} t2={t2} />}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); setMenuOuvert(o => !o); }} aria-label="Options" className="tap" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t3, cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
          </button>
          {menuOuvert && (
            <>
              <div onClick={e => { e.stopPropagation(); setMenuOuvert(false); }} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
              <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "100%", right: 0, zIndex: 5, background: card, border: `1px solid ${brd}`, borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "6px", minWidth: "210px" }}>
                <button onClick={() => { setMenuOuvert(false); onSignalerPost(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", borderRadius: "8px", color: t1, fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }}>
                  Signaler cette publication
                </button>
                <button onClick={() => { setMenuOuvert(false); onSignalerAuteur(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", borderRadius: "8px", color: "#ef4444", fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }}>
                  Signaler {post.author_nom}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {couleurCat && (
        <span style={{ display: "inline-block", color: couleurCat, fontSize: "10px", fontWeight: 800, padding: "3px 9px 3px 0", borderRadius: "20px", marginBottom: "10px" }}>{labelCat}</span>
      )}

      {contenu && (
        <div style={{ marginBottom: post.images?.length ? "10px" : "12px" }}>
          <div style={{ color: t1, fontSize: "13.5px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {rendreContenuAvecLiens(contenuApercu, onOuvrirMention)}{contenuTronque ? "…" : ""}
          </div>
          {contenuTronque && (
            <button onClick={e => { e.stopPropagation(); setDescriptionOuverte(true); }} className="tap" style={{ display: "block", background: "none", border: "none", padding: "4px 0 0", color: "#F5A623", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}>
              Voir tout
            </button>
          )}
        </div>
      )}

      {post.images && post.images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: post.images.length === 1 ? "1fr" : "1fr 1fr", gap: "2px", margin: "0 -16px 12px", overflow: "hidden" }}>
          {post.images.map((url, i) => (
            <button key={i} onClick={e => { e.stopPropagation(); onOuvrirImage(post.images!, i); }} className="tap" style={{ padding: 0, border: "none", background: "none", cursor: "pointer", display: "block" }}>
              <Image src={url} alt="" width={800} height={600} style={{ width: "100%", height: post.images!.length === 1 ? "auto" : "140px", maxHeight: "320px", objectFit: "cover" }} />
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "18px", paddingTop: "10px", borderTop: `1px solid ${brd}` }}>
        <button onClick={e => { e.stopPropagation(); onToggleLike(); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: liked ? "#F5A623" : t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill={liked ? "#F5A623" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
          {likeCount > 0 ? likeCount : ""}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: t2, fontSize: "12.5px", fontWeight: 700 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          {commentCount > 0 ? commentCount : ""}
        </div>
        <button onClick={e => { e.stopPropagation(); onPartager(); }} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>
          {post.nb_partages > 0 ? post.nb_partages : ""}
        </button>
        {badgesInteraction.length > 0 && (
          (likeCount > 0 || commentCount > 0) ? (
            <button onClick={e => { e.stopPropagation(); onOuvrirInteractions(); }} aria-label="Voir les interactions de cette publication" className="tap" style={{ marginLeft: "auto", display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              {badgesInteraction.map((b, idx) => (
                <div key={idx} style={{ width: "19px", height: "19px", borderRadius: "50%", background: b.couleur, border: `1.5px solid ${card}`, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: idx === 0 ? 0 : "-6px", zIndex: badgesInteraction.length - idx }}>
                  {b.icone}
                </div>
              ))}
            </button>
          ) : (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
              {badgesInteraction.map((b, idx) => (
                <div key={idx} style={{ width: "19px", height: "19px", borderRadius: "50%", background: b.couleur, border: `1.5px solid ${card}`, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: idx === 0 ? 0 : "-6px", zIndex: badgesInteraction.length - idx }}>
                  {b.icone}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {descriptionOuverte && (
        <LegendePostSheet contenu={post.contenu} createdAt={post.created_at} onClose={() => setDescriptionOuverte(false)} onOuvrirMention={onOuvrirMention} />
      )}
    </div>
  );
}

// Une ligne de commentaire du CommentsSheet ci-dessous — sortie au niveau
// module (piège focus/remount documenté dans CLAUDE.md) même si elle ne
// contient aucun champ de saisie, pour rester cohérent avec le reste du
// fichier et éviter un remount de l'avatar/bouton à chaque frappe dans le
// champ du sheet.
function CommentRow({
  c, indent, isDark, t1, t2, t3, onRepondre, estAuteurDuPost, estMoi,
}: {
  c: Commentaire; indent: boolean;
  isDark: boolean; t1: string; t2: string; t3: string;
  onRepondre: () => void;
  estAuteurDuPost: boolean; estMoi: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "8px", marginLeft: indent ? "34px" : 0 }}>
      <Avatar nom={c.citoyen_nom} photo={c.citoyen_photo_url} taille={indent ? 22 : 28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "12px", padding: "8px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
            <span style={{ color: t1, fontSize: "12px", fontWeight: 800 }}>{c.citoyen_nom}</span>
            {estAuteurDuPost && (
              // Distingue le commentaire de l'auteur du post des autres
              // (retour Bryan 23/08/2026) — "Vous" quand c'est le
              // spectateur lui-même qui est cet auteur, "Auteur" sinon,
              // pour ne jamais confondre avec un commentateur ordinaire.
              <span style={{ color: "#F5A623", fontSize: "9.5px", fontWeight: 800, background: "rgba(245,166,35,0.14)", padding: "1px 6px", borderRadius: "8px", flexShrink: 0 }}>
                {estMoi ? "Vous" : "Auteur"}
              </span>
            )}
          </div>
          <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.contenu}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", paddingLeft: "4px" }}>
          <span style={{ color: t3, fontSize: "10.5px" }}>{tempsRelatif(c.created_at)}</span>
          <button onClick={onRepondre} className="tap" style={{ background: "none", border: "none", padding: 0, color: t3, fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }}>
            Répondre
          </button>
        </div>
      </div>
    </div>
  );
}

// État partagé "fil de commentaires" (réponse en cours + fils dépliés) —
// extrait (23/08/2026) pour être réutilisé identiquement par CommentsSheet
// (bottom sheet) et PostDetailOverlay (écran plein "publication", retour
// Bryan : cliquer sur un post l'ouvre en détail avec les commentaires
// visibles directement en dessous) sans dupliquer la logique de thread.
function useCommentsThread(commentDraft: string, onSubmitComment: (parentId: string | null) => void) {
  const [reponseA, setReponseA] = useState<{ id: string; nom: string } | null>(null);
  const [filsOuverts, setFilsOuverts] = useState<Set<string>>(new Set());

  function envoyer() {
    if (!commentDraft.trim()) return;
    const cibleThread = reponseA?.id ?? null;
    onSubmitComment(cibleThread);
    if (cibleThread) setFilsOuverts(prev => new Set(prev).add(cibleThread));
    setReponseA(null);
  }

  function toggleFil(id: string) {
    setFilsOuverts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return { reponseA, setReponseA, filsOuverts, toggleFil, envoyer };
}

// Liste des commentaires (racines + fils repliables) — partagée par
// CommentsSheet et PostDetailOverlay, chacun contrôlant son propre
// conteneur de défilement autour.
function CommentsListe({
  commentairesListe, filsOuverts, toggleFil, onRepondre,
  isDark, t1, t2, t3, postAuteurId, viewerId,
}: {
  commentairesListe: Commentaire[] | undefined;
  filsOuverts: Set<string>; toggleFil: (id: string) => void;
  onRepondre: (id: string, nom: string) => void;
  isDark: boolean; t1: string; t2: string; t3: string;
  // Post écrit par un citoyen (jamais une institution, qui ne peut pas
  // commenter) — null sinon, le badge "Auteur"/"Vous" ne s'affiche alors
  // jamais (retour Bryan 23/08/2026).
  postAuteurId: string | null; viewerId: string | null;
}) {
  const racines = (commentairesListe ?? []).filter(c => !c.parent_id);
  const reponsesParParent = new Map<string, Commentaire[]>();
  for (const c of commentairesListe ?? []) {
    if (c.parent_id) {
      const arr = reponsesParParent.get(c.parent_id) ?? [];
      arr.push(c);
      reponsesParParent.set(c.parent_id, arr);
    }
  }

  if (commentairesListe === undefined) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={18} color={t2} /></div>;
  }
  if (racines.length === 0) {
    return <div style={{ color: t3, fontSize: "12.5px", textAlign: "center", padding: "24px" }}>Aucun commentaire pour l&apos;instant. Soyez le premier à réagir.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {racines.map(c => {
        const reponses = reponsesParParent.get(c.id) ?? [];
        const ouvert = filsOuverts.has(c.id);
        return (
          <div key={c.id}>
            <CommentRow c={c} indent={false} isDark={isDark} t1={t1} t2={t2} t3={t3} onRepondre={() => onRepondre(c.id, c.citoyen_nom)} estAuteurDuPost={!!postAuteurId && c.citoyen_id === postAuteurId} estMoi={!!viewerId && c.citoyen_id === viewerId} />
            {reponses.length > 0 && (
              <button onClick={() => toggleFil(c.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "34px", marginTop: "8px", background: "none", border: "none", padding: 0, color: t3, fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}>
                <span style={{ width: "20px", height: "1px", background: t3, display: "inline-block" }} />
                {ouvert ? "Masquer" : "Voir"} {reponses.length} réponse{reponses.length > 1 ? "s" : ""}
              </button>
            )}
            {ouvert && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" }}>
                {reponses.map(r => (
                  <CommentRow key={r.id} c={r} indent isDark={isDark} t1={t1} t2={t2} t3={t3} onRepondre={() => onRepondre(c.id, r.citoyen_nom)} estAuteurDuPost={!!postAuteurId && r.citoyen_id === postAuteurId} estMoi={!!viewerId && r.citoyen_id === viewerId} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Barre de saisie (bandeau "Réponse à…" + input + envoi) — partagée par
// CommentsSheet et PostDetailOverlay.
function CommentInputBar({
  isDark, t1, t2, t3, brd,
  commentDraft, onChangeCommentDraft, envoyer,
  reponseA, setReponseA, userNom, userPhoto,
}: {
  isDark: boolean; t1: string; t2: string; t3: string; brd: string;
  commentDraft: string; onChangeCommentDraft: (v: string) => void; envoyer: () => void;
  reponseA: { id: string; nom: string } | null; setReponseA: (v: { id: string; nom: string } | null) => void;
  userNom: string; userPhoto: string | null;
}) {
  return (
    <div style={{ flexShrink: 0, borderTop: `1px solid ${brd}`, padding: "10px 16px calc(10px + env(safe-area-inset-bottom))" }}>
      {reponseA && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
          <span style={{ color: t2, fontSize: "11.5px" }}>Réponse à <strong style={{ color: t1 }}>{reponseA.nom}</strong></span>
          <button onClick={() => setReponseA(null)} aria-label="Annuler la réponse" className="tap" style={{ background: "none", border: "none", padding: "2px", color: t3, cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Avatar nom={userNom} photo={userPhoto} taille={30} />
        <input
          value={commentDraft}
          onChange={e => onChangeCommentDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && commentDraft.trim()) envoyer(); }}
          placeholder={reponseA ? `Répondre à ${reponseA.nom}…` : "Écrire un commentaire…"}
          style={{ flex: 1, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: "none", borderRadius: "20px", padding: "9px 14px", color: t1, fontSize: "12.5px", outline: "none" }}
        />
        <button onClick={envoyer} disabled={!commentDraft.trim()} className="tap" style={{ background: "none", border: "none", color: commentDraft.trim() ? "#F5A623" : t3, cursor: commentDraft.trim() ? "pointer" : "default", padding: "4px 6px", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </div>
    </div>
  );
}

// Sheet des commentaires — remplace l'ancien affichage inline vertical
// sous le post (retour Bryan 22/08/2026, référence Facebook : icône
// commentaire ouvre un bottom sheet). Un seul niveau de fils imbriqués :
// répondre à une réponse rattache quand même au commentaire racine
// (parent_id), avec juste "Réponse à {nom}" au-dessus du champ — même
// convention Instagram/Facebook, jamais de profondeur illimitée. Toujours
// utilisé tel quel par ImageViewerOverlay (visionneuse plein écran) — le
// fil principal (PostCard) ouvre désormais PostDetailOverlay à la place,
// voir plus bas.
export function CommentsSheet({
  isDark, card, t1, t2, t3, brd,
  commentairesListe, commentDraft, onChangeCommentDraft, onSubmitComment,
  userNom, userPhoto, onClose, postAuteurId, viewerId,
}: {
  isDark: boolean; card: string; t1: string; t2: string; t3: string; brd: string;
  commentairesListe: Commentaire[] | undefined;
  commentDraft: string;
  onChangeCommentDraft: (v: string) => void;
  onSubmitComment: (parentId: string | null) => void;
  userNom: string; userPhoto: string | null;
  onClose: () => void;
  postAuteurId: string | null; viewerId: string | null;
}) {
  const { reponseA, setReponseA, filsOuverts, toggleFil, envoyer } = useCommentsThread(commentDraft, onSubmitComment);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <style>{`@keyframes commentsSheetUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "560px", maxHeight: "82vh", background: card, borderRadius: "24px 24px 0 0", display: "flex", flexDirection: "column", animation: "commentsSheetUp 0.2s ease" }}
      >
        <div style={{ width: "40px", height: "4px", borderRadius: "4px", background: brd, margin: "12px auto 10px", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "0 16px 12px", borderBottom: `1px solid ${brd}`, flexShrink: 0 }}>
          <span style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>
            {commentairesListe && commentairesListe.length > 0 ? `${commentairesListe.length} commentaire${commentairesListe.length > 1 ? "s" : ""}` : "Commentaires"}
          </span>
          <button onClick={onClose} aria-label="Fermer" className="tap" style={{ position: "absolute", right: "12px", top: "-2px", width: "30px", height: "30px", borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
          <CommentsListe commentairesListe={commentairesListe} filsOuverts={filsOuverts} toggleFil={toggleFil} onRepondre={(id, nom) => setReponseA({ id, nom })} isDark={isDark} t1={t1} t2={t2} t3={t3} postAuteurId={postAuteurId} viewerId={viewerId} />
        </div>

        <CommentInputBar isDark={isDark} t1={t1} t2={t2} t3={t3} brd={brd} commentDraft={commentDraft} onChangeCommentDraft={onChangeCommentDraft} envoyer={envoyer} reponseA={reponseA} setReponseA={setReponseA} userNom={userNom} userPhoto={userPhoto} />
      </div>
    </div>
  );
}

// Écran "publication" plein écran (23/08/2026, retour Bryan : cliquer sur
// un post — institution ou citoyen — l'ouvre en détail, contenu non
// tronqué, commentaires visibles directement en dessous, comme un
// permalien LinkedIn/Facebook, plutôt que la petite bulle CommentsSheet).
// Le clic sur une image ouvre quand même ImageViewerOverlay par-dessus
// (zIndex supérieur) — jamais un troisième mécanisme de zoom séparé.
export function PostDetailOverlay({
  post, isDark, bg, card, t1, t2, t3, brd,
  liked, likeCount, commentCount, onToggleLike, onPartager,
  onOpenAuteur, onSignalerPost, onSignalerAuteur, onOuvrirImage, onClose,
  commentairesListe, commentDraft, onChangeCommentDraft, onSubmitComment,
  userNom, userPhoto, viewerId,
  estAbonne, onToggleAbonnement, onOuvrirMention,
}: {
  post: Post; isDark: boolean; bg: string; card: string; t1: string; t2: string; t3: string; brd: string;
  liked: boolean; likeCount: number; commentCount: number;
  onToggleLike: () => void; onPartager: () => void;
  onOpenAuteur: () => void; onSignalerPost: () => void; onSignalerAuteur: () => void;
  onOuvrirImage: (images: string[], index: number) => void;
  onClose: () => void;
  commentairesListe: Commentaire[] | undefined;
  commentDraft: string;
  onChangeCommentDraft: (v: string) => void;
  onSubmitComment: (parentId: string | null) => void;
  userNom: string; userPhoto: string | null; viewerId: string | null;
  estAbonne: boolean; onToggleAbonnement: () => void;
  onOuvrirMention?: (type: "citoyen" | "institution", id: string, nom: string) => void;
}) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const { reponseA, setReponseA, filsOuverts, toggleFil, envoyer } = useCommentsThread(commentDraft, onSubmitComment);
  const couleurCat = POST_CATEGORIE_COULEURS[post.categorie as PostCategorie];
  const labelCat = POST_CATEGORIE_LABELS[post.categorie as PostCategorie];
  const estInstitution = post.auteur_type === "institution";
  // Un post institution n'a jamais de commentaire "de l'auteur" (les
  // institutions ne peuvent pas commenter — post_comments n'a que
  // citoyen_id) — postAuteurId reste null dans ce cas, le badge
  // "Auteur"/"Vous" ne s'affiche donc jamais sur un post institution.
  const postAuteurId = estInstitution ? null : post.auteur_id;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1150, background: bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "12px", padding: "calc(env(safe-area-inset-top) + 10px) 16px 10px", borderBottom: `1px solid ${brd}`, background: bg }}>
        <button onClick={onClose} aria-label="Retour" className="tap" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18 9 12l6-6" /></svg>
        </button>
        <span style={{ color: t1, fontSize: "14.5px", fontWeight: 800 }}>Publication</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "12px" }}>
            <button onClick={onOpenAuteur} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
              {estInstitution ? (
                <AvatarInstitution nom={post.author_nom} logo={post.author_photo_url} taille={44} />
              ) : (
                <Avatar nom={post.author_nom} photo={post.author_photo_url} taille={44} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: t1, fontSize: "14px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.author_nom}</span>
                  {!estInstitution && post.author_verifie && <BadgeVerifie />}
                </div>
                {estInstitution ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <InstitutionBadgeVerifie verifie={post.author_verifie} couleurTexte={t2} taille={12} />
                    <span style={{ color: t3, fontSize: "11px" }}>· {tempsRelatif(post.created_at)}</span>
                  </div>
                ) : (
                  <div style={{ color: t2, fontSize: "11px" }}>{tempsRelatif(post.created_at)}</div>
                )}
              </div>
            </button>
            {estInstitution && <SAbonnerButton abonne={estAbonne} onToggle={onToggleAbonnement} t2={t2} />}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button onClick={() => setMenuOuvert(o => !o)} aria-label="Options" className="tap" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t3, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
              </button>
              {menuOuvert && (
                <>
                  <div onClick={() => setMenuOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
                  <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 5, background: card, border: `1px solid ${brd}`, borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "6px", minWidth: "210px" }}>
                    <button onClick={() => { setMenuOuvert(false); onSignalerPost(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", borderRadius: "8px", color: t1, fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }}>
                      Signaler cette publication
                    </button>
                    <button onClick={() => { setMenuOuvert(false); onSignalerAuteur(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", borderRadius: "8px", color: "#ef4444", fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }}>
                      Signaler {post.author_nom}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {couleurCat && (
            <span style={{ display: "inline-block", color: couleurCat, fontSize: "10px", fontWeight: 800, padding: "3px 9px 3px 0", borderRadius: "20px", marginBottom: "12px" }}>{labelCat}</span>
          )}

          {post.contenu && (
            <p style={{ color: t1, fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: post.images?.length ? "0 0 12px" : "0 0 16px" }}>{rendreContenuAvecLiens(post.contenu, onOuvrirMention)}</p>
          )}

          {post.images && post.images.length > 0 && (
            // Empilées verticalement, jamais rognées (retour Bryan 23/08/2026 :
            // la grille 2 colonnes de PostCard coupait la 2e image dans cet
            // écran détail — ici chaque image se lit en entier, comme un post
            // multi-photos Facebook). Pas de bleed plein écran (retiré le même
            // jour, retour Bryan : "laisser respirer") — reste dans le padding
            // 16px du contenu, comme le texte au-dessus.
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {post.images.map((url, i) => (
                <button key={i} onClick={() => onOuvrirImage(post.images!, i)} className="tap" style={{ padding: 0, border: "none", background: "none", cursor: "pointer", display: "block" }}>
                  <Image src={url} alt="" width={800} height={600} style={{ width: "100%", height: "auto", objectFit: "cover", borderRadius: "10px" }} />
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "18px", padding: "10px 0", borderTop: `1px solid ${brd}`, borderBottom: `1px solid ${brd}`, marginBottom: "18px" }}>
            <button onClick={onToggleLike} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: liked ? "#F5A623" : t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill={liked ? "#F5A623" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
              {likeCount > 0 ? likeCount : ""}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: t2, fontSize: "12.5px", fontWeight: 700 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              {commentCount > 0 ? commentCount : ""}
            </div>
            <button onClick={onPartager} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>
              {post.nb_partages > 0 ? post.nb_partages : ""}
            </button>
          </div>

          <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "14px" }}>Commentaires</div>
          <CommentsListe commentairesListe={commentairesListe} filsOuverts={filsOuverts} toggleFil={toggleFil} onRepondre={(id, nom) => setReponseA({ id, nom })} isDark={isDark} t1={t1} t2={t2} t3={t3} postAuteurId={postAuteurId} viewerId={viewerId} />
        </div>
      </div>

      <CommentInputBar isDark={isDark} t1={t1} t2={t2} t3={t3} brd={brd} commentDraft={commentDraft} onChangeCommentDraft={onChangeCommentDraft} envoyer={envoyer} reponseA={reponseA} setReponseA={setReponseA} userNom={userNom} userPhoto={userPhoto} />
    </div>
  );
}

const INTERACTION_GLYPHES: Record<"like" | "commentaire", { couleur: string; icone: React.ReactElement }> = {
  like: {
    couleur: "#F5A623",
    icone: <svg width="9" height="9" viewBox="0 0 24 24" fill="#080812" stroke="#080812" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>,
  },
  commentaire: {
    couleur: "#2563EB",
    icone: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  },
};

// Sheet "Interactions" (22/08/2026, retour Bryan, référence LinkedIn :
// onglets Tous/J'aime/Commentaires). Yelen n'a qu'un seul type de
// réaction ("j'aime", pas plusieurs émojis comme LinkedIn) mais deux
// interactions réellement listables par personne (post_likes ET
// post_comments ont chacun un citoyen_id) — les partages restent hors de
// ce sheet : compteur anonyme sans citoyen_id (voir
// app/api/citoyen/posts/[id]/partager/route.ts).
export function InteractionsSheet({
  card, t1, t2, t3, brd,
  likeCount, commentCount, data, onClose,
}: {
  card: string; t1: string; t2: string; t3: string; brd: string;
  likeCount: number; commentCount: number;
  data: PostInteractionsData | undefined;
  onClose: () => void;
}) {
  const [onglet, setOnglet] = useState<"tous" | "like" | "commentaire">("tous");
  const liste = data ? (onglet === "tous" ? data.tous : onglet === "like" ? data.likes : data.commentateurs) : undefined;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <style>{`@keyframes quiAAimeUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "560px", minHeight: "48vh", maxHeight: "78vh", background: card, borderRadius: "24px 24px 0 0", display: "flex", flexDirection: "column", animation: "quiAAimeUp 0.2s ease" }}
      >
        <div style={{ width: "40px", height: "4px", borderRadius: "4px", background: brd, margin: "12px auto 10px", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 10px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
            <button onClick={() => setOnglet("tous")} className="tap" style={{ background: "none", border: "none", borderBottom: `2px solid ${onglet === "tous" ? "#F5A623" : "transparent"}`, padding: "4px 0 8px", color: onglet === "tous" ? t1 : t2, fontSize: "13px", fontWeight: 800, cursor: "pointer" }}>
              Tous {data ? data.tous.length : ""}
            </button>
            {likeCount > 0 && (
              <button onClick={() => setOnglet("like")} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", borderBottom: `2px solid ${onglet === "like" ? "#F5A623" : "transparent"}`, padding: "4px 0 8px", cursor: "pointer" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{INTERACTION_GLYPHES.like.icone}</div>
                <span style={{ color: onglet === "like" ? t1 : t2, fontSize: "13px", fontWeight: 800 }}>{likeCount}</span>
              </button>
            )}
            {commentCount > 0 && (
              <button onClick={() => setOnglet("commentaire")} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", borderBottom: `2px solid ${onglet === "commentaire" ? "#F5A623" : "transparent"}`, padding: "4px 0 8px", cursor: "pointer" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{INTERACTION_GLYPHES.commentaire.icone}</div>
                <span style={{ color: onglet === "commentaire" ? t1 : t2, fontSize: "13px", fontWeight: 800 }}>{commentCount}</span>
              </button>
            )}
          </div>
          <button onClick={onClose} aria-label="Fermer" className="tap" style={{ width: "30px", height: "30px", borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ borderTop: `1px solid ${brd}`, flexShrink: 0 }} />

        <div className="legende-post-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
          {liste === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={18} color={t2} /></div>
          ) : liste.length === 0 ? (
            <div style={{ color: t3, fontSize: "12.5px", textAlign: "center", padding: "24px" }}>Aucune interaction pour l&apos;instant.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {liste.map(p => (
                <div key={p.citoyen_id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 0" }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <Avatar nom={p.nom} photo={p.photo_url} taille={38} />
                    {onglet === "tous" && (
                      <div style={{ position: "absolute", bottom: "-2px", right: "-2px", display: "flex" }}>
                        {p.types.map(t => (
                          <div key={t} style={{ width: "15px", height: "15px", borderRadius: "50%", background: INTERACTION_GLYPHES[t].couleur, border: `1.5px solid ${card}`, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "-4px" }}>
                            {INTERACTION_GLYPHES[t].icone}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                    <span style={{ color: t1, fontSize: "13px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</span>
                    {p.verifie && <BadgeVerifie />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Visionneuse plein écran des images d'un post (22/08/2026, retour Bryan,
// référence LinkedIn : cliquer une image du fil doit l'ouvrir). Étendue le
// même jour pour reprendre le rail d'actions (like/commenter/partager) et
// le bandeau auteur+légende en bas-gauche que LinkedIn affiche sur sa
// propre visionneuse — jusque-là la visionneuse Yelen n'était qu'une image
// nue avec un bouton fermer. Navigation précédent/suivant + points si
// plusieurs images, jamais de geste de swipe complexe non demandé. Le
// bouton commentaire ouvre le CommentsSheet EMPILÉ par-dessus (zIndex du
// sheet > celui de la visionneuse) sans jamais fermer/démonter la
// visionneuse — retour Bryan 22/08/2026 : la fermer d'abord ramenait
// visuellement au fil (perçu comme un retour à l'accueil). La légende
// ouvre un vrai popup plein texte (même référence LinkedIn) plutôt qu'un
// simple dépli en place.
export function ImageViewerOverlay({
  images, index, post, liked, likeCount, commentCount,
  onToggleLike, onToggleComments, onPartager, onOpenAuteur,
  onSignalerPost, onSignalerAuteur, onClose, onOuvrirMention,
}: {
  images: string[]; index: number; post: Post;
  liked: boolean; likeCount: number; commentCount: number;
  onToggleLike: () => void; onToggleComments: () => void; onPartager: () => void;
  onOpenAuteur: () => void; onSignalerPost: () => void; onSignalerAuteur: () => void; onClose: () => void;
  onOuvrirMention?: (type: "citoyen" | "institution", id: string, nom: string) => void;
}) {
  const [i, setI] = useState(index);
  const [legendeOuverte, setLegendeOuverte] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Swipe tactile (retour Bryan 22/08/2026 : seul le bouton ">" faisait
  // avancer l'image, aucun geste au doigt) — s'ajoute aux boutons
  // précédent/suivant, ne les remplace pas.
  const swipeStartX = useRef<number | null>(null);
  function onSwipeStart(e: React.TouchEvent) {
    swipeStartX.current = e.touches[0].clientX;
  }
  function onSwipeEnd(e: React.TouchEvent) {
    if (swipeStartX.current === null || images.length <= 1) return;
    const delta = e.changedTouches[0].clientX - swipeStartX.current;
    const SEUIL_SWIPE = 50;
    if (delta > SEUIL_SWIPE && i > 0) setI(v => v - 1);
    else if (delta < -SEUIL_SWIPE && i < images.length - 1) setI(v => v + 1);
    swipeStartX.current = null;
  }

  // Aperçu tronqué en JS plutôt qu'en CSS (retour Bryan 22/08/2026 :
  // WebkitLineClamp ne se déclenchait pas de façon fiable sur un
  // <button>) — une seule ligne visible, "Voir plus" ouvre le popup
  // plein texte.
  const LEGENDE_MAX = 70;
  const contenu = post.contenu ?? "";
  const premiereLigne = contenu.split("\n")[0];
  const legendeTronquee = contenu.length > LEGENDE_MAX || contenu.includes("\n");
  const legendeApercu = legendeTronquee ? premiereLigne.slice(0, LEGENDE_MAX).trimEnd() : contenu;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "#000", display: "flex", flexDirection: "column" }} onClick={onClose}>
      <button onClick={onClose} aria-label="Fermer" className="tap" style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 12px)", right: "16px", zIndex: 3, width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>

      {/* Menu "..." — signaler la publication/l'auteur, même actions que
          celles déjà disponibles dans le fil Communauté (PostCard),
          retour Bryan 22/08/2026. */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 12px)", left: "16px", zIndex: 3 }} onClick={e => e.stopPropagation()}>
        <button onClick={() => setMenuOuvert(o => !o)} aria-label="Options" className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
        </button>
        {menuOuvert && (
          <>
            <div onClick={() => setMenuOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5, background: "#1C1C1E", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", padding: "6px", minWidth: "210px" }}>
              <button onClick={() => { setMenuOuvert(false); onSignalerPost(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", borderRadius: "8px", color: "#fff", fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }}>
                Signaler cette publication
              </button>
              <button onClick={() => { setMenuOuvert(false); onSignalerAuteur(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", borderRadius: "8px", color: "#ef4444", fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }}>
                Signaler {post.author_nom}
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1, position: "relative" }} onClick={e => e.stopPropagation()} onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
        <Image src={images[i]} alt="" fill sizes="100vw" style={{ objectFit: "contain" }} />
        {images.length > 1 && i > 0 && (
          <button onClick={() => setI(v => v - 1)} aria-label="Image précédente" className="tap" style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", width: "38px", height: "38px", borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        )}
        {images.length > 1 && i < images.length - 1 && (
          <button onClick={() => setI(v => v + 1)} aria-label="Image suivante" className="tap" style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "38px", height: "38px", borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        )}

        {/* Rail d'actions droite — like/commenter/partager, même iconographie
            que PostCard pour rester cohérent, référence LinkedIn. */}
        <div style={{ position: "absolute", right: "14px", bottom: "18px", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", zIndex: 2 }}>
          <button onClick={e => { e.stopPropagation(); onToggleLike(); }} aria-label="J'aime" className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", background: "none", border: "none", padding: 0, cursor: "pointer", color: liked ? "#F5A623" : "#fff" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill={liked ? "#F5A623" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
            <span style={{ fontSize: "11px", fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{likeCount > 0 ? likeCount : ""}</span>
          </button>
          <button onClick={e => { e.stopPropagation(); onToggleComments(); }} aria-label="Commenter" className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", background: "none", border: "none", padding: 0, cursor: "pointer", color: "#fff" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span style={{ fontSize: "11px", fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{commentCount > 0 ? commentCount : ""}</span>
          </button>
          <button onClick={e => { e.stopPropagation(); onPartager(); }} aria-label="Partager" className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", background: "none", border: "none", padding: 0, cursor: "pointer", color: "#fff" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>
            <span style={{ fontSize: "11px", fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{post.nb_partages > 0 ? post.nb_partages : ""}</span>
          </button>
        </div>

        {/* Bandeau auteur + légende bas-gauche, superposé à la photo au même
            niveau (même "bottom") que le rail d'actions à droite — retour
            Bryan 22/08/2026 : en flux normal sous la photo, le bandeau
            tombait bien plus bas que l'icône partager. */}
        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", left: 0, right: "70px", bottom: "18px", padding: "14px 12px 0 16px", background: "linear-gradient(0deg, rgba(0,0,0,0.7), transparent)" }}>
          <button onClick={onOpenAuteur} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", background: "none", border: "none", padding: 0, marginBottom: post.contenu ? "8px" : 0, cursor: "pointer", textAlign: "left" }}>
            {post.auteur_type === "institution" ? (
              <AvatarInstitution nom={post.author_nom} logo={post.author_photo_url} taille={36} />
            ) : (
              <Avatar nom={post.author_nom} photo={post.author_photo_url} taille={36} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#fff", fontSize: "13px", fontWeight: 800 }}>{post.author_nom}</span>
                {post.auteur_type !== "institution" && post.author_verifie && <BadgeVerifie />}
              </div>
              {post.auteur_type === "institution" ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <InstitutionBadgeVerifie verifie={post.author_verifie} couleurTexte="rgba(255,255,255,0.7)" taille={11.5} />
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "10.5px" }}>· {tempsRelatif(post.created_at)}</span>
                </div>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "10.5px" }}>{tempsRelatif(post.created_at)}</div>
              )}
            </div>
          </button>
          {contenu && (
            legendeTronquee ? (
              <button
                onClick={() => setLegendeOuverte(true)}
                className="tap"
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, whiteSpace: "nowrap", overflow: "hidden", cursor: "pointer" }}
              >
                <span style={{ color: "rgba(255,255,255,0.92)", fontSize: "12.5px" }}>{legendeApercu}… </span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12.5px", fontWeight: 800 }}>Voir plus</span>
              </button>
            ) : (
              <div style={{ color: "rgba(255,255,255,0.92)", fontSize: "12.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{contenu}</div>
            )
          )}
        </div>
      </div>

      {images.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", padding: "10px 0", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {images.map((_, d) => (
            <span key={d} style={{ width: "6px", height: "6px", borderRadius: "50%", background: d === i ? "#F5A623" : "rgba(255,255,255,0.35)" }} />
          ))}
        </div>
      )}

      {/* Barre "Ajouter un commentaire" fixe en bas (retour Bryan
          22/08/2026, référence Facebook). Le clic ouvre le même
          CommentsSheet que l'icône commenter du rail d'actions — jamais un
          second mécanisme de saisie séparé. */}
      <button
        onClick={e => { e.stopPropagation(); onToggleComments(); }}
        className="tap"
        style={{ display: "flex", alignItems: "center", width: "100%", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.1)", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", cursor: "pointer", flexShrink: 0 }}
      >
        <span style={{ flex: 1, textAlign: "left", background: "rgba(255,255,255,0.08)", borderRadius: "20px", padding: "9px 14px", color: "rgba(255,255,255,0.5)", fontSize: "12.5px" }}>
          Écrire un commentaire…
        </span>
      </button>

      {legendeOuverte && (
        <LegendePostSheet contenu={post.contenu} createdAt={post.created_at} onClose={() => setLegendeOuverte(false)} onOuvrirMention={onOuvrirMention} />
      )}
    </div>
  );
}

// Popup légende plein texte (retour Bryan 22/08/2026, référence LinkedIn :
// le "…more"/"Voir plus" d'une légende tronquée ouvre un sheet dédié
// plutôt que de simplement déplier en place). Extrait de la visionneuse
// pour être réutilisé tel quel par PostCard (fil) — toujours le même
// rendu sombre "mode lecture", peu importe le thème clair/sombre de
// l'écran d'où on l'ouvre (retour Bryan 22/08/2026 : "le sheet qu'on a
// créé précédemment", pas une variante par thème).
export function LegendePostSheet({
  contenu, createdAt, onClose, onOuvrirMention,
}: {
  contenu: string | null;
  createdAt: string;
  onClose: () => void;
  onOuvrirMention?: (type: "citoyen" | "institution", id: string, nom: string) => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={e => { e.stopPropagation(); onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", minHeight: "38vh", maxHeight: "78vh", background: "#1C1C1E", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
        <div style={{ width: "40px", height: "4px", borderRadius: "4px", background: "rgba(255,255,255,0.25)", margin: "12px auto 10px", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "12px", fontWeight: 700 }}>{tempsRelatif(createdAt)}</span>
          <button onClick={onClose} aria-label="Fermer" className="tap" style={{ width: "30px", height: "30px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="legende-post-scroll" style={{ overflowY: "auto", padding: "16px" }}>
          <div style={{ color: "rgba(255,255,255,0.92)", fontSize: "13.5px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{rendreContenuAvecLiens(contenu ?? "", onOuvrirMention)}</div>
        </div>
      </div>
    </div>
  );
}
