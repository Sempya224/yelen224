"use client";

// "Mes documents" — écran dédié (18/07/2026, chantier "Activités
// passées") : liste complète des documents demandés/reçus, toutes
// institutions confondues. Complète l'affichage déjà présent dans
// Activités passées (une carte par événement) avec une vue centralisée,
// mirroring Mes avis/Favoris qui ont chacun leur propre écran en plus
// d'apparaître dans la timeline.
//
// Texte de sensibilisation sécurité ajouté à la demande de Bryan (retour
// direct après la démo) : le citoyen doit analyser chaque demande avant
// d'envoyer un document sensible, et savoir comment réagir en cas de
// doute (contacter Yelen + signaler l'établissement via le système de
// signalement déjà existant, pas un nouveau mécanisme).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";

const P = { pointerEvents: "none" as const };
const Ic = {
  Search: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Doc:    () => <svg style={P} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Shield: () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Alert:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>,
  Upload: () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Download: () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Flag:   () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
};

type Document = {
  id: string; institution_id: string; rdv_id: string; sens: "demande" | "envoi"; type: string;
  label: string; description: string | null; statut: "en_attente" | "televerse" | "envoye" | "annule";
  taille: number | null; type_mime: string | null; created_at: string; traite_le: string | null;
  institutions: { name: string } | null;
};

const STATUT_INFO: Record<Document["statut"], { label: string; color: string }> = {
  en_attente: { label: "En attente", color: "#F5A623" }, televerse: { label: "Reçu", color: "#22c55e" },
  envoye: { label: "Envoyé", color: "#22c55e" }, annule: { label: "Annulé", color: "#8E8E93" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function formatTaille(o: number | null): string {
  if (!o) return "";
  return o < 1024 * 1024 ? `${Math.round(o / 1024)} Ko` : `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}

export function MesDocumentsClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [recherche, setRecherche] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadCible, setUploadCible] = useState<Document | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
    const res = await fetch("/api/citoyen/documents", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) { showToast(json?.error ?? "Impossible de charger vos documents.", "error"); return; }
    setDocuments(json.documents);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [router, charger]);

  const documentsFiltres = useMemo(() => {
    if (!documents) return [];
    const q = recherche.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.label.toLowerCase().includes(q) || (d.institutions?.name ?? "").toLowerCase().includes(q));
  }, [documents, recherche]);

  async function handleTelecharger(d: Document) {
    setBusy(d.id);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); setBusy(null); return; }
    const res = await fetch(`/api/citoyen/documents?download=${d.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) { showToast(json?.error ?? "Impossible de télécharger ce document.", "error"); return; }
    window.open(json.url, "_blank");
  }

  async function handleUpload() {
    if (!uploadCible || !uploadFile) return;
    setBusy(uploadCible.id);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); setBusy(null); return; }
    const fd = new FormData();
    fd.append("accessToken", session.access_token);
    fd.append("documentId", uploadCible.id);
    fd.append("file", uploadFile);
    const res = await fetch("/api/citoyen/documents/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) { showToast(json?.error ?? "Impossible de téléverser ce document.", "error"); return; }
    showToast("Document envoyé.");
    setUploadCible(null); setUploadFile(null);
    await charger();
  }

  const btnGhost: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontWeight: 700, fontSize: "12.5px",
    padding: "8px 12px", borderRadius: "10px", border: `1px solid ${brd}`, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f5f5f8", border: `1px solid ${brd}`,
    borderRadius: "12px", padding: "12px 14px", color: t1, fontSize: "14px",
  };

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
      <CompteHeader titre="Mes documents"/>
      <main style={{ padding: "16px 16px 40px", maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ padding: "4px 4px 16px" }}>
          <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5 }}>Documents demandés ou envoyés par les établissements, tous confondus.</p>
        </div>

        {/* Bandeau sensibilisation sécurité */}
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "14px", padding: "14px 16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ color: "#ef4444" }}><Ic.Shield/></span>
            <span style={{ color: t1, fontSize: "13.5px", fontWeight: 800 }}>Avant d'envoyer un document</span>
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 18px", color: t2, fontSize: "12px", lineHeight: 1.6 }}>
            <li>Vérifiez que la demande concerne bien un rendez-vous que vous reconnaissez, avec l'établissement concerné.</li>
            <li>Ne transmettez jamais un document sensible (pièce d'identité, justificatif) si la demande vous semble inhabituelle ou non justifiée.</li>
            <li>Yelen ne vous demande jamais de document en dehors de cet écran — seul un établissement, via un rendez-vous réel, peut le faire ici.</li>
          </ul>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", color: "#ef4444", fontSize: "12px", fontWeight: 700 }}>
            <Ic.Alert/> En cas de doute, contactez immédiatement Yelen et signalez l'établissement.
          </div>
        </div>

        {/* Recherche */}
        {(documents?.length ?? 0) > 0 && (
          <div style={{ position: "relative", marginBottom: "20px" }}>
            <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: t3 }}><Ic.Search/></div>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un document ou un établissement…" style={{ ...inputStyle, padding: "12px 14px 12px 40px" }}/>
          </div>
        )}

        {/* État vide */}
        {(documents?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ color: t3, marginBottom: "16px", display: "flex", justifyContent: "center" }}><Ic.Doc/></div>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Aucun document</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5 }}>Les documents demandés ou envoyés par un établissement apparaîtront ici.</div>
          </div>
        )}
        {(documents?.length ?? 0) > 0 && documentsFiltres.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 20px", color: t2, fontSize: "13px" }}>Aucun résultat.</div>
        )}

        {/* Liste */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {documentsFiltres.map((d) => (
            <div key={d.id} style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "18px", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px", gap: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>{d.label}</div>
                  <div style={{ color: t2, fontSize: "11.5px", marginTop: "2px" }}>{d.institutions?.name ?? "Établissement"} · {d.sens === "demande" ? "Demande" : "Envoi"}{d.taille ? ` · ${formatTaille(d.taille)}` : ""} · {formatDate(d.created_at)}</div>
                </div>
                <span style={{ color: STATUT_INFO[d.statut].color, fontSize: "10.5px", fontWeight: 800, flexShrink: 0 }}>{STATUT_INFO[d.statut].label}</span>
              </div>
              {d.description && <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.4, marginBottom: "10px" }}>{d.description}</div>}

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {d.sens === "demande" && d.statut === "en_attente" && (
                  <button className="tap" style={{ ...btnGhost, background: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.4)", color: "#F5A623" }} onClick={() => setUploadCible(d)}>
                    <Ic.Upload/> Téléverser
                  </button>
                )}
                {(d.statut === "televerse" || d.statut === "envoye") && (
                  <button disabled={busy === d.id} className="tap" style={{ ...btnGhost, opacity: busy === d.id ? 0.5 : 1 }} onClick={() => handleTelecharger(d)}>
                    <Ic.Download/> Télécharger
                  </button>
                )}
                <Link href={`/signalement?institution_id=${d.institution_id}`} className="tap" style={{ ...btnGhost, color: "#ef4444" }}>
                  <Ic.Flag/> Signaler
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Pop-up téléversement */}
      {uploadCible && (
        <div onClick={() => { setUploadCible(null); setUploadFile(null); }} style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px", padding: "24px", maxWidth: "380px", width: "100%", border: `1px solid ${brd}` }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Téléverser : {uploadCible.label}</div>
            <div style={{ color: t2, fontSize: "12.5px", marginBottom: "14px" }}>Demandé par {uploadCible.institutions?.name ?? "l'établissement"}</div>

            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", padding: "10px 12px", marginBottom: "16px", color: t2, fontSize: "11.5px", lineHeight: 1.5 }}>
              Assurez-vous de reconnaître cette demande avant d'envoyer un document sensible. En cas de doute, annulez et signalez l'établissement.
            </div>

            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} style={{ width: "100%", marginBottom: "16px", color: t2, fontSize: "12px" }}/>

            <div style={{ display: "flex", gap: "8px" }}>
              <button className="tap" style={{ ...btnGhost, flex: 1, justifyContent: "center" }} onClick={() => { setUploadCible(null); setUploadFile(null); }}>Annuler</button>
              <button
                disabled={!uploadFile || busy === uploadCible.id}
                onClick={handleUpload}
                className="tap"
                style={{ flex: 1, background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "13.5px", padding: "10px", borderRadius: "12px", border: "none", cursor: "pointer", opacity: !uploadFile || busy === uploadCible.id ? 0.6 : 1 }}
              >
                {busy === uploadCible.id ? "…" : "Envoyer"}
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
