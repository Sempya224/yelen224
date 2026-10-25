"use client";

// Bloc bannière + logo façon "profil" (refonte ProfilEntrepriseTab, Étape
// C, 19/10/2026) — le logo chevauche le bas de la bannière (margin négative)
// au lieu du côté-à-côté précédent. Boutons Changer (icône caméra) toujours
// visibles en overlay discret + Supprimer (uniquement si une image existe) —
// "Supprimer" vide juste le champ côté formulaire (`onRemove`), la vraie
// suppression se fait à l'enregistrement comme n'importe quel autre champ,
// aucun appel réseau immédiat ni changement du endpoint d'upload existant.
import type { CSSProperties } from "react";
import { useRef } from "react";
import Image from "next/image";
import type { ThemeTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";

function IconCamera() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
}
function IconTrash() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
}
function IconPencil() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>;
}

const overlayBtn: CSSProperties = {
  width: "26px", height: "26px", borderRadius: "50%", backgroundColor: "rgba(10,10,18,0.65)",
  border: "1.5px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer",
};

export function BannerLogoField({ banniere, logo, uploadingBanniere, uploadingLogo, onPickBanniere, onPickLogo, onRemoveBanniere, onRemoveLogo, C }: {
  banniere: string; logo: string; uploadingBanniere: boolean; uploadingLogo: boolean;
  onPickBanniere: (file: File) => void; onPickLogo: (file: File) => void;
  onRemoveBanniere: () => void; onRemoveLogo: () => void;
  C: ThemeTokens;
}) {
  const banniereInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 1", minHeight: "110px", borderRadius: "12px", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, overflow: "hidden" }}>
        {banniere ? <Image src={banniere} alt="" fill sizes="(min-width: 640px) 600px, 100vw" style={{ objectFit: "cover" }}/> : (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>Aucune bannière</span>
          </div>
        )}
        {uploadingBanniere && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={18} color="#fff"/></div>}
        <div style={{ position: "absolute", right: "10px", top: "10px", display: "flex", gap: "8px" }}>
          {banniere && (
            <button type="button" onClick={onRemoveBanniere} className="tap" aria-label="Supprimer la bannière" style={overlayBtn}><IconTrash/></button>
          )}
          <button type="button" onClick={() => banniereInputRef.current?.click()} className="tap" aria-label="Changer la bannière" style={overlayBtn}><IconCamera/></button>
        </div>
        <input ref={banniereInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onPickBanniere(f); }}/>
      </div>
      <style>{`
        .blf-help { text-align: right; }
        .blf-row { margin-top: -44px; }
        .blf-logo { width: 88px; height: 88px; }
        @media (max-width: 639px) {
          .blf-help { text-align: left; }
          .blf-row { margin-top: 12px; }
          .blf-logo { width: 72px; height: 72px; }
        }
      `}</style>
      <p className="blf-help" style={{ color: C.t3, fontSize: "10.5px", margin: "6px 0 0", paddingTop: "2px" }}>Format recommandé : 1600×400px, 2 Mo maximum.</p>

      <div className="blf-row" style={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginLeft: "16px", position: "relative", zIndex: 20 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div className="blf-logo" style={{ borderRadius: "20px", backgroundColor: C.bg3, border: `4px solid ${C.bgCard}`, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
            {logo ? <Image src={logo} alt="" fill sizes="88px" style={{ objectFit: "cover" }}/> : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            )}
            {uploadingLogo && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={14} color="#fff"/></div>}
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onPickLogo(f); }}/>
          <button type="button" onClick={() => logoInputRef.current?.click()} className="tap" aria-label="Changer le logo" style={{ ...overlayBtn, position: "absolute", right: "-4px", bottom: "-4px", zIndex: 30, width: "30px", height: "30px", backgroundColor: C.gold, border: `2px solid ${C.bgCard}` }}>
            <IconPencil/>
          </button>
        </div>
        <div style={{ paddingTop: "52px", minWidth: 0 }}>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: "600" }}>Logo de l&apos;établissement</div>
          <div style={{ color: C.t3, fontSize: "11.5px", marginTop: "2px" }}>PNG ou JPG, carré, 512×512 px recommandé, 2 Mo max</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", fontSize: "11.5px", fontWeight: "600" }}>
            <button type="button" onClick={() => logoInputRef.current?.click()} className="tap" style={{ background: "none", border: "none", padding: 0, color: C.gold, fontSize: "inherit", fontWeight: "inherit", cursor: "pointer" }}>Changer le logo</button>
            {logo && (
              <>
                <span aria-hidden style={{ color: C.t3 }}>·</span>
                <button type="button" onClick={onRemoveLogo} className="tap" style={{ background: "none", border: "none", padding: 0, color: C.red, opacity: 0.85, fontSize: "inherit", fontWeight: "inherit", cursor: "pointer" }}>Supprimer le logo</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
