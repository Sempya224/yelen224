"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { YelenLoaderEcran } from "@/components/YelenLoader";

type LigneHistorique = {
  id: string;
  points_delta: number;
  raison: string;
  source_type: string;
  rule_code: string | null;
  created_at: string;
};

const OR = "#F5A623";
const INDIGO_MOYEN = "#2B2560";
const ROSE_SOURDE = "#C2685E";
const TEAL = "#0E9488";
const VIOLET = "#8B5CF6";

// Même langage graphique que l'écran principal (recompenses-client.tsx) :
// pas de duplication du composant, juste le même vocabulaire d'icônes
// trait propre à Yelen (jamais de clipart générique).
const Ic = {
  Spark: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3c.8 4.4 2.8 6.4 7 7-4.2.8-6.2 2.8-7 7-.8-4.2-2.8-6.2-7-7 4.2-.6 6.2-2.6 7-7z" fill={OR}/></svg>
  ),
  Absence: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ROSE_SOURDE} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M9 12h6"/></svg>
  ),
  CheckRay: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={OR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="m9 12 2 2 4-4"/></svg>
  ),
  Point: ({ color = OR }: { color?: string }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/></svg>
  ),
};

// Retour Bryan (26/07/2026) : chaque catégorie de point sur un fond
// différent, pas juste positif/négatif — même palette que l'écran
// principal (TEINTE_EVENEMENT dans recompenses-client.tsx).
const TEINTE_EVENEMENT: Record<string, string> = {
  rdv_complete: OR,
  rdv_no_show: ROSE_SOURDE,
  demarche_completed: TEAL,
  profil_complete: INDIGO_MOYEN,
  identite_verifiee: INDIGO_MOYEN,
  document_fourni: INDIGO_MOYEN,
  parrainage_active: VIOLET,
};

function teinteLigne(h: LigneHistorique): string {
  const code = h.rule_code ?? "";
  if (code && TEINTE_EVENEMENT[code]) return TEINTE_EVENEMENT[code];
  return h.points_delta < 0 ? ROSE_SOURDE : OR;
}

function iconeLigne(h: LigneHistorique): React.ReactNode {
  const code = h.rule_code ?? "";
  const teinte = teinteLigne(h);
  if (code === "rdv_no_show" || h.points_delta < 0) return <Ic.Absence/>;
  if (code === "rdv_complete") return <Ic.Spark/>;
  if (code.startsWith("demarche")) return <Ic.CheckRay/>;
  return <Ic.Point color={teinte}/>;
}

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function groupeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const jours = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Écran secondaire (push, pas modal) — historique complet du ledger de
// points, chaque ligne porte sa raison inline (jamais besoin d'un clic
// supplémentaire pour savoir pourquoi un point a bougé). Pagination par
// curseur (created_at de la dernière ligne chargée), même esprit que les
// autres listes paginées du projet.
export function HistoriqueRecompensesClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg  = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1  = isDark ? "#FFFFFF" : "#000000";
  const t2  = isDark ? "#8E8E93" : "#6C6C70";
  const t3  = isDark ? "#636366" : "#AEAEB2";
  const brd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [loading, setLoading] = useState(true);
  const [chargementSuite, setChargementSuite] = useState(false);
  const [lignes, setLignes] = useState<LigneHistorique[]>([]);
  const [curseurSuivant, setCurseurSuivant] = useState<string | null>(null);
  const [erreur, setErreur] = useState(false);

  const charger = useCallback(async (avant?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setErreur(true); setLoading(false); return; }
    try {
      const url = avant ? `/api/citoyen/rewards?avant=${encodeURIComponent(avant)}` : "/api/citoyen/rewards";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setLignes((prev) => avant ? [...prev, ...json.historique] : json.historique);
        setCurseurSuivant(json.historique_curseur_suivant);
      } else {
        setErreur(true);
      }
    } catch {
      setErreur(true);
    }
    setLoading(false);
    setChargementSuite(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void charger();
  }, [router, charger]);

  const groupes: { titre: string; lignes: LigneHistorique[] }[] = [];
  for (const l of lignes) {
    const titre = groupeDate(l.created_at);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.titre === titre) dernier.lignes.push(l);
    else groupes.push({ titre, lignes: [l] });
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <CompteHeader titre="Historique des points" fondNeutre retourHref="/menu/recompenses"/>

      <div style={{ padding: "16px", maxWidth: "560px", margin: "0 auto" }}>
        {loading ? (
          <YelenLoaderEcran labelColor={t3}/>
        ) : erreur ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: t3, fontSize: "14px", fontWeight: "600" }}>Impossible de charger votre historique.</div>
        ) : lignes.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: t3, fontSize: "14px", fontWeight: "600" }}>Aucune activité pour le moment.</div>
        ) : (
          <>
            {groupes.map((g) => (
              <div key={g.titre} style={{ marginBottom: "18px" }}>
                <div style={{ color: t2, fontSize: "12.5px", fontWeight: "700", marginBottom: "8px" }}>{g.titre}</div>
                <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", overflow: "hidden" }}>
                  {g.lignes.map((h, i) => {
                    const teinte = teinteLigne(h);
                    return (
                      <div key={h.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${brd}` }}>
                        <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: rgba(teinte, 0.14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{iconeLigne(h)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: t1, fontSize: "13px", fontWeight: "600" }}>{h.raison}</div>
                          <div style={{ color: t3, fontSize: "11.5px", marginTop: "2px" }}>{formatHeure(h.created_at)}</div>
                        </div>
                        <div style={{ flexShrink: 0, background: rgba(teinte, 0.14), color: teinte, fontSize: "13px", fontWeight: "800", padding: "4px 10px", borderRadius: "20px" }}>
                          {h.points_delta >= 0 ? `+${h.points_delta}` : h.points_delta}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {curseurSuivant && (
              <button
                onClick={() => { setChargementSuite(true); void charger(curseurSuivant); }}
                disabled={chargementSuite}
                style={{ width: "100%", padding: "12px", borderRadius: "14px", border: `1px solid ${brd}`, background: card, color: t1, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
              >
                {chargementSuite ? "Chargement…" : "Charger plus"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
