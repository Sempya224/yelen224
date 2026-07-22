"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { SECTEUR_LABELS } from "@/lib/secteurs";

const P = { pointerEvents: "none" as const };
const Ic = {
  Search: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Star:   (filled: boolean, color = "#F5A623") => <svg width="16" height="16" viewBox="0 0 20 20" fill={filled ? color : "none"} stroke={color} strokeWidth="1"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/></svg>,
  Building: () => <svg style={P} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  Reply:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>,
  Edit:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Share:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>,
  Copy:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Trash:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
  Eye:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Views:  () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Utile:  () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>,
};

type Avis = {
  id: string; titre: string | null; note: number; commentaire: string | null;
  reponse_institution: string | null; reponse_le: string | null; masque: boolean; brouillon: boolean;
  created_at: string; institution_id: string; rdv_id: string | null;
  institutions: { name: string; secteur: string | null; ville: string | null; logo: string | null } | null;
  rdv: { date_rdv: string } | null;
  vues_count: number; utile_count: number;
};

type Filtre = "tous" | "5" | "4" | "3" | "2" | "1" | "avec_reponse" | "sans_reponse" | "masques" | "brouillons";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function Stars({ note, size = 13 }: { note: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: "1px" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ width: size, height: size, display: "inline-flex" }}>
          <svg width={size} height={size} viewBox="0 0 20 20" fill={n <= note ? "#F5A623" : "none"} stroke="#F5A623" strokeWidth="1"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .95-.69l1.07-3.292Z"/></svg>
        </span>
      ))}
    </div>
  );
}

export function MesAvisClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [userId, setUserId] = useState<string | null>(null);
  const [avis, setAvis] = useState<Avis[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");

  const [edition, setEdition] = useState<Avis | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [editNote, setEditNote] = useState(0);
  const [editCommentaire, setEditCommentaire] = useState("");

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("avis")
      .select("id,titre,note,commentaire,reponse_institution,reponse_le,masque,brouillon,created_at,institution_id,rdv_id,institutions(name,secteur,ville,logo),rdv(date_rdv)")
      .eq("citoyen_id", id)
      .order("created_at", { ascending: false });
    if (error) { showToast("Impossible de charger vos avis.", "error"); return; }

    const ids = (data ?? []).map((a) => a.id);
    const [{ data: vuesData }, { data: utileData }] = ids.length
      ? await Promise.all([
          supabase.from("avis_vues").select("avis_id").in("avis_id", ids),
          supabase.from("avis_utile").select("avis_id").in("avis_id", ids),
        ])
      : [{ data: [] }, { data: [] }];
    const vuesMap = new Map<string, number>();
    for (const v of vuesData ?? []) vuesMap.set(v.avis_id, (vuesMap.get(v.avis_id) ?? 0) + 1);
    const utileMap = new Map<string, number>();
    for (const u of utileData ?? []) utileMap.set(u.avis_id, (utileMap.get(u.avis_id) ?? 0) + 1);

    setAvis((data ?? []).map((a) => ({ ...a, vues_count: vuesMap.get(a.id) ?? 0, utile_count: utileMap.get(a.id) ?? 0 })) as unknown as Avis[]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    setUserId(id);
    void (async () => { setLoading(true); await charger(id); setLoading(false); })();
  }, [router, charger]);

  const avisFiltres = useMemo(() => {
    if (!avis) return [];
    const q = recherche.trim().toLowerCase();
    return avis.filter((a) => {
      if (filtre === "brouillons") { if (!a.brouillon) return false; }
      else {
        if (a.brouillon) return false;
        if (filtre === "masques") { if (!a.masque) return false; }
        else if (a.masque) return false;
        if (["5", "4", "3", "2", "1"].includes(filtre) && a.note !== Number(filtre)) return false;
        if (filtre === "avec_reponse" && !a.reponse_institution) return false;
        if (filtre === "sans_reponse" && a.reponse_institution) return false;
      }
      if (!q) return true;
      return (a.institutions?.name ?? "").toLowerCase().includes(q) || (a.commentaire ?? "").toLowerCase().includes(q) || (a.titre ?? "").toLowerCase().includes(q);
    });
  }, [avis, recherche, filtre]);

  const kpi = useMemo(() => {
    const list = (avis ?? []).filter((a) => !a.brouillon);
    const noteMoyenne = list.length ? list.reduce((s, a) => s + a.note, 0) / list.length : 0;
    const etablissements = new Set(list.map((a) => a.institution_id));
    return {
      noteMoyenne,
      publies: list.length,
      reponses: list.filter((a) => a.reponse_institution).length,
      etablissements: etablissements.size,
      brouillons: (avis ?? []).filter((a) => a.brouillon).length,
    };
  }, [avis]);

  async function handleToggleMasque(a: Avis) {
    setBusy(a.id);
    const { error } = await supabase.from("avis").update({ masque: !a.masque }).eq("id", a.id);
    setBusy(null);
    if (error) { showToast("Impossible de mettre à jour cet avis.", "error"); return; }
    setAvis((prev) => prev?.map((x) => (x.id === a.id ? { ...x, masque: !x.masque } : x)) ?? null);
  }

  async function handleSupprimer(a: Avis) {
    if (!window.confirm("Supprimer définitivement cet avis ?")) return;
    setBusy(a.id);
    const { error } = await supabase.from("avis").delete().eq("id", a.id);
    setBusy(null);
    if (error) { showToast("Impossible de supprimer cet avis.", "error"); return; }
    setAvis((prev) => prev?.filter((x) => x.id !== a.id) ?? null);
  }

  async function handleCopier(a: Avis) {
    const texte = [a.titre, a.commentaire].filter(Boolean).join(" — ");
    try { await navigator.clipboard.writeText(texte || ""); showToast("Avis copié."); } catch {}
  }

  async function handlePartager(a: Avis) {
    const texte = [a.titre, a.commentaire].filter(Boolean).join(" — ");
    if (navigator.share) {
      try { await navigator.share({ title: a.institutions?.name ?? "Mon avis", text: texte }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(texte || ""); showToast("Avis copié."); } catch {}
    }
  }

  function ouvrirEdition(a: Avis) {
    setEdition(a);
    setEditTitre(a.titre ?? "");
    setEditNote(a.note);
    setEditCommentaire(a.commentaire ?? "");
  }

  async function handleEnregistrerEdition(publier: boolean) {
    if (!edition || editNote === 0) return;
    const nouveauBrouillon = edition.brouillon && !publier;
    setBusy(`edit-${edition.id}`);
    const { error } = await supabase.from("avis").update({
      titre: editTitre.trim() || null, note: editNote, commentaire: editCommentaire.trim() || null, brouillon: nouveauBrouillon,
    }).eq("id", edition.id);
    if (!error && publier && edition.rdv_id) {
      await supabase.from("rdv").update({ avis_demande: false }).eq("id", edition.rdv_id);
    }
    setBusy(null);
    if (error) { showToast("Impossible d'enregistrer les modifications.", "error"); return; }
    setAvis((prev) => prev?.map((x) => (x.id === edition.id ? { ...x, titre: editTitre.trim() || null, note: editNote, commentaire: editCommentaire.trim() || null, brouillon: nouveauBrouillon } : x)) ?? null);
    setEdition(null);
    showToast(edition.brouillon ? (publier ? "Avis publié." : "Brouillon mis à jour.") : "Avis modifié.");
  }

  const btnGhost: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontWeight: 700, fontSize: "12.5px",
    padding: "8px 12px", borderRadius: "10px", border: `1px solid ${brd}`, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f5f5f8", border: `1px solid ${brd}`,
    borderRadius: "12px", padding: "12px 14px", color: t1, fontSize: "14px",
  };

  const FILTRES: { key: Filtre; label: string }[] = [
    { key: "tous", label: "Tous" }, { key: "5", label: "5★" }, { key: "4", label: "4★" }, { key: "3", label: "3★" },
    { key: "2", label: "2★" }, { key: "1", label: "1★" }, { key: "avec_reponse", label: "Avec réponse" },
    { key: "sans_reponse", label: "Sans réponse" }, { key: "masques", label: "Masqués" },
    ...(kpi.brouillons > 0 ? [{ key: "brouillons" as const, label: `Brouillons (${kpi.brouillons})` }] : []),
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "40px", height: "40px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      <CompteHeader titre="Mes avis"/>
      <main style={{ padding: "16px 16px 40px", maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "4px 4px 20px" }}>
          <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5, flex: 1 }}>Vos expériences partagées avec les établissements Yelen.</p>
          <span style={{ color: t2, fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", marginLeft: "12px" }}>{kpi.publies} avis</span>
        </div>

        {/* Résumé */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
          <div style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px 6px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "4px" }}><Stars note={Math.round(kpi.noteMoyenne)}/></div>
            <div style={{ color: t2, fontSize: "10px", fontWeight: 700 }}>Note moyenne</div>
          </div>
          {[
            { label: "Publiés", valeur: kpi.publies },
            { label: "Réponses", valeur: kpi.reponses },
            { label: "Établissements", valeur: kpi.etablissements },
          ].map((k) => (
            <div key={k.label} style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px 6px", textAlign: "center" }}>
              <div style={{ color: t1, fontSize: "18px", fontWeight: 900 }}>{k.valeur}</div>
              <div style={{ color: t2, fontSize: "10px", fontWeight: 700, marginTop: "2px" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Recherche */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: t3 }}><Ic.Search/></div>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un établissement…" style={{ ...inputStyle, padding: "12px 14px 12px 40px" }}/>
        </div>

        {/* Filtres */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "20px", paddingBottom: "2px" }}>
          {FILTRES.map((f) => (
            <button key={f.key} className="tap" onClick={() => setFiltre(f.key)} style={{ ...btnGhost, flexShrink: 0, backgroundColor: filtre === f.key ? "rgba(245,166,35,0.12)" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), borderColor: filtre === f.key ? "rgba(245,166,35,0.4)" : brd, color: filtre === f.key ? "#F5A623" : t1 }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* État vide */}
        {avisFiltres.length === 0 && (avis?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <div style={{ color: t3, marginBottom: "16px", display: "flex", justifyContent: "center" }}><Ic.Building/></div>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Aucun avis publié</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "20px" }}>Après chaque rendez-vous terminé, vous pourrez partager votre expérience afin d'aider les autres citoyens.</div>
            <Link href="/mes-rdv" className="tap" style={{ display: "inline-block", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "13px 22px", borderRadius: "14px", textDecoration: "none" }}>Voir mes RDV</Link>
          </div>
        )}
        {avisFiltres.length === 0 && (avis?.length ?? 0) > 0 && (
          <div style={{ textAlign: "center", padding: "32px 20px", color: t2, fontSize: "13px" }}>Aucun résultat pour ces filtres.</div>
        )}

        {/* Liste */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {avisFiltres.map((a) => (
            <div key={a.id} style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "18px", padding: "16px" }}>
              <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "12px", background: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {a.institutions?.logo ? <img src={a.institutions.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <span style={{ color: "#F5A623", fontWeight: 800, fontSize: "13px" }}>{(a.institutions?.name ?? "?").slice(0, 2).toUpperCase()}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: t1, fontSize: "14px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.institutions?.name ?? "Établissement"}</div>
                  <div style={{ color: t2, fontSize: "11px" }}>
                    {a.institutions?.secteur ? (SECTEUR_LABELS[a.institutions.secteur] ?? a.institutions.secteur) : ""}
                    {a.institutions?.ville ? ` · ${a.institutions.ville}` : ""}
                    {a.rdv?.date_rdv ? ` · RDV du ${formatDate(a.rdv.date_rdv)}` : ""}
                  </div>
                </div>
                {a.brouillon && (
                  <span style={{ flexShrink: 0, background: "rgba(142,142,147,0.15)", color: t2, fontSize: "10px", fontWeight: 800, padding: "3px 8px", borderRadius: "20px", textTransform: "uppercase" as const }}>Brouillon</span>
                )}
                {a.masque && <span style={{ color: t3, flexShrink: 0 }}><Ic.EyeOff/></span>}
              </div>

              <div style={{ marginBottom: "8px" }}><Stars note={a.note}/></div>
              {a.titre && <div style={{ color: t1, fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>{a.titre}</div>}
              {a.commentaire && <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "10px" }}>{a.commentaire}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: t3, fontSize: "11px", marginBottom: a.reponse_institution ? "10px" : "12px" }}>
                <span>{a.brouillon ? "Brouillon non publié" : `Publié le ${formatDate(a.created_at)}`}</span>
                {!a.brouillon && (
                  <>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}><Ic.Views/> {a.vues_count}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}><Ic.Utile/> {a.utile_count} utile{a.utile_count > 1 ? "s" : ""}</span>
                  </>
                )}
              </div>

              {a.reponse_institution && (
                <div style={{ background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "12px", padding: "10px 12px", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ color: "#F5A623" }}><Ic.Reply/></span>
                    <span style={{ color: "#F5A623", fontSize: "11.5px", fontWeight: 800 }}>Réponse de {a.institutions?.name ?? "l'établissement"}</span>
                    {a.reponse_le && <span style={{ color: t3, fontSize: "10.5px" }}>· {formatDate(a.reponse_le)}</span>}
                  </div>
                  <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.4 }}>{a.reponse_institution}</div>
                </div>
              )}

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {a.brouillon ? (
                  <>
                    <button className="tap" style={{ ...btnGhost, background: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.4)", color: "#F5A623" }} onClick={() => ouvrirEdition(a)}><Ic.Edit/> Continuer</button>
                    <button disabled={busy === a.id} className="tap" style={{ ...btnGhost, color: "#ef4444", opacity: busy === a.id ? 0.5 : 1 }} onClick={() => handleSupprimer(a)}><Ic.Trash/> Supprimer</button>
                  </>
                ) : (
                  <>
                    <button className="tap" style={btnGhost} onClick={() => ouvrirEdition(a)}><Ic.Edit/> Modifier</button>
                    <button className="tap" style={btnGhost} onClick={() => handlePartager(a)}><Ic.Share/> Partager</button>
                    <button className="tap" style={btnGhost} onClick={() => handleCopier(a)}><Ic.Copy/> Copier</button>
                    <button disabled={busy === a.id} className="tap" style={{ ...btnGhost, opacity: busy === a.id ? 0.5 : 1 }} onClick={() => handleToggleMasque(a)}>
                      {a.masque ? <Ic.Eye/> : <Ic.EyeOff/>} {a.masque ? "Afficher" : "Masquer"}
                    </button>
                    <button disabled={busy === a.id} className="tap" style={{ ...btnGhost, color: "#ef4444", opacity: busy === a.id ? 0.5 : 1 }} onClick={() => handleSupprimer(a)}><Ic.Trash/> Supprimer</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Pop-up édition */}
      {edition && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: card, borderRadius: "24px", padding: "24px", maxWidth: "380px", width: "100%", border: `1px solid ${brd}` }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "16px" }}>{edition.brouillon ? "Continuer mon brouillon" : "Modifier mon avis"}</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setEditNote(n)} className="tap" style={{ background: "none", border: "none", cursor: "pointer", opacity: n <= editNote ? 1 : 0.25 }}>{Ic.Star(n <= editNote, "#F5A623")}</button>
              ))}
            </div>
            <input style={{ ...inputStyle, marginBottom: "10px" }} value={editTitre} onChange={(e) => setEditTitre(e.target.value)} placeholder="Titre (optionnel)" maxLength={80}/>
            <textarea style={{ ...inputStyle, marginBottom: "16px", resize: "none" }} rows={3} value={editCommentaire} onChange={(e) => setEditCommentaire(e.target.value)} placeholder="Commentaire (optionnel)"/>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="tap" style={{ ...btnGhost, flex: 1, justifyContent: "center" }} onClick={() => setEdition(null)}>Annuler</button>
              {edition.brouillon && (
                <button disabled={editNote === 0 || busy === `edit-${edition.id}`} className="tap" style={{ ...btnGhost, flex: 1, justifyContent: "center", opacity: editNote === 0 || busy === `edit-${edition.id}` ? 0.6 : 1 }} onClick={() => handleEnregistrerEdition(false)}>
                  Brouillon
                </button>
              )}
              <button disabled={editNote === 0 || busy === `edit-${edition.id}`} className="tap" style={{ flex: 1, background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "13.5px", padding: "10px", borderRadius: "12px", border: "none", cursor: "pointer", opacity: editNote === 0 || busy === `edit-${edition.id}` ? 0.6 : 1 }} onClick={() => handleEnregistrerEdition(true)}>
                {busy === `edit-${edition.id}` ? "…" : edition.brouillon ? "Publier" : "Enregistrer"}
              </button>
            </div>
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
