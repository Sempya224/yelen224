"use client";

// Zone dangereuse (déconnexion + suppression de compte), extraite de page.tsx.
// Sécurité du compte / Notifications / Support / Légal ont chacun leur écran
// dédié depuis le chantier d'éclatement de Paramètres (14/09/2026) — voir
// SecuriteCompteTab.tsx / NotificationsTab.tsx / AideSupportTab.tsx /
// LegalTab.tsx. Compte, Apparence et Abonnement restent inline dans
// layout.tsx (inchangés, pas de raison de les déplacer).
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

function SectionCard({ C, titre, children }: { C: ThemeTokens; titre: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>{titre}</div>
      <Card tokens={toCardTokens(C)} noPadding>{children}</Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ZONE DANGEREUSE — déconnexion + suppression de compte
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
      <SectionCard C={C} titre="Zone dangereuse">
        <button onClick={() => setLogoutOpen(true)} className="tap" style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, padding: "13px 16px", color: C.red, fontWeight: "800", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          Se déconnecter
        </button>
        <button onClick={() => setStep("sondage")} className="tap" style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", color: C.t2, fontWeight: "700", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          Supprimer mon compte
        </button>
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
                <div style={{ color: C.t3, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>Aidez-nous à comprendre pourquoi — ça reste entre nous, ça nous aide à améliorer Yelen224.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  {MOTIFS_SUPPRESSION.map(m => (
                    <div key={m.key} onClick={() => setMotif(m.key)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: motif === m.key ? `${C.gold}12` : C.bgCard, border: `1px solid ${motif === m.key ? C.gold + "40" : C.border}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${motif === m.key ? C.gold : C.t3}`, backgroundColor: motif === m.key ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {motif === m.key && <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#000" }} />}
                      </div>
                      <span style={{ color: motif === m.key ? C.t1 : C.t2, fontSize: "13px", fontWeight: motif === m.key ? "700" : "500" }}>{m.label}</span>
                    </div>
                  ))}
                </div>
                {motif === "autre" && (
                  <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Dites-nous en plus (optionnel)..." rows={3} style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, resize: "none", color: C.t1, marginBottom: "16px" }} />
                )}
                <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" fullWidth disabled={!motif} onClick={() => { if (motif) setStep("transparence"); }}>Continuer</Button>
              </>
            )}

            {step === "transparence" && (
              <>
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800", marginBottom: "6px" }}>Voici ce qui va se passer</div>
                <div style={{ color: C.t3, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>On préfère être clairs avant de continuer.</div>
                <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { icon: "🔒", text: "Votre accès au dashboard est coupé immédiatement." },
                    { icon: "👁", text: "Votre fiche n'est plus visible des citoyens dès maintenant." },
                    { icon: "⏳", text: "Vos données sont définitivement supprimées dans 30 jours." },
                    { icon: "↩️", text: "Vous pouvez annuler à tout moment avant cette date en vous reconnectant." },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "16px", flexShrink: 0 }}>{item.icon}</span>
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
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800", marginBottom: "6px" }}>Confirmer la suppression</div>
                <div style={{ color: C.t3, fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>
                  Pour confirmer, tapez le nom exact de votre établissement : <strong style={{ color: C.t1 }}>{instName}</strong>
                </div>
                <input value={confirmInput} onChange={e => setConfirmInput(e.target.value)} placeholder={instName} style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "13px 14px", fontSize: "14px", color: C.t1, marginBottom: "10px" }} />
                {deletionError && <div style={{ color: C.red, fontSize: "11px", fontWeight: "700", marginBottom: "10px" }}>{deletionError}</div>}
                <Button tokens={toUiTokens(C)} variant="danger" size="md" fullWidth disabled={confirmInput.trim() !== instName.trim()} loading={deletionLoading} onClick={confirmDeletion} className="tap">
                  Supprimer définitivement mon compte
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
