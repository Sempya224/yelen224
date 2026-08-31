import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OFFRE_CAT_LABELS } from "@/lib/offresCategories";
import { estCanalValide } from "@/lib/canalAcquisition";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const REDIRECT_DELAY_MS = 3000;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// JSON.stringify échappe déjà guillemets/backslashes pour un usage en
// littéral JS, mais pas "</script>" — remplacé pour ne pas casser hors du
// tag <script> si l'URL contenait cette séquence.
function toJsStringLiteral(str: string): string {
  return JSON.stringify(str).replace(/</g, "\\u003c");
}

// Page interstitielle "Un instant, direction {partenaire}" — rendue DANS
// le nouvel onglet qui s'ouvre au clic (pas dans l'app Yelen elle-même) :
// sur mobile, l'ouverture d'un nouvel onglet fait basculer le focus
// immédiatement, donc un délai/écran affiché côté app n'est jamais vu par
// l'utilisateur (bug constaté le 26/07/2026). En le déplaçant ici, l'écran
// vécu est garanti être celui que regarde l'utilisateur.
function pageInterstitielle(partenaireNom: string, categorieLabel: string, ctaUrl: string): string {
  const nomSafe = escapeHtml(partenaireNom);
  const catSafe = escapeHtml(categorieLabel);
  const hrefSafe = escapeHtml(ctaUrl);
  const urlJs = toJsStringLiteral(ctaUrl);

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Redirection vers ${nomSafe}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100svh; }
  body {
    display: flex; flex-direction: column;
    background: #F2F2F7; font-family: -apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;
  }
  header {
    position: sticky; top: 0; z-index: 1; background: #F2F2F7;
    border-bottom: 1px solid rgba(0,0,0,0.08); padding-top: env(safe-area-inset-top); flex-shrink: 0;
  }
  .row {
    padding: 12px 16px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
  }
  .txtbtn { justify-self: start; background: none; border: none; color: #6B6B70; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; font-family: inherit; }
  .center { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .center .nom { color: #1C1C1E; font-size: 14px; font-weight: 800; }
  .xbtn {
    justify-self: end; width: 36px; height: 36px; border-radius: 50%;
    background: #EBEBF0; border: 1px solid rgba(0,0,0,0.08);
    display: flex; align-items: center; justify-content: center; color: #1C1C1E; cursor: pointer;
  }
  main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card {
    background: #fff; border-radius: 24px; padding: 40px 28px; max-width: 360px; width: 100%;
    text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.12);
  }
  .badge { display: inline-block; background: rgba(245,166,35,0.12); color: #C8740A; font-size: 10px; font-weight: 800;
    padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.3px; }
  .sun { animation: tourne 1s linear infinite; margin: 18px 0; }
  @keyframes tourne { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  h1 { color: #1C1C1E; font-size: 18px; font-weight: 900; line-height: 1.3; margin: 0 0 14px; }
  .verifie { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 14px; }
  .verifie span:first-child { color: #6B6B70; font-size: 12.5px; font-weight: 600; }
  .verifie strong { color: #1C1C1E; font-size: 12.5px; font-weight: 800; }
  p { color: #6B6B70; font-size: 11.5px; line-height: 1.6; margin: 0 0 18px; }
  a.continuer { display: inline-block; color: #C8740A; font-size: 12.5px; font-weight: 700; text-decoration: none; }
  @media (prefers-color-scheme: dark) {
    body { background: #0A0A0F; }
    header { background: #0A0A0F; border-bottom-color: rgba(255,255,255,0.08); }
    .txtbtn { color: #9A9AA0; }
    .center .nom { color: #F5F5F7; }
    .xbtn { background: #2C2C2E; border-color: rgba(255,255,255,0.08); color: #F5F5F7; }
    .card { background: #17171C; box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
    h1 { color: #F5F5F7; }
    .verifie span:first-child { color: #9A9AA0; }
    .verifie strong { color: #F5F5F7; }
    p { color: #9A9AA0; }
  }
</style>
</head>
<body>
  <header>
    <div class="row">
      <button class="txtbtn" id="btnAnnuler">Annuler</button>
      <div class="center">
        <div class="nom">${nomSafe}</div>
        <span class="badge">${catSafe}</span>
      </div>
      <button class="xbtn" id="btnFermer" aria-label="Fermer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </header>
  <main>
    <div class="card">
      <div class="sun">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2.4" stroke-linecap="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
      </div>
      <h1>Un instant, direction ${nomSafe}</h1>
      <div class="verifie">
        <span>Vérifié par</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
        <strong>Yelen</strong>
      </div>
      <p>Yelen n'est pas responsable du contenu, de la sécurité ni des conditions du site de ${nomSafe}. Vérifiez ses conditions avant de continuer.</p>
      <a class="continuer" href="${hrefSafe}">Continuer maintenant</a>
    </div>
  </main>
  <script>
    var redirectTimer = setTimeout(function(){ location.replace(${urlJs}); }, ${REDIRECT_DELAY_MS});
    function annuler(){ clearTimeout(redirectTimer); window.close(); }
    document.getElementById('btnAnnuler').onclick = annuler;
    document.getElementById('btnFermer').onclick = annuler;
  </script>
</body>
</html>`;
}

// Route de suivi de clic — le CTA d'une offre pointe ici (jamais directement
// vers cta_url), pour permettre au partenaire de voir ses performances
// (MesOffresTab.tsx, nb_clics). Incrémente puis affiche l'interstitiel de
// marque avant de rediriger vers l'offre externe réelle.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Canal propagé depuis app/offres/[id]/page.tsx (query param), pas
  // re-détecté ici : le Referer de cette requête serait toujours l'offre
  // elle-même (lien same-origin), sans intérêt pour l'acquisition réelle.
  const canalParam = req.nextUrl.searchParams.get("canal");
  const canal = estCanalValide(canalParam) ? canalParam : "autres";

  const { data: offre } = await sb
    .from("offres")
    .select("cta_url, statut, nb_clics, partenaire_nom, categorie")
    .eq("id", id)
    .maybeSingle();

  if (!offre?.cta_url || offre.statut !== "publiee") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  await sb.from("offres").update({ nb_clics: (offre.nb_clics ?? 0) + 1 }).eq("id", id);
  // offre_clics permet en plus un vrai graphique de performance par jour
  // (MesOffresPerformanceChart.tsx) — citoyen_id toujours null ici (route
  // ouverte dans un nouvel onglet, aucune session transmise). Erreur
  // avalée volontairement (ex. migration pas encore appliquée) : ne doit
  // jamais empêcher la redirection réelle vers le partenaire.
  await sb.from("offre_clics").insert({ offre_id: id, citoyen_id: null, canal }).then(() => {}, () => {});

  const categorieLabel = OFFRE_CAT_LABELS[offre.categorie] || offre.categorie;
  const html = pageInterstitielle(offre.partenaire_nom, categorieLabel, offre.cta_url);

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
