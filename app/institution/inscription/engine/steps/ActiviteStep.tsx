"use client";

import { useEffect, useState } from "react";
import { ErrorBanner, PrimaryButton, SecondaryButton, StepHeading, fieldLabelStyle, textInputStyle } from "../ui";
import { useSignupTheme } from "../theme";
import type { SignupThemeTokens } from "../theme";
import { SignupState } from "../types";
import { VILLES_GUINEE } from "@/lib/villes";
import { supabase } from "@/lib/supabase";
import { ACTIVITE_CATEGORIE_COLORS, ActiviteCategorieIcon } from "@/lib/activiteVisuels";

// Chantier Taxonomie des activités (Phase 2, 20/08/2026) — remplace la
// grille secteur unique par 2 sélections obligatoires (catégorie puis
// activité principale) + jusqu'à 3 activités secondaires optionnelles,
// lues en direct depuis activite_categories/activites (lecture publique
// anon, même convention que les lectures institutions déjà faites côté
// client dans RechercheOverlay.tsx — pas de route API dédiée nécessaire).
// institutions.secteur n'est plus jamais écrite par ce flux (gelée, pas
// supprimée — voir lib/institutionTaxonomy.tsx).
//
// Adaptation desktop (chantier UX desktop wizard, 20/08/2026 — retour CEO
// sur capture d'écran réelle : grille figée en haut à gauche d'un écran
// large, énorme espace noir inexploité à droite, "pas pro"). Décision CEO
// (référence visuelle fournie : panneau Réglages Claude — À NE PAS copier
// à l'identique, juste s'en inspirer) : sur desktop (≥960px), toute liste
// de sélection (catégorie+activité, statut juridique) devient un champ
// déclencheur compact + une modale centrée plein contenu au clic, pour
// une cohérence totale entre les 2 sélecteurs plutôt qu'un mélange
// grille-inline/popup. Mobile strictement inchangé (comportement et code
// identiques à avant cette adaptation) — bascule pure CSS
// (.signup-mobile-only/.signup-desktop-only, voir SignupShell.tsx), zéro
// détection JS de viewport : les déclencheurs desktop sont physiquement
// inatteignables en dessous de 960px (display:none), donc les modales ne
// peuvent jamais s'ouvrir sur mobile.

// STATUTS_JURIDIQUES reste local ici volontairement (chantier Hôtel, Phase 0,
// 19/08/2026) : ses labels/descriptions divergent de ceux de
// lib/institutionTaxonomy.tsx (utilisés par ProfilEntrepriseTab.tsx) — deux
// formulations différentes déjà en prod, non unifiées pour ne pas changer un
// texte affiché sans décision explicite. Voir le commentaire d'en-tête de
// lib/institutionTaxonomy.tsx.
const STATUTS_JURIDIQUES = [
  { id: "public", label: "Public", description: "Institution publique ou administration d'État" },
  { id: "prive_formel", label: "Privé formel", description: "Entreprise ou société enregistrée" },
  { id: "liberal", label: "Libéral", description: "Profession libérale réglementée (médecin, avocat, etc.)" },
  { id: "individuel_informel", label: "Individuel / informel", description: "Activité individuelle non enregistrée formellement" },
];

type Categorie = { id: string; code: string; label: string };
type Activite = { id: string; code: string; label: string; categorie_id: string };

type SubStep = "categorie" | "activite" | "statut" | "presentation";

function CardOption({ selected, onClick, children, C }: { selected: boolean; onClick: () => void; children: React.ReactNode; C: SignupThemeTokens }) {
  return (
    <button type="button" onClick={onClick} className="signup-tap" style={{
      width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: "14px", cursor: "pointer",
      border: `1.5px solid ${selected ? C.gold : C.border}`, backgroundColor: selected ? C.goldBg2 : C.card,
      display: "flex", alignItems: "center", gap: "12px", transition: "all 0.2s",
    }}>
      {children}
    </button>
  );
}

// Champ compact "résumé + Choisir/Modifier" — remplace la liste inline sur
// desktop pour toute sélection de type liste (catégorie+activité, statut
// juridique), ouvre la modale correspondante au clic.
function DesktopTriggerField({ icon, label, placeholder, onClick, C }: {
  icon?: React.ReactNode; label: string; placeholder: string; onClick: () => void; C: SignupThemeTokens;
}) {
  const hasValue = !!label;
  return (
    <button type="button" onClick={onClick} className="signup-tap" style={{
      width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "16px 18px",
      borderRadius: "14px", border: `1.5px solid ${hasValue ? C.gold + "50" : C.border}`, backgroundColor: C.card,
      cursor: "pointer", textAlign: "left",
    }}>
      {icon && <span style={{ flexShrink: 0, display: "flex" }}>{icon}</span>}
      <span style={{ flex: 1, minWidth: 0, color: hasValue ? C.dark : C.gray, fontSize: "14.5px", fontWeight: hasValue ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {hasValue ? label : placeholder}
      </span>
      <span style={{ color: C.gold, fontSize: "12.5px", fontWeight: 800, flexShrink: 0 }}>{hasValue ? "Modifier" : "Choisir"}</span>
    </button>
  );
}

// Coquille commune des modales desktop — grande carte centrée sur fond
// assombri, en-tête avec titre + fermeture, corps défilant, pied optionnel
// fixe (bouton Valider). Conçue pour Yelen (jetons de thème signup), pas
// une copie d'un produit tiers.
function DesktopModalShell({ title, onClose, width, footer, children, C }: {
  title: string; onClose: () => void; width?: string; footer?: React.ReactNode; children: React.ReactNode; C: SignupThemeTokens;
}) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, width: "100%", maxWidth: width || "620px", maxHeight: "min(720px, 85vh)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "signupFadeUp 0.2s ease" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ color: C.dark, fontSize: "16px", fontWeight: 900 }}>{title}</span>
          <button onClick={onClose} className="signup-tap" aria-label="Fermer" style={{ width: "30px", height: "30px", borderRadius: "50%", background: C.gray3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {/* Pas de overflow ici — chaque modale gère son propre scroll interne
            (volet catégories / volet activités indépendants pour
            ActiviteSelectModal, voir plus bas) plutôt qu'un scroll unique qui
            ferait défiler l'en-tête "ACTIVITÉ PRINCIPALE" hors champ en même
            temps que la liste (retour CEO 20/08/2026). */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
        {footer && <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

// Modale combinée catégorie + activité (principale + secondaires) — navigation
// à gauche (catégories), contenu à droite (activités), même esprit que le
// panneau Réglages de référence sans en reprendre le style. Sélection en
// état local ("pending"), commit uniquement au clic sur "Valider" — même
// discipline que TaxoModal (ProfilEntrepriseTab.tsx) pour rester cohérent
// dans tout le produit.
function ActiviteSelectModal({ categories, allActivites, initialCategorieId, initialPrincipaleId, initialSecondairesIds, onClose, onValidate, C }: {
  categories: Categorie[]; allActivites: Activite[];
  initialCategorieId: string; initialPrincipaleId: string; initialSecondairesIds: string[];
  onClose: () => void; onValidate: (categorieId: string, principaleId: string, secondairesIds: string[]) => void;
  C: SignupThemeTokens;
}) {
  const [pendingCategorieId, setPendingCategorieId] = useState(initialCategorieId);
  const [pendingPrincipaleId, setPendingPrincipaleId] = useState(initialPrincipaleId);
  const [pendingSecondairesIds, setPendingSecondairesIds] = useState(initialSecondairesIds);

  const activitesDeLaCategorie = allActivites.filter(a => a.categorie_id === pendingCategorieId);
  const secondairesDisponibles = activitesDeLaCategorie.filter(a => a.id !== pendingPrincipaleId);

  function selectCategorie(id: string) {
    if (id === pendingCategorieId) return;
    setPendingCategorieId(id);
    setPendingPrincipaleId("");
    setPendingSecondairesIds([]);
  }
  function selectPrincipale(id: string) {
    setPendingPrincipaleId(id);
    setPendingSecondairesIds(prev => prev.filter(s => s !== id));
  }
  function toggleSecondaire(id: string) {
    setPendingSecondairesIds(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  return (
    <DesktopModalShell
      title="Choisissez votre activité"
      onClose={onClose}
      width="980px"
      C={C}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" disabled={!pendingPrincipaleId} onClick={() => onValidate(pendingCategorieId, pendingPrincipaleId, pendingSecondairesIds)} className="signup-tap signup-cta" style={{
            padding: "12px 30px", borderRadius: "12px", border: "none", fontSize: "14px", fontWeight: 800,
            cursor: pendingPrincipaleId ? "pointer" : "not-allowed",
            background: pendingPrincipaleId ? C.gold : C.gray3, color: pendingPrincipaleId ? "#111" : C.dark2,
            boxShadow: pendingPrincipaleId ? `0 6px 18px ${C.gold}35` : "none",
          }}>Valider</button>
        </div>
      }
    >
      <div style={{ display: "flex", height: "100%", minHeight: "420px" }}>
        {/* Volet catégories — scroll interne indépendant, ne bouge jamais
            quand on défile le volet activités à droite. */}
        <div className="signup-modal-scroll" style={{ flex: "0 0 260px", minHeight: 0, borderRight: `1px solid ${C.border}`, padding: "10px", overflowY: "auto" }}>
          {categories.map(cat => {
            const selected = pendingCategorieId === cat.id;
            const color = ACTIVITE_CATEGORIE_COLORS[cat.code] ?? C.gold;
            return (
              <button key={cat.id} type="button" onClick={() => selectCategorie(cat.id)} className="signup-tap" style={{
                width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px",
                borderRadius: "10px", border: "none", cursor: "pointer", marginBottom: "2px",
                backgroundColor: selected ? C.goldBg2 : "transparent",
              }}>
                <ActiviteCategorieIcon code={cat.code} color={selected ? C.gold : color} size={18}/>
                <span style={{ color: selected ? C.gold : C.dark2, fontSize: "12.5px", fontWeight: selected ? 800 : 600 }}>{cat.label}</span>
              </button>
            );
          })}
        </div>
        {/* Volet activités — scroll interne indépendant, "ACTIVITÉ
            PRINCIPALE"/"ACTIVITÉS SECONDAIRES" restent la référence stable
            pendant que la liste défile (retour CEO 20/08/2026 : le scroll
            unique précédent faisait sortir ce titre du cadre). */}
        <div className="signup-modal-scroll" style={{ flex: 1, minWidth: 0, minHeight: 0, padding: "20px 24px", overflowY: "auto" }}>
          {!pendingCategorieId ? (
            <p style={{ color: C.gray, fontSize: "13px" }}>Choisissez d&apos;abord une catégorie à gauche.</p>
          ) : activitesDeLaCategorie.length === 0 ? (
            <p style={{ color: C.gray, fontSize: "13px" }}>Aucune activité disponible pour cette catégorie pour le moment.</p>
          ) : (
            <>
              <p style={{ color: C.dark2, fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>Activité principale</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: pendingPrincipaleId && secondairesDisponibles.length > 0 ? "20px" : 0 }}>
                {activitesDeLaCategorie.map(a => {
                  const selected = pendingPrincipaleId === a.id;
                  return (
                    <button key={a.id} type="button" onClick={() => selectPrincipale(a.id)} className="signup-tap" style={{
                      textAlign: "left", padding: "11px 13px", borderRadius: "12px", cursor: "pointer",
                      border: `1.5px solid ${selected ? C.gold : C.border}`, backgroundColor: selected ? C.goldBg2 : "transparent",
                    }}>
                      <span style={{ color: selected ? C.dark : C.dark2, fontSize: "12.5px", fontWeight: selected ? 800 : 600 }}>{a.label}</span>
                    </button>
                  );
                })}
              </div>

              {pendingPrincipaleId && secondairesDisponibles.length > 0 && (
                <>
                  <p style={{ color: C.dark2, fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>Activités secondaires (optionnel, jusqu&apos;à 3)</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {secondairesDisponibles.map(a => {
                      const checked = pendingSecondairesIds.includes(a.id);
                      const disabled = !checked && pendingSecondairesIds.length >= 3;
                      return (
                        <label key={a.id} className="signup-tap" style={{
                          display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderRadius: "10px",
                          border: `1.5px solid ${checked ? C.gold : C.border}`, backgroundColor: checked ? C.goldBg2 : "transparent",
                          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
                        }}>
                          <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleSecondaire(a.id)}/>
                          <span style={{ color: C.dark2, fontSize: "12px", fontWeight: 600 }}>{a.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </DesktopModalShell>
  );
}

// Modale statut juridique — liste simple à choix unique, sélection = clôture
// immédiate (comme un sélecteur natif), pas de bouton "Valider" séparé :
// même comportement d'avance automatique que le mobile (selectStatut).
function StatutSelectModal({ selectedId, onClose, onSelect, C }: {
  selectedId: string; onClose: () => void; onSelect: (id: string) => void; C: SignupThemeTokens;
}) {
  return (
    <DesktopModalShell title="Statut juridique" onClose={onClose} width="480px" C={C}>
      <div className="signup-modal-scroll" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px", height: "100%", minHeight: 0, overflowY: "auto" }}>
        {STATUTS_JURIDIQUES.map(s => {
          const selected = selectedId === s.id;
          return (
            <button key={s.id} type="button" onClick={() => onSelect(s.id)} className="signup-tap" style={{
              textAlign: "left", padding: "13px 16px", borderRadius: "14px", cursor: "pointer",
              border: `1.5px solid ${selected ? C.gold : C.border}`, backgroundColor: selected ? C.goldBg2 : "transparent",
            }}>
              <div style={{ color: selected ? C.dark : C.dark2, fontSize: "14px", fontWeight: 800, marginBottom: "2px" }}>{s.label}</div>
              <div style={{ color: C.gray, fontSize: "12px" }}>{s.description}</div>
            </button>
          );
        })}
      </div>
    </DesktopModalShell>
  );
}

export function ActiviteStep({ state, updateState, onNext, initialSubStep }: {
  state: SignupState;
  updateState: (patch: Partial<SignupState>) => void;
  onNext: () => void;
  initialSubStep?: SubStep;
}) {
  const C = useSignupTheme();
  // Initialisé une seule fois depuis initialSubStep : SignupEngine ne
  // rend ce composant que via {currentStep === "activite" && <ActiviteStep/>},
  // donc chaque arrivée sur cette étape (y compris depuis "Modifier" en
  // relecture) est un montage frais, pas une mise à jour d'un composant déjà
  // monté — pas besoin d'effet pour resynchroniser sub sur ce prop.
  const [sub, setSub] = useState<SubStep>(initialSubStep || "categorie");
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [loadingActivites, setLoadingActivites] = useState(false);
  // Copie complète (non filtrée par catégorie) — uniquement pour la modale
  // desktop, qui doit pouvoir changer de catégorie et afficher ses activités
  // sans dépendre de l'effet ci-dessous (gardé intact pour le mobile).
  // Volume trivial (~100 lignes), un seul aller-retour au montage.
  const [allActivites, setAllActivites] = useState<Activite[]>([]);
  const [desktopModalOpen, setDesktopModalOpen] = useState<"activite" | "statut" | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingCategories(true);
      const { data } = await supabase.from("activite_categories").select("id,code,label").eq("actif", true).order("ordre");
      setCategories(data ?? []);
      setLoadingCategories(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("activites").select("id,code,label,categorie_id").eq("statut", "active").order("ordre");
      setAllActivites(data ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!state.activite.activiteCategorieId) { setActivites([]); return; }
    (async () => {
      setLoadingActivites(true);
      const { data } = await supabase
        .from("activites")
        .select("id,code,label,categorie_id")
        .eq("categorie_id", state.activite.activiteCategorieId)
        .eq("statut", "active")
        .order("ordre");
      setActivites(data ?? []);
      setLoadingActivites(false);
    })();
  }, [state.activite.activiteCategorieId]);

  function selectCategorie(id: string) {
    updateState({ activite: { ...state.activite, activiteCategorieId: id, activitePrincipaleId: "", activitesSecondairesIds: [] } });
    setTimeout(() => setSub("activite"), 200);
  }
  function selectPrincipale(id: string) {
    const secondaires = state.activite.activitesSecondairesIds.filter(s => s !== id);
    updateState({ activite: { ...state.activite, activitePrincipaleId: id, activitesSecondairesIds: secondaires } });
  }
  function toggleSecondaire(id: string) {
    const current = state.activite.activitesSecondairesIds;
    if (current.includes(id)) {
      updateState({ activite: { ...state.activite, activitesSecondairesIds: current.filter(s => s !== id) } });
    } else if (current.length < 3) {
      updateState({ activite: { ...state.activite, activitesSecondairesIds: [...current, id] } });
    }
  }
  function handleActiviteNext() {
    setError("");
    if (!state.activite.activitePrincipaleId) { setError("Merci de sélectionner votre activité principale."); return; }
    setSub("statut");
  }
  function selectStatut(id: string) {
    updateState({ activite: { ...state.activite, statutJuridique: id } });
    setTimeout(() => setSub("presentation"), 200);
  }
  function handlePresentationNext() {
    setError("");
    if (!state.activite.name.trim()) { setError("Merci d'indiquer le nom de votre activité."); return; }
    if (!state.activite.ville.trim()) { setError("Merci d'indiquer votre ville."); return; }
    onNext();
  }

  if (sub === "categorie" || sub === "activite") {
    const secondairesDisponibles = activites.filter(a => a.id !== state.activite.activitePrincipaleId);
    const selectedCategorie = categories.find(c => c.id === state.activite.activiteCategorieId);
    const selectedPrincipaleLabel = allActivites.find(a => a.id === state.activite.activitePrincipaleId)?.label ?? "";
    const triggerLabel = selectedPrincipaleLabel && selectedCategorie ? `${selectedPrincipaleLabel} — ${selectedCategorie.label}` : "";

    return (
      <div className="signup-split">
        <div className="signup-split-side">
          <StepHeading
            title={sub === "categorie" ? "Quelle catégorie décrit le mieux votre activité ?" : "Quelle est votre activité principale ?"}
            subtitle={sub === "categorie" ? "Cela nous permet de présenter votre activité au bon endroit sur Yelen." : "Choisissez l'activité qui décrit le mieux ce que vous faites concrètement."}
            C={C}
          />
        </div>
        <div className="signup-split-body">

        {/* MOBILE (<960px) — comportement et code identiques à avant l'adaptation desktop */}
        <div className="signup-mobile-only">
          {sub === "categorie" ? (
            loadingCategories ? (
              <p style={{ color: C.gray, fontSize: "13px" }}>Chargement…</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {categories.map(cat => {
                  const selected = state.activite.activiteCategorieId === cat.id;
                  const color = ACTIVITE_CATEGORIE_COLORS[cat.code] ?? C.gold;
                  return (
                    <button key={cat.id} type="button" onClick={() => selectCategorie(cat.id)} className="signup-tap" style={{
                      padding: "16px 10px", borderRadius: "14px", cursor: "pointer",
                      border: `1.5px solid ${selected ? C.gold : C.border}`, backgroundColor: selected ? C.goldBg2 : C.card,
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", transition: "all 0.2s",
                    }}>
                      <ActiviteCategorieIcon code={cat.code} color={selected ? C.gold : color}/>
                      <span style={{ color: selected ? C.dark : C.dark2, fontSize: "12px", fontWeight: selected ? 800 : 600, textAlign: "center" }}>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            loadingActivites ? (
              <p style={{ color: C.gray, fontSize: "13px" }}>Chargement…</p>
            ) : activites.length === 0 ? (
              <p style={{ color: C.gray, fontSize: "13px" }}>Aucune activité disponible pour cette catégorie pour le moment.</p>
            ) : (
              <>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                {activites.map(a => {
                  const selected = state.activite.activitePrincipaleId === a.id;
                  return (
                    <CardOption key={a.id} selected={selected} onClick={() => selectPrincipale(a.id)} C={C}>
                      <div style={{ color: selected ? C.dark : C.dark2, fontSize: "14px", fontWeight: selected ? 800 : 600 }}>{a.label}</div>
                    </CardOption>
                  );
                })}
              </div>

              {state.activite.activitePrincipaleId && secondairesDisponibles.length > 0 && (
                <details style={{ marginBottom: "20px" }}>
                  <summary style={{ color: C.gold, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", marginBottom: "12px" }}>
                    Activités secondaires (optionnel, jusqu&apos;à 3)
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                    {secondairesDisponibles.map(a => {
                      const checked = state.activite.activitesSecondairesIds.includes(a.id);
                      const disabled = !checked && state.activite.activitesSecondairesIds.length >= 3;
                      return (
                        <label key={a.id} className="signup-tap" style={{
                          display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "12px",
                          border: `1.5px solid ${checked ? C.gold : C.border}`, backgroundColor: checked ? C.goldBg2 : C.card,
                          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
                        }}>
                          <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleSecondaire(a.id)} />
                          <span style={{ color: C.dark2, fontSize: "13px", fontWeight: 600 }}>{a.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </details>
              )}
              </>
            )
          )}

          {error && <ErrorBanner msg={error} C={C} onClose={() => setError("")}/>}

          {sub === "activite" && (
            <>
              <PrimaryButton onClick={handleActiviteNext} C={C}>Continuer</PrimaryButton>
              <div style={{ marginTop: "14px" }}>
                <SecondaryButton onClick={() => setSub("categorie")} C={C}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
                  Changer de catégorie
                </SecondaryButton>
              </div>
            </>
          )}
        </div>

        {/* DESKTOP (≥960px) — champ déclencheur unique (catégorie + activité
            fusionnées), ouvre la modale à deux volets. Décision CEO
            20/08/2026 : toute liste de sélection suit ce même schéma sur
            desktop, pour une cohérence totale entre les étapes. */}
        <div className="signup-desktop-only">
          <DesktopTriggerField
            icon={selectedCategorie ? <ActiviteCategorieIcon code={selectedCategorie.code} color={C.gold}/> : undefined}
            label={triggerLabel}
            placeholder="Choisir une catégorie et une activité"
            onClick={() => setDesktopModalOpen("activite")}
            C={C}
          />
          <div style={{ marginTop: "18px" }}>
            <PrimaryButton onClick={handleActiviteNext} disabled={!state.activite.activitePrincipaleId} C={C}>Continuer</PrimaryButton>
          </div>

          {desktopModalOpen === "activite" && (
            <ActiviteSelectModal
              categories={categories}
              allActivites={allActivites}
              initialCategorieId={state.activite.activiteCategorieId}
              initialPrincipaleId={state.activite.activitePrincipaleId}
              initialSecondairesIds={state.activite.activitesSecondairesIds}
              onClose={() => setDesktopModalOpen(null)}
              onValidate={(categorieId, principaleId, secondairesIds) => {
                updateState({ activite: { ...state.activite, activiteCategorieId: categorieId, activitePrincipaleId: principaleId, activitesSecondairesIds: secondairesIds } });
                setDesktopModalOpen(null);
              }}
              C={C}
            />
          )}
        </div>

        </div>
      </div>
    );
  }

  if (sub === "statut") {
    return (
      <div className="signup-split">
        <div className="signup-split-side">
          <StepHeading title="Comment votre activité est-elle enregistrée ?" subtitle="Cette information nous aide à adapter le suivi de votre espace." C={C}/>
        </div>
        <div className="signup-split-body">

        {/* MOBILE (<960px) — inchangé */}
        <div className="signup-mobile-only">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {STATUTS_JURIDIQUES.map(s => {
              const selected = state.activite.statutJuridique === s.id;
              return (
                <CardOption key={s.id} selected={selected} onClick={() => selectStatut(s.id)} C={C}>
                  <div>
                    <div style={{ color: selected ? C.dark : C.dark2, fontSize: "14px", fontWeight: 800, marginBottom: "2px" }}>{s.label}</div>
                    <div style={{ color: C.gray, fontSize: "12px" }}>{s.description}</div>
                  </div>
                </CardOption>
              );
            })}
          </div>
          <div style={{ marginTop: "16px" }}>
            <SecondaryButton onClick={() => setSub("activite")} C={C}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
              Changer d&apos;activité
            </SecondaryButton>
          </div>
        </div>

        {/* DESKTOP (≥960px) — champ déclencheur + modale, même schéma que
            catégorie/activité ci-dessus. */}
        <div className="signup-desktop-only">
          <DesktopTriggerField
            label={STATUTS_JURIDIQUES.find(s => s.id === state.activite.statutJuridique)?.label ?? ""}
            placeholder="Choisir votre statut juridique"
            onClick={() => setDesktopModalOpen("statut")}
            C={C}
          />

          {desktopModalOpen === "statut" && (
            <StatutSelectModal
              selectedId={state.activite.statutJuridique}
              onClose={() => setDesktopModalOpen(null)}
              onSelect={(id) => { selectStatut(id); setDesktopModalOpen(null); }}
              C={C}
            />
          )}
        </div>

        </div>
      </div>
    );
  }

  return (
    <div className="signup-split">
      <div className="signup-split-side">
        <StepHeading title="Comment souhaitez-vous être présenté sur Yelen ?" subtitle="Ces informations seront visibles par les citoyens qui recherchent votre activité." C={C}/>
      </div>
      <div className="signup-split-body">

      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "16px" }}>
        <div>
          <label htmlFor="signup-act-name" style={fieldLabelStyle(C)}>Nom de votre activité</label>
          <input id="signup-act-name" type="text" placeholder="Ex : Clinique Pasteur Conakry" autoFocus
            value={state.activite.name}
            onChange={e => updateState({ activite: { ...state.activite, name: e.target.value } })}
            style={textInputStyle(C)}
          />
        </div>
        <div>
          <label htmlFor="signup-act-ville" style={fieldLabelStyle(C)}>Ville</label>
          <select id="signup-act-ville" value={state.activite.ville}
            onChange={e => updateState({ activite: { ...state.activite, ville: e.target.value } })}
            style={textInputStyle(C)}
          >
            <option value="">Sélectionner une ville</option>
            {VILLES_GUINEE.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <details style={{ marginBottom: "20px" }}>
        <summary style={{ color: C.gold, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", marginBottom: "12px" }}>Informations complémentaires (optionnel)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
          <div>
            <label htmlFor="signup-act-email" style={fieldLabelStyle(C)}>Email</label>
            <input id="signup-act-email" type="email" placeholder="contact@activite.gn"
              value={state.activite.email}
              onChange={e => updateState({ activite: { ...state.activite, email: e.target.value } })}
              style={textInputStyle(C)}
            />
          </div>
          <div>
            <label htmlFor="signup-act-website" style={fieldLabelStyle(C)}>Site web</label>
            <input id="signup-act-website" type="text" placeholder="https://…"
              value={state.activite.website}
              onChange={e => updateState({ activite: { ...state.activite, website: e.target.value } })}
              style={textInputStyle(C)}
            />
          </div>
          <div>
            <label htmlFor="signup-act-desc" style={fieldLabelStyle(C)}>Description</label>
            <textarea id="signup-act-desc" placeholder="Décrivez votre activité en quelques mots…" rows={3}
              value={state.activite.description}
              onChange={e => updateState({ activite: { ...state.activite, description: e.target.value } })}
              style={{ ...textInputStyle(C), resize: "none", lineHeight: 1.6 } as React.CSSProperties}
            />
          </div>
        </div>
      </details>

      {error && <ErrorBanner msg={error} C={C} onClose={() => setError("")}/>}

      <PrimaryButton onClick={handlePresentationNext} C={C}>Continuer</PrimaryButton>

      <div style={{ marginTop: "14px" }}>
        <SecondaryButton onClick={() => setSub("statut")} C={C}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          Étape précédente
        </SecondaryButton>
      </div>
      </div>
    </div>
  );
}
