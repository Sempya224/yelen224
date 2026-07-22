// QR Code à l'identité visuelle Yelen (logo incrusté au centre) — généralisé
// à partir de la génération déjà utilisée pour le QR institution
// (app/institution/[id]/dashboard/components/CodeQrTab.tsx::makeInstitutionQR),
// pour être réutilisable par tout écran ayant besoin d'un QR premium Yelen —
// ici l'écran Yelen ID citoyen. 100% généré côté navigateur via la lib
// "qrcode" (déjà une dépendance du projet) : aucune donnée transmise à un
// service externe, contrairement au QR RDV (app/mon-qr) qui passe par
// api.qrserver.com.
import QRCode from "qrcode";

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

// Même tracé que components/YelenLogo.tsx (cercle r=3 + 8 rayons courts sur
// fond orange arrondi), rendu en SVG puis rasterisé.
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

/** Génère un QR Code brandé Yelen (logo central) en data URL PNG. */
export async function generateBrandedQR(data: string, size: number, darkColor: string = "#080812"): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(data, {
    width: size,
    margin: 1,
    color: { dark: darkColor, light: "#ffffff" },
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
