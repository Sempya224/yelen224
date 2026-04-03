"use client";
import { useState, useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

export default function ScannerPage() {
  const [institutionId, setInstitutionId] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner|null>(null);

  useEffect(() => {
    try { const id = localStorage.getItem("yelen224_institution_id"); if (id) setInstitutionId(id); } catch {}
    return () => { if (scannerRef.current) { scannerRef.current.clear().catch(()=>{}); } };
  }, []);

  function startScan() {
    setScanning(true); setResult(null); setError(""); setDone(false);
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      scanner.render(async (decodedText) => {
        scanner.clear().catch(()=>{});
        setScanning(false);
        try {
          const res = await fetch("/api/qr/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qr_payload: decodedText, institution_id: institutionId }) });
          const data = await res.json();
          if (!res.ok) { setError(data.error || "QR invalide"); return; }
          setResult(data);
        } catch { setError("Erreur réseau"); }
      }, () => {});
      scannerRef.current = scanner;
    }, 100);
  }

  async function confirmer(action: "present"|"absent") {
    if (!result?.rdv) return;
    setConfirming(true);
    await fetch("/api/qr/validate", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rdv_id: result.rdv.id, action, institution_id: institutionId }) });
    setConfirming(false); setDone(true); setResult(null);
  }

  const isDark = false;
  const bg = "#F2F2F7"; const card = "#fff"; const t1 = "#080812"; const t2 = "#6C6C70";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,sans-serif", padding: "80px 16px 40px" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <div style={{ backgroundColor: card, borderRadius: "20px", padding: "24px", marginBottom: "16px", textAlign: "center" }}>
          <div style={{ width: "56px", height: "56px", background: "linear-gradient(135deg,#1D9E75,#0F6E56)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: "800", color: t1, margin: "0 0 6px" }}>Scanner QR Code</h1>
          <p style={{ fontSize: "13px", color: t2, margin: 0 }}>Confirmez la présence du citoyen</p>
        </div>

        {!institutionId && (
          <div style={{ backgroundColor: card, borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: t2, marginBottom: "8px" }}>ID de votre institution</label>
            <input value={institutionId} onChange={e => setInstitutionId(e.target.value)} placeholder="Collez votre institution_id" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1.5px solid #E5E5EA", fontSize: "14px", outline: "none" }}/>
            <div style={{ fontSize: "11px", color: t2, marginTop: "6px" }}>Visible dans votre dashboard institution  Paramètres</div>
          </div>
        )}

        {done && (
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "32px", textAlign: "center", marginBottom: "16px", border: "2px solid #22c55e" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}></div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: "#22c55e" }}>Présence confirmée !</div>
            <button onClick={() => { setDone(false); setError(""); }} style={{ marginTop: "16px", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", padding: "12px 28px", borderRadius: "12px", border: "none", cursor: "pointer", fontSize: "15px" }}>Scanner suivant</button>
          </div>
        )}

        {error && <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "16px", border: "2px solid #ef4444", textAlign: "center" }}><div style={{ color: "#ef4444", fontWeight: "700", marginBottom: "8px" }}>{error}</div><button onClick={() => { setError(""); }} style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", padding: "10px 24px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Réessayer</button></div>}

        {result && (
          <div style={{ backgroundColor: card, borderRadius: "20px", padding: "24px", marginBottom: "16px", border: "2px solid #22c55e" }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#22c55e", marginBottom: "16px", textAlign: "center" }}> QR CODE VALIDE</div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>{(result.rdv?.citoyen_nom||"C")[0].toUpperCase()}</div>
              <div><div style={{ fontSize: "17px", fontWeight: "800", color: t1 }}>{result.rdv?.citoyen_nom || "Citoyen"}</div><div style={{ fontSize: "13px", color: t2 }}>{result.rdv?.citoyen_phone}</div></div>
            </div>
            <div style={{ backgroundColor: "#F2F2F7", borderRadius: "12px", padding: "12px 14px", marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", color: t2, marginBottom: "4px" }}>Objet du RDV</div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: t1 }}>{result.rdv?.objet || "Rendez-vous général"}</div>
              <div style={{ fontSize: "13px", color: t2, marginTop: "4px" }}>{result.rdv?.date_rdv} {result.rdv?.heure_rdv && `à ${result.rdv.heure_rdv}`}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button onClick={() => confirmer("present")} disabled={confirming} style={{ backgroundColor: "#22c55e", color: "#fff", fontWeight: "800", fontSize: "16px", padding: "16px", borderRadius: "14px", border: "none", cursor: "pointer" }}>{confirming ? "..." : " PRÉSENT"}</button>
              <button onClick={() => confirmer("absent")} disabled={confirming} style={{ backgroundColor: "#ef4444", color: "#fff", fontWeight: "800", fontSize: "16px", padding: "16px", borderRadius: "14px", border: "none", cursor: "pointer" }}>{confirming ? "..." : " ABSENT"}</button>
            </div>
          </div>
        )}

        {!scanning && !result && !done && (
          <button onClick={startScan} disabled={!institutionId} style={{ width: "100%", backgroundColor: institutionId ? "#F5A623" : "#E5E5EA", color: institutionId ? "#080812" : "#AEAEB2", fontWeight: "800", fontSize: "17px", padding: "18px", borderRadius: "16px", border: "none", cursor: institutionId ? "pointer" : "not-allowed" }}>
             Scanner un QR Code
          </button>
        )}

        {scanning && <div id="qr-reader" style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden", marginTop: "16px" }}/>}
      </div>
    </div>
  );
}
