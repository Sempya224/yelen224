"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen, ScrollPositionBarConteneur } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";
import { YelenLoader } from "@/components/YelenLoader";
import { ACTIVITE_CATEGORIE_SHORT, ACTIVITE_CATEGORIE_COLORS, ActiviteCategorieVisuel } from "@/lib/activiteVisuels";

// "Mes projets" — Lot 1 (brief CEO 27/09/2026, voir CLAUDE.md pour le
// contexte complet). Inspiré de la logique produit Yelp Projects (actif /
// planifié / archivé) sans en reprendre le visuel. Conteneur distinct de
// "Mes démarches" (app/compte/mes-demarches) — décision explicite de
// Bryan : pas de fusion pour l'instant. Même patron d'écriture directe
// Supabase sous RLS auth.uid()=citoyen_id (voir migration
// 20260927000001_citoyen_projets.sql), aucune route API dédiée.
//
// `secteur` réutilise depuis le 27/09/2026 les 15 `activite_categories`
// (lib/activiteVisuels.tsx, mêmes catégories que l'écran Recherche) —
// PAS les 9 `SECTEURS` institution de lib/institutionTaxonomy.tsx utilisés
// initialement. Revirement explicite de Bryan une fois les vraies "15
// catégories" retrouvées (migration 20260927000002).

export type StatutProjet = "a_preparer" | "planifie" | "en_cours" | "en_attente" | "termine" | "archive";
export type EtapeProjet = { id: string; libelle: string; date_echeance: string | null; fait: boolean; ordre: number };
// ACTIVITE_CATEGORIE_SHORT est typé Record<string,string> (codes chargés
// depuis activite_categories en base ailleurs dans le produit) — pas de
// union littérale possible ici, même traitement que `cat.code` dans
// app/recherche/RechercheInner.tsx.
export type CategorieId = string;
// Lot 2 (migration 20260928000001) — section "Informations" de la fiche
// détail. Même échelle que citoyen_demarches.priorite : 'normale' est le
// défaut silencieux, jamais affiché sur les cartes. besoin/lieu en texte
// libre, alimentés notamment par "Yelen vous accompagne"
// (app/menu/projets/accompagnement) mais éditables pour tout projet.
export type Priorite = "faible" | "normale" | "importante" | "urgente";
export const PRIORITE_LABEL: Record<Priorite, string> = { faible: "Faible", normale: "Normale", importante: "Importante", urgente: "Urgente" };
// Lot 3 (migration 20260928000002) — libellés du journal
// citoyen_projet_historique, même patron que citoyen_demarche_historique.
export const HISTORIQUE_LABEL: Record<string, string> = { creation: "Créé", terminee: "Terminé", reouverte: "Rouvert", archivee: "Archivé", modifiee: "Modifié" };
export type Projet = {
  id: string; titre: string; description: string | null; secteur: CategorieId | null;
  statut: StatutProjet; date_cible: string | null; created_at: string; mis_a_jour_le: string; termine_le: string | null;
  priorite: Priorite; besoin: string | null; lieu: string | null;
  etapes: EtapeProjet[];
};

export const STATUT_LABEL: Record<StatutProjet, string> = {
  a_preparer: "À préparer", planifie: "Planifié", en_cours: "En cours",
  en_attente: "En attente", termine: "Terminé", archive: "Archivé",
};

type Ton = "neutral" | "orange" | "green" | "red" | "blue";
export const STATUT_TON: Record<StatutProjet, Ton> = {
  a_preparer: "neutral", planifie: "neutral", en_cours: "blue",
  en_attente: "orange", termine: "green", archive: "neutral",
};

export function Pill({ children, ton, isDark }: { children: React.ReactNode; ton: Ton; isDark: boolean }) {
  const map: Record<Ton, { bg: string; fg: string }> = {
    neutral: { bg: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", fg: isDark ? "#8E8E93" : "#6C6C70" },
    orange:  { bg: "rgba(245,166,35,0.12)", fg: "#F5A623" },
    green:   { bg: "rgba(34,197,94,0.12)",  fg: "#22c55e" },
    red:     { bg: "rgba(239,68,68,0.12)",  fg: "#ef4444" },
    blue:    { bg: "rgba(59,130,246,0.1)",  fg: "#3b82f6" },
  };
  const c = map[ton];
  return <span style={{ color: c.fg, background: c.bg, fontSize: "10.5px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", display: "inline-block", flexShrink: 0 }}>{children}</span>;
}

export function formatDateCourt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateRelatif(iso: string): string {
  const d = new Date(iso);
  const jourD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const jourNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffJours = Math.round((jourNow - jourD) / 86400000);
  if (diffJours === 0) return "Aujourd'hui";
  if (diffJours === 1) return "Hier";
  return formatDateCourt(iso) ?? "";
}

// Annotation sous le sélecteur de date cible (retour Bryan : "Dans 3
// jours" plutôt qu'une zone vide sans confirmation visuelle). Distincte de
// formatDateRelatif ci-dessus (orientée passé — mis_a_jour_le) : ici
// toujours une échéance à venir ou aujourd'hui/hier si dépassée.
function relatifDateCible(iso: string): string {
  const d = new Date(iso);
  const jourD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const jourNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffJours = Math.round((jourD - jourNow) / 86400000);
  if (diffJours === 0) return "Aujourd'hui";
  if (diffJours === 1) return "Demain";
  if (diffJours === -1) return "Hier";
  if (diffJours > 1 && diffJours <= 30) return `Dans ${diffJours} jours`;
  if (diffJours < -1) return `Il y a ${Math.abs(diffJours)} jours`;
  return formatDateCourt(iso) ?? "";
}

// Carte projet — Yelen choisit ce qui est le plus utile selon le statut
// (brief CEO 28/09/2026) plutôt que d'afficher les mêmes champs pour tous
// les projets : la carte doit répondre à "où en est ce projet et qu'est-ce
// qui se passe ensuite ?" sans obliger l'ouverture du projet.
type BlocChamp = { label: string; value: string };
type ContenuCarte = { blocs: BlocChamp[]; note?: string; meta?: string; barre?: { texte: string; fait: number; total: number; caption: string } };

function champsProjet(p: Projet): ContenuCarte {
  const total = p.etapes.length;
  const fait = p.etapes.filter((e) => e.fait).length;
  const prochaine = p.etapes.filter((e) => !e.fait).sort((a, b) => a.ordre - b.ordre)[0]?.libelle ?? null;

  if (p.statut === "termine") {
    const dateFin = p.termine_le ?? p.date_cible;
    return {
      blocs: dateFin ? [{ label: "Terminé le", value: formatDateCourt(dateFin)! }] : [],
      barre: total > 0 ? { texte: `${fait} / ${total} étape${total > 1 ? "s" : ""} terminée${total > 1 ? "s" : ""}`, fait, total, caption: "Terminé" } : undefined,
    };
  }
  if (p.statut === "en_cours") {
    const blocs: BlocChamp[] = [];
    if (prochaine) blocs.push({ label: "Prochaine étape", value: prochaine });
    if (p.date_cible) blocs.push({ label: "Échéance", value: formatDateCourt(p.date_cible)! });
    return {
      blocs,
      barre: total > 0 ? { texte: `${fait} / ${total} étape${total > 1 ? "s" : ""}`, fait, total, caption: `${Math.round((fait / total) * 100)} %` } : undefined,
    };
  }
  if (p.statut === "en_attente") {
    return {
      blocs: [],
      note: p.besoin ? `En attente de ${p.besoin}` : "En attente de réponse",
      meta: `Dernière mise à jour · ${formatDateRelatif(p.mis_a_jour_le)}`,
    };
  }
  if (p.statut === "planifie") {
    const blocs: BlocChamp[] = [];
    if (p.date_cible) blocs.push({ label: "Date cible", value: formatDateCourt(p.date_cible)! });
    if (prochaine) blocs.push({ label: "Prochaine étape", value: prochaine });
    return { blocs };
  }
  if (p.statut === "archive") {
    return { blocs: [], meta: `Mis à jour le ${formatDateCourt(p.mis_a_jour_le)}` };
  }
  // a_preparer
  const blocs: BlocChamp[] = [];
  if (prochaine) blocs.push({ label: "Prochaine étape", value: prochaine });
  return { blocs, note: total > 0 ? `${total} étape${total > 1 ? "s" : ""} prévue${total > 1 ? "s" : ""}` : undefined };
}

const P = { pointerEvents: "none" as const };
const Ic = {
  Plus:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  X:        () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chev:     () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>,
  Calendar: () => <svg style={P} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Sparkle:  () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m14.5 9.5-2 5-5 2 2-5 5-2Z"/></svg>,
};

// Carte projet — même gabarit compact que DemarcheCarte
// (app/compte/mes-demarches/mes-demarches-client.tsx) : accent minimal,
// progression, prochaine étape.
const STATUT_TEXTE_COLOR: Record<Ton, string> = { neutral: "#8E8E93", orange: "#F5A623", green: "#22c55e", red: "#ef4444", blue: "#3b82f6" };

export function ProjetCarte({ p, isDark, card, brd, t1, t2, t3, ombreCard, onOpen }: {
  p: Projet; isDark: boolean; card: string; brd: string; t1: string; t2: string; t3: string; ombreCard: string;
  onOpen: (p: Projet) => void;
}) {
  const secteurLabel = p.secteur ? ACTIVITE_CATEGORIE_SHORT[p.secteur] ?? null : null;
  const c = champsProjet(p);
  const rien = c.blocs.length === 0 && !c.note && !c.barre;
  return (
    <div className="tap" onClick={() => onOpen(p)} style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "14px 15px", boxShadow: ombreCard, cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "2px" }}>
          {(p.priorite === "urgente" || p.priorite === "importante") && (
            <span title={PRIORITE_LABEL[p.priorite]} style={{ width: "7px", height: "7px", borderRadius: "50%", background: p.priorite === "urgente" ? "#ef4444" : "#F5A623", flexShrink: 0, marginTop: "6px" }}/>
          )}
          <div style={{ color: t1, fontSize: "14.5px", fontWeight: 800, lineHeight: 1.3, minWidth: 0 }}>{p.titre}</div>
        </div>
        <div style={{ color: t2, fontSize: "11.5px", fontWeight: 600, marginBottom: "9px" }}>
          {secteurLabel && <>{secteurLabel} · </>}
          <span style={{ color: STATUT_TEXTE_COLOR[STATUT_TON[p.statut]], fontWeight: 700 }}>{STATUT_LABEL[p.statut]}</span>
        </div>

        {c.blocs.map((b, i) => (
          <div key={i} style={{ marginBottom: "7px" }}>
            <div style={{ color: t3, fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: "1px" }}>{b.label}</div>
            <div style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>{b.value}</div>
          </div>
        ))}

        {c.note && <div style={{ color: t1, fontSize: "12.5px", fontWeight: 600, marginBottom: c.meta || c.barre ? "4px" : 0 }}>{c.note}</div>}
        {c.meta && <div style={{ color: t3, fontSize: "11px" }}>{c.meta}</div>}

        {c.barre && (
          <div>
            <div style={{ color: t2, fontSize: "11px", marginBottom: "5px" }}>{c.barre.texte}</div>
            <div style={{ height: "5px", borderRadius: "3px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "5px" }}>
              <div style={{ height: "100%", width: `${(c.barre.fait / c.barre.total) * 100}%`, background: "#F5A623", borderRadius: "3px" }}/>
            </div>
            <div style={{ color: t2, fontSize: "11px", fontWeight: 700 }}>{c.barre.caption}</div>
          </div>
        )}

        {rien && <div style={{ color: t3, fontSize: "11.5px" }}>Créé le {formatDateCourt(p.created_at)}</div>}
      </div>
      <span style={{ color: t3, flexShrink: 0, transform: "rotate(-90deg)" }}><Ic.Chev/></span>
    </div>
  );
}

export function IllustrationProjetVide({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="50" r="34" fill="rgba(245,166,35,0.1)"/>
      <path d="M28 34a6 6 0 0 1 6-6h16l6 6h6a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V34Z" fill="#F5A623" stroke="#C8940A" strokeWidth="2.5"/>
      <path d="M38 54l6 6 12-13" stroke="#080812" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Bottom Sheet d'aide contextuelle — écran "Nouveau projet" uniquement
// (retour Bryan). Rôle strictement distinct de "Laisser Yelen m'aider" :
// celui-ci explique comment créer un projet (contenu statique), l'autre
// construit réellement le projet (parcours d'orientation). Le CTA "Demander
// l'aide de Yelen" ferme donc le sheet puis relaie vers ce même parcours
// plutôt que d'ouvrir un 2e workflow depuis le sheet.
function AideProjetSheet({ isDark, onFermer, onDemanderAide }: {
  isDark: boolean; onFermer: () => void; onDemanderAide: () => void;
}) {
  const bg  = isDark ? "#0A0A0F" : "#F2F2F7";
  const t1  = isDark ? "#FFFFFF" : "#000000";
  const t2  = isDark ? "#8E8E93" : "#6C6C70";
  const t3  = isDark ? "#636366" : "#AEAEB2";
  const brd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const exemples = ["Renouveler mon passeport", "Préparer un voyage", "Trouver un logement", "Organiser un événement", "Préparer une démarche administrative"];
  const etapesGuide = [
    { n: "①", titre: "Donnez-lui un titre", texte: "Écrivez simplement ce que vous souhaitez accomplir." },
    { n: "②", titre: "Ajoutez ce que vous savez", texte: "La catégorie, une date cible ou un résumé peuvent aider Yelen à mieux comprendre votre projet." },
    { n: "③", titre: "Commencez simplement", texte: "Vous n'avez pas besoin de connaître toutes les étapes. Vous pourrez les ajouter plus tard ou demander à Yelen de vous aider." },
  ];
  const conseils = [
    { titre: "Un bon projet commence simplement", texte: "Vous n'avez pas besoin de tout remplir maintenant." },
    { titre: "Une étape = une action", texte: "Exemple : « Réunir mes documents », « Prendre rendez-vous », « Déposer ma demande »." },
    { titre: "La date cible est facultative", texte: "Ajoutez-la seulement si vous avez une échéance." },
    { titre: "Votre projet peut évoluer", texte: "Vous pourrez modifier les informations et ajouter des étapes depuis les détails du projet." },
  ];
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`@keyframes mpAideUp{from{transform:translateY(16px);opacity:0.6}to{transform:translateY(0);opacity:1}}`}</style>
      <div onClick={onFermer} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}/>
      <div style={{ position: "relative", width: "100%", maxHeight: "88svh", display: "flex", flexDirection: "column", background: bg, borderRadius: "22px 22px 0 0", animation: "mpAideUp 0.22s ease", boxShadow: "0 -8px 30px rgba(0,0,0,0.25)" }}>
        <ScrollPositionBarConteneur isDark={isDark} conteneurRef={scrollRef}/>

        <div style={{ padding: "10px 20px 0", flexShrink: 0 }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: t3, opacity: 0.5, margin: "0 auto 14px" }}/>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800 }}>Comment créer un projet ?</div>
            <button onClick={onFermer} className="tap" aria-label="Fermer" style={{ width: "30px", height: "30px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#EBEBF0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
          <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "6px" }}>Un projet, c&apos;est quoi ?</div>
          <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.55, marginBottom: "10px" }}>
            Un projet vous aide à organiser quelque chose que vous souhaitez accomplir, étape par étape, avec Yelen.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "22px" }}>
            {exemples.map((ex) => (
              <div key={ex} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: t3, flexShrink: 0 }}/>
                <span style={{ color: t2, fontSize: "12.5px" }}>{ex}</span>
              </div>
            ))}
          </div>

          <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "12px" }}>Que dois-je renseigner ?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "22px" }}>
            {etapesGuide.map((e) => (
              <div key={e.n} style={{ display: "flex", gap: "10px" }}>
                <span style={{ color: "#F5A623", fontSize: "15px", fontWeight: 800, flexShrink: 0 }}>{e.n}</span>
                <div>
                  <div style={{ color: t1, fontSize: "13px", fontWeight: 700, marginBottom: "2px" }}>{e.titre}</div>
                  <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5 }}>{e.texte}</div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={onDemanderAide} className="tap" style={{ width: "100%", textAlign: "left", background: isDark ? "linear-gradient(135deg, rgba(245,166,35,0.14), rgba(245,166,35,0.03))" : "linear-gradient(135deg, rgba(245,166,35,0.08), rgba(245,166,35,0.015))", border: `1px solid ${isDark ? "rgba(245,166,35,0.22)" : "rgba(245,166,35,0.18)"}`, borderRadius: "16px", padding: "16px", marginBottom: "22px", cursor: "pointer" }}>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "6px", display: "flex", alignItems: "center", gap: "7px" }}><Ic.Sparkle/> Vous ne savez pas par où commencer ?</div>
            <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5, marginBottom: "12px" }}>
              Ce n&apos;est pas grave. Créez simplement votre projet avec ce que vous savez déjà — Yelen pourra ensuite vous aider à identifier les prochaines étapes et vous orienter vers les bons professionnels.
            </div>
            <div style={{ color: "#F5A623", fontSize: "12.5px", fontWeight: 800, display: "flex", alignItems: "center", gap: "5px" }}>
              Demander l&apos;aide de Yelen
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
            </div>
          </button>

          <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "12px" }}>Quelques conseils</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "10px" }}>
            {conseils.map((c) => (
              <div key={c.titre}>
                <div style={{ color: t1, fontSize: "12.5px", fontWeight: 700, marginBottom: "2px" }}>{c.titre}</div>
                <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5 }}>{c.texte}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${brd}`, padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", background: bg }}>
          <button onClick={onFermer} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "14px", border: "none", background: "#F5A623", color: "#080812", fontSize: "13.5px", fontWeight: 800, cursor: "pointer" }}>J&apos;ai compris</button>
        </div>
      </div>
    </div>
  );
}

function ProjetsClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombreCard = isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [projets, setProjets] = useState<Projet[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [aideOuverte, setAideOuverte] = useState(false);
  const creationScrollRef = useRef<HTMLDivElement>(null);
  // Carte "Yelen vous accompagne" — une suggestion, pas un élément fixe de
  // l'écran (retour Bryan 28/09/2026) : ignorable via X, mémorisé en
  // localStorage (try/catch, peut échouer en navigation privée — fail-open,
  // la carte reste alors visible plutôt que de casser silencieusement).
  const [accompagnementCarteVisible, setAccompagnementCarteVisible] = useState(false);

  const [creationOuverte, setCreationOuverte] = useState(false);
  const [titreForm, setTitreForm] = useState("");
  const [descriptionForm, setDescriptionForm] = useState("");
  const [secteurForm, setSecteurForm] = useState<CategorieId | null>(null);
  const [dateCibleForm, setDateCibleForm] = useState("");
  // Besoin/lieu/priorité (Lot 2) — pas de champ dédié dans le formulaire de
  // création manuelle (déjà 4 champs + étapes, cf. principe de sobriété) :
  // uniquement alimentés en relais depuis "Yelen vous accompagne"
  // (?besoin=&lieu=&priorite=), éditables ensuite depuis la fiche détail.
  const [besoinForm, setBesoinForm] = useState<string | null>(null);
  const [lieuForm, setLieuForm] = useState<string | null>(null);
  const [prioriteForm, setPrioriteForm] = useState<Priorite>("normale");
  const [etapesForm, setEtapesForm] = useState<{ libelle: string; date_echeance: string }[]>([]);
  const [etapeLibelleDraft, setEtapeLibelleDraft] = useState("");
  const [etapeDateDraft, setEtapeDateDraft] = useState("");
  const [creating, setCreating] = useState(false);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setCitoyenId(session.user.id);
    const { data, error } = await supabase
      .from("citoyen_projets")
      .select("*, etapes:citoyen_projet_etapes(*)")
      .eq("citoyen_id", session.user.id)
      .order("mis_a_jour_le", { ascending: false });
    if (error) { showToast("Impossible de charger vos projets.", "error"); return; }
    setProjets(((data ?? []) as unknown as Projet[]).map((p) => ({ ...p, etapes: [...p.etapes].sort((a, b) => a.ordre - b.ordre) })));
  }, []);

  useEffect(() => {
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
    try { setAccompagnementCarteVisible(localStorage.getItem("yelen224_projets_accompagnement_carte_ignoree") !== "1"); }
    catch { setAccompagnementCarteVisible(true); }
  }, [charger]);

  function ignorerCarteAccompagnement() {
    setAccompagnementCarteVisible(false);
    try { localStorage.setItem("yelen224_projets_accompagnement_carte_ignoree", "1"); } catch { /* ignore */ }
  }

  function fermerCreation() {
    setCreationOuverte(false);
    setTitreForm(""); setDescriptionForm(""); setSecteurForm(null); setDateCibleForm("");
    setBesoinForm(null); setLieuForm(null); setPrioriteForm("normale");
    setEtapesForm([]); setEtapeLibelleDraft(""); setEtapeDateDraft("");
  }

  function ouvrirCreationDepuisSecteur(secteur: CategorieId) {
    setSecteurForm(secteur);
    setCreationOuverte(true);
  }

  // Relais depuis l'écran "Catégories" (app/menu/projets/categories) et
  // depuis le parcours "Yelen vous accompagne" (app/menu/projets/accompagnement,
  // action "Organiser ce besoin dans Mes projets") : un secteur (+
  // éventuellement un titre déjà rédigé) reviennent ici via
  // `?secteur=&titre=` plutôt que de dupliquer le formulaire de création
  // sur un 2e/3e écran. `router.replace` nettoie l'URL pour ne pas
  // rouvrir la création au retour arrière.
  useEffect(() => {
    const secteur = searchParams.get("secteur");
    if (secteur && secteur in ACTIVITE_CATEGORIE_SHORT) {
      setSecteurForm(secteur);
      const titre = searchParams.get("titre");
      if (titre) setTitreForm(titre);
      const description = searchParams.get("description");
      if (description) setDescriptionForm(description);
      const besoin = searchParams.get("besoin");
      if (besoin) setBesoinForm(besoin);
      const lieu = searchParams.get("lieu");
      if (lieu) setLieuForm(lieu);
      const priorite = searchParams.get("priorite");
      if (priorite === "faible" || priorite === "normale" || priorite === "importante" || priorite === "urgente") setPrioriteForm(priorite);
      setCreationOuverte(true);
      router.replace("/menu/projets");
      return;
    }
    // Relais depuis "Tous les projets" (bouton "+ Nouveau", refonte
    // 28/09/2026) — cet écran de consultation/filtrage ne duplique pas le
    // formulaire de création, il renvoie ici avec `?nouveau=1`.
    if (searchParams.get("nouveau") === "1") {
      setCreationOuverte(true);
      router.replace("/menu/projets");
    }
  }, [searchParams, router]);

  function ajouterEtapeDraft() {
    if (!etapeLibelleDraft.trim()) return;
    setEtapesForm((prev) => [...prev, { libelle: etapeLibelleDraft.trim(), date_echeance: etapeDateDraft }]);
    setEtapeLibelleDraft(""); setEtapeDateDraft("");
  }

  async function handleCreerProjet() {
    if (!titreForm.trim() || !citoyenId) return;
    setCreating(true);
    const { data: nouveau, error } = await supabase
      .from("citoyen_projets")
      .insert({ citoyen_id: citoyenId, titre: titreForm.trim(), description: descriptionForm.trim() || null, secteur: secteurForm, date_cible: dateCibleForm || null, besoin: besoinForm, lieu: lieuForm, priorite: prioriteForm })
      .select()
      .single();
    if (error || !nouveau) { setCreating(false); showToast("Impossible de créer le projet.", "error"); return; }
    if (etapesForm.length > 0) {
      const rows = etapesForm.map((e, idx) => ({
        projet_id: nouveau.id, citoyen_id: citoyenId, libelle: e.libelle, date_echeance: e.date_echeance || null, ordre: idx,
      }));
      const { error: errEtapes } = await supabase.from("citoyen_projet_etapes").insert(rows);
      if (errEtapes) showToast("Projet créé, mais certaines étapes n'ont pas pu être enregistrées.", "error");
    }
    setCreating(false);
    fermerCreation();
    await charger();
    showToast("Projet créé.");
    // Fire-and-forget, même discipline que citoyen_demarche_historique
    // (mes-demarches-client.tsx::journaliser) : un échec ici est sans
    // conséquence pour la création réelle, juste sa trace dans l'Activité.
    void supabase.from("citoyen_projet_historique").insert({ projet_id: nouveau.id, citoyen_id: citoyenId, evenement: "creation", detail: "Projet créé." });
    router.push(`/menu/projets/${nouveau.id}`);
  }

  const listeAffichee = projets ?? [];
  const aContinuer = (projets ?? [])
    .filter((p) => p.statut !== "termine" && p.statut !== "archive")
    .sort((a, b) => b.mis_a_jour_le.localeCompare(a.mis_a_jour_le))[0] ?? null;

  const inputStyle: React.CSSProperties = { width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: inputBg, color: t1, fontSize: "15px", fontWeight: 600, boxSizing: "border-box" };
  const plainInputStyle: React.CSSProperties = { width: "100%", border: "none", outline: "none", background: "transparent", padding: "14px 16px", color: t1, fontSize: "15px", fontFamily: "inherit" };
  // Titre = donnée n°1 de l'écran (retour Bryan) : champ visuellement plus
  // important que Résumé/Catégorie/Date cible, pas le même gabarit.
  const inputTitreStyle: React.CSSProperties = { width: "100%", padding: "16px 18px", borderRadius: "16px", border: "none", backgroundColor: inputBg, color: t1, fontSize: "17px", fontWeight: 700, boxSizing: "border-box" };
  // "Facultatif" en léger plutôt que "(optionnel)" à la même graisse que le
  // libellé (retour Bryan : hiérarchie claire obligatoire/facultatif).
  function champLabel(label: string, facultatif: boolean) {
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "18px 0 8px" }}>
        <span style={{ color: t2, fontSize: "12px", fontWeight: 700 }}>{label}</span>
        {facultatif
          ? <span style={{ color: t3, fontSize: "10.5px", fontWeight: 600 }}>Facultatif</span>
          : <span style={{ color: "#F5A623", fontSize: "13px", fontWeight: 800 }}>*</span>}
      </div>
    );
  }

  if (loading) return <CompteLoadingScreen titre="Mes projets"/>;

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}.mp-input:focus{outline:none;box-shadow:0 0 0 2px rgba(245,166,35,0.4)}`}</style>
      <CompteHeader titre="Mes projets"/>
      <PullToRefresh onRefresh={charger} isDark={isDark}>
      <main style={{ padding: "16px 16px 100px" }}>
        {/* Carte "Yelen vous accompagne" (remplace l'ancienne barre
            d'onglets Tout/En cours/À venir/Terminés sur cet écran — le
            filtrage complet reste disponible via "Voir tout" de la section
            "Vos projets" plus bas, /menu/projets/tout). Ouvre un parcours dédié en plusieurs
            étapes plutôt qu'une simple recherche (brief CEO 27/09/2026).
            Traitement "suggestion" explicite (retour Bryan 28/09/2026) :
            surlignage doré léger + surtitre + X pour la distinguer du
            contenu fixe de l'écran (Vos projets/À continuer/etc.) — jamais
            un fond noir (règle Yelen), toujours l'or comme seul accent. */}
        {accompagnementCarteVisible && (
          <div style={{ position: "relative", background: isDark ? "linear-gradient(135deg, rgba(245,166,35,0.14), rgba(245,166,35,0.03))" : "linear-gradient(135deg, rgba(245,166,35,0.08), rgba(245,166,35,0.015))", border: `1px solid ${isDark ? "rgba(245,166,35,0.22)" : "rgba(245,166,35,0.18)"}`, borderRadius: "20px", padding: "20px 18px 18px", boxShadow: ombreCard, marginBottom: "22px" }}>
            <button onClick={ignorerCarteAccompagnement} aria-label="Ignorer cette suggestion" className="tap" style={{ position: "absolute", top: "12px", right: "12px", width: "26px", height: "26px", borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "11px", paddingRight: "26px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "13px", background: "linear-gradient(135deg, #F5A623, #C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 10px rgba(245,166,35,0.3)" }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m14.5 9.5-2 5-5 2 2-5 5-2Z"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#F5A623", fontSize: "10px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "2px" }}>Suggestion Yelen</div>
                <div style={{ color: t1, fontSize: "14.5px", fontWeight: 800, lineHeight: 1.25 }}>Vous ne savez pas quoi faire ?</div>
              </div>
            </div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "15px" }}>Laissez Yelen vous accompagner pour organiser ce qui compte le plus pour vous.</div>
            {/* Volontairement compact et aligné à droite (retour Bryan
                28/09/2026) — jamais la même taille que "Nouveau projet"
                juste en dessous, qui reste la vraie action principale de
                l'écran ; celui-ci n'est qu'une suggestion. */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => router.push("/menu/projets/accompagnement")} className="tap" style={{ background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "13px", padding: "10px 20px", borderRadius: "12px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                Démarrer
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
              </button>
            </div>
          </div>
        )}

        {aContinuer && (
          <div style={{ marginBottom: "22px" }}>
            <div style={{ color: t2, fontSize: "11px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "9px", paddingLeft: "2px" }}>À continuer</div>
            <ProjetCarte p={aContinuer} isDark={isDark} card={card} brd={brd} t1={t1} t2={t2} t3={t3} ombreCard={ombreCard} onOpen={(p) => router.push(`/menu/projets/${p.id}`)}/>
          </div>
        )}

        <button className="tap" onClick={() => setCreationOuverte(true)} style={{ width: "100%", background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "14.5px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "18px", boxShadow: isDark ? "none" : "0 4px 14px rgba(245,166,35,0.25)" }}>
          <Ic.Plus/> Nouveau projet
        </button>

        <div style={{ marginBottom: "22px" }}>
            <div style={{ color: t1, fontSize: "14px", fontWeight: 800, marginBottom: "3px" }}>Que voulez-vous faire ?</div>
            <div style={{ color: t2, fontSize: "12px", marginBottom: "10px" }}>Veuillez sélectionner une catégorie</div>
            {/* 2 lignes maximum ici (5 catégories + tuile "Plus", grille 3
                colonnes) — les 15 activite_categories complètes vivent sur
                l'écran dédié /menu/projets/categories (façon Yelp "Home
                services" : voir aussi plus haut). */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
              {Object.entries(ACTIVITE_CATEGORIE_SHORT).slice(0, 5).map(([code, label]) => {
                const color = ACTIVITE_CATEGORIE_COLORS[code] ?? t2;
                return (
                  <button key={code} onClick={() => ouvrirCreationDepuisSecteur(code)} className="tap" style={{ background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "7px", cursor: "pointer", boxShadow: ombreCard }}>
                    <ActiviteCategorieVisuel code={code} color={color}/>
                    <span style={{ color: t1, fontSize: "10.5px", fontWeight: 700, textAlign: "center", lineHeight: 1.25 }}>{label}</span>
                  </button>
                );
              })}
              <button onClick={() => router.push("/menu/projets/categories")} className="tap" style={{ background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "7px", cursor: "pointer", boxShadow: ombreCard }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="2.2" strokeLinecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>
                </div>
                <span style={{ color: t2, fontSize: "10.5px", fontWeight: 700, textAlign: "center", lineHeight: 1.25 }}>Plus</span>
              </button>
            </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "3px" }}>
            <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>Vos projets</div>
            {listeAffichee.length > 0 && (
              <Link href="/menu/projets/tout" className="tap" style={{ color: "#F5A623", fontSize: "12.5px", fontWeight: 700, textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center", gap: "3px", paddingTop: "1px" }}>
                Voir tout
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
              </Link>
            )}
          </div>
          <div style={{ color: t2, fontSize: "12px", marginBottom: "12px" }}>Retrouvez ici tout ce que vous préparez avec Yelen.</div>

          {listeAffichee.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 20px 20px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}><IllustrationProjetVide/></div>
              <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Aucun projet pour l&apos;instant</div>
              <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5 }}>Créez votre premier projet pour regrouper une démarche, une réservation ou une recherche de professionnel en un seul endroit.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {listeAffichee.map((p) => (
                <ProjetCarte key={p.id} p={p} isDark={isDark} card={card} brd={brd} t1={t1} t2={t2} t3={t3} ombreCard={ombreCard} onOpen={(pr) => router.push(`/menu/projets/${pr.id}`)}/>
              ))}
            </div>
          )}
        </div>
      </main>
      </PullToRefresh>

      {creationOuverte && (
        <div ref={creationScrollRef} style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", overflowX: "hidden" }}>
          <ScrollPositionBarConteneur isDark={isDark} conteneurRef={creationScrollRef} variant="fixed"/>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: bg, borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              {/* Boutons ronds pleins façon Apple (retour Bryan : "très
                  visibles et gros") — même remplissage que le chip
                  CompteHeader (#EBEBF0/#2C2C2E, déjà la convention Yelen
                  pour un bouton rond bien visible), agrandi à 40px, plus de
                  simple bordure fine 36px translucide. */}
              <button onClick={fermerCreation} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "40px", height: "40px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#EBEBF0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>Nouveau projet</div>
              {/* Aide contextuelle (retour Bryan) — "?" textuel plutôt
                  qu'une icône ⓘ (plus explicite : "Besoin d'aide ?"). Un
                  seul bouton d'aide sur cet écran, jamais transformé en
                  assistant permanent : ouvre un Bottom Sheet qui explique la
                  création, distinct de "Laisser Yelen m'aider" qui construit
                  réellement le projet. */}
              <button onClick={() => setAideOuverte(true)} className="tap" aria-label="Aide" style={{ justifySelf: "end", width: "40px", height: "40px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#EBEBF0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t1, fontSize: "18px", fontWeight: 800, cursor: "pointer" }}>?</button>
            </div>
          </header>

          <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
            {champLabel("Titre du projet", false)}
            <input value={titreForm} onChange={(e) => setTitreForm(e.target.value)} placeholder="Que voulez-vous accomplir ?" autoFocus className="mp-input" style={inputTitreStyle}/>

            {champLabel("Résumé", true)}
            <textarea value={descriptionForm} onChange={(e) => setDescriptionForm(e.target.value)} placeholder="Décrivez ce projet en quelques mots" rows={2} className="mp-input" style={{ ...inputStyle, resize: "none", fontFamily: "inherit" }}/>

            {champLabel("Catégorie", true)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {Object.entries(ACTIVITE_CATEGORIE_SHORT).map(([code, label]) => {
                const actif = secteurForm === code;
                return (
                  <button key={code} className="tap" onClick={() => setSecteurForm((prev) => (prev === code ? null : code))} style={{ padding: "8px 14px", borderRadius: "24px", border: "none", backgroundColor: actif ? "#F5A623" : inputBg, color: actif ? "#080812" : t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>{actif ? `✓ ${label}` : label}</button>
                );
              })}
            </div>

            {champLabel("Date cible", true)}
            {/* Un input date natif vide ne rend visuellement rien sur ce
                webview (retour Bryan : "on ne sait pas si c'est cliquable")
                — on n'affiche donc plus jamais son propre texte
                (color:"transparent", toujours au-dessus en z-index) et on
                dessine nous-mêmes l'icône + le libellé/la date choisie
                par-dessus, en pointer-events:none pour laisser passer le tap. */}
            <div style={{ position: "relative" }}>
              <input type="date" value={dateCibleForm} onChange={(e) => setDateCibleForm(e.target.value)} className="mp-input" style={{ ...inputStyle, paddingLeft: "44px", color: "transparent", colorScheme: isDark ? "dark" : "light" }}/>
              <div style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: "9px", pointerEvents: "none" }}>
                <span style={{ color: dateCibleForm ? "#F5A623" : t3, display: "flex" }}><Ic.Calendar/></span>
                <span style={{ color: dateCibleForm ? t1 : t3, fontSize: "15px", fontWeight: dateCibleForm ? 700 : 600 }}>{dateCibleForm ? formatDateCourt(dateCibleForm) : "Choisir une date"}</span>
              </div>
            </div>
            {dateCibleForm && (
              <div style={{ color: "#F5A623", fontSize: "11.5px", fontWeight: 700, marginTop: "6px", paddingLeft: "4px" }}>{relatifDateCible(dateCibleForm)}</div>
            )}

            {champLabel("Étapes", true)}
            <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden", marginBottom: "8px" }}>
              {etapesForm.map((e, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "11px 16px", borderBottom: `1px solid ${brd}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "14px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.libelle}</div>
                    {e.date_echeance && <div style={{ color: t3, fontSize: "11px" }}>{formatDateCourt(e.date_echeance)}</div>}
                  </div>
                  <button onClick={() => setEtapesForm((prev) => prev.filter((_, i) => i !== idx))} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px" }}>
                <input value={etapeLibelleDraft} onChange={(e) => setEtapeLibelleDraft(e.target.value)} placeholder="Ajouter une étape" className="mp-input" style={{ ...plainInputStyle, padding: "8px 0", flex: 1, fontSize: "14px" }}/>
                {/* Pilule distincte (fond visible) plutôt qu'un input date nu
                    transparent (retour Bryan : l'utilisateur doit comprendre
                    qu'il peut ajouter le texte PUIS une date, deux contrôles
                    séparés) — même technique d'overlay que le champ Date
                    cible ci-dessus : le texte natif reste transparent, tout
                    l'affichage (icône + libellé) est dessiné par-dessus. */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <input type="date" value={etapeDateDraft} onChange={(e) => setEtapeDateDraft(e.target.value)} className="mp-input" style={{ border: "none", borderRadius: "9px", background: etapeDateDraft ? (isDark ? "rgba(245,166,35,0.14)" : "rgba(245,166,35,0.1)") : inputBg, color: "transparent", fontSize: "11px", width: "86px", padding: "7px 8px 7px 24px", colorScheme: isDark ? "dark" : "light", boxSizing: "border-box" }}/>
                  <div style={{ position: "absolute", left: "7px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={etapeDateDraft ? "#F5A623" : t3} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <span style={{ position: "absolute", left: "24px", right: "8px", top: "50%", transform: "translateY(-50%)", color: etapeDateDraft ? "#F5A623" : t3, fontSize: "10.5px", fontWeight: 700, pointerEvents: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {etapeDateDraft ? new Date(etapeDateDraft).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "Date"}
                  </span>
                </div>
                <button onClick={ajouterEtapeDraft} aria-label="Ajouter l'étape" className="tap" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}><Ic.Plus/></button>
              </div>
            </div>
            <div style={{ color: t3, fontSize: "11.5px", lineHeight: 1.5, padding: "0 4px", marginBottom: "12px" }}>
              Vous pourrez définir les étapes maintenant ou plus tard.
            </div>
            {/* Option "Laisser Yelen m'aider" (retour Bryan) — plutôt que
                d'inventer un moteur de suggestion d'étapes non validé
                (contenu éditorial non sourcé), réutilise le parcours
                "Yelen vous accompagne" déjà construit et approuvé : Yelen
                aide en connectant à un professionnel, pas en générant une
                checklist générique. Ferme la création (le brouillon en
                cours n'est pas encore un projet, rien à perdre) et ouvre
                l'orientation dédiée. */}
            <button onClick={() => { fermerCreation(); router.push("/menu/projets/accompagnement"); }} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", padding: "12px", borderRadius: "14px", border: `1px solid ${isDark ? "rgba(245,166,35,0.25)" : "rgba(245,166,35,0.2)"}`, background: isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.05)", color: "#F5A623", fontSize: "12.5px", fontWeight: 800, cursor: "pointer", marginBottom: "8px" }}>
              <Ic.Sparkle/> Laisser Yelen m&apos;aider
            </button>

            <button onClick={() => void handleCreerProjet()} disabled={!titreForm.trim() || creating} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: 800, cursor: !titreForm.trim() || creating ? "default" : "pointer", opacity: !titreForm.trim() || creating ? 0.5 : 1, marginTop: "10px", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
              {creating ? <YelenLoader size={16} color="#080812"/> : "Créer le projet"}
            </button>
          </div>
        </div>
      )}

      {aideOuverte && (
        <AideProjetSheet
          isDark={isDark}
          onFermer={() => setAideOuverte(false)}
          onDemanderAide={() => { setAideOuverte(false); fermerCreation(); router.push("/menu/projets/accompagnement"); }}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500, zIndex: 9500, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap", backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"), border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, color: toast.type === "success" ? "#22c55e" : "#ef4444" }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

export function ProjetsClient() {
  return (
    <Suspense fallback={<CompteLoadingScreen titre="Mes projets"/>}>
      <ProjetsClientInner/>
    </Suspense>
  );
}
