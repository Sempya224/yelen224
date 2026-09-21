"use client";

// Statut de mes publications "Yelen Community" (27/07/2026, retour Bryan) —
// plein écran, liste tous les statuts réels (posts_own_read), jamais une
// donnée inventée. Refonte visuelle "profil/feed personnel" (21/09/2026,
// retour Bryan) — reprend le langage du nouveau composer (fond gris clair,
// cartes blanches, grands rayons) mais garde un comportement de header
// distinct (titre à gauche, pas centré comme une modale) : chantier
// strictement UI/UX, aucune règle de publication/modération/validation
// touchée, les interactions affichées (likes/commentaires) viennent des
// mêmes lignes réelles post_likes/post_comments déjà utilisées par le fil
// principal (voir app/page.tsx::chargerReactionsPosts), jamais un chiffre
// recalculé différemment ici.
import { useState } from "react";
import Image from "next/image";
import { CategorieBadge } from "@/components/CommunautePostCard";
import { POST_CATEGORIE_LABELS, POST_CATEGORIE_COULEURS, type PostCategorie } from "@/lib/communauteCategories";

type MaPublication = { id: string; statut: string; contenu: string | null; created_at: string; motif_refus: string | null; images: string[] | null; categorie: string | null };

const STATUT_INFO: Record<string, { label: string; couleur: string }> = {
  en_attente_validation: { label: "En attente", couleur: "#F5A623" },
  publiee: { label: "Publiée", couleur: "#16A34A" },
  refusee: { label: "Refusée", couleur: "#DC2626" },
};

const P = { pointerEvents: "none" as const };
function IconX() { return <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function IconPlus() { return <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function IconHeart({ filled, color }: { filled: boolean; color: string }) { return <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>; }
function IconComment({ color }: { color: string }) { return <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>; }
function IconShare({ color }: { color: string }) { return <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>; }
function IconSparkle() {
  // Même glyphe SVG que "Pour vous aujourd'hui ✨" ailleurs sur l'accueil
  // (jamais l'emoji Unicode — palette figée, non teintable en or exact).
  return <svg width="34" height="34" viewBox="0 0 24 24" fill="#F5A623"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>;
}

// Date compacte (section 5 du brief 21/09/2026) — même logique contextuelle
// que le reste du produit (ex. app/messagerie/citoyen/page.tsx::formatDateListe) :
// jour/mois abrégé, année seulement si nécessaire, jamais la forme complète
// "21 septembre 2026" qui prenait toute la largeur de la carte.
function estMemeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatDateCompacte(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (estMemeJour(d, now)) return "Aujourd'hui";
  const hier = new Date(now); hier.setDate(hier.getDate() - 1);
  if (estMemeJour(d, hier)) return "Hier";
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// Partage (même mécanisme que app/page.tsx::partagerPost, réécrit ici en
// autonome — cette carte n'a pas le type `Post` complet du fil principal,
// juste `MaPublication`) : incrémente le même compteur réel côté serveur,
// aucune nouvelle route créée.
async function partagerPublication(p: MaPublication) {
  const url = typeof window !== "undefined" ? window.location.href : "";
  try {
    if (navigator.share) await navigator.share({ title: "Yelen Community", text: p.contenu ?? undefined, url });
    else if (navigator.clipboard) await navigator.clipboard.writeText(url);
  } catch { /* partage annulé par l'utilisateur — rien à faire */ }
  fetch(`/api/citoyen/posts/${p.id}/partager`, { method: "POST" }).catch(() => {});
}

const SEUIL_TRONCATURE = 220;

export default function MesPublicationsOverlay({
  publications, postLikes, postCommentCounts, bg, card, card2, t1, t2, t3, brd, onClose,
  identiteVerifiee, onCreerPost, onVerifierIdentite,
}: {
  publications: MaPublication[];
  postLikes: Record<string, { count: number; likedByMoi: boolean }>;
  postCommentCounts: Record<string, number>;
  bg: string; card: string; card2: string; t1: string; t2: string; t3: string; brd: string;
  onClose: () => void;
  // État vide (retour Bryan 09/09/2026) — identité vérifiée : CTA direct
  // vers le composeur ; sinon CTA vers la vérification d'identité (même
  // exigence que le composeur du fil, voir CommunauteVerificationSheet
  // dans app/page.tsx). Jamais les deux en même temps.
  identiteVerifiee: boolean;
  onCreerPost: () => void;
  onVerifierIdentite: () => void;
}) {
  const [developpes, setDeveloppes] = useState<Set<string>>(new Set());
  function basculerDeveloppe(id: string) {
    setDeveloppes(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return (
    <div style={{ position: "fixed", inset: 0, height: "100dvh", zIndex: 1000, background: bg, display: "flex", flexDirection: "column" }}>
      {/* ── Header (section 1) — titre à gauche, élément dominant, pas une
          modale centrée comme le composer : "profil personnel", pas "popup
          formulaire" (voir note de cohérence produit du brief). ── */}
      <header style={{ flexShrink: 0, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ padding: "16px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ color: t1, fontSize: "22px", fontWeight: 900, letterSpacing: "-0.4px" }}>Mes publications</div>
          <button onClick={onClose} className="tap" aria-label="Fermer" style={{ width: "38px", height: "38px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}>
            <IconX />
          </button>
        </div>
        {/* ── Résumé personnel discret (section 2) ── */}
        {publications.length > 0 && (
          <div style={{ padding: "0 20px 14px", color: t2, fontSize: "12.5px", fontWeight: 700 }}>
            {publications.length} publication{publications.length > 1 ? "s" : ""} · Communauté Yelen
          </div>
        )}
      </header>

      <main style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 20px 40px", width: "100%", maxWidth: "560px", margin: "0 auto", boxSizing: "border-box" }}>
        {publications.length === 0 ? (
          // ── État vide (section 11) — centré, sobre, sparkle SVG plutôt
          // qu'une grande illustration générique. ──
          <div style={{ textAlign: "center", padding: "60px 20px 40px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <IconSparkle />
            </div>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "8px" }}>Vos publications</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.55, marginBottom: "24px", maxWidth: "280px", margin: "0 auto 24px" }}>
              {identiteVerifiee
                ? "Vous n'avez encore rien publié. Partagez votre première idée avec la communauté Yelen."
                : "Vérifiez votre identité pour publier vos propres idées sur Yelen — ça protège la communauté des faux comptes."}
            </div>
            <button onClick={identiteVerifiee ? onCreerPost : onVerifierIdentite} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", border: "none", borderRadius: "20px", padding: "12px 22px", fontSize: "13.5px", fontWeight: 800, cursor: "pointer" }}>
              {identiteVerifiee ? <><IconPlus /> Créer une publication</> : "Vérifier mon identité"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {publications.map(p => {
              const info = STATUT_INFO[p.statut] ?? { label: p.statut, couleur: t3 };
              const cat = p.categorie as PostCategorie | null;
              const couleurCat = cat ? POST_CATEGORIE_COULEURS[cat] : null;
              const labelCat = cat ? POST_CATEGORIE_LABELS[cat] : null;
              const contenu = p.contenu ?? "";
              // Un post court en caractères mais avec plusieurs retours à la
              // ligne (paragraphes courts, liste...) peut dépasser 4 lignes
              // visuelles sans jamais franchir le seuil de longueur — d'où
              // le second critère, pas seulement contenu.length.
              const estLong = contenu.length > SEUIL_TRONCATURE || contenu.split("\n").length > 5;
              const developpe = developpes.has(p.id);
              const reactions = postLikes[p.id];
              const commentaires = postCommentCounts[p.id] ?? 0;

              return (
                <div key={p.id} style={{ background: card, border: `1px solid ${brd}`, borderRadius: "20px", padding: "16px" }}>
                  {/* Statut + date (sections 4 et 5) */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: p.statut === "en_attente_validation" ? "4px" : "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "7px", height: "7px", borderRadius: "4px", background: info.couleur, flexShrink: 0 }} />
                      <span style={{ color: info.couleur, fontSize: "12px", fontWeight: 800 }}>{info.label}</span>
                    </div>
                    <span style={{ color: t3, fontSize: "11.5px", fontWeight: 600, flexShrink: 0 }}>{formatDateCompacte(p.created_at)}</span>
                  </div>

                  {/* Ligne secondaire "en attente" (section 8) — texte déjà
                      utilisé ailleurs pour ce statut (bannière ticket
                      Support Yelen), pas un nouveau comportement inventé. */}
                  {p.statut === "en_attente_validation" && (
                    <div style={{ color: t3, fontSize: "11px", marginBottom: "8px" }}>Votre publication est en cours de vérification.</div>
                  )}

                  {/* Texte (section 6) — contenu dominant, tronqué visuellement */}
                  {contenu && (
                    <div
                      style={{
                        color: t1, fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        marginBottom: (p.images?.length || (p.statut === "refusee" && p.motif_refus)) ? "10px" : "0",
                        ...(!developpe && estLong ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}),
                      }}
                    >
                      {contenu}
                    </div>
                  )}
                  {estLong && (
                    <button onClick={() => basculerDeveloppe(p.id)} className="tap" style={{ background: "none", border: "none", padding: 0, color: t2, fontSize: "12px", fontWeight: 800, cursor: "pointer", marginTop: "2px", marginBottom: (p.images?.length || (p.statut === "refusee" && p.motif_refus)) ? "10px" : "0" }}>
                      {developpe ? "Voir moins" : "Voir plus"}
                    </button>
                  )}

                  {/* Image (section 7) */}
                  {p.images && p.images.length > 0 && (
                    <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden", marginBottom: (p.statut === "refusee" && p.motif_refus) ? "10px" : "0" }}>
                      <Image src={p.images[0]} alt="" width={800} height={480} style={{ width: "100%", height: "170px", objectFit: "cover", display: "block" }} />
                      {p.images.length > 1 && (
                        <span style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: "10.5px", fontWeight: 800, padding: "3px 8px", borderRadius: "20px" }}>+{p.images.length - 1}</span>
                      )}
                    </div>
                  )}

                  {p.statut === "refusee" && p.motif_refus && (
                    <div style={{ color: "#DC2626", fontSize: "12px" }}>Motif : {p.motif_refus}</div>
                  )}

                  {/* Interactions + catégorie (sections 3 et 9) — uniquement
                      des compteurs réels (post_likes/post_comments), jamais
                      une donnée inventée ; catégorie affichée discrètement,
                      jamais en gros bloc comme dans l'ancien composer. */}
                  {(p.statut === "publiee" || labelCat) && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "10px", borderTop: `1px solid ${brd}` }}>
                      {p.statut === "publiee" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: reactions?.likedByMoi ? "#DC2626" : t2, fontSize: "12px", fontWeight: 700 }}>
                            <IconHeart filled={!!reactions?.likedByMoi} color={reactions?.likedByMoi ? "#DC2626" : t2} /> {reactions?.count ?? 0}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: t2, fontSize: "12px", fontWeight: 700 }}>
                            <IconComment color={t2} /> {commentaires}
                          </span>
                          <button onClick={() => partagerPublication(p)} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", padding: 0, color: t2, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                            <IconShare color={t2} /> Partager
                          </button>
                        </div>
                      ) : <span />}
                      {labelCat && couleurCat && (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px", color: couleurCat, fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>
                          <CategorieBadge categorie={cat as string} taille={18} />
                          {labelCat}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
