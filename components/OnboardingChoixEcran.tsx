"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import type { OnboardingOption } from "@/lib/onboardingPhase2";
import type { OnboardingActionResult } from "@/app/premiers-pas/actions";

// Écran générique à choix multiples du parcours Onboarding Phase 2
// (Usage/Attentes/Acquisition, chantier 11/09/2026) — même structure pour
// les 3, seuls le copy/la taxonomie/la Server Action changent. Décision
// Bryan : jamais de compteur "Étape X/Y", Passer et Continuer toujours
// ensemble en bas. Pas de chargement de valeurs existantes : cet écran
// n'est atteint qu'une fois, juste après l'inscription.
type SaveFn = (userId: string, accessToken: string, valeurs: string[]) => Promise<OnboardingActionResult>;

export function OnboardingChoixEcran({ titre, sousTitre, options, onSauvegarder, onContinuer, onPasser }: {
  titre: string;
  sousTitre: string;
  options: OnboardingOption[];
  onSauvegarder: SaveFn;
  onContinuer: () => void;
  onPasser: () => void;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";

  const [userId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(YELEN224_USER_ID_KEY); } catch { return null; }
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [autreActif, setAutreActif] = useState(false);
  const [autreTexte, setAutreTexte] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) router.replace("/inscription");
  }, [userId, router]);

  function toggle(id: string) {
    setSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const estVide = selection.size === 0 && !autreActif;

  async function enregistrerEtContinuer() {
    if (!userId) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setToast("Session expirée, reconnectez-vous.");
      setSaving(false);
      return;
    }
    const valeurs = Array.from(selection);
    if (autreActif) valeurs.push(autreTexte.trim() ? `Autre : ${autreTexte.trim()}` : "Autre");
    const result = await onSauvegarder(userId, session.access_token, valeurs);
    setSaving(false);
    if (result.ok) { onContinuer(); return; }
    setToast(result.error || "Échec de l'enregistrement.");
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ height: "calc(env(safe-area-inset-top) + 8px)" }}/>

      <div style={{ padding: "20px 20px 8px" }}>
        <div style={{ color: t1, fontSize: "19px", fontWeight: "900", marginBottom: "6px" }}>{titre}</div>
        <div style={{ color: t2, fontSize: "13px", lineHeight: "1.5" }}>{sousTitre}</div>
      </div>

      <div style={{ padding: "8px 20px 140px", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
        {options.map(opt => {
          const actif = selection.has(opt.id);
          return (
            <button key={opt.id} onClick={() => toggle(opt.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderRadius: "16px", border: "none", backgroundColor: card, cursor: "pointer", textAlign: "left" }}>
              <span style={{ flexShrink: 0, width: "20px", height: "20px", borderRadius: "6px", border: `2px solid ${actif ? "#F5A623" : t2}`, backgroundColor: actif ? "#F5A623" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {actif && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
              </span>
              <span style={{ color: t1, fontSize: "14.5px", fontWeight: "700" }}>{opt.label}</span>
            </button>
          );
        })}

        <button onClick={() => setAutreActif(a => !a)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderRadius: "16px", border: "none", backgroundColor: card, cursor: "pointer", textAlign: "left" }}>
          <span style={{ flexShrink: 0, width: "20px", height: "20px", borderRadius: "6px", border: `2px solid ${autreActif ? "#F5A623" : t2}`, backgroundColor: autreActif ? "#F5A623" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {autreActif && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
          </span>
          <span style={{ color: t1, fontSize: "14.5px", fontWeight: "700" }}>Autre</span>
        </button>
        {autreActif && (
          <input value={autreTexte} onChange={e => setAutreTexte(e.target.value)} placeholder="Précisez…" style={{ padding: "13px 16px", borderRadius: "16px", border: "none", backgroundColor: card, color: t1, fontSize: "14px", fontFamily: "inherit" }}/>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px calc(env(safe-area-inset-bottom) + 16px)", background: `linear-gradient(180deg, transparent, ${bg} 30%)`, display: "flex", gap: "10px" }}>
        <button onClick={onPasser} disabled={saving} className="tap" style={{ flex: "0 0 auto", padding: "16px 20px", borderRadius: "26px", border: "none", backgroundColor: "transparent", color: t2, fontSize: "15px", fontWeight: "800", cursor: saving ? "default" : "pointer" }}>
          Passer
        </button>
        <button onClick={enregistrerEtContinuer} disabled={saving || estVide} className="tap" style={{ flex: 1, padding: "16px", borderRadius: "26px", border: "none", backgroundColor: estVide ? card : "#F5A623", color: estVide ? t2 : "#080812", fontSize: "15px", fontWeight: "800", cursor: (saving || estVide) ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Enregistrement…" : "Continuer"}
        </button>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: "90px", left: "50%", transform: "translateX(-50%)", padding: "10px 18px", borderRadius: "20px", backgroundColor: "#080812", color: "#fff", fontSize: "12.5px", fontWeight: "700", animation: "toastIn 0.25s ease", zIndex: 300 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
