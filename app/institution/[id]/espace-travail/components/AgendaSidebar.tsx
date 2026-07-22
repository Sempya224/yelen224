"use client";

// Panneau latéral de l'onglet Agenda (spec CEO, refonte Espace de travail
// 18/07/2026) — 4 cartes dans l'ordre imposé : Aujourd'hui, Prochaines
// tâches, Documents récents, Activité récente. N'apparaît qu'à côté de
// l'agenda (voir layout flex 75/25 dans EspaceTravailTab.tsx) — les autres
// onglets restent pleine largeur.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../../dashboard/theme";

type Tache = { id: string; titre: string; statut: string; echeance: string | null };
type Document = { id: string; nom: string; uploaded_at: string };
type ActiviteEntree = { membre_nom: string; action: string; created_at: string };

// Libellés courts pour la carte "Activité récente" — volontairement
// dupliqués (en plus légers) de ACTION_META dans JournalTab.tsx : cette
// carte est visible par tout membre (pas seulement l'admin) et n'a besoin
// que d'un label, pas de couleur/catégorie/icône détaillée.
const ACTION_LABELS: Record<string, string> = {
  rdv_accepte: "a accepté un rendez-vous",
  rdv_refuse: "a refusé un rendez-vous",
  rdv_termine: "a marqué un rendez-vous terminé",
  rdv_absent: "a marqué un client absent",
  document_ajoute: "a ajouté un document",
  document_supprime: "a supprimé un document",
  tache_creee: "a créé une tâche",
  tache_modifiee: "a modifié une tâche",
  tache_supprimee: "a supprimé une tâche",
  evenement_cree: "a créé un événement",
  evenement_modifie: "a modifié un événement",
  evenement_supprime: "a supprimé un événement",
  membre_cree: "a créé un membre",
  membre_modifie: "a modifié un membre",
  membre_supprime: "a supprimé un membre",
  projet_cree: "a créé un projet",
  projet_modifie: "a modifié un projet",
  projet_supprime: "a supprimé un projet",
  note_creee: "a créé une note",
  note_modifiee: "a modifié une note",
  note_supprimee: "a supprimé une note",
};

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function SidebarCard({ title, C, children }: { title: string; C: ThemeTokens; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: "16px" }}>
      <div style={{ fontSize: "12.5px", fontWeight: "800", color: C.t1, marginBottom: "12px" }}>{title}</div>
      {children}
    </div>
  );
}

export function AgendaSidebar({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [rdvToday, setRdvToday] = useState(0);
  const [meetingsToday, setMeetingsToday] = useState(0);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activite, setActivite] = useState<ActiviteEntree[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const today = toISODate(new Date());
      const [agendaRes, tachesRes, docsRes, activiteRes] = await Promise.all([
        fetch(`/api/institution/agenda?date_from=${today}&date_to=${today}`),
        fetch("/api/institution/taches"),
        fetch("/api/institution/documents-travail"),
        fetch("/api/institution/journal/recent"),
      ]);
      if (cancelled) return;
      const agendaJ = agendaRes.ok ? await agendaRes.json().catch(() => null) : null;
      const tachesJ = tachesRes.ok ? await tachesRes.json().catch(() => null) : null;
      const docsJ = docsRes.ok ? await docsRes.json().catch(() => null) : null;
      const activiteJ = activiteRes.ok ? await activiteRes.json().catch(() => null) : null;
      setRdvToday(agendaJ?.rdv?.length ?? 0);
      setMeetingsToday((agendaJ?.evenements ?? []).filter((e: { type: string }) => e.type === "reunion").length);
      setTaches(tachesJ?.taches ?? []);
      setDocuments(docsJ?.documents ?? []);
      setActivite(activiteJ?.entrees ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [instId]);

  const today = toISODate(new Date());
  const tachesAujourdhui = taches.filter(t => t.echeance === today && t.statut !== "termine").length;
  const prochainesTaches = taches.filter(t => t.statut !== "termine").slice(0, 5);
  const documentsRecents = documents.slice(0, 4);

  if (loading) {
    return (
      <div style={{ width: "320px", flexShrink: 0, display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <div style={{ width: "22px", height: "22px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "espace-spin 0.8s linear infinite" }}/>
      </div>
    );
  }

  return (
    <div style={{ width: "320px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
      <SidebarCard title="Aujourd'hui" C={C}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
          {[
            { label: "RDV", value: rdvToday, color: C.blue },
            { label: "Tâches", value: tachesAujourdhui, color: C.gold },
            { label: "Réunions", value: meetingsToday, color: C.purple },
          ].map(item => (
            <div key={item.label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: "900", color: item.color }}>{item.value}</div>
              <div style={{ fontSize: "9.5px", color: C.t3, fontWeight: "700" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </SidebarCard>

      <SidebarCard title="Prochaines tâches" C={C}>
        {prochainesTaches.length === 0 ? (
          <div style={{ color: C.t3, fontSize: "11.5px" }}>Aucune tâche en cours.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {prochainesTaches.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "14px", height: "14px", borderRadius: "4px", border: `1.5px solid ${C.border2}`, flexShrink: 0 }}/>
                <span style={{ flex: 1, fontSize: "12px", color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titre}</span>
                {t.echeance && <span style={{ fontSize: "10px", color: C.t3, flexShrink: 0 }}>{new Date(t.echeance).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
              </div>
            ))}
          </div>
        )}
      </SidebarCard>

      <SidebarCard title="Documents récents" C={C}>
        {documentsRecents.length === 0 ? (
          <div style={{ color: C.t3, fontSize: "11.5px" }}>Aucun document pour l'instant.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {documentsRecents.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", flexShrink: 0 }}>📄</span>
                <span style={{ flex: 1, fontSize: "12px", color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nom}</span>
                <span style={{ fontSize: "10px", color: C.t3, flexShrink: 0 }}>{new Date(d.uploaded_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </div>
        )}
      </SidebarCard>

      <SidebarCard title="Activité récente" C={C}>
        {activite.length === 0 ? (
          <div style={{ color: C.t3, fontSize: "11.5px" }}>Aucune activité pour l'instant.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {activite.map((a, i) => (
              <div key={i} style={{ fontSize: "11.5px", color: C.t2 }}>
                <strong style={{ color: C.t1 }}>{a.membre_nom}</strong> {ACTION_LABELS[a.action] ?? a.action}
                <div style={{ color: C.t3, fontSize: "10px", marginTop: "1px" }}>{heure(a.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </SidebarCard>
    </div>
  );
}
