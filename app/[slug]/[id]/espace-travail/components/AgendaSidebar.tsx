"use client";

// Panneau latéral de l'onglet Agenda — V3 "Today / Up Next" (refonte CEO,
// 20/09/2026). Remplace les 4 grosses cartes empilées de la V2 (Aujourd'hui,
// Prochaines tâches, Documents récents, Activité récente) par un panneau
// compact à 3 sections (Aujourd'hui, Prochainement, À faire), pour laisser
// respirer le calendrier — Documents récents/Activité récente retirés
// (hors périmètre "centre temporel", déjà consultables dans leurs propres
// onglets Documents/Journal). Repliable (icône rail) + largeur qui se
// réduit avant que le calendrier ne devienne illisible (item 10 du brief).
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens } from "../../theme";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";

type Evenement = { id: string; titre: string; type: string; heure_debut: string | null };
type RdvItem = { id: string; objet: string | null; citoyen_nom: string; heure_rdv: string };
type Tache = { id: string; titre: string; statut: string; echeance: string | null };
type ProchainItem = { id: string; heure: string; label: string; color: string };

const COLLAPSE_KEY = "yelen224_agenda_panel_collapsed";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Duplication volontaire, allégée, de typeColor/typeLabel dans
// AgendaSection.tsx — même convention que ACTION_LABELS ci-dessous
// historiquement (fichiers de ce dossier dupliquent sciemment leurs petits
// helpers plutôt que de partager un module pour 4-5 lignes chacun).
function typeColor(type: string, C: ThemeTokens): string {
  if (type === "reunion") return C.purple;
  if (type === "bloque") return C.red;
  if (type === "autre") return C.teal;
  return C.gold;
}

function typeLabel(type: string): string {
  if (type === "reunion") return "Réunion";
  if (type === "bloque") return "Bloqué";
  if (type === "autre") return "Autre";
  return "Rappel";
}

function IconChevron({ color, dir }: { color: string; dir: "left" | "right" }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === "left" ? "none" : "rotate(180deg)" }}>
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function SectionLabel({ text, C }: { text: string; C: ThemeTokens }) {
  return <div style={{ fontSize: "10px", fontWeight: "800", color: C.t3, letterSpacing: "0.6px", marginBottom: "10px" }}>{text}</div>;
}

export function AgendaSidebar({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [collapsed, setCollapsed] = useState(false);
  const [rdvToday, setRdvToday] = useState<RdvItem[]>([]);
  const [evToday, setEvToday] = useState<Evenement[]>([]);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const today = toISODate(new Date());
      const [agendaRes, tachesRes] = await Promise.all([
        fetch(`/api/institution/agenda?date_from=${today}&date_to=${today}`),
        fetch("/api/institution/taches"),
      ]);
      if (cancelled) return;
      const agendaJ = agendaRes.ok ? await agendaRes.json().catch(() => null) : null;
      const tachesJ = tachesRes.ok ? await tachesRes.json().catch(() => null) : null;
      setRdvToday(agendaJ?.rdv ?? []);
      setEvToday(agendaJ?.evenements ?? []);
      setTaches(tachesJ?.taches ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [instId]);

  if (collapsed) {
    return (
      <button onClick={toggleCollapsed} title="Afficher le panneau" className="tap" style={{ width: "32px", flexShrink: 0, alignSelf: "stretch", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "16px", cursor: "pointer" }}>
        <IconChevron color={C.t3} dir="left"/>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="agenda-sidebar" style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <style>{AGENDA_SIDEBAR_CSS}</style>
        <YelenLoader size={22}/>
      </div>
    );
  }

  const today = toISODate(new Date());
  const tachesAujourdhui = taches.filter(t => t.echeance === today && t.statut !== "termine").length;
  const reunionsToday = evToday.filter(e => e.type === "reunion").length;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const prochain: ProchainItem[] = [
    ...rdvToday.map(r => ({ id: r.id, heure: r.heure_rdv, label: `RDV — ${r.citoyen_nom}`, color: C.blue })),
    ...evToday.map(e => ({ id: e.id, heure: e.heure_debut || "00:00", label: `${typeLabel(e.type)} · ${e.titre}`, color: typeColor(e.type, C) })),
  ]
    .filter(item => timeToMinutes(item.heure) >= nowMinutes)
    .sort((a, b) => timeToMinutes(a.heure) - timeToMinutes(b.heure))
    .slice(0, 5);

  const aFaire = taches.filter(t => t.statut !== "termine")
    .sort((a, b) => (a.echeance || "9999").localeCompare(b.echeance || "9999"))
    .slice(0, 4);

  return (
    <div className="agenda-sidebar" style={{ flexShrink: 0 }}>
      <style>{AGENDA_SIDEBAR_CSS}</style>
      <Card tokens={toCardTokens(C)} padding="16px" style={{ boxShadow: C.shadow, display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "13px", fontWeight: "800", color: C.t1 }}>Votre journée</div>
          <button onClick={toggleCollapsed} title="Réduire le panneau" className="tap" style={{ width: "24px", height: "24px", borderRadius: "8px", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <IconChevron color={C.t3} dir="right"/>
          </button>
        </div>

        <div>
          <SectionLabel text="AUJOURD'HUI" C={C}/>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[
              { label: "rendez-vous", value: rdvToday.length, color: C.blue },
              { label: "tâches", value: tachesAujourdhui, color: C.gold },
              { label: "réunions", value: reunionsToday, color: C.purple },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: item.color, flexShrink: 0 }}/>
                <span style={{ fontSize: "12.5px", color: C.t1, fontWeight: "700" }}>{item.value}</span>
                <span style={{ fontSize: "11.5px", color: C.t3 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
          <SectionLabel text="PROCHAINEMENT" C={C}/>
          {prochain.length === 0 ? (
            <div style={{ fontSize: "11.5px", color: C.t3 }}>Rien de prévu pour la suite de la journée.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {prochain.map(item => (
                <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "800", color: item.color, width: "36px", flexShrink: 0, marginTop: "1px" }}>{item.heure.slice(0, 5)}</span>
                  <span style={{ fontSize: "12px", color: C.t1, lineHeight: "1.35" }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
          <SectionLabel text="À FAIRE" C={C}/>
          {aFaire.length === 0 ? (
            <div style={{ fontSize: "11.5px", color: C.t3 }}>Aucune tâche en cours.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {aFaire.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: `1.5px solid ${C.border2}`, flexShrink: 0 }}/>
                  <span style={{ flex: 1, fontSize: "12px", color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titre}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// Largeur fluide sans casser à 1280/1440/1920 (item 10 du brief) — au-delà
// du rétrécissement, le repli en rail (bouton ci-dessus) prend le relais
// plutôt qu'un empilement vertical panneau/calendrier (aurait nécessité de
// toucher le conteneur flex parent, EspaceTravailTab.tsx — hors périmètre
// de cette passe, décision explicite avec Bryan le 20/09/2026).
const AGENDA_SIDEBAR_CSS = `
  .agenda-sidebar{width:300px}
  @media(max-width:1439px){.agenda-sidebar{width:260px}}
`;
