"use client";

// Écran "Questions des clients" (panneau Mon compte, chantier "Questions
// publiques pré-RDV" façon Booking "Travelers are asking", 24/07/2026) —
// réception des questions posées par les citoyens sur la fiche publique
// (app/institution/[id]/page.tsx, table questions_institution). Une fois
// répondue, la question devient visible publiquement sur la fiche.
// Volontairement séparé de MessagerieTab.tsx (table messages, liée aux
// RDV) — deux systèmes distincts, pas de mélange. Refonte UI 20/10/2026 :
// l'affichage vit dans QuestionsClientsUi.tsx, la logique reste ici.
import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { HelpCenterGuide } from "./HelpCenterGuide";
import {
  QuestionsStyles, QuestionsHeader, QuestionsToolbar, QuestionCard, QuestionsSkeleton, QuestionsMessage,
} from "./QuestionsClientsUi";

type Question = {
  id: string; citoyen_id: string; citoyen_nom: string;
  question: string; reponse: string | null; reponse_le: string | null;
  lu: boolean; created_at: string;
};

const FILTRES = [
  { key: "toutes", label: "Toutes" },
  { key: "en_attente", label: "En attente" },
  { key: "repondues", label: "Répondues" },
] as const;

// Clé de regroupement des questions identiques (affichage seulement).
function cleQuestion(t: string): string { return t.trim().toLowerCase().replace(/\s+/g, " "); }

export function QuestionsClientsTab({ readOnly, onToast }: { readOnly: boolean; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [filtre, setFiltre] = useState<(typeof FILTRES)[number]["key"]>("en_attente");
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [envoiId, setEnvoiId] = useState<string | null>(null);
  const [ouvertId, setOuvertId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tri, setTri] = useState<"" | "recentes" | "anciennes">("");
  const [maintenant] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setErreur(false);
    const res = await fetch("/api/institution/questions").catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setErreur(!res || !res.ok);
    setQuestions(res?.ok ? (j?.questions ?? []) : []);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);

  async function repondre(id: string) {
    const reponse = (brouillons[id] ?? "").trim();
    if (!reponse) return;
    setEnvoiId(id);
    const res = await fetch("/api/institution/questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reponse }),
    });
    setEnvoiId(null);
    if (res.ok) {
      onToast("Réponse envoyée — visible publiquement sur la fiche.");
      setBrouillons(prev => { const n = { ...prev }; delete n[id]; return n; });
      setOuvertId(null);
      load();
    } else {
      onToast("Erreur lors de l'envoi.", C.red);
    }
  }

  const nbEnAttente = questions.filter(q => !q.reponse).length;
  const s = search.trim().toLowerCase();
  const filtered = questions
    .filter(q => {
      if (filtre === "en_attente") return !q.reponse;
      if (filtre === "repondues") return !!q.reponse;
      return true;
    })
    .filter(q => !s || q.question.toLowerCase().includes(s) || q.citoyen_nom.toLowerCase().includes(s));
  // Tri d'affichage seulement quand l'utilisateur en choisit un ; sans choix,
  // l'ordre livré par l'API est conservé tel quel.
  const affichees = tri === "" ? filtered : [...filtered].sort((a, b) => {
    const d = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return tri === "recentes" ? d : -d;
  });
  const occurrences = new Map<string, number>();
  for (const q of questions) occurrences.set(cleQuestion(q.question), (occurrences.get(cleQuestion(q.question)) ?? 0) + 1);

  const filtreActif = s !== "" || filtre !== "toutes" || tri !== "";
  function reinitialiser() { setSearch(""); setFiltre("toutes"); setTri(""); }

  return (
    <div className="qcx-page" style={{ animation: "fadeUp 0.2s ease" }}>
      <QuestionsStyles C={C}/>
      <QuestionsHeader C={C} actions={<HelpCenterGuide tab="questions-clients" />}/>

      {readOnly && (
        <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px" }}>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.55, margin: 0 }}>
            <strong style={{ color: C.orange, fontWeight: 600 }}>Lecture seule.</strong> Vous n&apos;avez pas les droits pour répondre depuis cet écran.
          </p>
        </div>
      )}

      <QuestionsToolbar C={C} active search={search} onSearch={setSearch}
        tabs={FILTRES.map(f => ({
          key: f.key, label: f.label,
          count: f.key === "en_attente" ? nbEnAttente : f.key === "repondues" ? questions.length - nbEnAttente : questions.length,
          attention: f.key === "en_attente" && nbEnAttente > 0,
        }))}
        tabActif={filtre}
        onTab={k => { const f = FILTRES.find(x => x.key === k); if (f) setFiltre(f.key); }}
        tri={tri} onTri={v => setTri(v === "recentes" || v === "anciennes" ? v : "")}
        total={affichees.length} filtreActif={filtreActif} onReset={reinitialiser}/>

      {loading ? (
        <QuestionsSkeleton/>
      ) : erreur && questions.length === 0 ? (
        <QuestionsMessage C={C} titre="Impossible de charger les questions" texte="Vérifiez votre connexion puis réessayez."
          icone={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
          action={{ label: "Réessayer", onClick: load }}/>
      ) : questions.length === 0 ? (
        <QuestionsMessage C={C} titre="Aucune question pour le moment" texte="Les questions des citoyens apparaîtront ici avant leur prise de rendez-vous."
          icone={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7"/><line x1="12" y1="15.5" x2="12.01" y2="15.5"/></svg>}/>
      ) : affichees.length === 0 && filtre === "en_attente" && s === "" ? (
        <QuestionsMessage C={C} titre="Tout est à jour" texte="Aucune question n'attend de réponse."
          icone={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}/>
      ) : affichees.length === 0 ? (
        <QuestionsMessage C={C} titre="Aucun résultat" texte="Aucune question ne correspond à ces critères."
          icone={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
          action={{ label: "Réinitialiser", onClick: reinitialiser }}/>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {affichees.map(q => (
            <QuestionCard key={q.id} C={C} q={q} maintenant={maintenant} readOnly={readOnly}
              frequente={occurrences.get(cleQuestion(q.question)) ?? 1}
              composerOuvert={ouvertId === q.id} brouillon={brouillons[q.id] ?? ""} envoi={envoiId === q.id}
              onOuvrir={() => setOuvertId(q.id)}
              onChangeBrouillon={v => setBrouillons(prev => ({ ...prev, [q.id]: v }))}
              onAnnuler={() => { setOuvertId(null); setBrouillons(prev => { const n = { ...prev }; delete n[q.id]; return n; }); }}
              onPublier={() => repondre(q.id)}/>
          ))}
        </div>
      )}
    </div>
  );
}
