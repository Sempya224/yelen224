"use client";

// Vue chronologique complète des paiements — lecture seule, filtres larges
// (période, service, montant, recherche). Réutilise la même donnée que
// Paiements (GET /api/institution/paiements) mais sans aucune action —
// c'est la différence de rôle entre les deux écrans (Paiements = travailler
// dessus, Historique = consulter/exporter).
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";

type Paiement = {
  id: string; reference: string; statut: string; date_rdv: string; heure_rdv: string;
  montant: number; methode_paiement: string | null; created_at: string;
  service_nom: string; citoyen_nom: string; citoyen_phone: string;
};

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " " + DEVISE_LABEL; }
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }

export function HistoriqueFinancierTab({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [serviceFiltre, setServiceFiltre] = useState("tous");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/institution/paiements");
      const j = await res.json().catch(() => null);
      setPaiements(res.ok ? (j?.paiements ?? []) : []);
      setLoading(false);
    })();
  }, [instId]);

  const services = useMemo(() => [...new Set(paiements.map(p => p.service_nom))].sort(), [paiements]);

  const filtered = useMemo(() => {
    return paiements
      .filter(p => !dateFrom || p.date_rdv >= dateFrom)
      .filter(p => !dateTo || p.date_rdv <= dateTo)
      .filter(p => serviceFiltre === "tous" || p.service_nom === serviceFiltre)
      .filter(p => !search || p.citoyen_nom.toLowerCase().includes(search.toLowerCase()) || p.reference.toLowerCase().includes(search.toLowerCase()));
  }, [paiements, dateFrom, dateTo, serviceFiltre, search]);

  const total = filtered.reduce((s, p) => s + (["confirme", "termine"].includes(p.statut) ? p.montant : 0), 0);

  function exporterCsv() {
    const header = ["Référence", "Client", "Téléphone", "Service", "Date", "Heure", "Statut", "Montant"];
    const rows = filtered.map(p => [p.reference, p.citoyen_nom, p.citoyen_phone, p.service_nom, p.date_rdv, p.heure_rdv, p.statut, String(p.montant)]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `historique-financier-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Historique financier</h1>
        <button onClick={exporterCsv} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, color: C.t1, fontWeight: "700", fontSize: "12px", padding: "9px 14px", borderRadius: "10px", cursor: "pointer" }}>Exporter CSV</button>
      </div>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Consultation seule — {filtered.length} paiement{filtered.length > 1 ? "s" : ""}, total confirmé {formatPrix(total)}.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
        <div>
          <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "4px" }}>Du</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px 10px", fontSize: "12.5px", color: C.t1 }}/>
        </div>
        <div>
          <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "4px" }}>Au</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px 10px", fontSize: "12.5px", color: C.t1 }}/>
        </div>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client ou une référence…" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, marginBottom: "10px" }}/>
      <div style={{ display: "flex", gap: "7px", marginBottom: "16px", overflowX: "auto" }}>
        <button onClick={() => setServiceFiltre("tous")} className="tap" style={{ flexShrink: 0, backgroundColor: serviceFiltre === "tous" ? `${C.gold}15` : C.bgCard, border: `1px solid ${serviceFiltre === "tous" ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "7px 13px", color: serviceFiltre === "tous" ? C.gold : C.t2, fontSize: "11.5px", fontWeight: serviceFiltre === "tous" ? 800 : 600, cursor: "pointer" }}>Tous services</button>
        {services.map(s => (
          <button key={s} onClick={() => setServiceFiltre(s)} className="tap" style={{ flexShrink: 0, backgroundColor: serviceFiltre === s ? `${C.gold}15` : C.bgCard, border: `1px solid ${serviceFiltre === s ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "7px 13px", color: serviceFiltre === s ? C.gold : C.t2, fontSize: "11.5px", fontWeight: serviceFiltre === s ? 800 : 600, cursor: "pointer" }}>{s}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>
      ) : filtered.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "40px 20px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Aucun résultat pour ces filtres.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "14px", backgroundColor: C.bgCard }}>
          <table style={{ width: "100%", minWidth: "600px", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Client", "Service", "Date", "Statut", "Montant"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <td style={{ padding: "11px 14px", fontWeight: "700", color: C.t1, whiteSpace: "nowrap" }}>{p.citoyen_nom}</td>
                  <td style={{ padding: "11px 14px", color: C.t2, whiteSpace: "nowrap" }}>{p.service_nom}</td>
                  <td style={{ padding: "11px 14px", color: C.t3, whiteSpace: "nowrap" }}>{formatDate(p.date_rdv)}</td>
                  <td style={{ padding: "11px 14px", color: C.t2, whiteSpace: "nowrap" }}>{p.statut}</td>
                  <td style={{ padding: "11px 14px", color: C.green, fontWeight: "800", whiteSpace: "nowrap" }}>{formatPrix(p.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
