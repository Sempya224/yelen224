"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import Link from "next/link";

export default function MonQRPage() {
  const router = useRouter();
  const [rdvs, setRdvs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.push("/login"); return; }
    setUserId(id);
    setLoading(true);
    supabase
      .from("rdv")
      .select("id,date_rdv,heure_rdv,statut,objet,institution_id,presence_status")
      .eq("citoyen_id", id)
      .neq("statut", "annule")
      .gte("date_rdv", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .order("date_rdv")
      .limit(10)
      .then(({ data }) => { if (data) setRdvs(data); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Expiré"); setQrDataUrl(""); clearInterval(t); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  async function genererQR(rdv: any) {
    setGenerating(true); setError(""); setSelected(rdv); setQrDataUrl(""); setTimeLeft("");
    try {
      const res = await fetch("/api/qr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rdv_id: rdv.id, citoyen_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur génération QR"); setGenerating(false); return; }

      // Générer le QR visuellement avec un canvas
      const payload = data.qr_payload;
      setExpiresAt(data.expires_at);

      // Utiliser l'API QR code via CDN
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}&bgcolor=ffffff&color=080812&margin=10`;
      setQrDataUrl(qrUrl);
    } catch { setError("Erreur réseau"); }
    setGenerating(false);
  }

  function stColor(s: string) {
    if (s === "confirme") return { c: "#22c55e", bg: "rgba(34,197,94,0.12)", l: "Confirmé" };
    if (s === "en_attente") return { c: "#F5A623", bg: "rgba(245,166,35,0.12)", l: "En attente" };
    return { c: "#8E8E93", bg: "rgba(142,142,147,0.12)", l: s };
  }

  function presColor(s: string) {
    if (s === "present") return { c: "#22c55e", l: " Présent" };
    if (s === "absent") return { c: "#ef4444", l: " Absent" };
    return { c: "#F5A623", l: " En attente" };
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: "#F2F2F7", fontFamily: "-apple-system,BlinkMacSystemFont,sans-serif", paddingBottom: "40px" }}>
      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg,#F5A623,#C8940A)", padding: "56px 20px 24px" }}>
        <div style={{ height: "3px", background: "linear-gradient(90deg,#CE1126 33.3%,#FCD20F 33.3% 66.6%,#009A44 66.6%)", margin: "-56px -20px 40px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
          <Link href="/" style={{ color: "#080812", fontSize: "14px", fontWeight: "700", textDecoration: "none", opacity: 0.6 }}> Retour</Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "16px", backgroundColor: "rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>
          </div>
          <div>
            <div style={{ color: "#080812", fontSize: "22px", fontWeight: "900" }}>Mon QR Code</div>
            <div style={{ color: "rgba(8,8,18,0.6)", fontSize: "13px", fontWeight: "600" }}>Présentez ce code à l'accueil de l'institution</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: "480px", margin: "0 auto" }}>

        {/* INFO BOX */}
        <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "12px", border: "1px solid rgba(245,166,35,0.2)" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div style={{ fontSize: "12px", color: "#6C6C70", lineHeight: 1.5 }}>
            Sélectionnez un RDV ci-dessous pour générer votre QR Code unique. Présentez-le à l'accueil pour confirmer votre présence.
          </div>
        </div>

        {/* LISTE RDV */}
        {loading && (
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "32px", textAlign: "center", color: "#F5A623", fontWeight: "700" }}>
            Chargement de vos rendez-vous...
          </div>
        )}

        {!loading && rdvs.length === 0 && (
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}></div>
            <div style={{ color: "#080812", fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>Aucun rendez-vous à venir</div>
            <div style={{ color: "#6C6C70", fontSize: "13px", marginBottom: "20px" }}>Prenez un rendez-vous pour obtenir votre QR Code.</div>
            <Link href="/recherche" style={{ display: "inline-block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>
              Trouver une institution
            </Link>
          </div>
        )}

        {rdvs.map(rdv => {
          const st = stColor(rdv.statut);
          const pr = presColor(rdv.presence_status || "en_attente");
          const isSelected = selected?.id === rdv.id;
          return (
            <div key={rdv.id} onClick={() => genererQR(rdv)}
              style={{ backgroundColor: "#fff", borderRadius: "18px", padding: "16px", marginBottom: "10px", cursor: "pointer", border: `2px solid ${isSelected ? "#F5A623" : "transparent"}`, boxShadow: isSelected ? "0 4px 20px rgba(245,166,35,0.2)" : "none", transition: "all 0.2s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <div>
                    <div style={{ color: "#080812", fontSize: "14px", fontWeight: "700" }}>{rdv.objet || "Rendez-vous"}</div>
                    <div style={{ color: "#6C6C70", fontSize: "12px" }}>
                      {new Date(rdv.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                      {rdv.heure_rdv && ` à ${rdv.heure_rdv}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                  <span style={{ backgroundColor: st.bg, color: st.c, fontSize: "9px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>{st.l}</span>
                  <span style={{ color: pr.c, fontSize: "10px", fontWeight: "700" }}>{pr.l}</span>
                </div>
              </div>
              {!isSelected && (
                <div style={{ backgroundColor: "#F5A623", color: "#080812", fontSize: "12px", fontWeight: "800", padding: "8px 14px", borderRadius: "10px", display: "inline-block" }}>
                  Générer mon QR Code 
                </div>
              )}
            </div>
          );
        })}

        {/* ERREUR */}
        {error && (
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "16px", border: "2px solid #ef4444", textAlign: "center" }}>
            <div style={{ color: "#ef4444", fontWeight: "700", marginBottom: "8px" }}>{error}</div>
            <button onClick={() => { setError(""); setSelected(null); }} style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", padding: "10px 20px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Réessayer</button>
          </div>
        )}

        {/* GENERATING */}
        {generating && (
          <div style={{ backgroundColor: "#fff", borderRadius: "20px", padding: "40px", textAlign: "center", marginBottom: "16px" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "spin 1s linear infinite" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            </div>
            <div style={{ color: "#080812", fontSize: "16px", fontWeight: "700" }}>Génération sécurisée...</div>
            <div style={{ color: "#6C6C70", fontSize: "13px", marginTop: "6px" }}>Création de votre QR Code unique</div>
          </div>
        )}

        {/* QR CODE AFFICHÉ */}
        {qrDataUrl && !generating && (
          <div style={{ backgroundColor: "#fff", borderRadius: "24px", padding: "28px 24px", textAlign: "center", marginBottom: "16px", boxShadow: "0 8px 40px rgba(245,166,35,0.2)", border: "2px solid rgba(245,166,35,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "20px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#22c55e", animation: "pulse 1.5s ease-in-out infinite" }} />
              <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700" }}>QR Code actif</span>
              {timeLeft && <span style={{ color: "#6C6C70", fontSize: "12px" }}> Expire dans {timeLeft}</span>}
            </div>

            {/* QR IMAGE */}
            <div style={{ display: "inline-block", padding: "16px", backgroundColor: "#fff", borderRadius: "16px", border: "3px solid #F5A623", marginBottom: "20px", boxShadow: "0 4px 20px rgba(245,166,35,0.2)" }}>
              <img src={qrDataUrl} alt="QR Code" width="240" height="240" style={{ display: "block", borderRadius: "8px" }} />
            </div>

            {/* Infos RDV */}
            <div style={{ backgroundColor: "#F2F2F7", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", textAlign: "left" }}>
              <div style={{ color: "#6C6C70", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Votre rendez-vous</div>
              <div style={{ color: "#080812", fontSize: "14px", fontWeight: "700" }}>{selected?.objet || "Rendez-vous général"}</div>
              <div style={{ color: "#6C6C70", fontSize: "12px", marginTop: "3px" }}>
                {selected && new Date(selected.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                {selected?.heure_rdv && ` à ${selected.heure_rdv}`}
              </div>
            </div>

            {/* Instructions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                "Présentez ce QR Code à l'accueil de l'institution",
                "Le personnel va scanner votre code pour confirmer votre présence",
                "Ne partagez pas ce code  il est personnel et unique",
              ].map((txt, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", textAlign: "left" }}>
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "rgba(245,166,35,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "11px", fontWeight: "800", color: "#F5A623" }}>{i + 1}</div>
                  <span style={{ color: "#6C6C70", fontSize: "12px", lineHeight: 1.4 }}>{txt}</span>
                </div>
              ))}
            </div>

            {/* Regénérer */}
            <button onClick={() => genererQR(selected)} style={{ marginTop: "16px", width: "100%", backgroundColor: "rgba(245,166,35,0.1)", color: "#F5A623", fontWeight: "700", fontSize: "14px", padding: "12px", borderRadius: "12px", border: "1px solid rgba(245,166,35,0.3)", cursor: "pointer" }}>
               Regénérer le QR Code
            </button>
          </div>
        )}

        {/* SÉCURITÉ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", backgroundColor: "rgba(34,197,94,0.06)", borderRadius: "12px", border: "1px solid rgba(34,197,94,0.15)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span style={{ color: "#22c55e", fontSize: "11px", fontWeight: "700" }}>QR Code chiffré  Valide 3h  Unique par RDV</span>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.85)} }
      `}</style>
    </div>
  );
}
