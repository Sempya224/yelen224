"use client";
// ═══════════════════════════════════════════════════════════════════════
// YELEN224 — Prise de RDV (Wizard)
// Path : /app/rdv/[id]/page.tsx
//
// Refonte Lot D (décision CEO 16/07/2026) : le citoyen ne réserve plus un
// "rendez-vous" abstrait avec un motif libre — il réserve un SERVICE précis
// proposé par l'établissement (gratuit, "Offre générale" — institutions.
// services structuré, Lot A — ou payant, paid_services — réellement
// fonctionnel dès maintenant, aucun flag de gating : la restriction par
// abonnement/statut de compte est un mécanisme à concevoir séparément,
// plus tard, pas une raison de désactiver la fonctionnalité en attendant).
// Calendrier + créneaux dérivés de institutions.disponibilites +
// capacite_par_creneau (Lot B, via /api/rdv-disponibilite). Champs
// complémentaires configurés par service (Lot C) demandés seulement si le
// service en a. QR + code Yelen générés pour toute réservation (gratuite ou
// payante) — unifie l'ancienne dualité SuccessGratuit/SuccessPayant.
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import Link from "next/link";
import QRCode from "qrcode";
import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRdv, notifierReservationPayante } from "./actions";
import { type CreneauSlot, generateSlotsInRange, toISODate } from "@/lib/disponibilites";

// ─── Types ────────────────────────────────────────────────────────────
type InstitutionRow = {
  id: string;
  name: string;
  ville: string;
  quartier: string;
  adresse: string;
  phone: string;
  category: string;
  badge_verifie: boolean;
  logo: string | null;
  description: string | null;
  moyenne_avis: number;
  nb_avis: number;
  disponibilites: unknown;
  services: unknown;
  capacite_par_creneau: number;
};

type ChampComplementaire = { label: string; type: "texte" | "tel" | "numero"; requis: boolean };

type PaidServiceRow = {
  id: string;
  nom: string;
  prix: number;
  duree_minutes: number;
  description: string | null;
  champs_complementaires: ChampComplementaire[] | null;
};

// Service unifié — gratuit (Offre générale) ou payant (paid_services),
// tous deux réservables via le même wizard (principe CEO : "le citoyen
// réserve un service, jamais un motif abstrait").
type WizardService = {
  id: string;
  nom: string;
  description: string;
  duree_minutes: number;
  payant: boolean;
  prix: number;
  champs_complementaires: ChampComplementaire[];
  serviceIdForBooking?: string;
};

type Availability = { capacite: number; counts: Record<string, number> };

type StepId = "service" | "date" | "heure" | "recap" | "champs";

// ─── Utilitaires date ─────────────────────────────────────────────────
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_FR = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

function formatDateLabel(dateRdv: string, heureRdv: string): string {
  try {
    const d = new Date(`${dateRdv}T${heureRdv || "00:00"}:00`);
    if (isNaN(d.getTime())) return `${dateRdv} ${heureRdv}`.trim();
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + (heureRdv ? ` à ${heureRdv}` : "");
  } catch { return `${dateRdv} ${heureRdv}`.trim(); }
}

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " FCFA";
}

function buildIcs(opts: { title: string; description: string; location: string; dateRdv: string; heureRdv: string; durationMinutes: number }): string {
  const [y, mo, d] = opts.dateRdv.split("-").map(Number);
  const [hh, mm] = (opts.heureRdv || "00:00").split(":").map(Number);
  const start = new Date(y, mo - 1, d, hh, mm);
  const end = new Date(start.getTime() + Math.max(opts.durationMinutes, 15) * 60000);
  const fmt = (dt: Date) => `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}T${String(dt.getHours()).padStart(2, "0")}${String(dt.getMinutes()).padStart(2, "0")}00`;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Yelen224//RDV//FR", "BEGIN:VEVENT",
    `UID:${Date.now()}@yelen224`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${opts.title}`, `DESCRIPTION:${opts.description}`, `LOCATION:${opts.location}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

// ─── Métadonnées catégories ───────────────────────────────────────────
const CAT_META: Record<string, { svgPath: string; color: string }> = {
  "Hopital / Clinique":       { svgPath: "M12 5v14M5 12h14", color: "#F5A623" },
  "Ecole / Universite":       { svgPath: "M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6", color: "#F5A623" },
  "Mairie / Administration":  { svgPath: "M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6", color: "#F5A623" },
  "Banque / Microfinance":    { svgPath: "M3 21h18M3 7h18M3 3h18v4H3zM9 11v10M15 11v10", color: "#F5A623" },
  "Pharmacie":                { svgPath: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18", color: "#F5A623" },
  "Cabinet medical":          { svgPath: "M22 12h-4l-3 9L9 3l-3 9H2", color: "#F5A623" },
  "Tribunal / Justice":       { svgPath: "M12 3v18M3 9h18M3 15h18", color: "#F5A623" },
  "Transport / Logistique":   { svgPath: "M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3", color: "#F5A623" },
  "ONG / Association":        { svgPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", color: "#F5A623" },
  "Autre":                    { svgPath: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", color: "#F5A623" },
};

// ─── Composant Logo ───────────────────────────────────────────────────
function InstitutionLogo({ inst, size = 56 }: { inst: InstitutionRow; size?: number }) {
  const [err, setErr] = useState(false);
  const meta     = CAT_META[inst.category] || { svgPath: "", color: "#F5A623" };
  const initials = inst.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  if (inst.logo && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: "16px", overflow: "hidden", flexShrink: 0, border: `2px solid ${meta.color}30`, boxShadow: `0 0 0 4px ${meta.color}12` }}>
        <img src={inst.logo} alt={inst.name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "16px", flexShrink: 0, background: `linear-gradient(135deg, ${meta.color}25, ${meta.color}10)`, border: `2px solid ${meta.color}35`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", boxShadow: `0 0 0 4px ${meta.color}08` }}>
      <svg width={Math.round(size * 0.38)} height={Math.round(size * 0.38)} viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2" strokeLinecap="round"><path d={meta.svgPath}/></svg>
      <span style={{ color: meta.color, fontSize: "10px", fontWeight: "900", letterSpacing: "0.5px" }}>{initials || "?"}</span>
    </div>
  );
}

// ─── Carte Service unifiée (gratuit ou payant) ────────────────────────
function ServiceCard({ service, selected, onSelect, isDark, C, premium = false }: {
  service: WizardService; selected: boolean; onSelect: () => void; isDark: boolean; C: any; premium?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Le doré reste l'accent dominant sur toute la carte (marque Yelen224),
  // qu'un service soit gratuit ou payant — seul le petit badge de statut
  // change de couleur (vert/doré), pour ne pas laisser le vert écraser
  // l'identité de marque sur un écran où la majorité des services sont
  // gratuits (retour CEO 16/07/2026).
  const accent = "#F5A623";
  const statusColor = service.payant ? "#F5A623" : (isDark ? "#00C896" : "#00875A");
  return (
    <div style={{ borderRadius: "18px", border: selected ? `2px solid ${accent}` : `1.5px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`, background: selected ? `${accent}0d` : C.cardBg, overflow: "hidden", boxShadow: selected ? `0 0 0 4px ${accent}1f, 0 8px 32px ${accent}30` : isDark ? "0 2px 12px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.06)", transition: "all 0.2s" }}>
      {premium && <div style={{ height: "3px", background: `linear-gradient(90deg,${accent},#F2C94C,${accent})` }}/>}
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "13px", background: `${accent}15`, border: `1.5px solid ${accent}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {service.payant
              ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <span style={{ color: C.text, fontSize: "15px", fontWeight: "800", letterSpacing: "-0.3px" }}>{service.nom}</span>
              <span style={{ background: `${statusColor}18`, color: statusColor, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", textTransform: "uppercase" }}>{service.payant ? "Payant" : "Gratuit"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {service.payant && <span style={{ color: accent, fontSize: "16px", fontWeight: "900" }}>{formatPrix(service.prix)}</span>}
              {service.duree_minutes > 0 && (
                <>
                  {service.payant && <span style={{ color: C.textSubtle, fontSize: "11px" }}>·</span>}
                  <span style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600" }}>{service.duree_minutes} min</span>
                </>
              )}
            </div>
          </div>
          <div onClick={onSelect} className="tap" style={{ width: "26px", height: "26px", borderRadius: "50%", border: selected ? `2px solid ${accent}` : `2px solid ${isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`, background: selected ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {selected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
        </div>
        {service.description && (
          <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: accent, fontSize: "11px", fontWeight: "700", cursor: "pointer", padding: "8px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round">{expanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}</svg>
            {expanded ? "Masquer les détails" : "Voir les détails"}
          </button>
        )}
        {expanded && service.description && (
          <div style={{ marginTop: "8px", padding: "12px 14px", background: `${accent}0a`, borderRadius: "12px", border: `1px solid ${accent}25`, animation: "fadeUp 0.2s ease" }}>
            <p style={{ color: C.textMuted, fontSize: "12px", lineHeight: 1.7, margin: 0 }}>{service.description}</p>
          </div>
        )}
        {!selected && (
          <button onClick={onSelect} className="tap" style={{ width: "100%", marginTop: "12px", padding: "12px", borderRadius: "12px", border: `1.5px solid ${accent}50`, background: "transparent", color: accent, fontWeight: "800", fontSize: "13px", cursor: "pointer" }}>
            Choisir ce service
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Écran succès (unifié gratuit/payant) ─────────────────────────────
function SuccessScreen({ inst, service, code, dateRdv, heureRdv, C, isDark }: {
  inst: InstitutionRow; service: WizardService; code: string; dateRdv: string; heureRdv: string; C: any; isDark: boolean;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(code, { width: 168, margin: 1, color: { dark: "#080812", light: "#FFFFFF" } })
      .then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [code]);

  function handleCalendar() {
    const ics = buildIcs({
      title: `${service.nom} — ${inst.name}`,
      description: `Réservation Yelen224 — Code ${code}`,
      location: `${inst.adresse || inst.ville}`,
      dateRdv, heureRdv, durationMinutes: service.duree_minutes || 30,
    });
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "rendez-vous-yelen224.ics"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    const text = `Mon RDV chez ${inst.name} — ${service.nom} — ${formatDateLabel(dateRdv, heureRdv)} — Code Yelen ${code}`;
    if (navigator.share) { try { await navigator.share({ title: "Mon rendez-vous Yelen224", text }); } catch {} }
    else { try { await navigator.clipboard.writeText(text); } catch {} }
  }

  return (
    <div style={{ minHeight: "100svh", background: isDark ? "#080812" : "#FFFBF0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <div style={{ position: "relative", width: "80px", height: "80px" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(245,166,35,0.08)", border: "2px solid rgba(245,166,35,0.2)", animation: "ping 2s ease-out infinite" }}/>
            <div style={{ position: "relative", width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg,rgba(245,166,35,0.18),rgba(245,166,35,0.06))", border: "2px solid rgba(245,166,35,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        </div>
        <div style={{ background: C.cardBg, borderRadius: "24px", border: `1px solid ${isDark ? "rgba(245,166,35,0.2)" : "rgba(245,166,35,0.25)"}`, overflow: "hidden", boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.5)" : "0 12px 48px rgba(245,166,35,0.12)" }}>
          <div style={{ height: "4px", background: "linear-gradient(90deg,#F5A623,#F2C94C,#F5A623)" }}/>
          <div style={{ padding: "24px 22px" }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ color: "#F5A623", fontSize: "11px", fontWeight: "800", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "4px" }}>Votre rendez-vous est confirmé</div>
              <h2 style={{ color: C.text, fontSize: "19px", fontWeight: "900", margin: "0 0 4px" }}>{service.nom}</h2>
              <div style={{ color: C.textSubtle, fontSize: "12px" }}>{inst.name} · {inst.ville}</div>
            </div>

            {qrDataUrl && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                <img src={qrDataUrl} alt="QR code" style={{ width: "150px", height: "150px", borderRadius: "14px", border: "1.5px solid rgba(245,166,35,0.3)" }}/>
              </div>
            )}
            <div style={{ background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.04)", border: "1.5px solid rgba(245,166,35,0.3)", borderRadius: "16px", padding: "14px", marginBottom: "16px", textAlign: "center" }}>
              <div style={{ color: C.textSubtle, fontSize: "9px", fontWeight: "700", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "6px" }}>Code de confirmation Yelen</div>
              <div style={{ color: "#F5A623", fontSize: "22px", fontWeight: "900", fontFamily: "monospace", letterSpacing: "3px" }}>{code}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
              {[
                { label: "Date & heure", value: formatDateLabel(dateRdv, heureRdv) },
                { label: "Prix", value: service.payant ? `${formatPrix(service.prix)} (sur place)` : "Gratuit" },
                { label: "Durée prévue", value: service.duree_minutes > 0 ? `${service.duree_minutes} minutes` : "—" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "9px 12px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: "10px" }}>
                  <span style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "600" }}>{row.label}</span>
                  <span style={{ color: C.text, fontSize: "12px", fontWeight: "700" }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
              <button onClick={handleCalendar} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.text, fontWeight: "700", fontSize: "12.5px", padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Calendrier
              </button>
              <button onClick={handleShare} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.text, fontWeight: "700", fontSize: "12.5px", padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>
                Partager
              </button>
            </div>
            <p style={{ color: C.textSubtle, fontSize: "11.5px", textAlign: "center", margin: "0 0 10px" }}>
              Retrouvez ce QR et ce code à tout moment dans <strong style={{ color: C.text }}>Mon QR</strong>.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <Link href="/mon-qr" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px", textDecoration: "none" }}>
                Mon QR
              </Link>
              <Link href="/mes-rdv" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.text, fontWeight: "700", fontSize: "14px", padding: "15px", borderRadius: "14px", textDecoration: "none" }}>
                Mes RDV
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function RdvPage() {
  const { theme } = useTheme();
  const C         = T[theme];
  const isDark    = theme === "dark";
  const inputBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBord = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const params = useParams<{ id: string }>();
  const id     = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [institution, setInstitution] = useState<InstitutionRow | null>(null);
  const [paidServicesRaw, setPaidServicesRaw] = useState<PaidServiceRow[]>([]);
  const [availability, setAvailability] = useState<Availability>({ capacite: 1, counts: {} });

  const [step, setStep]                     = useState<StepId>("service");
  const [selectedService, setSelectedService] = useState<WizardService | null>(null);
  const [calendarMonth, setCalendarMonth]   = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [selectedDate, setSelectedDate]     = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot]     = useState<CreneauSlot | null>(null);
  const [forOther, setForOther]             = useState(false);
  const [otherName, setOtherName]           = useState("");
  const [otherPhone, setOtherPhone]         = useState("");
  const [champsReponses, setChampsReponses] = useState<Record<string, string>>({});
  const [descriptionBesoin, setDescriptionBesoin] = useState("");
  const [submitting, setSubmitting]         = useState(false);
  const [submitError, setSubmitError]       = useState<string | null>(null);
  const [success, setSuccess]               = useState<{ code: string; dateRdv: string; heureRdv: string } | null>(null);

  useEffect(() => {
    const userId = typeof window !== "undefined" ? localStorage.getItem(YELEN224_USER_ID_KEY) : null;
    if (!userId?.trim()) {
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.replace(`/inscription?redirect=${returnUrl}`);
    }
  }, [router]);

  const load = useCallback(async (institutionId: string) => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("institutions")
      .select("id,name,ville,quartier,adresse,phone,category,badge_verifie,logo,description,moyenne_avis,nb_avis,disponibilites,services,capacite_par_creneau")
      .eq("id", institutionId)
      .maybeSingle();
    if (error) { setLoadError(error.message); return; }
    if (!data)  { notFound(); return; }
    const row = data as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    if (!name) { setLoadError("Établissement invalide."); return; }
    setInstitution({
      id: String(row.id), name, ville: String(row.ville ?? "").trim(), quartier: String(row.quartier ?? "").trim(),
      adresse: String(row.adresse ?? "").trim(), phone: String(row.phone ?? "").trim(), category: String(row.category ?? "Autre").trim(),
      badge_verifie: Boolean(row.badge_verifie), logo: row.logo ? String(row.logo) : null,
      description: row.description ? String(row.description) : null,
      moyenne_avis: Number(row.moyenne_avis ?? 0), nb_avis: Number(row.nb_avis ?? 0),
      disponibilites: row.disponibilites, services: row.services,
      capacite_par_creneau: Number(row.capacite_par_creneau ?? 1),
    });

    const { data: services, error: servicesErr } = await supabase
      .from("paid_services")
      .select("id, nom, prix, duree_minutes, description, champs_complementaires, is_active")
      .eq("institution_id", institutionId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (servicesErr) console.error("[Yelen] paid_services fetch error:", servicesErr.message);
    setPaidServicesRaw(services ?? []);

    const from = toISODate(new Date());
    const toDate = new Date(); toDate.setDate(toDate.getDate() + 27);
    const to = toISODate(toDate);
    const res = await fetch(`/api/rdv-disponibilite?institution_id=${institutionId}&date_from=${from}&date_to=${to}`);
    const j = res.ok ? await res.json().catch(() => null) : null;
    setAvailability(j ? { capacite: j.capacite ?? 1, counts: j.counts ?? {} } : { capacite: 1, counts: {} });
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => { setLoading(true); await load(id); setLoading(false); })();
  }, [id, load]);

  const generalServices: WizardService[] = useMemo(() => {
    const raw = Array.isArray(institution?.services) ? institution!.services : [];
    return raw.map((s: unknown): WizardService | null => {
      const nom = typeof s === "string" ? s.trim() : String((s as Record<string, unknown>)?.nom ?? "").trim();
      if (!nom) return null;
      const o = typeof s === "object" && s ? (s as Record<string, unknown>) : {};
      return {
        id: `offre-${nom}`, nom,
        description: typeof o.description === "string" ? o.description : "",
        duree_minutes: typeof o.duree_minutes === "number" ? o.duree_minutes : 0,
        payant: false, prix: 0,
        champs_complementaires: Array.isArray(o.champs_complementaires) ? (o.champs_complementaires as ChampComplementaire[]) : [],
      };
    }).filter((s): s is WizardService => s !== null);
  }, [institution]);

  const paidWizardServices: WizardService[] = useMemo(() => {
    return paidServicesRaw.map(s => ({
      id: s.id, nom: s.nom, description: s.description ?? "", duree_minutes: s.duree_minutes,
      payant: true, prix: s.prix, champs_complementaires: s.champs_complementaires ?? [], serviceIdForBooking: s.id,
    }));
  }, [paidServicesRaw]);

  const allServices  = useMemo(() => [...generalServices, ...paidWizardServices], [generalServices, paidWizardServices]);
  const hasPremium   = paidWizardServices.length > 0;

  const allSlots = useMemo(() => institution ? generateSlotsInRange(institution.disponibilites, 28) : [], [institution]);
  const slotsByDate = useMemo(() => {
    const m = new Map<string, CreneauSlot[]>();
    for (const s of allSlots) { if (!m.has(s.dateRdv)) m.set(s.dateRdv, []); m.get(s.dateRdv)!.push(s); }
    return m;
  }, [allSlots]);

  function remainingFor(dateRdv: string, heureRdv: string): number {
    const used = availability.counts[`${dateRdv}|${heureRdv}`] ?? 0;
    return availability.capacite - used;
  }
  function dayStatus(dateRdv: string): "none" | "available" | "complet" {
    const slots = slotsByDate.get(dateRdv);
    if (!slots || slots.length === 0) return "none";
    return slots.some(s => remainingFor(s.dateRdv, s.heureRdv) > 0) ? "available" : "complet";
  }

  const steps: StepId[] = useMemo(() => [
    "service", "date", "heure", "recap",
    ...(selectedService && selectedService.champs_complementaires.length > 0 ? ["champs" as StepId] : []),
  ], [selectedService]);
  const stepIndex = steps.indexOf(step);

  function goToService(s: WizardService) {
    setSelectedService(s); setSelectedDate(null); setSelectedSlot(null);
    setStep("date");
  }

  function goToRecapOrConfirm() {
    if (selectedService && selectedService.champs_complementaires.length > 0) setStep("champs");
    else void handleConfirm();
  }

  async function handleConfirm() {
    if (!id || !institution || !selectedService || !selectedSlot) return;
    setSubmitError(null);
    if (forOther && (!otherName.trim() || !otherPhone.trim())) { setSubmitError("Renseignez le nom et le téléphone."); return; }
    for (const c of selectedService.champs_complementaires) {
      if (c.requis && !(champsReponses[c.label] ?? "").trim()) { setSubmitError(`Le champ "${c.label}" est requis.`); return; }
    }
    const userId = typeof window !== "undefined" ? localStorage.getItem(YELEN224_USER_ID_KEY) : null;
    if (!userId?.trim()) { setSubmitError("Vous devez être connecté."); return; }

    setSubmitting(true);
    try {
      const code = genCode();
      const reponses = selectedService.champs_complementaires.length > 0 ? champsReponses : null;
      const objet = `[${selectedService.nom}]${selectedService.payant ? ` ${formatPrix(selectedService.prix)} sur place` : ""}${forOther ? ` — Pour ${otherName.trim()} (${otherPhone.trim()})` : ""}`;
      const dureeMinutes = selectedService.duree_minutes > 0 ? selectedService.duree_minutes : null;
      const besoin = descriptionBesoin.trim() || null;

      if (selectedService.payant) {
        const { error: bkErr } = await supabase.from("paid_bookings").insert({
          service_id: selectedService.serviceIdForBooking, citoyen_id: userId.trim(), institution_id: id,
          date_rdv: selectedSlot.dateRdv, heure_rdv: selectedSlot.heureRdv || "00:00",
          confirmation_code: code, statut: "en_attente", champs_complementaires_reponses: reponses,
        });
        if (bkErr) { setSubmitError("Erreur lors de la réservation : " + bkErr.message); return; }
        const { data: rdvInserted, error: rdvErr } = await supabase.from("rdv").insert({
          citoyen_id: userId.trim(), institution_id: id, date_rdv: selectedSlot.dateRdv, heure_rdv: selectedSlot.heureRdv || "00:00",
          objet, statut: "en_attente", pour_autre: forOther, nom_autre: forOther ? otherName.trim() : null,
          phone_autre: forOther ? otherPhone.trim() : null, qr_token: code, champs_complementaires_reponses: reponses,
          duree_minutes: dureeMinutes, description_besoin: besoin,
        }).select("id").single();
        if (rdvErr) { setSubmitError("Erreur : " + rdvErr.message); return; }
        // Chantier "Yelen Assistant" (20/07/2026), Phase 1 — non-bloquant :
        // une erreur ici ne doit jamais faire échouer la réservation.
        if (rdvInserted?.id) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) await notifierReservationPayante({ rdvId: rdvInserted.id, accessToken: session.access_token });
          } catch (e) { console.error("[rdv] notification réservation payante:", e); }
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setSubmitError("Session expirée, reconnectez-vous."); return; }
        const result = await createRdv({
          citoyenId: userId.trim(), institutionId: id, dateRdv: selectedSlot.dateRdv, heureRdv: selectedSlot.heureRdv || "00:00",
          objet, pourAutre: forOther, nomAutre: forOther ? otherName.trim() : null, phoneAutre: forOther ? otherPhone.trim() : null,
          qrToken: code, champsComplementairesReponses: reponses, dureeMinutes, descriptionBesoin: besoin, accessToken: session.access_token,
        });
        if (!result.ok) { setSubmitError(result.error); return; }
      }
      setSuccess({ code, dateRdv: selectedSlot.dateRdv, heureRdv: selectedSlot.heureRdv });
    } finally { setSubmitting(false); }
  }

  if (loading) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
      <div style={{ width: "44px", height: "44px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      <p style={{ color: C.textSubtle, fontSize: "14px" }}>Chargement…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (loadError || !institution) return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
      <p style={{ color: "rgba(245,166,35,0.8)", fontSize: "15px", fontWeight: "600", marginBottom: "20px" }}>{loadError || "Institution introuvable"}</p>
      <Link href="/recherche" style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>Retour</Link>
    </div>
  );

  if (success) return <SuccessScreen inst={institution} service={selectedService!} code={success.code} dateRdv={success.dateRdv} heureRdv={success.heureRdv} C={C} isDark={isDark}/>;

  const CSS = `
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{overflow-x:hidden;background:${C.pageBg}}
    ::-webkit-scrollbar{display:none} *{scrollbar-width:none}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ping{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0;transform:scale(2.2)}}
    .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
    .tap:active{opacity:0.65;transform:scale(0.97)}
    textarea,input,select{font-family:inherit}
    input:focus,textarea:focus{outline:none}
  `;

  const backButton = (target: StepId) => (
    <button onClick={() => setStep(target)} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.textSubtle, fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: "0 0 16px" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Retour
    </button>
  );

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, color: C.text, paddingBottom: "40px" }}>
      <style>{CSS}</style>

      {/* HEADER — même bandeau doré que les écrans Compte, façon Booking.
          Mode sombre volontairement inchangé. */}
      {(() => {
        const hBg    = isDark ? "rgba(8,8,15,0.98)" : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
        const hBrd   = isDark ? `1px solid rgba(245,166,35,0.12)` : "none";
        const hText  = isDark ? C.text : "#080812";
        const hSub   = isDark ? "#F5A623" : "rgba(8,8,18,0.65)";
        const trackBg = isDark ? "rgba(245,166,35,0.1)" : "rgba(0,0,0,0.15)";
        const fillBg  = isDark ? "linear-gradient(90deg,#F5A623,#C8940A)" : "#ffffff";
        return (
        <div style={{ position: "sticky", top: 0, zIndex: 200, background: hBg, backdropFilter: isDark ? "blur(24px)" : "none", borderBottom: hBrd }}>
          <div style={{ height: "3px", background: trackBg }}>
            <div style={{ height: "100%", width: `${((stepIndex + 1) / steps.length) * 100}%`, background: fillBg, transition: "width 0.4s ease" }}/>
          </div>
          <div style={{ padding: "10px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <InstitutionLogo inst={institution} size={30}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: hText, fontSize: "12px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}>{institution.name}</div>
                <div style={{ color: hSub, fontSize: "9px", fontWeight: "700" }}>Étape {stepIndex + 1} / {steps.length}</div>
              </div>
            </div>
            <Link href={`/institution/${institution.id}`} style={{ color: hText, fontSize: "11px", fontWeight: "700", textDecoration: "none" }}>Fiche</Link>
          </div>
        </div>
        );
      })()}

      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "20px 16px 0" }}>

        {/* ═══ ÉTAPE 1 — Choisir un service ═══ */}
        {step === "service" && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            <h1 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Que souhaitez-vous faire aujourd'hui ?</h1>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Sélectionnez le service correspondant à votre besoin.</p>

            <div style={{ color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>Services de l'établissement</div>
            {allServices.length === 0 ? (
              <div style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px dashed ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`, borderRadius: "20px", padding: "28px 20px", textAlign: "center" }}>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Aucun service configuré.</div>
                <div style={{ color: C.textSubtle, fontSize: "12.5px", marginBottom: "16px" }}>Cet établissement ne propose actuellement aucun rendez-vous.</div>
                <Link href={`/institution/${institution.id}`} style={{ display: "inline-block", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "13px", padding: "10px 20px", borderRadius: "12px", textDecoration: "none" }}>Retour</Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: hasPremium ? "28px" : 0 }}>
                {allServices.map(s => <ServiceCard key={s.id} service={s} selected={selectedService?.id === s.id} onSelect={() => goToService(s)} isDark={isDark} C={C}/>)}
              </div>
            )}

            {hasPremium && (
              <>
                <h2 style={{ color: C.text, fontSize: "16px", fontWeight: "900", margin: "0 0 4px" }}>Services premium</h2>
                <p style={{ color: C.textSubtle, fontSize: "12.5px", margin: "0 0 14px" }}>Ces services nécessitent un paiement sur place ou selon les modalités définies par l'établissement.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {paidWizardServices.map(s => <ServiceCard key={`premium-${s.id}`} service={s} selected={selectedService?.id === s.id} onSelect={() => goToService(s)} isDark={isDark} C={C} premium/>)}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ ÉTAPE 2 — Choisir une date ═══ */}
        {step === "date" && selectedService && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {backButton("service")}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>Choisir une date</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Sélectionnez le jour qui vous convient pour <strong style={{ color: C.text }}>{selectedService.nom}</strong>.</p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <button onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })} className="tap" style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, cursor: "pointer" }}>‹</button>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", textTransform: "capitalize" }}>{MOIS_FR[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</div>
              <button onClick={() => setCalendarMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })} className="tap" style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.cardBg, border: `1px solid ${C.borderCard}`, color: C.text, cursor: "pointer" }}>›</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", marginBottom: "6px" }}>
              {JOURS_FR.map((j, i) => <div key={i} style={{ textAlign: "center", color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase" }}>{j}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px" }}>
              {(() => {
                const first = new Date(calendarMonth);
                const startOffset = first.getDay();
                const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
                const cells: (Date | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
                const today = new Date(); today.setHours(0, 0, 0, 0);
                return cells.map((d, i) => {
                  if (!d) return <div key={i}/>;
                  const iso = toISODate(d);
                  const isPast = d < today;
                  const st = isPast ? "none" : dayStatus(iso);
                  const disabled = isPast || st === "none" || st === "complet";
                  const sel = selectedDate === iso;
                  return (
                    <button key={i} disabled={disabled} onClick={() => { setSelectedDate(iso); setSelectedSlot(null); setStep("heure"); }} className={disabled ? "" : "tap"}
                      style={{ aspectRatio: "1", borderRadius: "10px", border: sel ? "2px solid #F5A623" : `1px solid ${C.borderCard}`, background: sel ? "rgba(245,166,35,0.15)" : disabled ? "transparent" : C.cardBg, color: disabled ? C.textSubtle : sel ? "#F5A623" : C.text, fontSize: "12px", fontWeight: sel ? "800" : "600", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1, position: "relative" }}>
                      {d.getDate()}
                      {st === "available" && !isPast && <div style={{ position: "absolute", bottom: "4px", left: "50%", transform: "translateX(-50%)", width: "4px", height: "4px", borderRadius: "50%", background: sel ? "#F5A623" : "#00C896" }}/>}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 3 — Choisir un horaire ═══ */}
        {step === "heure" && selectedService && selectedDate && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {backButton("date")}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>Choisir un horaire</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px", textTransform: "capitalize" }}>{new Date(selectedDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {(slotsByDate.get(selectedDate) ?? []).map(slot => {
                const remaining = remainingFor(slot.dateRdv, slot.heureRdv);
                const complet = remaining <= 0;
                const sel = selectedSlot?.key === slot.key;
                const label = complet ? "Complet" : remaining === 1 ? "Dernières places" : "Disponible";
                const labelColor = complet ? C.textSubtle : remaining === 1 ? "#F5A623" : "#00C896";
                return (
                  <button key={slot.key} disabled={complet} onClick={() => setSelectedSlot(slot)} className={complet ? "" : "tap"}
                    style={{ padding: "13px 12px", borderRadius: "14px", border: sel ? "2px solid #F5A623" : `1px solid ${C.borderCard}`, background: sel ? "rgba(245,166,35,0.1)" : complet ? "transparent" : C.cardBg, cursor: complet ? "default" : "pointer", textAlign: "left", opacity: complet ? 0.4 : 1 }}>
                    <div style={{ color: sel ? "#F5A623" : C.text, fontSize: "15px", fontWeight: "800", marginBottom: "2px" }}>{slot.heureRdv}</div>
                    <div style={{ color: labelColor, fontSize: "10px", fontWeight: "700" }}>{label}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => selectedSlot && setStep("recap")} disabled={!selectedSlot} className="tap" style={{ width: "100%", marginTop: "24px", padding: "16px", borderRadius: "16px", border: "none", background: selectedSlot ? "linear-gradient(135deg,#F5A623,#C8940A)" : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", color: selectedSlot ? "#080812" : C.textSubtle, fontSize: "15px", fontWeight: "800", cursor: selectedSlot ? "pointer" : "not-allowed" }}>
              {selectedSlot ? "Continuer →" : "Choisissez un horaire"}
            </button>
          </div>
        )}

        {/* ═══ ÉTAPE 4 — Récapitulatif ═══ */}
        {step === "recap" && selectedService && selectedSlot && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {backButton("heure")}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>Récapitulatif</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Vérifiez avant de confirmer.</p>

            <div style={{ background: C.cardBg, borderRadius: "20px", border: `1.5px solid ${selectedService.payant ? "rgba(245,166,35,0.25)" : C.borderCard}`, overflow: "hidden", marginBottom: "16px" }}>
              <div style={{ height: "4px", background: selectedService.payant ? "linear-gradient(90deg,#F5A623,#F2C94C,#F5A623)" : "linear-gradient(90deg,#00C896,#00875A)" }}/>
              <div style={{ padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "16px", borderBottom: `1px solid ${C.borderSubtle}`, marginBottom: "16px" }}>
                  <InstitutionLogo inst={institution} size={44}/>
                  <div><div style={{ color: C.text, fontSize: "15px", fontWeight: "800" }}>{institution.name}</div><div style={{ color: C.textSubtle, fontSize: "12px" }}>{institution.adresse || institution.ville}</div></div>
                </div>
                {[
                  { label: "Service",      value: selectedService.nom },
                  { label: "Date & heure", value: formatDateLabel(selectedSlot.dateRdv, selectedSlot.heureRdv) },
                  ...(selectedService.duree_minutes > 0 ? [{ label: "Durée", value: `${selectedService.duree_minutes} minutes` }] : []),
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: "flex", gap: "12px", paddingBottom: i < arr.length - 1 ? "12px" : 0, marginBottom: i < arr.length - 1 ? "12px" : 0, borderBottom: i < arr.length - 1 ? `1px solid ${C.borderSubtle}` : "none" }}>
                    <div style={{ color: C.textSubtle, fontSize: "12px", fontWeight: "600", minWidth: "90px" }}>{row.label}</div>
                    <div style={{ color: C.text, fontSize: "12px", fontWeight: "700", flex: 1 }}>{row.value}</div>
                  </div>
                ))}
                <div style={{ marginTop: "16px", padding: "14px 16px", background: selectedService.payant ? "rgba(245,166,35,0.08)" : "rgba(0,200,150,0.08)", border: `1.5px solid ${selectedService.payant ? "rgba(245,166,35,0.25)" : "rgba(0,200,150,0.25)"}`, borderRadius: "14px" }}>
                  <div style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "2px" }}>Prix</div>
                  <div style={{ color: selectedService.payant ? "#F5A623" : "#00C896", fontSize: "20px", fontWeight: "900" }}>{selectedService.payant ? formatPrix(selectedService.prix) : "Gratuit"}</div>
                </div>
              </div>
            </div>

            <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}`, marginBottom: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", cursor: "pointer" }}>
                <div><div style={{ color: C.text, fontSize: "13px", fontWeight: "700" }}>Pour un tiers</div><div style={{ color: C.textSubtle, fontSize: "11px", marginTop: "2px" }}>Parent, enfant…</div></div>
                <div onClick={() => setForOther(v => !v)} style={{ width: "44px", height: "24px", borderRadius: "12px", background: forOther ? "#F5A623" : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", position: "relative", cursor: "pointer" }}>
                  <div style={{ position: "absolute", top: "2px", left: forOther ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#fff", transition: "left 0.2s" }}/>
                </div>
              </label>
              {forOther && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="Nom complet *" style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text }}/>
                  <input type="tel" value={otherPhone} onChange={e => setOtherPhone(e.target.value)} placeholder="Téléphone *" style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text }}/>
                  <div style={{ display: "flex", gap: "8px", padding: "10px 12px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "10px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <p style={{ color: C.textSubtle, fontSize: "11px", lineHeight: 1.6, margin: 0 }}>Votre compte reste <strong style={{ color: C.text }}>seul responsable</strong> de ce rendez-vous, même réservé pour un tiers. Assurez-vous que les informations fournies sont exactes.</p>
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: C.cardBg, borderRadius: "16px", padding: "16px", border: `1px solid ${C.borderCard}`, marginBottom: "16px" }}>
              <div style={{ color: C.text, fontSize: "13px", fontWeight: "700", marginBottom: "2px" }}>Description de votre besoin</div>
              <div style={{ color: C.textSubtle, fontSize: "11px", marginBottom: "10px" }}>Optionnel — aide l'établissement à préparer votre visite.</div>
              <textarea
                value={descriptionBesoin}
                onChange={e => setDescriptionBesoin(e.target.value.slice(0, 500))}
                placeholder="Ex : Je souhaite ouvrir un compte épargne pour mon enfant…"
                rows={3}
                style={{ width: "100%", padding: "11px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "11px", fontSize: "13px", color: C.text, resize: "vertical", minHeight: "72px" }}
              />
              <div style={{ color: C.textSubtle, fontSize: "10px", textAlign: "right", marginTop: "4px" }}>{descriptionBesoin.length}/500</div>
            </div>

            <div style={{ padding: "12px 14px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.03)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "12px", marginBottom: "16px" }}>
              <p style={{ color: C.textSubtle, fontSize: "11.5px", lineHeight: 1.7, margin: 0 }}>
                {selectedService.payant
                  ? "Le paiement s'effectue directement auprès de l'établissement. Yelen ne collecte aucun paiement. Une fois votre rendez-vous confirmé, un code de validation Yelen sera généré — présentez-le lors de votre arrivée."
                  : "Une fois votre rendez-vous confirmé, un code de validation Yelen sera généré — présentez-le lors de votre arrivée."}
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", marginBottom: "12px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span style={{ color: C.textSubtle, fontSize: "10.5px", fontWeight: "600" }}>Réservation sécurisée — traitée par Yelen224</span>
            </div>
            {submitError && <div style={{ marginBottom: "12px", padding: "12px 14px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", color: "rgba(245,166,35,0.8)", fontSize: "13px" }}>{submitError}</div>}
            <button onClick={goToRecapOrConfirm} disabled={submitting} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: submitting ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : "linear-gradient(135deg,#F5A623,#C8940A)", color: submitting ? C.textSubtle : "#080812", fontSize: "15px", fontWeight: "800", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              {submitting ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>Confirmation…</> : (selectedService.champs_complementaires.length > 0 ? "Continuer →" : "Confirmer le rendez-vous")}
            </button>
            <p style={{ color: C.textSubtle, fontSize: "10.5px", lineHeight: 1.6, textAlign: "center", margin: "10px 0 0" }}>
              En continuant, vous acceptez nos <Link href="/cgu" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Conditions Générales d'Utilisation</Link> et notre <Link href="/confidentialite" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Politique de Confidentialité</Link>.
            </p>
          </div>
        )}

        {/* ═══ ÉTAPE 5 — Informations complémentaires (si configurées) ═══ */}
        {step === "champs" && selectedService && (
          <div style={{ animation: "fadeUp 0.25s ease" }}>
            {backButton("recap")}
            <h2 style={{ color: C.text, fontSize: "20px", fontWeight: "900", margin: "0 0 4px" }}>Informations complémentaires</h2>
            <p style={{ color: C.textSubtle, fontSize: "13px", margin: "0 0 20px" }}>Demandées par {institution.name} pour ce service.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
              {selectedService.champs_complementaires.map(c => (
                <div key={c.label}>
                  <label style={{ display: "block", color: C.textSubtle, fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{c.label}{c.requis ? " *" : ""}</label>
                  <input type={c.type === "tel" ? "tel" : c.type === "numero" ? "text" : "text"} value={champsReponses[c.label] ?? ""} onChange={e => setChampsReponses(r => ({ ...r, [c.label]: e.target.value }))} style={{ width: "100%", padding: "12px 14px", background: inputBg, border: `1px solid ${inputBord}`, borderRadius: "12px", fontSize: "13px", color: C.text }}/>
                </div>
              ))}
            </div>
            {submitError && <div style={{ marginBottom: "12px", padding: "12px 14px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", color: "rgba(245,166,35,0.8)", fontSize: "13px" }}>{submitError}</div>}
            <button onClick={handleConfirm} disabled={submitting} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: submitting ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" : "linear-gradient(135deg,#F5A623,#C8940A)", color: submitting ? C.textSubtle : "#080812", fontSize: "15px", fontWeight: "800", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              {submitting ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>Confirmation…</> : "Confirmer le rendez-vous"}
            </button>
            <p style={{ color: C.textSubtle, fontSize: "10.5px", lineHeight: 1.6, textAlign: "center", margin: "10px 0 0" }}>
              En continuant, vous acceptez nos <Link href="/cgu" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Conditions Générales d'Utilisation</Link> et notre <Link href="/confidentialite" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Politique de Confidentialité</Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
