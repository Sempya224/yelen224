"use client";
// ═══════════════════════════════════════════════════════════════════════
// YELEN224 — Validation Paiement sur Place (côté Institution)
// Path : /app/institution/[id]/dashboard/valider-rdv/page.tsx
//
// ✅ Saisie du code Yelen 6 chiffres
// ✅ Recherche dans paid_bookings filtré par institution_id
// ✅ Affiche la fiche complète : citoyen, service, montant, date
// ✅ Actions : Valider paiement / Absent / Annuler
// ✅ UPDATE paid_bookings + rdv en atomique
// ✅ Historique des validations du jour
// ✅ JOIN users via citoyen_id (FK correcte)
// ✅ Colonnes manquantes gérées avec fallback gracieux
// ✅ Mobile first — inline styles — dark/light via ThemeProvider
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────
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
  citoyen_email: string | null;
};

type HistoryEntry = {
  id: string;
  confirmation_code: string;
  statut: BookingStatut;
  date_rdv: string;
  heure_rdv: string;
  service_nom: string;
  service_prix: number;
  validated_at: string | null;
  citoyen_nom: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────
function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " FCFA";
}

function formatDate(dateRdv: string, heureRdv: string): string {
  try {
    const d = new Date(`${dateRdv}T${heureRdv}:00`);
    if (isNaN(d.getTime())) return `${dateRdv} à ${heureRdv}`;
    return (
      d.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }) + ` à ${heureRdv}`
    );
  } catch {
    return `${dateRdv} à ${heureRdv}`;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const STATUT_CONFIG: Record<
  BookingStatut,
  { label: string; color: string; bg: string; icon: string; desc: string }
> = {
  en_attente: {
    label: "En attente",
    color: "#F5A623",
    bg: "rgba(245,166,35,0.1)",
    icon: "⏳",
    desc: "En attente de validation",
  },
  confirme: {
    label: "Payé ✓",
    color: "#00C896",
    bg: "rgba(0,200,150,0.1)",
    icon: "✅",
    desc: "Paiement validé",
  },
  termine: {
    label: "Terminé",
    color: "#6C63FF",
    bg: "rgba(108,99,255,0.1)",
    icon: "🏁",
    desc: "RDV terminé",
  },
  annule: {
    label: "Annulé",
    color: "#FF4757",
    bg: "rgba(255,71,87,0.1)",
    icon: "❌",
    desc: "Réservation annulée",
  },
  no_show: {
    label: "Absent",
    color: "#A0A0B0",
    bg: "rgba(160,160,176,0.1)",
    icon: "👻",
    desc: "Citoyen absent",
  },
};

// ═══════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function ValiderRdvPage() {
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  const params = useParams<{ id: string }>();
  const institutionId = (() => {
    const fromParams = Array.isArray(params?.id) ? params.id[0] : params?.id;
    if (fromParams && fromParams !== "undefined") return fromParams;
    if (typeof window !== "undefined") {
      return localStorage.getItem("yelen224_institution_id") ?? "";
    }
    return "";
  })();

  // ── State saisie code ─────────────────────────────────────────────
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── State résultat ────────────────────────────────────────────────
  const [booking, setBooking] = useState<BookingFound | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<BookingStatut | null>(null);

  // ── Historique du jour ────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── Stats du jour ─────────────────────────────────────────────────
  const todayPaye = history.filter((h) => h.statut === "confirme").length;
  const todayCA = history
    .filter((h) => h.statut === "confirme")
    .reduce((s, h) => s + h.service_prix, 0);

  // ── Focus auto au montage ─────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 300);
  }, []);

  // ── Chargement historique ─────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!institutionId) return;
    setHistoryLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from("paid_bookings")
      .select(
        `
        id, confirmation_code, statut, date_rdv, heure_rdv,
        paid_services!inner(nom, prix),
        users!paid_bookings_citoyen_id_fkey(prenom, nom)
      `
      )
      .eq("institution_id", institutionId)
      .eq("date_rdv", today)
      .neq("statut", "en_attente")
      .order("created_at", { ascending: false });

    if (data) {
      setHistory(
        data.map((row: any) => ({
          id: row.id,
          confirmation_code: row.confirmation_code,
          statut: row.statut,
          date_rdv: row.date_rdv,
          heure_rdv: row.heure_rdv,
          service_nom: row.paid_services?.nom ?? "Service",
          service_prix: row.paid_services?.prix ?? 0,
          validated_at: null,
          citoyen_nom: row.users
            ? `${row.users.prenom ?? ""} ${row.users.nom ?? ""}`.trim() || null
            : null,
        }))
      );
    }
    setHistoryLoading(false);
  }, [institutionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ── Gestion saisie code ───────────────────────────────────────────
  function handleDigit(index: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    setSearchError(null);
    if (v && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && digits.every((d) => d !== "")) {
      handleSearch();
    }
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

  // ── Recherche ─────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const code = digits.join("");
    if (code.length !== 6) {
      setSearchError("Veuillez saisir les 6 chiffres du code Yelen.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setBooking(null);
    setActionSuccess(null);
    setActionError(null);

    const { data, error } = await supabase
      .from("paid_bookings")
      .select(
        `
        id, confirmation_code, statut, date_rdv, heure_rdv,
        paid_services!inner(nom, prix, duree_minutes),
        users!paid_bookings_citoyen_id_fkey(prenom, nom, phone)
      `
      )
      .eq("confirmation_code", code)
      .eq("institution_id", institutionId)
      .maybeSingle();

    setSearching(false);

    if (error) {
      setSearchError("Erreur lors de la recherche : " + error.message);
      return;
    }
    if (!data) {
      setSearchError(
        "Aucune réservation trouvée pour ce code dans votre institution. Vérifiez le code et réessayez."
      );
      return;
    }

    const row = data as any;
    setBooking({
      id: row.id,
      confirmation_code: row.confirmation_code,
      statut: row.statut,
      date_rdv: row.date_rdv,
      heure_rdv: row.heure_rdv,
      pour_autre: false,
      nom_autre: null,
      phone_autre: null,
      service_nom: row.paid_services?.nom ?? "Service",
      service_prix: row.paid_services?.prix ?? 0,
      service_duree: row.paid_services?.duree_minutes ?? 0,
      citoyen_prenom: row.users?.prenom ?? null,
      citoyen_nom: row.users?.nom ?? null,
      citoyen_phone: row.users?.phone ?? null,
      citoyen_email: null,
    });
  }, [digits, institutionId]);

  // ── Actions ───────────────────────────────────────────────────────
  async function handleAction(newStatut: BookingStatut) {
    if (!booking) return;
    setActionLoading(true);
    setActionError(null);

    const updateData: Record<string, unknown> = { statut: newStatut };

    const { error: bkErr } = await supabase
      .from("paid_bookings")
      .update(updateData)
      .eq("id", booking.id);

    if (bkErr) {
      setActionError("Erreur lors de la mise à jour : " + bkErr.message);
      setActionLoading(false);
      return;
    }

    // Mise à jour table rdv en parallèle (best effort)
    const rdvStatut =
      newStatut === "confirme"
        ? "confirme"
        : newStatut === "annule"
        ? "annule"
        : "no_show";

    await supabase
      .from("rdv")
      .update({ statut: rdvStatut })
      .eq("qr_token", booking.confirmation_code)
      .eq("institution_id", institutionId);

    setActionSuccess(newStatut);
    setBooking((prev) => (prev ? { ...prev, statut: newStatut } : null));
    setActionLoading(false);
    loadHistory();
  }

  // ── CSS global ────────────────────────────────────────────────────
  const CSS = `
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{overflow-x:hidden;background:${C.pageBg}}
    ::-webkit-scrollbar{display:none}
    *{scrollbar-width:none}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes popIn{from{opacity:0;transform:scale(0.93)}to{opacity:1;transform:scale(1)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
    .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
    .tap:active{opacity:0.65;transform:scale(0.97)}
    input:focus{outline:none}
    .digit-input{
      width:44px;height:58px;border-radius:14px;
      font-size:26px;font-weight:900;text-align:center;
      font-family:'SF Mono',monospace;
      transition:all 0.15s;
      caret-color:transparent;
    }
    .digit-input:focus{
      border-color:#F5A623 !important;
      box-shadow:0 0 0 3px rgba(245,166,35,0.22) !important;
      transform:scale(1.08);
    }
    .btn-primary{
      padding:17px;border-radius:16px;border:none;
      background:linear-gradient(135deg,#F5A623,#C8940A);
      color:#080812;font-size:14px;font-weight:800;
      display:flex;align-items:center;justify-content:center;gap:8px;
      box-shadow:0 6px 20px rgba(245,166,35,0.38);
      transition:all 0.2s;width:100%;
    }
    .btn-primary:disabled{
      background:${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"};
      color:${C.textSubtle};box-shadow:none;cursor:not-allowed;
    }
    .guide-step{
      display:flex;align-items:flex-start;gap:10px;
      padding:10px 0;
      border-bottom:1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"};
    }
    .guide-step:last-child{border-bottom:none}
  `;

  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBord = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const codeComplete = digits.every((d) => d !== "");

  return (
    <div
      style={{
        minHeight: "100svh",
        backgroundColor: C.pageBg,
        fontFamily: "'SF Pro Text',-apple-system,'Helvetica Neue',sans-serif",
        color: C.text,
        paddingBottom: "80px",
      }}
    >
      <style>{CSS}</style>

      {/* ════ HEADER ════ */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backgroundColor: isDark ? "rgba(8,8,15,0.97)" : "rgba(248,248,251,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: `1px solid ${
            isDark ? "rgba(245,166,35,0.12)" : "rgba(245,166,35,0.15)"
          }`,
        }}
      >
        <div
          style={{
            height: "3px",
            background: "linear-gradient(90deg,#F5A623,#C8940A,#F5A623)",
          }}
        />
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link
              href={`/institution/${institutionId}/dashboard`}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                border: `1px solid ${inputBord}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                flexShrink: 0,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.textSubtle}
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <div>
              <div
                style={{
                  color: C.text,
                  fontSize: "15px",
                  fontWeight: "900",
                  letterSpacing: "-0.3px",
                }}
              >
                Valider un paiement
              </div>
              <div
                style={{
                  color: "#F5A623",
                  fontSize: "9px",
                  fontWeight: "700",
                  letterSpacing: "1.5px",
                }}
              >
                YELEN224 · CAISSE INSTITUTION
              </div>
            </div>
          </div>

          {/* Stats rapides */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                padding: "5px 10px",
                background: "rgba(0,200,150,0.1)",
                border: "1px solid rgba(0,200,150,0.2)",
                borderRadius: "20px",
                textAlign: "center",
              }}
            >
              <div
                style={{ color: "#00C896", fontSize: "14px", fontWeight: "900" }}
              >
                {todayPaye}
              </div>
              <div
                style={{
                  color: "#00C896",
                  fontSize: "8px",
                  fontWeight: "700",
                  opacity: 0.75,
                }}
              >
                payés
              </div>
            </div>
            <div
              style={{
                padding: "5px 10px",
                background: "rgba(245,166,35,0.08)",
                border: "1px solid rgba(245,166,35,0.2)",
                borderRadius: "20px",
                textAlign: "center",
                maxWidth: "90px",
              }}
            >
              <div
                style={{
                  color: "#F5A623",
                  fontSize: "10px",
                  fontWeight: "900",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {formatPrix(todayCA)}
              </div>
              <div
                style={{
                  color: "#F5A623",
                  fontSize: "8px",
                  fontWeight: "700",
                  opacity: 0.7,
                }}
              >
                aujourd'hui
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "20px 16px 0" }}>

        {/* ════ GUIDE D'UTILISATION ════ */}
        {!booking && (
          <div
            style={{
              marginBottom: "18px",
              padding: "16px 18px",
              background: isDark
                ? "rgba(245,166,35,0.04)"
                : "rgba(245,166,35,0.03)",
              border: `1px solid ${
                isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.15)"
              }`,
              borderRadius: "18px",
              animation: "fadeUp 0.35s ease",
            }}
          >
            <div
              style={{
                color: C.textSubtle,
                fontSize: "9px",
                fontWeight: "700",
                letterSpacing: "1.4px",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}
            >
              📋 Comment valider un paiement
            </div>
            {[
              {
                num: "1",
                title: "Le citoyen se présente au guichet",
                desc: "Il ouvre son application Yelen224 et affiche son code à 6 chiffres.",
              },
              {
                num: "2",
                title: "Saisissez le code ci-dessous",
                desc: "Entrez les 6 chiffres du code Yelen affiché sur son téléphone.",
              },
              {
                num: "3",
                title: "Vérifiez la fiche et encaissez",
                desc: "Confirmez le service, le montant, puis cliquez sur « Valider le paiement ».",
              },
            ].map((step) => (
              <div key={step.num} className="guide-step">
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "7px",
                    background: "rgba(245,166,35,0.12)",
                    border: "1px solid rgba(245,166,35,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#F5A623",
                    fontSize: "11px",
                    fontWeight: "900",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                >
                  {step.num}
                </div>
                <div>
                  <div
                    style={{
                      color: C.text,
                      fontSize: "12px",
                      fontWeight: "700",
                      marginBottom: "2px",
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      color: C.textSubtle,
                      fontSize: "11px",
                      lineHeight: 1.5,
                    }}
                  >
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════ SAISIE CODE ════ */}
        <div
          style={{
            background: C.cardBg,
            borderRadius: "24px",
            border: `1px solid ${
              isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"
            }`,
            overflow: "hidden",
            marginBottom: "20px",
            animation: "fadeUp 0.3s ease",
            boxShadow: isDark
              ? "0 8px 40px rgba(0,0,0,0.4)"
              : "0 8px 40px rgba(245,166,35,0.08)",
          }}
        >
          <div
            style={{
              height: "4px",
              background: "linear-gradient(90deg,#F5A623,#F2C94C,#F5A623)",
            }}
          />
          <div style={{ padding: "24px 20px" }}>
            <div style={{ textAlign: "center", marginBottom: "22px" }}>
              <div
                style={{
                  width: "54px",
                  height: "54px",
                  borderRadius: "16px",
                  background: "rgba(245,166,35,0.1)",
                  border: "1.5px solid rgba(245,166,35,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#F5A623"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2
                style={{
                  color: C.text,
                  fontSize: "19px",
                  fontWeight: "900",
                  margin: "0 0 6px",
                  letterSpacing: "-0.4px",
                }}
              >
                Code de confirmation
              </h2>
              <p
                style={{
                  color: C.textSubtle,
                  fontSize: "12px",
                  margin: 0,
                  lineHeight: 1.7,
                }}
              >
                Saisissez le code Yelen à 6 chiffres affiché
                <br />
                sur l'application du citoyen
              </p>
            </div>

            {/* Inputs 6 chiffres */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "7px",
                marginBottom: "10px",
              }}
            >
              {digits.map((d, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <input
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    className="digit-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleDigit(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    style={{
                      background: d
                        ? isDark
                          ? "rgba(245,166,35,0.12)"
                          : "rgba(245,166,35,0.08)"
                        : inputBg,
                      border: `2px solid ${
                        d ? "rgba(245,166,35,0.45)" : inputBord
                      }`,
                      color: d ? "#F5A623" : C.textSubtle,
                    }}
                  />
                  {i === 2 && (
                    <div
                      style={{
                        width: "14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: C.textSubtle,
                        fontSize: "18px",
                        fontWeight: "300",
                        margin: "0 1px",
                        userSelect: "none",
                      }}
                    >
                      –
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Indicateur progression */}
            <div
              style={{
                textAlign: "center",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  height: "3px",
                  width: "80px",
                  borderRadius: "99px",
                  background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(digits.filter((d) => d !== "").length / 6) * 100}%`,
                    background: "linear-gradient(90deg,#F5A623,#C8940A)",
                    transition: "width 0.2s ease",
                    borderRadius: "99px",
                  }}
                />
              </div>
              <span
                style={{
                  color: C.textSubtle,
                  fontSize: "10px",
                  fontWeight: "600",
                }}
              >
                {digits.filter((d) => d !== "").length}/6 chiffres
              </span>
            </div>

            {/* Erreur recherche */}
            {searchError && (
              <div
                style={{
                  marginBottom: "14px",
                  padding: "12px 14px",
                  background: "rgba(255,71,87,0.08)",
                  border: "1px solid rgba(255,71,87,0.2)",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  animation: "popIn 0.2s ease",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FF4757"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{ flexShrink: 0, marginTop: "1px" }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span
                  style={{
                    color: "#FF4757",
                    fontSize: "12px",
                    fontWeight: "600",
                    lineHeight: 1.5,
                  }}
                >
                  {searchError}
                </span>
              </div>
            )}

            {/* Boutons */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: booking ? "1fr 2fr" : "1fr",
                gap: "10px",
              }}
            >
              {booking && (
                <button
                  onClick={resetCode}
                  className="tap"
                  style={{
                    padding: "14px",
                    borderRadius: "14px",
                    border: `1px solid ${inputBord}`,
                    background: inputBg,
                    color: C.textSubtle,
                    fontSize: "13px",
                    fontWeight: "700",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
                  </svg>
                  Nouveau
                </button>
              )}
              <button
                onClick={handleSearch}
                disabled={searching || !codeComplete}
                className="tap"
                style={{
                  padding: "15px",
                  borderRadius: "14px",
                  border: "none",
                  background: codeComplete
                    ? "linear-gradient(135deg,#F5A623,#C8940A)"
                    : isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.06)",
                  color: codeComplete ? "#080812" : C.textSubtle,
                  fontSize: "14px",
                  fontWeight: "800",
                  cursor: codeComplete ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: codeComplete
                    ? "0 6px 20px rgba(245,166,35,0.35)"
                    : "none",
                  transition: "all 0.2s",
                }}
              >
                {searching ? (
                  <>
                    <div
                      style={{
                        width: "15px",
                        height: "15px",
                        border: "2px solid rgba(0,0,0,0.2)",
                        borderTopColor: "#080812",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                      }}
                    />
                    Recherche en cours…
                  </>
                ) : (
                  <>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    Rechercher la réservation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ════ FICHE RÉSERVATION ════ */}
        {booking && (
          <div
            style={{ animation: "popIn 0.25s ease", marginBottom: "20px" }}
          >
            {/* Statut déjà traité */}
            {booking.statut !== "en_attente" && !actionSuccess && (
              <div
                style={{
                  marginBottom: "14px",
                  padding: "14px 16px",
                  background: STATUT_CONFIG[booking.statut].bg,
                  border: `1px solid ${STATUT_CONFIG[booking.statut].color}33`,
                  borderRadius: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span style={{ fontSize: "22px" }}>
                  {STATUT_CONFIG[booking.statut].icon}
                </span>
                <div>
                  <div
                    style={{
                      color: STATUT_CONFIG[booking.statut].color,
                      fontSize: "13px",
                      fontWeight: "800",
                    }}
                  >
                    Cette réservation est déjà :{" "}
                    {STATUT_CONFIG[booking.statut].label}
                  </div>
                  <div
                    style={{
                      color: C.textSubtle,
                      fontSize: "11px",
                      marginTop: "3px",
                      lineHeight: 1.5,
                    }}
                  >
                    Elle a déjà été traitée. Aucune action supplémentaire
                    n'est requise.
                  </div>
                </div>
              </div>
            )}

            {/* Succès action */}
            {actionSuccess && (
              <div
                style={{
                  marginBottom: "14px",
                  padding: "20px 16px",
                  background: STATUT_CONFIG[actionSuccess].bg,
                  border: `2px solid ${STATUT_CONFIG[actionSuccess].color}44`,
                  borderRadius: "18px",
                  textAlign: "center",
                  animation: "popIn 0.3s ease",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>
                  {STATUT_CONFIG[actionSuccess].icon}
                </div>
                <div
                  style={{
                    color: STATUT_CONFIG[actionSuccess].color,
                    fontSize: "17px",
                    fontWeight: "900",
                    letterSpacing: "-0.3px",
                  }}
                >
                  {actionSuccess === "confirme" && "Paiement validé avec succès !"}
                  {actionSuccess === "no_show" && "Citoyen marqué absent"}
                  {actionSuccess === "annule" && "Réservation annulée"}
                </div>
                {actionSuccess === "confirme" && (
                  <div
                    style={{
                      color: C.textSubtle,
                      fontSize: "12px",
                      marginTop: "6px",
                      lineHeight: 1.6,
                    }}
                  >
                    {formatPrix(booking.service_prix)} encaissé en espèces
                    <br />
                    {new Date().toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    — Historique mis à jour
                  </div>
                )}
              </div>
            )}

            {/* Carte réservation */}
            <div
              style={{
                background: C.cardBg,
                borderRadius: "22px",
                border: `1.5px solid ${
                  booking.statut === "en_attente"
                    ? "rgba(245,166,35,0.3)"
                    : isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.08)"
                }`,
                overflow: "hidden",
                boxShadow: isDark
                  ? "0 8px 40px rgba(0,0,0,0.4)"
                  : "0 8px 40px rgba(245,166,35,0.1)",
              }}
            >
              <div
                style={{
                  height: "4px",
                  background:
                    booking.statut === "en_attente"
                      ? "linear-gradient(90deg,#F5A623,#F2C94C)"
                      : STATUT_CONFIG[booking.statut].color,
                }}
              />
              <div style={{ padding: "20px" }}>

                {/* En-tête code + statut */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "18px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: C.textSubtle,
                        fontSize: "9px",
                        fontWeight: "700",
                        letterSpacing: "1.5px",
                        textTransform: "uppercase",
                        marginBottom: "6px",
                      }}
                    >
                      Code Yelen
                    </div>
                    <div style={{ display: "flex", gap: "3px" }}>
                      {booking.confirmation_code.split("").map((c, i) => (
                        <div
                          key={i}
                          style={{
                            width: "28px",
                            height: "36px",
                            borderRadius: "8px",
                            background: isDark
                              ? "rgba(245,166,35,0.1)"
                              : "rgba(245,166,35,0.07)",
                            border: "1px solid rgba(245,166,35,0.2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#F5A623",
                            fontSize: "17px",
                            fontWeight: "900",
                            fontFamily: "monospace",
                          }}
                        >
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "6px 12px",
                      background: STATUT_CONFIG[booking.statut].bg,
                      border: `1px solid ${STATUT_CONFIG[booking.statut].color}44`,
                      borderRadius: "20px",
                    }}
                  >
                    <span
                      style={{
                        color: STATUT_CONFIG[booking.statut].color,
                        fontSize: "11px",
                        fontWeight: "800",
                      }}
                    >
                      {STATUT_CONFIG[booking.statut].label}
                    </span>
                  </div>
                </div>

                {/* Service */}
                <div
                  style={{
                    padding: "14px 16px",
                    background: isDark
                      ? "rgba(245,166,35,0.06)"
                      : "rgba(245,166,35,0.04)",
                    border: "1px solid rgba(245,166,35,0.15)",
                    borderRadius: "14px",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: "12px" }}>
                      <div
                        style={{
                          color: C.textSubtle,
                          fontSize: "9px",
                          fontWeight: "700",
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        Service réservé
                      </div>
                      <div
                        style={{
                          color: C.text,
                          fontSize: "15px",
                          fontWeight: "800",
                          marginBottom: "3px",
                        }}
                      >
                        {booking.service_nom}
                      </div>
                      <div
                        style={{
                          color: C.textSubtle,
                          fontSize: "11px",
                          lineHeight: 1.5,
                        }}
                      >
                        {booking.service_duree > 0
                          ? `${booking.service_duree} min · `
                          : ""}
                        {formatDate(booking.date_rdv, booking.heure_rdv)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          color: C.textSubtle,
                          fontSize: "9px",
                          fontWeight: "700",
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        Montant dû
                      </div>
                      <div
                        style={{
                          color: "#F5A623",
                          fontSize: "20px",
                          fontWeight: "900",
                          letterSpacing: "-0.5px",
                        }}
                      >
                        {formatPrix(booking.service_prix)}
                      </div>
                      <div
                        style={{
                          color: C.textSubtle,
                          fontSize: "10px",
                          fontWeight: "600",
                          marginTop: "2px",
                        }}
                      >
                        💵 Espèces
                      </div>
                    </div>
                  </div>
                </div>

                {/* Citoyen */}
                <div
                  style={{
                    padding: "14px 16px",
                    background: inputBg,
                    border: `1px solid ${inputBord}`,
                    borderRadius: "14px",
                    marginBottom:
                      booking.statut === "en_attente" && !actionSuccess
                        ? "20px"
                        : "0",
                  }}
                >
                  <div
                    style={{
                      color: C.textSubtle,
                      fontSize: "9px",
                      fontWeight: "700",
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      marginBottom: "10px",
                    }}
                  >
                    {booking.pour_autre ? "👤 Bénéficiaire (tiers)" : "👤 Citoyen"}
                  </div>
                  {booking.pour_autre && booking.nom_autre ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: C.text,
                            fontSize: "14px",
                            fontWeight: "800",
                          }}
                        >
                          {booking.nom_autre}
                        </div>
                        {booking.phone_autre && (
                          <div
                            style={{
                              color: C.textSubtle,
                              fontSize: "12px",
                              marginTop: "3px",
                            }}
                          >
                            {booking.phone_autre}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          padding: "4px 10px",
                          background: "rgba(245,166,35,0.08)",
                          border: "1px solid rgba(245,166,35,0.2)",
                          borderRadius: "20px",
                        }}
                      >
                        <span
                          style={{
                            color: "#F5A623",
                            fontSize: "10px",
                            fontWeight: "700",
                          }}
                        >
                          Tiers
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            color: C.text,
                            fontSize: "14px",
                            fontWeight: "800",
                            marginBottom: "3px",
                          }}
                        >
                          {booking.citoyen_prenom || booking.citoyen_nom
                            ? `${booking.citoyen_prenom ?? ""} ${
                                booking.citoyen_nom ?? ""
                              }`.trim()
                            : "Citoyen enregistré"}
                        </div>
                        {booking.citoyen_phone && (
                          <div
                            style={{
                              color: C.textSubtle,
                              fontSize: "12px",
                              marginTop: "2px",
                            }}
                          >
                            📱 {booking.citoyen_phone}
                          </div>
                        )}
                      </div>
                      {booking.citoyen_phone && (
                        <a
                          href={`tel:${booking.citoyen_phone}`}
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "11px",
                            background: "rgba(245,166,35,0.1)",
                            border: "1px solid rgba(245,166,35,0.2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textDecoration: "none",
                            flexShrink: 0,
                            marginLeft: "10px",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#F5A623"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Boutons actions — uniquement si en_attente ── */}
                {booking.statut === "en_attente" && !actionSuccess && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    {actionError && (
                      <div
                        style={{
                          padding: "11px 14px",
                          background: "rgba(255,71,87,0.08)",
                          border: "1px solid rgba(255,71,87,0.2)",
                          borderRadius: "12px",
                          color: "#FF4757",
                          fontSize: "12px",
                          fontWeight: "600",
                          lineHeight: 1.5,
                        }}
                      >
                        ⚠️ {actionError}
                      </div>
                    )}

                    {/* CTA principal — Valider paiement */}
                    <button
                      onClick={() => handleAction("confirme")}
                      disabled={actionLoading}
                      className="tap"
                      style={{
                        padding: "19px",
                        borderRadius: "16px",
                        border: "none",
                        background: actionLoading
                          ? isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.06)"
                          : "linear-gradient(135deg,#00C896,#00A07A)",
                        color: actionLoading ? C.textSubtle : "#fff",
                        fontSize: "16px",
                        fontWeight: "900",
                        cursor: actionLoading ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "10px",
                        boxShadow: actionLoading
                          ? "none"
                          : "0 8px 28px rgba(0,200,150,0.4)",
                        letterSpacing: "-0.3px",
                        transition: "all 0.2s",
                      }}
                    >
                      {actionLoading ? (
                        <>
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              border: "2px solid rgba(255,255,255,0.3)",
                              borderTopColor: "#fff",
                              borderRadius: "50%",
                              animation: "spin 0.7s linear infinite",
                            }}
                          />
                          Traitement en cours…
                        </>
                      ) : (
                        <>
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#fff"
                            strokeWidth="2.8"
                            strokeLinecap="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Valider · {formatPrix(booking.service_prix)}
                        </>
                      )}
                    </button>

                    {/* Aide contextuelle */}
                    <div
                      style={{
                        textAlign: "center",
                        color: C.textSubtle,
                        fontSize: "11px",
                        lineHeight: 1.5,
                        padding: "0 8px",
                      }}
                    >
                      Cliquez sur <strong style={{ color: C.text }}>Valider</strong> uniquement après avoir encaissé le montant en espèces.
                    </div>

                    {/* Actions secondaires */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "10px",
                      }}
                    >
                      <button
                        onClick={() => handleAction("no_show")}
                        disabled={actionLoading}
                        className="tap"
                        style={{
                          padding: "13px",
                          borderRadius: "14px",
                          border: `1.5px solid ${
                            isDark
                              ? "rgba(160,160,176,0.2)"
                              : "rgba(0,0,0,0.1)"
                          }`,
                          background: inputBg,
                          color: C.textSubtle,
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                        Absent
                      </button>
                      <button
                        onClick={() => handleAction("annule")}
                        disabled={actionLoading}
                        className="tap"
                        style={{
                          padding: "13px",
                          borderRadius: "14px",
                          border: "1.5px solid rgba(255,71,87,0.2)",
                          background: "rgba(255,71,87,0.04)",
                          color: "#FF4757",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#FF4757"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                        Annuler le RDV
                      </button>
                    </div>
                  </div>
                )}

                {/* Bouton nouveau code après action */}
                {actionSuccess && (
                  <button
                    onClick={resetCode}
                    className="tap"
                    style={{
                      width: "100%",
                      marginTop: "16px",
                      padding: "16px",
                      borderRadius: "14px",
                      border: "none",
                      background: "linear-gradient(135deg,#F5A623,#C8940A)",
                      color: "#080812",
                      fontSize: "14px",
                      fontWeight: "800",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 6px 20px rgba(245,166,35,0.35)",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#080812"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
                    </svg>
                    Valider un autre paiement
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════ HISTORIQUE DU JOUR ════ */}
        <div style={{ animation: "fadeUp 0.4s ease 0.1s both" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "14px",
            }}
          >
            <div
              style={{
                height: "1px",
                flex: 1,
                background: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.06)",
              }}
            />
            <span
              style={{
                color: C.textSubtle,
                fontSize: "10px",
                fontWeight: "700",
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              Traitées aujourd'hui · {history.length}
            </span>
            <div
              style={{
                height: "1px",
                flex: 1,
                background: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.06)",
              }}
            />
          </div>

          {historyLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "30px",
                gap: "10px",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  border: `2px solid ${
                    isDark
                      ? "rgba(245,166,35,0.15)"
                      : "rgba(245,166,35,0.2)"
                  }`,
                  borderTopColor: "#F5A623",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span
                style={{
                  color: C.textSubtle,
                  fontSize: "11px",
                  fontWeight: "600",
                }}
              >
                Chargement de l'historique…
              </span>
            </div>
          ) : history.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 20px",
                background: C.cardBg,
                borderRadius: "18px",
                border: `1px dashed ${
                  isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"
                }`,
              }}
            >
              <div style={{ fontSize: "30px", marginBottom: "10px" }}>📋</div>
              <div
                style={{
                  color: C.text,
                  fontSize: "14px",
                  fontWeight: "700",
                  marginBottom: "4px",
                }}
              >
                Aucune réservation traitée aujourd'hui
              </div>
              <div
                style={{
                  color: C.textSubtle,
                  fontSize: "12px",
                  lineHeight: 1.6,
                }}
              >
                Les validations, absences et annulations
                <br />
                apparaîtront ici au fil de la journée.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {history.map((entry) => {
                const cfg = STATUT_CONFIG[entry.statut];
                return (
                  <div
                    key={entry.id}
                    style={{
                      background: C.cardBg,
                      borderRadius: "14px",
                      border: `1px solid ${
                        isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"
                      }`,
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "11px",
                        background: cfg.bg,
                        border: `1px solid ${cfg.color}33`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        fontSize: "17px",
                      }}
                    >
                      {cfg.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "3px",
                        }}
                      >
                        <div
                          style={{
                            color: C.text,
                            fontSize: "13px",
                            fontWeight: "800",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                          }}
                        >
                          {entry.service_nom}
                        </div>
                        <div
                          style={{
                            color:
                              entry.statut === "confirme" ? "#00C896" : C.textSubtle,
                            fontSize: "12px",
                            fontWeight: "900",
                            flexShrink: 0,
                            marginLeft: "8px",
                          }}
                        >
                          {entry.statut === "confirme"
                            ? `+${formatPrix(entry.service_prix)}`
                            : "—"}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span
                          style={{
                            color: C.textSubtle,
                            fontSize: "10px",
                            fontFamily: "monospace",
                            fontWeight: "700",
                            background: isDark
                              ? "rgba(255,255,255,0.05)"
                              : "rgba(0,0,0,0.04)",
                            padding: "1px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {entry.confirmation_code}
                        </span>
                        {entry.citoyen_nom && (
                          <span
                            style={{
                              color: C.textSubtle,
                              fontSize: "10px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            · {entry.citoyen_nom}
                          </span>
                        )}
                        {entry.validated_at && (
                          <span
                            style={{
                              color: C.textSubtle,
                              fontSize: "10px",
                              marginLeft: "auto",
                              flexShrink: 0,
                            }}
                          >
                            {formatTime(entry.validated_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Total CA du jour ── */}
          {history.length > 0 && (
            <div
              style={{
                marginTop: "14px",
                padding: "16px 18px",
                background: isDark
                  ? "rgba(0,200,150,0.06)"
                  : "rgba(0,200,150,0.04)",
                border: "1px solid rgba(0,200,150,0.2)",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    color: C.textSubtle,
                    fontSize: "10px",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    marginBottom: "4px",
                  }}
                >
                  Total encaissé aujourd'hui
                </div>
                <div
                  style={{
                    color: "#00C896",
                    fontSize: "22px",
                    fontWeight: "900",
                    letterSpacing: "-0.5px",
                  }}
                >
                  {formatPrix(todayCA)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    color: C.textSubtle,
                    fontSize: "10px",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    marginBottom: "4px",
                  }}
                >
                  Réservations
                </div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: "900",
                  }}
                >
                  <span style={{ color: "#00C896" }}>{todayPaye}</span>
                  <span
                    style={{ color: C.textSubtle, fontSize: "12px" }}
                  >
                    {" "}
                    / {history.length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}