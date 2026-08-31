"use client";

import { useEffect, useState } from "react";
import { YelenLoader } from "@/components/YelenLoader";
import { ErrorBanner, PrimaryButton, StepHeading } from "../ui";
import { useSignupTheme } from "../theme";
import type { SignupThemeTokens } from "../theme";
import { CreatedInstitution, SignupState, StepId } from "../types";
import { supabase } from "@/lib/supabase";

const CREATION_STAGES = [
  "Vérification de vos informations…",
  "Création de votre espace…",
  "Préparation de votre espace professionnel…",
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function humanizeRegisterError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "ALREADY_REGISTERED": return "Ce numéro est déjà enregistré. Connectez-vous à la place.";
    case "INVALID_CODE": return "Votre code de vérification a expiré. Revenez à l'étape du numéro de téléphone pour en recevoir un nouveau.";
    case "RATE_LIMITED":
    case "LOCKED": return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "MISSING_FIELDS": return "Certaines informations sont manquantes. Vérifiez chaque bloc avant de continuer.";
    default: return fallback || "Un souci est survenu lors de la création de votre espace. Réessayez dans un instant.";
  }
}

function ReviewBlock({ label, onEdit, children, C }: { label: string; onEdit: () => void; children: React.ReactNode; C: SignupThemeTokens }) {
  return (
    <div style={{ backgroundColor: C.card, border: `1.5px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ color: C.gold, fontSize: "10px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>{label}</span>
        <button type="button" onClick={onEdit} className="signup-tap" style={{ background: "none", border: "none", color: C.gray, fontSize: "12px", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
          Modifier
        </button>
      </div>
      {children}
    </div>
  );
}

type ActiviteSubStep = "categorie" | "activite" | "statut" | "presentation";

export function ReviewStep({ state, onEdit, onRestartPhone, onCreated }: {
  state: SignupState;
  onEdit: (step: Extract<StepId, "responsable" | "activite">, activiteSubStep?: ActiviteSubStep) => void;
  onRestartPhone: () => void;
  onCreated: (institution: CreatedInstitution) => void;
}) {
  const C = useSignupTheme();
  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  // Distingue le cas "code de vérification expiré" des autres erreurs —
  // seul celui-ci propose un clic direct vers l'étape téléphone (retour
  // CEO 20/08/2026 : jamais forcer plusieurs clics "Retour" successifs
  // pour atteindre l'étape où redemander un code).
  const [errorCode, setErrorCode] = useState("");

  // statutLabels reste local (voir commentaire d'en-tête de
  // lib/institutionTaxonomy.tsx — divergence de formulation non unifiée).
  const statutLabels: Record<string, string> = {
    public: "Public", prive_formel: "Privé formel", liberal: "Libéral", individuel_informel: "Individuel / informel",
  };

  // Labels catégorie/activité — l'état du wizard ne garde que des ids
  // (activiteCategorieId/activitePrincipaleId), résolus ici pour l'affichage
  // en relecture, même convention que la lecture publique côté client déjà
  // utilisée dans ActiviteStep.tsx.
  const [categorieLabel, setCategorieLabel] = useState("");
  const [activiteLabel, setActiviteLabel] = useState("");
  useEffect(() => {
    (async () => {
      if (!state.activite.activiteCategorieId) { setCategorieLabel(""); return; }
      const { data } = await supabase.from("activite_categories").select("label").eq("id", state.activite.activiteCategorieId).maybeSingle();
      setCategorieLabel(data?.label ?? "");
    })();
  }, [state.activite.activiteCategorieId]);
  useEffect(() => {
    (async () => {
      if (!state.activite.activitePrincipaleId) { setActiviteLabel(""); return; }
      const { data } = await supabase.from("activites").select("label").eq("id", state.activite.activitePrincipaleId).maybeSingle();
      setActiviteLabel(data?.label ?? "");
    })();
  }, [state.activite.activitePrincipaleId]);

  async function handleCreate() {
    setError("");
    setErrorCode("");
    setCreating(true);
    setStage(0);
    const startedAt = Date.now();

    try {
      const res = await fetch("/api/institution/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: state.phone,
          code: state.verifiedCode,
          responsable_prenom: state.responsable.prenom.trim(),
          responsable_nom: state.responsable.nom.trim(),
          responsable_role: state.responsable.role.trim() || undefined,
          name: state.activite.name.trim(),
          activite_categorie_id: state.activite.activiteCategorieId,
          activite_principale_id: state.activite.activitePrincipaleId,
          activites_secondaires_ids: state.activite.activitesSecondairesIds,
          statut_juridique: state.activite.statutJuridique,
          ville: state.activite.ville.trim(),
          email: state.activite.email.trim() || undefined,
          website: state.activite.website.trim() || undefined,
          description: state.activite.description.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setCreating(false);
        setError(humanizeRegisterError(data.code, data.error));
        setErrorCode(data.code || "");
        return;
      }

      // La suite de l'animation ne se joue qu'après confirmation réelle du
      // serveur — jamais avant. Un minimum de temps affiché évite un flash
      // si la réponse est très rapide (perception d'un "vrai moment", pas
      // un artifice qui prétend un état non encore confirmé).
      const elapsed = Date.now() - startedAt;
      if (elapsed < 700) await sleep(700 - elapsed);
      setStage(1);
      await sleep(650);
      setStage(2);
      await sleep(650);

      onCreated(data.institution as CreatedInstitution);
    } catch {
      setCreating(false);
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
    }
  }

  if (creating) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <YelenLoader size={40} color={C.gold}/>
        <p aria-live="polite" style={{ color: C.dark, fontSize: "15px", fontWeight: 700, marginTop: "20px" }}>{CREATION_STAGES[stage]}</p>
      </div>
    );
  }

  return (
    <div className="signup-split">
      <div className="signup-split-side">
        <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
        <StepHeading title="Vérifiez vos informations" subtitle="Dernière étape avant la création de votre espace." C={C}/>
      </div>

      <div className="signup-split-body">
      {/* En haut, avant tout le reste — une erreur bloquante (ex. code de
          vérification expiré) ne doit jamais rester enterrée sous les 4
          blocs de relecture (retour CEO 20/08/2026). */}
      {error && (
        <ErrorBanner
          msg={error}
          C={C}
          actionLabel={errorCode === "INVALID_CODE" ? "Recevoir un nouveau code →" : undefined}
          onAction={errorCode === "INVALID_CODE" ? onRestartPhone : undefined}
        />
      )}

      <ReviewBlock label="Responsable" onEdit={() => onEdit("responsable")} C={C}>
        <div style={{ color: C.dark, fontSize: "14px", fontWeight: 700 }}>
          {state.responsable.prenom} {state.responsable.nom}
          {state.responsable.role.trim() && <span style={{ color: C.gray, fontWeight: 500 }}> — {state.responsable.role}</span>}
        </div>
      </ReviewBlock>

      <ReviewBlock label="Activité" onEdit={() => onEdit("activite", "presentation")} C={C}>
        <div style={{ color: C.dark, fontSize: "14px", fontWeight: 700 }}>{state.activite.name}</div>
        <div style={{ color: C.gray, fontSize: "12.5px", marginTop: "2px" }}>{activiteLabel}{activiteLabel && categorieLabel ? " — " : ""}{categorieLabel}</div>
      </ReviewBlock>

      <ReviewBlock label="Localisation" onEdit={() => onEdit("activite", "presentation")} C={C}>
        <div style={{ color: C.dark, fontSize: "14px", fontWeight: 700 }}>{state.activite.ville}</div>
      </ReviewBlock>

      <ReviewBlock label="Informations professionnelles" onEdit={() => onEdit("activite", "statut")} C={C}>
        <div style={{ color: C.dark, fontSize: "14px", fontWeight: 700 }}>{statutLabels[state.activite.statutJuridique]}</div>
      </ReviewBlock>

      <p style={{ textAlign: "center", color: C.gray, fontSize: "12.5px", marginBottom: "12px" }}>Tout est correct ?</p>
      <PrimaryButton onClick={handleCreate} C={C}>Créer mon espace Yelen</PrimaryButton>
      </div>
    </div>
  );
}
