"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";

const P = { pointerEvents: "none" as const };
const Ic = {
  Search: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Chev:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Cal:    () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  QR:     () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="21" y1="14" x2="21" y2="21"/></svg>,
  Pay:    () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
  Star:   () => <svg style={P} width="18" height="18" viewBox="0 0 20 20" fill="currentColor" stroke="none"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/></svg>,
  Heart:  () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  Doc:    () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  User:   () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Building: () => <svg style={P} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  Upload: () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Download: () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
};

const ICON_PAR_CATEGORIE: Record<string, () => React.ReactElement> = {
  rdv: Ic.Cal, qr: Ic.QR, paiement: Ic.Pay, avis: Ic.Star, favori: Ic.Heart, document: Ic.Doc, compte: Ic.User,
};

type Activite = {
  id: string; type: string; categorie: "rdv" | "qr" | "paiement" | "avis" | "favori" | "document" | "compte";
  titre: string; description: string | null; institution_nom: string | null; institution_id: string | null;
  date: string; statut: "succes" | "attente" | "annule" | "echec"; statut_label: string; meta: Record<string, unknown>;
};

type FenetreDate = "tous" | "aujourdhui" | "7jours" | "30jours" | "annee";
type FiltreStatut = "tous" | "succes" | "attente" | "annule" | "echec";

const CATEGORIE_LABEL: Record<string, string> = {
  rdv: "Rendez-vous", qr: "QR Code", paiement: "Paiement", avis: "Avis", favori: "Favori", document: "Document", compte: "Compte",
};
const STATUT_COULEUR: Record<string, string> = { succes: "#22c55e", attente: "#F5A623", annule: "#8E8E93", echec: "#ef4444" };

function formatDateHeure(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function groupeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const jours = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Hier";
  if (jours < 7) return "Cette semaine";
  if (jours < 30) return "Ce mois";
  if (jours < 365) return "Cette année";
  return "Plus ancien";
}

export function ActivitesClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [activites, setActivites] = useState<Activite[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [recherche, setRecherche] = useState("");
  const [fenetre, setFenetre] = useState<FenetreDate>("tous");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [statutFiltre, setStatutFiltre] = useState<FiltreStatut>("tous");
  const [detail, setDetail] = useState<Activite | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
    const res = await fetch("/api/citoyen/activites", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) { showToast(json?.error ?? "Impossible de charger vos activités.", "error"); return; }
    setActivites(json.activites);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [router, charger]);

  const categoriesPresentes = useMemo(() => {
    const set = new Set((activites ?? []).map((a) => a.categorie));
    return [...set];
  }, [activites]);

  const activitesFiltrees = useMemo(() => {
    if (!activites) return [];
    const q = recherche.trim().toLowerCase();
    return activites.filter((a) => {
      if (categorie && a.categorie !== categorie) return false;
      if (statutFiltre !== "tous" && a.statut !== statutFiltre) return false;
      if (fenetre !== "tous") {
        const jours = (nowTick - new Date(a.date).getTime()) / (1000 * 60 * 60 * 24);
        if (fenetre === "aujourdhui" && jours > 1) return false;
        if (fenetre === "7jours" && jours > 7) return false;
        if (fenetre === "30jours" && jours > 30) return false;
        if (fenetre === "annee" && jours > 365) return false;
      }
      if (!q) return true;
      return a.titre.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q) || (a.institution_nom ?? "").toLowerCase().includes(q);
    });
  }, [activites, recherche, categorie, statutFiltre, fenetre, nowTick]);

  const groupes = useMemo(() => {
    const map = new Map<string, Activite[]>();
    for (const a of activitesFiltrees) {
      const g = groupeDate(a.date);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(a);
    }
    return [...map.entries()];
  }, [activitesFiltrees]);

  const kpi = useMemo(() => {
    const list = activites ?? [];
    return {
      total: list.length,
      etablissements: new Set(list.map((a) => a.institution_id).filter(Boolean)).size,
      qr: list.filter((a) => a.categorie === "qr" && a.type === "qr_presence").length,
      paiements: list.filter((a) => a.categorie === "paiement" && a.statut === "succes").length,
      avis: list.filter((a) => a.type === "avis_publie").length,
    };
  }, [activites]);

  // Bilan périodique (plan rétention v2, item 2) — entièrement calculé côté
  // client depuis les activités déjà chargées, zéro appel serveur
  // supplémentaire, zéro donnée inventée : "membre depuis" dérive de
  // l'activité "compte_cree" déjà présente, "ce mois-ci" est un simple
  // filtre par date sur la même liste.
  const bilan = useMemo(() => {
    const list = activites ?? [];
    const compteCree = list.find((a) => a.type === "compte_cree");
    const joursDepuis = compteCree ? Math.floor((nowTick - new Date(compteCree.date).getTime()) / 86400000) : null;

    function texteDepuis(j: number): string {
      if (j < 30) return `${j} jour${j > 1 ? "s" : ""}`;
      if (j < 365) return `${Math.floor(j / 30)} mois`;
      const ans = Math.floor(j / 365);
      return `${ans} an${ans > 1 ? "s" : ""}`;
    }

    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
    const ceMois = list.filter((a) => new Date(a.date) >= debutMois);

    return {
      joursDepuis,
      texteDepuis: joursDepuis !== null ? texteDepuis(joursDepuis) : null,
      rdvCeMois: ceMois.filter((a) => a.type === "rdv_creation").length,
      avisCeMois: ceMois.filter((a) => a.type === "avis_publie").length,
      documentsCeMois: ceMois.filter((a) => a.categorie === "document").length,
      totalCeMois: ceMois.length,
    };
  }, [activites, nowTick]);

  async function handleUpload() {
    if (!detail || !uploadFile) return;
    setUploading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); setUploading(false); return; }
    const fd = new FormData();
    fd.append("accessToken", session.access_token);
    fd.append("documentId", String(detail.meta.document_id));
    fd.append("file", uploadFile);
    const res = await fetch("/api/citoyen/documents/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => null);
    setUploading(false);
    if (!res.ok) { showToast(json?.error ?? "Impossible de téléverser ce document.", "error"); return; }
    showToast("Document envoyé.");
    setUploadFile(null);
    setDetail(null);
    await charger();
  }

  async function handleTelechargerDocument() {
    if (!detail) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/citoyen/documents?download=${detail.meta.document_id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok) { showToast("Impossible de télécharger ce document.", "error"); return; }
    window.open(json.url, "_blank");
  }

  const btnGhost: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontWeight: 700, fontSize: "12.5px",
    padding: "8px 12px", borderRadius: "10px", border: `1px solid ${brd}`, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
  };
  const chip = (actif: boolean): React.CSSProperties => ({
    ...btnGhost, flexShrink: 0,
    backgroundColor: actif ? "rgba(245,166,35,0.12)" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
    borderColor: actif ? "rgba(245,166,35,0.4)" : brd, color: actif ? "#F5A623" : t1,
  });

  if (loading) {
    return <CompteLoadingScreen titre="Activités passées"/>;
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      <CompteHeader titre="Activités passées"/>
      <PullToRefresh onRefresh={charger} isDark={isDark}>
      <main style={{ padding: "16px 16px 40px" }}>
        <div style={{ padding: "4px 4px 20px" }}>
          <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5 }}>Retrouvez toutes les actions réalisées avec votre compte Yelen.</p>
        </div>

        {/* Bilan périodique */}
        {bilan.texteDepuis && (
          <div style={{ background: "linear-gradient(135deg, rgba(245,166,35,0.12), rgba(245,166,35,0.03))", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "18px", padding: "18px 16px", marginBottom: "16px" }}>
            <div style={{ color: t2, fontSize: "11.5px", fontWeight: 700, marginBottom: "4px" }}>Votre bilan</div>
            <div style={{ color: t1, fontSize: "15.5px", fontWeight: 800, lineHeight: 1.4, marginBottom: "16px" }}>
              {bilan.joursDepuis !== null && bilan.joursDepuis >= 365
                ? `Il y a ${bilan.texteDepuis}, vous rejoigniez Yelen.`
                : `Membre depuis ${bilan.texteDepuis}.`}
            </div>
            {bilan.totalCeMois > 0 ? (
              <>
                <div style={{ color: t3, fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", marginBottom: "8px" }}>CE MOIS-CI</div>
                <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
                  {[
                    { label: "rendez-vous", valeur: bilan.rdvCeMois },
                    { label: "avis publiés", valeur: bilan.avisCeMois },
                    { label: "documents", valeur: bilan.documentsCeMois },
                  ].filter((x) => x.valeur > 0).map((x) => (
                    <div key={x.label}>
                      <div style={{ color: t1, fontSize: "18px", fontWeight: 900 }}>{x.valeur}</div>
                      <div style={{ color: t2, fontSize: "10.5px", fontWeight: 600 }}>{x.label}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: t2, fontSize: "12px" }}>Aucune activité pour l&apos;instant ce mois-ci.</div>
            )}
          </div>
        )}

        {/* Résumé */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "10px" }}>
          <div style={{ backgroundColor: card, borderRadius: "14px", padding: "14px 8px", textAlign: "center", gridColumn: "span 3" }}>
            <div style={{ color: t1, fontSize: "26px", fontWeight: 900 }}>{kpi.total}</div>
            <div style={{ color: t2, fontSize: "11px", fontWeight: 700, marginTop: "2px" }}>activités au total</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Établissements", valeur: kpi.etablissements },
            { label: "QR scannés", valeur: kpi.qr },
            { label: "Paiements", valeur: kpi.paiements },
            { label: "Avis", valeur: kpi.avis },
          ].map((k) => (
            <div key={k.label} style={{ backgroundColor: card, borderRadius: "14px", padding: "12px 6px", textAlign: "center" }}>
              <div style={{ color: t1, fontSize: "16px", fontWeight: 900 }}>{k.valeur}</div>
              <div style={{ color: t2, fontSize: "9.5px", fontWeight: 700, marginTop: "2px" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Recherche */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: t3 }}><Ic.Search/></div>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (établissement, service, mot-clé)…" style={{ width: "100%", backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px 14px 12px 40px", color: t1, fontSize: "14px" }}/>
        </div>

        {/* Filtres date */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "10px", paddingBottom: "2px" }}>
          {([["tous", "Tous"], ["aujourdhui", "Aujourd'hui"], ["7jours", "7 jours"], ["30jours", "30 jours"], ["annee", "Cette année"]] as [FenetreDate, string][]).map(([k, l]) => (
            <button key={k} className="tap" onClick={() => setFenetre(k)} style={chip(fenetre === k)}>{l}</button>
          ))}
        </div>

        {/* Filtres catégorie */}
        {categoriesPresentes.length > 1 && (
          <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "10px", paddingBottom: "2px" }}>
            <button className="tap" onClick={() => setCategorie(null)} style={chip(!categorie)}>Tous types</button>
            {categoriesPresentes.map((c) => (
              <button key={c} className="tap" onClick={() => setCategorie(c)} style={chip(categorie === c)}>{CATEGORIE_LABEL[c] ?? c}</button>
            ))}
          </div>
        )}

        {/* Filtres statut */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "20px", paddingBottom: "2px" }}>
          {([["tous", "Tous"], ["succes", "Succès"], ["attente", "En attente"], ["annule", "Annulé"], ["echec", "Échec"]] as [FiltreStatut, string][]).map(([k, l]) => (
            <button key={k} className="tap" onClick={() => setStatutFiltre(k)} style={chip(statutFiltre === k)}>{l}</button>
          ))}
        </div>

        {/* État vide */}
        {activitesFiltrees.length === 0 && (activites?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <div style={{ color: t3, marginBottom: "16px", display: "flex", justifyContent: "center" }}><Ic.Building/></div>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Aucune activité</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "20px" }}>Vos rendez-vous, paiements, scans QR et autres actions apparaîtront ici automatiquement.</div>
            <Link href="/recherche" className="tap" style={{ display: "inline-block", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "13px 22px", borderRadius: "14px", textDecoration: "none" }}>Découvrir des établissements</Link>
          </div>
        )}
        {activitesFiltrees.length === 0 && (activites?.length ?? 0) > 0 && (
          <div style={{ textAlign: "center", padding: "32px 20px", color: t2, fontSize: "13px" }}>Aucun résultat pour ces filtres.</div>
        )}

        {/* Timeline */}
        {groupes.map(([label, items]) => (
          <div key={label} style={{ marginBottom: "20px" }}>
            <div style={{ color: t2, fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>{label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {items.map((a) => {
                const IconComp = ICON_PAR_CATEGORIE[a.categorie] ?? Ic.Doc;
                return (
                  <button key={a.id} onClick={() => setDetail(a)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: card, borderRadius: "16px", padding: "12px 14px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "12px", background: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#F5A623" }}><IconComp/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.institution_nom ? `${a.institution_nom} — ${a.titre}` : a.titre}</div>
                      <div style={{ color: t2, fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description || new Date(a.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                    </div>
                    <span style={{ color: STATUT_COULEUR[a.statut], fontSize: "10.5px", fontWeight: 800, flexShrink: 0 }}>{a.statut_label}</span>
                    <span style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </main>
      </PullToRefresh>

      {/* Détail activité */}
      {detail && (
        <div onClick={() => { setDetail(null); setUploadFile(null); }} style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px", padding: "24px", maxWidth: "400px", width: "100%", border: `1px solid ${brd}`, maxHeight: "85svh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "11px", background: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623" }}>{(ICON_PAR_CATEGORIE[detail.categorie] ?? Ic.Doc)()}</div>
              <div style={{ color: t1, fontSize: "16px", fontWeight: 800 }}>{detail.titre}</div>
            </div>
            {detail.institution_nom && <div style={{ color: t2, fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>{detail.institution_nom}</div>}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <span style={{ color: STATUT_COULEUR[detail.statut], fontSize: "11.5px", fontWeight: 800, background: `${STATUT_COULEUR[detail.statut]}18`, padding: "3px 9px", borderRadius: "20px" }}>{detail.statut_label}</span>
              <span style={{ color: t3, fontSize: "11.5px" }}>{formatDateHeure(detail.date)}</span>
            </div>

            {detail.description && <div style={{ color: t1, fontSize: "13.5px", lineHeight: 1.5, marginBottom: "16px" }}>{detail.description}</div>}

            {/* Actions rapides selon type */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {detail.categorie === "rdv" && (
                <Link href="/mes-rdv" className="tap" style={{ textAlign: "center", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "13.5px", padding: "12px", borderRadius: "12px", textDecoration: "none" }}>Voir mes rendez-vous</Link>
              )}
              {detail.institution_id && (
                <Link href={`/institution/${detail.institution_id}`} className="tap" style={btnGhost}>Voir l&apos;établissement</Link>
              )}
              {detail.type === "document_demande" && detail.statut === "attente" && (
                <>
                  <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "9px 11px", color: t2, fontSize: "11px", lineHeight: 1.5 }}>
                    Assurez-vous de reconnaître cette demande avant d&apos;envoyer un document sensible. En cas de doute, ne l&apos;envoyez pas et signalez l&apos;établissement.
                  </div>
                  <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} style={{ color: t2, fontSize: "12px" }}/>
                  <button disabled={!uploadFile || uploading} onClick={handleUpload} className="tap" style={{ ...btnGhost, justifyContent: "center", background: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.4)", color: "#F5A623", opacity: !uploadFile || uploading ? 0.5 : 1 }}>
                    <Ic.Upload/> {uploading ? "Envoi…" : "Téléverser le document"}
                  </button>
                </>
              )}
              {(detail.type === "document_envoye" || (detail.type === "document_demande" && detail.statut === "succes")) && (
                <button onClick={handleTelechargerDocument} className="tap" style={btnGhost}><Ic.Download/> Télécharger</button>
              )}
              {detail.categorie === "document" && detail.institution_id && (
                <Link href={`/signalement?institution_id=${detail.institution_id}`} className="tap" style={{ ...btnGhost, color: "#ef4444" }}>Signaler cet établissement</Link>
              )}
              {detail.categorie === "avis" && (
                <Link href="/compte/mes-avis" className="tap" style={btnGhost}>Voir mes avis</Link>
              )}
              {detail.categorie === "favori" && (
                <Link href="/compte/favoris" className="tap" style={btnGhost}>Voir mes favoris</Link>
              )}
            </div>

            <button onClick={() => { setDetail(null); setUploadFile(null); }} className="tap" style={{ width: "100%", marginTop: "14px", background: "none", border: "none", color: t3, fontSize: "12.5px", cursor: "pointer", padding: "8px" }}>Fermer</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
