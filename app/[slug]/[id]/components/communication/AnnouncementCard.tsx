"use client";

// Carte d'annonce (refonte UI 20/10/2026) : vignette, contenu, métriques
// alignées et actions horizontales. Présentation pure — le menu « ⋯ »
// reprend les handlers existants de CommunicationTab (aucune logique
// ajoutée) ; « Programmer » appelle le même handler que « Modifier »,
// comme avant.
import Image from "next/image";
import type { ThemeTokens } from "../../theme";
import { TypeBadge, StatusBadge } from "./badges";
import { heureDepuisHorodatage } from "@/lib/heure";

export type AnnonceCarte = {
  id: string; titre: string; contenu: string; type: string; format: string;
  media_urls: string[] | null; date_expiration: string | null; date_publication: string | null; created_at: string;
  image_url: string | null; epingle: boolean; regions_cibles: string[] | null;
  portee: number; nb_vues: number; nb_likes: number; nb_commentaires: number; nb_partages: number;
};

const FORMAT_LABELS: Record<string, string> = { image: "Image", carrousel: "Carrousel", pdf: "PDF", video: "Vidéo" };

function fmt(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function fmtCompact(n: number): string {
  if (n >= 1000) { const v = n / 1000; return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`; }
  return String(n);
}

function IconFormat({ format, color }: { format: string; color: string }) {
  const p = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, "aria-hidden": true };
  if (format === "video") return <svg {...p}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
  if (format === "pdf") return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
  if (format === "carrousel") return <svg {...p}><rect x="2" y="6" width="14" height="14" rx="2"/><path d="M20 4v14"/></svg>;
  return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
}

function Vignette({ C, a }: { C: ThemeTokens; a: AnnonceCarte }) {
  const video = a.format === "video" ? a.media_urls?.[0] : null;
  return (
    <div style={{ position: "relative", width: "120px", height: "80px", borderRadius: "8px", overflow: "hidden", flexShrink: 0, backgroundColor: C.bg3, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {a.image_url ? (
        <Image src={a.image_url} fill sizes="120px" style={{ objectFit: "cover" }} alt=""/>
      ) : video ? (
        <video src={video} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline/>
      ) : (
        <IconFormat format={a.format} color={C.t3}/>
      )}
      {a.epingle && (
        <span style={{ position: "absolute", top: "6px", left: "6px", display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "11px", fontWeight: 600, padding: "2px 6px", borderRadius: "6px" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 3l5 5-3 1-3 4 1 4-2 2-4-4-6 6-1-1 6-6-4-4 2-2 4 1 4-3z"/></svg>
          Épinglée
        </span>
      )}
      {a.format === "carrousel" && (a.media_urls?.length ?? 0) > 1 && (
        <span style={{ position: "absolute", top: "6px", right: "6px", backgroundColor: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "11px", fontWeight: 600, padding: "2px 6px", borderRadius: "6px" }}>×{a.media_urls?.length}</span>
      )}
    </div>
  );
}

function BoutonIcone({ C, label, onClick, children, expanded }: { C: ThemeTokens; label: string; onClick: () => void; children: React.ReactNode; expanded?: boolean }) {
  return (
    <button
      onClick={onClick} aria-label={label} title={label} className="tap"
      aria-haspopup={expanded === undefined ? undefined : "menu"} aria-expanded={expanded}
      style={{ width: "32px", height: "32px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: "transparent", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
    >{children}</button>
  );
}

export function AnnouncementCard({ C, annonce: a, typeLabel, statut, canPublish, menuOpen, onToggleMenu, onCloseMenu, onVoir, onStats, onModifier, onDupliquer, onArchiver, onSupprimer }: {
  C: ThemeTokens; annonce: AnnonceCarte; typeLabel: string; statut: string; canPublish: boolean;
  menuOpen: boolean; onToggleMenu: () => void; onCloseMenu: () => void;
  onVoir: () => void; onStats: () => void; onModifier: () => void; onDupliquer: () => void; onArchiver: () => void; onSupprimer: () => void;
}) {
  const termine = statut === "terminee" || statut === "archivee";
  const urgentActive = a.type === "urgent" && statut === "publiee";
  const interactions = a.nb_likes + a.nb_commentaires + a.nb_partages;
  const meta = [
    FORMAT_LABELS[a.format] || a.format,
    a.date_publication
      ? `Publiée le ${fmt(a.date_publication)}, ${heureDepuisHorodatage(a.date_publication)}`
      : `Créée le ${fmt(a.created_at)}`,
    a.date_expiration ? `Expire le ${fmt(a.date_expiration)}` : null,
  ].filter((x): x is string => x !== null).join(" · ");

  const itemMenu = (couleur: string): React.CSSProperties => ({ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", color: couleur, fontSize: "13px", fontWeight: 500, cursor: "pointer" });

  return (
    <article
      className="com-card"
      style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-start", boxShadow: urgentActive ? `inset 3px 0 0 ${C.red}` : "none", animation: "fadeUp 0.2s ease" }}
    >
      <Vignette C={C} a={a}/>

      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
          <TypeBadge C={C} typeId={a.type} label={typeLabel}/>
          <StatusBadge C={C} statut={statut}/>
          {a.regions_cibles && a.regions_cibles.length > 0 && (
            <span style={{ color: C.t3, fontSize: "12px" }}>{a.regions_cibles.length} région{a.regions_cibles.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <h3 title={a.titre} style={{ color: termine ? C.t2 : C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 4px", lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.titre}</h3>
        <p style={{ color: C.t2, fontSize: "14px", margin: "0 0 6px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.contenu}</p>
        <p title={meta} style={{ color: C.t3, fontSize: "12px", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</p>
        {a.format === "pdf" && a.media_urls?.[0] && (
          <a href={a.media_urls[0]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", color: C.t2, fontSize: "12px", fontWeight: 600, marginTop: "6px" }}>Ouvrir le PDF</a>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "12px", marginLeft: "auto", position: "relative" }}>
        <div style={{ display: "flex", gap: "20px" }}>
          {[{ l: "Portée", v: a.portee }, { l: "Vues", v: a.nb_vues }, { l: "Interactions", v: interactions }].map(m => (
            <div key={m.l} style={{ textAlign: "right" }}>
              <div style={{ color: C.t1, fontSize: "16px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtCompact(m.v)}</div>
              <div style={{ color: C.t3, fontSize: "12px" }}>{m.l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "6px" }} onKeyDown={e => { if (e.key === "Escape") onCloseMenu(); }}>
          <BoutonIcone C={C} label="Voir l'annonce" onClick={onVoir}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </BoutonIcone>
          <BoutonIcone C={C} label="Statistiques de l'annonce" onClick={onStats}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </BoutonIcone>
          {canPublish && (
            <BoutonIcone C={C} label="Plus d'actions" onClick={onToggleMenu} expanded={menuOpen}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
            </BoutonIcone>
          )}
          {canPublish && menuOpen && (
            <>
              <div onClick={onCloseMenu} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
              <div role="menu" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 12px 32px rgba(0,0,0,0.2)", minWidth: "170px", overflow: "hidden" }}>
                <button role="menuitem" onClick={onModifier} className="tap" style={itemMenu(C.t1)}>Modifier</button>
                <button role="menuitem" onClick={onDupliquer} className="tap" style={itemMenu(C.t1)}>Dupliquer</button>
                <button role="menuitem" onClick={onModifier} className="tap" style={itemMenu(C.t1)}>Programmer</button>
                <button role="menuitem" onClick={onArchiver} className="tap" style={itemMenu(C.t1)}>Archiver</button>
                <div style={{ height: "1px", backgroundColor: C.border }}/>
                <button role="menuitem" onClick={onSupprimer} className="tap" style={itemMenu(C.red)}>Supprimer</button>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
