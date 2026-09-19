"use client";

// Premier composant dimensionnel officiellement standardisé du dashboard
// institution (Lot UI 2, 14/08/2026 — cf. docs/ui/YELEN_UI_DENSITY_AUDIT.md,
// duplication à l'identique de `fieldLabel`/`fieldInput` dans
// ConditionsInformationsTab.tsx, ProfilResponsableTab.tsx et
// ProfilEntrepriseTab.tsx). Périmètre volontairement restreint aux champs
// texte (<input>) — ni <textarea>, ni <input type="time">, ni les autres
// composants de formulaire du dashboard ne sont concernés par ce lot (brief
// CEO 14/08/2026, "ne pas migrer arbitrairement les autres inputs").
//
// `fieldLabel`/`inputFieldStyle` ci-dessous sont la reprise EXACTE des
// fonctions locales historiquement dupliquées dans les 3 fichiers (mêmes
// valeurs, aucun changement visuel) — conservées pour les usages hors
// "champ texte" de ces 3 fichiers (textarea, input[type=time], label seul)
// qui restent inchangés dans ce lot. `<FormField>` est la nouvelle
// référence, utilisée uniquement pour les <input> texte de ces 3 fichiers.
import { useState } from "react";
import type { ThemeTokens } from "../theme";

// Échelle dimensionnelle pour les champs texte — première règle Yelen
// officiellement adoptée (cf. docs/ui/YELEN_UI_DENSITY_AUDIT.md §9).
// Valeurs ancrées sur celles déjà utilisées à l'identique dans les 3 écrans
// concernés (padding/radius/fontSize inchangés) — aucune valeur inventée,
// juste une formalisation + les états qu'aucun des 3 fichiers ne définissait
// de façon cohérente jusqu'ici (hauteur explicite, lineHeight, focus,
// disabled, erreur, icône, espacements label/erreur).
export const INPUT_DIMENSIONS = {
  height: "40px",
  paddingX: "13px",
  fontSize: "13px",
  lineHeight: "1.4",
  radius: "10px",
  borderWidth: "1px",
  iconSize: "16px",
  iconGap: "10px",
  labelGap: "6px",
  errorGap: "6px",
} as const;

// Reprise exacte de l'ancien style dupliqué (ConditionsInformationsTab.tsx,
// ProfilResponsableTab.tsx, ProfilEntrepriseTab.tsx, valeurs identiques
// avant ce lot) — pour les usages hors "champ texte" volontairement non
// touchés (textarea, input[type=time], label sans champ associé).
export const fieldLabel = (C: ThemeTokens): React.CSSProperties => ({
  color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase",
  letterSpacing: "0.5px", display: "block", marginBottom: "6px",
});
export const inputFieldStyle = (C: ThemeTokens): React.CSSProperties => ({
  width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`,
  borderRadius: "10px", padding: "11px 13px", color: C.t1, fontSize: "13px",
  fontFamily: "inherit",
});

export function FormField({
  C, label, required = false, value, onChange, type = "text", placeholder,
  disabled = false, error, icon, name, autoComplete, maxLength,
}: {
  C: ThemeTokens;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "tel" | "url";
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  icon?: React.ReactNode;
  name?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label style={{ ...fieldLabel(C), marginBottom: INPUT_DIMENSIONS.labelGap }}>
        {label}{required && " *"}
      </label>
      <div style={{ position: "relative" }}>
        {icon && (
          <span style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", color: C.t3, display: "flex", pointerEvents: "none" }}>
            {icon}
          </span>
        )}
        <input
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: INPUT_DIMENSIONS.height,
            padding: `0 ${INPUT_DIMENSIONS.paddingX} 0 ${icon ? "38px" : INPUT_DIMENSIONS.paddingX}`,
            backgroundColor: C.bg3,
            border: `${INPUT_DIMENSIONS.borderWidth} solid ${error ? C.red : focused ? C.gold : C.border}`,
            borderRadius: INPUT_DIMENSIONS.radius,
            color: C.t1,
            fontSize: INPUT_DIMENSIONS.fontSize,
            lineHeight: INPUT_DIMENSIONS.lineHeight,
            fontFamily: "inherit",
            outline: "none",
            boxShadow: focused && !error ? `0 0 0 3px ${C.gold}25` : "none",
            opacity: disabled ? 0.55 : 1,
            cursor: disabled ? "not-allowed" : "text",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          }}
        />
      </div>
      {error && (
        <p style={{ color: C.red, fontSize: "11px", fontWeight: "600", margin: `${INPUT_DIMENSIONS.errorGap} 0 0` }}>
          {error}
        </p>
      )}
    </div>
  );
}
