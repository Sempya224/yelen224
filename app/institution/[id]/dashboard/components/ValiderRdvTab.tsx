"use client";

// Onglet Valider un RDV payant — porté depuis l'ancienne route séparée
// app/institution/valider-rdv/page.tsx vers les tokens C.* du dashboard
// institution, cohérent avec le reste de l'interface. Logique de saisie
// code / recherche / actions / historique inchangée, même colonnes
// paid_bookings + paid_services + users.
// Lot B (16/07/2026) : les .update() directs sur paid_bookings/rdv sont
// remplacés par app/api/institution/paid-bookings/valider/route.ts
// (service_role) — paid_bookings/rdv n'ont que des policies citoyen, ces
// writes institution échouaient silencieusement ou en erreur RLS.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";

type BookingStatut = "en_attente" | "confirme" | "termine" | "no_show" | "annule";

type BookingFound = {
  id: string;
  confirmation_code: string;
  statut: BookingStatut;
  date_rdv: string;
  heure_rdv: string;
  pour_autre: boolean;
  nom_autre: string | null;
  phone_autre: string | null;
  service_nom: string;
  service_prix: number;
  service_duree: number;
  citoyen_prenom: string | null;
  citoyen_nom: string | null;
  citoyen_phone: string | null;
};

type HistoryEntry = {
  id: string;
  confirmation_code: string;
  statut: BookingStatut;
  date_rdv: string;
  heure_rdv: string;
  service_nom: string;
  service_prix: number;
  citoyen_nom: string | null;
};

function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " FCFA";
}

function formatDate(dateRdv: string, heureRdv: string): string {
  try {
    const d = new Date(`${dateRdv}T${heureRdv}:00`);
    if (isNaN(d.getTime())) return `${dateRdv} à ${heureRdv}`;
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + ` à ${heureRdv}`;
  } catch {
    return `${dateRdv} à ${heureRdv}`;
  }
}

const STATUT_CONFIG = (C: ThemeTokens): Record<BookingStatut, { label: string; color: string; bg: string; icon: string }> => ({
  en_attente: { label: "En attente", color: C.gold, bg: `${C.gold}15`, icon: "⏳" },
  confirme:   { label: "Payé ✓",     color: C.green, bg: C.greenL,      icon: "✅" },
  termine:    { label: "Terminé",    color: C.purple, bg: C.purpleL,    icon: "🏁" },
  annule:     { label: "Annulé",     color: C.red,   bg: C.redL,        icon: "❌" },
  no_show:    { label: "Absent",     color: C.t2,    bg: "rgba(153,153,179,0.1)", icon: "👻" },
});

export function ValiderRdvTab({ instId, preloadBookingId, onPreloadConsumed }: { instId: string; preloadBookingId?: string | null; onPreloadConsumed?: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const statutConfig = STATUT_CONFIG(C);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [booking, setBooking] = useState<BookingFound | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<BookingStatut | null>(null);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const todayPaye = history.filter(h => h.statut === "confirme").length;
  const todayCA = history.filter(h => h.statut === "confirme").reduce((s, h) => s + h.service_prix, 0);

  useEffect(() => { setTimeout(() => inputRefs.current[0]?.focus(), 300); }, []);

  // Préremplissage depuis le bouton "Prendre en charge" de l'écran RDV (Lot
  // C, refonte cycle de vie RDV, 16/07/2026) — évite de retaper le code Yelen
  // quand le staff arrive déjà depuis la ligne RDV concernée.
  useEffect(() => {
    if (!preloadBookingId) return;
    (async () => {
      setSearching(true); setSearchError(null); setBooking(null); setActionSuccess(null); setActionError(null);
      const res = await fetch(`/api/institution/paid-bookings/valider?id=${preloadBookingId}`);
      const j = await res.json().catch(() => null);
      setSearching(false);
      if (!res.ok) { setSearchError(j?.error || "Réservation introuvable."); onPreloadConsumed?.(); return; }
      setBooking(j.booking);
      setDigits(j.booking.confirmation_code.split(""));
      onPreloadConsumed?.();
    })();
  }, [preloadBookingId, onPreloadConsumed]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const res = await fetch("/api/institution/paid-bookings/valider?history=1");
    const j = res.ok ? await res.json().catch(() => null) : null;
    setHistory(j?.history ?? []);
    setHistoryLoading(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  function handleDigit(index: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    setSearchError(null);
    if (v && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "Enter" && digits.every(d => d !== "")) handleSearch();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      setTimeout(() => inputRefs.current[5]?.focus(), 10);
    }
  }

  function resetCode() {
    setDigits(["", "", "", "", "", ""]);
    setBooking(null);
    setSearchError(null);
    setActionError(null);
    setActionSuccess(null);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  }

  const handleSearch = useCallback(async () => {
    const code = digits.join("");
    if (code.length !== 6) { setSearchError("Veuillez saisir les 6 chiffres du code Yelen."); return; }
    setSearching(true);
    setSearchError(null);
    setBooking(null);
    setActionSuccess(null);
    setActionError(null);

    const res = await fetch(`/api/institution/paid-bookings/valider?code=${code}`);
    const j = await res.json().catch(() => null);
    setSearching(false);

    if (!res.ok) { setSearchError(j?.error || "Aucune réservation trouvée pour ce code dans votre institution. Vérifiez le code et réessayez."); return; }
    setBooking(j.booking);
  }, [digits]);

  async function handleAction(newStatut: BookingStatut) {
    if (!booking) return;
    setActionLoading(true);
    setActionError(null);

    const res = await fetch("/api/institution/paid-bookings/valider", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: booking.id, action: newStatut }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { setActionError(j?.error || "Erreur lors de la mise à jour."); setActionLoading(false); return; }

    setActionSuccess(newStatut);
    setBooking(prev => (prev ? { ...prev, statut: newStatut } : null));
    setActionLoading(false);
    loadHistory();
  }

  const codeComplete = digits.every(d => d !== "");

  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Valider un RDV payant</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ padding: "5px 10px", background: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "20px", textAlign: "center" }}>
            <div style={{ color: C.green, fontSize: "14px", fontWeight: "900" }}>{todayPaye}</div>
            <div style={{ color: C.green, fontSize: "8px", fontWeight: "700", opacity: 0.75 }}>payés</div>
          </div>
          <div style={{ padding: "5px 10px", background: `${C.gold}10`, border: `1px solid ${C.gold}30`, borderRadius: "20px", textAlign: "center", maxWidth: "110px" }}>
            <div style={{ color: C.gold, fontSize: "10px", fontWeight: "900", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatPrix(todayCA)}</div>
            <div style={{ color: C.gold, fontSize: "8px", fontWeight: "700", opacity: 0.7 }}>aujourd'hui</div>
          </div>
        </div>
      </div>

      {/* Guide d'utilisation */}
      {!booking && (
        <div style={{ marginBottom: "16px", padding: "16px 18px", background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: "18px" }}>
          <div style={{ color: C.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: "12px" }}>
            📋 Comment valider un paiement
          </div>
          {[
            { num: "1", title: "Le citoyen se présente au guichet", desc: "Il ouvre son application Yelen224 et affiche son code à 6 chiffres." },
            { num: "2", title: "Saisissez le code ci-dessous", desc: "Entrez les 6 chiffres du code Yelen affiché sur son téléphone." },
            { num: "3", title: "Vérifiez la fiche et encaissez", desc: "Confirmez le service, le montant, puis cliquez sur « Valider le paiement »." },
          ].map((step, i, arr) => (
            <div key={step.num} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "7px", background: `${C.gold}15`, border: `1px solid ${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontSize: "11px", fontWeight: "900", flexShrink: 0, marginTop: "1px" }}>
                {step.num}
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700", marginBottom: "2px" }}>{step.title}</div>
                <div style={{ color: C.t3, fontSize: "11px", lineHeight: 1.5 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Saisie code */}
      <div style={{ background: C.bgCard, borderRadius: "24px", border: `1px solid ${C.gold}25`, overflow: "hidden", marginBottom: "20px" }}>
        <div style={{ height: "4px", background: `linear-gradient(90deg, ${C.gold}, ${C.goldL}, ${C.gold})` }}/>
        <div style={{ padding: "24px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: "22px" }}>
            <div style={{ width: "54px", height: "54px", borderRadius: "16px", background: `${C.gold}15`, border: `1.5px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 style={{ color: C.t1, fontSize: "19px", fontWeight: "900", margin: "0 0 6px", letterSpacing: "-0.4px" }}>Code de confirmation</h2>
            <p style={{ color: C.t3, fontSize: "12px", margin: 0, lineHeight: 1.7 }}>
              Saisissez le code Yelen à 6 chiffres affiché<br/>sur l'application du citoyen
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: "7px", marginBottom: "10px" }}>
            {digits.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <input
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  style={{
                    width: "44px", height: "58px", borderRadius: "14px", fontSize: "26px", fontWeight: "900",
                    textAlign: "center", fontFamily: "'SF Mono',monospace", transition: "all 0.15s", caretColor: "transparent",
                    background: d ? `${C.gold}15` : C.bg3,
                    border: `2px solid ${d ? `${C.gold}70` : C.border2}`,
                    color: d ? C.gold : C.t2,
                  }}
                />
                {i === 2 && <div style={{ width: "14px", display: "flex", alignItems: "center", justifyContent: "center", color: C.t3, fontSize: "18px", fontWeight: "300", margin: "0 1px", userSelect: "none" }}>–</div>}
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <div style={{ height: "3px", width: "80px", borderRadius: "99px", background: C.bg3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(digits.filter(d => d !== "").length / 6) * 100}%`, background: `linear-gradient(90deg, ${C.gold}, ${C.goldD})`, transition: "width 0.2s ease", borderRadius: "99px" }}/>
            </div>
            <span style={{ color: C.t3, fontSize: "10px", fontWeight: "600" }}>{digits.filter(d => d !== "").length}/6 chiffres</span>
          </div>

          {searchError && (
            <div style={{ marginBottom: "14px", padding: "12px 14px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "12px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span style={{ color: C.red, fontSize: "12px", fontWeight: "600", lineHeight: 1.5 }}>{searchError}</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: booking ? "1fr 2fr" : "1fr", gap: "10px" }}>
            {booking && (
              <button onClick={resetCode} className="tap" style={{ padding: "14px", borderRadius: "14px", border: `1px solid ${C.border2}`, background: C.bg3, color: C.t2, fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
                Nouveau
              </button>
            )}
            <button
              onClick={handleSearch}
              disabled={searching || !codeComplete}
              className="tap"
              style={{
                padding: "15px", borderRadius: "14px", border: "none",
                background: codeComplete ? `linear-gradient(135deg, ${C.gold}, ${C.goldD})` : C.bg3,
                color: codeComplete ? "#000" : C.t3, fontSize: "14px", fontWeight: "800",
                cursor: codeComplete ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                boxShadow: codeComplete ? `0 6px 20px ${C.gold}35` : "none", transition: "all 0.2s",
              }}
            >
              {searching ? (
                <>
                  <div style={{ width: "15px", height: "15px", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#000", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>
                  Recherche en cours…
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  Rechercher la réservation
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Fiche réservation */}
      {booking && (
        <div style={{ marginBottom: "20px" }}>
          {booking.statut !== "en_attente" && !actionSuccess && (
            <div style={{ marginBottom: "14px", padding: "14px 16px", background: statutConfig[booking.statut].bg, border: `1px solid ${statutConfig[booking.statut].color}33`, borderRadius: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "22px" }}>{statutConfig[booking.statut].icon}</span>
              <div>
                <div style={{ color: statutConfig[booking.statut].color, fontSize: "13px", fontWeight: "800" }}>
                  Cette réservation est déjà : {statutConfig[booking.statut].label}
                </div>
                <div style={{ color: C.t3, fontSize: "11px", marginTop: "3px", lineHeight: 1.5 }}>
                  Elle a déjà été traitée. Aucune action supplémentaire n'est requise.
                </div>
              </div>
            </div>
          )}

          {actionSuccess && (
            <div style={{ marginBottom: "14px", padding: "20px 16px", background: statutConfig[actionSuccess].bg, border: `2px solid ${statutConfig[actionSuccess].color}44`, borderRadius: "18px", textAlign: "center" }}>
              <div style={{ fontSize: "36px", marginBottom: "8px" }}>{statutConfig[actionSuccess].icon}</div>
              <div style={{ color: statutConfig[actionSuccess].color, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px" }}>
                {actionSuccess === "confirme" && "Paiement validé avec succès !"}
                {actionSuccess === "no_show" && "Citoyen marqué absent"}
                {actionSuccess === "annule" && "Réservation annulée"}
              </div>
              {actionSuccess === "confirme" && (
                <div style={{ color: C.t3, fontSize: "12px", marginTop: "6px", lineHeight: 1.6 }}>
                  {formatPrix(booking.service_prix)} encaissé en espèces<br/>
                  {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} — Historique mis à jour
                </div>
              )}
            </div>
          )}

          <div style={{ background: C.bgCard, borderRadius: "22px", border: `1.5px solid ${booking.statut === "en_attente" ? `${C.gold}30` : C.border2}`, overflow: "hidden" }}>
            <div style={{ height: "4px", background: booking.statut === "en_attente" ? `linear-gradient(90deg, ${C.gold}, ${C.goldL})` : statutConfig[booking.statut].color }}/>
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
                <div>
                  <div style={{ color: C.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>Code Yelen</div>
                  <div style={{ display: "flex", gap: "3px" }}>
                    {booking.confirmation_code.split("").map((c, i) => (
                      <div key={i} style={{ width: "28px", height: "36px", borderRadius: "8px", background: `${C.gold}12`, border: `1px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontSize: "17px", fontWeight: "900", fontFamily: "monospace" }}>{c}</div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "6px 12px", background: statutConfig[booking.statut].bg, border: `1px solid ${statutConfig[booking.statut].color}44`, borderRadius: "20px" }}>
                  <span style={{ color: statutConfig[booking.statut].color, fontSize: "11px", fontWeight: "800" }}>{statutConfig[booking.statut].label}</span>
                </div>
              </div>

              <div style={{ padding: "14px 16px", background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: "14px", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: "12px" }}>
                    <div style={{ color: C.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Service réservé</div>
                    <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "3px" }}>{booking.service_nom}</div>
                    <div style={{ color: C.t3, fontSize: "11px", lineHeight: 1.5 }}>
                      {booking.service_duree > 0 ? `${booking.service_duree} min · ` : ""}{formatDate(booking.date_rdv, booking.heure_rdv)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: C.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Montant dû</div>
                    <div style={{ color: C.gold, fontSize: "20px", fontWeight: "900", letterSpacing: "-0.5px" }}>{formatPrix(booking.service_prix)}</div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "600", marginTop: "2px" }}>💵 Espèces</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: "14px 16px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "14px", marginBottom: booking.statut === "en_attente" && !actionSuccess ? "20px" : "0" }}>
                <div style={{ color: C.t3, fontSize: "9px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>
                  {booking.pour_autre ? "👤 Bénéficiaire (tiers)" : "👤 Citoyen"}
                </div>
                {booking.pour_autre && booking.nom_autre ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>{booking.nom_autre}</div>
                      {booking.phone_autre && <div style={{ color: C.t3, fontSize: "12px", marginTop: "3px" }}>{booking.phone_autre}</div>}
                    </div>
                    <div style={{ padding: "4px 10px", background: `${C.gold}10`, border: `1px solid ${C.gold}25`, borderRadius: "20px" }}>
                      <span style={{ color: C.gold, fontSize: "10px", fontWeight: "700" }}>Tiers</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "3px" }}>
                        {booking.citoyen_prenom || booking.citoyen_nom ? `${booking.citoyen_prenom ?? ""} ${booking.citoyen_nom ?? ""}`.trim() : "Citoyen enregistré"}
                      </div>
                      {booking.citoyen_phone && <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>📱 {booking.citoyen_phone}</div>}
                    </div>
                    {booking.citoyen_phone && (
                      <a href={`tel:${booking.citoyen_phone}`} style={{ width: "36px", height: "36px", borderRadius: "11px", background: `${C.gold}10`, border: `1px solid ${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", flexShrink: 0, marginLeft: "10px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </a>
                    )}
                  </div>
                )}
              </div>

              {booking.statut === "en_attente" && !actionSuccess && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {actionError && (
                    <div style={{ padding: "11px 14px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "12px", color: C.red, fontSize: "12px", fontWeight: "600", lineHeight: 1.5 }}>
                      ⚠️ {actionError}
                    </div>
                  )}

                  <button
                    onClick={() => handleAction("confirme")}
                    disabled={actionLoading}
                    className="tap"
                    style={{
                      padding: "19px", borderRadius: "16px", border: "none",
                      background: actionLoading ? C.bg3 : `linear-gradient(135deg, ${C.green}, #009e76)`,
                      color: actionLoading ? C.t3 : "#fff", fontSize: "16px", fontWeight: "900",
                      cursor: actionLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                      boxShadow: actionLoading ? "none" : `0 8px 28px ${C.green}35`, letterSpacing: "-0.3px", transition: "all 0.2s",
                    }}
                  >
                    {actionLoading ? (
                      <>
                        <div style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>
                        Traitement en cours…
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Valider · {formatPrix(booking.service_prix)}
                      </>
                    )}
                  </button>

                  <div style={{ textAlign: "center", color: C.t3, fontSize: "11px", lineHeight: 1.5, padding: "0 8px" }}>
                    Cliquez sur <strong style={{ color: C.t1 }}>Valider</strong> uniquement après avoir encaissé le montant en espèces.
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <button onClick={() => handleAction("no_show")} disabled={actionLoading} className="tap" style={{ padding: "13px", borderRadius: "14px", border: `1.5px solid ${C.border2}`, background: C.bg3, color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                      Absent
                    </button>
                    <button onClick={() => handleAction("annule")} disabled={actionLoading} className="tap" style={{ padding: "13px", borderRadius: "14px", border: `1.5px solid ${C.red}30`, background: C.redL, color: C.red, fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Annuler le RDV
                    </button>
                  </div>
                </div>
              )}

              {actionSuccess && (
                <button onClick={resetCode} className="tap" style={{ width: "100%", marginTop: "16px", padding: "16px", borderRadius: "14px", border: "none", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontSize: "14px", fontWeight: "800", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: `0 6px 20px ${C.gold}35` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
                  Valider un autre paiement
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Historique du jour */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <div style={{ height: "1px", flex: 1, background: C.border }}/>
          <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase" }}>Traitées aujourd'hui · {history.length}</span>
          <div style={{ height: "1px", flex: 1, background: C.border }}/>
        </div>

        {historyLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px", gap: "10px" }}>
            <div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
            <span style={{ color: C.t3, fontSize: "11px", fontWeight: "600" }}>Chargement de l'historique…</span>
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 20px", background: C.bgCard, borderRadius: "18px", border: `1px dashed ${C.border2}` }}>
            <div style={{ fontSize: "30px", marginBottom: "10px" }}>📋</div>
            <div style={{ color: C.t1, fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Aucune réservation traitée aujourd'hui</div>
            <div style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6 }}>Les validations, absences et annulations<br/>apparaîtront ici au fil de la journée.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {history.map(entry => {
              const cfg = statutConfig[entry.statut];
              return (
                <div key={entry.id} style={{ background: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: cfg.bg, border: `1px solid ${cfg.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "17px" }}>{cfg.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                      <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{entry.service_nom}</div>
                      <div style={{ color: entry.statut === "confirme" ? C.green : C.t3, fontSize: "12px", fontWeight: "900", flexShrink: 0, marginLeft: "8px" }}>
                        {entry.statut === "confirme" ? `+${formatPrix(entry.service_prix)}` : "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: C.t3, fontSize: "10px", fontFamily: "monospace", fontWeight: "700", background: C.bg3, padding: "1px 6px", borderRadius: "4px" }}>{entry.confirmation_code}</span>
                      {entry.citoyen_nom && <span style={{ color: C.t3, fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {entry.citoyen_nom}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {history.length > 0 && (
          <div style={{ marginTop: "14px", padding: "16px 18px", background: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Total encaissé aujourd'hui</div>
              <div style={{ color: C.green, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>{formatPrix(todayCA)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Réservations</div>
              <div style={{ fontSize: "16px", fontWeight: "900" }}>
                <span style={{ color: C.green }}>{todayPaye}</span>
                <span style={{ color: C.t3, fontSize: "12px" }}> / {history.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
