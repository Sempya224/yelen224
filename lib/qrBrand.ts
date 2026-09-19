// QR Code à l'identité visuelle Yelen (logo incrusté au centre) — source
// unique pour tout QR brandé Yelen (institution ET citoyen). Auparavant
// dupliqué en deux versions divergentes : le QR institution
// (app/[slug]/[id]/components/CodeQrTab.tsx) chargeait le vrai fichier
// public/icon-512.png (déjà l'icône PWA), tandis que le QR citoyen
// (components/YelenIdQrModal.tsx) dessinait une approximation SVG à la
// main — deux rendus visuellement incohérents pour la même marque (retour
// Bryan 29/08/2026, "on ne veut pas simplement changer l'icône, on veut
// réutiliser le même composant"). Unifié ici sur le vrai fichier PNG,
// consommé par les deux écrans. 100% généré côté navigateur via la lib
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

/** Génère un QR Code brandé Yelen (logo central) en data URL PNG. Ne touche
 * jamais aux 3 marqueurs de coin du QR (hors de la zone centrale logoBox,
 * réservée par le niveau de correction d'erreur "H"). */
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

  // Vrai logo officiel (public/icon-512.png, déjà l'icône PWA) — jamais une
  // approximation dessinée à la main.
  const badgeImg = await loadImage("/icon-512.png");
  ctx.drawImage(badgeImg, lx, ly, logoBox, logoBox);

  return canvas.toDataURL("image/png");
}
