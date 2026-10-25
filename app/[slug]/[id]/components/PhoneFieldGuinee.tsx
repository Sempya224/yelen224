"use client";

// Champ téléphone avec addon +224 (refonte ProfilEntrepriseTab, Étape D,
// 19/10/2026) — réutilise lib/phoneGuinee.ts (déjà la source unique de
// validation des numéros guinéens côté citoyen, aucune duplication de
// règles ARPT/préfixes ici). `value` reste le texte libre tel que stocké
// par api/institution/profile (EDITABLE_FIELDS "phone"/"whatsapp", jamais
// validé/formaté côté serveur avant ce chantier) — la validation reste
// purement indicative (ne bloque pas handleSave), pour ne pas casser un
// numéro déjà enregistré dans un format différent avant que l'institution
// n'y retouche elle-même.
import { useState } from "react";
import type { ReactNode } from "react";
import type { ThemeTokens } from "../theme";
import { fieldLabel, ModifiedMark, trackedFieldColors } from "./FormField";
import { filtrerSaisiePhone, normaliserChiffresPhone, validerFormatPhoneGuinee } from "@/lib/phoneGuinee";

function chiffresDepuisValeurStockee(value: string): string {
  const sansIndicatif = value.replace(/^\+?224/, "");
  return normaliserChiffresPhone(sansIndicatif);
}

export function PhoneFieldGuinee({ C, label, required, value, onChange, name, disabled, extra, modified, justSaved = false, readOnly = false }: {
  C: ThemeTokens; label: string; required?: boolean; value: string;
  onChange: (value: string) => void; name?: string; disabled?: boolean; extra?: ReactNode;
  modified?: boolean; justSaved?: boolean; readOnly?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const colors = modified !== undefined ? trackedFieldColors(C, modified, justSaved, hovered) : null;
  const chiffres = chiffresDepuisValeurStockee(value);
  const validation = validerFormatPhoneGuinee(chiffres);
  const erreur = chiffres.length > 0 ? validation.message : null;

  function handleChange(raw: string) {
    const chiffresFiltres = normaliserChiffresPhone(filtrerSaisiePhone(raw)).slice(0, 9);
    onChange(chiffresFiltres.length ? `+224${chiffresFiltres}` : "");
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <label style={{ ...fieldLabel(C), marginBottom: 0 }}>{label}{required && " *"}{modified && <ModifiedMark C={C}/>}</label>
        {extra}
      </div>
      <div className="yl-field" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
        display: "flex", alignItems: "center", height: "40px", borderRadius: "10px", overflow: "hidden",
        border: erreur ? `1px solid ${C.red}` : focused ? `1px solid ${C.gold}` : colors ? colors.border : `1px solid ${C.border}`,
        transition: "border-color 0.15s ease, background-color 0.3s ease",
        boxShadow: focused && !erreur ? `0 0 0 3px ${C.gold}25` : "none",
        opacity: disabled ? 0.55 : 1,
      }}>
        <span style={{ padding: "0 10px", height: "100%", display: "flex", alignItems: "center", backgroundColor: C.bg3, color: C.t2, fontSize: "13px", fontWeight: "700", borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>
          +224
        </span>
        <input
          name={name}
          type="tel"
          inputMode="numeric"
          value={chiffres}
          disabled={disabled}
          readOnly={readOnly}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="6XX XXX XXX"
          style={{ flex: 1, height: "100%", boxSizing: "border-box", padding: "0 13px", border: "none", outline: "none", backgroundColor: colors ? colors.bg : C.bg3, color: C.t1, fontSize: "13px", fontFamily: "inherit", cursor: disabled ? "not-allowed" : "text" }}
        />
      </div>
      {erreur && <p role="alert" style={{ color: C.red, fontSize: "11px", fontWeight: "600", margin: "6px 0 0" }}>{erreur}</p>}
    </div>
  );
}
