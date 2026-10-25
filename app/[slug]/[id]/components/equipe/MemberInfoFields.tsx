"use client";

// Section « Informations » du modal d'ajout : une colonne, labels en casse
// normale, champs blancs de 40 px. Présentation pure — état et handlers
// restent dans EquipeTab (les setters sont passés tels quels).
import type { ThemeTokens } from "../../theme";

function Champ({ C, id, label, value, onChange, onEnter, placeholder, optionnel, requis, prefixe, aide, autoFocus, autoComplete, name }: {
  C: ThemeTokens; id: string; label: string; value: string; onChange: (v: string) => void; onEnter: () => void;
  placeholder: string; optionnel?: boolean; requis?: boolean; prefixe?: string; aide?: string;
  autoFocus?: boolean; autoComplete?: string; name: string;
}) {
  const aideId = aide ? `${id}-aide` : undefined;
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>
        {label}
        {requis && <span aria-hidden="true" style={{ color: C.red, marginLeft: "3px" }}>*</span>}
        {optionnel && <span style={{ color: C.t3, fontWeight: 400 }}> (optionnel)</span>}
      </label>
      <div style={{ position: "relative" }}>
        {prefixe && <span aria-hidden="true" style={{ position: "absolute", left: "12px", top: 0, height: "40px", display: "flex", alignItems: "center", color: C.t3, fontSize: "14px" }}>{prefixe}</span>}
        <input
          id={id} name={name} value={value} autoComplete={autoComplete} aria-required={requis || undefined} aria-describedby={aideId}
          data-autofocus={autoFocus ? "" : undefined}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }}
          placeholder={placeholder}
          className="eq-field eq-anim"
          style={{ width: "100%", height: "40px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t1, fontSize: "14px", padding: prefixe ? "0 12px 0 28px" : "0 12px" }}
        />
      </div>
      {aide && <p id={aideId} style={{ color: C.t3, fontSize: "12.5px", margin: "6px 0 0" }}>{aide}</p>}
    </div>
  );
}

export function MemberInfoFields({ C, prenom, nom, fonction, identifiant, onPrenom, onNom, onFonction, onIdentifiant, onEnter }: {
  C: ThemeTokens; prenom: string; nom: string; fonction: string; identifiant: string;
  onPrenom: (v: string) => void; onNom: (v: string) => void; onFonction: (v: string) => void; onIdentifiant: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <section aria-labelledby="eq-infos-titre">
      <h3 id="eq-infos-titre" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: "0 0 12px" }}>Informations</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="eq-name-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Champ C={C} id="eq-prenom" name="prenom" label="Prénom" requis autoFocus autoComplete="given-name" placeholder="Prénom" value={prenom} onChange={onPrenom} onEnter={onEnter}/>
          <Champ C={C} id="eq-nom" name="nom" label="Nom" requis autoComplete="family-name" placeholder="Nom" value={nom} onChange={onNom} onEnter={onEnter}/>
        </div>
        <Champ C={C} id="eq-fonction" name="fonction" label="Fonction" optionnel placeholder="ex : Directeur, Secrétaire médicale…" value={fonction} onChange={onFonction} onEnter={onEnter}/>
        <Champ C={C} id="eq-identifiant" name="identifiant" label="Identifiant de connexion" requis prefixe="@" placeholder="ex : dr.diallo" value={identifiant} onChange={onIdentifiant} onEnter={onEnter}
          aide="C'est ce que le membre tapera pour se connecter — sans espace, unique dans tout Yelen224."/>
      </div>
    </section>
  );
}
