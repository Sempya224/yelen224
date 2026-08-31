"use client";

// Panneau détail d'une offre partenaire (onglet "Offres" de app/page.tsx).
// Refonte niveau US (26/07/2026, référence MoneyLion) : carte de faits,
// preuve sociale honnête (nb_clics réel, jamais inventé), onglets
// Avantages/Limites, description en puces, CTA sticky.
// Passé en overlay plein écran avec header + X (retour Bryan 26/07/2026 :
// même convention que les autres pop du header — CompteRechercheOverlay,
// CitoyenMenu, NotifPanel — plutôt qu'un bottom sheet façon Anthropic).
//
// L'interstitiel "Un instant, direction {partenaire}" (26/07/2026) NE vit
// PAS ici : une première version le montrait dans cet onglet-ci pendant un
// délai avant d'ouvrir un nouvel onglet — bug constaté par Bryan, sur
// mobile l'ouverture d'un nouvel onglet (même vide) fait basculer le focus
// immédiatement, donc l'utilisateur ne voit jamais l'écran affiché dans
// l'onglet qu'il vient de quitter. L'interstitiel est donc rendu
// côté serveur DANS la page de destination elle-même
// (app/api/offres/[id]/clic/route.ts), qui s'ouvre directement au clic
// (geste utilisateur synchrone, jamais bloqué) et ne redirige vers le site
// tiers réel qu'après son propre délai de 3s.
//
// OffreFicheContenu extrait le 02/08/2026 (chantier "Centre de pilotage
// des offres") pour être réutilisé tel quel dans l'aperçu smartphone en
// direct du formulaire de création/édition d'offre
// (MesOffresTab.tsx::draftOffre, visible uniquement dans le pop plein
// écran de création — jamais sur l'écran principal) — zéro changement
// visuel côté citoyen, ce fichier reste un thin wrapper (position fixe + header +
// bouton fermer) autour du contenu.
import { useState } from "react";
import Image from "next/image";
import { OFFRE_GENRE_LABELS, OFFRE_GENRE_COULEURS, type OffreGenre } from "@/lib/offresCategories";

export type Fait = { label: string; valeur: string };
export type Offre = {
  id: string;
  titre: string;
  description_courte: string;
  description_longue: string;
  categorie: string;
  genre: string;
  partenaire_nom: string;
  partenaire_logo: string | null;
  image_url?: string | null;
  cta_label: string | null;
  cta_url: string | null;
  date_expiration?: string | null;
  nb_clics?: number;
  faits?: Fait[];
  avantages?: string[];
  limites?: string[];
  // Avis réels de l'établissement (institutions.moyenne_avis/nb_avis) —
  // affiché après le nom, jamais si nb_avis = 0.
  institutions?: { moyenne_avis: number | null; nb_avis: number | null } | null;
};

export function OffreFicheContenu({
  offre, isDark, card, t1, t2, t3, brd, populaire,
}: {
  offre: Offre;
  isDark: boolean;
  card: string;
  t1: string;
  t2: string;
  t3: string;
  brd: string;
  populaire: boolean;
}) {
  const [tab, setTab] = useState<"avantages" | "limites">("avantages");
  const faits = offre.faits || [];
  const avantages = offre.avantages || [];
  const limites = offre.limites || [];
  const hasProsCons = avantages.length > 0 || limites.length > 0;
  const descriptionLines = offre.description_longue.split("\n").map(l => l.trim()).filter(Boolean);
  const nbAvis = offre.institutions?.nb_avis || 0;
  const moyenneAvis = offre.institutions?.moyenne_avis || 0;
  const hasAvis = nbAvis > 0;

  return (
    <>
      <main style={{ flex: 1, overflowY: "auto", padding: "16px 20px 16px", width: "100%", maxWidth: "640px", margin: "0 auto", boxSizing: "border-box" }}>
          {/* Photo de l'offre — retour Bryan 04/08/2026 : sans image
              réelle, l'aperçu reste toujours générique peu importe le
              soin apporté au reste ; absente si l'institution n'a rien
              uploadé (aucune régression pour les offres existantes). */}
          {offre.image_url && (
            <div style={{ width: "100%", height: "180px", position: "relative", borderRadius: "16px", overflow: "hidden", marginBottom: "14px" }}>
              <Image src={offre.image_url} alt="" fill sizes="(min-width: 640px) 640px, 100vw" priority style={{ objectFit: "cover" }}/>
            </div>
          )}
          {/* Genre d'offre — badge coloré façon app US */}
          {OFFRE_GENRE_COULEURS[offre.genre as OffreGenre] && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "inline-block", background: OFFRE_GENRE_COULEURS[offre.genre as OffreGenre].bg, color: OFFRE_GENRE_COULEURS[offre.genre as OffreGenre].texte, fontSize: "10.5px", fontWeight: 800, padding: "4px 11px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {OFFRE_GENRE_LABELS[offre.genre as OffreGenre] || offre.genre}
              </span>
            </div>
          )}
          {/* En-tête partenaire */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
            <div style={{ width: "48px", height: "48px", position: "relative", borderRadius: "13px", flexShrink: 0, overflow: "hidden", background: isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {offre.partenaire_logo ? (
                <Image src={offre.partenaire_logo} alt={offre.partenaire_nom} fill sizes="48px" style={{ objectFit: "cover" }}/>
              ) : (
                <span style={{ color: "#F5A623", fontWeight: 900, fontSize: "16px" }}>{offre.partenaire_nom.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: t1, fontSize: "13px", fontWeight: 800 }}>{offre.partenaire_nom}</span>
                {hasAvis && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: t2, fontSize: "12px", fontWeight: 700 }}>
                    <span style={{ color: "#F5A623" }}>★</span>{moyenneAvis.toFixed(1)}
                    <span style={{ color: t3 }}>({nbAvis} avis)</span>
                  </span>
                )}
              </div>
              <div style={{ color: t1, fontSize: "19px", fontWeight: 900, lineHeight: 1.2, letterSpacing: "-0.3px", marginTop: "2px" }}>{offre.titre}</div>
            </div>
          </div>

          {/* Carte de faits */}
          <div style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px", marginBottom: "14px" }}>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>{offre.description_courte}</div>
            {faits.length > 0 && (
              <>
                <div style={{ height: "1px", background: brd, margin: "14px 0 12px" }}/>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {faits.map((f, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                      <span style={{ color: t2, fontSize: "13px" }}>{f.label}</span>
                      <span style={{ color: t1, fontSize: "13px", fontWeight: 800 }}>{f.valeur}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Preuve sociale — badge qualitatif plutôt que le nombre brut de
              clics (retour Bryan 26/07/2026) : "populaire" reflète le
              classement réel de l'offre parmi les plus consultées (même
              critère que la section "Offres populaires" du feed), jamais un
              chiffre inventé. */}
          {populaire && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.1)", color: "#F5A623", fontSize: "11px", fontWeight: 800, padding: "6px 12px", borderRadius: "20px", marginBottom: "14px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#F5A623"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Offre populaire
            </div>
          )}

          {/* Onglets Avantages / Limites */}
          {hasProsCons && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", borderBottom: `1px solid ${brd}`, marginBottom: "12px" }}>
                {(["avantages", "limites"] as const).map(k => (
                  (k === "avantages" ? avantages.length > 0 : limites.length > 0) && (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className="tap"
                      style={{
                        flex: 1, padding: "10px 0", background: "none", border: "none",
                        borderBottom: tab === k ? "2px solid #F5A623" : "2px solid transparent",
                        color: tab === k ? t1 : t2, fontWeight: tab === k ? 800 : 600, fontSize: "13.5px", cursor: "pointer",
                      }}
                    >
                      {k === "avantages" ? "Avantages" : "Limites"}
                    </button>
                  )
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(tab === "avantages" ? avantages : limites).map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    {tab === "avantages" ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" style={{ marginTop: "2px", flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" style={{ marginTop: "2px", flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    )}
                    <span style={{ color: t2, fontSize: "13px", lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description de l'offre */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "8px" }}>Description de l&apos;offre</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {descriptionLines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: "8px" }}>
                  <span style={{ color: "#F5A623" }}>•</span>
                  <span style={{ color: t2, fontSize: "13px", lineHeight: 1.6 }}>{line}</span>
                </div>
              ))}
            </div>
          </div>

          {offre.date_expiration && (
            <div style={{ color: t2, fontSize: "12px", marginBottom: "10px" }}>
              Offre valable jusqu&apos;au {new Date(offre.date_expiration).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
            </div>
          )}

          <div style={{ color: t2, fontSize: "11.5px", lineHeight: 1.6 }}>
            Offre vérifiée par Yelen avant publication. En continuant, vous quittez Yelen pour le site de {offre.partenaire_nom}.
          </div>
      </main>

      {/* CTA sticky — ouvre directement /api/offres/[id]/clic dans un nouvel
          onglet (geste utilisateur synchrone, jamais bloqué) ; l'interstitiel
          "Un instant, direction {partenaire}" vit dans cette page de
          destination elle-même, pas ici. */}
      {offre.cta_url && (
        <div style={{ padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", borderTop: `1px solid ${brd}`, background: card, flexShrink: 0 }}>
          <a
            href={`/api/offres/${offre.id}/clic`}
            target="_blank"
            rel="noopener noreferrer"
            className="tap"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              width: "100%", padding: "14px", borderRadius: "14px", textDecoration: "none", boxSizing: "border-box",
              background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812",
              fontWeight: 800, fontSize: "14px", boxShadow: "0 3px 10px rgba(245,166,35,0.2)",
            }}
          >
            {offre.cta_label || "Accéder à l'offre"}
          </a>
        </div>
      )}
    </>
  );
}

export default function OffreFicheOverlay({
  offre, onClose, isDark, bg, card, card2, t1, t2, t3, brd, populaire,
}: {
  offre: Offre;
  onClose: () => void;
  isDark: boolean;
  bg: string;
  card: string;
  card2: string;
  t1: string;
  t2: string;
  t3: string;
  brd: string;
  populaire: boolean;
}) {
  return (
    <div
      className="offre-fiche-overlay"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: bg, display: "flex", flexDirection: "column",
        animation: "offreFicheFadeIn 0.2s ease",
      }}
    >
      <style>{`@keyframes offreFicheFadeIn{from{opacity:0}to{opacity:1}}`}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", flexShrink: 0 }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <span />
          <div style={{ color: t1, fontSize: "16px", fontWeight: 800, textAlign: "center" }}>Offre</div>
          <button
            onClick={onClose}
            className="tap"
            aria-label="Fermer"
            style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </header>

      <OffreFicheContenu offre={offre} isDark={isDark} card={card} t1={t1} t2={t2} t3={t3} brd={brd} populaire={populaire}/>
    </div>
  );
}
