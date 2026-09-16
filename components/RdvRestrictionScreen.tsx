"use client";

// Écran de restriction automatique des rendez-vous (no-show), décision CEO
// 03/09/2026. Deux gabarits dans le même composant :
// - restreint_7j / restreint_30j : X visible (ferme l'écran, le citoyen
//   continue d'utiliser Yelen normalement — seule la création de nouveaux
//   rendez-vous/réservations est bloquée, vérifiée côté serveur à chaque
//   tentative, voir app/rdv/[id]/actions.ts::createRdv et la policy RLS
//   INSERT sur `rdv`/`paid_bookings`).
// - clos : aucun X, seule issue "Faire appel". Le compte lui-même n'est
//   jamais globalement suspendu (aucune colonne touchée sur `users`) — seule
//   la prise de rendez-vous reste bloquée, y compris après clôture.
//
// Même gabarit plein écran que le reste de app/rdv/[id]/page.tsx (position
// fixed inset:0 sur C.pageBg, header sticky, X carré à gauche — jamais une
// carte flottante sur overlay noir, voir ExitIntentModal dans ce même
// dossier) et même palette (accent #F5A623 uniquement, jamais de fond héros
// noir).
import { useMemo, useState } from "react";
import type { ThemeTokens } from "@/lib/theme";
import { RDV_ABSENCE_SEUILS, RDV_RESTRICTION_DUREE_JOURS, type RdvRestrictionNiveau } from "@/lib/rdvRestrictionsConstants";

export type RdvRestrictionAppelInfo = {
  reference: string;
  statut: "en_attente" | "acceptee" | "rejetee";
  message: string;
  createdAt: string;
  decisionMotif: string | null;
  decisionLe: string | null;
};

export type RdvRestrictionData = {
  reference: string;
  niveau: RdvRestrictionNiveau;
  absencesTotal: number;
  jusquAu: string | null;
  rendezVousConcernes: { id: string; dateRdv: string; institution: string }[];
  appel: RdvRestrictionAppelInfo | null;
};

function fmtDateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtDateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtCompteARebours(jusquAu: string): string {
  const ms = new Date(jusquAu).getTime() - Date.now();
  if (ms <= 0) return "d'un instant à l'autre";
  const jours = Math.floor(ms / 86400000);
  const heures = Math.floor((ms % 86400000) / 3600000);
  if (jours > 0) return `${jours} jour${jours > 1 ? "s" : ""}${heures > 0 ? ` ${heures} h` : ""}`;
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${heures} h${minutes > 0 ? ` ${minutes} min` : ""}`;
}

const PALIERS = [
  { niveau: "restreint_7j" as const, label: "Restriction des rendez-vous pendant 7 jours" },
  { niveau: "restreint_30j" as const, label: "Restriction des rendez-vous pendant 30 jours" },
  { niveau: "clos" as const, label: "Clôture définitive de l'accès aux rendez-vous" },
];

function Section({ C, title, children }: { C: ThemeTokens; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ color: C.text, fontSize: "13px", fontWeight: "800", marginBottom: "10px" }}>{title}</div>
      {children}
    </div>
  );
}

export function RdvRestrictionScreen({
  C, isDark, data, onClose, accessToken, onAppelEnvoye,
}: {
  C: ThemeTokens;
  isDark: boolean;
  data: RdvRestrictionData;
  onClose: () => void;
  accessToken: string;
  onAppelEnvoye: (appel: RdvRestrictionAppelInfo) => void;
}) {
  const estTemporaire = data.niveau !== "clos";
  const inputBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBord = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const rangCourant = useMemo(() => PALIERS.findIndex((p) => p.niveau === data.niveau), [data.niveau]);

  async function soumettreAppel() {
    if (message.trim().length < 10) { setErreur("Merci de détailler votre demande (10 caractères minimum)."); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/citoyen/rdv-restriction/appel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message: message.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setErreur(json.error || "Une erreur est survenue."); return; }
      onAppelEnvoye({
        reference: json.reference, statut: "en_attente", message: message.trim(),
        createdAt: new Date().toISOString(), decisionMotif: null, decisionLe: null,
      });
    } catch {
      setErreur("Une erreur est survenue. Réessayez dans un instant.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: C.pageBg, overflowY: "auto", color: C.text, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.borderCard}`, padding: "env(safe-area-inset-top) 16px 0" }}>
        <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          {estTemporaire ? (
            <button onClick={onClose} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: inputBg, border: `1px solid ${inputBord}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          ) : <div/>}
          <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>{estTemporaire ? "Accès aux rendez-vous" : "Compte clôturé"}</div>
          <div/>
        </div>
      </header>

      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "50%", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", background: estTemporaire ? "rgba(245,166,35,0.12)" : "rgba(239,68,68,0.12)" }}>
          {estTemporaire ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.6" fill="#ef4444"/></svg>
          )}
        </div>

        <h1 style={{ fontSize: "20px", fontWeight: "900", textAlign: "center", margin: "0 0 12px", letterSpacing: "-0.3px" }}>
          {estTemporaire ? "Votre accès aux rendez-vous est temporairement limité" : "Votre compte a été clôturé"}
        </h1>
        <p style={{ color: C.textSubtle, fontSize: "13.5px", lineHeight: 1.7, textAlign: "center", margin: "0 0 24px" }}>
          {estTemporaire
            ? `Votre compte ne peut actuellement pas effectuer de nouvelles réservations, car ${data.absencesTotal} rendez-vous ont été enregistrés comme non honorés.`
            : `Votre compte Yelen a été clôturé après l'enregistrement de ${data.absencesTotal} rendez-vous non honorés. Cette décision entraîne la clôture définitive de votre accès à la prise de rendez-vous et aux réservations sur Yelen.`}
        </p>

        {estTemporaire && data.jusquAu && (
          <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "16px", padding: "20px", textAlign: "center", marginBottom: "24px" }}>
            <div style={{ color: "#F5A623", fontSize: "26px", fontWeight: "900" }}>{RDV_RESTRICTION_DUREE_JOURS[data.niveau as "restreint_7j" | "restreint_30j"]} jours</div>
            <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", marginTop: "6px" }}>Votre accès aux rendez-vous sera rétabli le {fmtDateLongue(data.jusquAu)}.</div>
            <div style={{ color: C.textSubtle, fontSize: "12px", marginTop: "4px" }}>Réactivation dans {fmtCompteARebours(data.jusquAu)}</div>
          </div>
        )}

        <Section C={C} title="Pourquoi ?">
          <p style={{ color: C.textSubtle, fontSize: "13px", lineHeight: 1.7, margin: 0 }}>
            Lorsqu&apos;un rendez-vous confirmé n&apos;est pas honoré et qu&apos;il est enregistré comme « Absent » après l&apos;heure prévue, il est comptabilisé dans votre historique de rendez-vous non honorés.
          </p>
        </Section>

        {data.rendezVousConcernes.length > 0 && (
          <Section C={C} title={`Votre historique — ${data.absencesTotal} rendez-vous non honorés`}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {data.rendezVousConcernes.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "10px 12px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "10px" }}>
                  <span style={{ color: C.text, fontSize: "12.5px", fontWeight: "700" }}>{r.institution}</span>
                  <span style={{ color: C.textSubtle, fontSize: "12px" }}>{fmtDateLongue(r.dateRdv)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section C={C} title="Rappel des seuils">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {PALIERS.map((p, i) => {
              const actif = i === rangCourant;
              return (
                <div key={p.niveau} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", background: actif ? (isDark ? "rgba(245,166,35,0.10)" : "rgba(245,166,35,0.10)") : "transparent", border: actif ? "1px solid rgba(245,166,35,0.35)" : `1px solid ${inputBord}` }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: actif ? "#F5A623" : inputBg, color: actif ? "#080812" : C.textSubtle, fontSize: "11px", fontWeight: "900" }}>
                    {RDV_ABSENCE_SEUILS[p.niveau]}
                  </div>
                  <span style={{ color: actif ? C.text : C.textSubtle, fontSize: "12.5px", fontWeight: actif ? "800" : "600" }}>{p.label}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <div style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderRadius: "14px", padding: "14px 16px", marginBottom: "8px" }}>
          <p style={{ color: C.textSubtle, fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>
            Cette restriction concerne uniquement les rendez-vous et réservations. Vous pouvez continuer à utiliser les autres fonctionnalités disponibles sur Yelen.
          </p>
        </div>

        {!estTemporaire && (
          <div style={{ marginTop: "24px" }}>
            {data.appel && data.appel.statut === "en_attente" ? (
              <div style={{ background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "14px", padding: "16px" }}>
                <div style={{ color: C.text, fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>Votre demande d&apos;appel est en cours d&apos;examen</div>
                <div style={{ color: C.textSubtle, fontSize: "12px" }}>Référence {data.appel.reference} — envoyée le {fmtDateHeure(data.appel.createdAt)}. Vous recevrez une notification dès qu&apos;une décision aura été prise.</div>
              </div>
            ) : (
              <>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", marginBottom: "6px" }}>Vous pensez qu&apos;une erreur s&apos;est produite ?</div>
                <p style={{ color: C.textSubtle, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 12px" }}>
                  Si vous estimez que certains rendez-vous ont été incorrectement enregistrés comme non honorés, vous pouvez demander l&apos;examen de votre dossier.
                </p>
                {data.appel && data.appel.statut === "rejetee" && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "10px 12px", marginBottom: "12px" }}>
                    <div style={{ color: "#ef4444", fontSize: "12px", fontWeight: "700" }}>Demande précédente refusée</div>
                    {data.appel.decisionMotif && <div style={{ color: C.textSubtle, fontSize: "12px", marginTop: "3px" }}>Motif : {data.appel.decisionMotif}</div>}
                  </div>
                )}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Expliquez pourquoi vous contestez cette clôture…"
                  rows={4}
                  style={{ width: "100%", padding: "11px 13px", borderRadius: "10px", border: `1px solid ${inputBord}`, background: inputBg, color: C.text, fontSize: "13px", resize: "none", marginBottom: "10px" }}
                />
                {erreur && <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "10px" }}>{erreur}</div>}
                <button onClick={soumettreAppel} disabled={envoi} className="tap" style={{ width: "100%", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: envoi ? "default" : "pointer", opacity: envoi ? 0.7 : 1 }}>
                  {envoi ? "Envoi…" : "Faire appel"}
                </button>
              </>
            )}
          </div>
        )}

        {estTemporaire && (
          <button onClick={onClose} className="tap" style={{ width: "100%", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", marginTop: "8px" }}>
            Fermer
          </button>
        )}
      </div>
      <style>{`.tap{transition:opacity .1s,transform .1s}.tap:active{opacity:.7;transform:scale(.98)}`}</style>
    </div>
  );
}
