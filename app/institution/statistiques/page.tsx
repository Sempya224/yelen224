"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Stats = {
  total_rdv: number;
  rdv_termine: number;
  rdv_annule: number;
  rdv_en_attente: number;
  taux_presence: number;
  total_avis: number;
  moyenne_avis: number;
  avis_5: number;
  avis_4: number;
  avis_3: number;
  avis_2: number;
  avis_1: number;
  rdv_par_mois: { mois: string; count: number }[];
};

type Institution = {
  name: string;
  category: string;
  ville: string;
  logo: string | null;
  badge_verifie: boolean;
};

export default function StatistiquesInstitution() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState<"7j" | "30j" | "90j" | "tout">("30j");

  useEffect(() => {
    fetchStats();
  }, [periode]);

  const fetchStats = async () => {
    setLoading(true);
    const id = localStorage.getItem("institutionId");
    if (!id) { router.push("/institution/inscription"); return; }

    const instRes = await supabase
      .from("institutions")
      .select("name, category, ville, logo, badge_verifie")
      .eq("id", id)
      .single();

    setInstitution(instRes.data || null);

    let dateFilter = new Date();
    if (periode === "7j") dateFilter.setDate(dateFilter.getDate() - 7);
    else if (periode === "30j") dateFilter.setDate(dateFilter.getDate() - 30);
    else if (periode === "90j") dateFilter.setDate(dateFilter.getDate() - 90);
    else dateFilter = new Date("2020-01-01");

    const dateStr = dateFilter.toISOString();

    const [rdvRes, avisRes] = await Promise.all([
      supabase.from("rdv").select("id, statut, presence, created_at").eq("institution_id", id).gte("created_at", dateStr),
      supabase.from("avis").select("id, note, created_at").eq("institution_id", id).gte("created_at", dateStr),
    ]);

    const rdvs = rdvRes.data || [];
    const avis = avisRes.data || [];

    const total_rdv = rdvs.length;
    const rdv_termine = rdvs.filter((r) => r.statut === "termine").length;
    const rdv_annule = rdvs.filter((r) => r.statut === "annule").length;
    const rdv_en_attente = rdvs.filter((r) => r.statut === "en_attente" || r.statut === "confirme").length;
    const presents = rdvs.filter((r) => r.presence === true).length;
    const taux_presence = rdv_termine > 0 ? Math.round((presents / rdv_termine) * 100) : 0;

    const total_avis = avis.length;
    const moyenne_avis = total_avis > 0 ? Math.round((avis.reduce((acc, a) => acc + a.note, 0) / total_avis) * 10) / 10 : 0;

    const rdv_par_mois: { mois: string; count: number }[] = [];
    const moisMap: Record<string, number> = {};
    rdvs.forEach((r) => {
      const m = new Date(r.created_at).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      moisMap[m] = (moisMap[m] || 0) + 1;
    });
    Object.entries(moisMap).forEach(([mois, count]) => rdv_par_mois.push({ mois, count }));

    setStats({
      total_rdv,
      rdv_termine,
      rdv_annule,
      rdv_en_attente,
      taux_presence,
      total_avis,
      moyenne_avis,
      avis_5: avis.filter((a) => a.note === 5).length,
      avis_4: avis.filter((a) => a.note === 4).length,
      avis_3: avis.filter((a) => a.note === 3).length,
      avis_2: avis.filter((a) => a.note === 2).length,
      avis_1: avis.filter((a) => a.note === 1).length,
      rdv_par_mois,
    });

    setLoading(false);
  };

  const maxRdvMois = stats ? Math.max(...stats.rdv_par_mois.map((r) => r.count), 1) : 1;

  const noteColor = (n: number) => {
    if (n >= 4.5) return "#22c55e";
    if (n >= 3.5) return "#84cc16";
    if (n >= 2.5) return "#eab308";
    if (n >= 1.5) return "#f97316";
    return "#ef4444";
  };

  const PERIODES = [
    { id: "7j", label: "7 jours" },
    { id: "30j", label: "30 jours" },
    { id: "90j", label: "90 jours" },
    { id: "tout", label: "Tout" },
  ] as const;

  if (loading) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#080812", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "40px", height: "40px", border: "3px solid #F5A623", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#080812", fontFamily: "'Segoe UI', sans-serif", color: "#fff" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .card { animation: fadeUp 0.3s ease forwards; }
        .periode-btn:hover { border-color: rgba(245,166,35,0.4) !important; }
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,8,18,0.97)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(245,166,35,0.15)", padding: "0 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <a href="/institution/dashboard" style={{ color: "#555", fontSize: "20px", textDecoration: "none" }}>&#8592;</a>
            <div style={{ width: "36px", height: "36px", borderRadius: "9px", backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {institution?.logo
                ? <img src={institution.logo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ color: "#F5A623", fontSize: "14px", fontWeight: "800" }}>{institution?.name?.[0]?.toUpperCase() || "Y"}</span>
              }
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: "15px", fontWeight: "700", margin: 0 }}>{institution?.name || "Statistiques"}</h1>
              <p style={{ color: "#555", fontSize: "11px", margin: 0 }}>{institution?.category} — {institution?.ville}</p>
            </div>
          </div>
          <span style={{ color: "#F5A623", fontSize: "17px", fontWeight: "800", letterSpacing: "2px" }}>YELEN224</span>
        </div>
      </header>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px 60px" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <p style={{ color: "#F5A623", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 4px" }}>Tableau de bord analytique</p>
            <h2 style={{ color: "#fff", fontSize: "22px", fontWeight: "800", margin: 0 }}>Statistiques de performance</h2>
          </div>
          <div style={{ display: "flex", gap: "6px", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "4px" }}>
            {PERIODES.map((p) => (
              <button
                key={p.id}
                className="periode-btn"
                onClick={() => setPeriode(p.id)}
                style={{ backgroundColor: periode === p.id ? "#F5A623" : "transparent", color: periode === p.id ? "#0D0D1A" : "#666", border: "none", borderRadius: "7px", padding: "6px 14px", fontSize: "12px", fontWeight: "700", cursor: "pointer", transition: "all 0.15s" }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
          {[
            { label: "Total RDV", value: stats?.total_rdv || 0, sub: `${stats?.rdv_en_attente || 0} en attente`, color: "#F5A623" },
            { label: "RDV Termines", value: stats?.rdv_termine || 0, sub: `${stats?.rdv_annule || 0} annules`, color: "#22c55e" },
            { label: "Taux de presence", value: `${stats?.taux_presence || 0}%`, sub: "Citoyens presents", color: stats?.taux_presence && stats.taux_presence >= 70 ? "#22c55e" : "#f97316" },
            { label: "Note moyenne", value: stats?.moyenne_avis || "—", sub: `${stats?.total_avis || 0} avis`, color: noteColor(stats?.moyenne_avis || 0) },
          ].map((s, i) => (
            <div key={i} className="card" style={{ backgroundColor: "#0D0D1A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "20px 22px", animationDelay: `${i * 0.05}s` }}>
              <p style={{ color: "#444", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 10px" }}>{s.label}</p>
              <p style={{ color: s.color, fontSize: "32px", fontWeight: "800", margin: "0 0 4px", lineHeight: 1 }}>{s.value}</p>
              <p style={{ color: "#333", fontSize: "11px", margin: 0 }}>{s.sub}</p>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>

          <div className="card" style={{ backgroundColor: "#0D0D1A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "24px" }}>
            <h3 style={{ color: "#fff", fontSize: "14px", fontWeight: "700", margin: "0 0 20px" }}>Repartition des RDV</h3>
            {[
              { label: "Termines", value: stats?.rdv_termine || 0, total: stats?.total_rdv || 1, color: "#22c55e" },
              { label: "En attente", value: stats?.rdv_en_attente || 0, total: stats?.total_rdv || 1, color: "#F5A623" },
              { label: "Annules", value: stats?.rdv_annule || 0, total: stats?.total_rdv || 1, color: "#ef4444" },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ color: "#888", fontSize: "12px" }}>{item.label}</span>
                  <span style={{ color: "#fff", fontSize: "12px", fontWeight: "700" }}>{item.value}</span>
                </div>
                <div style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${(item.value / item.total) * 100}%`, height: "100%", backgroundColor: item.color, borderRadius: "3px", transition: "width 0.8s ease" }} />
                </div>
              </div>
            ))}

            <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <h4 style={{ color: "#fff", fontSize: "13px", fontWeight: "700", margin: "0 0 14px" }}>Taux de presence</h4>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ position: "relative", width: "80px", height: "80px", flexShrink: 0 }}>
                  <svg viewBox="0 0 36 36" style={{ width: "80px", height: "80px", transform: "rotate(-90deg)" }}>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none"
                      stroke={stats?.taux_presence && stats.taux_presence >= 70 ? "#22c55e" : "#f97316"}
                      strokeWidth="3"
                      strokeDasharray={`${(stats?.taux_presence || 0)} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#fff", fontSize: "14px", fontWeight: "800" }}>{stats?.taux_presence || 0}%</span>
                  </div>
                </div>
                <div>
                  <p style={{ color: "#fff", fontSize: "13px", fontWeight: "600", margin: "0 0 4px" }}>
                    {stats?.taux_presence && stats.taux_presence >= 70 ? "Excellent" : stats?.taux_presence && stats.taux_presence >= 50 ? "Acceptable" : "A ameliorer"}
                  </p>
                  <p style={{ color: "#555", fontSize: "12px", margin: 0, lineHeight: "1.5" }}>
                    Des citoyens honourent leurs rendez-vous termines
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ backgroundColor: "#0D0D1A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ color: "#fff", fontSize: "14px", fontWeight: "700", margin: 0 }}>Avis clients</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: noteColor(stats?.moyenne_avis || 0), fontSize: "22px", fontWeight: "800" }}>{stats?.moyenne_avis || "—"}</span>
                <span style={{ color: noteColor(stats?.moyenne_avis || 0), fontSize: "18px" }}>&#9733;</span>
              </div>
            </div>

            {[5, 4, 3, 2, 1].map((n) => {
              const count = stats?.[`avis_${n}` as keyof Stats] as number || 0;
              const pct = stats?.total_avis ? Math.round((count / stats.total_avis) * 100) : 0;
              const colors: Record<number, string> = { 5: "#22c55e", 4: "#84cc16", 3: "#eab308", 2: "#f97316", 1: "#ef4444" };
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <span style={{ color: colors[n], fontSize: "12px", width: "16px", textAlign: "right", flexShrink: 0 }}>{n}&#9733;</span>
                  <div style={{ flex: 1, height: "8px", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", backgroundColor: colors[n], borderRadius: "4px", transition: "width 0.8s ease" }} />
                  </div>
                  <span style={{ color: "#555", fontSize: "11px", width: "28px", flexShrink: 0 }}>{count}</span>
                </div>
              );
            })}

            <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <p style={{ color: "#444", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 6px" }}>Total avis</p>
                <p style={{ color: "#fff", fontSize: "20px", fontWeight: "800", margin: 0 }}>{stats?.total_avis || 0}</p>
              </div>
              <div style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <p style={{ color: "#444", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 6px" }}>Satisfaction</p>
                <p style={{ color: noteColor(stats?.moyenne_avis || 0), fontSize: "20px", fontWeight: "800", margin: 0 }}>
                  {stats?.total_avis ? `${Math.round(((stats.avis_4 + stats.avis_5) / stats.total_avis) * 100)}%` : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {stats && stats.rdv_par_mois.length > 0 && (
          <div className="card" style={{ backgroundColor: "#0D0D1A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "24px" }}>
            <h3 style={{ color: "#fff", fontSize: "14px", fontWeight: "700", margin: "0 0 24px" }}>Evolution des RDV</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "120px" }}>
              {stats.rdv_par_mois.map((item, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", height: "100%" }}>
                  <span style={{ color: "#555", fontSize: "10px" }}>{item.count}</span>
                  <div style={{ width: "100%", backgroundColor: "rgba(245,166,35,0.15)", borderRadius: "4px 4px 0 0", overflow: "hidden", flex: 1, display: "flex", alignItems: "flex-end" }}>
                    <div style={{ width: "100%", backgroundColor: "#F5A623", borderRadius: "4px 4px 0 0", height: `${(item.count / maxRdvMois) * 100}%`, minHeight: "4px", transition: "height 0.8s ease" }} />
                  </div>
                  <span style={{ color: "#444", fontSize: "10px", textAlign: "center" }}>{item.mois}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: "16px" }}>
          <a href="/institution/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "8px", backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "10px", padding: "10px 20px", color: "#F5A623", fontSize: "13px", fontWeight: "600", textDecoration: "none" }}>
            &#8592; Retour au dashboard
          </a>
        </div>
      </main>
    </div>
  );
}