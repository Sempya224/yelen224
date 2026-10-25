"use client";

// Suivi, côté établissement, des changements sensibles de profil (nom, ville,
// adresse, coordonnées, catégorie + activité principale) — docs/product/
// YELEN_REVERIFICATION_POLICY.md. Publication différée : l'établissement voit SA
// proposition dans son espace ; les citoyens voient la valeur publiée tant que
// l'équipe Yelen n'a pas décidé. Ce bloc dit où en est l'examen, affiche le motif
// d'un refus et — Lot 2 — les demandes de complément de l'équipe Yelen (répétables),
// avec un formulaire de réponse. Les pièces elles-mêmes se déposent dans l'onglet
// Documents existant. Rien n'est affiché tant qu'aucune demande récente n'existe.
// Lecture : GET /api/institution/changements-profil ; réponse : POST
// /api/institution/changements-profil/[id]/repondre (institution issue de la session).
import { useCallback, useEffect, useState } from "react";
import type { ThemeTokens } from "../theme";

type Evenement = { type: "complement_demande" | "complement_fourni"; message: string | null; types_documents_libelles: string[]; created_at: string };
type Demande = {
  id: string; numero: string; champ_libelle: string; ancienne_affichage: string; nouvelle_affichage: string
  statut: "a_examiner" | "examinee"; decision: "conforme" | "a_corriger" | null
  commentaire_admin: string | null; decide_le: string | null; created_at: string
  evenements: Evenement[]; etat_complement: "aucun" | "demande" | "fourni"
};

// Une demande examinée disparaît du suivi après ce délai (« approuvée » : 14 jours,
// « non publiée » : 30 jours, le temps que le responsable agisse).
const JOURS_CONFORME = 14;
const JOURS_A_CORRIGER = 30;

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function ageEnJours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function estAffichee(d: Demande): boolean {
  if (d.statut === "a_examiner") return true;
  const reference = d.decide_le ?? d.created_at;
  return ageEnJours(reference) <= (d.decision === "a_corriger" ? JOURS_A_CORRIGER : JOURS_CONFORME);
}

function dernierEvenement(d: Demande, type: Evenement["type"]): Evenement | undefined {
  return [...d.evenements].filter(e => e.type === type).at(-1);
}

export function ChangementsProfilSuivi({ C, version }: { C: ThemeTokens; version: number }) {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreurReponse, setErreurReponse] = useState<{ id: string; message: string } | null>(null);
  const [rechargement, setRechargement] = useState(0);

  const charger = useCallback(async (annule: () => boolean) => {
    try {
      const res = await fetch("/api/institution/changements-profil");
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      if (!annule() && Array.isArray(body?.demandes)) setDemandes(body.demandes as Demande[]);
    } catch {
      // Le suivi est une information complémentaire : une erreur réseau ne
      // doit jamais bloquer l'écran, le bloc reste simplement absent.
    }
  }, []);

  useEffect(() => {
    let annule = false;
    charger(() => annule);
    return () => { annule = true; };
  }, [version, rechargement, charger]);

  async function repondre(id: string) {
    setEnvoi(id);
    setErreurReponse(null);
    try {
      const res = await fetch(`/api/institution/changements-profil/${id}/repondre`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: (reponses[id] ?? "").trim() || null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErreurReponse({ id, message: body?.error || "Votre réponse n'a pas pu être envoyée. Réessayez." });
        return;
      }
      setReponses(r => ({ ...r, [id]: "" }));
      setRechargement(n => n + 1);
    } catch {
      setErreurReponse({ id, message: "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez." });
    } finally {
      setEnvoi(null);
    }
  }

  const visibles = demandes.filter(estAffichee).slice(0, 6);
  if (visibles.length === 0) return null;

  const enCours = visibles.filter(d => d.statut === "a_examiner").length;
  const aCorriger = visibles.filter(d => d.decision === "a_corriger").length;
  const complementAttendu = visibles.some(d => d.statut === "a_examiner" && d.etat_complement === "demande");

  return (
    <div role="region" aria-label="Suivi de vos changements sensibles" style={{ backgroundColor: C.bgCard, border: `1px solid ${aCorriger > 0 || complementAttendu ? C.orange : C.border2}`, borderRadius: "12px", padding: "14px 16px", marginBottom: "20px" }}>
      <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>Suivi de vos changements</div>
      <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.55, marginTop: "3px", marginBottom: "10px" }}>
        {complementAttendu
          ? "L'équipe Yelen attend un complément de votre part. Les citoyens voient toujours l'information précédente."
          : aCorriger > 0
            ? "L'équipe Yelen n'a pas publié une de vos modifications : les citoyens voient toujours l'information précédente. Vous pouvez proposer une nouvelle valeur ci-dessous."
            : enCours > 0
              ? "Vos modifications sont visibles dans votre espace. Les citoyens voient encore l'information précédente jusqu'à la validation par l'équipe Yelen."
              : "L'équipe Yelen a examiné vos dernières modifications."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {visibles.map(d => {
          const complementDemande = dernierEvenement(d, "complement_demande");
          const attendu = d.statut === "a_examiner" && d.etat_complement === "demande";
          const fourni = d.statut === "a_examiner" && d.etat_complement === "fourni";
          const etat = d.statut === "a_examiner"
            ? attendu
              ? { label: "Complément demandé", color: C.orange }
              : fourni
                ? { label: "Complément envoyé", color: C.gold }
                : { label: "En cours d'examen", color: C.gold }
            : d.decision === "conforme"
              ? { label: "Approuvée et publiée", color: C.green }
              : { label: "Non publiée", color: C.orange };
          return (
            <div key={d.id} style={{ borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: etat.color, fontSize: "11px", fontWeight: "700" }}>
                  <span aria-hidden style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: etat.color }}/>
                  {etat.label}
                </span>
                <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "600" }}>{d.champ_libelle}</span>
                <span style={{ color: C.t3, fontSize: "11px" }}>
                  {d.statut === "a_examiner" ? `Modifié le ${dateCourte(d.created_at)}` : `Examiné le ${dateCourte(d.decide_le ?? d.created_at)}`}
                </span>
              </div>
              <div style={{ color: C.t2, fontSize: "12px", marginTop: "3px", wordBreak: "break-word" }}>
                {d.ancienne_affichage} <span aria-hidden>→</span><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> devient </span> <strong style={{ color: C.t1 }}>{d.nouvelle_affichage}</strong>
              </div>
              {d.decision === "a_corriger" && d.commentaire_admin && (
                <div style={{ marginTop: "6px", backgroundColor: `${C.orange}14`, border: `1px solid ${C.orange}35`, borderRadius: "8px", padding: "8px 10px", color: C.t1, fontSize: "12px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {d.commentaire_admin}
                </div>
              )}
              {attendu && complementDemande && (
                <div style={{ marginTop: "6px", backgroundColor: `${C.orange}14`, border: `1px solid ${C.orange}35`, borderRadius: "8px", padding: "10px 12px" }}>
                  <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>L&apos;équipe Yelen demande un complément</div>
                  <div style={{ color: C.t1, fontSize: "12px", lineHeight: 1.5, marginTop: "3px", whiteSpace: "pre-wrap" }}>{complementDemande.message}</div>
                  {complementDemande.types_documents_libelles.length > 0 && (
                    <div style={{ color: C.t2, fontSize: "11.5px", marginTop: "4px" }}>Documents attendus : {complementDemande.types_documents_libelles.join(", ")}.</div>
                  )}
                  <div style={{ color: C.t2, fontSize: "11.5px", marginTop: "4px" }}>
                    Déposez les pièces dans l&apos;onglet Documents (nouvelle version du document concerné), puis confirmez ici.
                  </div>
                  <label style={{ display: "block", color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", margin: "8px 0 4px" }} htmlFor={`rep-${d.id}`}>
                    Votre réponse (facultatif)
                  </label>
                  <textarea
                    id={`rep-${d.id}`}
                    value={reponses[d.id] ?? ""}
                    onChange={e => setReponses(r => ({ ...r, [d.id]: e.target.value }))}
                    maxLength={1000}
                    rows={3}
                    style={{ width: "100%", boxSizing: "border-box", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 10px", color: C.t1, fontSize: "12.5px", fontFamily: "inherit", resize: "none" }}
                  />
                  {erreurReponse?.id === d.id && (
                    <div role="alert" style={{ color: C.red, fontSize: "11.5px", fontWeight: "600", marginTop: "4px" }}>{erreurReponse.message}</div>
                  )}
                  <button
                    type="button"
                    disabled={envoi === d.id}
                    onClick={() => repondre(d.id)}
                    className="tap"
                    style={{ marginTop: "8px", height: "36px", padding: "0 14px", borderRadius: "10px", border: "none", backgroundColor: C.gold, color: "#000", fontSize: "12.5px", fontWeight: "700", cursor: envoi === d.id ? "default" : "pointer", opacity: envoi === d.id ? 0.7 : 1 }}
                  >
                    {envoi === d.id ? "Envoi…" : "J'ai envoyé le complément"}
                  </button>
                </div>
              )}
              {fourni && (
                <div style={{ marginTop: "6px", color: C.t2, fontSize: "11.5px" }}>
                  Votre réponse a été transmise le {dateCourte(dernierEvenement(d, "complement_fourni")?.created_at ?? d.created_at)}. L&apos;équipe Yelen la réexamine.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
