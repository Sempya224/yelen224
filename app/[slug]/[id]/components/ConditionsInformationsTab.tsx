"use client";

// Onglet "Conditions & Informations" (Mon compte, chantier "Property
// Policies / Important details / Legal information", 24/07/2026) — 3
// textes libres remplis par l'institution elle-même, affichés en popup
// dédié sur la fiche publique (app/institution/[id]/page.tsx). Séparé de
// Profil Entreprise (déjà dense, 6 sections) — même route de sauvegarde
// réutilisée (api/institution/profile).
//
// Chaque section bascule vue/édition indépendamment (retour Bryan
// 24/07/2026 : une fois remplie, elle doit s'afficher en lecture avec un
// bouton "Modifier", pas rester un textarea ouvert en permanence) — donc
// une sauvegarde par champ (PUT partiel), pas un unique bouton global.
import { useEffect, useState } from "react";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";
import { useTheme } from "@/components/ThemeProvider";
import { fieldLabel, inputFieldStyle as fieldInput } from "./FormField";

type Form = { conditions_entreprise: string; informations_importantes: string; informations_legales: string };
const EMPTY_FORM: Form = { conditions_entreprise: "", informations_importantes: "", informations_legales: "" };

type Dates = { conditions_entreprise: string | null; informations_importantes: string | null; informations_legales: string | null };
const EMPTY_DATES: Dates = { conditions_entreprise: null, informations_importantes: null, informations_legales: null };

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function SectionLabel({ children, C }: { children: React.ReactNode; C: ThemeTokens }) {
  return <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "10px", marginTop: "4px" }}>{children}</div>;
}

// Exporté (chantier Hôtel, Phase 3, 19/08/2026) pour être réutilisé par
// ConfigurationHotelTab.tsx — même mécanisme d'édition/sauvegarde par champ,
// juste un autre champ (informations_importantes) avec un habillage
// hôtel-spécifique (titre/placeholder), aucune duplication de logique.
export function FieldCard({ C, title, hint, placeholder, field, savedValue, savedDate, onToast, onSaved }: {
  C: ThemeTokens; title: string; hint: string; placeholder: string;
  field: keyof Form; savedValue: string; savedDate: string | null;
  onToast: (msg: string, color?: string) => void;
  onSaved: (field: keyof Form, value: string, date: string) => void;
}) {
  const [editing, setEditing] = useState(!savedValue.trim());
  const [draft, setDraft] = useState(savedValue);
  const [saving, setSaving] = useState(false);

  const startEdit = () => { setDraft(savedValue); setEditing(true); };
  const cancelEdit = () => { setDraft(savedValue); setEditing(false); };

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/institution/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: draft }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      onToast(j?.error || "Erreur lors de l'enregistrement.", C.red);
      return;
    }
    onSaved(field, draft, new Date().toISOString());
    setEditing(false);
    onToast(`${title} enregistré.`, C.green);
  };

  return (
    <div>
      <SectionLabel C={C}>{title}</SectionLabel>
      <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "18px" }}>
        {editing ? (
          <>
            <label style={fieldLabel(C)}>{hint}</label>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6} placeholder={placeholder} style={{ ...fieldInput(C), resize: "none", lineHeight: 1.6 }}/>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
              {savedValue.trim() && (
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" disabled={saving} onClick={cancelEdit}>Annuler</Button>
              )}
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" loading={saving} onClick={save}>Enregistrer</Button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <p style={{ color: C.t1, fontSize: "13px", lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" }}>{savedValue}</p>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ color: C.gold, flexShrink: 0 }}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
                onClick={startEdit}>Modifier</Button>
            </div>
            {savedDate && <p style={{ color: C.t3, fontSize: "10.5px", margin: "10px 0 0" }}>Visible publiquement · mis à jour le {fmtDate(savedDate)}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

export function ConditionsInformationsTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [dates, setDates] = useState<Dates>(EMPTY_DATES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/institution/profile?institution_id=${instId}`);
      const j = res.ok ? await res.json().catch(() => null) : null;
      const inst = j?.institution;
      setForm({
        conditions_entreprise: inst?.conditions_entreprise || "",
        informations_importantes: inst?.informations_importantes || "",
        informations_legales: inst?.informations_legales || "",
      });
      setDates({
        conditions_entreprise: inst?.conditions_entreprise_le || null,
        informations_importantes: inst?.informations_importantes_le || null,
        informations_legales: inst?.informations_legales_le || null,
      });
      setLoading(false);
    })();
  }, [instId]);

  const handleSaved = (field: keyof Form, value: string, date: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setDates(d => ({ ...d, [field]: date }));
  };

  if (loading) {
    return <div style={{ padding: "48px", display: "flex", justifyContent: "center" }}><YelenLoader size={24}/></div>;
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "6px" }}>Conditions et informations</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Ces 3 textes sont visibles publiquement sur votre fiche, chacun dans son propre panneau. Tant qu&apos;une section n&apos;est pas remplie, les citoyens voient &quot;Cet établissement n&apos;a pas encore renseigné cette section.&quot;
        </p>

        <FieldCard
          C={C} title="Conditions de l'entreprise" hint="Conditions de réservation, d'annulation, etc."
          placeholder="Ex : Annulation gratuite jusqu'à 24h avant le rendez-vous…"
          field="conditions_entreprise" savedValue={form.conditions_entreprise} savedDate={dates.conditions_entreprise} onToast={onToast} onSaved={handleSaved}
        />
        <FieldCard
          C={C} title="Informations importantes" hint="Ce qu'un citoyen doit savoir avant de venir"
          placeholder="Ex : Pièce d'identité obligatoire, parking disponible…"
          field="informations_importantes" savedValue={form.informations_importantes} savedDate={dates.informations_importantes} onToast={onToast} onSaved={handleSaved}
        />
        <FieldCard
          C={C} title="Informations légales" hint="Raison sociale, numéro d'enregistrement, etc."
          placeholder="Ex : RCCM, forme juridique, siège social…"
          field="informations_legales" savedValue={form.informations_legales} savedDate={dates.informations_legales} onToast={onToast} onSaved={handleSaved}
        />
      </div>
    </div>
  );
}
