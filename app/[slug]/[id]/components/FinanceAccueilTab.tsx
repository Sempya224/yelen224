"use client";

// Accueil financier du comptable — remplace la Vue d'ensemble opérationnelle
// pour ce rôle (décision CEO 22/07/2026, page.tsx branche sur le rôle, pas
// une nouvelle clé de tab). Aucune statistique de fréquentation, messages,
// communication, équipe ou activité opérationnelle ici — uniquement des
// données financières, calculées par lib/financeAggregation.ts.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import type { FinanceAccueil, PeriodeStats } from "@/lib/financeAggregation";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";

function formatPrix(p: number): string {
  return Math.round(p).toLocaleString("fr-FR") + " " + DEVISE_LABEL;
}

const PERIODES: { key: keyof Pick<FinanceAccueil, "aujourdhui" | "semaine" | "mois" | "annee">; label: string }[] = [
  { key: "aujourdhui", label: "Aujourd'hui" },
  { key: "semaine", label: "Cette semaine" },
  { key: "mois", label: "Ce mois" },
  { key: "annee", label: "Cette année" },
];

export function FinanceAccueilTab() {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [data, setData] = useState<FinanceAccueil | null>(null);
  const [periode, setPeriode] = useState<typeof PERIODES[number]["key"]>("aujourdhui");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/institution/finance/accueil");
      const j = await res.json().catch(() => null);
      if (res.ok) setData(j);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <YelenLoader size={28}/>
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: "48px 16px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Impossible de charger les données financières.</div>;
  }

  const stats: PeriodeStats = data[periode];
  const maxGraph = Math.max(1, ...data.graphique_journalier.map(p => p.montant));

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Tableau de bord financier</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Vue d&apos;ensemble des paiements et revenus de l&apos;établissement.</p>

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", backgroundColor: C.bgCard2, borderRadius: "14px", padding: "4px", border: `1px solid ${C.border}` }}>
        {PERIODES.map(p => (
          <button key={p.key} onClick={() => setPeriode(p.key)} className="tap" style={{ flex: 1, backgroundColor: periode === p.key ? C.bgCard : "transparent", border: periode === p.key ? `1.5px solid ${C.border2}` : "1.5px solid transparent", borderRadius: "11px", padding: "10px 6px", color: periode === p.key ? C.gold : C.t3, fontSize: "11.5px", fontWeight: periode === p.key ? "800" : "600", cursor: "pointer" }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "18px" }}>
        {[
          { label: "Montant encaissé", value: formatPrix(stats.montant_encaisse), color: C.green },
          { label: "Paiements", value: String(stats.nb_paiements), color: C.blue },
          { label: "En attente", value: formatPrix(stats.montant_en_attente), color: C.gold },
          { label: "Remboursé", value: formatPrix(stats.montant_rembourse), color: C.red },
          { label: "Panier moyen", value: formatPrix(stats.panier_moyen), color: C.purple },
        ].map(kpi => (
          <div key={kpi.label} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{kpi.label}</div>
            <div style={{ color: kpi.color, fontSize: "18px", fontWeight: "900" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px", marginBottom: "18px" }}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "14px" }}>Entrées financières — ce mois</div>
        {data.graphique_journalier.length === 0 ? (
          <p style={{ color: C.t3, fontSize: "12px" }}>Aucune entrée ce mois-ci.</p>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "80px" }}>
            {data.graphique_journalier.map(p => (
              <div key={p.date} title={`${p.date} — ${formatPrix(p.montant)}`} style={{ flex: 1, height: `${Math.max(4, (p.montant / maxGraph) * 100)}%`, backgroundColor: C.gold, borderRadius: "3px 3px 0 0", opacity: 0.85 }}/>
            ))}
          </div>
        )}
      </div>

      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden", marginBottom: "18px" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>Top 5 des services les plus rentables</span>
        </div>
        {data.top_services.length === 0 ? (
          <p style={{ color: C.t3, fontSize: "12px", padding: "16px" }}>Aucun service payant réalisé pour l&apos;instant.</p>
        ) : data.top_services.map((s, i) => (
          <div key={s.nom} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: i < data.top_services.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ color: C.t3, fontSize: "11px", fontWeight: "800", width: "16px" }}>{i + 1}</span>
            <div style={{ flex: 1, color: C.t1, fontSize: "13px", fontWeight: "600" }}>{s.nom}</div>
            <div style={{ color: C.t3, fontSize: "11px" }}>{s.nb} vente{s.nb > 1 ? "s" : ""}</div>
            <div style={{ color: C.green, fontSize: "13px", fontWeight: "800" }}>{formatPrix(s.montant)}</div>
          </div>
        ))}
      </div>

      {data.alertes.length > 0 && (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>Alertes financières</span>
          </div>
          {data.alertes.map((a, i) => (
            <div key={a.type} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: i < data.alertes.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.orange, flexShrink: 0 }}/>
              <div style={{ flex: 1, color: C.t2, fontSize: "12.5px" }}>{a.label}</div>
              <span style={{ color: C.orange, fontSize: "12px", fontWeight: "800" }}>{a.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
