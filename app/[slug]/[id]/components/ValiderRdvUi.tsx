"use client";

// Composants purement présentationnels du Centre de validation (refonte UI
// 20/10/2026). Aucun fetch, aucun état métier : ValiderRdvTab.tsx garde la
// saisie du code, la recherche automatique à 6 chiffres, les actions et les
// KPI, et passe ici des props prêtes à afficher.
import { useSyncExternalStore, type KeyboardEvent, type ClipboardEvent, type MutableRefObject, type ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";

export function nomPropre(nom: string): string {
  return nom.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

// Source d'état du témoin "Temps réel" : l'écran n'a pas d'abonnement
// realtime, l'indicateur reflète donc l'état réseau du navigateur.
function abonnerReseau(notifier: () => void): () => void {
  window.addEventListener("online", notifier);
  window.addEventListener("offline", notifier);
  return () => { window.removeEventListener("online", notifier); window.removeEventListener("offline", notifier); };
}
function useEnLigne(): boolean {
  return useSyncExternalStore(abonnerReseau, () => navigator.onLine, () => true);
}

export function ValidationStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .vrx-page{max-width:1280px;margin:0 auto;padding:24px 24px 48px}
      @media(min-width:1024px){.vrx-page{padding:28px 32px 48px}}
      .vrx-kpi{display:grid;grid-template-columns:repeat(4,1fr)}
      .vrx-kpi-item{border-left:1px solid ${C.border}}
      .vrx-kpi-item:first-child{border-left:0}
      @media(max-width:767px){
        .vrx-kpi{grid-template-columns:repeat(2,1fr)}
        .vrx-kpi-item:nth-child(odd){border-left:0}
        .vrx-kpi-item:nth-child(n+3){border-top:1px solid ${C.border}}
      }
      .vrx-grid{display:grid;grid-template-columns:1fr;gap:24px;margin-bottom:24px}
      @media(min-width:1024px){.vrx-grid{grid-template-columns:2fr 1fr}}
      .vrx-case{width:52px;height:60px}
      @media(max-width:639px){.vrx-case{width:40px;height:52px;font-size:20px!important}}
      .vrx-hero{display:none}
      @media(min-width:1280px){.vrx-hero{display:block}}
      .vrx-btn:focus-visible,.vrx-case:focus-visible,.vrx-row:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      .vrx-skel{background:${C.bg3};border-radius:6px;animation:vrxPulse 1.4s ease-in-out infinite}
      @keyframes vrxPulse{0%,100%{opacity:1}50%{opacity:.5}}
      @keyframes vrxSpin{to{transform:rotate(360deg)}}
      @media(prefers-reduced-motion:reduce){.vrx-skel{animation:none}.vrx-case{transition:none!important}}
      .vrx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
    `}</style>
  );
}

// ── En-tête ──────────────────────────────────────────────────────────────
export function ValidationHeader({ C, helpSlot, aideOuverte, onToggleAide }: { C: ThemeTokens; helpSlot: ReactNode; aideOuverte: boolean; onToggleAide: () => void }) {
  const enLigne = useEnLigne();
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px 24px", marginBottom: "20px" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: 0 }}>Centre de validation</h1>
          {helpSlot}
        </div>
        <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>Validez les rendez-vous, confirmez les paiements et enregistrez l&apos;arrivée des citoyens.</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 16px" }}>
        <span aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t3, fontSize: "12px" }}>
          <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: enLigne ? C.green : C.t3 }}/>
          {enLigne ? "Temps réel" : "Hors ligne"}
        </span>
        <span style={{ color: C.t2, fontSize: "13px" }}>Aujourd&apos;hui · {date}</span>
        <button type="button" className="vrx-btn tap" aria-expanded={aideOuverte} onClick={onToggleAide}
          style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "none", border: "none", padding: "2px 0", color: C.t3, fontSize: "12.5px", cursor: "pointer" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          Besoin d&apos;aide ? Voir la procédure
        </button>
      </div>
    </div>
  );
}

// ── Bande KPI ────────────────────────────────────────────────────────────
export type ValidationStat = { label: string; value: string; unit?: string; sub: string; icon: ReactNode };
export function ValidationStats({ C, items, loading }: { C: ThemeTokens; items: ValidationStat[]; loading: boolean }) {
  if (loading) return <div aria-hidden="true" className="vrx-skel" style={{ height: "80px", borderRadius: "12px", marginBottom: "24px" }}/>;
  return (
    <div className="vrx-kpi" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", marginBottom: "24px" }}>
      {items.map(it => (
        <div key={it.label} className="vrx-kpi-item" style={{ minHeight: "80px", padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px" }}>
            <span aria-hidden="true" style={{ color: C.t3, display: "inline-flex" }}>{it.icon}</span>{it.label}
          </div>
          <div style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>
            {it.value}{it.unit && <span style={{ color: C.t3, fontSize: "14px", fontWeight: 500, marginLeft: "5px" }}>{it.unit}</span>}
          </div>
          <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Saisie du code ───────────────────────────────────────────────────────
export function CodeEntryCard({ C, digits, inputRefs, searching, searchError, focusedDigit, onFocusDigit, onBlurDigit, onDigit, onKeyDown, onPaste, onReset, showNouveauCode }: {
  C: ThemeTokens; digits: string[]; inputRefs: MutableRefObject<(HTMLInputElement | null)[]>;
  searching: boolean; searchError: string | null; focusedDigit: number | null;
  onFocusDigit: (i: number) => void; onBlurDigit: (i: number) => void;
  onDigit: (i: number, v: string) => void; onKeyDown: (i: number, e: KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void; onReset: () => void; showNouveauCode: boolean;
}) {
  const rempli = digits.filter(d => d !== "").length;
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "28px 24px", textAlign: "center" }}>
      <div aria-hidden="true" style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: `${C.gold}1c`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h2 style={{ color: C.t1, fontSize: "18px", fontWeight: 600, margin: "0 0 4px" }}>Entrer le code citoyen</h2>
      <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 20px" }}>Le citoyen retrouve ce code dans son application Yelen.</p>

      <div role="group" aria-label="Code citoyen à 6 chiffres" aria-busy={searching} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        {digits.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              ref={el => { inputRefs.current[i] = el; }}
              className="vrx-case"
              type="text" inputMode="numeric" maxLength={1}
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Chiffre ${i + 1} sur 6`}
              value={d}
              readOnly={searching}
              onChange={e => onDigit(i, e.target.value)}
              onKeyDown={e => onKeyDown(i, e)}
              onPaste={i === 0 ? onPaste : undefined}
              onFocus={e => { e.target.select(); onFocusDigit(i); }}
              onBlur={() => onBlurDigit(i)}
              style={{
                boxSizing: "border-box", borderRadius: "10px", fontSize: "24px", fontWeight: 600, textAlign: "center",
                fontFamily: "'SF Mono',ui-monospace,monospace", fontVariantNumeric: "tabular-nums", transition: "border-color 0.15s, box-shadow 0.15s",
                caretColor: C.gold, backgroundColor: C.bgCard, color: C.t1, opacity: searching ? 0.7 : 1,
                border: `1.5px solid ${searchError ? C.red : focusedDigit === i ? C.gold : d ? C.t1 : C.border2}`,
                boxShadow: focusedDigit === i ? `0 0 0 3px ${C.gold}33` : "none",
              }}
            />
            {i === 2 && <span aria-hidden="true" style={{ color: C.t3, fontSize: "18px", userSelect: "none" }}>–</span>}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: "372px", margin: "0 auto" }}>
        <div aria-hidden="true" style={{ height: "3px", borderRadius: "99px", backgroundColor: C.bg3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(rempli / 6) * 100}%`, backgroundColor: C.gold, transition: "width 0.2s ease" }}/>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
          <span aria-live="polite" style={{ color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{rempli}/6</span>
          <button type="button" className="vrx-btn tap" onClick={onReset} disabled={rempli === 0 || searching}
            style={{ background: "none", border: "none", padding: "2px 0", fontSize: "12px", color: rempli === 0 ? C.t3 : C.t2, textDecoration: rempli === 0 ? "none" : "underline", cursor: rempli === 0 ? "default" : "pointer", opacity: rempli === 0 ? 0.5 : 1 }}>
            Effacer
          </button>
        </div>
      </div>

      <div aria-live="polite" style={{ marginTop: "12px", minHeight: "20px", color: C.t3, fontSize: "12px" }}>
        {searching ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: C.t2 }}>
            <span aria-hidden="true" style={{ width: "12px", height: "12px", borderRadius: "50%", border: `2px solid ${C.border2}`, borderTopColor: C.gold, animation: "vrxSpin 0.8s linear infinite" }}/>
            Recherche en cours…
          </span>
        ) : "Vérification automatique à 6 chiffres"}
      </div>

      <div aria-live="assertive">
        {searchError && (
          <div role="alert" style={{ marginTop: "12px", padding: "12px 14px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", textAlign: "left", display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "2px" }}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <div>
              <div style={{ color: C.red, fontSize: "13px", fontWeight: 600 }}>Code introuvable</div>
              <div style={{ color: C.red, fontSize: "12.5px", lineHeight: 1.5, marginTop: "2px" }}>{searchError}</div>
            </div>
          </div>
        )}
      </div>

      {showNouveauCode && (
        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ marginTop: "14px" }}
          icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>}
          onClick={onReset}>Nouveau code</Button>
      )}
    </div>
  );
}

// ── Activité du jour ─────────────────────────────────────────────────────
export type ActiviteRow = { id: string; statut: string; label: string; color: string; bg: string; icon: ReactNode; heure: string; nom: string };
export function DailyActivityCard({ C, rows, loading, error, onRetry }: { C: ThemeTokens; rows: ActiviteRow[]; loading: boolean; error: boolean; onRetry: () => void }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", minHeight: "320px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0 }}>Activité du jour</h2>
        <span style={{ minWidth: "22px", height: "20px", padding: "0 7px", borderRadius: "10px", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{rows.length}</span>
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: "220px" }}>
        <div style={{ position: "absolute", inset: 0, overflowY: "auto" }}>
          {loading ? (
            <div role="status" aria-label="Chargement de l'activité" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[0, 1, 2, 3].map(i => <div key={i} className="vrx-skel" style={{ height: "36px" }}/>)}
            </div>
          ) : error && rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 8px" }}>
              <div role="alert" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Impossible de charger l&apos;activité</div>
              <div style={{ color: C.t2, fontSize: "13px", marginBottom: "12px" }}>Vérifiez votre connexion puis réessayez.</div>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={onRetry}>Réessayer</Button>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 8px" }}>
              <Image className="vrx-hero" src="/illustrations/centre-validation-hero.png" alt="" width={1536} height={1024} style={{ width: "120px", height: "auto", margin: "0 auto 12px" }}/>
              <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 10px", display: "block" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucune réservation traitée aujourd&apos;hui</div>
              <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>Les validations, absences et annulations apparaîtront ici au fil de la journée.</div>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {rows.map((r, i) => (
                <li key={r.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ color: C.t3, fontSize: "12px", width: "62px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{r.heure}</span>
                  <span title={r.nom} style={{ flex: 1, minWidth: 0, color: C.t1, fontSize: "13.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nom || "—"}</span>
                  <StatutBadge label={r.label} color={r.color} bg={r.bg} icon={r.icon}/>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatutBadge({ label, color, bg, icon }: { label: string; color: string; bg: string; icon: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: bg, color, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
      {icon}{label}
    </span>
  );
}

// ── Traitées aujourd'hui ─────────────────────────────────────────────────
export type TraiteeRow = { id: string; avatar: ReactNode; nom: string; service: string; code: string; prix: string | null; heure: string; label: string; color: string; bg: string; icon: ReactNode };
export function ProcessedTodayTable({ C, rows, totalEncaisse, payes }: { C: ThemeTokens; rows: TraiteeRow[]; totalEncaisse: string; payes: number }) {
  if (rows.length === 0) return null;
  const COLS = ["Citoyen", "Service", "Code", "Heure", "Montant", "Statut"];
  return (
    <section aria-labelledby="vrx-traitees-titre">
      <h2 id="vrx-traitees-titre" style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 12px" }}>Traitées aujourd&apos;hui ({rows.length})</h2>
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "auto" }}>
        <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {COLS.map((h, i) => (
                <th key={h} scope="col" style={{ backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}`, textAlign: h === "Montant" ? "right" : "left", padding: "10px 14px", color: C.t2, fontSize: "12px", fontWeight: 500, width: i === 0 ? "auto" : undefined }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const td = { padding: "10px 14px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" } as const;
              return (
                <tr key={r.id}>
                  <td style={td}>
                    <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      {r.avatar}
                      <span title={r.nom} style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>{r.nom || "—"}</span>
                    </span>
                  </td>
                  <td style={{ ...td, color: C.t1, fontSize: "14px", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.service}>{r.service}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: "12px", color: C.t2, whiteSpace: "nowrap" }}>{r.code}</td>
                  <td style={{ ...td, color: C.t2, fontSize: "13px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.heure}</td>
                  <td style={{ ...td, textAlign: "right", color: r.prix ? C.t1 : C.t3, fontSize: "14px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.prix ?? "—"}</td>
                  <td style={td}><StatutBadge label={r.label} color={r.color} bg={r.bg} icon={r.icon}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", padding: "12px 14px", backgroundColor: C.bgCard2 }}>
          <span style={{ color: C.t2, fontSize: "13px" }}>Total encaissé aujourd&apos;hui : <strong style={{ color: C.t1, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{totalEncaisse}</strong></span>
          <span style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>Réservations payées : <strong style={{ color: C.t1, fontWeight: 600 }}>{payes}</strong> / {rows.length}</span>
        </div>
      </div>
    </section>
  );
}
