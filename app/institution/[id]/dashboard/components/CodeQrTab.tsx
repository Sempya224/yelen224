"use client";

// Onglet Mon code QR — remplace l'ancienne route séparée app/institution/codeqr
// (qui listait TOUTES les institutions, un outil de navigation multi-institutions
// hors sujet dans un dashboard scopé à une seule institution). Ici : uniquement
// le QR de l'institution du dashboard (instId), logo Yelen réel (même tracé que
// components/YelenLogo.tsx, pas une approximation dessinée à la main) incrusté
// au centre.
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "../theme";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yelen.app";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// Badge logo Yelen — même tracé que components/YelenLogo.tsx (cercle r=3 +
// 8 rayons courts sur fond orange arrondi), rendu en SVG puis rasterisé.
function yelenLogoBadgeDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24">
    <rect x="0" y="0" width="24" height="24" rx="6" fill="#F5A623"/>
    <g stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// ?source=qr — repéré par la fiche institution pour mesurer les réservations
// qui découlent réellement d'un scan (retour Bryan 25/07/2026), sans changer
// la destination : le QR continue de mener à la fiche, pas directement à la
// réservation, "important de voir les infos avant réservation".
async function makeInstitutionQR(instId: string, size: number): Promise<string> {
  const url = `${APP_URL}/institution/${instId}?source=qr`;
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    color: { dark: "#0e6e45", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, 0, 0, size, size);

  const logoBox = Math.round(size * 0.22);
  const lx = Math.round((size - logoBox) / 2);
  const ly = Math.round((size - logoBox) / 2);

  ctx.fillStyle = "#FFFFFF";
  fillRoundRect(ctx, lx - 4, ly - 4, logoBox + 8, logoBox + 8, 9);

  const badgeImg = await loadImage(yelenLogoBadgeDataUrl());
  ctx.drawImage(badgeImg, lx, ly, logoBox, logoBox);

  return canvas.toDataURL("image/png");
}

export function CodeQrTab({ instId, instName }: { instId: string; instName: string }) {
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
    const url = await makeInstitutionQR(instId, 600);
    setQr(url);
    setLoading(false);
  }, [instId]);

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
    navigator.clipboard.writeText(`${APP_URL}/institution/${instId}?source=qr`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Mon code QR</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px", lineHeight: 1.5 }}>
        Les citoyens scannent ce code pour accéder directement à votre profil Yelen224. Affichez-le à l'accueil ou imprimez-le.
      </p>

      {/* Preuve de valeur — combien de réservations viennent réellement de
          ce QR/lien, pas juste "combien de fois affiché" (retour Bryan
          25/07/2026). Masqué tant que le chargement n'a pas répondu. */}
      {qrCount !== null && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "22px", fontWeight: "900", color: C.t1 }}>{qrCount}</div>
          <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.4 }}>{qrCount <= 1 ? "réservation" : "réservations"} obtenue{qrCount <= 1 ? "" : "s"} grâce à ce QR / ce lien.</div>
        </div>
      )}

      <div id="print-area-codeqr" style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "22px", padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ width: "min(280px, 100%)", aspectRatio: "1/1", borderRadius: "16px", overflow: "hidden", border: `1.5px solid ${C.border2}`, background: "#fff", marginBottom: "16px" }}>
          {qr ? (
            <img src={qr} alt="QR code institution" style={{ width: "100%", height: "100%", display: "block" }}/>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}25`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
            </div>
          )}
        </div>

        <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", textAlign: "center" }}>{instName}</div>
        <div style={{ color: C.t3, fontSize: "11px", marginTop: "4px", textAlign: "center", wordBreak: "break-all" }}>
          {APP_URL.replace(/^https?:\/\//, "")}/institution/{instId.slice(0, 8)}...
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={() => window.print()} disabled={loading} className="tap" style={{ flex: 1, padding: "13px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", border: "none", borderRadius: "12px", fontSize: "13px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer" }}>
          Imprimer
        </button>
        <button onClick={downloadPNG} disabled={loading} className="tap" style={{ flex: 1, padding: "13px", background: `${C.gold}12`, color: C.gold, border: `1px solid ${C.gold}30`, borderRadius: "12px", fontSize: "13px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer" }}>
          PNG HD
        </button>
        <button onClick={copyURL} className="tap" style={{ flex: 1, padding: "13px", background: C.bg3, color: C.t2, border: `1px solid ${C.border2}`, borderRadius: "12px", fontSize: "13px", fontWeight: "800", cursor: "pointer" }}>
          {copied ? "Copié !" : "Copier l'URL"}
        </button>
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
