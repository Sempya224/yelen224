"use client";

import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";

const SECTIONS = [
  {
    id: "editeur",
    numero: "1",
    titre: "Éditeur de la plateforme",
    icon: "🏢",
    contenu: [
      { label: "Nom de la plateforme", value: "Yelen224" },
      { label: "Société éditrice", value: "Sempya224" },
      { label: "Forme juridique", value: "Plateforme officielle de rendez-vous — République de Guinée" },
      { label: "Directeur de la publication", value: "Aboubakar Balder" },
      { label: "Email", value: "contact@yelen224.com" },
      { label: "Téléphone New York", value: "+1 347 301 6768" },
      { label: "Téléphone Conakry", value: "+224 624 35 46 00" },
    ],
  },
  {
    id: "siege",
    numero: "2",
    titre: "Sièges et représentations",
    icon: "📍",
    contenu: [
      { label: "Siège social (Amérique du Nord)", value: "1895 Morris Avenue, 5ème étage\nBronx, New York 10345\nÉtats-Unis d'Amérique" },
      { label: "Représentation Afrique / Guinée", value: "Cimenterie, Commune de Ratoma\n3ème étage\nConakry, République de Guinée" },
    ],
  },
  {
    id: "hebergement",
    numero: "3",
    titre: "Hébergement",
    icon: "☁️",
    contenu: [
      { label: "Hébergeur principal", value: "Supabase Inc." },
      { label: "Adresse", value: "970 Toa Payoh North, #07-04\nSingapore 318992" },
      { label: "Site web", value: "https://supabase.com" },
      { label: "Certifications", value: "ISO 27001 — SOC 2 Type II" },
      { label: "Hébergeur secondaire (déploiement)", value: "Vercel Inc." },
      { label: "Adresse Vercel", value: "340 Pine Street, Suite 900\nSan Francisco, CA 94104, États-Unis" },
    ],
  },
  {
    id: "propriete",
    numero: "4",
    titre: "Propriété intellectuelle",
    icon: "©️",
    texte: `L'ensemble des éléments constituant la plateforme Yelen224 — notamment le nom commercial "Yelen224", le nom "Sempya224", les logos, la charte graphique, les textes, les images, les fonctionnalités, le code source, les bases de données, l'architecture technique et tout autre contenu — sont la propriété exclusive de Sempya224.

Ces éléments sont protégés par les lois applicables en matière de propriété intellectuelle en République de Guinée et aux États-Unis d'Amérique.

Toute reproduction, représentation, modification, publication, adaptation ou exploitation de tout ou partie de ces éléments, par quelque moyen ou procédé que ce soit, sans l'autorisation préalable et écrite de Sempya224, est strictement interdite et constitue une violation des droits de propriété intellectuelle susceptible d'entraîner des poursuites civiles et/ou pénales.

Les marques "Yelen224" et "Sempya224", ainsi que les logos associés, sont des marques de Sempya224. Leur utilisation sans autorisation préalable écrite est formellement interdite.`,
  },
  {
    id: "donnees",
    numero: "5",
    titre: "Protection des données personnelles",
    icon: "🔐",
    texte: `Yelen224 accorde une importance capitale à la protection des données personnelles de ses utilisateurs. Le traitement des données personnelles collectées via la plateforme est effectué conformément à la réglementation applicable en matière de protection des données personnelles en République de Guinée et aux États-Unis.

Responsable du traitement : Sempya224
Contact : contact@yelen224.com

Conformément aux droits qui vous sont reconnus, vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition concernant vos données personnelles.

Pour exercer ces droits ou pour toute question relative à la protection de vos données, veuillez consulter notre Politique de Confidentialité complète ou nous contacter directement.`,
    lien: { label: "Consulter notre Politique de Confidentialité", href: "/confidentialite" },
  },
  {
    id: "cookies",
    numero: "6",
    titre: "Cookies",
    icon: "🍪",
    texte: `La plateforme Yelen224 utilise des cookies et technologies similaires nécessaires à son bon fonctionnement. Ces cookies permettent notamment de maintenir votre session de connexion active, de mémoriser vos préférences (mode dark/light) et d'assurer la sécurité de votre navigation.

Certains cookies analytiques peuvent également être utilisés, avec votre consentement, pour améliorer les performances et l'expérience utilisateur de la plateforme.

Vous pouvez à tout moment gérer vos préférences en matière de cookies depuis les paramètres de votre navigateur. La désactivation des cookies strictement nécessaires peut affecter le bon fonctionnement de la plateforme.`,
  },
  {
    id: "responsabilite",
    numero: "7",
    titre: "Limitation de responsabilité",
    icon: "⚖️",
    texte: `Yelen224 s'efforce de fournir des informations exactes et à jour sur sa plateforme. Toutefois, Sempya224 ne peut garantir l'exactitude, la complétude ou l'actualité de l'ensemble des informations publiées, notamment celles fournies par les institutions et prestataires inscrits, qui sont seuls responsables du contenu de leurs profils.

Yelen224 ne saurait être tenue responsable :
• Des dommages directs ou indirects résultant de l'utilisation ou de l'impossibilité d'utiliser la plateforme
• Du contenu publié par les institutions et prestataires inscrits
• Du non-respect de leurs engagements par les institutions ou prestataires
• Des interruptions de service dues à des opérations de maintenance ou à des événements indépendants de notre volonté
• De l'utilisation frauduleuse ou abusive de la plateforme par des tiers

Yelen224 agit exclusivement en qualité d'intermédiaire technique entre les citoyens et les institutions/prestataires et ne saurait se substituer à ces derniers dans l'exécution de leurs obligations.`,
  },
  {
    id: "liens",
    numero: "8",
    titre: "Liens hypertextes",
    icon: "🔗",
    texte: `La plateforme Yelen224 peut contenir des liens hypertextes vers des sites web tiers. Ces liens sont fournis à titre informatif uniquement. Sempya224 n'exerce aucun contrôle sur ces sites et décline toute responsabilité quant à leur contenu, leur disponibilité ou leurs pratiques en matière de confidentialité.

La création de liens hypertextes vers la plateforme Yelen224 est autorisée sans accord préalable, sous réserve que :
• Le lien ne soit pas utilisé dans un contexte trompeur ou frauduleux
• Le lien ne soit pas associé à des contenus illicites ou contraires aux bonnes mœurs
• La plateforme Yelen224 ne soit pas présentée de manière erronée

Sempya224 se réserve le droit de demander la suppression de tout lien qu'elle jugerait contraire à ses intérêts ou à son image.`,
  },
  {
    id: "droit",
    numero: "9",
    titre: "Droit applicable et juridiction",
    icon: "🏛️",
    texte: `Les présentes mentions légales sont régies par le droit de la République de Guinée, complété en tant que de besoin par le droit de l'État de New York, États-Unis d'Amérique.

En cas de litige relatif à l'utilisation de la plateforme Yelen224 ou à l'interprétation des présentes mentions légales, et à défaut de résolution amiable, les tribunaux compétents de Conakry (République de Guinée) ou de New York (États-Unis) seront saisis selon la résidence de l'utilisateur concerné.

Sempya224 encourage en priorité la résolution amiable de tout différend. Pour ce faire, les utilisateurs sont invités à contacter notre équipe en premier lieu à l'adresse contact@yelen224.com.`,
  },
  {
    id: "contact",
    numero: "10",
    titre: "Contact",
    icon: "✉️",
    contenu: [
      { label: "Email général", value: "contact@yelen224.com" },
      { label: "Support technique", value: "contact@yelen224.com" },
      { label: "Demandes légales et RGPD", value: "contact@yelen224.com" },
      { label: "Téléphone New York", value: "+1 347 301 6768" },
      { label: "Téléphone Conakry", value: "+224 624 35 46 00" },
      { label: "Horaires", value: "Lun–Ven · 8h–18h (GMT)" },
    ],
    lien: { label: "Accéder au formulaire de contact", href: "/contact" },
  },
];

export default function MentionsLegalesPage() {
  const { theme } = useTheme();
  const C = T[theme];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.pageBg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", transition: "background-color 0.3s ease, color 0.3s ease" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* HEADER */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        backgroundColor: theme === "dark" ? "rgba(8,8,18,0.96)" : "rgba(248,248,251,0.96)",
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${C.borderCard}`,
        padding: "0 40px",
      }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
            <Link href="/" style={{ color: C.textSubtle, fontSize: "13px", textDecoration: "none" }}>← Accueil</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* HERO */}
      <section style={{
        padding: "56px 40px 40px",
        background: theme === "dark" ? "linear-gradient(160deg, #080812 0%, #0d0d1f 60%, #080812 100%)" : "linear-gradient(160deg, #f8f8fb 0%, #f0f0fa 60%, #f8f8fb 100%)",
        borderBottom: `1px solid ${C.borderSubtle}`,
      }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "20px", padding: "5px 14px", marginBottom: "16px" }}>
            <span style={{ fontSize: "12px" }}>⚖️</span>
            <span style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700", letterSpacing: "1.5px" }}>DOCUMENT OFFICIEL — YELEN224</span>
          </div>
          <h1 style={{ color: C.text, fontSize: "clamp(26px, 4vw, 40px)", fontWeight: "900", letterSpacing: "-1px", margin: "0 0 12px", lineHeight: 1.1 }}>
            Mentions Légales
          </h1>
          <p style={{ color: C.textSubtle, fontSize: "14px", margin: "0 0 20px" }}>
            Conformément aux obligations légales applicables — Dernière mise à jour : Mars 2025
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", color: "#F5A623", fontSize: "11px", fontWeight: "700", padding: "4px 12px", borderRadius: "20px" }}>
              🇬🇳 République de Guinée
            </span>
            <span style={{ backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", color: "#F5A623", fontSize: "11px", fontWeight: "700", padding: "4px 12px", borderRadius: "20px" }}>
              🇺🇸 États-Unis — New York
            </span>
            <span style={{ backgroundColor: C.borderSubtle, border: `1px solid ${C.borderCard}`, color: C.textSubtle, fontSize: "11px", fontWeight: "600", padding: "4px 12px", borderRadius: "20px" }}>
              {SECTIONS.length} sections
            </span>
          </div>
        </div>
      </section>

      {/* CORPS */}
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 40px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {SECTIONS.map((section) => (
            <div
              key={section.id}
              id={section.id}
              style={{
                backgroundColor: C.cardBg,
                border: `1px solid ${C.borderCard}`,
                borderRadius: "16px",
                overflow: "hidden",
              }}
            >
              {/* En-tête section */}
              <div style={{
                padding: "20px 28px",
                borderBottom: `1px solid ${C.borderSubtle}`,
                display: "flex", alignItems: "center", gap: "14px",
                backgroundColor: theme === "dark" ? "rgba(245,166,35,0.03)" : "rgba(245,166,35,0.02)",
              }}>
                <div style={{
                  width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
                  backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "20px",
                }}>{section.icon}</div>
                <div>
                  <p style={{ color: "#F5A623", fontSize: "10px", fontWeight: "700", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 2px" }}>
                    Article {section.numero}
                  </p>
                  <h2 style={{ color: C.text, fontSize: "17px", fontWeight: "900", margin: 0, letterSpacing: "-0.3px" }}>
                    {section.titre}
                  </h2>
                </div>
              </div>

              {/* Contenu section */}
              <div style={{ padding: "24px 28px" }}>

                {/* Tableau de données */}
                {"contenu" in section && section.contenu && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {section.contenu.map((item, i) => (
                      <div
                        key={i}
                        style={{
                          display: "grid", gridTemplateColumns: "200px 1fr", gap: "16px",
                          padding: "12px 16px", borderRadius: "10px",
                          backgroundColor: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                          border: `1px solid ${C.borderSubtle}`,
                        }}
                      >
                        <span style={{ color: C.textSubtle, fontSize: "13px", fontWeight: "600" }}>{item.label}</span>
                        <span style={{ color: C.text, fontSize: "13px", fontWeight: "500", whiteSpace: "pre-line" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Texte libre */}
                {"texte" in section && section.texte && (
                  <p style={{ color: C.textMuted, fontSize: "14px", lineHeight: 1.9, margin: 0, whiteSpace: "pre-line" }}>
                    {section.texte}
                  </p>
                )}

                {/* Lien CTA */}
                {"lien" in section && section.lien && (
                  <div style={{ marginTop: "16px" }}>
                    <Link
                      href={section.lien.href}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "8px",
                        backgroundColor: "rgba(245,166,35,0.08)",
                        border: "1px solid rgba(245,166,35,0.25)",
                        color: "#F5A623", fontSize: "13px", fontWeight: "700",
                        padding: "10px 18px", borderRadius: "9px", textDecoration: "none",
                      }}
                    >
                      {section.lien.label} →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bloc liens légaux */}
        <div style={{
          marginTop: "32px", padding: "24px 28px",
          borderRadius: "16px",
          backgroundColor: C.cardBg,
          border: `1px solid ${C.borderCard}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px",
        }}>
          <div>
            <p style={{ color: C.text, fontSize: "14px", fontWeight: "700", margin: "0 0 6px" }}>Documents légaux associés</p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link href="/cgu" style={{ color: "#F5A623", fontSize: "13px", fontWeight: "600", textDecoration: "none", display: "flex", alignItems: "center", gap: "5px" }}>
                📋 CGU →
              </Link>
              <Link href="/confidentialite" style={{ color: "#F5A623", fontSize: "13px", fontWeight: "600", textDecoration: "none", display: "flex", alignItems: "center", gap: "5px" }}>
                🔐 Confidentialité →
              </Link>
              <Link href="/contact" style={{ color: "#F5A623", fontSize: "13px", fontWeight: "600", textDecoration: "none", display: "flex", alignItems: "center", gap: "5px" }}>
                ✉️ Contact →
              </Link>
            </div>
          </div>
          <p style={{ color: C.textFaint, fontSize: "12px", margin: 0 }}>Version 1.0 — Mars 2025</p>
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ backgroundColor: C.footerBg, borderTop: `1px solid ${C.border}`, padding: "28px 40px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <p style={{ color: C.textFaint, fontSize: "12px", margin: 0 }}>© {new Date().getFullYear()} YELEN224 — Sempya224. Tous droits réservés.</p>
          <div style={{ display: "flex", gap: "20px" }}>
            <Link href="/cgu" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>CGU</Link>
            <Link href="/confidentialite" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>Confidentialité</Link>
            <Link href="/contact" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>Contact</Link>
            <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ color: "#F5A623", fontSize: "12px", textDecoration: "none", fontWeight: "700" }}>Sempya224</a>
          </div>
        </div>
      </footer>
    </div>
  );
}