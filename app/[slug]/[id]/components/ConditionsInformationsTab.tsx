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
import { useCallback, useEffect, useRef, useState } from "react";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/components/ThemeProvider";
import { fieldLabel, inputFieldStyle as fieldInput } from "./FormField";
import { PanneauSkeleton, PanneauTexte, PiedAvantPublier } from "./ConditionsInformationsUi";

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

type Chargement = { form: Form; dates: Dates };

// Lecture seule du profil — renvoie null sur toute erreur (réseau, HTTP,
// corps invalide) pour que l'appelant distingue "indisponible" de "vide".
async function lireInstitution(instId: string): Promise<Chargement | null> {
  try {
    const res = await fetch(`/api/institution/profile?institution_id=${instId}`);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const inst = j?.institution;
    if (!inst) return null;
    return {
      form: {
        conditions_entreprise: inst.conditions_entreprise || "",
        informations_importantes: inst.informations_importantes || "",
        informations_legales: inst.informations_legales || "",
      },
      dates: {
        conditions_entreprise: inst.conditions_entreprise_le || null,
        informations_importantes: inst.informations_importantes_le || null,
        informations_legales: inst.informations_legales_le || null,
      },
    };
  } catch {
    return null;
  }
}

const PANNEAUX: { field: keyof Form; title: string; description: string; placeholder: string }[] = [
  { field: "conditions_entreprise", title: "Conditions de l'entreprise", description: "Conditions de réservation, d'annulation, etc.", placeholder: "Ex : Annulation gratuite jusqu'à 24h avant le rendez-vous…" },
  { field: "informations_importantes", title: "Informations importantes", description: "Ce qu'un client doit savoir avant de venir", placeholder: "Ex : Pièce d'identité obligatoire, parking disponible…" },
  { field: "informations_legales", title: "Informations légales", description: "Raison sociale, numéro d'enregistrement, etc.", placeholder: "Ex : RCCM, forme juridique, siège social…" },
];

export function ConditionsInformationsTab({ instId, onToast, hrefSupport }: { instId: string; onToast: (msg: string, color?: string) => void; hrefSupport: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [dates, setDates] = useState<Dates>(EMPTY_DATES);
  const [loading, setLoading] = useState(true);
  const [indisponible, setIndisponible] = useState(false);
  const [essai, setEssai] = useState(0);
  const [brouillons, setBrouillons] = useState<Record<string, boolean>>({});
  const monte = useRef(true);

  useEffect(() => {
    monte.current = true;
    return () => { monte.current = false; };
  }, []);

  useEffect(() => {
    let annule = false;
    (async () => {
      const r = await lireInstitution(instId);
      if (annule) return;
      if (r) {
        setForm(r.form);
        setDates(r.dates);
        setIndisponible(false);
      } else {
        setIndisponible(true);
      }
      setLoading(false);
    })();
    return () => { annule = true; };
  }, [instId, essai]);

  const reessayer = () => { setLoading(true); setEssai(n => n + 1); };

  const onDirtyChange = useCallback((field: string, dirty: boolean) => {
    setBrouillons(b => (b[field] === dirty ? b : { ...b, [field]: dirty }));
  }, []);

  const aBrouillon = Object.values(brouillons).some(Boolean);
  useEffect(() => {
    if (!aBrouillon) return;
    const avertir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [aBrouillon]);

  // Même PUT partiel qu'avant (un champ par requête). La date affichée
  // n'est jamais celle du navigateur : on relit la valeur serveur après
  // l'enregistrement, et à défaut on n'affiche aucune date.
  const enregistrer = async (field: keyof Form, title: string, value: string): Promise<string | null> => {
    let res: Response;
    try {
      res = await fetch("/api/institution/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch {
      return "Connexion impossible. Vérifiez votre réseau puis réessayez.";
    }
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return j?.error || "Erreur lors de l'enregistrement.";
    }
    const frais = await lireInstitution(instId);
    if (!monte.current) return null;
    // Valeur relue du serveur (texte normalisé à l'enregistrement), à défaut
    // celle envoyée.
    setForm(f => ({ ...f, [field]: frais?.form[field] ?? value }));
    setDates(d => ({ ...d, [field]: frais?.dates[field] ?? null }));
    onToast(`${title} enregistré.`, C.green);
    return null;
  };

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.15s ease" }}>
      <style>{`
        .ci-skeleton{animation:ci-pulse 1.4s ease-in-out infinite}
        @keyframes ci-pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @media (max-width:640px){.ci-btn{height:44px !important;min-width:44px}}
        @media (prefers-reduced-motion:reduce){.ci-skeleton{animation:none}.ci-panel,.ci-panel *{transition:none !important;animation:none !important}}
      `}</style>
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.4px", margin: "0 0 6px" }}>Conditions et informations</h1>
        <p style={{ color: C.t2, fontSize: "13px", margin: 0, lineHeight: 1.5 }}>
          Chaque établissement a ses propres règles. Précisez ici les vôtres : vos conditions de réservation et d&apos;annulation, ce que vos clients doivent savoir avant de venir, et vos informations légales.
        </p>
        <p style={{ color: C.t2, fontSize: "13px", margin: "4px 0 20px", lineHeight: 1.5 }}>
          Ces trois textes apparaissent sur votre fiche publique, chacun dans son propre panneau. Si l&apos;un d&apos;eux reste vide, vos clients voient un message par défaut.
        </p>

        {loading ? (
          <div role="status" aria-label="Chargement" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <PanneauSkeleton C={C}/><PanneauSkeleton C={C}/><PanneauSkeleton C={C}/>
          </div>
        ) : indisponible ? (
          <Card tokens={toCardTokens(C)} padding="28px 20px" style={{ textAlign: "center" }}>
            <div role="alert">
              <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 6px" }}>Informations indisponibles</h2>
              <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, margin: "0 0 16px" }}>Les textes n&apos;ont pas pu être chargés.</p>
            </div>
            <Button tokens={toUiTokens(C)} variant="secondary" size="sm" className="ci-btn" onClick={reessayer}>Réessayer</Button>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {PANNEAUX.map(p => (
              <PanneauTexte
                key={p.field}
                C={C} field={p.field} title={p.title} description={p.description} placeholder={p.placeholder}
                savedValue={form[p.field]} savedDate={dates[p.field]}
                onSave={value => enregistrer(p.field, p.title, value)}
                onDirtyChange={onDirtyChange}
              />
            ))}
          </div>
        )}
        <PiedAvantPublier C={C} hrefSupport={hrefSupport}/>
      </div>
    </div>
  );
}
