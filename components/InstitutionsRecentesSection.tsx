"use client";

import Link from "next/link";
import { useState, useEffect, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { institutionsRecentes, retirerInstitutionRecente, type InstitutionRecente } from "@/lib/institutionsRecentes";
import Image from "next/image";

// Cartes-événement optionnelles affichées à la suite de la grille des
// établissements récemment consultés (retour Bryan 29/07/2026 — dépenses à
// venir). Format volontairement différent des tuiles logo/institution (qui
// n'ont de sens que pour un vrai logo carré) : une carte plus large,
// horizontale, avec assez de place pour un montant + un libellé + une
// échéance — un logo écrasé sur 50px n'aurait pas la place de rester lisible
// pour ce type de contenu (retour Bryan : "sa dois afficher en horizontal
// pas logo comme pour les institutions consultées"). Gérées par le parent
// (visibilité + retrait) car leur condition d'affichage dépend de données
// réelles hors du périmètre de ce composant. Chaque carte a son propre
// retrait (X sur l'une n'affecte pas les autres) ; la section entière
// disparaît seulement quand établissements récents ET cartes événement sont
// tous les deux vides.
export type TuileExtra = { key: string; href: string; icon: ReactNode; titre: string; sousTexte: string; accentColor: string; onDismiss: () => void };

// Établissements récemment consultés — façon Booking.com "Continue your
// search" (retour Bryan 25/07/2026). Grille de 5 par ligne (passe à une 2e
// ligne au-delà), X pour retirer un établissement — le revisiter le
// réinsère naturellement, pas de liste noire séparée à gérer.
// Extrait de app/page.tsx (26/07/2026) pour être réutilisé par
// app/compte/recherche/recherche-client.tsx sans dupliquer la logique.
// Titre "Votre exploration | Vos dépenses" (retour Bryan 29/07/2026) — les
// deux familles de contenu (établissements récents, dépenses à venir)
// partagent désormais une seule rangée de défilement horizontal, donc un
// seul titre couvrant les deux plutôt que "Continuez votre exploration" qui
// ne décrivait plus que la moitié du contenu.
export function InstitutionsRecentesSection({ isDark, t1, t2, card, brd, extraTiles }: { isDark: boolean; t1: string; t2: string; card: string; brd: string; extraTiles?: TuileExtra[] }) {
  const [items, setItems] = useState<InstitutionRecente[]>([]);
  const tuiles = extraTiles ?? [];

  // Lecture d'un système externe (localStorage, via institutionsRecentes())
  // au montage — même pattern justifié qu'app/recherche/shared.tsx.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setItems(institutionsRecentes()); }, []);

  if (items.length === 0 && tuiles.length === 0) return null;

  function handleRemove(e: ReactMouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setItems(retirerInstitutionRecente(id));
  }

  return (
    <div style={{ padding: "16px 16px 0" }}>
      <div style={{ color: t1, fontSize: "14px", fontWeight: "800", marginBottom: "10px" }}>Votre exploration | Vos dépenses</div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", overflowX: "auto", paddingBottom: "2px" }}>
        {items.map(inst => (
          <Link key={inst.id} href={`/institution/${inst.id}`} className="tap" style={{ textDecoration: "none", flexShrink: 0, width: "64px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            <button onClick={e => handleRemove(e, inst.id)} aria-label="Retirer" style={{ position: "absolute", top: "-4px", right: "2px", zIndex: 1, width: "18px", height: "18px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#fff", border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div style={{ width: "50px", height: "50px", position: "relative", borderRadius: "16px", overflow: "hidden", background: card, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "5px" }}>
              {inst.logo ? (
                <Image src={inst.logo} alt="" fill sizes="50px" style={{ objectFit: "cover" }}/>
              ) : (
                <span style={{ color: t2, fontSize: "15px", fontWeight: "900" }}>{inst.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <span style={{ color: t1, fontSize: "10px", fontWeight: "700", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "56px" }}>{inst.name}</span>
          </Link>
        ))}
        {tuiles.map(t => (
          <Link key={t.key} href={t.href} className="tap" style={{ textDecoration: "none", flexShrink: 0, width: "168px" }}>
            <div style={{ position: "relative", backgroundColor: card, borderRadius: "0px", padding: "12px 14px", border: `1px solid ${brd}` }}>
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); t.onDismiss(); }}
                aria-label="Retirer"
                style={{ position: "absolute", top: "8px", right: "8px", width: "18px", height: "18px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#fff", border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ marginBottom: "8px" }}>{t.icon}</div>
              <div style={{ color: t1, fontSize: "15px", fontWeight: "900", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: "18px" }}>{t.titre}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginTop: "3px" }}>
                <div style={{ color: t2, fontSize: "10.5px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sousTexte}</div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
