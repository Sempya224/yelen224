"use client";

// Onglet "Partenaires" — programme de partenariat Yelen (chantier 26/07/2026,
// refonte enterprise 04/08/2026 sur cahier des charges CEO). Vitrine niveau
// Stripe/Shopify Partner : hero + preuve sociale + parcours + CTA, mais le
// flux de demande/validation en lui-même (DemandePartenariatOverlay, table
// institution_partenariat_demandes, modération admin) est inchangé — seule
// la présentation change. Toute statistique affichée vient de
// /api/institution/partenariat (agrégats réels, zéro chiffre inventé) :
// jamais de "1 245 institutions" ou logos fictifs façon cahier des charges.
// Une fois approuvé (institutions.partenaire_statut='approuve'), l'onglet
// "Mes offres" se débloque ailleurs dans la nav (voir page.tsx).
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { DemandePartenariatOverlay } from "@/components/DemandePartenariatOverlay";
import { YelenLoaderEcran } from "@/components/YelenLoader";
import { MonPartenariatTab, type InstitutionInfo } from "./MonPartenariatTab";

type PartenaireStatut = "aucun" | "en_attente" | "approuve" | "refuse";
export type Demande = { id: string; statut: string; motif_refus: string | null; date_decision: string | null; created_at: string };
type Logo = { name: string; logo: string };
export type InstitutionSimilaire = { id: string; name: string; logo: string | null; secteur: string | null; offres_actives: number };
export type Stats = { partenaires_actifs: number; secteurs_actifs: number; delai_moyen_jours: number | null; logos: Logo[]; institutions_similaires: InstitutionSimilaire[] };

const STATS_VIDES: Stats = { partenaires_actifs: 0, secteurs_actifs: 0, delai_moyen_jours: null, logos: [], institutions_similaires: [] };

export const ICONS = {
  Handshake: (color: string) => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 4-2 4 4"/><path d="M6 16l2 2M18 16l-2 2"/></svg>,
  Check:    (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Link:     (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Chart:    (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>,
  Shield:   (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>,
  Grid:     (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  Lock:     (color: string) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
  ArrowRight: (color: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>,
  Clock:    (color: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  X:        (color: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>,
};

const AVANTAGES = [
  { icon: "Link" as const,   titre: "Visibilité auprès des citoyens Yelen", texte: "Vos offres apparaissent sur l'écran Offres, consulté par les citoyens déjà inscrits sur la plateforme." },
  { icon: "Chart" as const,  titre: "Suivi de performance", texte: "Nombre de clics vers votre site pour chaque offre publiée, pour mesurer ce qui fonctionne." },
  { icon: "Shield" as const, titre: "Contrôle qualité Yelen", texte: "Chaque offre est vérifiée avant publication — un gage de confiance pour les citoyens qui la consultent." },
];

export const AVANTAGES_SIDEBAR = [
  ...AVANTAGES,
  { icon: "Grid" as const, titre: "Centre de pilotage des offres", texte: "Une fois approuvé, créez, suivez et analysez toutes vos offres depuis un tableau de bord dédié." },
];

const ETAPES = [
  { n: 1, titre: "Vous soumettez votre candidature", texte: "Décrivez votre organisation, le type d'offres envisagées et l'impact attendu pour la communauté. Un site web officiel est requis." },
  { n: 2, titre: "Yelen examine votre demande", texte: "Notre équipe vérifie la conformité de votre organisation avec les règles de la plateforme." },
  { n: 3, titre: "Accès partenaire débloqué", texte: "Une fois approuvée, votre institution obtient l'onglet \"Mes offres\" pour créer et gérer vos offres." },
  { n: 4, titre: "Chaque offre est modérée avant publication", texte: "Vous rédigez le contenu, Yelen vérifie la conformité puis publie — vous gardez la main sur les visuels et le lien externe." },
];

const CRITERES = [
  "Institution déjà inscrite et active sur Yelen",
  "Site web officiel renseigné dans votre Profil Entreprise",
  "Offres conformes aux règles de la plateforme (aucun contenu de crédit ou microfinance dans ce programme)",
];

function phraseConfiance(n: number): string {
  if (n === 0) return "Programme tout juste lancé — soyez parmi les premières institutions partenaires.";
  if (n === 1) return "1 institution est déjà partenaire de Yelen.";
  return `${n} institutions sont déjà partenaires de Yelen.`;
}

export function PartenariatTab({ instId, access, institution, onNavigate }: {
  instId: string;
  access: "full" | "read";
  institution: InstitutionInfo;
  onNavigate: (tab: "mes-offres" | "profil-entreprise") => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [statut, setStatut] = useState<PartenaireStatut>("aucun");
  const [demande, setDemande] = useState<Demande | null>(null);
  const [stats, setStats] = useState<Stats>(STATS_VIDES);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/institution/partenariat?institution_id=${instId}`);
    const j = await res.json().catch(() => null);
    if (res.ok && j) {
      setStatut(j.partenaire_statut);
      setDemande(j.derniere_demande);
      setStats(j.stats ?? STATS_VIDES);
    }
    setLoading(false);
  }, [instId]);

  useEffect(() => { load(); }, [load]);

  const peutDemander = access === "full" && (statut === "aucun" || statut === "refuse");

  const STATUT_INFO: Record<PartenaireStatut, { label: string; color: string; colorL: string; icon: keyof typeof ICONS }> = {
    aucun:      { label: "Pas encore de demande", color: C.t2,    colorL: C.bgCard2, icon: "Handshake" },
    en_attente: { label: "Demande en cours d'examen", color: C.orange, colorL: C.orangeL, icon: "Clock" },
    approuve:   { label: "Partenaire Yelen actif", color: C.green, colorL: C.greenL, icon: "Check" },
    refuse:     { label: "Demande refusée", color: C.red,    colorL: C.redL, icon: "X" },
  };
  const si = STATUT_INFO[statut];

  // Une institution approuvée quitte définitivement la vitrine d'acquisition
  // (décision CEO 04/08/2026) : elle obtient un tableau de bord de gestion
  // dédié, pour ne plus revoir le contenu marketing censé la convaincre.
  if (loading) {
    return <YelenLoaderEcran labelColor={C.t2}/>;
  }
  if (statut === "approuve") {
    return (
      <MonPartenariatTab
        institution={institution}
        demande={demande}
        stats={stats}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div style={{ padding: "16px", maxWidth: "1280px" }}>
      <style>{`
        .part-layout{display:flex;flex-direction:column;gap:24px}
        .part-main{flex:1;min-width:0}
        .part-sidebar{width:100%;display:flex;flex-direction:column;gap:16px}
        @media(min-width:1024px){
          .part-layout{flex-direction:row;align-items:flex-start}
          .part-sidebar{width:340px;flex-shrink:0;position:sticky;top:20px}
        }
        .part-hero{display:flex;flex-direction:column;gap:20px;margin-bottom:28px}
        .part-hero-left{min-width:0}
        .part-hero-right{min-width:0}
        @media(min-width:1024px){
          .part-hero{flex-direction:row;align-items:stretch;gap:28px}
          .part-hero-left{flex:1.15}
          .part-hero-right{flex:1;min-width:300px}
        }
        .part-etapes{display:flex;flex-direction:column;gap:14px}
        .part-etape-wrap{display:flex;align-items:stretch;gap:10px}
        .part-etape-arrow{display:none}
        @media(min-width:1024px){
          .part-etapes{flex-direction:row;align-items:stretch;gap:0}
          .part-etape-wrap{flex:1;align-items:center}
          .part-etape-arrow{display:flex;align-items:center;justify-content:center;flex:0 0 26px}
        }
        .part-logos-row{display:flex;flex-wrap:wrap;gap:8px}
      `}</style>

      {/* Titre */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: C.goldL, border: `1px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {ICONS.Handshake(C.gold)}
        </div>
        <div>
          <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: 900, margin: 0, letterSpacing: "-0.3px" }}>Programme de partenariat Yelen</h1>
          <p style={{ color: C.t2, fontSize: "13px", margin: "2px 0 0" }}>Mettez vos offres en avant auprès des citoyens Yelen.</p>
        </div>
      </div>

      {/* Bandeau statut — état réel de l'institution, toujours visible en premier */}
      {!loading && (
        <div style={{
          position: "relative", overflow: "hidden",
          background: theme === "light" ? `linear-gradient(120deg, ${si.colorL}, ${C.bgCard} 65%)` : `linear-gradient(120deg, ${si.colorL}, ${C.bgCard} 65%)`,
          border: `1px solid ${C.border}`, borderRadius: "18px", padding: "20px 22px", marginBottom: "24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap",
          boxShadow: theme === "light" ? "0 4px 20px rgba(20,20,30,0.06)" : "0 4px 20px rgba(0,0,0,0.28)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "50px", height: "50px", borderRadius: "14px", background: C.bgCard, border: `1.5px solid ${si.color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {ICONS[si.icon](si.color)}
            </div>
            <div>
              <div style={{ color: C.t2, fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Statut du partenariat</div>
              <div style={{ color: si.color, fontSize: "18px", fontWeight: 900, letterSpacing: "-0.2px" }}>{si.label}</div>
              {statut === "refuse" && demande?.motif_refus && (
                <div style={{ color: C.t2, fontSize: "12px", marginTop: "6px", maxWidth: "480px" }}>Motif : {demande.motif_refus}</div>
              )}
            </div>
          </div>
          {peutDemander && (
            <button onClick={() => setFormOpen(true)} style={{ background: `linear-gradient(135deg,${C.gold},${C.goldD})`, border: "none", color: "#080812", fontWeight: 800, fontSize: "13px", padding: "13px 22px", borderRadius: "12px", cursor: "pointer", boxShadow: `0 6px 16px ${C.gold}33` }}>
              Demander un partenariat
            </button>
          )}
        </div>
      )}

      <div className="part-layout">
        <div className="part-main">
          {/* Hero */}
          <div className="part-hero">
            <div className="part-hero-left">
              <h2 style={{ color: C.t1, fontSize: "19px", fontWeight: 900, margin: "0 0 8px", letterSpacing: "-0.3px" }}>Devenez partenaire officiel de Yelen</h2>
              <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.7, margin: "0 0 18px", maxWidth: "480px" }}>
                Rejoindre le programme, c&apos;est publier vos offres directement auprès des citoyens déjà présents sur Yelen, avec un contrôle qualité qui protège votre réputation et la leur.
              </p>
              <div style={{ display: "grid", gap: "10px" }}>
                {AVANTAGES.map(a => (
                  <div key={a.titre} style={{ display: "flex", gap: "12px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {ICONS[a.icon](C.gold)}
                    </div>
                    <div>
                      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "2px" }}>{a.titre}</div>
                      <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{a.texte}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="part-hero-right">
              <div style={{
                position: "relative", height: "100%", minHeight: "260px", borderRadius: "20px", overflow: "hidden",
                border: `1px solid ${C.border}`, paddingBottom: "40px",
                background: theme === "light"
                  ? `linear-gradient(135deg, ${C.goldL}, #FFFFFF 70%)`
                  : `linear-gradient(135deg, ${C.bgCard2}, ${C.bg3})`,
              }}>
                <svg width="100%" height="100%" viewBox="0 0 320 260" style={{ position: "absolute", inset: 0, opacity: theme === "light" ? 0.55 : 0.4 }} preserveAspectRatio="xMidYMid slice">
                  <circle cx="260" cy="40" r="140" fill="none" stroke={C.gold} strokeWidth="1" opacity="0.35"/>
                  <circle cx="260" cy="40" r="100" fill="none" stroke={C.gold} strokeWidth="1" opacity="0.3"/>
                  <circle cx="260" cy="40" r="60" fill="none" stroke={C.gold} strokeWidth="1" opacity="0.25"/>
                  <path d="M20 220 L20 150 L55 150 L55 220 M75 220 L75 120 L110 120 L110 220 M130 220 L130 170 L165 170 L165 220 M185 220 L185 100 L220 100 L220 220" stroke={C.gold} strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
                </svg>
                <div style={{ position: "absolute", top: "18px", left: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {ICONS.Handshake(theme === "light" ? C.goldD : C.gold)}
                  <span style={{ color: C.t1, fontSize: "13px", fontWeight: 900 }}>Yelen Partenariat</span>
                </div>

                {/* Carte flottante — chiffre réel, pas d'estimation */}
                <div style={{
                  position: "absolute", left: "20px", right: "20px", bottom: "-14px",
                  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px",
                  padding: "14px 16px", boxShadow: theme === "light" ? "0 12px 28px rgba(20,20,30,0.12)" : "0 12px 28px rgba(0,0,0,0.4)",
                  display: "flex", alignItems: "center", gap: "12px",
                }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: C.goldL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {ICONS.Check(C.gold)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 800 }}>Partenaire certifié Yelen</div>
                    <div style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.5 }}>{phraseConfiance(stats.partenaires_actifs)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Comment ça marche */}
          <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 14px" }}>Comment ça marche</h2>
          <div className="part-etapes" style={{ marginBottom: "28px" }}>
            {ETAPES.map((e, i) => (
              <div key={e.n} className="part-etape-wrap">
                <div style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
                  <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: C.bgCard2, border: `1.5px solid ${C.gold}`, color: C.gold, fontWeight: 900, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "10px" }}>{e.n}</div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>{e.titre}</div>
                  <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{e.texte}</div>
                </div>
                {i < ETAPES.length - 1 && <div className="part-etape-arrow">{ICONS.ArrowRight(C.border2)}</div>}
              </div>
            ))}
          </div>

          {/* CTA final */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.gold}33`, borderRadius: "18px", padding: "22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: C.t1, fontSize: "16px", fontWeight: 900, marginBottom: "4px" }}>
                {statut === "en_attente" ? "Votre demande est en cours" : "Prêt à commencer ?"}
              </div>
              <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "440px" }}>
                {access !== "full"
                  ? "Seul un administrateur de votre institution peut soumettre une demande de partenariat."
                  : statut === "en_attente"
                  ? "Notre équipe examine votre dossier — vous serez notifié dès la décision prise."
                  : "Rejoignez les institutions qui développent leur visibilité grâce à Yelen."}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", color: C.t3, fontSize: "11px", fontWeight: 600 }}>
                {ICONS.Lock(C.t3)}
                Processus sécurisé et confidentiel
              </div>
            </div>
            {peutDemander && (
              <button onClick={() => setFormOpen(true)} style={{ background: `linear-gradient(135deg,${C.gold},${C.goldD})`, border: "none", color: "#080812", fontWeight: 800, fontSize: "13px", padding: "14px 22px", borderRadius: "12px", cursor: "pointer", flexShrink: 0 }}>
                Soumettre une demande de partenariat
              </button>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="part-sidebar">
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px" }}>
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "12px" }}>Avantages du programme</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {AVANTAGES_SIDEBAR.map(a => (
                <div key={a.titre} style={{ display: "flex", gap: "10px" }}>
                  <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {ICONS[a.icon](C.gold)}
                  </div>
                  <div>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 800, marginBottom: "1px" }}>{a.titre}</div>
                    <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.55 }}>{a.texte}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px" }}>
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "12px" }}>Ils nous font confiance</div>
            <div style={{ display: "grid", gridTemplateColumns: stats.delai_moyen_jours !== null ? "repeat(3,1fr)" : "repeat(2,1fr)", gap: "10px", marginBottom: stats.logos.length ? "14px" : 0 }}>
              <div>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: 900, lineHeight: 1.1 }}>{stats.partenaires_actifs}</div>
                <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: 700, marginTop: "2px" }}>Partenaires actifs</div>
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: 900, lineHeight: 1.1 }}>{stats.secteurs_actifs}</div>
                <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: 700, marginTop: "2px" }}>Secteurs représentés</div>
              </div>
              {stats.delai_moyen_jours !== null && (
                <div>
                  <div style={{ color: C.t1, fontSize: "20px", fontWeight: 900, lineHeight: 1.1 }}>{stats.delai_moyen_jours}j</div>
                  <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: 700, marginTop: "2px" }}>Délai moyen de réponse</div>
                </div>
              )}
            </div>
            {stats.logos.length > 0 && (
              <div className="part-logos-row">
                {stats.logos.map(l => (
                  <div key={l.name} title={l.name} style={{ width: "54px", height: "54px", position: "relative", borderRadius: "12px", background: "#FFFFFF", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, padding: "7px" }}>
                    <Image src={l.logo} alt={l.name} fill sizes="54px" style={{ objectFit: "contain" }}/>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px" }}>
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "10px" }}>Critères d&apos;éligibilité</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {CRITERES.map(txt => (
                <div key={txt} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span style={{ marginTop: "2px", flexShrink: 0 }}>{ICONS.Check(C.green)}</span>
                  <span style={{ color: C.t2, fontSize: "12px", lineHeight: 1.55 }}>{txt}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {formOpen && (
        <DemandePartenariatOverlay
          instId={instId}
          onClose={() => setFormOpen(false)}
          onSubmitted={() => { setFormOpen(false); load(); }}
        />
      )}
    </div>
  );
}
