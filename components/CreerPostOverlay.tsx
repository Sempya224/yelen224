"use client";

// Création d'une publication "Yelen Community" en plein écran (27/07/2026,
// retour Bryan : "mettons la création en pop pleine comme les profils")
// — même convention header que ProfilAuteurOverlay/OffreFicheOverlay (X +
// titre centré), remplace l'ancien composeur qui s'étendait en ligne dans
// le fil.
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarInstitution, CategorieBadge } from "@/components/CommunautePostCard";
import { YelenLoader } from "@/components/YelenLoader";
import { POST_CATEGORIES, POST_CATEGORIE_LABELS, POST_CATEGORIE_COULEURS } from "@/lib/communauteCategories";
import { chargerCiblesMentionnables, type CibleMentionnable } from "@/lib/communauteMentions";
import type { PostSuggestion } from "@/lib/postSuggestions";

const MAX_IMAGES = 4;

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
  categorie: string | null; setCategorie: (v: string) => void;
  envoi: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onChoisirFichiers: (f: FileList | null) => void;
  onPublier: () => void;
  onFermer: () => void;
  suggestions: PostSuggestion[];
  onChoisirSuggestion: (s: PostSuggestion) => void;
  isDark: boolean; bg: string; card: string; card2: string; t1: string; t2: string; brd: string;
}) {
  const peutPublier = (texte.trim() || fichiers.length > 0) && categorie && !envoi;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [curseur, setCurseur] = useState(0);
  const [cibles, setCibles] = useState<CibleMentionnable[] | null>(null);

  // Chargé une seule fois à l'ouverture du composeur, seulement utilisé si
  // l'utilisateur tape "@" — pas de coût si la publication ne mentionne
  // personne.
  useEffect(() => {
    let annule = false;
    chargerCiblesMentionnables().then(res => { if (!annule) setCibles(res); });
    return () => { annule = true; };
  }, []);

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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", flexShrink: 0 }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <button onClick={onFermer} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div style={{ color: t1, fontSize: "16px", fontWeight: 800, textAlign: "center" }}>Nouvelle publication</div>
          <button
            onClick={onPublier}
            disabled={!peutPublier}
            className="tap"
            style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: "6px", background: "linear-gradient(135deg,#F5A623,#C8940A)", border: "none", borderRadius: "10px", padding: "9px 16px", color: "#080812", fontSize: "13px", fontWeight: 800, cursor: peutPublier ? "pointer" : "default", opacity: peutPublier ? 1 : 0.5 }}
          >
            {envoi ? <YelenLoader size={14} color="#080812" /> : "Publier"}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 20px 40px", width: "100%", maxWidth: "560px", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <Avatar nom={userName} photo={userPhoto} taille={40} />
          <span style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>{userName}</span>
        </div>

        <div style={{ position: "relative", marginBottom: "14px" }}>
          <textarea
            ref={textareaRef}
            autoFocus
            value={texte}
            onChange={e => { setTexte(e.target.value); setCurseur(e.target.selectionStart); }}
            onClick={e => setCurseur(e.currentTarget.selectionStart)}
            onKeyUp={e => setCurseur(e.currentTarget.selectionStart)}
            placeholder="Partagez une idée, une expérience professionnelle… (@ pour mentionner quelqu'un)"
            style={{ width: "100%", minHeight: "140px", background: "none", border: "none", outline: "none", color: t1, fontSize: "15px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", display: "block" }}
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

        {/* Suggestions dérivées de la vraie activité du citoyen (démarche
            terminée, avis positif récent — voir lib/postSuggestions.ts),
            jamais un "achievement" générique : masquées dès que le champ
            n'est plus vide, pour ne jamais gêner une rédaction en cours. */}
        {suggestions.length > 0 && !texte.trim() && (
          <div style={{ marginBottom: "18px" }}>
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

        {fichiers.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
            {fichiers.map((f, i) => (
              <div key={i} style={{ position: "relative", width: "76px", height: "76px", borderRadius: "12px", overflow: "hidden", border: `1px solid ${brd}` }}>
                {/* IMG-EXCEPTION: reason=URL.createObjectURL(f) génère un blob: local, non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => setFichiers(prev => prev.filter((_, idx) => idx !== i))} aria-label="Retirer" className="tap" style={{ position: "absolute", top: "3px", right: "3px", width: "20px", height: "20px", borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={e => onChoisirFichiers(e.target.files)} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={fichiers.length >= MAX_IMAGES}
          className="tap"
          style={{ display: "flex", alignItems: "center", gap: "6px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "10px", padding: "9px 14px", color: t2, fontSize: "12.5px", fontWeight: 700, cursor: fichiers.length >= MAX_IMAGES ? "default" : "pointer", opacity: fichiers.length >= MAX_IMAGES ? 0.5 : 1, marginBottom: "22px" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
          Ajouter une image ({fichiers.length}/{MAX_IMAGES})
        </button>

        {/* Catégorie — obligatoire, max 10, jamais politique/race/ethnie. */}
        <div>
          <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>
            Catégorie {!categorie && <span style={{ color: "#ef4444" }}>· requise</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {POST_CATEGORIES.map(cat => {
              const actif = categorie === cat;
              const couleur = POST_CATEGORIE_COULEURS[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setCategorie(cat)}
                  className="tap"
                  style={{
                    display: "flex", alignItems: "center", gap: "10px", width: "100%", minWidth: 0, textAlign: "left",
                    background: actif ? `${couleur}14` : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
                    border: `1px solid ${actif ? couleur : brd}`, borderRadius: "14px", padding: "10px 12px", cursor: "pointer",
                  }}
                >
                  <CategorieBadge categorie={cat} taille={32} />
                  <span style={{ flex: 1, minWidth: 0, color: actif ? couleur : t1, fontSize: "12.5px", fontWeight: actif ? 800 : 700, lineHeight: 1.25 }}>{POST_CATEGORIE_LABELS[cat]}</span>
                  {actif && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
