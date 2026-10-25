"use client";

// Onglet Scanner QR : historique des RDV dont la présence a été confirmée
// par scan (refonte UI 20/10/2026). Purement présentationnel : aucune
// requête, la liste vient de `rdvs` déjà chargé par layout.tsx, et le bouton
// "Scanner un QR" appelle le même handler que celui du header (onScan). Le
// détail "service / prix / mode / bénéficiaire" est dérivé à l'affichage de
// `objet` (écrit par app/rdv/[id]/page.tsx) ou des champs structurés quand
// ils existent, sans jamais rien perdre si le format ne correspond pas.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";
import type { RDV } from "../layout";
import { heureAmPm } from "@/lib/heure";

// ── Parsing d'affichage ──────────────────────────────────────────────────
type ScanInfo = {
  service: string; prix: string | null; mode: string | null;
  beneficiaire: string | null; beneficiairePhone: string | null;
};
export function parseScanLabel(r: RDV): ScanInfo {
  const objet = (r.objet || "").trim();
  const tag = objet.match(/^\[([^\]]+)\]/);
  const apresTag = tag ? objet.slice(tag[0].length) : objet;
  const [avantBenef, ...resteBenef] = apresTag.split("—");

  let service = r.est_payant && r.service_payant_nom ? r.service_payant_nom : "";
  if (!service) {
    if (!tag) service = objet || "RDV général";
    else if (tag[1] === "SERVICE PAYANT") service = avantBenef.trim() || "Service payant";
    else service = tag[1];
  }

  let prix: string | null = typeof r.service_payant_prix === "number" ? `${r.service_payant_prix.toLocaleString("fr-FR")} GNF` : null;
  let mode: string | null = null;
  const mPrix = avantBenef.match(/(\d[\d\s  .,]*\d|\d)\s*GNF(?:\s+([^—]+))?/i);
  if (mPrix) {
    if (!prix) prix = `${mPrix[1].replace(/\s+/g, " ").trim()} GNF`;
    const brut = (mPrix[2] || "").trim();
    if (brut) mode = brut.charAt(0).toUpperCase() + brut.slice(1);
  }

  let beneficiaire: string | null = null;
  let beneficiairePhone: string | null = null;
  if (r.pour_autre && r.nom_autre) { beneficiaire = r.nom_autre; beneficiairePhone = r.phone_autre || null; }
  else {
    const mB = resteBenef.join("—").match(/Pour\s+(.+?)\s*(?:\((.+?)\))?\s*$/i);
    if (mB) { beneficiaire = mB[1]; beneficiairePhone = mB[2] || null; }
  }
  return { service, prix, mode, beneficiaire, beneficiairePhone };
}

function nomPropre(nom: string): string {
  return nom.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}
function initiales(nom: string): string {
  const p = nom.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase();
}
// Affichage 12h AM/PM, convention Yelen (jamais 24h).
function heure12(h: string): string {
  return heureAmPm(h) || h;
}
function jourCourt(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function heureDeDate(iso: string): string {
  const d = new Date(iso);
  return heure12(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
}
function dateComplete(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) + " à " + heureDeDate(iso);
}
function dateRelative(iso: string, maintenant: number): string {
  const sec = Math.round((new Date(iso).getTime() - maintenant) / 1000);
  const a = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (a < 60) return "à l'instant";
  if (a < 3600) return rtf.format(Math.trunc(sec / 60), "minute");
  if (a < 86400) return rtf.format(Math.trunc(sec / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.trunc(sec / 86400), "day");
  if (a < 86400 * 365) return rtf.format(Math.trunc(sec / (86400 * 30)), "month");
  return rtf.format(Math.trunc(sec / (86400 * 365)), "year");
}

type Periode = "jour" | "7j" | "30j" | "tout";
const PERIODES: { key: Periode; label: string }[] = [
  { key: "jour", label: "Aujourd'hui" }, { key: "7j", label: "7 jours" }, { key: "30j", label: "30 jours" }, { key: "tout", label: "Tout" },
];
function debutJour(ts: number): number { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

type Ligne = { r: RDV; info: ScanInfo; nom: string };

// ── Composant ────────────────────────────────────────────────────────────
export function ScansTab({ C, rdvs, loading, error, active, onScan, onRetry }: {
  C: ThemeTokens; rdvs: RDV[]; loading: boolean; error: string; active: boolean; onScan: () => void; onRetry: () => void;
}) {
  const ui = toUiTokens(C);
  const [recherche, setRecherche] = useState("");
  const [periode, setPeriode] = useState<Periode>("tout");
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setMaintenant(Date.now()), 60000);
    return () => clearInterval(id);
  }, [active]);

  // Raccourci "/" : seulement quand l'onglet est visible (il reste monté).
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const toutes: Ligne[] = useMemo(() => rdvs
    .filter(r => r.presence_status === "present")
    .sort((a, b) => new Date(b.presence_confirmed_at || b.date_rdv).getTime() - new Date(a.presence_confirmed_at || a.date_rdv).getTime())
    .map(r => ({ r, info: parseScanLabel(r), nom: nomPropre(r.citoyen_nom || "") })), [rdvs]);

  const debut = debutJour(maintenant);
  const nbAujourdhui = toutes.filter(l => l.r.presence_confirmed_at && new Date(l.r.presence_confirmed_at).getTime() >= debut).length;
  const nbSemaine = toutes.filter(l => l.r.presence_confirmed_at && new Date(l.r.presence_confirmed_at).getTime() >= debut - 6 * 86400000).length;

  const seuil = periode === "jour" ? debut : periode === "7j" ? debut - 6 * 86400000 : periode === "30j" ? debut - 29 * 86400000 : null;
  const q = recherche.trim().toLowerCase();
  const lignes = toutes.filter(l => {
    if (seuil !== null && !(l.r.presence_confirmed_at && new Date(l.r.presence_confirmed_at).getTime() >= seuil)) return false;
    if (q && !`${l.r.citoyen_nom} ${l.info.service} ${l.r.objet} ${l.info.beneficiaire ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const filtreActif = q !== "" || periode !== "tout";
  function reinitialiser() { setRecherche(""); setPeriode("tout"); }

  const kpis = [
    { label: "Scans aujourd'hui", value: nbAujourdhui },
    { label: "Cette semaine", value: nbSemaine },
    { label: "Total", value: toutes.length },
  ];

  return (
    <div className="scx-page">
      <style>{`
        .scx-page{max-width:1280px;margin:0 auto;padding:24px 24px 40px}
        @media(min-width:1024px){.scx-page{padding:28px 32px 40px}}
        .scx-kpi{display:grid;grid-template-columns:repeat(3,1fr)}
        .scx-kpi-item{border-left:1px solid ${C.border}}
        .scx-kpi-item:first-child{border-left:0}
        @media(max-width:767px){.scx-table{display:none!important}}
        @media(min-width:768px){.scx-cards{display:none!important}}
        .scx-row:hover{background-color:${C.bgCard2}}
        .scx-btn:focus-visible,.scx-input:focus-visible,.scx-seg:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
        .scx-skel{background:${C.bg3};border-radius:6px;animation:scxPulse 1.4s ease-in-out infinite}
        @keyframes scxPulse{0%,100%{opacity:1}50%{opacity:.5}}
        @media(prefers-reduced-motion:reduce){.scx-skel{animation:none}}
        .scx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      `}</style>

      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px 16px", marginBottom: "20px" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Scanner QR</h1>
          <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>Historique des rendez-vous dont la présence a été confirmée par scan.</p>
        </div>
        <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onScan}
          icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>}>
          Scanner un QR
        </Button>
      </div>

      {/* Résumé */}
      {loading ? (
        <div aria-hidden="true" className="scx-skel" style={{ height: "80px", borderRadius: "12px", marginBottom: "20px" }}/>
      ) : (
        <div className="scx-kpi" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", marginBottom: "20px" }}>
          {kpis.map(k => (
            <div key={k.label} className="scx-kpi-item" style={{ minHeight: "80px", padding: "14px 18px" }}>
              <div style={{ color: C.t2, fontSize: "13px" }}>{k.label}</div>
              <div style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Barre d'outils */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: "12px" }}>
        <div style={{ position: "relative", width: "360px", maxWidth: "100%" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} className="scx-input" value={recherche} onChange={e => setRecherche(e.target.value)} aria-label="Rechercher un scan"
            placeholder="Rechercher un citoyen, un service…"
            style={{ width: "100%", height: "36px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 32px", color: C.t1, fontSize: "13.5px", fontFamily: "inherit" }}/>
          {recherche ? (
            <button type="button" className="scx-btn tap" aria-label="Effacer la recherche" onClick={() => { setRecherche(""); inputRef.current?.focus(); }}
              style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "6px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          ) : (
            <kbd aria-hidden="true" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: C.t3, border: `1px solid ${C.border2}`, borderRadius: "4px", padding: "0 5px", fontFamily: "inherit" }}>/</kbd>
          )}
        </div>

        <div role="group" aria-label="Période" style={{ display: "inline-flex", border: `1px solid ${C.border2}`, borderRadius: "8px", overflow: "hidden", backgroundColor: C.bgCard }}>
          {PERIODES.map((p, i) => {
            const on = p.key === periode;
            return (
              <button key={p.key} type="button" aria-pressed={on} className="scx-seg scx-btn tap" onClick={() => setPeriode(p.key)}
                style={{ height: "34px", padding: "0 12px", border: "none", borderLeft: i > 0 ? `1px solid ${C.border2}` : "none", backgroundColor: on ? C.bg3 : "transparent", color: on ? C.t1 : C.t2, fontSize: "12.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                {p.label}
              </button>
            );
          })}
        </div>

        {filtreActif && (
          <button type="button" className="scx-btn tap" onClick={reinitialiser} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>
        )}
        <span aria-live="polite" style={{ marginLeft: "auto", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
          {lignes.length} scan{lignes.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Contenu */}
      {loading ? (
        <div role="status" aria-label="Chargement des scans" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden" }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: "60px", padding: "0 14px", display: "flex", alignItems: "center", gap: "16px", borderBottom: i < 4 ? `1px solid ${C.border}` : "none" }}>
              <div className="scx-skel" style={{ width: "32px", height: "32px", borderRadius: "50%" }}/>
              <div className="scx-skel" style={{ flex: 1, height: "12px" }}/>
              <div className="scx-skel" style={{ width: "140px", height: "12px" }}/>
              <div className="scx-skel" style={{ width: "90px", height: "12px" }}/>
            </div>
          ))}
        </div>
      ) : error && toutes.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
          <div role="alert" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Impossible de charger les scans</div>
          <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Vérifiez votre connexion puis réessayez.</div>
          <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onRetry}>Réessayer</Button>
        </div>
      ) : toutes.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "44px 20px", textAlign: "center" }}>
          <svg aria-hidden="true" width="72" height="72" viewBox="0 0 96 96" fill="none" style={{ margin: "0 auto 14px", display: "block" }}>
            <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
            <path d="M28 38v-6a4 4 0 0 1 4-4h6M58 28h6a4 4 0 0 1 4 4v6M68 58v6a4 4 0 0 1-4 4h-6M38 68h-6a4 4 0 0 1-4-4v-6" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
            <rect x="38" y="38" width="20" height="20" rx="3" stroke={C.gold} strokeWidth="2.2"/>
          </svg>
          <div style={{ color: C.t1, fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Aucun scan pour le moment</div>
          <div style={{ color: C.t2, fontSize: "13px" }}>Les présences confirmées par scan apparaîtront ici.</div>
        </div>
      ) : lignes.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun résultat</div>
          <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Aucun scan ne correspond à ces critères.</div>
          <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={reinitialiser}>Réinitialiser</Button>
        </div>
      ) : (
        <>
          <div className="scx-table" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "auto", maxHeight: "68svh" }}>
            <table style={{ width: "100%", minWidth: "980px", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <colgroup>
                <col/><col style={{ width: "220px" }}/><col style={{ width: "140px" }}/><col style={{ width: "150px" }}/><col style={{ width: "170px" }}/>
              </colgroup>
              <thead>
                <tr>
                  {[
                    { h: "Citoyen", right: false }, { h: "Service", right: false }, { h: "Paiement", right: true },
                    { h: "Rendez-vous", right: false }, { h: "Scanné le", right: false, check: true },
                  ].map(c => (
                    <th key={c.h} scope="col" style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}`, textAlign: c.right ? "right" : "left", padding: "10px 14px", color: C.t2, fontSize: "12px", fontWeight: 500 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                        {c.h}
                        {c.check && (
                          <svg role="img" aria-label="Présence confirmée par scan" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Présence confirmée par scan</title><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(({ r, info, nom }, i) => {
                  const td = { padding: "0 14px", height: "60px", borderBottom: i < lignes.length - 1 ? `1px solid ${C.border}` : "none", verticalAlign: "middle" } as const;
                  const benef = info.beneficiaire ? `Pour ${nomPropre(info.beneficiaire)}${info.beneficiairePhone ? ` · ${info.beneficiairePhone}` : ""}` : null;
                  return (
                    <tr key={r.id} className="scx-row">
                      <td style={{ ...td, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                          <span aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initiales(nom)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div title={nom} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nom || "—"}</div>
                            {benef && <div title={benef} style={{ color: C.t3, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{benef}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ ...td, overflow: "hidden" }}>
                        <div title={info.service} style={{ color: C.t1, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.service}</div>
                      </td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {info.prix ? (
                          <>
                            <div style={{ color: C.t1, fontSize: "14px", fontVariantNumeric: "tabular-nums" }}>{info.prix}</div>
                            {info.mode && <div style={{ color: C.t3, fontSize: "12px" }}>{info.mode}</div>}
                          </>
                        ) : <span style={{ color: C.t3, fontSize: "13px" }}>—</span>}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
                        {jourCourt(r.date_rdv)} · {heure12(r.heure_rdv)}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
                        {r.presence_confirmed_at ? (
                          <span title={`${dateComplete(r.presence_confirmed_at)} (${dateRelative(r.presence_confirmed_at, maintenant)})`}>
                            {jourCourt(r.presence_confirmed_at)} · {heureDeDate(r.presence_confirmed_at)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="scx-cards" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {lignes.map(({ r, info, nom }) => (
              <div key={r.id} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflowWrap: "anywhere" }}>{nom || "—"}</span>
                  <span style={{ color: C.t2, fontSize: "12.5px", whiteSpace: "nowrap" }} title={r.presence_confirmed_at ? dateComplete(r.presence_confirmed_at) : undefined}>
                    {r.presence_confirmed_at ? `${jourCourt(r.presence_confirmed_at)} · ${heureDeDate(r.presence_confirmed_at)}` : "—"}
                  </span>
                </div>
                {info.beneficiaire && <div style={{ color: C.t3, fontSize: "12px", marginBottom: "6px" }}>Pour {nomPropre(info.beneficiaire)}{info.beneficiairePhone ? ` · ${info.beneficiairePhone}` : ""}</div>}
                <div style={{ color: C.t1, fontSize: "14px", marginBottom: "6px", overflowWrap: "anywhere" }}>{info.service}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", color: C.t2, fontSize: "12.5px" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{info.prix ? `${info.prix}${info.mode ? ` · ${info.mode}` : ""}` : "—"}</span>
                  <span>RDV {jourCourt(r.date_rdv)} · {heure12(r.heure_rdv)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
