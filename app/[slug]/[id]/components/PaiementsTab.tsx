"use client";

// Écran Paiements — domaine principal du comptable. L'admin y a accès en
// lecture seule tant qu'un comptable actif existe (protection du domaine
// comptable, décision CEO 22/07/2026) ; s'il n'y a plus de comptable actif,
// l'admin bascule en "mode intervention d'urgence" et peut rembourser.
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";
import { ReauthModal } from "./ReauthModal";

type Paiement = {
  id: string; reference: string; statut: string; date_rdv: string; heure_rdv: string;
  montant: number; montant_declare_citoyen: number | null; methode_paiement: string | null; created_at: string;
  declare_le: string | null; traite_le: string | null;
  service_nom: string; citoyen_nom: string; citoyen_phone: string; citoyen_photo_url: string | null;
  recu_id: string | null; recu_statut: string | null; recu_disponible_le: string | null; agent_nom: string | null;
};

// Onglets Lot 2 — "Litiges" n'a volontairement aucun statut associé :
// aucun concept de litige n'existe en base (signalements est générique
// citoyen↔institution, pas rattaché à un paiement). L'onglet reste
// toujours vide pour l'instant, structurellement présent en attendant un
// vrai mécanisme (décision CEO : "montre que Yelen est prêt").
const ONGLETS: { id: string; label: string; statuts: string[] | null }[] = [
  { id: "tous", label: "Tous", statuts: null },
  { id: "en_attente", label: "En attente", statuts: ["en_attente"] },
  { id: "confirme", label: "Confirmés", statuts: ["confirme", "termine"] },
  { id: "rembourse", label: "Remboursés", statuts: ["rembourse"] },
  { id: "annule", label: "Annulés", statuts: ["annule", "no_show"] },
  { id: "litiges", label: "Litiges", statuts: [] },
];

const PERIODES: { id: string; label: string; jours: number | null }[] = [
  { id: "aujourdhui", label: "Aujourd'hui", jours: 0 },
  { id: "7j", label: "7 jours", jours: 7 },
  { id: "30j", label: "30 jours", jours: 30 },
  { id: "tout", label: "Tout", jours: null },
];

type Stats = {
  aujourdhui: { nbPaiements: number; montantEncaisse: number; nbEnAttente: number; anomalies: number };
  montantEncaisse: { valeur: number; variationPct: number | null };
  montantEnAttente: { valeur: number; variationPct: number | null };
  montantRembourse: { valeur: number; variationPct: number | null };
  recusGeneres: { valeur: number; variationPct: number | null };
  derniereSynchronisation: string;
};

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " " + DEVISE_LABEL; }
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
function formatHeure(iso: string): string { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
function formatDateHeure(iso: string): string { return formatDate(iso) + " à " + formatHeure(iso); }

// Badge de variation — jamais affiché si variationPct est null (solde
// courant sans comparaison possible, voir commentaire de chargerStats côté
// route). Gris neutre à 0%, jamais vert/rouge pour une variation nulle.
function VariationBadge({ pct, C }: { pct: number | null; C: ThemeTokens }) {
  if (pct === null) return null;
  const positif = pct > 0;
  const neutre = pct === 0;
  const color = neutre ? C.t3 : positif ? C.green : C.red;
  return (
    <span style={{ color, fontSize: "11px", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "2px" }}>
      {!neutre && (positif
        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>)}
      {positif ? "+" : ""}{pct}%
    </span>
  );
}

function KpiCard({ label, valeur, variationPct, C }: { label: string; valeur: string; variationPct: number | null; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="16px">
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{label}</div>
      <div style={{ color: C.t1, fontSize: "18px", fontWeight: "800", letterSpacing: "-0.3px", marginBottom: "6px" }}>{valeur}</div>
      {variationPct !== null ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <VariationBadge pct={variationPct} C={C}/>
          <span style={{ color: C.t3, fontSize: "10.5px" }}>vs semaine précédente</span>
        </div>
      ) : (
        <span style={{ color: C.t3, fontSize: "10.5px" }}>Solde courant</span>
      )}
    </Card>
  );
}

function initiales(nom: string): string {
  return nom.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// Photo réelle du citoyen si présente (Lot 3, §7 du brief) — jamais
// d'avatar générique quand une photo existe, initiales sinon.
function Avatar({ nom, photoUrl, C, size = 38 }: { nom: string; photoUrl?: string | null; C: ThemeTokens; size?: number }) {
  return (
    <div style={{ width: size, height: size, position: "relative", borderRadius: Math.round(size * 0.32), overflow: "hidden", flexShrink: 0, backgroundColor: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {photoUrl ? (
        <Image src={photoUrl} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }}/>
      ) : (
        <span style={{ color: "#000", fontSize: Math.round(size * 0.36), fontWeight: 800 }}>{initiales(nom)}</span>
      )}
    </div>
  );
}

// Badge reçu (§8 du brief) — 3 états réels, jamais un simple "présent/absent"
// binaire : "Reçu généré" (PDF disponible), "En attente" (paiement confirmé
// mais PDF pas encore généré — le signal d'anomalie du bandeau exécutif
// vient précisément de cet état s'il persiste), "Archivé" (remboursement,
// voir handleAnnulerValidation/route PATCH). Rien pour les statuts où un
// reçu n'a jamais lieu d'exister (en_attente, annulé, absent).
function RecuBadge({ p, C }: { p: Paiement; C: ThemeTokens }) {
  if (p.recu_statut === "disponible") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: C.green, fontSize: "10.5px", fontWeight: "800" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Reçu généré
      </span>
    );
  }
  if (p.recu_statut === "archive") {
    return <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: "800" }}>Reçu archivé</span>;
  }
  if (p.statut === "confirme" || p.statut === "termine") {
    return <span style={{ color: C.gold, fontSize: "10.5px", fontWeight: "800" }}>Reçu en attente</span>;
  }
  return null;
}

// Timeline miniature (§10) — deux parcours possibles selon l'issue réelle
// du paiement, jamais une étape affichée "faite" sans horodatage réel en
// base pour la justifier.
function TimelineMini({ p, C }: { p: Paiement; C: ThemeTokens }) {
  const negatif = p.statut === "annule" || p.statut === "no_show";
  const etapes = negatif
    ? [
        { label: "Déclaré", fait: !!p.declare_le },
        { label: p.statut === "annule" ? "Annulé" : "Absent", fait: !!p.traite_le },
      ]
    : [
        { label: "Déclaré", fait: !!p.declare_le },
        { label: "Confirmé", fait: !!p.traite_le && p.statut !== "en_attente" },
        { label: "Reçu généré", fait: p.recu_statut === "disponible" || p.recu_statut === "archive" },
        { label: "Archivé", fait: p.recu_statut === "archive" },
      ];
  const dernierAtteint = [...etapes].reverse().find(e => e.fait)?.label ?? "En attente";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }} title={etapes.filter(e => e.fait).map(e => e.label).join(" → ") || "En attente"}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {etapes.map((e, i) => (
          <div key={e.label} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: e.fait ? C.gold : C.border2, flexShrink: 0 }}/>
            {i < etapes.length - 1 && <div style={{ width: "9px", height: "1.5px", backgroundColor: e.fait ? C.gold : C.border2, flexShrink: 0 }}/>}
          </div>
        ))}
      </div>
      <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700", whiteSpace: "nowrap" }}>{dernierAtteint}</span>
    </div>
  );
}

const STATUT_LABEL: Record<string, { label: string; color: (C: ThemeTokens) => string }> = {
  en_attente: { label: "En attente", color: C => C.gold },
  confirme:   { label: "Confirmé",   color: C => C.green },
  termine:    { label: "Terminé",    color: C => C.green },
  no_show:    { label: "Absent",     color: C => C.t3 },
  annule:     { label: "Annulé",     color: C => C.red },
  rembourse:  { label: "Remboursé",  color: C => C.purple },
};

export function PaiementsTab({ instId, onToast, isAdmin }: { instId: string; onToast: (msg: string, color?: string) => void; isAdmin: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ongletActif, setOngletActif] = useState("tous");
  const [periodeFiltre, setPeriodeFiltre] = useState("tout");
  const [agentFiltre, setAgentFiltre] = useState("tous");
  const [search, setSearch] = useState("");
  const [comptableActif, setComptableActif] = useState<boolean | null>(null);
  const [remboursement, setRemboursement] = useState<Paiement | null>(null);
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [telechargement, setTelechargement] = useState<string | null>(null);
  const [autorisationsOuvertes, setAutorisationsOuvertes] = useState(false);
  const [detailOuvert, setDetailOuvert] = useState<Paiement | null>(null);

  // Lot D (reçu Yelen) — récupère l'URL signée (60s) puis l'ouvre : jamais
  // d'URL publique directe sur le bucket privé "recus-paiement".
  async function telechargerRecu(p: Paiement) {
    if (!p.recu_id) return;
    setTelechargement(p.id);
    const res = await fetch(`/api/institution/recus/${p.recu_id}/pdf`);
    const j = await res.json().catch(() => null);
    setTelechargement(null);
    if (!res.ok || !j?.signedUrl) { onToast(j?.error || "Reçu indisponible", C.red); return; }
    window.open(j.signedUrl, "_blank");
  }

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/institution/paiements");
    const j = await res.json().catch(() => null);
    setPaiements(res.ok ? (j?.paiements ?? []) : []);
    setStats(res.ok ? (j?.stats ?? null) : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [instId]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const res = await fetch("/api/institution/membres");
      const j = await res.json().catch(() => null);
      if (res.ok) setComptableActif((j?.membres ?? []).some((m: { role?: string; actif?: boolean }) => m.role === "comptable" && m.actif));
    })();
  }, [isAdmin]);

  const modeUrgence = isAdmin && comptableActif === false;
  const lectureSeule = isAdmin && comptableActif !== false;

  const agentsDisponibles = useMemo(() => {
    return Array.from(new Set(paiements.map(p => p.agent_nom).filter((n): n is string => !!n))).sort();
  }, [paiements]);

  const filtered = useMemo(() => {
    const onglet = ONGLETS.find(o => o.id === ongletActif) ?? ONGLETS[0];
    const periode = PERIODES.find(p => p.id === periodeFiltre) ?? PERIODES[PERIODES.length - 1];
    const depuis = periode.jours !== null ? (() => { const d = new Date(); d.setDate(d.getDate() - periode.jours!); d.setHours(0, 0, 0, 0); return d; })() : null;

    return paiements
      .filter(p => onglet.statuts === null || onglet.statuts.includes(p.statut))
      .filter(p => !depuis || new Date(`${p.date_rdv}T00:00:00`) >= depuis)
      .filter(p => agentFiltre === "tous" || p.agent_nom === agentFiltre)
      .filter(p => !search || p.citoyen_nom.toLowerCase().includes(search.toLowerCase()) || p.reference.toLowerCase().includes(search.toLowerCase()));
  }, [paiements, ongletActif, periodeFiltre, agentFiltre, search]);

  // Export CSV — 100% client, même convention que les autres exports
  // "légers" du dashboard (une page à la fois, pas de génération serveur
  // pour un simple tableau).
  function exporterCsv() {
    const header = ["Référence", "Citoyen", "Service", "Agent", "Date", "Heure", "Montant", "Statut"];
    const rows = filtered.map(p => [
      p.reference, p.citoyen_nom, p.service_nom, p.agent_nom ?? "", formatDate(p.date_rdv), p.heure_rdv,
      String(Math.round(p.montant)), STATUT_LABEL[p.statut]?.label ?? p.statut,
    ]);
    const csv = "﻿" + [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `paiements_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function confirmerRemboursement() {
    if (!remboursement) return;
    setSaving(true);
    const res = await fetch("/api/institution/paiements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: remboursement.id, motif: motif.trim() || null }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      if (j?.code === "REAUTH_REQUIRED") { setReauthOpen(true); return; }
      onToast(j?.error || "Erreur lors du remboursement", C.red);
      return;
    }
    onToast("Paiement remboursé", C.green);
    setRemboursement(null); setMotif("");
    load();
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      {/* Toujours monté (pas dans un bloc conditionnel) — sinon la
          première ouverture de "Rembourser" sans être passé par "Voir"
          n'aurait pas encore cette règle CSS dans le DOM. */}
      <style>{`
        @media(min-width:1024px){
          .paiement-fiche-overlay{align-items:center!important}
          .paiement-fiche-panel{border-radius:20px!important}
        }
      `}</style>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "6px" }}>Paiements</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>Suivez tous les paiements de votre établissement, les reçus générés, les remboursements et les opérations nécessitant une intervention.</p>

      {/* Header Executive (Lot 1, refonte "Payment Operations Center",
          décision CEO 05/08/2026) — la vision financière avant la
          recherche : en un coup d'œil, combien de paiements, combien
          d'argent, combien restent, s'il y a un problème. */}
      {stats && (
        <Card tokens={toCardTokens(C)} padding="16px 18px" style={{ marginBottom: "14px", display: "flex", flexWrap: "wrap", gap: "20px" }}>
          <div style={{ color: C.t2, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", width: "100%" }}>Aujourd&apos;hui</div>
          {[
            { label: "Paiements", valeur: String(stats.aujourdhui.nbPaiements), color: C.t1 },
            { label: "Encaissés", valeur: formatPrix(stats.aujourdhui.montantEncaisse), color: C.green },
            { label: "En attente", valeur: String(stats.aujourdhui.nbEnAttente), color: stats.aujourdhui.nbEnAttente > 0 ? C.gold : C.t1 },
            { label: "Anomalie" + (stats.aujourdhui.anomalies > 1 ? "s" : ""), valeur: String(stats.aujourdhui.anomalies), color: stats.aujourdhui.anomalies > 0 ? C.red : C.t1 },
          ].map((item, i, arr) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div>
                <div style={{ color: item.color, fontSize: "20px", fontWeight: "800", letterSpacing: "-0.3px" }}>{item.valeur}</div>
                <div style={{ color: C.t3, fontSize: "11px", fontWeight: "700", marginTop: "2px" }}>{item.label}</div>
              </div>
              {i < arr.length - 1 && <div style={{ width: "1px", height: "32px", background: C.border }}/>}
            </div>
          ))}
        </Card>
      )}

      {/* 4 cartes KPI — définitions exactes documentées côté route
          (app/api/institution/paiements/route.ts::chargerStats). */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          <KpiCard label="Montant encaissé" valeur={formatPrix(stats.montantEncaisse.valeur)} variationPct={stats.montantEncaisse.variationPct} C={C}/>
          <KpiCard label="Montant en attente" valeur={formatPrix(stats.montantEnAttente.valeur)} variationPct={stats.montantEnAttente.variationPct} C={C}/>
          <KpiCard label="Montant remboursé" valeur={formatPrix(stats.montantRembourse.valeur)} variationPct={stats.montantRembourse.variationPct} C={C}/>
          <KpiCard label="Reçus générés" valeur={String(stats.recusGeneres.valeur)} variationPct={stats.recusGeneres.variationPct} C={C}/>
        </div>
      )}

      {/* Bandeau comptable — ramené à une ligne (Lot 1), détail complet
          disponible via "Voir les autorisations" plutôt qu'imposé en
          permanence. */}
      {lectureSeule && (
        <div style={{ backgroundColor: `${C.blue}12`, border: `1px solid ${C.blue}30`, borderRadius: "12px", padding: "10px 14px", marginBottom: "14px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <p style={{ color: C.t1, fontSize: "12px", fontWeight: "700", margin: 0, flex: 1 }}>Domaine comptable sécurisé — vous consultez en lecture seule.</p>
            <button onClick={() => setAutorisationsOuvertes(v => !v)} className="tap" style={{ background: "none", border: "none", color: C.blue, fontSize: "11.5px", fontWeight: "800", cursor: "pointer", padding: 0, flexShrink: 0 }}>
              {autorisationsOuvertes ? "Masquer" : "Voir les autorisations"} →
            </button>
          </div>
          {autorisationsOuvertes && (
            <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: "10px 0 0" }}>
              Les remboursements sont réservés au comptable, spécialiste de ce domaine. Toutes les actions sont journalisées. Pour intervenir vous-même en cas d&apos;urgence, suspendez d&apos;abord son compte (onglet Équipe) : cette étape rend votre intervention visible et tracée, pour protéger son travail.
            </p>
          )}
        </div>
      )}
      {modeUrgence && (
        <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "10px 14px", marginBottom: "14px", display: "flex", gap: "10px", alignItems: "center" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p style={{ color: C.t1, fontSize: "12px", fontWeight: "700", margin: 0 }}>Mode intervention d&apos;urgence actif — le compte comptable est suspendu, vous pouvez exceptionnellement rembourser des paiements à sa place.</p>
        </div>
      )}

      {/* Barre d'actions (Lot 2) — recherche, période, agent, export,
          actualiser. "Mode de paiement" volontairement absent : la colonne
          existe en base mais n'est écrite nulle part (100% espèces sur
          place aujourd'hui, aucune intégration Orange Money/Wave/Carte) —
          un filtre sur un champ toujours vide n'aurait rien à filtrer. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client ou une référence…" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, boxSizing: "border-box" }}/>
        </div>
        <select value={periodeFiltre} onChange={e => setPeriodeFiltre(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 10px", fontSize: "12.5px", fontWeight: "700", color: C.t1, cursor: "pointer" }}>
          {PERIODES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {agentsDisponibles.length > 1 && (
          <select value={agentFiltre} onChange={e => setAgentFiltre(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 10px", fontSize: "12.5px", fontWeight: "700", color: C.t1, cursor: "pointer" }}>
            <option value="tous">Tous les agents</option>
            {agentsDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" disabled={filtered.length === 0}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
          onClick={exporterCsv}>Exporter</Button>
        <button onClick={load} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", fontWeight: "700", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center" }} aria-label="Actualiser">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>

      <div style={{ display: "flex", gap: "7px", marginBottom: "16px", overflowX: "auto" }}>
        {ONGLETS.map(o => (
          <button key={o.id} onClick={() => setOngletActif(o.id)} className="tap" style={{ flexShrink: 0, backgroundColor: ongletActif === o.id ? `${C.gold}15` : C.bgCard, border: `1px solid ${ongletActif === o.id ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "7px 13px", color: ongletActif === o.id ? C.gold : C.t2, fontSize: "11.5px", fontWeight: ongletActif === o.id ? 800 : 600, cursor: "pointer" }}>
            {o.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>
      ) : filtered.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "13px", background: `${C.gold}12`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>
            {ongletActif === "litiges" ? "Aucun litige" : ongletActif === "tous" && !search ? "Aucun paiement pour l'instant" : "Aucun résultat"}
          </div>
          <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6 }}>
            {ongletActif === "litiges" ? "Fonctionnalité à venir — les paiements contestés apparaîtront ici." : ongletActif === "tous" && !search ? "Les paiements de vos services apparaîtront ici dès la première réservation." : "Essayez un autre filtre ou une autre recherche."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <style>{`
            @media(min-width:1024px){
              .paiement-row{display:grid!important;grid-template-columns:2fr 1fr 1.3fr 0.9fr 0.9fr auto;align-items:center;gap:14px;padding:12px 16px!important}
              .paiement-row-statut{justify-self:start}
              .paiement-row-montant{text-align:right!important}
              .paiement-row-actions{margin-top:0!important;justify-content:flex-end!important}
            }
          `}</style>
          {filtered.map(p => {
            const st = STATUT_LABEL[p.statut] ?? { label: p.statut, color: (c: ThemeTokens) => c.t3 };
            const peutRembourser = (p.statut === "confirme" || p.statut === "termine") && !lectureSeule;
            return (
              <Card key={p.id} tokens={toCardTokens(C)} padding="14px 16px" className="paiement-row">
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <Avatar nom={p.citoyen_nom} photoUrl={p.citoyen_photo_url} C={C} size={38}/>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.citoyen_nom}</div>
                    <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.service_nom} · {formatDate(p.date_rdv)} {p.heure_rdv}</div>
                  </div>
                </div>

                <div style={{ color: C.t2, fontSize: "11.5px", fontWeight: "600", marginTop: "8px" }} className="paiement-row-agent">{p.agent_nom ?? "—"}</div>

                <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <RecuBadge p={p} C={C}/>
                  <TimelineMini p={p} C={C}/>
                </div>

                <div className="paiement-row-montant" style={{ color: C.green, fontSize: "15px", fontWeight: "800", marginTop: "8px" }}>{formatPrix(p.montant)}</div>

                <div className="paiement-row-statut" style={{ marginTop: "8px" }}>
                  <span style={{ color: st.color(C), fontSize: "10px", fontWeight: "800", backgroundColor: `${st.color(C)}15`, padding: "3px 9px", borderRadius: "20px", whiteSpace: "nowrap" }}>{st.label}</span>
                </div>

                <div className="paiement-row-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setDetailOuvert(p)}>Voir</Button>
                  {p.recu_id && (
                    <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" loading={telechargement === p.id} style={{ color: C.gold, border: `1px solid ${C.gold}30`, backgroundColor: `${C.gold}12` }} onClick={() => telechargerRecu(p)}>Reçu</Button>
                  )}
                  {peutRembourser && (
                    <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="sm" onClick={() => setRemboursement(p)}>Rembourser</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Résumé de fin (§14) — même chiffres qu'en-tête, en clôture
          d'écran, avec l'heure de dernière synchronisation. */}
      {stats && !loading && (
        <div style={{ marginTop: "18px", padding: "14px 16px", borderRadius: "14px", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
            <span style={{ color: C.t2, fontSize: "11.5px" }}><strong style={{ color: C.t1 }}>{stats.aujourdhui.nbPaiements}</strong> paiement{stats.aujourdhui.nbPaiements > 1 ? "s" : ""}</span>
            <span style={{ color: C.t2, fontSize: "11.5px" }}><strong style={{ color: C.t1 }}>{formatPrix(stats.aujourdhui.montantEncaisse)}</strong></span>
            <span style={{ color: C.t2, fontSize: "11.5px" }}><strong style={{ color: C.t1 }}>{stats.recusGeneres.valeur}</strong> reçu{stats.recusGeneres.valeur > 1 ? "s" : ""} généré{stats.recusGeneres.valeur > 1 ? "s" : ""}</span>
            <span style={{ color: C.t2, fontSize: "11.5px" }}><strong style={{ color: stats.aujourdhui.anomalies > 0 ? C.red : C.t1 }}>{stats.aujourdhui.anomalies}</strong> anomalie{stats.aujourdhui.anomalies > 1 ? "s" : ""}</span>
          </div>
          <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: "600" }}>Dernière synchronisation {formatHeure(stats.derniereSynchronisation)}</span>
        </div>
      )}

      {/* Fiche détail "Voir" (Lot 3) — même convention bottom-sheet
          mobile / dialogue centré ≥1024px que le reste du dashboard
          (.client-fiche-*, MesClientsTab.tsx). */}
      {detailOuvert && (
        <div onClick={() => setDetailOuvert(null)} className="paiement-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} className="paiement-fiche-panel" style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
              <Avatar nom={detailOuvert.citoyen_nom} photoUrl={detailOuvert.citoyen_photo_url} C={C} size={48}/>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800" }}>{detailOuvert.citoyen_nom}</div>
                <div style={{ color: C.t3, fontSize: "12px", marginTop: "1px" }}>{detailOuvert.citoyen_phone || "Téléphone non renseigné"}</div>
              </div>
              <span style={{ color: (STATUT_LABEL[detailOuvert.statut]?.color ?? (() => C.t3))(C), fontSize: "10.5px", fontWeight: "800", backgroundColor: `${(STATUT_LABEL[detailOuvert.statut]?.color ?? (() => C.t3))(C)}15`, padding: "4px 10px", borderRadius: "20px", whiteSpace: "nowrap" }}>{STATUT_LABEL[detailOuvert.statut]?.label ?? detailOuvert.statut}</span>
            </div>

            <div style={{ background: C.bg3, borderRadius: "14px", padding: "14px 16px", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: C.t3, fontSize: "9.5px", fontWeight: "700", textTransform: "uppercase" }}>Montant</span>
                <span style={{ color: C.t3, fontSize: "9.5px", fontWeight: "700", textTransform: "uppercase" }}>Référence</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ color: C.green, fontSize: "20px", fontWeight: "800" }}>{formatPrix(detailOuvert.montant)}</span>
                <span style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>{detailOuvert.reference}</span>
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Détails</div>
              {[
                ["Service", detailOuvert.service_nom],
                ["Rendez-vous prévu", `${formatDate(detailOuvert.date_rdv)} ${detailOuvert.heure_rdv}`],
                ["Agent", detailOuvert.agent_nom ?? "—"],
              ].map(([label, valeur]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.t3, fontSize: "12px" }}>{label}</span>
                  <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{valeur}</span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: "18px" }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Historique</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {[
                  detailOuvert.declare_le ? { label: "Paiement déclaré par le citoyen", date: detailOuvert.declare_le, detail: detailOuvert.montant_declare_citoyen != null ? formatPrix(detailOuvert.montant_declare_citoyen) : null } : null,
                  detailOuvert.traite_le && (detailOuvert.statut === "confirme" || detailOuvert.statut === "termine") ? { label: `Confirmé par ${detailOuvert.agent_nom ?? "l'agent"}`, date: detailOuvert.traite_le, detail: formatPrix(detailOuvert.montant) } : null,
                  detailOuvert.traite_le && detailOuvert.statut === "no_show" ? { label: "Marqué absent", date: detailOuvert.traite_le, detail: null } : null,
                  detailOuvert.traite_le && detailOuvert.statut === "annule" ? { label: "Réservation annulée", date: detailOuvert.traite_le, detail: null } : null,
                  detailOuvert.recu_disponible_le ? { label: "Reçu généré", date: detailOuvert.recu_disponible_le, detail: null } : null,
                  detailOuvert.traite_le && detailOuvert.statut === "rembourse" ? { label: "Paiement remboursé", date: detailOuvert.traite_le, detail: formatPrix(detailOuvert.montant) } : null,
                ].filter((e): e is { label: string; date: string; detail: string | null } => e !== null).map((etape, i, arr) => (
                  <div key={i} style={{ display: "flex", gap: "10px" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.gold, marginTop: "4px" }}/>
                      {i < arr.length - 1 && <div style={{ width: "1.5px", flex: 1, backgroundColor: C.border, minHeight: "20px" }}/>}
                    </div>
                    <div style={{ paddingBottom: "14px" }}>
                      <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{etape.label}</div>
                      <div style={{ color: C.t3, fontSize: "11px", marginTop: "1px" }}>{formatDateHeure(etape.date)}{etape.detail ? ` · ${etape.detail}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => setDetailOuvert(null)}>Fermer</Button>
              {detailOuvert.recu_id && (
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1, color: C.gold, border: `1px solid ${C.gold}30`, backgroundColor: `${C.gold}12` }} loading={telechargement === detailOuvert.id} onClick={() => telechargerRecu(detailOuvert)}>Télécharger le reçu</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {remboursement && (
        <div onClick={() => setRemboursement(null)} className="paiement-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} className="paiement-fiche-panel" style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "6px" }}>Rembourser {remboursement.citoyen_nom} ?</div>
            <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>{formatPrix(remboursement.montant)} — {remboursement.service_nom}</div>
            <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif du remboursement (facultatif)" rows={3} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, resize: "none", marginBottom: "14px" }}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => setRemboursement(null)}>Annuler</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" loading={saving} onClick={confirmerRemboursement}>Confirmer le remboursement</Button>
            </div>
          </div>
        </div>
      )}

      <ReauthModal open={reauthOpen} onClose={() => setReauthOpen(false)} onSuccess={() => { setReauthOpen(false); confirmerRemboursement(); }}/>
    </div>
  );
}
