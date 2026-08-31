"use client";

// Onglet Mon code QR — remplace l'ancienne route séparée app/institution/codeqr
// (qui listait TOUTES les institutions, un outil de navigation multi-institutions
// hors sujet dans un dashboard scopé à une seule institution). Génération du QR
// déléguée à lib/qrBrand.ts::generateBrandedQR — source unique partagée avec le
// QR citoyen (components/YelenIdQrModal.tsx), retour Bryan 29/08/2026 : les
// deux doivent rendre exactement le même badge, jamais deux logiques
// divergentes pour la même marque.
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { APP_URL } from "@/lib/config";
import { construireLienPartageInstitution } from "@/lib/institutionSlug";
import { generateBrandedQR } from "@/lib/qrBrand";

// ?source=qr — repéré par la fiche institution pour mesurer les réservations
// qui découlent réellement d'un scan (retour Bryan 25/07/2026), sans changer
// la destination : le QR continue de mener à la fiche, pas directement à la
// réservation, "important de voir les infos avant réservation".
function institutionQrUrl(instSlug: string, instId: string): string {
  return `${APP_URL}/institution/${construireLienPartageInstitution(instSlug, instId)}?source=qr`;
}

export function CodeQrTab({ instId, instName, instSlug }: { instId: string; instName: string; instSlug: string }) {
  const { theme } = useTheme();
  const C = T[theme];
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  // Preuve de valeur du QR (retour Bryan 25/07/2026) — null tant que non
  // chargé, pour ne jamais afficher "0" par défaut avant d'avoir la vraie
  // réponse (zéro donnée inventée le temps du chargement).
  const [qrCount, setQrCount] = useState<number | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    const url = await generateBrandedQR(institutionQrUrl(instSlug, instId), 600);
    setQr(url);
    setLoading(false);
  }, [instSlug, instId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/institution/qr-provenance");
        if (res.ok) { const j = await res.json(); setQrCount(typeof j.count === "number" ? j.count : 0); }
      } catch {}
    })();
  }, [instId]);

  useEffect(() => { generate(); }, [generate]);

  function downloadPNG() {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `QR-Yelen-${instName.replace(/\s+/g, "-")}.png`;
    a.click();
  }

  function copyURL() {
    navigator.clipboard.writeText(institutionQrUrl(instSlug, instId));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Mon code QR</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px", lineHeight: 1.5 }}>
          Les citoyens scannent ce code pour accéder directement à votre profil Yelen224. Affichez-le à l&apos;accueil ou imprimez-le.
        </p>

        {/* Preuve de valeur — combien de réservations viennent réellement de
            ce QR/lien, pas juste "combien de fois affiché" (retour Bryan
            25/07/2026). Masqué tant que le chargement n'a pas répondu. */}
        {qrCount !== null && (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: `${C.gold}15`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize: "20px", fontWeight: "900", color: C.t1, lineHeight: 1.1 }}>{qrCount}</div>
              <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.4, marginTop: "2px" }}>{qrCount <= 1 ? "réservation" : "réservations"} obtenue{qrCount <= 1 ? "" : "s"} grâce à ce QR / ce lien</div>
            </div>
          </div>
        )}

        <div id="print-area-codeqr" style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "22px", padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "16px", boxShadow: C.shadow }}>
          <div style={{ color: C.t1, fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "14px" }}>YELEN224 · Identité vérifiée</div>
          <div style={{ width: "min(260px, 100%)", aspectRatio: "1/1", borderRadius: "16px", overflow: "hidden", border: `3px solid ${C.gold}`, background: "#fff", marginBottom: "18px", boxShadow: `0 4px 20px ${C.gold}25` }}>
            {qr ? (
              // IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode.toDataURL), non fetchable par l'optimiseur next/image | reviewed=2026-08-08
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code institution" style={{ width: "100%", height: "100%", display: "block" }}/>
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <YelenLoader size={28}/>
              </div>
            )}
          </div>

          <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", textAlign: "center" }}>{instName}</div>
          <div style={{ color: C.t3, fontSize: "12px", marginTop: "4px", textAlign: "center", wordBreak: "break-all" }}>
            {APP_URL.replace(/^https?:\/\//, "")}/institution/{instSlug}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => window.print()} disabled={loading} className="tap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "13px", background: "#F5A623", color: "#080812", border: "none", borderRadius: "12px", fontSize: "13px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimer
          </button>
          <button onClick={downloadPNG} disabled={loading} className="tap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "13px", background: `${C.gold}12`, color: C.gold, border: `1px solid ${C.gold}30`, borderRadius: "12px", fontSize: "13px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PNG HD
          </button>
          <button onClick={copyURL} className="tap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "13px", background: C.bg3, color: C.t2, border: `1px solid ${C.border2}`, borderRadius: "12px", fontSize: "13px", fontWeight: "800", cursor: "pointer" }}>
            {copied ? (
              <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Copié !</>
            ) : (
              <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copier l&apos;URL</>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(#print-area-codeqr) { display: none !important; }
          #print-area-codeqr { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; border: none !important; background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
