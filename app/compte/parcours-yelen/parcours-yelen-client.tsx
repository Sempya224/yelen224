"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { YelenLoader } from "@/components/YelenLoader";
import { ETAPES_PARCOURS_YELEN, type EtapeParcoursCode, type EtapeParcoursEtat } from "@/lib/parcoursYelen";

// "Votre parcours Yelen" — écran dédié, brief CEO "Up Next" (27/08/2026)
// §6. Réutilise GET /api/citoyen/assistant::parcours (même source que le
// bandeau de components/MonAssistant.tsx) — jamais un second calcul
// d'état, jamais une route dédiée en double.

const P = { pointerEvents: "none" as const };
const Ic: Record<EtapeParcoursCode | "Check", () => React.ReactNode> = {
  profile_completed: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  identity_verified: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  first_procedure_created: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  first_expense_completed: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  first_establishment_discovered: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Check: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
};

type ParcoursLite = { etapes: EtapeParcoursEtat[]; completees: number; total: number };

export function ParcoursYelenClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [parcours, setParcours] = useState<ParcoursLite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    void (async () => {
      let uid: string | null = null;
      try { uid = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
      if (!uid) { router.push("/login"); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      try {
        const res = await fetch("/api/citoyen/assistant", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json().catch(() => null);
        if (!annule && res.ok && json?.success) setParcours(json.parcours ?? null);
      } catch {}
      if (!annule) setLoading(false);
    })();
    return () => { annule = true; };
  }, [router]);

  return (
    <div style={{ minHeight: "100svh", background: bg, color: t1, fontFamily: "-apple-system,'SF Pro Text','Helvetica Neue',sans-serif", paddingBottom: 60 }}>
      <CompteHeader titre="Votre parcours Yelen" fondNeutre/>

      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.5, marginBottom: "20px" }}>
          Découvrez les principales étapes pour profiter pleinement de Yelen.
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <YelenLoader size={28}/>
          </div>
        ) : !parcours ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: t2, fontSize: "13.5px" }}>
            Impossible de charger votre parcours pour le moment.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "22px" }}>
              <div style={{ display: "flex", gap: "4px", flex: 1 }}>
                {ETAPES_PARCOURS_YELEN.map((etape) => {
                  const fait = parcours.etapes.find((e) => e.code === etape.code)?.complete ?? false;
                  return <div key={etape.code} style={{ flex: 1, height: "5px", borderRadius: "3px", background: fait ? "#F5A623" : brd }}/>;
                })}
              </div>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", flexShrink: 0 }}>{parcours.completees}/{parcours.total}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {ETAPES_PARCOURS_YELEN.map((etape) => {
                const fait = parcours.etapes.find((e) => e.code === etape.code)?.complete ?? false;
                return (
                  <div key={etape.code} style={{ display: "flex", gap: "14px", background: card, border: `1px solid ${brd}`, borderRadius: "18px", padding: "16px" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{
                        width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                        background: fait ? "#22c55e" : card2,
                        color: fait ? "#fff" : t1,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {fait ? Ic.Check() : Ic[etape.code]()}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ color: t3, fontSize: "11px", fontWeight: "800" }}>{etape.numero}</span>
                        <span style={{ color: t1, fontSize: "14.5px", fontWeight: "800", letterSpacing: "-0.1px" }}>{etape.titre}</span>
                      </div>
                      <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: fait ? "0" : "12px" }}>{etape.benefice}</div>
                      {fait ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
                          <span style={{ color: "#22c55e" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </span>
                          <span style={{ color: "#22c55e", fontSize: "12.5px", fontWeight: "800" }}>{etape.texteTermine}</span>
                        </div>
                      ) : (
                        <button onClick={() => router.push(etape.destination)} className="tap" style={{ background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "13px", padding: "10px 18px", borderRadius: "10px", border: "none", cursor: "pointer" }}>
                          {etape.ctaLabel}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {parcours.completees >= parcours.total && (
              <div style={{ textAlign: "center", marginTop: "8px", padding: "24px 20px", background: card, border: `1px solid ${brd}`, borderRadius: "18px" }}>
                <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Parcours Yelen terminé ✓</div>
                <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>Vous avez découvert les principales possibilités de Yelen.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
