"use client";

// Écran "Questions des clients" (panneau Mon compte, chantier "Questions
// publiques pré-RDV" façon Booking "Travelers are asking", 24/07/2026) —
// réception des questions posées par les citoyens sur la fiche publique
// (app/institution/[id]/page.tsx, table questions_institution). Une fois
// répondue, la question devient visible publiquement sur la fiche.
// Volontairement séparé de MessagerieTab.tsx (table messages, liée aux
// RDV) — deux systèmes distincts, pas de mélange.
import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";
import { EmptyState } from "@/components/EmptyState";

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

function fmt(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function QuestionsClientsTab({ readOnly, onToast }: { readOnly: boolean; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<(typeof FILTRES)[number]["key"]>("en_attente");
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [envoiId, setEnvoiId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/institution/questions");
    const j = await res.json().catch(() => null);
    setQuestions(res.ok ? (j?.questions ?? []) : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
      load();
    } else {
      onToast("Erreur lors de l'envoi.", C.red);
    }
  }

  const filtered = questions.filter(q => {
    if (filtre === "en_attente") return !q.reponse;
    if (filtre === "repondues") return !!q.reponse;
    return true;
  });
  const nbEnAttente = questions.filter(q => !q.reponse).length;

  return (
    <div style={{ padding: "20px 16px" }}>
      <h2 style={{ color: C.t1, fontSize: "17px", fontWeight: "800", margin: "0 0 4px" }}>Questions des clients</h2>
      <p style={{ color: C.t2, fontSize: "12.5px", margin: "0 0 16px", lineHeight: 1.6 }}>
        Questions publiques posées par des citoyens avant de prendre rendez-vous — une fois que vous y répondez, elles s&apos;affichent sur votre fiche pour aider les prochains visiteurs.
      </p>

      {readOnly && (
        <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px" }}>
          <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: C.orange }}>Lecture seule.</strong> Vous n&apos;avez pas les droits pour répondre depuis cet écran.
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: "7px", marginBottom: "18px" }}>
        {FILTRES.map(f => {
          const active = filtre === f.key;
          const count = f.key === "en_attente" ? nbEnAttente : f.key === "repondues" ? questions.length - nbEnAttente : questions.length;
          return (
            <button key={f.key} onClick={() => setFiltre(f.key)} className="tap" style={{ backgroundColor: active ? C.gold : C.bgCard, border: `1px solid ${active ? C.gold : C.border}`, borderRadius: "20px", padding: "7px 13px", color: active ? "#000" : C.t2, fontSize: "11.5px", fontWeight: active ? 800 : 600, cursor: "pointer" }}>
              {f.label} <span style={{ marginLeft: "4px", fontSize: "9.5px", opacity: 0.8 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: "48px", display: "flex", justifyContent: "center" }}><YelenLoader size={24}/></div>
      ) : filtered.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: questions.length === 0 ? "12px" : "40px 20px", textAlign: "center" }}>
          {questions.length === 0 ? (
            <EmptyState
              variant="questions"
              title="Vos premières questions apparaîtront ici"
              message="Les citoyens peuvent poser des questions publiques sur votre fiche avant de prendre rendez-vous. Vos réponses aideront les prochains visiteurs à mieux vous connaître."
              color={C.gold}
              titleColor={C.t1}
              textColor={C.t3}
            />
          ) : (
            <p style={{ color: C.t2, fontSize: "13px", margin: 0 }}>Aucune question pour ce filtre.</p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filtered.map(q => (
            <Card key={q.id} tokens={toCardTokens(C)} padding="16px">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", gap: "10px" }}>
                <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{q.citoyen_nom}</span>
                <span style={{ color: C.t3, fontSize: "10.5px", flexShrink: 0 }}>{fmt(q.created_at)}</span>
              </div>
              <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, margin: "0 0 10px" }}>{q.question}</p>

              {q.reponse ? (
                <div style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ color: C.gold, fontSize: "10px", fontWeight: "800", marginBottom: "4px" }}>
                    Votre réponse{q.reponse_le ? ` · ${fmt(q.reponse_le)}` : ""} · publique
                  </div>
                  <p style={{ color: C.t2, fontSize: "12.5px", margin: 0, lineHeight: 1.55 }}>{q.reponse}</p>
                </div>
              ) : !readOnly ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={brouillons[q.id] ?? ""}
                    onChange={e => setBrouillons(prev => ({ ...prev, [q.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") repondre(q.id); }}
                    placeholder="Votre réponse (publiée sur la fiche)…"
                    style={{ flex: 1, backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 12px", color: C.t1, fontSize: "12.5px", fontFamily: "inherit" }}
                  />
                  <Button
                    tokens={toUiTokens(C)} className="tap" variant="primary" size="sm"
                    onClick={() => repondre(q.id)}
                    disabled={!(brouillons[q.id] ?? "").trim()}
                    loading={envoiId === q.id}
                    style={{ flexShrink: 0 }}
                  >Répondre</Button>
                </div>
              ) : (
                <p style={{ color: C.t3, fontSize: "11.5px", margin: 0 }}>En attente de réponse.</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
