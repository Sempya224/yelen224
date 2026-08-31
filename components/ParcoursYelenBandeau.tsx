"use client";

// "Votre parcours Yelen" — composant "Up Next" partagé (retour Bryan
// 27/08/2026), extrait de components/MonAssistant.tsx pour être réutilisé
// tel quel sur l'Accueil (app/page.tsx) en plus du sheet Mon Assistant —
// diagnostic d'un flicker observé (bandeau et "Pour vous" semblant
// s'exclure) potentiellement lié au remontage de MonAssistant à chaque
// changement d'onglet. Fetch et logique d'affichage strictement identiques
// dans les deux emplacements : une seule source de vérité.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { ETAPES_PARCOURS_YELEN, prochaineEtapeParcours, type EtapeParcoursEtat } from "@/lib/parcoursYelen";

type ParcoursLite = { etapes: EtapeParcoursEtat[]; completees: number; total: number };

const IcX = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcChev = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;

export function ParcoursYelenBandeau({ userId }: { userId: string | null }) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const card2 = isDark ? "#232328" : "#F2F2F5";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#9999A6" : "#5A5A63";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  const [parcours, setParcours] = useState<ParcoursLite | null>(null);
  const [parcoursFerme, setParcoursFerme] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      if (!userId) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch("/api/citoyen/assistant", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json().catch(() => null);
        if (!annule && res.ok && json?.success) setParcours(json.parcours ?? null);
      } catch { /* silencieux — bandeau annexe, ne doit jamais casser l'écran hôte */ }
    })();
    return () => { annule = true; };
  }, [userId]);

  if (!parcours) return null;
  const parcoursTermine = parcours.completees >= parcours.total;
  if (parcoursTermine || parcoursFerme) return null;

  const prochaineEtape = prochaineEtapeParcours(parcours.etapes);
  let titre = "Continuez votre parcours Yelen";
  let sousTexte = "";
  if (parcours.completees === 0) {
    sousTexte = "Commencez par compléter votre profil.";
  } else if (parcours.completees === parcours.total - 1) {
    titre = "Vous êtes presque arrivé !";
    sousTexte = "Il vous reste une étape pour compléter votre parcours Yelen.";
  } else if (prochaineEtape) {
    sousTexte = `Prochaine étape : ${prochaineEtape.titre.charAt(0).toLowerCase()}${prochaineEtape.titre.slice(1)}.`;
  }

  return (
    <div onClick={() => router.push("/compte/parcours-yelen")} className="tap" style={{ cursor: "pointer", border: `1px solid ${brd}`, overflow: "hidden" }}>
      <div style={{ background: isDark ? "#000000" : "#111114", padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ color: "#fff", fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.06em" }}>Parcours Yelen</span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", fontWeight: "700" }}>{parcours.completees}/{parcours.total}</span>
            <button onClick={(e) => { e.stopPropagation(); setParcoursFerme(true); }} aria-label="Fermer" className="tap" style={{ background: "none", border: "none", padding: "2px", cursor: "pointer", color: "rgba(255,255,255,0.55)", flexShrink: 0, display: "flex" }}><IcX/></button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {ETAPES_PARCOURS_YELEN.map((etape) => {
            const fait = parcours.etapes.find((e) => e.code === etape.code)?.complete ?? false;
            return <div key={etape.code} style={{ flex: 1, height: "4px", background: fait ? "#F5A623" : "rgba(255,255,255,0.18)" }}/>;
          })}
        </div>
      </div>
      <div style={{ background: card2, padding: "13px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "22px", height: "22px", borderRadius: "50%", border: `2px solid ${t3}`, flexShrink: 0 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "2px" }}>{titre}</div>
          {sousTexte && <div style={{ color: t2, fontSize: "12px", lineHeight: 1.4 }}>{sousTexte}</div>}
        </div>
        <div style={{ color: t3, flexShrink: 0, opacity: 0.7 }}><IcChev/></div>
      </div>
    </div>
  );
}
