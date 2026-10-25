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
import { T, type ThemeTokens } from "../../theme";
import { heureAmPm } from "@/lib/heure";

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
  return <h3 style={{ fontSize: "13px", fontWeight: 600, color: C.t1, margin: "0 0 10px" }}>{text}</h3>;
}

export function AgendaSidebar({ instId, onVoirTaches }: { instId: string; onVoirTaches?: () => void }) {
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
      <button onClick={toggleCollapsed} title="Afficher Votre journée" aria-label="Afficher le panneau Votre journée" className="tap" style={{ width: "32px", flexShrink: 0, alignSelf: "stretch", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "16px", cursor: "pointer" }}>
        <IconChevron color={C.t3} dir="left"/>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="agenda-sidebar" role="status" aria-label="Chargement de Votre journée" style={{ flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px", backgroundColor: C.bgCard }}>
        <style>{AGENDA_SIDEBAR_CSS}</style>
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="cix-skel" style={{ height: i === 0 ? "20px" : "34px", marginBottom: "12px" }}/>)}
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

  const plur = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const dateLabel = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/^./, c => c.toUpperCase());

  return (
    <div className="agenda-sidebar" style={{ flexShrink: 0 }}>
      <style>{AGENDA_SIDEBAR_CSS}</style>
      <aside aria-label="Votre journée" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "18px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0 }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: C.t1, margin: 0 }}>Votre journée</h2>
            <span style={{ fontSize: "13px", color: C.t2 }}>{dateLabel}</span>
          </div>
          <button onClick={toggleCollapsed} title="Réduire le panneau" aria-label="Réduire le panneau Votre journée" className="tap" style={{ width: "28px", height: "28px", borderRadius: "8px", background: "none", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <IconChevron color={C.t3} dir="right"/>
          </button>
        </div>

        <section>
          <SectionLabel text="Aujourd'hui" C={C}/>
          <ul style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", listStyle: "none", margin: 0, padding: 0, fontSize: "13px", color: C.t1, fontVariantNumeric: "tabular-nums" }}>
            {[
              { texte: plur(rdvToday.length, "rendez-vous"), color: C.blue },
              { texte: plur(tachesAujourdhui, "tâche"), color: C.gold },
              { texte: plur(reunionsToday, "réunion"), color: C.purple },
            ].map(item => (
              <li key={item.texte} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: item.color }}/>{item.texte}
              </li>
            ))}
          </ul>
        </section>

        <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "16px" }}>
          <SectionLabel text="Prochainement" C={C}/>
          {prochain.length === 0 ? (
            <div style={{ fontSize: "13px", color: C.t3 }}>Rien de prévu pour la suite de la journée</div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", margin: 0, padding: 0 }}>
              {prochain.map(item => (
                <li key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: C.t1, width: "68px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{heureAmPm(item.heure) || item.heure.slice(0, 5)}</span>
                  <span title={item.label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: C.t1, lineHeight: 1.35, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: item.color, flexShrink: 0 }}/>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
            <SectionLabel text="À faire" C={C}/>
            {onVoirTaches && aFaire.length > 0 && (
              <button type="button" onClick={onVoirTaches} className="tap" style={{ background: "none", border: "none", padding: 0, marginBottom: "10px", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer" }}>Voir tout</button>
            )}
          </div>
          {aFaire.length === 0 ? (
            <div style={{ fontSize: "13px", color: C.t3 }}>Aucune tâche en cours</div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", margin: 0, padding: 0 }}>
              {aFaire.map(t => (
                <li key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span aria-hidden="true" style={{ width: "14px", height: "14px", borderRadius: "50%", border: `1.5px solid ${C.border2}`, flexShrink: 0, marginTop: "2px" }}/>
                  <span title={t.titre} style={{ flex: 1, fontSize: "13px", color: C.t1, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{t.titre}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

// Largeur fluide sans casser à 1280/1440/1920 (item 10 du brief) — au-delà
// du rétrécissement, le repli en rail (bouton ci-dessus) prend le relais
// plutôt qu'un empilement vertical panneau/calendrier (aurait nécessité de
// toucher le conteneur flex parent, EspaceTravailTab.tsx — hors périmètre
// de cette passe, décision explicite avec Bryan le 20/09/2026).
const AGENDA_SIDEBAR_CSS = `
  .agenda-sidebar{width:100%}
  @media(min-width:1280px){.agenda-sidebar{width:320px;position:sticky;top:16px}}
`;
