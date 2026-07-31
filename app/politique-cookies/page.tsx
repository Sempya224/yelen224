"use client";

import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";

const COOKIES_DATA = [
  {
    categorie: "Strictement nécessaires",
    couleur: "#22c55e",
    icon: "🔒",
    obligatoire: true,
    description: "Ces cookies sont indispensables au fonctionnement de la plateforme. Sans eux, certains services essentiels ne peuvent pas être fournis. Ils ne peuvent pas être désactivés.",
    cookies: [
      { nom: "yelen_session", finalite: "Maintien de votre session de connexion active et sécurisée", duree: "Session (fermeture navigateur)", tiers: "Non" },
      { nom: "yelen_csrf", finalite: "Protection contre les attaques de type Cross-Site Request Forgery", duree: "Session", tiers: "Non" },
      { nom: "yelen_theme", finalite: "Mémorisation de votre préférence d'affichage dark/light mode", duree: "12 mois", tiers: "Non" },
      { nom: "yelen_lang", finalite: "Mémorisation de votre préférence de langue d'affichage", duree: "12 mois", tiers: "Non" },
      { nom: "yelen_auth_token", finalite: "Authentification sécurisée et maintien de l'accès à votre compte", duree: "30 jours", tiers: "Non" },
    ],
  },
  {
    categorie: "Performance et analytiques",
    couleur: "#F5A623",
    icon: "📊",
    obligatoire: false,
    description: "Ces cookies nous permettent de mesurer le trafic et d'analyser l'utilisation de la plateforme afin d'en améliorer les performances et l'expérience utilisateur. Toutes les données sont anonymisées.",
    cookies: [
      { nom: "yelen_analytics", finalite: "Mesure du nombre de visiteurs, pages vues et parcours de navigation", duree: "6 mois", tiers: "Non" },
      { nom: "yelen_perf", finalite: "Analyse des temps de chargement et performances techniques des pages", duree: "3 mois", tiers: "Non" },
      { nom: "yelen_errors", finalite: "Détection et enregistrement des erreurs techniques pour correction", duree: "1 mois", tiers: "Non" },
      { nom: "yelen_funnel", finalite: "Analyse des parcours de prise de rendez-vous pour optimisation", duree: "6 mois", tiers: "Non" },
    ],
  },
  {
    categorie: "Fonctionnels",
    couleur: "#a855f7",
    icon: "⚙️",
    obligatoire: false,
    description: "Ces cookies permettent d'enrichir votre expérience sur la plateforme en mémorisant vos préférences personnalisées et en activant des fonctionnalités avancées.",
    cookies: [
      { nom: "yelen_prefs", finalite: "Mémorisation de vos filtres de recherche et préférences d'affichage", duree: "6 mois", tiers: "Non" },
      { nom: "yelen_region", finalite: "Mémorisation de votre région ou préfecture de référence pour la recherche", duree: "12 mois", tiers: "Non" },
      { nom: "yelen_recents", finalite: "Historique local de vos recherches récentes d'institutions", duree: "3 mois", tiers: "Non" },
      { nom: "yelen_notif_prefs", finalite: "Mémorisation de vos préférences de notifications", duree: "12 mois", tiers: "Non" },
    ],
  },
  {
    categorie: "Sécurité et anti-fraude",
    couleur: "#ef4444",
    icon: "🛡️",
    obligatoire: true,
    description: "Ces cookies sont utilisés pour détecter et prévenir les activités frauduleuses, les tentatives d'intrusion et protéger l'intégrité de la plateforme et de ses utilisateurs.",
    cookies: [
      { nom: "cf_clearance", finalite: "Vérification Cloudflare — protection contre les bots et attaques DDoS", duree: "Session", tiers: "Cloudflare Inc." },
      { nom: "yelen_rate_limit", finalite: "Limitation du nombre de requêtes pour prévenir les abus", duree: "1 heure", tiers: "Non" },
      { nom: "yelen_device_id", finalite: "Identification de l'appareil pour la détection d'activités suspectes", duree: "30 jours", tiers: "Non" },
    ],
  },
];

const SECTIONS = [
  {
    id: "intro",
    numero: "1",
    titre: "Qu'est-ce qu'un cookie ?",
    contenu: `Un cookie est un petit fichier texte déposé sur votre appareil (ordinateur, smartphone, tablette) lorsque vous accédez à la plateforme Yelen224. Ces fichiers permettent à la plateforme de mémoriser des informations relatives à votre navigation et de vous offrir une expérience personnalisée et sécurisée.

Les cookies ne contiennent aucune information permettant de vous identifier directement. Ils sont associés à votre navigateur et à votre appareil, et non à votre identité personnelle.

Les cookies peuvent être déposés par Yelen224 directement (cookies "propriétaires") ou par des partenaires techniques (cookies "tiers") dans le cadre du fonctionnement de la plateforme.

Durée de vie des cookies :
• Cookies de session : supprimés automatiquement à la fermeture de votre navigateur
• Cookies persistants : conservés pendant une durée définie, même après fermeture du navigateur
• Cookies tiers : soumis aux politiques de confidentialité des entités tierces concernées

Technologies similaires aux cookies utilisées par Yelen224 :
• LocalStorage : stockage local de données dans votre navigateur (préférences de thème)
• SessionStorage : stockage temporaire de données de session
• Pixels invisibles : utilisés pour mesurer l'efficacité de certaines communications`,
  },
  {
    id: "utilisation",
    numero: "2",
    titre: "Pourquoi Yelen224 utilise des cookies ?",
    contenu: `Yelen224 utilise des cookies et technologies similaires pour les finalités suivantes :

2.1 Assurer le fonctionnement technique de la plateforme
Sans certains cookies, la plateforme Yelen224 ne peut tout simplement pas fonctionner correctement. Ces cookies maintiennent votre session active, protègent votre compte contre les accès non autorisés et permettent la navigation sécurisée entre les pages.

2.2 Mémoriser vos préférences
Yelen224 utilise des cookies pour se souvenir de vos choix : votre thème d'affichage (dark ou light mode), votre région de référence, vos filtres de recherche préférés. Sans ces cookies, vous devriez reconfigurer vos préférences à chaque visite.

2.3 Analyser et améliorer la plateforme
Les cookies analytiques nous permettent de comprendre comment les utilisateurs interagissent avec la plateforme : quelles pages sont les plus visitées, quels parcours de prise de rendez-vous sont les plus fluides, où des difficultés techniques apparaissent. Ces analyses, réalisées sur des données anonymisées, nous permettent d'améliorer continuellement la qualité de service.

2.4 Garantir la sécurité
Des cookies spécifiques sont dédiés à la sécurité de la plateforme : détection des robots malveillants, prévention des attaques informatiques, limitation des abus. Ces cookies sont essentiels à la protection de vos données et de votre compte.

2.5 Ce que nous ne faisons PAS avec les cookies
• Nous n'utilisons pas de cookies à des fins publicitaires ou de ciblage marketing
• Nous ne revendons pas les données collectées via les cookies à des tiers commerciaux
• Nous ne pratiquons pas le tracking cross-site (suivi de votre navigation sur d'autres sites)
• Yelen224 est une plateforme sans publicité — aucun cookie publicitaire n'est déposé`,
  },
  {
    id: "tableau",
    numero: "3",
    titre: "Détail de tous les cookies utilisés",
    contenu: `Le tableau détaillé de l'ensemble des cookies utilisés par Yelen224 est présenté ci-dessous, organisé par catégorie. Pour chaque cookie sont indiqués : son nom technique, sa finalité précise, sa durée de conservation et s'il provient d'un tiers.`,
    isTableau: true,
  },
  {
    id: "consentement",
    numero: "4",
    titre: "Votre consentement et vos choix",
    contenu: `4.1 Cookies soumis à consentement

Conformément aux réglementations applicables en matière de protection des données personnelles, seuls les cookies strictement nécessaires au fonctionnement de la plateforme et à la sécurité sont déposés sans votre consentement préalable.

Les cookies des catégories suivantes nécessitent votre consentement explicite avant dépôt :
• Cookies de performance et analytiques
• Cookies fonctionnels (préférences avancées)

4.2 Comment donner ou retirer votre consentement

À votre première visite sur la plateforme, un bandeau de consentement vous permet d'accepter ou de refuser les différentes catégories de cookies non essentiels. Vous pouvez à tout moment modifier vos choix via :

• Le panneau de gestion des cookies accessible dans les paramètres de votre compte
• Les paramètres de votre navigateur web (voir section 5)
• En nous contactant directement à contact@yelen224.com

4.3 Impact du refus des cookies non essentiels

Si vous choisissez de refuser les cookies de performance ou fonctionnels, la plateforme Yelen224 continuera de fonctionner normalement pour la prise de rendez-vous. Toutefois :
• Certaines préférences (région, filtres de recherche) ne seront pas mémorisées entre vos visites
• Notre capacité à améliorer la plateforme sera réduite
• Certaines fonctionnalités avancées pourraient être limitées

4.4 Preuve du consentement

Yelen224 conserve une preuve horodatée de votre consentement ou refus pour une durée de 13 mois conformément aux recommandations applicables. Cette preuve est utilisée exclusivement à des fins de conformité légale.`,
  },
  {
    id: "gestion",
    numero: "5",
    titre: "Gestion des cookies via votre navigateur",
    contenu: `Vous pouvez à tout moment gérer, désactiver ou supprimer les cookies déposés sur votre appareil directement via les paramètres de votre navigateur. Voici la procédure pour les navigateurs les plus courants :

Google Chrome :
1. Cliquez sur les trois points en haut à droite → Paramètres
2. Confidentialité et sécurité → Cookies et autres données de sites
3. Gérez vos préférences ou supprimez les cookies existants

Mozilla Firefox :
1. Menu → Paramètres → Vie privée et sécurité
2. Section Cookies et données de sites
3. Gérez les exceptions ou supprimez les données

Apple Safari (Mac et iOS) :
1. Préférences (Mac) ou Réglages (iOS) → Safari
2. Confidentialité → Gérer les données de sites web
3. Supprimez les données ou ajustez les autorisations

Microsoft Edge :
1. Menu (...) → Paramètres → Cookies et autorisations de site
2. Gérez vos préférences de cookies
3. Affichez et supprimez les cookies existants

⚠️ Attention : La suppression ou le blocage de l'ensemble des cookies, y compris les cookies strictement nécessaires, empêchera votre connexion à la plateforme Yelen224 et désactivera certaines fonctionnalités essentielles.

Outils de gestion des cookies tiers :
Des extensions de navigateur comme uBlock Origin, Privacy Badger ou Ghostery vous permettent également de gérer finement les cookies déposés sur votre appareil lors de votre navigation.`,
  },
  {
    id: "tiers",
    numero: "6",
    titre: "Cookies tiers et partenaires",
    contenu: `6.1 Cloudflare (sécurité et protection)

Yelen224 utilise les services de Cloudflare Inc. pour protéger la plateforme contre les attaques informatiques (DDoS, bots malveillants). Dans ce cadre, Cloudflare peut déposer des cookies sur votre appareil pour vérifier que vous êtes un utilisateur humain légitime.

Société : Cloudflare Inc.
Siège : 101 Townsend St, San Francisco, CA 94107, États-Unis
Politique de confidentialité : https://www.cloudflare.com/privacypolicy/
Cookie concerné : cf_clearance (durée : session)

6.2 Supabase (infrastructure technique)

Supabase fournit l'infrastructure de base de données et d'authentification de la plateforme. Des identifiants de session sécurisés sont gérés via Supabase pour maintenir votre connexion active.

Société : Supabase Inc.
Politique de confidentialité : https://supabase.com/privacy
Certifications : ISO 27001, SOC 2 Type II

6.3 Engagement de Yelen224 concernant les cookies tiers

• Yelen224 sélectionne ses partenaires tiers avec soin, en privilégiant les sociétés disposant de standards élevés en matière de protection des données
• Aucun cookie publicitaire ou de tracking marketing tiers n'est utilisé sur la plateforme
• Yelen224 ne partage pas vos données personnelles avec des réseaux publicitaires tiers
• La liste des cookies tiers est maintenue à jour et disponible dans la présente politique`,
  },
  {
    id: "conservation",
    numero: "7",
    titre: "Durées de conservation",
    contenu: `Les durées de conservation des cookies varient selon leur nature et leur finalité :

Cookies de session (durée : fermeture du navigateur) :
• Cookies d'authentification temporaire
• Cookies de protection CSRF
• Cookies de vérification Cloudflare

Cookies à courte durée (1 heure à 1 mois) :
• Cookies de limitation de débit (rate limiting) : 1 heure
• Cookies de détection d'erreurs techniques : 1 mois
• Cookies de détection de fraude : 1 mois

Cookies à durée moyenne (3 à 6 mois) :
• Cookies analytiques et de performance : 6 mois
• Cookies de recherches récentes : 3 mois
• Cookies de préférences de filtres : 6 mois

Cookies à longue durée (12 mois) :
• Cookie de préférence de thème (dark/light) : 12 mois
• Cookie de préférence de langue : 12 mois
• Cookie de région de référence : 12 mois
• Cookie de préférences de notifications : 12 mois
• Cookie d'authentification persistante : 30 jours

Toutes ces durées sont maximales. Vous pouvez supprimer ces cookies à tout moment via votre navigateur ou le panneau de gestion des cookies de la plateforme. La suppression d'un cookie entraîne sa recréation lors de votre prochaine visite si vous avez donné votre consentement.`,
  },
  {
    id: "droits",
    numero: "8",
    titre: "Vos droits et recours",
    contenu: `8.1 Droits applicables

Conformément aux réglementations en vigueur en matière de protection des données personnelles, vous disposez des droits suivants concernant les données collectées via les cookies :

✅ Droit d'accès — Obtenir la liste complète des cookies déposés sur votre appareil et les données associées
✅ Droit de suppression — Demander la suppression de vos données collectées via les cookies
✅ Droit d'opposition — Vous opposer au dépôt de cookies non essentiels
✅ Droit à la portabilité — Obtenir vos données dans un format structuré

8.2 Comment exercer vos droits

Pour exercer vos droits ou pour toute question relative aux cookies :

✉️ Email : contact@yelen224.com
Objet : [COOKIES] + votre demande précise

📍 Siège New York : 1895 Morris Avenue, 5ème étage, Bronx, NY 10345
📞 +1 347 301 6768

📍 Représentation Conakry : Cimenterie, Commune de Ratoma, 3ème étage
📞 +224 624 35 46 00

Délai de réponse : 30 jours maximum à compter de la réception de votre demande.

8.3 Mises à jour de la présente politique

La présente Politique de Cookies est susceptible d'être mise à jour pour refléter les évolutions de la plateforme, de la réglementation applicable ou de nos pratiques. En cas de modification substantielle, nous vous en informerons via une notification sur la plateforme.

La date de dernière mise à jour est indiquée en bas de la présente page. Nous vous encourageons à la consulter régulièrement.

Date de dernière mise à jour : Mars 2025
Version en vigueur : 1.0`,
  },
];

// ─── Composant tableau cookies ────────────────────────────────────────────────
function TableauCookies({ C, theme }: { C: typeof T.dark; theme: string }) {
  const [activeCategorie, setActiveCategorie] = useState(0);
  const cat = COOKIES_DATA[activeCategorie];

  return (
    <div>
      {/* Tabs catégories */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {COOKIES_DATA.map((c, i) => (
          <button
            key={i}
            onClick={() => setActiveCategorie(i)}
            style={{
              padding: "8px 16px", borderRadius: "20px",
              border: `1px solid ${activeCategorie === i ? c.couleur + "55" : C.borderCard}`,
              backgroundColor: activeCategorie === i ? c.couleur + "15" : C.cardBg,
              color: activeCategorie === i ? c.couleur : C.textSubtle,
              fontSize: "12px", fontWeight: "700", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <span>{c.icon}</span>
            {c.categorie}
            {c.obligatoire && (
              <span style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: "10px", fontWeight: "700", padding: "1px 6px", borderRadius: "10px" }}>
                Requis
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Description catégorie */}
      <div style={{ padding: "14px 18px", borderRadius: "10px", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.borderSubtle}`, marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ fontSize: "18px" }}>{cat.icon}</span>
          <p style={{ color: cat.couleur, fontSize: "13px", fontWeight: "700", margin: 0 }}>{cat.categorie}</p>
          {cat.obligatoire && (
            <span style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px" }}>
              Non désactivable
            </span>
          )}
        </div>
        <p style={{ color: C.textSubtle, fontSize: "13px", margin: 0, lineHeight: 1.65 }}>{cat.description}</p>
      </div>

      {/* Tableau */}
      <div style={{ borderRadius: "12px", border: `1px solid ${C.borderCard}`, overflow: "hidden" }}>
        {/* En-tête */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 2.5fr 1fr 1fr", gap: "0", backgroundColor: theme === "dark" ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", borderBottom: `1px solid ${C.borderCard}` }}>
          {["Nom du cookie", "Finalité", "Durée", "Tiers"].map((h, i) => (
            <div key={i} style={{ padding: "12px 16px", color: "#F5A623", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", borderRight: i < 3 ? `1px solid ${C.borderSubtle}` : "none" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Lignes */}
        {cat.cookies.map((cookie, i) => (
          <div
            key={i}
            style={{
              display: "grid", gridTemplateColumns: "1.5fr 2.5fr 1fr 1fr",
              borderBottom: i < cat.cookies.length - 1 ? `1px solid ${C.borderSubtle}` : "none",
              backgroundColor: i % 2 === 0 ? "transparent" : (theme === "dark" ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.01)"),
            }}
          >
            <div style={{ padding: "14px 16px", borderRight: `1px solid ${C.borderSubtle}` }}>
              <code style={{ color: cat.couleur, fontSize: "12px", fontWeight: "700", fontFamily: "monospace" }}>{cookie.nom}</code>
            </div>
            <div style={{ padding: "14px 16px", borderRight: `1px solid ${C.borderSubtle}` }}>
              <p style={{ color: C.textMuted, fontSize: "13px", margin: 0, lineHeight: 1.5 }}>{cookie.finalite}</p>
            </div>
            <div style={{ padding: "14px 16px", borderRight: `1px solid ${C.borderSubtle}` }}>
              <p style={{ color: C.textSubtle, fontSize: "12px", margin: 0 }}>{cookie.duree}</p>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <span style={{
                fontSize: "11px", fontWeight: "600",
                color: cookie.tiers === "Non" ? "#22c55e" : "#F5A623",
                backgroundColor: cookie.tiers === "Non" ? "rgba(34,197,94,0.08)" : "rgba(245,166,35,0.08)",
                border: `1px solid ${cookie.tiers === "Non" ? "rgba(34,197,94,0.2)" : "rgba(245,166,35,0.2)"}`,
                padding: "3px 8px", borderRadius: "6px",
              }}>
                {cookie.tiers === "Non" ? "✓ 1er partie" : cookie.tiers}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PolitiqueCookiesPage() {
  const { theme } = useTheme();
  const C = T[theme];
  const [activeSection, setActiveSection] = useState("intro");

  const currentSection = SECTIONS.find(s => s.id === activeSection)!;
  const currentIndex = SECTIONS.findIndex(s => s.id === activeSection);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.pageBg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", transition: "background-color 0.3s ease, color 0.3s ease" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        .nav-item:hover { background-color: rgba(245,166,35,0.06) !important; color: #F5A623 !important; }
      `}</style>

      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, backgroundColor: theme === "dark" ? "rgba(8,8,18,0.96)" : "rgba(248,248,251,0.96)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.borderCard}`, paddingTop: "env(safe-area-inset-top)", paddingRight: "40px", paddingBottom: 0, paddingLeft: "40px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <div style={{ position: "relative", width: "34px", height: "34px" }}>
              <div style={{ position: "absolute", inset: 0, backgroundColor: "#F5A623", borderRadius: "9px", transform: "rotate(6deg)", opacity: 0.3 }} />
              <div style={{ position: "relative", width: "34px", height: "34px", backgroundColor: "#F5A623", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3" strokeLinecap="round">
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
                </svg>
              </div>
            </div>
            <div>
              <p style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: 0, letterSpacing: "0.5px", lineHeight: 1 }}>YELEN224</p>
              <p style={{ color: "#F5A623", fontSize: "8px", margin: 0, letterSpacing: "2px", fontWeight: "600" }}>REPUBLIQUE DE GUINEE</p>
            </div>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <Link href="/cgu" style={{ color: C.textSubtle, fontSize: "13px", textDecoration: "none" }}>CGU</Link>
            <Link href="/confidentialite" style={{ color: C.textSubtle, fontSize: "13px", textDecoration: "none" }}>Confidentialité</Link>
            <Link href="/mentions-legales" style={{ color: C.textSubtle, fontSize: "13px", textDecoration: "none" }}>Mentions légales</Link>
            <Link href="/" style={{ color: C.textSubtle, fontSize: "13px", textDecoration: "none" }}>← Accueil</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* HERO */}
      <section style={{ padding: "56px 40px 40px", background: theme === "dark" ? "linear-gradient(160deg, #080812 0%, #0d0d1f 60%, #080812 100%)" : "linear-gradient(160deg, #f8f8fb 0%, #f0f0fa 60%, #f8f8fb 100%)", borderBottom: `1px solid ${C.borderSubtle}`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-80px", right: "-80px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(245,166,35,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "20px", padding: "5px 14px", marginBottom: "16px" }}>
            <span style={{ fontSize: "12px" }}>🍪</span>
            <span style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700", letterSpacing: "1.5px" }}>DOCUMENT OFFICIEL — YELEN224</span>
          </div>
          <h1 style={{ color: C.text, fontSize: "clamp(26px, 4vw, 42px)", fontWeight: "900", letterSpacing: "-1px", margin: "0 0 12px", lineHeight: 1.05 }}>
            Politique de Gestion<br />
            <span style={{ color: "#F5A623" }}>des Cookies</span>
          </h1>
          <p style={{ color: C.textMuted, fontSize: "15px", maxWidth: "580px", margin: "0 0 20px", lineHeight: 1.75 }}>
            Transparence totale sur l'utilisation des cookies sur la plateforme Yelen224 — leur nature, leur finalité, leur durée de vie et vos droits de gestion.
          </p>

          {/* Résumé visuel */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", maxWidth: "700px" }}>
            {COOKIES_DATA.map((cat, i) => (
              <div key={i} style={{ padding: "12px", borderRadius: "10px", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, textAlign: "center" }}>
                <div style={{ fontSize: "20px", marginBottom: "6px" }}>{cat.icon}</div>
                <p style={{ color: cat.couleur, fontSize: "11px", fontWeight: "700", margin: "0 0 2px", lineHeight: 1.3 }}>{cat.categorie}</p>
                <p style={{ color: C.textFaint, fontSize: "10px", margin: 0 }}>{cat.cookies.length} cookies</p>
                {cat.obligatoire && (
                  <span style={{ display: "inline-block", marginTop: "4px", backgroundColor: "rgba(34,197,94,0.08)", color: "#22c55e", fontSize: "9px", fontWeight: "700", padding: "1px 6px", borderRadius: "10px" }}>Requis</span>
                )}
              </div>
            ))}
          </div>

          <p style={{ color: C.textFaint, fontSize: "12px", margin: "16px 0 0" }}>
            Version 1.0 — Dernière mise à jour : Mars 2025 — {SECTIONS.length} articles
          </p>
        </div>
      </section>

      {/* CORPS */}
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 40px 80px", display: "grid", gridTemplateColumns: "240px 1fr", gap: "32px", alignItems: "start" }}>

        {/* Sommaire */}
        <nav style={{ position: "sticky", top: "80px", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px" }}>
          <p style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 12px 8px" }}>Sommaire</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className="nav-item"
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 12px", borderRadius: "8px",
                  border: "none", cursor: "pointer", textAlign: "left",
                  backgroundColor: activeSection === s.id ? "rgba(245,166,35,0.08)" : "transparent",
                  color: activeSection === s.id ? "#F5A623" : C.textSubtle,
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ width: "20px", height: "20px", borderRadius: "6px", flexShrink: 0, backgroundColor: activeSection === s.id ? "rgba(245,166,35,0.15)" : C.borderSubtle, color: activeSection === s.id ? "#F5A623" : C.textFaint, fontSize: "10px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>{s.numero}</span>
                <span style={{ fontSize: "12px", fontWeight: activeSection === s.id ? "700" : "500", lineHeight: 1.3 }}>{s.titre}</span>
              </button>
            ))}
          </div>

          {/* Engagement no-ads */}
          <div style={{ marginTop: "16px", padding: "12px", borderRadius: "10px", backgroundColor: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <p style={{ color: "#22c55e", fontSize: "11px", fontWeight: "700", margin: "0 0 4px" }}>🚫 Zéro publicité</p>
            <p style={{ color: C.textSubtle, fontSize: "11px", margin: 0, lineHeight: 1.5 }}>Aucun cookie publicitaire ou de tracking marketing n'est utilisé sur Yelen224.</p>
          </div>
        </nav>

        {/* Contenu */}
        <div>
          {/* Progression */}
          <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1, height: "4px", borderRadius: "2px", backgroundColor: C.borderSubtle, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "2px", backgroundColor: "#F5A623", width: `${((currentIndex + 1) / SECTIONS.length) * 100}%`, transition: "width 0.3s ease" }} />
            </div>
            <span style={{ color: C.textFaint, fontSize: "11px", fontWeight: "600", flexShrink: 0 }}>Article {currentIndex + 1} / {SECTIONS.length}</span>
          </div>

          <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "16px", padding: "36px", marginBottom: "16px" }}>
            {/* En-tête */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px", paddingBottom: "20px", borderBottom: `1px solid ${C.borderSubtle}` }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0, backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", fontSize: "18px", fontWeight: "900" }}>{currentSection.numero}</div>
              <div>
                <p style={{ color: "#F5A623", fontSize: "10px", fontWeight: "700", letterSpacing: "2px", margin: "0 0 4px" }}>ARTICLE {currentSection.numero}</p>
                <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: 0, letterSpacing: "-0.3px" }}>{currentSection.titre}</h2>
              </div>
            </div>

            {/* Contenu */}
            {"isTableau" in currentSection && currentSection.isTableau ? (
              <>
                <p style={{ color: C.textMuted, fontSize: "14px", lineHeight: 1.85, marginBottom: "24px" }}>
                  {currentSection.contenu}
                </p>
                <TableauCookies C={C as typeof T.dark} theme={theme} />
              </>
            ) : (
              <div style={{ color: C.textMuted, fontSize: "14px", lineHeight: 1.95, whiteSpace: "pre-line" }}>
                {currentSection.contenu}
              </div>
            )}
          </div>

          {/* Navigation prev/next */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "space-between", marginBottom: "16px" }}>
            <button onClick={() => { if (currentIndex > 0) setActiveSection(SECTIONS[currentIndex - 1].id); }} disabled={currentIndex === 0} style={{ padding: "10px 20px", borderRadius: "10px", border: `1px solid ${C.borderCard}`, backgroundColor: "transparent", color: currentIndex === 0 ? C.textFaint : C.text, fontSize: "13px", fontWeight: "600", cursor: currentIndex === 0 ? "default" : "pointer", opacity: currentIndex === 0 ? 0.4 : 1 }}>← Article précédent</button>
            <button onClick={() => { if (currentIndex < SECTIONS.length - 1) setActiveSection(SECTIONS[currentIndex + 1].id); }} disabled={currentIndex === SECTIONS.length - 1} style={{ padding: "10px 20px", borderRadius: "10px", border: "1px solid rgba(245,166,35,0.3)", backgroundColor: "rgba(245,166,35,0.06)", color: currentIndex === SECTIONS.length - 1 ? C.textFaint : "#F5A623", fontSize: "13px", fontWeight: "700", cursor: currentIndex === SECTIONS.length - 1 ? "default" : "pointer", opacity: currentIndex === SECTIONS.length - 1 ? 0.4 : 1 }}>Article suivant →</button>
          </div>

          {/* Bloc contact */}
          <div style={{ padding: "24px 28px", borderRadius: "14px", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 4px" }}>Une question sur nos cookies ?</p>
              <p style={{ color: C.textSubtle, fontSize: "13px", margin: 0 }}>contact@yelen224.com — Réponse sous 30 jours.</p>
            </div>
            <Link href="/contact" style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "13px", padding: "10px 20px", borderRadius: "9px", textDecoration: "none", flexShrink: 0 }}>
              Nous contacter →
            </Link>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ backgroundColor: C.footerBg, borderTop: `1px solid ${C.border}`, padding: "28px 40px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <p style={{ color: C.textFaint, fontSize: "12px", margin: 0 }}>© {new Date().getFullYear()} YELEN224 — Sempya224. Tous droits réservés.</p>
          <div style={{ display: "flex", gap: "20px" }}>
            <Link href="/cgu" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>CGU</Link>
            <Link href="/confidentialite" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>Confidentialité</Link>
            <Link href="/mentions-legales" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>Mentions légales</Link>
            <Link href="/conditions-prestataires" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>Prestataires</Link>
            <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ color: "#F5A623", fontSize: "12px", textDecoration: "none", fontWeight: "700" }}>Sempya224</a>
          </div>
        </div>
      </footer>
    </div>
  );
}