"use client";

// Onglet "Configuration Hôtel" (chantier Hôtel, Phase 3, 19/08/2026,
// docs/ui/YELEN_HOTEL_MODEL_AUDIT.md Partie 6/15) — écran dédié pour les
// institutions secteur="hotel" uniquement (gating dans page.tsx, patron
// "mes-offres"/partenaire_statut).
//
// Refonte "Équipements structurés" (21/08/2026, décision Bryan) —
// l'ancien texte libre "Équipements & règles" (FieldCard sur
// informations_importantes) est remplacé par une checklist catégorisée
// (institutions.equipements_etablissement, vocabulaire contrôlé
// lib/hotelEquipements.tsx, source unique dashboard + fiche publique).
// `informations_importantes` reste utilisé, mais réduit à ce qu'une
// checklist ne peut pas représenter (horaires check-in/check-out,
// restrictions, conditions particulières) — jamais un doublon des
// équipements. Aucun impact sur les 14 autres secteurs : ni ce fichier,
// ni ConditionsInformationsTab.tsx (inchangé) ne sont partagés avec eux.
//
// "Chambres" ne vivent pas ici — restent gérées dans l'onglet Services
// (ServicesHotelTab.tsx), qui porte aussi les équipements PAR CHAMBRE
// (paid_services.equipements_chambre) — séparation stricte établissement/
// chambre demandée par Bryan : un groupe électrogène de l'hôtel ne
// signifie pas que chaque chambre a la climatisation.
import { useEffect, useState } from "react";
import { T, type ThemeTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { useTheme } from "@/components/ThemeProvider";
import { FieldCard } from "./ConditionsInformationsTab";
import { EQUIPEMENTS_ETABLISSEMENT } from "@/lib/hotelEquipements";
import type { TabKey } from "@/lib/institutionPermissions";

export function ConfigurationHotelTab({ instId, onToast, onNavigate }: { instId: string; onToast: (msg: string, color?: string) => void; onNavigate: (tab: TabKey) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [savedValue, setSavedValue] = useState("");
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const [equipements, setEquipements] = useState<string[]>([]);
  const [savedEquipements, setSavedEquipements] = useState<string[]>([]);
  const [savingEquipements, setSavingEquipements] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/institution/profile?institution_id=${instId}`);
      const j = res.ok ? await res.json().catch(() => null) : null;
      const inst = j?.institution;
      setSavedValue(inst?.informations_importantes || "");
      setSavedDate(inst?.informations_importantes_le || null);
      const eq = Array.isArray(inst?.equipements_etablissement) ? inst.equipements_etablissement as string[] : [];
      setEquipements(eq);
      setSavedEquipements(eq);
      setLoading(false);
    })();
  }, [instId]);

  const dirty = JSON.stringify([...equipements].sort()) !== JSON.stringify([...savedEquipements].sort());

  const toggleEquipement = (code: string) => {
    setEquipements(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  async function handleSaveEquipements() {
    setSavingEquipements(true);
    const res = await fetch("/api/institution/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipements_etablissement: equipements }),
    });
    setSavingEquipements(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      onToast(j?.error || "Erreur lors de l'enregistrement.", C.red);
      return;
    }
    setSavedEquipements(equipements);
    onToast("Équipements de l'établissement enregistrés.", C.green);
  }

  if (loading) {
    return <div style={{ padding: "48px", display: "flex", justifyContent: "center" }}><YelenLoader size={24}/></div>;
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Configuration Hôtel</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Visible publiquement sur votre fiche, section &quot;Équipements&quot;. Un équipement non coché n&apos;apparaît pas côté citoyen.
        </p>

        <button
          onClick={() => onNavigate("services" as TabKey)}
          className="tap"
          style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "12px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "20px", cursor: "pointer" }}
        >
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: `${C.gold}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/><path d="M3 18h18"/><path d="M5 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800" }}>Gérer vos chambres</div>
            <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px", lineHeight: 1.5 }}>Les chambres — et leurs propres équipements — se créent dans l&apos;onglet Services, pas ici.</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "10px" }}>Équipements de l&apos;établissement</div>
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", marginBottom: "18px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {EQUIPEMENTS_ETABLISSEMENT.map(cat => (
            <div key={cat.id}>
              <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{cat.label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {cat.items.map(item => {
                  const checked = equipements.includes(item.code);
                  return (
                    <button key={item.code} onClick={() => toggleEquipement(item.code)} className="tap" style={{ display: "flex", alignItems: "center", gap: "7px", backgroundColor: checked ? `${C.gold}15` : C.bg3, border: `1.5px solid ${checked ? C.gold + "50" : C.border2}`, borderRadius: "20px", padding: "8px 13px", cursor: "pointer" }}>
                      {item.icon(checked ? C.gold : C.t3)}
                      <span style={{ color: checked ? C.gold : C.t2, fontSize: "12px", fontWeight: checked ? "700" : "500" }}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "4px", borderTop: `1px solid ${C.border}` }}>
            <button onClick={handleSaveEquipements} disabled={savingEquipements || !dirty} className="tap" style={{ marginTop: "12px", backgroundColor: savingEquipements || !dirty ? C.bg3 : C.gold, color: savingEquipements || !dirty ? C.t3 : "#000", border: "none", borderRadius: "10px", padding: "10px 18px", fontSize: "12.5px", fontWeight: "800", cursor: savingEquipements || !dirty ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              {savingEquipements ? <><YelenLoader size={12} color={C.t3}/>Sauvegarde…</> : dirty ? "Enregistrer" : "Modifier"}
            </button>
          </div>
        </div>

        <FieldCard
          C={C} title="Règles complémentaires" hint="Ce qu'une checklist ne peut pas dire : horaires de check-in/check-out, restrictions, conditions particulières"
          placeholder="Ex : Check-in à partir de 14h, check-out avant 12h. Pièce d'identité obligatoire à l'arrivée…"
          field="informations_importantes" savedValue={savedValue} savedDate={savedDate}
          onToast={onToast}
          onSaved={(_field, value, date) => { setSavedValue(value); setSavedDate(date); }}
        />
      </div>
    </div>
  );
}
