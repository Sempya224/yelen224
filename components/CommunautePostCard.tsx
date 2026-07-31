"use client";

// Pièces de rendu du fil "Yelen Community" (onglet Communauté de
// app/page.tsx) — extraites dans leur propre fichier pour ne pas alourdir
// davantage page.tsx (même logique que OffreFicheOverlay.tsx), mais
// l'état/les effets/les handlers restent dans page.tsx (même convention
// que l'onglet Offres, retour Bryan 27/07/2026 : "un onglet ici, pas un
// écran externe").
import { useState } from "react";
import { YelenLoader } from "@/components/YelenLoader";
import { POST_CATEGORIE_LABELS, POST_CATEGORIE_COULEURS, type PostCategorie } from "@/lib/communauteCategories";

export type Post = {
  id: string;
  auteur_id: string;
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
    <img src={photo} alt={nom} style={{ width: taille, height: taille, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <div style={{ width: taille, height: taille, borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", fontWeight: 900, fontSize: taille * 0.4, flexShrink: 0 }}>
      {(nom || "Y").slice(0, 2).toUpperCase()}
    </div>
  );
}

export function BadgeVerifie() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "rgba(37,99,235,0.12)", color: "#2563EB", fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px" }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="3"><path d="M12 2 20 6v6c0 5.4-3.4 8.8-8 10-4.6-1.2-8-4.6-8-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
      Vérifié
    </span>
  );
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

export function CategorieBadge({ categorie, taille = 32 }: { categorie: string; taille?: number }) {
  const c = categorie as PostCategorie;
  const couleur = POST_CATEGORIE_COULEURS[c] || "#8E8E93";
  const glyphe = CATEGORIE_GLYPHES[c];
  return (
    <div style={{ width: taille, height: taille, borderRadius: "50%", flexShrink: 0, background: `${couleur}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
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

export function PostCard({
  post, isDark, card, t1, t2, t3, brd,
  liked, likeCount, commentCount, onToggleLike, onPartager,
  commentsOuverts, onToggleComments, commentairesListe, commentDraft, onChangeCommentDraft, onSubmitComment,
  onOpenAuteur, onSignalerPost, onSignalerAuteur,
}: {
  post: Post; isDark: boolean; card: string; t1: string; t2: string; t3: string; brd: string;
  liked: boolean; likeCount: number; commentCount: number;
  onToggleLike: () => void; onPartager: () => void;
  commentsOuverts: boolean; onToggleComments: () => void;
  commentairesListe: Commentaire[] | undefined;
  commentDraft: string; onChangeCommentDraft: (v: string) => void; onSubmitComment: () => void;
  onOpenAuteur: () => void; onSignalerPost: () => void; onSignalerAuteur: () => void;
}) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const couleurCat = POST_CATEGORIE_COULEURS[post.categorie as PostCategorie];
  const labelCat = POST_CATEGORIE_LABELS[post.categorie as PostCategorie];

  return (
    <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "10px" }}>
        <button onClick={onOpenAuteur} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <Avatar nom={post.author_nom} photo={post.author_photo_url} taille={40} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: t1, fontSize: "13.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.author_nom}</span>
              {post.author_verifie && <BadgeVerifie />}
            </div>
            <div style={{ color: t2, fontSize: "11px" }}>
              Membre de Yelen depuis {formatDateFr(post.author_membre_depuis)}
            </div>
          </div>
        </button>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setMenuOuvert(o => !o)} aria-label="Options" className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t3, cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
          </button>
          {menuOuvert && (
            <>
              <div onClick={() => setMenuOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
              <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 5, background: card, border: `1px solid ${brd}`, borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "6px", minWidth: "200px" }}>
                <button onClick={() => { setMenuOuvert(false); onSignalerPost(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 10px", borderRadius: "8px", color: t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                  Signaler cette publication
                </button>
                <button onClick={() => { setMenuOuvert(false); onSignalerAuteur(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 10px", borderRadius: "8px", color: "#ef4444", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                  Signaler {post.author_nom}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {couleurCat && (
        <span style={{ display: "inline-block", background: `${couleurCat}18`, color: couleurCat, fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", marginBottom: "10px" }}>{labelCat}</span>
      )}

      {post.contenu && <div style={{ color: t1, fontSize: "13.5px", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: post.images?.length ? "10px" : "12px" }}>{post.contenu}</div>}

      {post.images && post.images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: post.images.length === 1 ? "1fr" : "1fr 1fr", gap: "6px", marginBottom: "12px", borderRadius: "12px", overflow: "hidden" }}>
          {post.images.map((url, i) => (
            <img key={i} src={url} alt="" style={{ width: "100%", height: post.images!.length === 1 ? "auto" : "140px", maxHeight: "320px", objectFit: "cover" }} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "18px", paddingTop: "10px", borderTop: `1px solid ${brd}` }}>
        <button onClick={onToggleLike} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: liked ? "#F5A623" : t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill={liked ? "#F5A623" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
          {likeCount > 0 ? likeCount : ""}
        </button>
        <button onClick={onToggleComments} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: commentsOuverts ? t1 : t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          {commentCount > 0 ? commentCount : ""}
        </button>
        <button onClick={onPartager} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>
          {post.nb_partages > 0 ? post.nb_partages : ""}
        </button>
        <span style={{ marginLeft: "auto", color: t3, fontSize: "11px" }}>{tempsRelatif(post.created_at)}</span>
      </div>

      {commentsOuverts && (
        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${brd}` }}>
          {commentairesListe === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "10px" }}><YelenLoader size={16} color={t2} /></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
              {commentairesListe.map(c => (
                <div key={c.id} style={{ display: "flex", gap: "8px" }}>
                  <Avatar nom={c.citoyen_nom} photo={c.citoyen_photo_url} taille={26} />
                  <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "12px", padding: "8px 12px", flex: 1 }}>
                    <div style={{ color: t1, fontSize: "12px", fontWeight: 800, marginBottom: "2px" }}>{c.citoyen_nom}</div>
                    <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>{c.contenu}</div>
                  </div>
                </div>
              ))}
              {commentairesListe.length === 0 && <div style={{ color: t3, fontSize: "12px", textAlign: "center" }}>Aucun commentaire pour l&apos;instant.</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={commentDraft}
              onChange={e => onChangeCommentDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && commentDraft.trim()) onSubmitComment(); }}
              placeholder="Écrire un commentaire…"
              style={{ flex: 1, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: "none", borderRadius: "20px", padding: "9px 14px", color: t1, fontSize: "12.5px", outline: "none" }}
            />
            <button onClick={onSubmitComment} disabled={!commentDraft.trim()} className="tap" style={{ background: "none", border: "none", color: commentDraft.trim() ? "#F5A623" : t3, cursor: commentDraft.trim() ? "pointer" : "default", padding: "4px 6px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
