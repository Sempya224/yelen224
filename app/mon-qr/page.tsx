"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import Link from "next/link";

// Refonte 16/07/2026 (décision CEO, écran wizard RDV) : cet écran mélangeait
// déjà les RDV gratuits ET payants dans une seule liste "rdv" — un RDV payant
// crée toujours une ligne rdv en plus de sa ligne paid_bookings (voir
// app/rdv/[id]/page.tsx). Mais cliquer dessus appelait /api/qr/generate qui
// ÉCRASAIT le code Yelen à 6 chiffres déjà généré à la réservation par un
// token HMAC différent — sans rapport avec le code que le citoyen a déjà vu
// et que l'institution valide manuellement (ValiderRdvTab.tsx, recherche par
// confirmation_code, pas de scan). Les deux flux sont maintenant séparés :
// - Gratuit : comportement inchangé, génération à la demande + scan institution.
// - Payant : lecture directe de paid_bookings (code déjà fixé, permanent,
//   jamais régénéré), affiché immédiatement sans appel serveur.
// Onglets Gratuit/Payant (au lieu d'un empilement vertical des deux listes)
// pour ne pas mélanger les deux logiques aux yeux du citoyen. Écran 100%
// mobile — jamais de mise en page PC ici, tous les écrans citoyen le sont.
const BLUE = "#4F8EF7";

function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " FCFA";
}

export default function MonQRPage() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<"gratuit" | "payant">("gratuit");
  const [rdvs, setRdvs] = useState<any[]>([]);
  const [paidBookings, setPaidBookings] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [selectedPaid, setSelectedPaid] = useState<any>(null);
  const [paidQrUrl, setPaidQrUrl] = useState("");
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
    const dateMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    Promise.all([
      supabase.from("rdv").select("id,date_rdv,heure_rdv,statut,objet,institution_id,presence_status")
        .eq("citoyen_id", id).neq("statut", "annule").gte("date_rdv", dateMin).order("date_rdv").limit(20),
      supabase.from("paid_bookings").select("id,confirmation_code,statut,date_rdv,heure_rdv,institution_id,paid_services(nom,prix,duree_minutes)")
        .eq("citoyen_id", id).neq("statut", "annule").gte("date_rdv", dateMin).order("date_rdv").limit(20),
    ]).then(([rdvRes, paidRes]) => {
      if (rdvRes.data) setRdvs(rdvRes.data);
      if (paidRes.data) setPaidBookings(paidRes.data);
      setLoading(false);
    });
  }, []);

  // Une réservation payante crée toujours une ligne `rdv` en plus de sa
  // ligne `paid_bookings` — on l'exclut de la liste "gratuits" pour ne pas
  // l'afficher en double, en la reconnaissant par créneau (institution +
  // date + heure).
  const paidSlotKeys = useMemo(() => new Set(paidBookings.map(b => `${b.institution_id}|${b.date_rdv}|${b.heure_rdv}`)), [paidBookings]);
  const rdvsGratuits = useMemo(() => rdvs.filter(r => !paidSlotKeys.has(`${r.institution_id}|${r.date_rdv}|${r.heure_rdv}`)), [rdvs, paidSlotKeys]);

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

      const payload = data.qr_payload;
      setExpiresAt(data.expires_at);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}&bgcolor=ffffff&color=080812&margin=10`;
      setQrDataUrl(qrUrl);
    } catch { setError("Erreur réseau"); }
    setGenerating(false);
  }

  function afficherQrPayant(booking: any) {
    setError("");
    setSelectedPaid(booking);
    setPaidQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(booking.confirmation_code)}&bgcolor=ffffff&color=080812&margin=10`);
  }

  function switchTab(t: "gratuit" | "payant") {
    setSubTab(t);
    setError("");
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

        {/* ── Onglets Gratuit / Payant ── */}
        <div style={{ display: "flex", gap: "6px", backgroundColor: "#fff", borderRadius: "16px", padding: "5px", marginBottom: "16px", border: "1px solid rgba(0,0,0,0.06)" }}>
          <button onClick={() => switchTab("gratuit")} style={{ flex: 1, background: subTab === "gratuit" ? "rgba(245,166,35,0.12)" : "transparent", border: subTab === "gratuit" ? "1.5px solid rgba(245,166,35,0.3)" : "1.5px solid transparent", borderRadius: "12px", padding: "10px 8px", color: subTab === "gratuit" ? "#F5A623" : "#8E8E93", fontSize: "13px", fontWeight: subTab === "gratuit" ? 800 : 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            Gratuit
            {rdvsGratuits.length > 0 && <span style={{ backgroundColor: subTab === "gratuit" ? "#F5A623" : "rgba(0,0,0,0.08)", color: subTab === "gratuit" ? "#fff" : "#8E8E93", fontSize: "9px", fontWeight: 900, padding: "2px 6px", borderRadius: "20px" }}>{rdvsGratuits.length}</span>}
          </button>
          <button onClick={() => switchTab("payant")} style={{ flex: 1, background: subTab === "payant" ? `${BLUE}15` : "transparent", border: subTab === "payant" ? `1.5px solid ${BLUE}50` : "1.5px solid transparent", borderRadius: "12px", padding: "10px 8px", color: subTab === "payant" ? BLUE : "#8E8E93", fontSize: "13px", fontWeight: subTab === "payant" ? 800 : 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            Payant
            {paidBookings.length > 0 && <span style={{ backgroundColor: subTab === "payant" ? BLUE : "rgba(0,0,0,0.08)", color: subTab === "payant" ? "#fff" : "#8E8E93", fontSize: "9px", fontWeight: 900, padding: "2px 6px", borderRadius: "20px" }}>{paidBookings.length}</span>}
          </button>
        </div>

        {loading && (
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "32px", textAlign: "center", color: "#F5A623", fontWeight: "700" }}>
            Chargement de vos rendez-vous...
          </div>
        )}

        {/* ═══════════════ ONGLET PAYANT ═══════════════ */}
        {!loading && subTab === "payant" && (
          <>
            <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "12px", border: `1px solid ${BLUE}30` }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: `${BLUE}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div style={{ fontSize: "12px", color: "#6C6C70", lineHeight: 1.5 }}>
                Votre code Yelen est déjà prêt — cliquez sur une réservation pour l'afficher. Il est permanent, pas besoin de le régénérer.
              </div>
            </div>

            {paidQrUrl && (
              <div style={{ backgroundColor: "#fff", borderRadius: "24px", padding: "28px 24px", textAlign: "center", marginBottom: "16px", boxShadow: "0 8px 40px rgba(245,166,35,0.2)", border: "2px solid rgba(245,166,35,0.3)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "20px" }}>
                  <span style={{ background: `${BLUE}18`, color: BLUE, fontSize: "10px", fontWeight: "800", padding: "3px 10px", borderRadius: "20px", textTransform: "uppercase" }}>Service payant</span>
                </div>
                <div style={{ display: "inline-block", padding: "16px", backgroundColor: "#fff", borderRadius: "16px", border: "3px solid #F5A623", marginBottom: "16px", boxShadow: "0 4px 20px rgba(245,166,35,0.2)" }}>
                  <img src={paidQrUrl} alt="QR Code" width="220" height="220" style={{ display: "block", borderRadius: "8px" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "4px", marginBottom: "16px" }}>
                  {selectedPaid.confirmation_code.split("").map((c: string, i: number) => (
                    <div key={i} style={{ width: "30px", height: "38px", borderRadius: "8px", background: "rgba(245,166,35,0.1)", border: "1.5px solid rgba(245,166,35,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", fontSize: "18px", fontWeight: "900", fontFamily: "monospace" }}>{c}</div>
                  ))}
                </div>
                <div style={{ backgroundColor: "#F2F2F7", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", textAlign: "left" }}>
                  <div style={{ color: "#6C6C70", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Votre réservation</div>
                  <div style={{ color: "#080812", fontSize: "14px", fontWeight: "700" }}>{selectedPaid.paid_services?.nom || "Service"}</div>
                  <div style={{ color: "#F5A623", fontSize: "13px", fontWeight: "800", marginTop: "2px" }}>{selectedPaid.paid_services ? formatPrix(selectedPaid.paid_services.prix) : ""} — sur place</div>
                  {selectedPaid.paid_services?.duree_minutes > 0 && <div style={{ color: "#6C6C70", fontSize: "12px", marginTop: "2px" }}>Durée estimée : {selectedPaid.paid_services.duree_minutes} minutes</div>}
                  <div style={{ color: "#6C6C70", fontSize: "12px", marginTop: "3px" }}>
                    {new Date(selectedPaid.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    {selectedPaid.heure_rdv && ` à ${selectedPaid.heure_rdv}`}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    "Présentez ce code au personnel à votre arrivée",
                    "Le paiement s'effectue sur place, directement auprès de l'établissement",
                    "Ce code est permanent — pas besoin de le régénérer",
                  ].map((txt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", textAlign: "left" }}>
                      <div style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "rgba(245,166,35,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "11px", fontWeight: "800", color: "#F5A623" }}>{i + 1}</div>
                      <span style={{ color: "#6C6C70", fontSize: "12px", lineHeight: 1.4 }}>{txt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {paidBookings.length === 0 ? (
              <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                <div style={{ color: "#080812", fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>Aucun service payant réservé</div>
                <div style={{ color: "#6C6C70", fontSize: "13px", marginBottom: "20px" }}>Réservez un service payant pour obtenir votre code Yelen.</div>
                <Link href="/recherche" style={{ display: "inline-block", backgroundColor: BLUE, color: "#fff", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>
                  Trouver une institution
                </Link>
              </div>
            ) : (
              paidBookings.map(b => {
                const st = stColor(b.statut);
                const isSelected = selectedPaid?.id === b.id;
                const svc = b.paid_services;
                return (
                  <div key={b.id} onClick={() => afficherQrPayant(b)}
                    style={{ backgroundColor: "#fff", borderRadius: "18px", padding: "16px", marginBottom: "10px", cursor: "pointer", border: `2px solid ${isSelected ? BLUE : "transparent"}`, boxShadow: isSelected ? `0 4px 20px ${BLUE}30` : "none", transition: "all 0.2s ease" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: `${BLUE}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                        </div>
                        <div>
                          <div style={{ color: "#080812", fontSize: "14px", fontWeight: "700" }}>{svc?.nom || "Service payant"}</div>
                          <div style={{ color: "#6C6C70", fontSize: "12px" }}>
                            {new Date(b.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                            {b.heure_rdv && ` à ${b.heure_rdv}`}
                          </div>
                          {svc?.duree_minutes > 0 && <div style={{ color: "#8E8E93", fontSize: "11px", marginTop: "1px" }}>Durée estimée : {svc.duree_minutes} min</div>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                        <span style={{ backgroundColor: `${BLUE}18`, color: BLUE, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>Payant</span>
                        <span style={{ backgroundColor: st.bg, color: st.c, fontSize: "9px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>{st.l}</span>
                      </div>
                    </div>
                    {!isSelected && (
                      <div style={{ background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontSize: "12px", fontWeight: "800", padding: "8px 14px", borderRadius: "10px", display: "inline-block" }}>
                        Afficher mon code Yelen
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ═══════════════ ONGLET GRATUIT ═══════════════ */}
        {!loading && subTab === "gratuit" && (
          <>
            <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "12px", border: "1px solid rgba(245,166,35,0.2)" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div style={{ fontSize: "12px", color: "#6C6C70", lineHeight: 1.5 }}>
                Sélectionnez un RDV ci-dessous pour générer votre QR Code unique. Présentez-le à l'accueil pour confirmer votre présence.
              </div>
            </div>

            {generating && (
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", padding: "40px", textAlign: "center", marginBottom: "16px" }}>
                <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "spin 1s linear infinite" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                </div>
                <div style={{ color: "#080812", fontSize: "16px", fontWeight: "700" }}>Génération sécurisée...</div>
                <div style={{ color: "#6C6C70", fontSize: "13px", marginTop: "6px" }}>Création de votre QR Code unique</div>
              </div>
            )}

            {qrDataUrl && !generating && (
              <div style={{ backgroundColor: "#fff", borderRadius: "24px", padding: "28px 24px", textAlign: "center", marginBottom: "16px", boxShadow: "0 8px 40px rgba(245,166,35,0.2)", border: "2px solid rgba(245,166,35,0.3)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "20px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#22c55e", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700" }}>QR Code actif</span>
                  {timeLeft && <span style={{ color: "#6C6C70", fontSize: "12px" }}> Expire dans {timeLeft}</span>}
                </div>

                <div style={{ display: "inline-block", padding: "16px", backgroundColor: "#fff", borderRadius: "16px", border: "3px solid #F5A623", marginBottom: "20px", boxShadow: "0 4px 20px rgba(245,166,35,0.2)" }}>
                  <img src={qrDataUrl} alt="QR Code" width="240" height="240" style={{ display: "block", borderRadius: "8px" }} />
                </div>

                <div style={{ backgroundColor: "#F2F2F7", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", textAlign: "left" }}>
                  <div style={{ color: "#6C6C70", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Votre rendez-vous</div>
                  <div style={{ color: "#080812", fontSize: "14px", fontWeight: "700" }}>{selected?.objet || "Rendez-vous général"}</div>
                  <div style={{ color: "#6C6C70", fontSize: "12px", marginTop: "3px" }}>
                    {selected && new Date(selected.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    {selected?.heure_rdv && ` à ${selected.heure_rdv}`}
                  </div>
                </div>

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

                <button onClick={() => genererQR(selected)} style={{ marginTop: "16px", width: "100%", backgroundColor: "rgba(245,166,35,0.1)", color: "#F5A623", fontWeight: "700", fontSize: "14px", padding: "12px", borderRadius: "12px", border: "1px solid rgba(245,166,35,0.3)", cursor: "pointer" }}>
                   Regénérer le QR Code
                </button>
              </div>
            )}

            {rdvsGratuits.length === 0 ? (
              <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                <div style={{ color: "#080812", fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>Aucun rendez-vous à venir</div>
                <div style={{ color: "#6C6C70", fontSize: "13px", marginBottom: "20px" }}>Prenez un rendez-vous pour obtenir votre QR Code.</div>
                <Link href="/recherche" style={{ display: "inline-block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>
                  Trouver une institution
                </Link>
              </div>
            ) : (
              rdvsGratuits.map(rdv => {
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
              })
            )}
          </>
        )}

        {/* ERREUR */}
        {error && (
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "16px", border: "2px solid #ef4444", textAlign: "center" }}>
            <div style={{ color: "#ef4444", fontWeight: "700", marginBottom: "8px" }}>{error}</div>
            <button onClick={() => setError("")} style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", padding: "10px 20px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Réessayer</button>
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
