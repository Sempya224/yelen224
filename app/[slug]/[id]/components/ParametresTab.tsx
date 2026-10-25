"use client";

// Session (déconnexion) + Zone dangereuse (suppression de compte), extraites de page.tsx.
// Sécurité du compte / Notifications / Légal ont chacun leur écran dédié
// depuis le chantier d'éclatement de Paramètres (14/09/2026) — voir
// SecuriteCompteTab.tsx / NotificationsTab.tsx / LegalTab.tsx. Compte,
// Apparence et Abonnement restent inline dans layout.tsx (inchangés, pas de
// raison de les déplacer). "Support" retiré (21/09/2026, doublon du popover
// "Aide Yelen" et du ticketing SupportYelenTab).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { LogoutFlow, INSTITUTION_LOGOUT_COPY } from "./LogoutFlow";
import { ReauthModal } from "./ReauthModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const MOTIFS_SUPPRESSION: { key: string; label: string }[] = [
  { key: "trop_cher", label: "C'est trop cher" },
  { key: "pas_assez_rdv", label: "Pas assez de rendez-vous" },
  { key: "autre_solution", label: "J'ai changé de solution" },
  { key: "fermeture", label: "Mon établissement a fermé" },
  { key: "autre", label: "Autre raison" },
];

function SectionCard({ C, id, titre, danger, children }: { C: ThemeTokens; id: string; titre: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ marginBottom: "24px", marginTop: danger ? "40px" : undefined }}>
      <h2 id={id} style={{ color: C.t2, fontSize: "12px", fontWeight: 500, margin: "0 0 8px", padding: "0 4px" }}>{titre}</h2>
      <Card tokens={toCardTokens(C)} noPadding style={{ borderRadius: "12px", ...(danger ? { border: `1px solid ${C.red}30` } : {}) }}>{children}</Card>
    </section>
  );
}

// Ligne de ParametresDangerZone : même gabarit que les lignes de ParametresAccueil
// (pastille d'icône 36 px, libellé 14 px, description 13 px).
function LigneAction({ C, onClick, icone, teinte, label, description }: {
  C: ThemeTokens; onClick: () => void; icone: React.ReactNode; teinte: string; label: string; description?: string;
}) {
  return (
    <button type="button" onClick={onClick} className="prt-row yelen-focus-ring" style={{ width: "100%", minHeight: "64px", display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px", background: "none", border: "none", textAlign: "left", fontFamily: "inherit", cursor: "pointer" }}>
      <span aria-hidden="true" style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: `${teinte}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icone}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 500 }}>{label}</span>
        {description && <span style={{ display: "block", color: C.t2, fontSize: "13px", lineHeight: 1.45, marginTop: "1px" }}>{description}</span>}
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SESSION + ZONE DANGEREUSE — déconnexion, puis suppression de compte
// ═══════════════════════════════════════════════════════════════════════

type DeletionStep = null | "sondage" | "transparence" | "confirmation";

export function ParametresDangerZone({ instName }: { instId: string; instName: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const router = useRouter();

  const [step, setStep] = useState<DeletionStep>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);

  function closeDeletionFlow() {
    setStep(null); setMotif(null); setCommentaire(""); setConfirmInput(""); setDeletionError("");
  }

  async function confirmDeletion() {
    if (!motif) return;
    setDeletionError("");
    if (confirmInput.trim() !== instName.trim()) {
      setDeletionError("Le nom saisi ne correspond pas exactement.");
      return;
    }
    setDeletionLoading(true);
    try {
      const res = await fetch("/api/institution/auth/deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif, commentaire: commentaire.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeletionLoading(false);
        if (data.code === "REAUTH_REQUIRED") { setReauthOpen(true); return; }
        setDeletionError(data.error || "Erreur lors de la demande.");
        return;
      }
      router.push("/institution/connexion?deletion_requested=1");
    } catch {
      setDeletionError("Erreur réseau.");
      setDeletionLoading(false);
    }
  }

  return (
    <>
      <style>{`.prt-row{transition:background-color .14s}.prt-row:hover{background-color:${C.bg3}}@media (prefers-reduced-motion: reduce){.prt-row{transition:none}}`}</style>
      <SectionCard C={C} id="prm-session" titre="Session">
        <LigneAction
          C={C} onClick={() => setLogoutOpen(true)} teinte={C.gold} label="Se déconnecter"
          icone={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>}
        />
      </SectionCard>

      <SectionCard C={C} id="prm-danger" titre="Zone dangereuse" danger>
        <LigneAction
          C={C} onClick={() => setStep("sondage")} teinte={C.red} label="Demander la suppression de mon compte"
          description="Votre demande est enregistrée et traitée par l'équipe Yelen après un délai de 30 jours. Vous pouvez l'annuler pendant ce délai."
          icone={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>}
        />
      </SectionCard>

      {/* ── ÉCRAN PLEIN ÉCRAN DE SUPPRESSION ── */}
      {step && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, backgroundColor: C.bg, overflowY: "auto" }}>
          <div style={{ maxWidth: "520px", margin: "0 auto", padding: "20px 20px 48px" }}>
            <button onClick={step === "sondage" ? closeDeletionFlow : () => setStep(s => s === "confirmation" ? "transparence" : "sondage")} className="tap" style={{ background: "none", border: "none", color: C.t2, display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "700", padding: "8px 0", marginBottom: "16px", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              {step === "sondage" ? "Annuler" : "Retour"}
            </button>

            {step === "sondage" && (
              <>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800", marginBottom: "6px" }}>Avant de partir...</div>
                <div style={{ color: C.t2, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>Aidez-nous à comprendre pourquoi — ça reste entre nous, ça nous aide à améliorer Yelen224.</div>
                <div role="radiogroup" aria-label="Motif de la demande de suppression" style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  {MOTIFS_SUPPRESSION.map(m => (
                    <button type="button" role="radio" aria-checked={motif === m.key} key={m.key} onClick={() => setMotif(m.key)} className="tap yelen-focus-ring" style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left", fontFamily: "inherit", backgroundColor: motif === m.key ? `${C.gold}12` : C.bgCard, border: `1px solid ${motif === m.key ? C.gold + "40" : C.border}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${motif === m.key ? C.gold : C.t2}`, backgroundColor: motif === m.key ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {motif === m.key && <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#000" }} />}
                      </div>
                      <span style={{ color: motif === m.key ? C.t1 : C.t2, fontSize: "13px", fontWeight: motif === m.key ? "700" : "500" }}>{m.label}</span>
                    </button>
                  ))}
                </div>
                {motif === "autre" && (
                  <textarea aria-label="Précisions sur votre motif" value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Dites-nous en plus (optionnel)..." rows={3} style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: C.t1, marginBottom: "16px" }} />
                )}
                <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" fullWidth disabled={!motif} onClick={() => { if (motif) setStep("transparence"); }}>Continuer</Button>
              </>
            )}

            {step === "transparence" && (
              <>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800", marginBottom: "6px" }}>Voici ce qui va se passer</div>
                <div style={{ color: C.t2, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>On préfère être clairs avant de continuer.</div>
                <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { icon: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>, text: "Votre demande est enregistrée et votre session se ferme immédiatement." },
                    { icon: <><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>, text: "Tous vos appareils mémorisés et vos clés d'accès (passkeys) sont révoqués." },
                    { icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>, text: "Un délai de 30 jours s'ouvre. Aucune suppression définitive n'a lieu avant cette date ; elle est ensuite traitée par l'équipe Yelen." },
                    { icon: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>, text: "Vous pouvez annuler à tout moment pendant ce délai en vous reconnectant." },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: "2px" }}>{item.icon}</svg>
                      <span style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>{item.text}</span>
                    </div>
                  ))}
                </div>
                <a href="mailto:support@yelen224.com" style={{ display: "block", textAlign: "center", color: C.gold, fontSize: "12px", fontWeight: "700", textDecoration: "none", padding: "10px", marginBottom: "10px" }}>Besoin d&apos;aide plutôt ? Contactez le support</a>
                <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" fullWidth onClick={() => setStep("confirmation")}>Je comprends, continuer</Button>
              </>
            )}

            {step === "confirmation" && (
              <>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800", marginBottom: "6px" }}>Confirmer la demande de suppression</div>
                <div style={{ color: C.t2, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>
                  Pour confirmer, tapez le nom exact de votre établissement : <strong style={{ color: C.t1 }}>{instName}</strong>
                </div>
                <input value={confirmInput} onChange={e => setConfirmInput(e.target.value)} placeholder={instName} style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
                {deletionError && <div style={{ color: C.red, fontSize: "11px", fontWeight: "700", marginBottom: "10px" }}>{deletionError}</div>}
                <Button tokens={toUiTokens(C)} variant="danger" size="md" fullWidth disabled={confirmInput.trim() !== instName.trim()} loading={deletionLoading} onClick={confirmDeletion} className="tap">
                  Demander la suppression de mon compte
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {logoutOpen && (
        <LogoutFlow
          onClose={() => setLogoutOpen(false)}
          redirectTo="/institution/connexion?logged_out=1"
          copy={INSTITUTION_LOGOUT_COPY}
        />
      )}

      <ReauthModal open={reauthOpen} onClose={() => setReauthOpen(false)} onSuccess={() => { setReauthOpen(false); confirmDeletion(); }}/>
    </>
  );
}
