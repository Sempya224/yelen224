"use client";

// Création d'une publication "Yelen Community" en plein écran (27/07/2026,
// retour Bryan : "mettons la création en pop pleine comme les profils")
// — même convention header que ProfilAuteurOverlay/OffreFicheOverlay (X +
// titre centré), remplace l'ancien composeur qui s'étendait en ligne dans
// le fil.
import { Avatar, CategorieChip } from "@/components/CommunautePostCard";
import { YelenLoader } from "@/components/YelenLoader";
import { POST_CATEGORIES } from "@/lib/communauteCategories";

const MAX_IMAGES = 4;

export default function CreerPostOverlay({
  userName, userPhoto,
  texte, setTexte, fichiers, setFichiers, categorie, setCategorie, envoi,
  fileInputRef, onChoisirFichiers, onPublier, onFermer,
  isDark, bg, card, card2, t1, t2, brd,
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
  isDark: boolean; bg: string; card: string; card2: string; t1: string; t2: string; brd: string;
}) {
  const peutPublier = (texte.trim() || fichiers.length > 0) && categorie && !envoi;

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

        <textarea
          autoFocus
          value={texte}
          onChange={e => setTexte(e.target.value)}
          placeholder="Partagez une idée, une expérience professionnelle…"
          style={{ width: "100%", minHeight: "140px", background: "none", border: "none", outline: "none", color: t1, fontSize: "15px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: "14px" }}
        />

        {fichiers.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
            {fichiers.map((f, i) => (
              <div key={i} style={{ position: "relative", width: "76px", height: "76px", borderRadius: "12px", overflow: "hidden", border: `1px solid ${brd}` }}>
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
          <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "6px" }}>
            {POST_CATEGORIES.map(cat => (
              <CategorieChip key={cat} categorie={cat} actif={categorie === cat} onClick={() => setCategorie(cat)} texteCouleur={t2} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
