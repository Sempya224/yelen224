"use client";

import { useState } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

// Auto-hébergée (Lot 1.5, 13/08/2026) — remplace l'@import
// fonts.googleapis.com : mêmes graisses, zéro requête réseau externe au
// runtime, élimine le besoin d'une exception CSP pour cette page.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-inter" });

// ─── Données réelles des ambassades guinéennes ────────────────────────────────

const AMBASSADES = [
  // EUROPE
  { pays: "France",        ville: "Paris",       continent: "Europe",   phone: "+33 1 47 04 81 48", email: "ambassadeguinee.paris@gmail.com",    statut: "actif",    flag: "🇫🇷", services: ["Passeport", "Visa", "Acte d'état civil", "Légalisation", "Carte consulaire"] },
  { pays: "Belgique",      ville: "Bruxelles",   continent: "Europe",   phone: "+32 2 771 01 26",   email: "ambguineebruxelles@gmail.com",       statut: "actif",    flag: "🇧🇪", services: ["Passeport", "Visa", "Acte d'état civil", "Légalisation"] },
  { pays: "Allemagne",     ville: "Berlin",      continent: "Europe",   phone: "+49 30 39 80 69 0", email: "ambassade.guinee.berlin@gmail.com",  statut: "actif",    flag: "🇩🇪", services: ["Passeport", "Visa", "Légalisation"] },
  { pays: "Espagne",       ville: "Madrid",      continent: "Europe",   phone: "+34 91 350 21 24",  email: "ambguineemadrid@gmail.com",          statut: "actif",    flag: "🇪🇸", services: ["Passeport", "Visa", "Acte d'état civil"] },
  { pays: "Italie",        ville: "Rome",        continent: "Europe",   phone: "+39 06 854 03 46",  email: "ambguineerome@gmail.com",            statut: "actif",    flag: "🇮🇹", services: ["Passeport", "Visa", "Légalisation"] },
  { pays: "Royaume-Uni",   ville: "Londres",     continent: "Europe",   phone: "+44 20 8992 9548",  email: "guinean.embassy.london@gmail.com",   statut: "actif",    flag: "🇬🇧", services: ["Passeport", "Visa", "Acte d'état civil", "Légalisation"] },
  { pays: "Russie",        ville: "Moscou",      continent: "Europe",   phone: "+7 495 956 27 29",  email: "ambguineemoscou@gmail.com",          statut: "actif",    flag: "🇷🇺", services: ["Passeport", "Visa"] },
  { pays: "Suisse",        ville: "Genève",      continent: "Europe",   phone: "+41 22 731 51 04",  email: "missionguineegeneve@gmail.com",      statut: "actif",    flag: "🇨🇭", services: ["Passeport", "Visa", "Légalisation"] },

  // AFRIQUE
  { pays: "Maroc",         ville: "Rabat",       continent: "Afrique",  phone: "+212 537 75 44 02", email: "ambguineerabat@gmail.com",           statut: "actif",    flag: "🇲🇦", services: ["Passeport", "Visa", "Acte d'état civil", "Légalisation"] },
  { pays: "Sénégal",       ville: "Dakar",       continent: "Afrique",  phone: "+221 33 824 86 06", email: "ambguineedakar@gmail.com",           statut: "actif",    flag: "🇸🇳", services: ["Passeport", "Visa", "Acte d'état civil"] },
  { pays: "Côte d'Ivoire", ville: "Abidjan",     continent: "Afrique",  phone: "+225 27 20 32 37 58", email: "ambguineeabidjan@gmail.com",       statut: "actif",    flag: "🇨🇮", services: ["Passeport", "Visa", "Légalisation"] },
  { pays: "Mali",          ville: "Bamako",      continent: "Afrique",  phone: "+223 20 21 15 06",  email: "ambguineebamako@gmail.com",          statut: "actif",    flag: "🇲🇱", services: ["Passeport", "Visa"] },
  { pays: "Nigeria",       ville: "Abuja",       continent: "Afrique",  phone: "+234 9 413 28 75",  email: "embguineeabuja@gmail.com",           statut: "actif",    flag: "🇳🇬", services: ["Passeport", "Visa", "Légalisation"] },
  { pays: "Ghana",         ville: "Accra",       continent: "Afrique",  phone: "+233 30 277 41 96", email: "ambguineeaccra@gmail.com",           statut: "actif",    flag: "🇬🇭", services: ["Passeport", "Visa"] },
  { pays: "Éthiopie",      ville: "Addis-Abeba", continent: "Afrique",  phone: "+251 11 371 13 06", email: "ambguineeaddis@gmail.com",           statut: "actif",    flag: "🇪🇹", services: ["Passeport", "Visa"] },
  { pays: "Égypte",        ville: "Le Caire",    continent: "Afrique",  phone: "+20 2 2736 36 61",  email: "ambguineecaire@gmail.com",           statut: "actif",    flag: "🇪🇬", services: ["Passeport", "Visa", "Légalisation"] },
  { pays: "Algérie",       ville: "Alger",       continent: "Afrique",  phone: "+213 21 69 23 18",  email: "ambguineealger@gmail.com",           statut: "actif",    flag: "🇩🇿", services: ["Passeport", "Visa"] },
  { pays: "Gabon",         ville: "Libreville",  continent: "Afrique",  phone: "+241 01 74 09 76",  email: "ambguineegabon@gmail.com",           statut: "actif",    flag: "🇬🇦", services: ["Passeport", "Visa"] },
  { pays: "Congo",         ville: "Brazzaville", continent: "Afrique",  phone: "+242 06 668 13 00", email: "ambguineecongo@gmail.com",           statut: "actif",    flag: "🇨🇬", services: ["Passeport", "Visa"] },
  { pays: "Cameroun",      ville: "Yaoundé",     continent: "Afrique",  phone: "+237 222 21 02 83", email: "ambguineeyaounde@gmail.com",         statut: "actif",    flag: "🇨🇲", services: ["Passeport", "Visa"] },

  // AMÉRIQUES
  { pays: "États-Unis",    ville: "Washington",  continent: "Amériques", phone: "+1 202 986 4300",  email: "ambguineewashington@gmail.com",      statut: "actif",    flag: "🇺🇸", services: ["Passeport", "Visa", "Acte d'état civil", "Légalisation", "Carte consulaire"] },
  { pays: "Canada",        ville: "Ottawa",      continent: "Amériques", phone: "+1 613 789 8444",  email: "ambguineecanada@gmail.com",          statut: "actif",    flag: "🇨🇦", services: ["Passeport", "Visa", "Légalisation"] },
  { pays: "Brésil",        ville: "Brasília",    continent: "Amériques", phone: "+55 61 3322 4006", email: "embguineebrasil@gmail.com",          statut: "actif",    flag: "🇧🇷", services: ["Passeport", "Visa"] },
  { pays: "Cuba",          ville: "La Havane",   continent: "Amériques", phone: "+53 7 204 2602",   email: "ambguineecuba@gmail.com",            statut: "actif",    flag: "🇨🇺", services: ["Passeport", "Visa"] },

  // ASIE
  { pays: "Chine",         ville: "Pékin",       continent: "Asie",     phone: "+86 10 6532 3649",  email: "ambguineechine@gmail.com",           statut: "actif",    flag: "🇨🇳", services: ["Passeport", "Visa", "Légalisation"] },
  { pays: "Japon",         ville: "Tokyo",       continent: "Asie",     phone: "+81 3 3440 8931",   email: "ambguineejapon@gmail.com",           statut: "actif",    flag: "🇯🇵", services: ["Passeport", "Visa"] },
  { pays: "Inde",          ville: "New Delhi",   continent: "Asie",     phone: "+91 11 2688 9700",  email: "ambguineeindia@gmail.com",           statut: "actif",    flag: "🇮🇳", services: ["Passeport", "Visa"] },
  { pays: "Arabie Saoudite", ville: "Riyad",     continent: "Asie",     phone: "+966 11 454 7555",  email: "ambguineeriyadh@gmail.com",          statut: "actif",    flag: "🇸🇦", services: ["Passeport", "Visa", "Légalisation"] },

  // MOYEN-ORIENT
  { pays: "Libye",         ville: "Tripoli",     continent: "Moyen-Orient", phone: "+218 21 333 3625", email: "ambguineetripoli@gmail.com",      statut: "actif",    flag: "🇱🇾", services: ["Passeport", "Visa"] },
];

const CONTINENTS = ["Tous", "Europe", "Afrique", "Amériques", "Asie", "Moyen-Orient"];

const SERVICES_CONSULAIRES = [
  { icon: "🛂", titre: "Passeport guinéen", desc: "Délivrance, renouvellement et correction de passeport biométrique.", délai: "15-30 jours" },
  { icon: "✈️", titre: "Visa d'entrée", desc: "Visa touristique, d'affaires ou de transit pour la Guinée.", délai: "5-10 jours" },
  { icon: "📋", titre: "Actes d'état civil", desc: "Acte de naissance, mariage, décès — légalisation et apostille.", délai: "7-21 jours" },
  { icon: "📜", titre: "Légalisation", desc: "Légalisation de documents officiels guinéens et étrangers.", délai: "3-7 jours" },
  { icon: "🪪", titre: "Carte consulaire", desc: "Carte d'immatriculation consulaire pour les Guinéens de l'étranger.", délai: "10-15 jours" },
  { icon: "🎓", titre: "Attestations", desc: "Attestation de scolarité, de résidence, certificats divers.", délai: "3-5 jours" },
];

export default function AmbassadesPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [continent, setContinent] = useState("Tous");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<typeof AMBASSADES[0] | null>(null);

  const filtered = AMBASSADES.filter(a => {
    const matchContinent = continent === "Tous" || a.continent === continent;
    const matchSearch = a.pays.toLowerCase().includes(search.toLowerCase()) ||
                       a.ville.toLowerCase().includes(search.toLowerCase());
    return matchContinent && matchSearch;
  });

  const byContinent = CONTINENTS.filter(c => c !== "Tous").reduce((acc, c) => {
    acc[c] = AMBASSADES.filter(a => a.continent === c).length;
    return acc;
  }, {} as Record<string, number>);

  const isDark2 = isDark;
  const bg      = isDark2 ? "#0D1117" : "#f8f8fb";
  const cardBg  = isDark2 ? "#161B22" : "#ffffff";
  const cardBrd = isDark2 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const txt1    = isDark2 ? "#F0F6FC" : "#0d0d1a";
  const txt2    = isDark2 ? "#8B949E" : "#555";
  const txt3    = isDark2 ? "#6E7681" : "#888";
  const hdrBg   = isDark2 ? "rgba(10,12,18,0.98)" : "rgba(255,255,255,0.98)";

  return (
    <div className={inter.variable} style={{ minHeight: "100vh", backgroundColor: bg, color: txt1, fontFamily: "var(--font-inter), -apple-system, sans-serif" }}>
      <style>{`
        *{box-sizing:border-box}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .amb-card:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,0.12);border-color:rgba(206,17,38,0.3)!important}
        .amb-card{transition:all 0.2s;cursor:pointer}
        .cont-btn:hover{opacity:0.8}
        .cont-btn{transition:all 0.15s}
        input::placeholder{color:${txt3}}
        @media(max-width:640px){
          .grid-2{grid-template-columns:1fr!important}
          .grid-3{grid-template-columns:1fr!important}
          .hide-mobile{display:none!important}
        }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, backgroundColor: hdrBg, borderBottom: `1px solid ${cardBrd}`, backdropFilter: "blur(20px)", paddingTop: "env(safe-area-inset-top)", paddingRight: "20px", paddingBottom: 0, paddingLeft: "20px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <div style={{ width: "36px", height: "36px", backgroundColor: "#F5A623", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </div>
            <div>
              <p style={{ color: txt1, fontSize: "14px", fontWeight: "800", margin: 0, lineHeight: 1 }}>YELEN224</p>
              <p style={{ color: "#F5A623", fontSize: "8px", margin: 0, letterSpacing: "1.5px", fontWeight: "600" }}>REPUBLIQUE DE GUINEE</p>
            </div>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <ThemeToggle />
            <Link href="/" style={{ fontSize: "13px", color: txt2, textDecoration: "none", padding: "7px 14px", borderRadius: "8px", border: `1px solid ${cardBrd}` }}>← Accueil</Link>
          </div>
        </div>
      </header>

      <main>

        {/* ── HERO ── */}
        <div style={{ background: isDark2 ? "linear-gradient(170deg,#080E1A 0%,#0D1525 50%,#0A1020 100%)" : "linear-gradient(170deg,#f8f0e8 0%,#fff5e6 50%,#f8f0e8 100%)", borderBottom: `1px solid ${isDark2 ? "rgba(206,17,38,0.15)" : "rgba(206,17,38,0.1)"}`, position: "relative", overflow: "hidden" }}>
          {/* Décor */}
          <div style={{ position: "absolute", top: "-100px", right: "-100px", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle,rgba(206,17,38,0.06) 0%,transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "-60px", left: "-60px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle,rgba(245,166,35,0.05) 0%,transparent 60%)", pointerEvents: "none" }} />

          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "60px 20px 50px", position: "relative" }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: txt3, marginBottom: "28px" }}>
              <Link href="/" style={{ color: "#F5A623", textDecoration: "none" }}>Accueil</Link>
              <span>›</span>
              <span style={{ color: txt1 }}>Ambassades & Consulats</span>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "32px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "280px" }}>
                {/* Badge */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(206,17,38,0.08)", border: "1px solid rgba(206,17,38,0.2)", borderRadius: "20px", padding: "6px 14px", marginBottom: "20px" }}>
                  <span style={{ fontSize: "14px" }}>🇬🇳</span>
                  <span style={{ color: "#CE1126", fontSize: "11px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase" }}>Réseau diplomatique officiel</span>
                </div>

                <h1 style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: "900", color: txt1, margin: "0 0 16px", lineHeight: 1.1, letterSpacing: "-0.03em" }}>
                  Ambassades &<br />
                  <span style={{ color: "#CE1126" }}>Consulats guinéens</span><br />
                  dans le monde
                </h1>

                <p style={{ color: txt2, fontSize: "16px", lineHeight: 1.7, margin: "0 0 28px", maxWidth: "520px" }}>
                  Accédez aux services diplomatiques de la République de Guinée depuis <strong style={{ color: txt1 }}>{AMBASSADES.length} représentations</strong> à travers le monde. Prenez rendez-vous en ligne, 24h/24.
                </p>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <Link href="/recherche?categorie=Ambassade" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#CE1126", color: "#fff", borderRadius: "12px", padding: "13px 22px", fontWeight: "700", fontSize: "14px", textDecoration: "none", boxShadow: "0 4px 20px rgba(206,17,38,0.3)" }}>
                    📅 Prendre un RDV consulaire
                  </Link>
                  <Link href="/inscription" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "transparent", color: txt1, border: `1px solid ${cardBrd}`, borderRadius: "12px", padding: "13px 22px", fontWeight: "600", fontSize: "14px", textDecoration: "none" }}>
                    Créer mon compte →
                  </Link>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", flexShrink: 0 }} className="hide-mobile">
                {[
                  { n: AMBASSADES.length, label: "Représentations", icon: "🏛️", color: "#CE1126" },
                  { n: Object.keys(byContinent).length, label: "Continents", icon: "🌍", color: "#F5A623" },
                  { n: SERVICES_CONSULAIRES.length, label: "Services", icon: "📋", color: "#22c55e" },
                  { n: "24/7", label: "RDV en ligne", icon: "⏰", color: "#3b82f6" },
                ].map(s => (
                  <div key={s.label} style={{ background: isDark2 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.8)", border: `1px solid ${cardBrd}`, borderRadius: "14px", padding: "18px 20px", textAlign: "center", backdropFilter: "blur(10px)" }}>
                    <div style={{ fontSize: "24px", marginBottom: "6px" }}>{s.icon}</div>
                    <div style={{ fontSize: "28px", fontWeight: "900", color: s.color, lineHeight: 1 }}>{s.n}</div>
                    <div style={{ fontSize: "11px", color: txt3, marginTop: "4px", fontWeight: "500" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SERVICES CONSULAIRES ── */}
        <div style={{ background: isDark2 ? "#0F1117" : "#f0f0f7", borderBottom: `1px solid ${cardBrd}`, padding: "48px 20px" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <p style={{ color: "#CE1126", fontSize: "11px", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 8px" }}>Services disponibles</p>
              <h2 style={{ color: txt1, fontSize: "clamp(20px,3vw,30px)", fontWeight: "900", margin: 0, letterSpacing: "-0.02em" }}>Que pouvez-vous faire dans nos ambassades ?</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }} className="grid-3">
              {SERVICES_CONSULAIRES.map(s => (
                <div key={s.titre} style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: "14px", padding: "20px" }}>
                  <div style={{ fontSize: "28px", marginBottom: "10px" }}>{s.icon}</div>
                  <h3 style={{ color: txt1, fontSize: "14px", fontWeight: "800", margin: "0 0 6px" }}>{s.titre}</h3>
                  <p style={{ color: txt2, fontSize: "12px", lineHeight: 1.6, margin: "0 0 12px" }}>{s.desc}</p>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "20px", padding: "3px 10px" }}>
                    <span style={{ fontSize: "10px" }}>⏱️</span>
                    <span style={{ color: "#F5A623", fontSize: "10px", fontWeight: "700" }}>{s.délai}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── COMMENT ÇA MARCHE ── */}
        <div style={{ padding: "48px 20px", borderBottom: `1px solid ${cardBrd}` }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "36px" }}>
              <p style={{ color: "#CE1126", fontSize: "11px", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 8px" }}>Processus simplifié</p>
              <h2 style={{ color: txt1, fontSize: "clamp(20px,3vw,30px)", fontWeight: "900", margin: 0 }}>Prendre RDV en 3 étapes</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", position: "relative" }} className="grid-3">
              {[
                { step: "01", icon: "👤", titre: "Créer votre compte", desc: "Inscrivez-vous sur Yelen224 avec votre numéro de téléphone guinéen. Gratuit et sécurisé.", color: "#F5A623" },
                { step: "02", icon: "🏛️", titre: "Choisir votre ambassade", desc: "Sélectionnez l'ambassade ou le consulat guinéen le plus proche de votre lieu de résidence.", color: "#CE1126" },
                { step: "03", icon: "📅", titre: "Réserver un créneau", desc: "Choisissez la date, l'heure et le service souhaité. Confirmation immédiate par SMS.", color: "#22c55e" },
              ].map((s) => (
                <div key={s.step} style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: "16px", padding: "28px 24px", position: "relative" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: `${s.color}15`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", marginBottom: "16px" }}>{s.icon}</div>
                  <div style={{ position: "absolute", top: "20px", right: "20px", fontSize: "36px", fontWeight: "900", color: isDark2 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", lineHeight: 1 }}>{s.step}</div>
                  <h3 style={{ color: txt1, fontSize: "15px", fontWeight: "800", margin: "0 0 8px" }}>{s.titre}</h3>
                  <p style={{ color: txt2, fontSize: "13px", lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── LISTE AMBASSADES ── */}
        <div style={{ padding: "48px 20px 60px" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <div style={{ marginBottom: "28px" }}>
              <p style={{ color: "#CE1126", fontSize: "11px", fontWeight: "800", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 6px" }}>Réseau mondial</p>
              <h2 style={{ color: txt1, fontSize: "clamp(20px,3vw,28px)", fontWeight: "900", margin: "0 0 20px" }}>Nos représentations diplomatiques</h2>

              {/* Filtres */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
                {CONTINENTS.map(c => (
                  <button key={c} className="cont-btn" onClick={() => setContinent(c)} style={{ background: continent === c ? "#CE1126" : (isDark2 ? "rgba(255,255,255,0.04)" : "#f0f0f7"), border: `1px solid ${continent === c ? "#CE1126" : cardBrd}`, borderRadius: "20px", padding: "7px 16px", color: continent === c ? "#fff" : txt2, fontSize: "12px", fontWeight: continent === c ? "700" : "500", cursor: "pointer" }}>
                    {c} {c !== "Tous" && <span style={{ opacity: 0.7, fontSize: "10px" }}>({byContinent[c] || 0})</span>}
                  </button>
                ))}
              </div>

              {/* Recherche */}
              <div style={{ position: "relative", maxWidth: "400px" }}>
                <svg style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={txt3} strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un pays ou une ville..." style={{ width: "100%", backgroundColor: isDark2 ? "rgba(255,255,255,0.04)" : "#f9f9fb", border: `1px solid ${cardBrd}`, borderRadius: "10px", padding: "11px 16px 11px 38px", color: txt1, fontSize: "13px", outline: "none" }} />
              </div>
            </div>

            {/* Résultat */}
            <p style={{ color: txt3, fontSize: "12px", marginBottom: "16px" }}>{filtered.length} représentation{filtered.length > 1 ? "s" : ""} trouvée{filtered.length > 1 ? "s" : ""}</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" }}>
              {filtered.map(a => (
                <div key={`${a.pays}-${a.ville}`} className="amb-card" onClick={() => setSelected(selected?.pays === a.pays ? null : a)} style={{ background: cardBg, border: `1px solid ${selected?.pays === a.pays ? "rgba(206,17,38,0.4)" : cardBrd}`, borderLeft: `3px solid ${selected?.pays === a.pays ? "#CE1126" : "#CE1126"}`, borderRadius: "14px", padding: "18px 20px", position: "relative" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "32px", lineHeight: 1 }}>{a.flag}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: txt1, fontSize: "15px", fontWeight: "800", margin: "0 0 2px" }}>{a.pays}</p>
                      <p style={{ color: txt3, fontSize: "12px", margin: 0 }}>📍 {a.ville}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#22c55e" }} />
                      <span style={{ color: "#22c55e", fontSize: "10px", fontWeight: "700" }}>Actif</span>
                    </div>
                  </div>

                  {/* Services tags */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "14px" }}>
                    {a.services.slice(0, 3).map(s => (
                      <span key={s} style={{ background: isDark2 ? "rgba(206,17,38,0.08)" : "rgba(206,17,38,0.06)", border: "1px solid rgba(206,17,38,0.15)", color: "#CE1126", fontSize: "10px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px" }}>{s}</span>
                    ))}
                    {a.services.length > 3 && <span style={{ background: isDark2 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", color: txt3, fontSize: "10px", padding: "2px 8px", borderRadius: "20px" }}>+{a.services.length - 3}</span>}
                  </div>

                  {/* Détails expandables */}
                  {selected?.pays === a.pays && (
                    <div style={{ borderTop: `1px solid ${cardBrd}`, paddingTop: "14px", animation: "fadeUp 0.2s ease" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <a href={`tel:${a.phone}`} style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
                          <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: isDark2 ? "rgba(255,255,255,0.04)" : "#f0f0f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={txt2} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                          </div>
                          <span style={{ color: "#F5A623", fontSize: "13px", fontWeight: "600" }}>{a.phone}</span>
                        </a>
                        <a href={`mailto:${a.email}`} style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
                          <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: isDark2 ? "rgba(255,255,255,0.04)" : "#f0f0f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={txt2} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                          </div>
                          <span style={{ color: "#F5A623", fontSize: "12px" }}>{a.email}</span>
                        </a>
                        <Link href={`/recherche?pays=${encodeURIComponent(a.pays)}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "#CE1126", color: "#fff", borderRadius: "9px", padding: "10px", fontWeight: "700", fontSize: "13px", textDecoration: "none", marginTop: "4px" }}>
                          📅 Prendre RDV — {a.ville}
                        </Link>
                      </div>
                    </div>
                  )}

                  {selected?.pays !== a.pays && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ color: txt3, fontSize: "11px" }}>Cliquer pour les détails</span>
                      <span style={{ color: "#CE1126", fontSize: "14px" }}>›</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pas votre pays */}
            <div style={{ background: isDark2 ? "rgba(206,17,38,0.05)" : "rgba(206,17,38,0.04)", border: "1px solid rgba(206,17,38,0.15)", borderRadius: "16px", padding: "28px 24px", textAlign: "center", marginTop: "32px" }}>
              <span style={{ fontSize: "32px", display: "block", marginBottom: "12px" }}>🌐</span>
              <h3 style={{ color: txt1, fontSize: "16px", fontWeight: "800", margin: "0 0 8px" }}>Votre pays n&apos;est pas encore listé ?</h3>
              <p style={{ color: txt2, fontSize: "13px", margin: "0 0 16px", lineHeight: 1.6 }}>Le réseau diplomatique guinéen est en expansion. Contactez-nous pour signaler un consulat manquant ou demander l&apos;ouverture d&apos;un service dans votre pays.</p>
              <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#CE1126", color: "#fff", borderRadius: "10px", padding: "11px 20px", fontWeight: "700", fontSize: "13px", textDecoration: "none" }}>
                Contacter le ministère →
              </Link>
            </div>
          </div>
        </div>

        {/* CTA institution retiré (mission séparation Citizen/Web,
            11/08/2026) — l'inscription professionnelle reste sur le
            portail Web, jamais promue depuis un écran citoyen mobile. */}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ background: isDark2 ? "#080B11" : "#f0f0f6", borderTop: `1px solid ${cardBrd}`, padding: "24px 20px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <span style={{ fontSize: "12px", color: txt3 }}>© {new Date().getFullYear()} YELEN224 — Plateforme officielle de la République de Guinée</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: txt3 }}>Powered by</span>
            <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <span style={{ backgroundColor: "#FE2C55", color: "#fff", fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "6px" }}>SEMPYA224</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}