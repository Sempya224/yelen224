import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  devIndicators: false,
  // 192.168.1.222 = carte Wi-Fi de cette même machine (confirmé via
  // ipconfig le 18/09/2026, pas un appareil tiers) — Next.js bloque par
  // défaut le HMR cross-origin dès que le dev server est atteint via
  // cette IP plutôt que localhost.
  allowedDevOrigins: ["192.168.1.222"],
  // Migration next/image (audit CEO 08/08/2026) — domaines distants réels
  // utilisés par le produit : Storage Supabase (logos/avatars/bannières/
  // annonces/offres/documents), miniatures YouTube, photos stock Pexels
  // (app/education, onboarding dashboard institution). Hostname Supabase en
  // dur (projet confirmé pgcabxgrgjgukuagpuhc) plutôt que dérivé de
  // NEXT_PUBLIC_SUPABASE_URL au runtime — remotePatterns est lu au build.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pgcabxgrgjgukuagpuhc.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
  outputFileTracingRoot: path.join(__dirname),
  // pdfkit lit sa police par défaut (Helvetica) sur disque via
  // fs.readFileSync(__dirname + "/data/Helvetica.afm") au moment de
  // `new PDFDocument()`. Si webpack bundle pdfkit (comportement par
  // défaut), __dirname pointe vers un dossier vendor-chunks généré qui ne
  // contient jamais ce fichier .afm — ENOENT systématique, confirmé le
  // 06/08/2026 (reçu Yelen bloqué à "cree" depuis sa toute première
  // génération, et très probablement le même problème pour l'export PDF
  // du Journal d'activité, jamais testé avec succès). serverExternalPackages
  // fait charger ces deux paquets via require() Node natif depuis
  // node_modules au lieu de les faire passer par le bundler — __dirname
  // redevient le vrai chemin sur disque, readFileSync trouve le fichier.
  serverExternalPackages: ["pdfkit", "fontkit"],
};

// Système i18n (décision CEO 08/08/2026, Phase 1 + POC) — mode "without
// i18n routing" de next-intl : locale résolue via cookie dans
// i18n/request.ts, zéro segment d'URL /fr//en/, zéro dossier
// app/[locale]/. Wrap additif pur, ne touche aucune clé ci-dessus.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);