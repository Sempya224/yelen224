# YELEN224 — Référence dimensionnelle UI (dashboards professionnels)

Document vivant : contient uniquement les règles dimensionnelles **officiellement adoptées** (implémentées et testées), pas les propositions. Pour l'historique des audits et le détail des lots, voir `docs/ui/YELEN_UI_DENSITY_AUDIT.md`.

Périmètre actuel : dashboard Institution (`app/institution/[id]/dashboard/`). Le dashboard Admin (`app/admin/`) a son propre système partiel (`adminTheme.ts`, `adminUiKit.tsx`) — non couvert ici tant qu'aucun lot ne l'a explicitement traité.

---

## Champs texte (`<input>`)

**Composant :** `FormField` — `app/institution/[id]/dashboard/components/FormField.tsx`
**Adopté :** Lot UI 2 (14/08/2026), étendu Lot UI 3 (14/08/2026)
**Utilisé dans :** `ProfilResponsableTab.tsx`, `ProfilEntrepriseTab.tsx`, `ConditionsInformationsTab.tsx` (import seulement), `EquipeTab.tsx`, `CommunicationTab.tsx`, `DocumentsClientsTab.tsx`, `SignalementsTab.tsx`, `MesOffresTab.tsx`, `ServicesTab.tsx`, `ClockInShiftTab.tsx`

**Règle de migration (Lot UI 3)** : seuls les champs texte avec un `<label>` déjà visible ont été migrés. Volontairement exclus : champs sans label existant (formulaires compacts "placeholder seul" type ajout rapide/recherche — les migrer aurait ajouté du contenu, pas juste standardisé des dimensions), `<input type="date"/"time"/"number">`, `<select>`, champs à formatage spécial (PIN avec `letterSpacing`/`textAlign`/`inputMode`), variantes "denses" avec `padding`/`fontSize` réduits pour un contexte d'édition inline. Ces champs restent sur leur style local d'origine, inchangé.

```tsx
import { FormField } from "./FormField"; // depuis app/institution/[id]/dashboard/components/

<FormField
  C={C}                      // ThemeTokens du thème actif
  label="Nom"                // requis
  required                   // optionnel — ajoute " *" au label
  value={form.nom}
  onChange={(v) => fc("nom", v)}
  type="text"                 // "text" | "email" | "tel" | "url", défaut "text"
  placeholder="…"             // optionnel
  disabled={readOnly}         // optionnel
  error={undefined}           // optionnel — string, affiche un message rouge sous le champ
  icon={undefined}            // optionnel — ReactNode affiché à gauche du champ
  name="nom"                  // optionnel
  autoComplete="name"         // optionnel
/>
```

### Dimensions

| Propriété | Valeur |
|---|---|
| Hauteur | `40px` (fixe, `box-sizing: border-box`) |
| Padding horizontal | `13px` (`38px` côté icône si `icon` fourni) |
| Taille de police | `13px` |
| Hauteur de ligne | `1.4` |
| Rayon | `10px` |
| Épaisseur de bordure | `1px` |
| Taille d'icône recommandée | `16px` |
| Espacement label → champ | `6px` |
| Espacement champ → message d'erreur | `6px` |

Ces valeurs sont exportées sous `INPUT_DIMENSIONS` depuis `FormField.tsx` — à réutiliser telles quelles pour tout nouveau champ texte plutôt que redéfinies.

### États

| État | Comportement |
|---|---|
| Repos | Bordure `C.border`, fond `C.bg3` |
| Focus | Bordure `C.gold`, anneau `0 0 0 3px ${C.gold}25` |
| Disabled | `opacity: 0.55`, `cursor: not-allowed` |
| Erreur | Bordure `C.red`, message `C.red` sous le champ (prioritaire sur le focus visuellement) |

### Hors périmètre de `FormField` (volontairement)

- `<textarea>` — reste sur `fieldLabel`/`inputFieldStyle` (mêmes valeurs de base, sans les états focus/erreur/icône de `FormField`).
- `<input type="date">` / `<input type="time">` — non standardisés à ce jour, dimensions encore variables selon l'écran (voir audit §2.1).
- Selects/dropdowns — non standardisés à ce jour.

### `fieldLabel` / `inputFieldStyle` (styles bruts, non composant)

Conservés pour les usages ci-dessus (textarea, time, label sans champ associé) — valeurs identiques à l'ancien style dupliqué, aucun changement :

```tsx
import { fieldLabel, inputFieldStyle } from "./FormField";

<label style={fieldLabel(C)}>Description</label>
<textarea style={{ ...inputFieldStyle(C), resize: "none", lineHeight: 1.6 }} .../>
```

---

## Historique des règles adoptées

| Date | Lot | Règle ajoutée |
|---|---|---|
| 14/08/2026 | Lot UI 2 | Échelle dimensionnelle des champs texte (`FormField`, `INPUT_DIMENSIONS`) |
| 14/08/2026 | Lot UI 3 | Extension de `FormField` à 7 fichiers supplémentaires (champs texte labellisés uniquement) ; ajout du prop `maxLength` |

Ce tableau grandit à chaque lot qui adopte une nouvelle règle dimensionnelle — ne pas réécrire l'historique des lots précédents, seulement ajouter.
