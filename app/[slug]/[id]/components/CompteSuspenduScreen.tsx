"use client";

// Écran dédié "Espace suspendu" v2 (décision CEO 17/08/2026) — remplace
// intégralement Vue d'ensemble (page.tsx bloque aussi la navigation vers
// les autres onglets, voir ALLOWED_TABS_SUSPENDU). Refonte "centre de
// résolution" (ton non-punitif, statut structuré, système de révision)
// suite au brief CEO inspiré des pratiques Google/Stripe.
//
// Toutes les données viennent de GET /api/institution/suspension (voir
// migration 20260817000001_institution_suspensions_revisions.sql) —
// aucune donnée inventée : pas de "politique concernée" (aucune taxonomie
// de règles n'existe), pas de date de fin fabriquée (jusquAu réel ou
// "indéfinie"), pas de référence fabriquée (générée en base par séquence).
//
// ⚠️ Cas "suspension non tracée" : une institution suspendue AVANT cette
// migration n'a aucune ligne institution_suspensions (data.reference/
// motif restent null) — le formulaire de révision ne doit jamais
// s'afficher dans ce cas (rien à rattacher la demande), sinon la
// soumission échoue après coup avec une erreur confuse (bug réel trouvé
// par Bryan le 17/08/2026 en testant une institution suspendue avant ce
// chantier). Une nouvelle suspension (via l'admin, code déployé ce jour)
// crée toujours la ligne, ce cas disparaît naturellement avec le temps.
import { useCallback, useEffect, useState } from "react";
import type { ThemeTokens } from "../theme";
import { toUiTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { YelenLogo } from "@/components/YelenLogo";
import { Button } from "@/components/ui/Button";

type Revision = {
  reference: string; statut: "en_attente" | "acceptee" | "rejetee"; message: string;
  createdAt: string; decisionMotif: string | null; decisionLe: string | null;
};
type SuspensionData = {
  suspended: boolean; motif: string | null; reference: string | null;
  createdAt: string | null; jusquAu: string | null; revision: Revision | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function fmtDateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function IconShield({ C }: { C: ThemeTokens }) {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <circle cx="12" cy="16" r="0.6" fill={C.red} />
    </svg>
  );
}

function Section({ C, title, children }: { C: ThemeTokens; title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px 20px", marginBottom: "14px" }}>
      <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "10px" }}>{title}</div>
      {children}
    </div>
  );
}

function StatutLigne({ C, label, value, ok }: { C: ThemeTokens; label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600 }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: ok ? C.green : C.red, fontSize: "12px", fontWeight: 800 }}>
        <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: ok ? C.green : C.red }} />
        {value}
      </span>
    </div>
  );
}

function FaqItem({ C, q, a }: { C: ThemeTokens; q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 0" }}>
      <button onClick={() => setOpen(v => !v)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
        <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{q}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, marginTop: "8px", marginBottom: 0 }}>{a}</p>}
    </div>
  );
}

export function CompteSuspenduScreen({ C, instName, onOuvrirMessagerie, onOuvrirParametres }: {
  C: ThemeTokens; instName: string;
  onOuvrirMessagerie: () => void;
  onOuvrirParametres: () => void;
}) {
  const [data, setData] = useState<SuspensionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [messageRevision, setMessageRevision] = useState("");
  const [envoiErreur, setEnvoiErreur] = useState<string | null>(null);
  // Confirmation de marque juste après l'envoi (retour Bryan 17/08/2026) —
  // le formulaire disparaît immédiatement au profit de cette carte (garde-
  // fou anti-double-envoi structurel : plus de bouton à recliquer), avant
  // même que le rechargement des données ne confirme l'état "en_attente"
  // réel. N'affecte que cette section, jamais tout l'écran.
  const [justSubmitted, setJustSubmitted] = useState(false);
  const uiTokens = toUiTokens(C);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/institution/suspension");
      if (!r.ok) throw new Error();
      const j = await r.json();
      setData(j);
      setErreur(false);
    } catch {
      setErreur(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  async function soumettreRevision() {
    setEnvoiErreur(null);
    const res = await fetch("/api/institution/suspension/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messageRevision.trim() }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { setEnvoiErreur(j?.error || "Erreur lors de l'envoi de votre demande."); return; }
    setMessageRevision("");
    setJustSubmitted(true);
    await charger();
  }

  if (loading) {
    return <div style={{ padding: "60px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={26} /></div>;
  }

  const revision = data?.revision ?? null;
  // Aucune ligne institution_suspensions trouvée (suspension antérieure à
  // ce chantier, ou institution jamais suspendue via le code actuel) — la
  // révision ne peut être rattachée à rien, le formulaire doit rester caché.
  const suiviIndisponible = !data?.reference;

  return (
    <div className="susp-page" style={{ maxWidth: "980px", margin: "0 auto", padding: "8px 0 60px", animation: "fadeUp 0.2s ease" }}>
      <style>{`
        @media (min-width: 1024px) {
          .susp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
          .susp-grid > div { margin-bottom: 0 !important; }
        }
      `}</style>

      {/* ── Hero (ton non-punitif, brief CEO 17/08/2026) ── */}
      <div style={{ textAlign: "center", padding: "28px 16px 8px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
          <IconShield C={C} />
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: `${C.red}15`, color: C.red, fontSize: "10.5px", fontWeight: 800, padding: "4px 12px", borderRadius: "20px", marginBottom: "12px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.red }} />
          ACCÈS PUBLIC SUSPENDU
        </div>
        <h1 style={{ color: C.t1, fontSize: "20px", fontWeight: 900, letterSpacing: "-0.3px", margin: "0 0 8px" }}>
          Votre établissement est temporairement indisponible aux citoyens
        </h1>
        <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, maxWidth: "460px", margin: "0 auto" }}>
          {instName ? `Une mesure a été appliquée à ${instName}.` : "Une mesure a été appliquée à votre établissement."} Votre espace professionnel reste accessible — comprenez ce qui a motivé cette décision et suivez ci-dessous ce que vous pouvez faire.
        </p>
      </div>

      {erreur && (
        <Section C={C} title="Impossible de charger les détails">
          <p style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>
            Une erreur réseau empêche de charger les détails de la suspension pour l&apos;instant. Réessayez dans un instant, ou contactez le support.
          </p>
        </Section>
      )}

      {!erreur && data && (
        <>
          <div className="susp-grid">
            <div>
              {/* ── Motif — accent visuel distinct (retour Bryan 17/08/2026 :
                  "on distingue bien la raison" mais la carte neutre ne
                  faisait ressentir aucune gravité) — même ton respectueux,
                  juste un traitement visuel qui marque le sérieux du motif. ── */}
              <div style={{ backgroundColor: `${C.red}0d`, border: `1px solid ${C.red}30`, borderRadius: "16px", padding: "18px 20px", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <span style={{ color: C.red, fontSize: "13.5px", fontWeight: 800 }}>Pourquoi cette mesure ?</span>
                </div>
                {data.motif ? (
                  <p style={{ color: C.t1, fontSize: "13px", lineHeight: 1.6, margin: 0, fontWeight: 600 }}>{data.motif}</p>
                ) : (
                  <p style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>
                    Aucun motif détaillé n&apos;a pu être retrouvé automatiquement. Contactez le support pour connaître la raison exacte.
                  </p>
                )}
              </div>

              {/* ── Ce qui change ── */}
              <Section C={C} title="Ce qui change">
                <div>
                  <StatutLigne C={C} label="Visibilité citoyenne" value="Suspendue" ok={false} />
                  <StatutLigne C={C} label="Nouvelles réservations" value="Suspendues" ok={false} />
                  <StatutLigne C={C} label="Espace professionnel" value="Accessible" ok />
                  <div style={{ paddingTop: "9px" }}>
                    <StatutLigne C={C} label="Données de votre compte" value="Conservées" ok />
                  </div>
                </div>
              </Section>

              {/* ── Statut structuré (durée réelle, jamais inventée) ── */}
              <Section C={C} title="Durée de la mesure">
                <div>
                  <StatutLigne C={C} label="Statut" value="Active" ok={false} />
                  {data.createdAt && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600 }}>Début</span>
                      <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700 }}>{fmtDate(data.createdAt)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: data.reference ? `1px solid ${C.border}` : "none" }}>
                    <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600 }}>Fin prévue</span>
                    <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700 }}>{data.jusquAu ? fmtDate(data.jusquAu) : "Jusqu'à réactivation manuelle"}</span>
                  </div>
                  {data.reference && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0 0" }}>
                      <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600 }}>Référence</span>
                      <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700, fontFamily: "monospace" }}>{data.reference}</span>
                    </div>
                  )}
                </div>
              </Section>
            </div>

            <div>
              {/* ── Système de révision ── */}
              <Section C={C} title="Demander une révision">
                {suiviIndisponible ? (
                  <p style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>
                    Cette suspension a été appliquée avant la mise en place du suivi de dossier — aucune demande de révision ne peut être associée automatiquement. Contactez directement le support en indiquant le nom de votre établissement.
                  </p>
                ) : revision?.statut === "en_attente" ? (
                  <div style={{ animation: justSubmitted ? "fadeUp 0.35s ease" : undefined }}>
                    {/* Confirmation de marque (retour Bryan 17/08/2026) — remplace le
                        formulaire immédiatement, seule cette carte change (pas tout
                        l'écran), fond doré Yelen + illustration, double rôle :
                        confirmation ET garde-fou anti-double-envoi (le formulaire a
                        disparu, rien à recliquer). */}
                    <div style={{ textAlign: "center", backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}35`, borderRadius: "14px", padding: "20px 16px", marginBottom: "12px" }}>
                      <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: `${C.gold}20`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                        <YelenLogo size={24} color={C.gold} />
                      </div>
                      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, marginBottom: "4px" }}>Nous avons bien reçu votre demande</div>
                      <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6 }}>Notre équipe l&apos;examine actuellement — vous serez notifié dès qu&apos;une décision sera prise.</div>
                    </div>
                    <StatutLigne C={C} label="Référence" value={revision.reference} ok />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0 0" }}>
                      <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600 }}>Demande envoyée</span>
                      <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700 }}>{fmtDateHeure(revision.createdAt)}</span>
                    </div>
                    <p style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6, marginTop: "10px", marginBottom: 0 }}>
                      Vous n&apos;avez pas besoin de soumettre une nouvelle demande pendant l&apos;examen de votre dossier.
                    </p>
                  </div>
                ) : (
                  <>
                    {revision?.statut === "rejetee" && (
                      <div style={{ backgroundColor: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "12px" }}>
                        <div style={{ color: C.red, fontSize: "12.5px", fontWeight: 800, marginBottom: "4px" }}>Précédente demande refusée</div>
                        <div style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6 }}>{revision.decisionMotif || "Aucun motif communiqué."}</div>
                      </div>
                    )}
                    <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 10px" }}>
                      Si vous pensez que cette décision résulte d&apos;une erreur, ou si vous souhaitez apporter des informations complémentaires, vous pouvez demander une nouvelle vérification de votre dossier.
                    </p>
                    <textarea
                      value={messageRevision}
                      onChange={e => setMessageRevision(e.target.value)}
                      placeholder="Expliquez votre situation ou apportez des éléments utiles à l'examen de votre dossier..."
                      rows={4}
                      style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, resize: "vertical", boxSizing: "border-box", marginBottom: "10px" }}
                    />
                    {envoiErreur && <p style={{ color: C.red, fontSize: "12px", fontWeight: 700, margin: "0 0 10px" }}>{envoiErreur}</p>}
                    <Button tokens={uiTokens} variant="primary" size="lg" fullWidth disabled={messageRevision.trim().length < 10} onClick={soumettreRevision}>
                      Demander une révision
                    </Button>
                  </>
                )}
              </Section>

              {/* ── Accessible pendant la suspension ── */}
              <Section C={C} title="Ce qui reste accessible">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button onClick={onOuvrirMessagerie} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>Messagerie</span>
                    <span style={{ color: C.t3, fontSize: "10.5px" }}>Suivre vos conversations avec les citoyens</span>
                  </button>
                  <button onClick={onOuvrirParametres} className="tap" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>Paramètres &amp; Compte</span>
                    <span style={{ color: C.t3, fontSize: "10.5px" }}>Sécurité, équipe, informations</span>
                  </button>
                </div>
              </Section>

              {/* ── Prévention ── */}
              <Section C={C} title="Comment éviter que cela se reproduise">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    "Respectez les conditions d'utilisation Yelen224 acceptées à l'inscription.",
                    "Traitez les rendez-vous et demandes citoyennes dans des délais raisonnables.",
                    "Maintenez vos informations (documents, coordonnées) à jour et exactes.",
                    "Répondez rapidement à tout avertissement reçu avant qu'il n'entraîne une suspension.",
                  ].map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "2px" }}><polyline points="20 6 9 17 4 12" /></svg>
                      <span style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{t}</span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </div>

          {/* ── FAQ ── */}
          <Section C={C} title="Questions fréquentes">
            <FaqItem C={C} q="Pourquoi mon établissement a-t-il été suspendu ?"
              a="Le motif exact, quand il est disponible, est indiqué dans la section « Pourquoi cette mesure ? » ci-dessus. Si aucun motif ne s'affiche, contactez le support." />
            <FaqItem C={C} q="Combien de temps dure une suspension ?"
              a="Si une durée a été fixée, elle est indiquée dans la section « Durée de la mesure » ci-dessus (Fin prévue). Sinon, la suspension reste active jusqu'à réactivation manuelle ou acceptation d'une révision — le contact avec le support reste le moyen le plus rapide de connaître l'état de votre dossier." />
            <FaqItem C={C} q="Mes rendez-vous et données sont-ils perdus ?"
              a="Non. La suspension ne supprime ni ne modifie vos données — elle rend seulement votre établissement invisible des citoyens et bloque temporairement l'accès aux autres onglets." />
            <FaqItem C={C} q="Comment savoir que ma suspension a été levée ?"
              a="Vous recevrez une notification Yelen224 dès la réactivation, et cet écran disparaît automatiquement au prochain chargement du tableau de bord." />
          </Section>
        </>
      )}

      {/* ── Assistance ── */}
      <Section C={C} title="Besoin d'aide ?">
        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 12px" }}>Notre équipe peut vous accompagner pour comprendre et résoudre cette situation.</p>
        <a href="mailto:support@yelen224.com" className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, color: C.t1, fontWeight: 800, fontSize: "13px", padding: "13px", borderRadius: "12px", textDecoration: "none" }}>
          Contacter l&apos;assistance
        </a>
      </Section>
    </div>
  );
}
