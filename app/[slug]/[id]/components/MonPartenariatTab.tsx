"use client";

// "Mon partenariat" — tableau de bord affiché uniquement quand
// institutions.partenaire_statut='approuve' (décision CEO 04/08/2026 :
// séparer l'écran d'acquisition, PartenariatTab, du tableau de bord de
// gestion, une fois le partenariat obtenu). Trois notions demandées dans le
// cahier des charges n'ont aucune source de données réelle et ont été
// retirées sur décision de Bryan plutôt qu'inventées : "Responsable Yelen"
// (aucune table d'assignation), "Niveau partenaire" Gold/Silver (aucun
// barème), "Santé du partenariat" score/100 (dont la "satisfaction" n'est
// mesurée nulle part). Le statut "suspendu" n'existe pas non plus dans
// institutions.partenaire_statut — reporté à un lot séparé.
// Le détail complet des offres (performance, top offres, modération) vit
// déjà dans l'onglet "Mes offres" (MesOffresTab/MesOffresAnalytics) — cet
// écran ne le duplique pas, il renvoie vers lui via "Actions rapides".
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { ICONS, AVANTAGES_SIDEBAR, type Demande, type Stats } from "./PartenariatTab";
import { urlExterneSure } from "@/lib/urlValidation";

export type InstitutionInfo = { name: string; logo: string | null; secteur: string | null; website?: string };
type Offre = { id: string; titre: string; statut: string; soumis_le: string | null; valide_le: string | null; nb_clics: number | null; created_at: string; motif_refus: string | null };

type Evenement = { date: string; label: string; who: "Vous" | "Yelen" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function MonPartenariatTab({ institution, demande, stats, onNavigate }: {
  institution: InstitutionInfo;
  demande: Demande | null;
  stats: Stats;
  onNavigate: (tab: "mes-offres" | "profil-entreprise") => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [offres, setOffres] = useState<Offre[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/institution/offres");
      const j = await res.json().catch(() => null);
      setOffres(res.ok && Array.isArray(j) ? (j as Offre[]) : []);
    })();
  }, []);

  const kpi = useMemo(() => {
    const list = offres ?? [];
    return {
      total: list.length,
      actives: list.filter(o => o.statut === "publiee").length,
      enAttente: list.filter(o => o.statut === "en_attente_validation").length,
      clics: list.reduce((s, o) => s + (o.nb_clics ?? 0), 0),
    };
  }, [offres]);

  const historique = useMemo(() => {
    const events: Evenement[] = [];
    if (demande?.created_at) events.push({ date: demande.created_at, label: "Candidature de partenariat soumise", who: "Vous" });
    if (demande?.date_decision) events.push({ date: demande.date_decision, label: "Partenariat approuvé par Yelen", who: "Yelen" });
    for (const o of offres ?? []) {
      if (o.soumis_le) events.push({ date: o.soumis_le, label: `Offre soumise : ${o.titre}`, who: "Vous" });
      if (o.valide_le) events.push({ date: o.valide_le, label: `Offre validée : ${o.titre}`, who: "Yelen" });
    }
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
  }, [demande, offres]);

  // P0 Stored XSS (17/08/2026) — self-XSS a minima (institution affiche son
  // propre website), mais même règle de défense en profondeur qu'ailleurs :
  // jamais de href non revalidé au rendu.
  const websiteHref = urlExterneSure(institution.website);

  const KPI_ITEMS = [
    { label: "Offres publiées", value: kpi.total },
    { label: "Offres actives", value: kpi.actives },
    { label: "En attente de modération", value: kpi.enAttente },
    { label: "Clics générés", value: kpi.clics },
  ];

  return (
    <div style={{ padding: "16px", maxWidth: "1280px" }}>
      <style>{`
        .mp-layout{display:flex;flex-direction:column;gap:24px}
        .mp-main{flex:1;min-width:0}
        .mp-sidebar{width:100%;display:flex;flex-direction:column;gap:16px}
        @media(min-width:1024px){
          .mp-layout{flex-direction:row;align-items:flex-start}
          .mp-sidebar{width:300px;flex-shrink:0;position:sticky;top:20px}
        }
        .mp-kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
        @media(min-width:640px){ .mp-kpi-grid{grid-template-columns:repeat(4,1fr)} }
        .mp-avantages-grid{display:grid;grid-template-columns:1fr;gap:10px}
        @media(min-width:768px){ .mp-avantages-grid{grid-template-columns:repeat(2,1fr)} }
        .mp-similaires-row{display:flex;flex-wrap:wrap;gap:10px}
        .mp-statut-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
        @media(min-width:640px){ .mp-statut-grid{grid-template-columns:repeat(4,1fr)} }
      `}</style>

      {/* Hero */}
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: "20px", border: `1px solid ${C.border}`,
        padding: "26px 24px", marginBottom: "20px",
        background: theme === "light" ? `linear-gradient(120deg, ${C.goldL}, #FFFFFF 75%)` : `linear-gradient(120deg, ${C.bgCard2}, ${C.bg3})`,
      }}>
        <svg width="360" height="200" viewBox="0 0 360 200" style={{ position: "absolute", top: 0, right: 0, opacity: theme === "light" ? 0.4 : 0.3 }} preserveAspectRatio="xMidYMid slice">
          <circle cx="330" cy="20" r="130" fill="none" stroke={C.gold} strokeWidth="1" opacity="0.35"/>
          <circle cx="330" cy="20" r="90" fill="none" stroke={C.gold} strokeWidth="1" opacity="0.3"/>
        </svg>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ width: "64px", height: "64px", position: "relative", borderRadius: "16px", background: "#FFFFFF", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, padding: institution.logo ? "8px" : 0 }}>
            {institution.logo
              ? <Image src={institution.logo} alt={institution.name} fill sizes="64px" style={{ objectFit: "contain" }}/>
              : ICONS.Handshake(C.gold)}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h1 style={{ color: C.t1, fontSize: "20px", fontWeight: 800, margin: 0, letterSpacing: "-0.3px" }}>{institution.name}</h1>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: C.greenL, color: C.green, fontSize: "11px", fontWeight: 800, padding: "4px 10px", borderRadius: "999px" }}>
                {ICONS.Check(C.green)} Partenaire certifié Yelen
              </span>
            </div>
            <p style={{ color: C.t2, fontSize: "13px", margin: "6px 0 0" }}>Votre organisation fait partie du réseau officiel des partenaires Yelen.</p>
          </div>
        </div>
      </div>

      {/* Carte statut */}
      <Card tokens={toCardTokens(C)} padding="18px 20px" style={{ marginBottom: "20px" }}>
        <div className="mp-statut-grid">
          <div>
            <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Statut</div>
            <div style={{ color: C.green, fontSize: "14px", fontWeight: 800 }}>Partenaire actif</div>
          </div>
          <div>
            <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Depuis</div>
            <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{formatDate(demande?.date_decision ?? null)}</div>
          </div>
          <div>
            <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Secteur</div>
            <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, textTransform: "capitalize" }}>{institution.secteur ?? "—"}</div>
          </div>
          <div>
            <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Site web</div>
            {websiteHref
              ? <a href={websiteHref} target="_blank" rel="noreferrer" style={{ color: C.gold, fontSize: "14px", fontWeight: 800, textDecoration: "none" }}>{institution.website?.replace(/^https?:\/\//, "")}</a>
              : <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>—</div>}
          </div>
        </div>
      </Card>

      {/* KPI */}
      <div className="mp-kpi-grid" style={{ marginBottom: "24px" }}>
        {KPI_ITEMS.map(k => (
          <Card key={k.label} tokens={toCardTokens(C)} padding="16px">
            <div style={{ color: C.t1, fontSize: "22px", fontWeight: 800, lineHeight: 1.1 }}>{offres === null ? "—" : k.value}</div>
            <div style={{ color: C.t2, fontSize: "11px", fontWeight: 700, marginTop: "4px" }}>{k.label}</div>
          </Card>
        ))}
      </div>

      <div className="mp-layout">
        <div className="mp-main">
          {/* Avantages */}
          <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 12px" }}>Vos avantages partenaires</h2>
          <div className="mp-avantages-grid" style={{ marginBottom: "24px" }}>
            {AVANTAGES_SIDEBAR.map(a => (
              <Card key={a.titre} tokens={toCardTokens(C)} padding="14px" style={{ display: "flex", gap: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {ICONS[a.icon](C.gold)}
                </div>
                <div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "2px" }}>{a.titre}</div>
                  <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{a.texte}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* Historique */}
          <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 12px" }}>Historique du partenariat</h2>
          <Card tokens={toCardTokens(C)} padding="6px 18px" style={{ marginBottom: "24px" }}>
            {historique.length === 0 ? (
              <div style={{ color: C.t3, fontSize: "12.5px", padding: "14px 0" }}>Aucun évènement pour le moment.</div>
            ) : historique.map((e, i) => (
              <div key={`${e.date}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: e.who === "Yelen" ? C.gold : C.blue, marginTop: "5px", flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{e.label}</div>
                  <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{formatDate(e.date)} · {e.who}</div>
                </div>
              </div>
            ))}
          </Card>

          {/* Institutions similaires */}
          {stats.institutions_similaires.length > 0 && (
            <>
              <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: "0 0 12px" }}>Institutions similaires</h2>
              <div className="mp-similaires-row" style={{ marginBottom: "24px" }}>
                {stats.institutions_similaires.map(s => (
                  <Card key={s.id} tokens={toCardTokens(C)} padding="12px 14px" style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 220px" }}>
                    <div style={{ width: "40px", height: "40px", position: "relative", borderRadius: "10px", background: "#FFFFFF", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, padding: s.logo ? "6px" : 0 }}>
                      {s.logo
                        ? <Image src={s.logo} alt={s.name} fill sizes="40px" style={{ objectFit: "contain" }}/>
                        : ICONS.Grid(C.t3)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                      <div style={{ color: C.t2, fontSize: "11px", marginTop: "1px" }}>{s.offres_actives} offre{s.offres_actives !== 1 ? "s" : ""} active{s.offres_actives !== 1 ? "s" : ""}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px 18px", color: C.t2, fontSize: "12px", lineHeight: 1.6 }}>
            Merci de contribuer au développement de l&apos;écosystème Yelen. Votre institution participe à améliorer l&apos;accès des citoyens à des services fiables.
          </div>
        </div>

        {/* Actions rapides */}
        <aside className="mp-sidebar">
          <Card tokens={toCardTokens(C)} padding="16px">
            <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "12px" }}>Actions rapides</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button onClick={() => onNavigate("mes-offres")} style={{ display: "flex", alignItems: "center", gap: "10px", background: `linear-gradient(135deg,${C.gold},${C.goldD})`, border: "none", borderRadius: "12px", padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                {ICONS.Grid("#080812")}
                <span style={{ color: "#080812", fontSize: "12.5px", fontWeight: 800 }}>Gérer mes offres</span>
              </button>
              <button onClick={() => onNavigate("profil-entreprise")} style={{ display: "flex", alignItems: "center", gap: "10px", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                {ICONS.Shield(C.t1)}
                <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 800 }}>Modifier mon profil entreprise</span>
              </button>
              <a href="mailto:support@yelen224.com" style={{ display: "flex", alignItems: "center", gap: "10px", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", textDecoration: "none" }}>
                {ICONS.Link(C.t1)}
                <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 800 }}>Contacter Yelen</span>
              </a>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
