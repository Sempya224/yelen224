"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";

type Paiement = {
  id: string;
  reference: string;
  statut: string;
  date_rdv: string;
  heure_rdv: string;
  montant: number;
  montant_declare_citoyen: number | null;
  declare_le: string | null;
  traite_le: string | null;
  created_at: string;
  service_nom: string;
  institution_nom: string;
  institution_logo: string | null;
  recu: { id: string; receipt_id: string } | null;
};

function formatPrix(p: number): string {
  return Math.round(p).toLocaleString("fr-FR") + " " + DEVISE_LABEL;
}

function formatDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateHeure(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Alignée sur app/mon-qr/page.tsx::paiementInfo() — même statut_paid_booking,
// même sémantique de couleur partout dans l'app (vert = argent réglé en
// votre faveur, doré = action/attente, rouge = absence, gris = neutre).
// "Remboursé" était en violet (#a855f7, jamais un statut sémantique — cette
// couleur ne sert qu'à des catégories décoratives ailleurs, ex. secteur
// beauté/bien-être) et "Absent" divergeait du libellé "Absence constatée"
// utilisé sur Mon QR — corrigés pour cohérence (finition 24/08/2026).
function statutInfo(p: Paiement): { label: string; color: string; bg: string } {
  if (p.statut === "en_attente" && p.declare_le) return { label: "En attente de confirmation", color: "#080812", bg: "#F5A623" };
  if (p.statut === "en_attente") return { label: "Paiement en attente", color: "#080812", bg: "#F5A623" };
  if (p.statut === "confirme" || p.statut === "termine") return { label: "Payé", color: "#22c55e", bg: "rgba(34,197,94,0.12)" };
  if (p.statut === "no_show") return { label: "Absence constatée", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (p.statut === "annule") return { label: "Annulé", color: "#8E8E93", bg: "rgba(142,142,147,0.12)" };
  if (p.statut === "rembourse") return { label: "Remboursé", color: "#22c55e", bg: "rgba(34,197,94,0.12)" };
  return { label: p.statut, color: "#8E8E93", bg: "rgba(142,142,147,0.12)" };
}

function initiales(nom: string): string {
  return nom.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// Illustration Yelen pour l'état vide (même langage que ClockInShiftTab.tsx :
// une scène en ligne, un seul accent doré) + message humain.
function IllustrationRecuVide({ isDark }: { isDark: boolean }) {
  const muted = isDark ? "#48484A" : "#D1D1D6";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill="rgba(245,166,35,0.06)"/>
      <circle cx="48" cy="48" r="28" stroke={muted} strokeWidth="2" strokeDasharray="4 5"/>
      <rect x="30" y="34" width="36" height="34" rx="6" fill={card} stroke={muted} strokeWidth="2"/>
      <path d="M36 44h24M36 52h24M36 60h14" stroke={muted} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="66" cy="64" r="11" fill={card} stroke="#F5A623" strokeWidth="2.2"/>
      <path d="M66 59v10M61 64h10" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function PaiementsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [paiements, setPaiements] = useState<Paiement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [telechargement, setTelechargement] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [historiqueOuvert, setHistoriqueOuvert] = useState<Paiement | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
    const res = await fetch("/api/citoyen/paiements", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) { showToast(json?.error ?? "Impossible de charger vos paiements.", "error"); return; }
    setPaiements(json.paiements);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [router, charger]);

  // Deep-link "?paiement=<id>" (venant de la fiche RDV, bouton "Télécharger
  // le reçu") — ouvre la même fiche qu'un clic manuel sur la carte, une
  // fois seulement (searchParams change de référence à chaque re-render).
  useEffect(() => {
    if (!paiements) return;
    const id = searchParams.get("paiement");
    if (!id) return;
    const match = paiements.find(p => p.id === id);
    if (match) setHistoriqueOuvert(match);
  }, [paiements, searchParams]);

  // Copier la référence — action native légère (point 3 du brief),
  // uniquement sur une donnée déjà affichée, jamais un identifiant fabriqué.
  async function copierReference(valeur: string) {
    try {
      await navigator.clipboard.writeText(valeur);
      showToast("Référence copiée");
    } catch {
      showToast("Impossible de copier", "error");
    }
  }

  async function telechargerRecu(p: Paiement) {
    if (!p.recu) return;
    // Fenêtre ouverte de façon synchrone dans la pile du clic — un window.open()
    // déclenché après un await est bloqué silencieusement par les bloqueurs de
    // popup (Safari iOS notamment) : rien ne se passe, aucune erreur visible.
    const fenetre = window.open("", "_blank");
    setTelechargement(p.id);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); setTelechargement(null); fenetre?.close(); return; }
    const res = await fetch(`/api/citoyen/recus/${p.recu.id}/pdf`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    setTelechargement(null);
    if (!res.ok || !json?.signedUrl) { showToast(json?.error || "Reçu indisponible", "error"); fenetre?.close(); return; }
    if (fenetre) fenetre.location.href = json.signedUrl;
    else window.open(json.signedUrl, "_blank");
  }

  if (loading) {
    return <CompteLoadingScreen titre="Mes paiements"/>;
  }

  const liste = paiements ?? [];
  // Résumé financier discret (point 6 du brief) — uniquement les deux
  // compteurs demandés, dérivés des statuts réels déjà affichés sur les
  // cartes, jamais une statistique inventée.
  const nbPayes = liste.filter(p => p.statut === "confirme" || p.statut === "termine").length;
  const nbEnAttente = liste.filter(p => p.statut === "en_attente").length;

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUpSheet{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <CompteHeader titre="Mes paiements"/>
      <PullToRefresh onRefresh={charger} isDark={isDark}>
      <main style={{ padding: "16px 16px 40px" }}>
        <div style={{ padding: "4px 4px 20px" }}>
          <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5 }}>Historique de vos réservations payantes et de vos reçus Yelen.</p>
          {liste.length > 0 && (
            <p style={{ color: t3, fontSize: "11.5px", margin: "6px 0 0", fontWeight: 600 }}>
              {nbPayes} payé{nbPayes > 1 ? "s" : ""} · {nbEnAttente} en attente
            </p>
          )}
        </div>

        {liste.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}><IllustrationRecuVide isDark={isDark}/></div>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Rien à voir ici pour l&apos;instant</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, maxWidth: "280px", margin: "0 auto" }}>Dès votre premier service payant réservé, son suivi et son reçu apparaîtront ici.</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {liste.map((p) => {
            const st = statutInfo(p);
            // Référence de PAIEMENT (recus.receipt_id, format YL-{année}-{compteur})
            // quand un reçu existe réellement — sinon repli sur la référence
            // de RÉSERVATION (confirmation_code). Jamais un identifiant
            // fabriqué : on distingue plutôt clairement lequel des deux
            // c'est (point 2/3 du brief).
            const refValeur = p.recu?.receipt_id ?? p.reference;
            const refLabel = p.recu ? "Référence de paiement" : "Réf. réservation";
            return (
              // Carte entièrement cliquable → détail natif déjà existant
              // (sheet "Voir l'historique"), point 5 du brief. Les actions
              // internes (copier, télécharger) stoppent la propagation pour
              // ne pas ouvrir le sheet en même temps.
              <div key={p.id} onClick={() => setHistoriqueOuvert(p)} className="tap" style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", cursor: "pointer" }}>
                <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                  <div style={{ width: "42px", height: "42px", position: "relative", borderRadius: "12px", background: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                    {p.institution_logo ? <Image src={p.institution_logo} alt="" fill sizes="42px" style={{ objectFit: "cover" }}/> : <span style={{ color: "#F5A623", fontWeight: 800, fontSize: "14px" }}>{initiales(p.institution_nom)}</span>}
                  </div>
                  {/* Établissement en position primaire, service en second —
                      une transaction se lit d'abord par "à qui", ensuite
                      "pour quoi" (portefeuille de transactions, pas une
                      simple liste de réservations), point 2 du brief. */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "14.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.institution_nom}</div>
                    <div style={{ color: t2, fontSize: "11.5px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.service_nom}</div>
                  </div>
                  <span style={{ color: st.color, fontSize: "10px", fontWeight: 800, backgroundColor: st.bg, padding: "3px 9px", borderRadius: "20px", whiteSpace: "nowrap", height: "fit-content" }}>{st.label}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ color: t3, fontSize: "11px" }}>{formatDate(p.date_rdv)}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>

                {/* Montant — présence forte (hero de la carte, point 1) sans
                    devenir disproportionné : une ligne à lui seul. */}
                <div style={{ color: t1, fontSize: "23px", fontWeight: 900, marginBottom: "12px" }}>{formatPrix(p.montant)}</div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)", borderRadius: "10px", padding: "8px 10px", marginBottom: "10px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: t3, fontSize: "9px", fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase" }}>{refLabel}</div>
                    <div style={{ color: t1, fontSize: "12.5px", fontWeight: 700, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{refValeur}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); void copierReference(refValeur); }} aria-label="Copier la référence" className="tap" style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "8px", backgroundColor: "transparent", border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t2 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                </div>

                {/* Actions — le reçu est l'action financière principale
                    (point 4), "Voir l'historique" reste disponible mais
                    nettement plus léger visuellement quand les deux
                    coexistent (jamais le même poids). */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={(e) => { e.stopPropagation(); setHistoriqueOuvert(p); }} className="tap" style={p.recu
                    ? { background: "transparent", border: "none", color: t2, fontWeight: 600, fontSize: "12px", padding: "10px 4px", cursor: "pointer" }
                    : { flex: 1, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`, color: t1, fontWeight: 700, fontSize: "12.5px", padding: "10px", borderRadius: "10px", cursor: "pointer" }}>
                    Voir l&apos;historique
                  </button>
                  {p.recu && (
                    <button onClick={(e) => { e.stopPropagation(); void telechargerRecu(p); }} disabled={telechargement === p.id} className="tap" style={{ flex: 1, backgroundColor: "#F5A623", border: "none", color: "#080812", fontWeight: 700, fontSize: "12.5px", padding: "10px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      {telechargement === p.id ? <YelenLoader size={14} color="#080812"/> : "Télécharger le reçu"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
      </PullToRefresh>

      {/* Pop-up "Voir l'historique" — timeline factuelle du paiement,
          uniquement les événements réellement horodatés en base (jamais
          d'étape inventée). */}
      {historiqueOuvert && (
        <div onClick={() => setHistoriqueOuvert(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px 24px 0 0", padding: "22px 20px 32px", width: "100%", maxWidth: "480px", animation: "slideUpSheet 0.3s ease" }}>
            <div style={{ width: "40px", height: "4px", backgroundColor: brd, borderRadius: "4px", margin: "0 auto 18px" }} />
            <div style={{ color: t1, fontSize: "16px", fontWeight: 900, marginBottom: "2px" }}>{historiqueOuvert.service_nom}</div>
            <div style={{ color: t2, fontSize: "12.5px", marginBottom: "20px" }}>
              {historiqueOuvert.institution_nom} · {historiqueOuvert.recu ? `Réf. paiement ${historiqueOuvert.recu.receipt_id}` : `Réf. réservation ${historiqueOuvert.reference}`}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {[
                { label: "Réservation créée", date: historiqueOuvert.created_at, detail: null },
                historiqueOuvert.declare_le ? { label: "Paiement déclaré par vous", date: historiqueOuvert.declare_le, detail: historiqueOuvert.montant_declare_citoyen != null ? formatPrix(historiqueOuvert.montant_declare_citoyen) : null } : null,
                (historiqueOuvert.statut === "confirme" || historiqueOuvert.statut === "termine") && historiqueOuvert.traite_le ? { label: `Paiement confirmé par ${historiqueOuvert.institution_nom}`, date: historiqueOuvert.traite_le, detail: formatPrix(historiqueOuvert.montant) } : null,
                historiqueOuvert.statut === "no_show" && historiqueOuvert.traite_le ? { label: `Marqué absent par ${historiqueOuvert.institution_nom}`, date: historiqueOuvert.traite_le, detail: null } : null,
                historiqueOuvert.statut === "annule" && historiqueOuvert.traite_le ? { label: "Réservation annulée", date: historiqueOuvert.traite_le, detail: null } : null,
                historiqueOuvert.statut === "rembourse" ? { label: "Paiement remboursé", date: historiqueOuvert.traite_le ?? historiqueOuvert.created_at, detail: null } : null,
              ].filter((e): e is { label: string; date: string; detail: string | null } => e !== null).map((etape, i, arr) => (
                <div key={i} style={{ display: "flex", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: "9px", height: "9px", borderRadius: "50%", backgroundColor: "#F5A623", marginTop: "4px" }}/>
                    {i < arr.length - 1 && <div style={{ width: "1.5px", flex: 1, backgroundColor: brd, minHeight: "24px" }}/>}
                  </div>
                  <div style={{ paddingBottom: "16px" }}>
                    <div style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>{etape.label}</div>
                    <div style={{ color: t2, fontSize: "11.5px", marginTop: "2px" }}>{formatDateHeure(etape.date)}{etape.detail ? ` · ${etape.detail}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>

            {historiqueOuvert.recu && (
              <button onClick={() => void telechargerRecu(historiqueOuvert)} disabled={telechargement === historiqueOuvert.id} className="tap" style={{ width: "100%", marginTop: "8px", backgroundColor: "#F5A623", border: "none", color: "#080812", fontWeight: 700, fontSize: "13px", padding: "12px", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                {telechargement === historiqueOuvert.id ? <YelenLoader size={14} color="#080812"/> : "Télécharger le reçu"}
              </button>
            )}

            <button onClick={() => setHistoriqueOuvert(null)} className="tap" style={{ width: "100%", marginTop: "8px", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`, color: t1, fontWeight: 700, fontSize: "13px", padding: "12px", borderRadius: "12px", cursor: "pointer" }}>Fermer</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
