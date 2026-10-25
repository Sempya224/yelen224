"use client";

// Clock In Shift — module Enterprise de pointage employé (décision CEO
// 26/07/2026). Écrit en respectant /regles-ux-ui de CLAUDE.md : zéro
// emoji, icônes SVG trait (Feather-style), typographie affirmée, fiche
// détail en bottom sheet mobile / dialogue centré ≥1024px (convention
// .client-fiche-overlay/panel/grip/close-x de MesClientsTab.tsx, reprise
// ici sous .cis-fiche-*). API déjà livrée : app/api/institution/clock-in/*.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { APP_URL } from "@/lib/config";
import { generateBrandedQR } from "@/lib/qrBrand";
import {
  ClockStyles, ClockHeader, ClockConfigMenu, ClockTabs, LiveIndicator, AttendanceToolbar, AttendanceSummary, AttendanceAlerts,
  AttendanceTable, AttendanceSkeleton, AttendanceError, heure12, dureeAffichee,
  EmployeesToolbar, EmployeesTable, DistributionCard, DepartmentsToolbar, DepartmentGrid,
  ClockModal, ModalField, ModalSection, champStyle, ScheduleTypeCards, WeekPlanEditor, InfoLine, ScheduleGrid,
  DateField, IconInput, ComboField, PinInput,
  ProfileHeader, ProfileCard, InfoGrid, WeekRows, HistoryTable, FileDropzone, StatusPill, nomPropre,
  type AttendanceKpi, type AttendanceAlert, type AttendanceRow, type EmployeeTableRow, type DepartmentCardData, type JourPlanning, type ScheduleCardData, type HistoryRow,
} from "./ClockInShiftUi";
import { heureDepuisHorodatage } from "@/lib/heure";

type EmployeeRole = "admin" | "manager" | "employe";
type EmployeeStatut = "actif" | "suspendu" | "en_conge" | "archive" | "desactive" | "teletravail" | "mission";

type Employee = {
  id: string; matricule: string; nom: string; prenom: string;
  telephone: string | null; email: string | null;
  department_id: string | null; poste: string | null; manager_id: string | null;
  date_embauche: string; statut: EmployeeStatut; role: EmployeeRole; created_at: string;
  doit_changer_pin: boolean;
};
type Department = { id: string; nom: string; description: string | null; actif: boolean; responsable_id: string | null; created_at: string };
type Segment = { debut: string; fin: string; traverse_minuit?: boolean };
type JourPattern = { repos: boolean; segments: Segment[] };
type Pattern = { jours: Record<string, JourPattern> };
type TypeHoraire = "fixe" | "fractionne" | "nuit" | "variable";
type WorkSchedule = {
  id: string; nom: string; type_horaire: TypeHoraire; pattern: Pattern;
  tolerance_retard_minutes: number; tolerance_depart_anticipe_minutes: number; pause_obligatoire_minutes: number;
  heures_sup_autorisees: boolean; heures_sup_seuil_minutes: number | null; actif: boolean; created_at: string;
};
type Assignment = { id: string; employee_id: string; work_schedule_id: string; date_debut: string; date_fin: string | null };

const JOURS: { key: string; label: string }[] = [
  { key: "lundi", label: "Lun" }, { key: "mardi", label: "Mar" }, { key: "mercredi", label: "Mer" },
  { key: "jeudi", label: "Jeu" }, { key: "vendredi", label: "Ven" }, { key: "samedi", label: "Sam" },
  { key: "dimanche", label: "Dim" },
];
const ROLES: { value: EmployeeRole; label: string }[] = [
  { value: "admin", label: "Admin" }, { value: "manager", label: "Manager" }, { value: "employe", label: "Employé" },
];
const STATUTS: { value: EmployeeStatut; label: string }[] = [
  { value: "actif", label: "Actif" }, { value: "teletravail", label: "Télétravail" }, { value: "mission", label: "Mission" },
  { value: "en_conge", label: "En congé" }, { value: "suspendu", label: "Suspendu" },
  { value: "archive", label: "Archivé" }, { value: "desactive", label: "Désactivé" },
];
// "Inactif" à l'affichage regroupe archive+desactive (brief refonte
// Employés 05/08/2026) — deux statuts internes distincts, un seul label
// utilisateur, pour éviter d'exposer une nuance interne sans valeur pour
// l'admin (les deux signifient "cette personne n'utilise plus le module").
function statutLabelAffiche(s: EmployeeStatut): string {
  if (s === "archive" || s === "desactive") return "Inactif";
  return STATUTS.find(x => x.value === s)?.label ?? s;
}
const TYPES_HORAIRE: { value: TypeHoraire; label: string }[] = [
  { value: "fixe", label: "Fixe" }, { value: "fractionne", label: "Fractionné" },
  { value: "nuit", label: "Nuit" }, { value: "variable", label: "Variable" },
];
const PIN_REGEX = /^\d{4}$/;

function statutColor(s: EmployeeStatut, C: ThemeTokens): string {
  if (s === "actif") return C.green;
  if (s === "teletravail") return C.teal;
  if (s === "mission") return C.purple;
  if (s === "suspendu") return C.red;
  if (s === "en_conge") return C.orange;
  return C.t3; // archive, desactive
}
function roleColor(r: EmployeeRole, C: ThemeTokens): string {
  if (r === "admin") return C.gold;
  if (r === "manager") return C.blue;
  return C.t3;
}
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function defaultPattern(type: TypeHoraire): Pattern {
  const jours: Record<string, JourPattern> = {};
  for (const j of JOURS) {
    const weekend = j.key === "samedi" || j.key === "dimanche";
    if (weekend) { jours[j.key] = { repos: true, segments: [] }; continue; }
    if (type === "fractionne") jours[j.key] = { repos: false, segments: [{ debut: "08:00", fin: "12:00" }, { debut: "14:00", fin: "18:00" }] };
    else if (type === "nuit") jours[j.key] = { repos: false, segments: [{ debut: "22:00", fin: "06:00", traverse_minuit: true }] };
    else jours[j.key] = { repos: false, segments: [{ debut: "08:00", fin: "17:00" }] };
  }
  return { jours };
}

function IconClose({ C }: { C: ThemeTokens }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
// Illustrations sur mesure Yelen pour les états vides — pas d'icône Feather
// isolée, une petite scène en ligne (même langage que le reste du module :
// trait, un seul accent doré, jamais de fond noir). Une par écran, pensées
// pour un tout nouveau compte (zéro donnée), pas pour une erreur.
function IllustrationEquipe({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="48" cy="40" r="26" stroke={C.border2} strokeWidth="2" strokeDasharray="4 5"/>
      <circle cx="48" cy="33" r="9" stroke={C.t3} strokeWidth="2"/>
      <path d="M30 62c2-9 9-14 18-14s16 5 18 14" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="72" cy="64" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M72 59v10M67 64h10" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}
function IllustrationDepartements({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="36" y="24" width="24" height="18" rx="5" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M48 42v10M48 52h-16m16 0h16" stroke={C.border2} strokeWidth="2" strokeLinecap="round"/>
      <rect x="20" y="56" width="22" height="16" rx="5" stroke={C.t3} strokeWidth="2"/>
      <rect x="54" y="56" width="22" height="16" rx="5" stroke={C.t3} strokeWidth="2"/>
    </svg>
  );
}
function IllustrationHoraires({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="24" y="26" width="40" height="38" rx="6" fill={C.bgCard} stroke={C.t3} strokeWidth="2"/>
      <path d="M24 36h40" stroke={C.t3} strokeWidth="2"/>
      <path d="M33 22v8M55 22v8" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="33" cy="47" r="2.4" fill={C.border2}/>
      <circle cx="44" cy="47" r="2.4" fill={C.border2}/>
      <circle cx="33" cy="56" r="2.4" fill={C.border2}/>
      <circle cx="66" cy="60" r="14" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M66 53v7l5 3" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationPresences({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="48" cy="48" r="30" stroke={C.border2} strokeWidth="2" strokeDasharray="3 6"/>
      <circle cx="48" cy="48" r="19" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M48 39v9l6 5" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="48" cy="48" r="1.8" fill={C.gold}/>
    </svg>
  );
}

function EmptyState({ C, illustration, titre, texte, cta }: {
  C: ThemeTokens; illustration: React.ReactNode; titre: string; texte: string; cta?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>{illustration}</div>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>{titre}</div>
      <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "320px", margin: "0 auto" }}>{texte}</div>
      {cta && (
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ marginTop: "18px" }} onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  );
}

const inputStyle = (C: ThemeTokens): React.CSSProperties => ({ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 11px", fontSize: "13px", color: C.t1 });

export function ClockInShiftTab({ instId, instSlug, onToast, access, active = true }: { instId: string; instSlug: string; onToast: (msg: string, color?: string) => void; access: "full" | "read"; active?: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const readOnly = access === "read";

  // Sous-onglet représenté dans l'URL (?subtab=..., section 8 du brief) —
  // même principe que ?tab= dans page.tsx : dérivé de l'URL, jamais un
  // second système d'état qui pourrait diverger. Se propage naturellement :
  // le tab principal clone toujours les params existants (setTab dans
  // page.tsx), donc ?subtab= survit tel quel en quittant puis revenant sur
  // "clock-in-shift" (Test C : Horaires → Transactions → Clock In Shift
  // doit rouvrir sur Horaires).
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const SUB_VIEWS = ["presences", "employes", "departements", "horaires"] as const;
  type SubView = (typeof SUB_VIEWS)[number];
  const rawSubtab = searchParams.get("subtab");
  const subView: SubView = rawSubtab && (SUB_VIEWS as readonly string[]).includes(rawSubtab) ? (rawSubtab as SubView) : "presences";
  const setSubView = useCallback((next: SubView) => {
    const qp = new URLSearchParams(searchParams.toString());
    qp.set("subtab", next);
    router.push(`${pathname}?${qp.toString()}`);
  }, [searchParams, pathname, router]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showPortail, setShowPortail] = useState(false);
  const [showZone, setShowZone] = useState(false);
  // Emplacement (à droite de la barre d'onglets) où PresencesView affiche le témoin Live.
  const [liveHost, setLiveHost] = useState<HTMLDivElement | null>(null);
  const [erreurChargement, setErreurChargement] = useState(false);

  // silencieux=true pour le rafraîchissement d'arrière-plan (60s, "Live",
  // appelé par EmployesView/DepartementsView/HorairesView) — sans ça,
  // `setLoading(true)` remplaçait tout l'écran (tableau, filtres, fiche
  // ouverte) par le spinner plein écran toutes les 60s, un vrai défaut
  // signalé par Bryan. Seul le tout premier chargement doit bloquer
  // l'affichage.
  const load = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    const [rE, rD, rW, rA] = await Promise.all([
      fetch("/api/institution/clock-in/employees"),
      fetch("/api/institution/clock-in/departments"),
      fetch("/api/institution/clock-in/work-schedules"),
      fetch("/api/institution/clock-in/schedule-assignments"),
    ]);
    if (rE.status === 403) { setForbidden(true); setLoading(false); return; }
    setErreurChargement(!rE.ok);
    const [jE, jD, jW, jA] = await Promise.all([rE.json().catch(() => null), rD.json().catch(() => null), rW.json().catch(() => null), rA.json().catch(() => null)]);
    setEmployees(rE.ok ? (jE?.employees ?? []) : []);
    setDepartments(rD.ok ? (jD?.departments ?? []) : []);
    setWorkSchedules(rW.ok ? (jW?.workSchedules ?? []) : []);
    setAssignments(rA.ok ? (jA?.assignments ?? []) : []);
    if (!silencieux) setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => load()); }, [load, instId]);

  if (loading) {
    return <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>;
  }
  if (forbidden) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: C.t2, fontSize: "13px" }}>Cet écran est réservé aux administrateurs, superviseurs et dirigeants de l&apos;institution.</p>
      </div>
    );
  }

  const SUB_LABELS: Record<SubView, string> = { presences: "Présences", employes: "Employés", departements: "Départements", horaires: "Horaires" };
  const sousTitre = readOnly ? "Consultation du pointage — la gestion (employés, départements, horaires) est réservée à l'administrateur." : "Gérez vos employés, départements et horaires de pointage.";

  return (
    <div className="cix-page" style={{ animation: "fadeUp 0.2s ease" }}>
      <ClockStyles C={C}/>
      <ClockHeader C={C} description={sousTitre}
        config={
          <ClockConfigMenu C={C} portailUrl={instSlug ? clockPortalUrl(instSlug) : null}
            onPortail={() => setShowPortail(true)} onZone={() => setShowZone(true)}
            onCopy={() => { navigator.clipboard.writeText(clockPortalUrl(instSlug)).then(() => onToast("Lien copié.", C.green), () => onToast("Copie impossible.", C.red)); }}/>
        }/>

      <ClockTabs C={C} active={subView} onChange={k => { const v = SUB_VIEWS.find(x => x === k); if (v) setSubView(v); }} hostRef={setLiveHost}
        tabs={[
          { key: "presences", label: SUB_LABELS.presences },
          { key: "employes", label: SUB_LABELS.employes, count: employees.length },
          { key: "departements", label: SUB_LABELS.departements, count: departments.length },
          { key: "horaires", label: SUB_LABELS.horaires, count: workSchedules.length },
        ]}/>

      {subView === "presences" && (
        <PresencesView C={C} employees={employees} departments={departments} liveHost={liveHost} onToast={onToast} active={active}/>
      )}
      {subView === "employes" && (
        <EmployesView C={C} departments={departments} workSchedules={workSchedules} employees={employees} assignments={assignments}
          readOnly={readOnly} onToast={onToast} onReload={load} active={active} liveHost={liveHost} erreur={erreurChargement}/>
      )}
      {subView === "departements" && (
        <DepartementsView C={C} departments={departments} employees={employees} assignments={assignments} workSchedules={workSchedules} readOnly={readOnly} onToast={onToast} onReload={load} active={active} liveHost={liveHost} erreur={erreurChargement}/>
      )}
      {subView === "horaires" && (
        <HorairesView C={C} workSchedules={workSchedules} employees={employees} departments={departments} assignments={assignments} readOnly={readOnly} onToast={onToast} onReload={load} active={active} liveHost={liveHost} erreur={erreurChargement}/>
      )}

      {showPortail && instSlug && <PortailEmployeModal C={C} instSlug={instSlug} onClose={() => setShowPortail(false)}/>}
      {showZone && <ZoneTravailModal C={C} readOnly={readOnly} onToast={onToast} onClose={() => setShowZone(false)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PORTAIL EMPLOYÉ — QR & LIEN
// ═══════════════════════════════════════════════════════════════════════
// Génération déléguée à lib/qrBrand.ts::generateBrandedQR — même source que
// Mon code QR (CodeQrTab.tsx), même badge Yelen, pas une seconde logique de
// QR divergente. Destination : le portail public /clock/{slug}
// (app/clock/[slug]/page.tsx), écran de connexion Identifiant+PIN, pas le
// dashboard.
function clockPortalUrl(instSlug: string): string {
  return `${APP_URL}/clock/${instSlug}`;
}

function PortailEmployeModal({ C, instSlug, onClose }: { C: ThemeTokens; instSlug: string; onClose: () => void }) {
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const url = await generateBrandedQR(clockPortalUrl(instSlug), 600);
      setQr(url);
      setLoading(false);
    })();
  }, [instSlug]);

  function downloadPNG() {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `QR-ClockInShift-${instSlug}.png`;
    a.click();
  }

  function copyURL() {
    navigator.clipboard.writeText(clockPortalUrl(instSlug));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="cis-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media (min-width: 1024px) {
          .cis-fiche-overlay{align-items:center!important}
          .cis-fiche-panel{max-width:440px!important;border-radius:20px!important;max-height:86svh!important}
          .cis-fiche-grip{display:none!important}
          .cis-fiche-close-x{display:flex!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="cis-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "440px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div className="cis-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
        <button onClick={onClose} className="cis-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

        <h2 style={{ color: C.t1, fontSize: "18px", fontWeight: 800, letterSpacing: "-0.3px", marginBottom: "6px" }}>Portail employé</h2>
        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "18px" }}>
          Vos employés scannent ce QR ou ouvrent ce lien pour se connecter (Identifiant + PIN) et pointer leur présence — indépendant de ce dashboard.
        </p>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px", borderRadius: "16px", border: `1px solid ${C.border2}`, marginBottom: "16px" }}>
          <div style={{ width: "min(220px, 100%)", aspectRatio: "1/1", borderRadius: "14px", overflow: "hidden", border: `3px solid ${C.gold}`, background: "#fff", marginBottom: "14px", boxShadow: `0 4px 20px ${C.gold}25` }}>
            {qr ? (
              // IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode.toDataURL), non fetchable par l'optimiseur next/image | reviewed=2026-09-10
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code portail employé" style={{ width: "100%", height: "100%", display: "block" }}/>
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={24}/></div>
            )}
          </div>
          <div style={{ color: C.t3, fontSize: "11.5px", textAlign: "center", wordBreak: "break-all" }}>{APP_URL.replace(/^https?:\/\//, "")}/clock/{instSlug}</div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} disabled={loading}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>}
            onClick={() => window.print()}>Imprimer</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} disabled={loading}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
            onClick={downloadPNG}>PNG</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ flex: 1 }} onClick={copyURL}
            icon={copied
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
          >{copied ? "Copié !" : "Copier"}</Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ZONE DE TRAVAIL GÉOLOCALISÉE
// ═══════════════════════════════════════════════════════════════════════
// V1 une seule zone par institution (migration 20260921000003). Pas de
// carte interactive dans ce premier lot (react-leaflet est déjà une
// dépendance du projet mais l'ajouter ici serait un vrai chantier UI à
// part) — saisie directe latitude/longitude + bouton "Utiliser ma position
// actuelle" (géolocalisation du navigateur de l'admin qui configure la
// zone, au moment où il est physiquement sur le lieu de travail).
type ZoneTravail = { id: string; latitude: number; longitude: number; rayon_metres: number; actif: boolean; updated_at: string };

function ZoneTravailModal({ C, readOnly, onToast, onClose }: { C: ThemeTokens; readOnly: boolean; onToast: (msg: string, color?: string) => void; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [zone, setZone] = useState<ZoneTravail | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [rayonMetres, setRayonMetres] = useState("150");
  const [saving, setSaving] = useState(false);
  const [localisationEnCours, setLocalisationEnCours] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/institution/clock-in/work-zones");
      const j = await res.json().catch(() => null);
      if (res.ok && j?.zone) {
        setZone(j.zone);
        setLatitude(String(j.zone.latitude));
        setLongitude(String(j.zone.longitude));
        setRayonMetres(String(j.zone.rayon_metres));
      }
      setLoading(false);
    })();
  }, []);

  function utiliserPositionActuelle() {
    if (!navigator.geolocation) { onToast("Géolocalisation non disponible sur ce navigateur.", C.red); return; }
    setLocalisationEnCours(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setLocalisationEnCours(false);
      },
      () => { setLocalisationEnCours(false); onToast("Position refusée ou indisponible.", C.red); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function enregistrer() {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const rayon = Number(rayonMetres);
    if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(rayon)) { onToast("Coordonnées invalides.", C.red); return; }
    setSaving(true);
    const res = await fetch("/api/institution/clock-in/work-zones", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: lat, longitude: lng, rayonMetres: rayon }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Erreur d'enregistrement", C.red); return; }
    onToast("Zone de travail enregistrée", C.green);
    setZone(z => z ? { ...z, latitude: lat, longitude: lng, rayon_metres: rayon } : { id: j.id, latitude: lat, longitude: lng, rayon_metres: rayon, actif: true, updated_at: new Date().toISOString() });
  }

  async function basculerActif(actif: boolean) {
    setSaving(true);
    const res = await fetch("/api/institution/clock-in/work-zones", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Erreur de mise à jour", C.red); return; }
    setZone(z => z ? { ...z, actif } : z);
    onToast(actif ? "Zone activée" : "Zone désactivée", C.green);
  }

  return (
    <div className="cis-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media (min-width: 1024px) {
          .cis-fiche-overlay{align-items:center!important}
          .cis-fiche-panel{max-width:440px!important;border-radius:20px!important;max-height:86svh!important}
          .cis-fiche-grip{display:none!important}
          .cis-fiche-close-x{display:flex!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="cis-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "440px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div className="cis-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
        <button onClick={onClose} className="cis-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

        <h2 style={{ color: C.t1, fontSize: "18px", fontWeight: 800, letterSpacing: "-0.3px", marginBottom: "6px" }}>Zone de travail</h2>
        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "18px" }}>
          Un pointage effectué en dehors de ce rayon sera signalé dans le flux d&apos;activité — il ne sera jamais bloqué.
        </p>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><YelenLoader size={20}/></div>
        ) : (
          <>
            {zone && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px", marginBottom: "14px" }}>
                <span style={{ color: C.t2, fontSize: "12px", fontWeight: 700 }}>Zone {zone.actif ? "active" : "désactivée"}</span>
                {!readOnly && (
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" loading={saving} onClick={() => basculerActif(!zone.actif)}>
                    {zone.actif ? "Désactiver" : "Activer"}
                  </Button>
                )}
              </div>
            )}

            {!readOnly && (
              <>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth loading={localisationEnCours} style={{ marginBottom: "12px" }}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>}
                  onClick={utiliserPositionActuelle}>Utiliser ma position actuelle</Button>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <input value={latitude} onChange={e => setLatitude(e.target.value)} placeholder="Latitude" inputMode="decimal" style={inputStyle(C)}/>
                  <input value={longitude} onChange={e => setLongitude(e.target.value)} placeholder="Longitude" inputMode="decimal" style={inputStyle(C)}/>
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <input value={rayonMetres} onChange={e => setRayonMetres(e.target.value.replace(/\D/g, ""))} placeholder="Rayon en mètres" inputMode="numeric" style={inputStyle(C)}/>
                </div>

                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth
                  disabled={!latitude || !longitude || !rayonMetres} loading={saving} onClick={enregistrer}>
                  {zone ? "Mettre à jour la zone" : "Définir la zone"}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EMPLOYÉS
// ═══════════════════════════════════════════════════════════════════════
// Carte KPI sans delta/sparkline — contrairement à Présences (où
// daily_attendance donne un historique jour par jour fiable), on n'a pas
// d'historique de statut employé (pas de table d'audit sur "combien
// d'actifs il y a 7 jours") : afficher un delta inventé serait une donnée
// non vérifiable. Simplification assumée pour cette refonte, pas un oubli.
function EmployesView({ C, employees, departments, workSchedules, assignments, readOnly, onToast, onReload, active = true, liveHost, erreur }: {
  C: ThemeTokens; employees: Employee[]; departments: Department[]; workSchedules: WorkSchedule[]; assignments: Assignment[];
  readOnly: boolean; onToast: (msg: string, color?: string) => void; onReload: (silencieux?: boolean) => void; active?: boolean;
  liveHost: HTMLElement | null; erreur: boolean;
}) {
  const [recherche, setRecherche] = useState("");
  const [filtreRapide, setFiltreRapide] = useState<"tous" | EmployeeStatut | "manager">("tous");
  const [filtresAvances, setFiltresAvances] = useState(false);
  const [filtreDepartement, setFiltreDepartement] = useState("");
  const [filtrePoste, setFiltrePoste] = useState("");
  const [filtreManager, setFiltreManager] = useState("");
  const [filtreHoraire, setFiltreHoraire] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSync, setLastSync] = useState(new Date());
  const [maintenant, setMaintenant] = useState(Date.now());

  useEffect(() => { setLastSync(new Date()); }, [employees]);
  // Workspace persistant (Lot 04-B) : cette vue reste montée tant que
  // Clock In Shift a été visité une fois pendant la session, même quand un
  // autre onglet du dashboard est affiché — les minuteries ne doivent
  // tourner que pendant que ce sous-onglet est effectivement visible.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  // Employés change bien plus rarement que les pointages — 60s (vs 30s sur
  // Présences) suffit à tenir la promesse "Live" sans solliciter l'API pour
  // rien.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => onReload(true), 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const employesActifs = employees.filter(e => e.statut === "actif");
  const debutMois = todayStr().slice(0, 7);
  const nouveauxCeMois = employees.filter(e => e.date_embauche.slice(0, 7) === debutMois).length;
  const managers = employees.filter(e => e.role === "manager").length;
  const enConge = employees.filter(e => e.statut === "en_conge").length;
  // "Profil incomplet" = il manque au moins une des 3 infos professionnelles
  // de base (téléphone, poste, département) — email volontairement exclu,
  // conçu comme optionnel dès le schéma d'origine.
  const profilsIncomplets = employees.filter(e => !e.telephone || !e.poste || !e.department_id).length;

  // "IA Insights" — règles déterministes par seuils, jamais un appel LLM
  // (philosophie systématique du projet, voir lib/reputationScore.ts et
  // CLAUDE.md /stack-specifique). Calculées uniquement à partir des
  // données déjà chargées dans cet écran (pas de fetch dédié à l'analyse
  // de présence, hors périmètre de ce fichier — voir PresencesView).
  const insights: string[] = [];
  if (departments.length > 0 && employees.length > 0) {
    const recrutementsParDept = departments
      .map(d => ({ nom: d.nom, n: employees.filter(e => e.department_id === d.id && e.date_embauche.slice(0, 7) === debutMois).length }))
      .filter(d => d.n > 0)
      .sort((a, b) => b.n - a.n);
    if (recrutementsParDept.length > 0) {
      insights.push(`Le département ${recrutementsParDept[0].nom} a recruté ${recrutementsParDept[0].n} collaborateur${recrutementsParDept[0].n > 1 ? "s" : ""} ce mois-ci.`);
    }
    const effectifParDept = departments
      .map(d => ({ nom: d.nom, n: employees.filter(e => e.department_id === d.id).length }))
      .sort((a, b) => b.n - a.n);
    if (effectifParDept[0]?.n > 0) {
      const pct = Math.round((effectifParDept[0].n / employees.length) * 100);
      if (pct >= 30) insights.push(`${pct}% de l'effectif est concentré dans le département ${effectifParDept[0].nom}.`);
    }
  }
  if (employees.length >= 3) {
    const ancienneteMoyenneJours = employees.reduce((s, e) => s + (Date.now() - new Date(e.date_embauche).getTime()) / 86400000, 0) / employees.length;
    insights.push(`Ancienneté moyenne de l'équipe : ${Math.round(ancienneteMoyenneJours / 30)} mois.`);
  }
  if (profilsIncomplets > 0) {
    insights.push(`Suggestion : compléter ${profilsIncomplets} profil${profilsIncomplets > 1 ? "s" : ""} incomplet${profilsIncomplets > 1 ? "s" : ""} avant de généraliser le pointage.`);
  }

  const [matricule, setMatricule] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [poste, setPoste] = useState("");
  const [managerId, setManagerId] = useState("");
  const [dateEmbauche, setDateEmbauche] = useState(todayStr());
  const [role, setRole] = useState<EmployeeRole>("employe");
  const [pin, setPin] = useState("");
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const deptNom = (id: string | null) => departments.find(d => d.id === id)?.nom ?? "—";

  // Une seule affectation "ouverte" (date_fin null) par employé possible —
  // garanti par l'index unique partiel côté schéma (20260805000006).
  const horaireParEmploye = new Map(assignments.filter(a => !a.date_fin).map(a => [a.employee_id, a.work_schedule_id]));
  const horaireNom = (employeeId: string) => {
    const scheduleId = horaireParEmploye.get(employeeId);
    return scheduleId ? (workSchedules.find(w => w.id === scheduleId)?.nom ?? null) : null;
  };

  const employesFiltres = employees.filter(e => {
    if (filtreRapide === "manager" && e.role !== "manager") return false;
    if (filtreRapide !== "tous" && filtreRapide !== "manager" && e.statut !== filtreRapide) return false;
    if (filtreDepartement && e.department_id !== filtreDepartement) return false;
    if (filtrePoste && e.poste !== filtrePoste) return false;
    if (filtreManager && e.manager_id !== filtreManager) return false;
    if (filtreHoraire && horaireParEmploye.get(e.id) !== filtreHoraire) return false;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      const hay = [e.prenom, e.nom, e.matricule, e.telephone ?? "", e.poste ?? "", deptNom(e.department_id)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const postesDisponibles = Array.from(new Set(employees.map(e => e.poste).filter((p): p is string => !!p))).sort();
  const managersDisponibles = employees.filter(e => e.role === "manager");

  function resetForm() {
    setMatricule(""); setNom(""); setPrenom(""); setTelephone(""); setEmail("");
    setDepartmentId(""); setPoste(""); setManagerId(""); setDateEmbauche(todayStr()); setRole("employe"); setPin("");
    setErreurServeur(null);
  }

  const formValide = matricule.trim() && nom.trim() && prenom.trim() && dateEmbauche && PIN_REGEX.test(pin);

  async function creer() {
    if (!formValide) return;
    setSaving(true);
    setErreurServeur(null);
    const res = await fetch("/api/institution/clock-in/employees", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matricule, nom, prenom, dateEmbauche, role, pin,
        telephone: telephone || undefined, email: email || undefined,
        departmentId: departmentId || undefined, poste: poste || undefined, managerId: managerId || undefined,
      }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { setErreurServeur(j?.error || "Erreur de création"); onToast(j?.error || "Erreur de création", C.red); return; }
    setShowForm(false); resetForm();
    onToast(`${prenom} a été ajouté(e) — identifiant : ${matricule}, PIN : ${pin}`, C.green);
    onReload();
  }

  // ── Présentation (aucune logique métier modifiée) ─────────────────────
  const sansHoraire = employees.filter(e => e.statut === "actif" && !horaireParEmploye.has(e.id));
  const pinNonChanges = employees.filter(e => e.statut === "actif" && e.doit_changer_pin);
  const telephoneManquant = employees.filter(e => e.statut === "actif" && !e.telephone);
  const pluriel = (n: number) => (n > 1 ? "s" : "");
  const alertesRh: AttendanceAlert[] = [
    ...(sansHoraire.length > 0 ? [{ key: "sh", texte: `${sansHoraire.length} employé${pluriel(sansHoraire.length)} sans horaire`, noms: [] as string[], action: { label: "Corriger", onClick: () => setSelected(sansHoraire[0]) } }] : []),
    ...(pinNonChanges.length > 0 ? [{ key: "pin", texte: `${pinNonChanges.length} PIN pas encore changé${pluriel(pinNonChanges.length)} depuis la création`, noms: [] as string[], action: { label: "Corriger", onClick: () => setSelected(pinNonChanges[0]) } }] : []),
    ...(telephoneManquant.length > 0 ? [{ key: "tel", texte: `${telephoneManquant.length} téléphone${pluriel(telephoneManquant.length)} manquant${pluriel(telephoneManquant.length)}`, noms: [] as string[], action: { label: "Corriger", onClick: () => setSelected(telephoneManquant[0]) } }] : []),
    ...(profilsIncomplets > 0 ? [{ key: "inc", texte: `${profilsIncomplets} profil${pluriel(profilsIncomplets)} incomplet${pluriel(profilsIncomplets)}`, noms: [] as string[] }] : []),
  ];

  const basculerFiltre = (k: "manager" | "en_conge") => setFiltreRapide(filtreRapide === k ? "tous" : k);
  const kpiItems: AttendanceKpi[] = [
    { key: "actifs", label: "Employés actifs", value: String(employesActifs.length) },
    { key: "nouveaux", label: "Nouveaux ce mois", value: String(nouveauxCeMois) },
    { key: "depts", label: "Départements", value: String(departments.length) },
    { key: "managers", label: "Managers", value: String(managers), onClick: () => basculerFiltre("manager"), active: filtreRapide === "manager" },
    { key: "conge", label: "En congé", value: String(enConge), onClick: () => basculerFiltre("en_conge"), active: filtreRapide === "en_conge" },
    { key: "incomplets", label: "Profils incomplets", value: String(profilsIncomplets), ambre: profilsIncomplets > 0 },
  ];

  const STATUTS_FILTRE = [
    { value: "tous", label: "Tous" }, { value: "actif", label: "Actifs" }, { value: "en_conge", label: "En congé" },
    { value: "teletravail", label: "Télétravail" }, { value: "mission", label: "Mission" },
  ] as const;
  const nbAvances = [filtreDepartement, filtrePoste, filtreManager, filtreHoraire].filter(Boolean).length;
  const filtreActif = filtreRapide !== "tous" || nbAvances > 0 || recherche.trim() !== "";
  function reinitialiserFiltres() {
    setRecherche(""); setFiltreRapide("tous"); setFiltreDepartement(""); setFiltrePoste(""); setFiltreManager(""); setFiltreHoraire("");
  }
  const chips = [
    ...(recherche.trim() ? [{ key: "q", label: `Recherche : ${recherche.trim()}`, onRemove: () => setRecherche("") }] : []),
    ...(filtreRapide === "manager" ? [{ key: "r", label: "Rôle : Managers", onRemove: () => setFiltreRapide("tous") }]
      : filtreRapide !== "tous" ? [{ key: "s", label: `Statut : ${statutLabelAffiche(filtreRapide)}`, onRemove: () => setFiltreRapide("tous") }] : []),
    ...(filtreDepartement ? [{ key: "d", label: `Département : ${deptNom(filtreDepartement)}`, onRemove: () => setFiltreDepartement("") }] : []),
    ...(filtrePoste ? [{ key: "p", label: `Poste : ${filtrePoste}`, onRemove: () => setFiltrePoste("") }] : []),
    ...(filtreManager ? [{ key: "m", label: `Manager : ${(() => { const m = employees.find(x => x.id === filtreManager); return m ? `${m.prenom} ${m.nom}` : "—"; })()}`, onRemove: () => setFiltreManager("") }] : []),
    ...(filtreHoraire ? [{ key: "h", label: `Horaire : ${workSchedules.find(w => w.id === filtreHoraire)?.nom ?? "—"}`, onRemove: () => setFiltreHoraire("") }] : []),
  ];

  const affichageStatut = (st: EmployeeStatut) => (st === "mission" ? C.blue : st === "teletravail" ? C.purple : statutColor(st, C));
  const affichageRole = (r: EmployeeRole) => (r === "admin" ? C.purple : r === "manager" ? C.blue : C.t2);
  const lignes: EmployeeTableRow[] = employesFiltres.map(e => ({
    id: e.id, nom: `${e.prenom} ${e.nom}`, matricule: e.matricule,
    departement: e.department_id ? (departments.find(d => d.id === e.department_id)?.nom ?? null) : null,
    poste: e.poste, horaire: horaireNom(e.id),
    role: ROLES.find(r => r.value === e.role)?.label ?? e.role, roleColor: affichageRole(e.role),
    statut: statutLabelAffiche(e.statut), statutColor: affichageStatut(e.statut),
    inactif: !(e.statut === "actif" || e.statut === "teletravail" || e.statut === "mission"),
    peutAssigner: e.statut === "actif", onOpen: () => setSelected(e), onAssigner: () => setSelected(e),
  }));

  const repartitionDepts = departments.map(d => ({ id: d.id, nom: d.nom, n: employees.filter(e => e.department_id === d.id).length }));
  const sansDepartement = employees.filter(e => !e.department_id).length;
  const ordreStatuts: EmployeeStatut[] = ["actif", "en_conge", "mission", "teletravail", "suspendu", "archive", "desactive"];
  const repartitionStatuts = ordreStatuts
    .map(st => ({ key: st, label: statutLabelAffiche(st), color: affichageStatut(st), n: employees.filter(e => e.statut === st).length }))
    .filter(x => x.n > 0)
    .reduce<{ key: string; label: string; color: string; n: number }[]>((acc, x) => {
      // archive + désactivé s'affichent tous deux "Inactif" : une seule ligne.
      const deja = acc.find(a => a.label === x.label);
      if (deja) deja.n += x.n; else acc.push({ ...x });
      return acc;
    }, []);

  function exporterEmployesCsv() {
    const lignes = [
      ["Prénom", "Nom", "Matricule", "Département", "Poste", "Rôle", "Statut", "Téléphone", "Email"],
      ...employesFiltres.map(e => [e.prenom, e.nom, e.matricule, deptNom(e.department_id), e.poste ?? "", ROLES.find(r => r.value === e.role)?.label ?? "", statutLabelAffiche(e.statut), e.telephone ?? "", e.email ?? ""]),
    ];
    const csv = lignes.map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "employes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {liveHost && active && createPortal(
        <LiveIndicator C={C} sync={`synchronisé ${ilYA(lastSync, maintenant)}`} calcul={null} calculPerime={false}/>,
        liveHost,
      )}

      {erreur && employees.length === 0 ? (
        <AttendanceError C={C} onRetry={() => onReload()}/>
      ) : (
        <>
          <AttendanceSummary C={C} items={kpiItems} repli={3}/>
          <AttendanceAlerts C={C} lignes={alertesRh} titre={alertesRh.length > 0 ? `Alertes RH · ${alertesRh.length} point${pluriel(alertesRh.length)} d'attention` : undefined} suggestions={insights}/>

          <EmployeesToolbar C={C} avecDonnees={employees.length > 0} search={recherche} onSearch={setRecherche}
            statutOptions={STATUTS_FILTRE.map(o => ({ value: o.value, label: o.label }))}
            statut={filtreRapide === "manager" ? "tous" : filtreRapide}
            onStatut={v => { const o = STATUTS_FILTRE.find(x => x.value === v); if (o) setFiltreRapide(o.value); }}
            roleOptions={[{ value: "tous", label: "Tous les rôles" }, { value: "manager", label: "Managers" }]}
            role={filtreRapide === "manager" ? "manager" : "tous"}
            onRole={v => { if (v === "manager") setFiltreRapide("manager"); else if (filtreRapide === "manager") setFiltreRapide("tous"); }}
            avancesOuvert={filtresAvances} onToggleAvances={() => setFiltresAvances(v => !v)} avancesCount={nbAvances}
            chips={chips} onReset={reinitialiserFiltres} filtreActif={filtreActif} total={employesFiltres.length}
            canCreate={!readOnly} onCreate={() => setShowForm(v => !v)} onRefresh={() => onReload()}
            onPrint={() => window.print()} onExport={exporterEmployesCsv}/>

          {employees.length > 0 && filtresAvances && (
            <Card tokens={toCardTokens(C)} padding="12px" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginBottom: "14px" }}>
              <select aria-label="Filtrer par département" value={filtreDepartement} onChange={e => setFiltreDepartement(e.target.value)} style={inputStyle(C)}>
                <option value="">Tous les départements</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
              <select aria-label="Filtrer par poste" value={filtrePoste} onChange={e => setFiltrePoste(e.target.value)} style={inputStyle(C)}>
                <option value="">Tous les postes</option>
                {postesDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select aria-label="Filtrer par manager" value={filtreManager} onChange={e => setFiltreManager(e.target.value)} style={inputStyle(C)}>
                <option value="">Tous les managers</option>
                {managersDisponibles.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
              </select>
              <select aria-label="Filtrer par horaire" value={filtreHoraire} onChange={e => setFiltreHoraire(e.target.value)} style={inputStyle(C)}>
                <option value="">Tous les horaires</option>
                {workSchedules.map(w => <option key={w.id} value={w.id}>{w.nom}</option>)}
              </select>
            </Card>
          )}

          {employees.length === 0 && !showForm ? (
            <EmptyState C={C} illustration={<IllustrationEquipe C={C}/>}
              titre="Votre équipe commence ici"
              texte="Ajoutez votre premier employé pour activer le pointage — il recevra un identifiant et un code PIN pour se connecter au portail."
              cta={!readOnly ? { label: "+ Ajouter mon premier employé", onClick: () => setShowForm(true) } : undefined}/>
          ) : employees.length > 0 && employesFiltres.length === 0 ? (
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun résultat</div>
              <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Aucun employé ne correspond à ces critères.</div>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={reinitialiserFiltres}>Réinitialiser</Button>
            </div>
          ) : employees.length > 0 ? (
            <>
              <EmployeesTable C={C} rows={lignes}/>
              <div style={{ color: C.t2, fontSize: "13px", marginTop: "10px", fontVariantNumeric: "tabular-nums" }}>1–{lignes.length} sur {employees.length}</div>
            </>
          ) : null}

      {/* ── Nouveaux employés ── */}
      {(() => {
        const recents = [...employees].filter(e => {
          const jours = Math.floor((Date.now() - new Date(e.date_embauche).getTime()) / 86400000);
          return jours >= 0 && jours <= 14;
        }).sort((a, b) => b.date_embauche.localeCompare(a.date_embauche)).slice(0, 5);
        if (recents.length === 0) return null;
        return (
          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginTop: "20px", marginBottom: "0" }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "12px" }}>Bienvenue aux nouveaux employés</div>
            <div style={{ display: "flex", gap: "10px", overflowX: "auto" }}>
              {recents.map(e => {
                const jours = Math.floor((Date.now() - new Date(e.date_embauche).getTime()) / 86400000);
                const label = jours === 0 ? "Aujourd'hui" : jours === 1 ? "Hier" : `${jours} jours`;
                return (
                  <div key={e.id} onClick={() => setSelected(e)} className="tap" style={{ cursor: "pointer", textAlign: "center", flexShrink: 0, width: "84px" }}>
                    <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: `linear-gradient(135deg, ${roleColor(e.role, C)}30, ${roleColor(e.role, C)}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, color: roleColor(e.role, C), margin: "0 auto 6px" }}>
                      {e.prenom.slice(0, 1).toUpperCase()}{e.nom.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ color: C.t1, fontSize: "10.5px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.prenom}</div>
                    <div style={{ color: C.t3, fontSize: "9.5px" }}>{label}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}


          {employees.length > 0 && (
            <DistributionCard C={C} departements={repartitionDepts} sansDepartement={sansDepartement} statuts={repartitionStatuts} total={employees.length}/>
          )}
        </>
      )}

      {showForm && (() => {
        const initialesDe = (e: Employee) => `${e.prenom.slice(0, 1)}${e.nom.slice(0, 1)}`.toUpperCase();
        const manquants = [
          !prenom.trim() && "le prénom", !nom.trim() && "le nom", !matricule.trim() && "le matricule",
          !dateEmbauche && "la date d'embauche", !PIN_REGEX.test(pin) && "un PIN à 4 chiffres",
        ].filter((x): x is string => !!x);
        const aide = manquants.length > 0
          ? `Renseignez ${manquants.length > 1 ? `${manquants.slice(0, -1).join(", ")} et ${manquants[manquants.length - 1]}` : manquants[0]}.`
          : undefined;
        const modifieForm = !!(matricule || nom || prenom || telephone || email || departmentId || poste || managerId || pin) || role !== "employe" || dateEmbauche !== todayStr();
        const erreurMatricule = erreurServeur && /matricule/i.test(erreurServeur) ? erreurServeur : null;
        const DESC_ROLE: Record<EmployeeRole, string> = {
          admin: "Accès complet à la configuration", manager: "Gère son équipe et ses horaires", employe: "Pointe et consulte ses présences",
        };
        const ui = toUiTokens(C);
        return (
          <ClockModal C={C} titre="Nouvel employé" sousTitre="Ajoutez un collaborateur au pointage." labelId="employe-modal-titre" largeur={680}
            onClose={() => { setShowForm(false); resetForm(); }} modifie={modifieForm}
            onSubmit={() => { if (formValide && !saving) creer(); }} aide={aide}
            actions={
              <>
                <Button tokens={ui} className="tap" variant="secondary" size="md" disabled={saving} onClick={() => { setShowForm(false); resetForm(); }}>Annuler</Button>
                <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!formValide} loading={saving} onClick={creer}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </>
            }>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {erreurServeur && (
                <div role="alert" style={{ padding: "10px 14px", borderRadius: "8px", backgroundColor: `${C.red}14`, border: `1px solid ${C.red}33`, color: C.red, fontSize: "13.5px" }}>{erreurServeur}</div>
              )}

              <ModalSection C={C} titre="Identité">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                  <ModalField C={C} id="employe-prenom" label="Prénom" requis>
                    <input id="employe-prenom" data-autofocus className="cix-input" autoComplete="given-name" readOnly={saving} value={prenom} onChange={e => setPrenom(e.target.value)} style={champStyle(C)}/>
                  </ModalField>
                  <ModalField C={C} id="employe-nom" label="Nom" requis>
                    <input id="employe-nom" className="cix-input" autoComplete="family-name" readOnly={saving} value={nom} onChange={e => setNom(e.target.value)} style={champStyle(C)}/>
                  </ModalField>
                  <ModalField C={C} id="employe-matricule" label="Matricule" requis aide="Identifiant unique de l'employé. Exemple : ECO-00123" erreur={erreurMatricule}>
                    <input id="employe-matricule" className="cix-input" readOnly={saving} value={matricule} onChange={e => setMatricule(e.target.value)} placeholder="ECO-00123"
                      aria-invalid={erreurMatricule ? true : undefined} aria-describedby={erreurMatricule ? "employe-matricule-erreur" : "employe-matricule-aide"}
                      style={{ ...champStyle(C), fontFamily: "ui-monospace, monospace", borderColor: erreurMatricule ? C.red : C.border2 }}/>
                  </ModalField>
                  <ModalField C={C} id="employe-date" label="Date d'embauche" requis>
                    <DateField C={C} id="employe-date" value={dateEmbauche} onChange={setDateEmbauche} readOnly={saving}/>
                  </ModalField>
                </div>
              </ModalSection>

              <ModalSection C={C} titre="Contact">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                  <ModalField C={C} id="employe-tel" label="Téléphone" optionnel>
                    <IconInput C={C} id="employe-tel" type="tel" autoComplete="tel" readOnly={saving} value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="+224 6xx xx xx xx"
                      icone={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>}/>
                  </ModalField>
                  <ModalField C={C} id="employe-email" label="Email" optionnel>
                    <IconInput C={C} id="employe-email" type="email" autoComplete="email" readOnly={saving} value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom@entreprise.com"
                      icone={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}/>
                  </ModalField>
                </div>
              </ModalSection>

              <ModalSection C={C} titre="Organisation">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                  <ModalField C={C} id="employe-dept" label="Département" optionnel>
                    <ComboField C={C} id="employe-dept" valeur={departmentId} onChange={setDepartmentId} readOnly={saving}
                      options={departments.map(d => ({ value: d.id, label: d.nom }))}
                      vide={{ titre: "Aucun département", aide: "Créez-en un dans l'onglet Départements." }}/>
                  </ModalField>
                  <ModalField C={C} id="employe-poste" label="Poste" optionnel>
                    <input id="employe-poste" className="cix-input" readOnly={saving} value={poste} onChange={e => setPoste(e.target.value)} placeholder="ex : Caissier" style={champStyle(C)}/>
                  </ModalField>
                </div>
                <ModalField C={C} id="employe-manager" label="Manager" optionnel>
                  <ComboField C={C} id="employe-manager" valeur={managerId} onChange={setManagerId} readOnly={saving}
                    options={employees.map(e => ({ value: e.id, label: `${e.prenom} ${e.nom}`, sub: ROLES.find(r => r.value === e.role)?.label, avatar: initialesDe(e) }))}/>
                </ModalField>
              </ModalSection>

              <ModalSection C={C} titre="Accès Clock In Shift">
                <div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Rôle<span aria-hidden="true" style={{ color: C.red, marginLeft: "3px" }}>*</span></div>
                  <ScheduleTypeCards C={C} ariaLabel="Rôle Clock In Shift" minCarte={170} readOnly={saving} value={role}
                    onChange={v => { const r = ROLES.find(x => x.value === v); if (r) setRole(r.value); }}
                    options={ROLES.map(r => ({ value: r.value, label: r.label, desc: DESC_ROLE[r.value] }))}/>
                </div>
                <ModalField C={C} id="employe-pin" label="PIN initial (4 chiffres)" requis aide="Communiqué à l'employé pour son premier pointage. Il devra en choisir un nouveau à sa première connexion.">
                  <PinInput C={C} id="employe-pin" valeur={pin} onChange={v => setPin(v.replace(/\D/g, "").slice(0, 4))} readOnly={saving}/>
                </ModalField>
              </ModalSection>
            </div>
          </ClockModal>
        );
      })()}

      {selected && (
        <EmployeDetailModal C={C} employe={selected} departments={departments} employees={employees} workSchedules={workSchedules}
          readOnly={readOnly} onClose={() => setSelected(null)} onToast={onToast} onReload={onReload}/>
      )}
    </div>
  );
}

type HistoriqueJour = { id: string; date_jour: string; statut: PresenceStatut; heures_travaillees_minutes: number; heures_supplementaires_minutes?: number; retard_minutes: number; premiere_entree: string | null; derniere_sortie: string | null; nombre_pointages: number; horsZone?: boolean | null };
type EmployeeDocument = { id: string; label: string; type: string; type_mime: string | null; taille: number | null; created_at: string; signedUrl: string | null };
type AuditLogEntry = {
  id: string; audit_id: string; action_type: "ajout_pointage" | "correction_pointage" | "override_statut_jour";
  nouvelle_valeur: Record<string, unknown> | null; raison: string; membre_nom: string; created_at: string;
};

const STATUTS_JOUR: PresenceStatut[] = ["Présent", "Retard", "Absent", "Congé", "Incomplet"];

function libelleActionAudit(a: AuditLogEntry["action_type"]): string {
  if (a === "ajout_pointage") return "Pointage ajouté";
  if (a === "correction_pointage") return "Pointage corrigé";
  return "Statut du jour modifié";
}

function DrawerSection({ C, titre, children }: { C: ThemeTokens; titre: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>{titre}</div>
      {children}
    </div>
  );
}

// Bottom-sheet mobile / dialogue centré ≥1024px — même convention
// `.cis-fiche-*` que le reste du module (et `.client-fiche-*` de
// MesClientsTab.tsx). Un drawer latéral avait été tenté puis explicitement
// abandonné par Bryan (05/08/2026, refonte Employés/Départements) : "pas
// identique au projet" — revenu à la convention standard pour rester
// cohérent avec le reste du dashboard.
function Sk({ h = 16 }: { h?: number }) {
  return <div className="cix-skel" style={{ height: h + "px", marginBottom: "8px" }}/>;
}

const joursPlanning = (pat: Pattern): JourPlanning[] => JOURS.map(j => ({
  key: j.key, label: j.label, repos: pat.jours[j.key]?.repos ?? true,
  segments: (pat.jours[j.key]?.segments ?? []).map(g => ({ debut: g.debut, fin: g.fin })),
}));

function EmployeDetailModal({ C, employe, departments, employees, workSchedules, readOnly, onClose, onToast, onReload }: {
  C: ThemeTokens; employe: Employee; departments: Department[]; employees: Employee[]; workSchedules: WorkSchedule[];
  readOnly: boolean; onClose: () => void; onToast: (msg: string, color?: string) => void; onReload: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [showResetPin, setShowResetPin] = useState(false);
  const [nouveauPin, setNouveauPin] = useState("");
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [showReassign, setShowReassign] = useState(false);
  const [nouvelHoraireId, setNouvelHoraireId] = useState("");
  const [nouvelleDate, setNouvelleDate] = useState(todayStr());

  const [historique, setHistorique] = useState<HistoriqueJour[]>([]);
  const [loadingHistorique, setLoadingHistorique] = useState(true);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(true);
  const [showAjoutPointage, setShowAjoutPointage] = useState(false);
  const [corrTypeAction, setCorrTypeAction] = useState<"entree" | "sortie">("entree");
  const [corrHorodatage, setCorrHorodatage] = useState("");
  const [corrRaison, setCorrRaison] = useState("");
  const [corrSaving, setCorrSaving] = useState(false);
  const [jourEnCorrection, setJourEnCorrection] = useState<string | null>(null);
  const [corrStatutJour, setCorrStatutJour] = useState<PresenceStatut>("Présent");
  const [corrRaisonJour, setCorrRaisonJour] = useState("");

  const [modeEdition, setModeEdition] = useState(false);
  const [onglet, setOnglet] = useState<"apercu" | "planning" | "presence" | "documents" | "securite">("apercu");
  const [statutChoisi, setStatutChoisi] = useState<EmployeeStatut>(employe.statut);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editNom, setEditNom] = useState(employe.nom);
  const [editPrenom, setEditPrenom] = useState(employe.prenom);
  const [editTelephone, setEditTelephone] = useState(employe.telephone ?? "");
  const [editEmail, setEditEmail] = useState(employe.email ?? "");
  const [editPoste, setEditPoste] = useState(employe.poste ?? "");
  const [editDepartmentId, setEditDepartmentId] = useState(employe.department_id ?? "");
  const [editManagerId, setEditManagerId] = useState(employe.manager_id ?? "");

  const managerNom = employees.find(m => m.id === employe.manager_id);
  const horaireActuel = assignment ? workSchedules.find(w => w.id === assignment.work_schedule_id) : null;

  useEffect(() => {
    let annule = false;
    queueMicrotask(() => {
      if (annule) return;
      setLoadingAssignment(true);
      fetch(`/api/institution/clock-in/schedule-assignments?employeeId=${employe.id}`)
        .then(r => r.json()).catch(() => null)
        .then(j => { if (!annule) { setAssignment((j?.assignments ?? []).find((a: Assignment) => !a.date_fin) ?? null); setLoadingAssignment(false); } });

      setLoadingHistorique(true);
      fetch(`/api/institution/clock-in/attendance?employeeId=${employe.id}`)
        .then(r => r.json()).catch(() => null)
        .then(j => { if (!annule) { setHistorique(j?.records ?? []); setLoadingHistorique(false); } });
    });

    return () => { annule = true; };
  }, [employe.id]);

  const chargerDocuments = useCallback(async () => {
    setLoadingDocuments(true);
    const res = await fetch(`/api/institution/clock-in/employees/documents?employeeId=${employe.id}`);
    const j = await res.json().catch(() => null);
    setDocuments(res.ok ? (j?.documents ?? []) : []);
    setLoadingDocuments(false);
  }, [employe.id]);

  useEffect(() => { queueMicrotask(() => chargerDocuments()); }, [chargerDocuments]);

  const chargerAuditLogs = useCallback(async () => {
    setLoadingAuditLogs(true);
    const res = await fetch(`/api/institution/clock-in/corrections?employeeId=${employe.id}`);
    const j = await res.json().catch(() => null);
    setAuditLogs(res.ok ? (j?.logs ?? []) : []);
    setLoadingAuditLogs(false);
  }, [employe.id]);

  // Rappelée après chaque correction — l'effet ci-dessus ne réagit qu'à un
  // changement d'employe.id, pas à une correction sur l'employé déjà ouvert.
  const rechargerHistorique = useCallback(async () => {
    const res = await fetch(`/api/institution/clock-in/attendance?employeeId=${employe.id}`);
    const j = await res.json().catch(() => null);
    if (res.ok) setHistorique(j?.records ?? []);
  }, [employe.id]);

  useEffect(() => { queueMicrotask(() => chargerAuditLogs()); }, [chargerAuditLogs]);

  // Corrections — appelle la route existante app/api/institution/clock-in/corrections
  // (immuabilité + audit déjà garantis côté API, voir cette route). Seuls
  // ajout_pointage et override_statut_jour sont câblés ici :
  // correction_pointage (corriger un pointage précis déjà enregistré)
  // demanderait d'exposer les attendance_logs individuels par employé, pas
  // seulement le résumé daily_attendance déjà chargé dans `historique` — hors
  // périmètre de ce lot (toucherait un 3e fichier, attendance/route.ts).
  async function ajouterPointageOublie() {
    if (!corrHorodatage || !corrRaison.trim()) return;
    setCorrSaving(true);
    // `corrHorodatage` vient d'un <input type="datetime-local"> ("AAAA-MM-
    // JJTHH:mm", sans fuseau). `new Date(corrHorodatage)` l'interpréterait
    // dans le fuseau du NAVIGATEUR de l'admin qui corrige, pas celui de la
    // Guinée — un admin connecté depuis un fuseau différent d'UTC+0
    // enregistrerait un pointage décalé. La Guinée étant UTC+0 (même
    // hypothèse que supabase/functions/clock-in-daily-attendance), les
    // chiffres saisis sont directement traités comme de l'UTC.
    const horodatageUtc = `${corrHorodatage}:00.000Z`;
    const res = await fetch("/api/institution/clock-in/corrections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ajout_pointage", employeeId: employe.id, typeAction: corrTypeAction,
        horodatage: horodatageUtc, raison: corrRaison.trim(),
      }),
    });
    const j = await res.json().catch(() => null);
    setCorrSaving(false);
    if (!res.ok) { onToast(j?.error || "Le pointage n'a pas pu être ajouté.", C.red); return; }
    setShowAjoutPointage(false); setCorrHorodatage(""); setCorrRaison("");
    onToast("Pointage ajouté", C.green);
    chargerAuditLogs();
    rechargerHistorique();
    onReload();
  }

  async function corrigerStatutJour(dailyAttendanceId: string) {
    if (!corrRaisonJour.trim()) return;
    setCorrSaving(true);
    const res = await fetch("/api/institution/clock-in/corrections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "override_statut_jour", dailyAttendanceId, statut: corrStatutJour, raison: corrRaisonJour.trim() }),
    });
    const j = await res.json().catch(() => null);
    setCorrSaving(false);
    if (!res.ok) { onToast(j?.error || "Le statut n'a pas pu être corrigé.", C.red); return; }
    setJourEnCorrection(null); setCorrRaisonJour("");
    onToast("Statut du jour corrigé", C.green);
    chargerAuditLogs();
    rechargerHistorique();
    onReload();
  }

  // Présence (30 derniers jours calculés, pas 60 — plus représentatif d'une
  // tendance récente qu'un historique complet pour ce mini-résumé).
  const derniers30 = historique.slice(0, 30);
  const retards30 = derniers30.filter(h => h.statut === "Retard").length;
  const absences30 = derniers30.filter(h => h.statut === "Absent").length;
  const avecPresence = derniers30.filter(h => h.nombre_pointages > 0);
  const tempsMoyen30 = avecPresence.length > 0 ? Math.round(avecPresence.reduce((s, h) => s + h.heures_travaillees_minutes, 0) / avecPresence.length) : 0;

  async function changerStatut(statut: EmployeeStatut) {
    setSaving(true);
    const res = await fetch("/api/institution/clock-in/employees", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: employe.id, statut }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Le statut n'a pas pu être mis à jour.", C.red); return; }
    onToast("Statut mis à jour", C.green);
    onReload(); onClose();
  }

  async function enregistrerInformations() {
    setSaving(true);
    const res = await fetch("/api/institution/clock-in/employees", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: employe.id, nom: editNom, prenom: editPrenom,
        telephone: editTelephone, email: editEmail, poste: editPoste,
        departmentId: editDepartmentId || null, managerId: editManagerId || null,
      }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Ces informations n'ont pas pu être enregistrées.", C.red); return; }
    setModeEdition(false);
    onToast("Informations mises à jour", C.green);
    onReload();
  }

  async function reinitialiserPin() {
    if (!PIN_REGEX.test(nouveauPin)) return;
    setSaving(true);
    const res = await fetch("/api/institution/clock-in/employees", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: employe.id, pin: nouveauPin }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Le PIN n'a pas pu être réinitialisé.", C.red); return; }
    setShowResetPin(false); setNouveauPin("");
    onToast("PIN réinitialisé — communiquez-le à l'employé", C.green);
  }

  async function reassigner() {
    if (!nouvelHoraireId || !nouvelleDate) return;
    setSaving(true);
    const res = await fetch("/api/institution/clock-in/schedule-assignments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: employe.id, workScheduleId: nouvelHoraireId, dateDebut: nouvelleDate }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Impossible d'affecter cet horaire.", C.red); return; }
    setShowReassign(false);
    onToast("Horaire affecté", C.green);
    onReload();
    setAssignment({ id: j.id, employee_id: employe.id, work_schedule_id: nouvelHoraireId, date_debut: nouvelleDate, date_fin: null });
  }

  async function televerserDocument() {
    if (!uploadFile || !uploadLabel.trim()) return;
    setUploading(true);
    const form = new FormData();
    form.append("employeeId", employe.id);
    form.append("label", uploadLabel.trim());
    form.append("file", uploadFile);
    const res = await fetch("/api/institution/clock-in/employees/documents", { method: "POST", body: form });
    const j = await res.json().catch(() => null);
    setUploading(false);
    if (!res.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    setUploadLabel(""); setUploadFile(null);
    onToast("Document ajouté", C.green);
    chargerDocuments();
  }

  async function supprimerDocument(id: string) {
    const res = await fetch(`/api/institution/clock-in/employees/documents?id=${id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur de suppression", C.red); return; }
    onToast("Document supprimé", C.orange);
    chargerDocuments();
  }

  const ui = toUiTokens(C);
  const nomAffiche = nomPropre(`${employe.prenom} ${employe.nom}`);
  const deptReel = departments.find(d => d.id === employe.department_id)?.nom ?? null;
  const managerReel = managerNom ? nomPropre(`${managerNom.prenom} ${managerNom.nom}`) : null;
  const couleurStatut = (st: EmployeeStatut) => (st === "mission" ? C.blue : st === "teletravail" ? C.purple : statutColor(st, C));
  const roleAff = { label: ROLES.find(r => r.value === employe.role)?.label ?? employe.role, color: employe.role === "admin" ? C.purple : employe.role === "manager" ? C.blue : C.t2 };
  const modifieFiche = modeEdition && (editNom !== employe.nom || editPrenom !== employe.prenom || editTelephone !== (employe.telephone ?? "") || editEmail !== (employe.email ?? "")
    || editPoste !== (employe.poste ?? "") || editDepartmentId !== (employe.department_id ?? "") || editManagerId !== (employe.manager_id ?? ""));
  const joursHoraire = horaireActuel ? joursPlanning(horaireActuel.pattern) : [];
  const dernierJourCompte = derniers30.length > 0 ? derniers30[derniers30.length - 1].date_jour : null;

  const indicateursPresence = (
    <>
      {loadingHistorique ? <Sk h={88}/> : (
        <AttendanceSummary C={C} items={[
          { key: "retards", label: "Retards", value: String(retards30), ambre: retards30 > 0 },
          { key: "absences", label: "Absences", value: String(absences30), alerte: absences30 > 0 },
          { key: "temps", label: "Temps moyen", titre: "Temps moyen travaillé", value: dureeAffichee(tempsMoyen30) },
        ]}/>
      )}
      {!loadingHistorique && (
        <div style={{ color: C.t3, fontSize: "12px", marginTop: "-6px", marginBottom: "12px" }}>
          Sur {derniers30.length < 30 ? `les ${derniers30.length} derniers jours enregistrés` : "les 30 derniers jours"}
          {dernierJourCompte ? ` · période comptée depuis le ${formatDate(dernierJourCompte)}` : ""}
        </div>
      )}
    </>
  );

  return (
    <ClockModal C={C} titre={nomAffiche} labelId="fiche-employe-titre" largeur={760} onClose={onClose} modifie={modifieFiche}
      entete={<ProfileHeader C={C} labelId="fiche-employe-titre" nom={nomAffiche} poste={employe.poste} departement={deptReel} manager={managerReel}
        role={roleAff} statut={{ label: statutLabelAffiche(employe.statut), color: couleurStatut(employe.statut) }}/>}
      sousEntete={
        <div style={{ padding: "0 24px", flexShrink: 0 }}>
          <ClockTabs C={C} marge={0} idPrefix="fiche-tab" ariaLabel="Sections de la fiche employé" active={onglet}
            onChange={k => { if (k === "apercu" || k === "planning" || k === "presence" || k === "documents" || k === "securite") setOnglet(k); }}
            tabs={[{ key: "apercu", label: "Aperçu" }, { key: "planning", label: "Planning" }, { key: "presence", label: "Présence" }, { key: "documents", label: "Documents", count: documents.length || undefined }, { key: "securite", label: "Sécurité" }]}/>
        </div>
      }>
      {onglet === "apercu" && (
        <div role="tabpanel" id="fiche-tab-panel-apercu" aria-labelledby="fiche-tab-apercu">
          <ProfileCard C={C} titre="Informations"
            action={!readOnly && !modeEdition ? (
              <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => setModeEdition(true)}
                icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}>Modifier les informations</Button>
            ) : undefined}>
            {modeEdition ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                  <ModalField C={C} id="fiche-prenom" label="Prénom"><input id="fiche-prenom" className="cix-input" value={editPrenom} onChange={e => setEditPrenom(e.target.value)} style={champStyle(C)}/></ModalField>
                  <ModalField C={C} id="fiche-nom" label="Nom"><input id="fiche-nom" className="cix-input" value={editNom} onChange={e => setEditNom(e.target.value)} style={champStyle(C)}/></ModalField>
                  <ModalField C={C} id="fiche-tel" label="Téléphone"><input id="fiche-tel" type="tel" className="cix-input" value={editTelephone} onChange={e => setEditTelephone(e.target.value)} style={champStyle(C)}/></ModalField>
                  <ModalField C={C} id="fiche-email" label="Email"><input id="fiche-email" type="email" className="cix-input" value={editEmail} onChange={e => setEditEmail(e.target.value)} style={champStyle(C)}/></ModalField>
                  <ModalField C={C} id="fiche-poste" label="Poste"><input id="fiche-poste" className="cix-input" value={editPoste} onChange={e => setEditPoste(e.target.value)} style={champStyle(C)}/></ModalField>
                  <ModalField C={C} id="fiche-dept" label="Département">
                    <ComboField C={C} id="fiche-dept" valeur={editDepartmentId} onChange={setEditDepartmentId} aucunLabel="Aucun département" options={departments.map(d => ({ value: d.id, label: d.nom }))}
                      vide={{ titre: "Aucun département", aide: "Créez-en un dans l'onglet Départements." }}/>
                  </ModalField>
                </div>
                <ModalField C={C} id="fiche-manager" label="Manager">
                  <ComboField C={C} id="fiche-manager" valeur={editManagerId} onChange={setEditManagerId} aucunLabel="Aucun manager"
                    options={employees.filter(e => e.id !== employe.id).map(e => ({ value: e.id, label: `${e.prenom} ${e.nom}`, sub: ROLES.find(r => r.value === e.role)?.label, avatar: `${e.prenom.slice(0, 1)}${e.nom.slice(0, 1)}`.toUpperCase() }))}/>
                </ModalField>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => setModeEdition(false)}>Annuler</Button>
                  <Button tokens={ui} className="tap" variant="primary" size="md" loading={saving} onClick={enregistrerInformations}>Enregistrer</Button>
                </div>
              </div>
            ) : (
              <InfoGrid C={C} items={[
                { label: "Téléphone", valeur: employe.telephone, href: employe.telephone ? `tel:${employe.telephone.replace(/\s+/g, "")}` : undefined },
                { label: "Email", valeur: employe.email, href: employe.email ? `mailto:${employe.email}` : undefined },
                { label: "Matricule", valeur: employe.matricule },
                { label: "Date d'embauche", valeur: formatDate(employe.date_embauche) },
                { label: "Département", valeur: deptReel },
                { label: "Poste", valeur: employe.poste },
                { label: "Manager", valeur: managerReel },
              ]}/>
            )}
          </ProfileCard>
          <ProfileCard C={C} titre="Présence · 30 derniers jours">{indicateursPresence}</ProfileCard>
        </div>
      )}

      {onglet === "planning" && (
        <div role="tabpanel" id="fiche-tab-panel-planning" aria-labelledby="fiche-tab-planning">
          <ProfileCard C={C} titre={horaireActuel ? horaireActuel.nom : "Planning"}
            sousTitre={horaireActuel && assignment ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <StatusPill label={TYPES_HORAIRE.find(t => t.value === horaireActuel.type_horaire)?.label ?? horaireActuel.type_horaire} color={C.blue}/>
                <span>depuis le {formatDate(assignment.date_debut)}</span>
              </span>
            ) : undefined}
            action={!readOnly && !showReassign && horaireActuel ? (
              <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => setShowReassign(true)}>Changer d&apos;horaire</Button>
            ) : undefined}>
            {loadingAssignment ? <><Sk h={32}/><Sk h={32}/><Sk h={32}/></> : horaireActuel ? (
              <WeekRows C={C} jours={joursHoraire} nuit={horaireActuel.type_horaire === "nuit"}/>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 8px" }}>
                <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun horaire assigné</div>
                <div style={{ color: C.t2, fontSize: "13px", marginBottom: "12px" }}>Cet employé n&apos;a pas encore de modèle d&apos;horaire.</div>
                {!readOnly && !showReassign && <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={() => setShowReassign(true)}>Assigner un horaire</Button>}
              </div>
            )}
            {showReassign && (
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                  <ModalField C={C} id="fiche-horaire" label="Nouvel horaire">
                    <ComboField C={C} id="fiche-horaire" valeur={nouvelHoraireId} onChange={setNouvelHoraireId} aucunLabel="Sélectionner un horaire" options={workSchedules.filter(w => w.actif).map(w => ({ value: w.id, label: w.nom }))}/>
                  </ModalField>
                  <ModalField C={C} id="fiche-horaire-date" label="À partir du">
                    <DateField C={C} id="fiche-horaire-date" value={nouvelleDate} onChange={setNouvelleDate}/>
                  </ModalField>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => setShowReassign(false)}>Annuler</Button>
                  <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!nouvelHoraireId} loading={saving} onClick={reassigner}>Confirmer</Button>
                </div>
              </div>
            )}
          </ProfileCard>
        </div>
      )}

      {onglet === "presence" && (
        <div role="tabpanel" id="fiche-tab-panel-presence" aria-labelledby="fiche-tab-presence">
          {indicateursPresence}
          <ProfileCard C={C} titre="Historique des derniers pointages"
            action={!readOnly && !showAjoutPointage ? (
              <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => setShowAjoutPointage(true)}
                icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>Ajouter un pointage oublié</Button>
            ) : undefined}>
            {showAjoutPointage && (
              <div style={{ marginBottom: "16px", padding: "14px", border: `1px solid ${C.border}`, borderRadius: "10px", backgroundColor: C.bgCard2, display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
                  <ModalField C={C} id="fiche-corr-type" label="Type de pointage">
                    <select id="fiche-corr-type" className="cix-input" value={corrTypeAction} onChange={e => setCorrTypeAction(e.target.value as "entree" | "sortie")} style={champStyle(C)}>
                      <option value="entree">Arrivée</option><option value="sortie">Départ</option>
                    </select>
                  </ModalField>
                  <ModalField C={C} id="fiche-corr-date" label="Date et heure">
                    <input id="fiche-corr-date" type="datetime-local" className="cix-input" value={corrHorodatage} onChange={e => setCorrHorodatage(e.target.value)} style={champStyle(C)}/>
                  </ModalField>
                </div>
                <ModalField C={C} id="fiche-corr-raison" label="Raison" requis aide="Obligatoire, par exemple : oubli signalé par l'employé.">
                  <input id="fiche-corr-raison" className="cix-input" value={corrRaison} onChange={e => setCorrRaison(e.target.value)} style={champStyle(C)}/>
                </ModalField>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => { setShowAjoutPointage(false); setCorrHorodatage(""); setCorrRaison(""); }}>Annuler</Button>
                  <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!corrHorodatage || !corrRaison.trim()} loading={corrSaving} onClick={ajouterPointageOublie}>Valider</Button>
                </div>
              </div>
            )}
            {loadingHistorique ? <><Sk h={36}/><Sk h={36}/><Sk h={36}/></> : historique.slice(0, 7).length === 0 ? (
              <div style={{ color: C.t2, fontSize: "13px" }}>Aucun historique pour l&apos;instant.</div>
            ) : (
              <HistoryTable C={C} rows={historique.slice(0, 7).map<HistoryRow>(h => ({
                id: h.id, date: formatDate(h.date_jour), entree: heure12(h.premiere_entree), sortie: heure12(h.derniere_sortie),
                statut: h.statut, statutColor: presenceStatutColor(h.statut, C),
                supp: h.heures_supplementaires_minutes && h.heures_supplementaires_minutes > 0 ? dureeAffichee(h.heures_supplementaires_minutes) : null,
                horsZone: !!h.horsZone,
                onCorriger: !readOnly && jourEnCorrection !== h.id ? () => { setJourEnCorrection(h.id); setCorrStatutJour(h.statut); setCorrRaisonJour(""); } : undefined,
                extra: !readOnly && jourEnCorrection === h.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
                      <ModalField C={C} id="fiche-corr-statut" label="Statut du jour">
                        <select id="fiche-corr-statut" className="cix-input" value={corrStatutJour} onChange={e => setCorrStatutJour(e.target.value as PresenceStatut)} style={champStyle(C)}>
                          {STATUTS_JOUR.map(st => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </ModalField>
                      <ModalField C={C} id="fiche-corr-raison-jour" label="Raison de la correction" requis>
                        <input id="fiche-corr-raison-jour" className="cix-input" value={corrRaisonJour} onChange={e => setCorrRaisonJour(e.target.value)} style={champStyle(C)}/>
                      </ModalField>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => { setJourEnCorrection(null); setCorrRaisonJour(""); }}>Annuler</Button>
                      <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!corrRaisonJour.trim()} loading={corrSaving} onClick={() => corrigerStatutJour(h.id)}>Valider</Button>
                    </div>
                  </div>
                ) : undefined,
              }))}/>
            )}
          </ProfileCard>

          <ProfileCard C={C} titre="Journal des corrections">
            {loadingAuditLogs ? <><Sk h={36}/><Sk h={36}/></> : auditLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "12px 8px", color: C.t2, fontSize: "13px" }}>
                <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto 8px" }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Aucune correction enregistrée pour cet employé.
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {auditLogs.map((a, i) => (
                  <li key={a.id} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                      <span style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>{libelleActionAudit(a.action_type)}</span>
                      <span style={{ color: C.t3, fontSize: "13px" }}>{formatDate(a.created_at.slice(0, 10))}</span>
                    </div>
                    <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px" }}>{a.raison}</div>
                    <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>Par {a.membre_nom} · {a.audit_id}</div>
                  </li>
                ))}
              </ul>
            )}
          </ProfileCard>
        </div>
      )}

      {onglet === "documents" && (
        <div role="tabpanel" id="fiche-tab-panel-documents" aria-labelledby="fiche-tab-documents">
          <ProfileCard C={C} titre="Documents"
            action={!readOnly && !showAddDoc ? (
              <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => setShowAddDoc(true)}
                icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>Ajouter un document</Button>
            ) : undefined}>
            {showAddDoc && !readOnly && (
              <div style={{ marginBottom: "16px", padding: "14px", border: `1px solid ${C.border}`, borderRadius: "10px", backgroundColor: C.bgCard2, display: "flex", flexDirection: "column", gap: "14px" }}>
                <ModalField C={C} id="fiche-doc-label" label="Libellé" requis>
                  <input id="fiche-doc-label" className="cix-input" value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} placeholder="ex : Contrat de travail" style={champStyle(C)}/>
                </ModalField>
                <FileDropzone C={C} id="fiche-doc-fichier" fichier={uploadFile} onFichier={setUploadFile} accept="application/pdf,image/jpeg,image/png"/>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <Button tokens={ui} className="tap" variant="secondary" size="md" disabled={uploading} onClick={() => { setShowAddDoc(false); setUploadLabel(""); setUploadFile(null); }}>Annuler</Button>
                  <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!uploadFile || !uploadLabel.trim()} loading={uploading} onClick={televerserDocument}>Ajouter</Button>
                </div>
              </div>
            )}
            {loadingDocuments ? <><Sk h={40}/><Sk h={40}/></> : documents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 8px" }}>
                <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto 8px" }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600 }}>Aucun document</div>
                <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px" }}>Contrat, pièce d&apos;identité, attestation… ajoutez les documents de cet employé.</div>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {documents.map((doc, i) => (
                  <li key={doc.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {doc.signedUrl ? (
                        <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.t1, fontSize: "14px", fontWeight: 500, textDecoration: "underline", textDecorationColor: C.border2, overflowWrap: "anywhere" }}>{doc.label}</a>
                      ) : (
                        <span style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflowWrap: "anywhere" }}>{doc.label}</span>
                      )}
                      <div style={{ color: C.t3, fontSize: "12px" }}>
                        {formatDate(doc.created_at.slice(0, 10))}{doc.taille ? ` · ${doc.taille > 1048576 ? `${(doc.taille / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(doc.taille / 1024))} Ko`}` : ""}
                      </div>
                    </div>
                    {!readOnly && (
                      <button type="button" className="cix-btn tap" aria-label={`Supprimer le document ${doc.label}`} title="Supprimer" onClick={() => supprimerDocument(doc.id)}
                        style={{ width: "32px", height: "32px", background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ProfileCard>
        </div>
      )}

      {onglet === "securite" && (
        <div role="tabpanel" id="fiche-tab-panel-securite" aria-labelledby="fiche-tab-securite">
          {readOnly ? (
            <div style={{ color: C.t2, fontSize: "13px" }}>Vue en lecture seule : le statut et le PIN ne peuvent pas être modifiés.</div>
          ) : (
            <>
              <ProfileCard C={C} titre="Statut du compte" sousTitre={<span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>Statut actuel <StatusPill label={statutLabelAffiche(employe.statut)} color={couleurStatut(employe.statut)}/></span>}>
                <ScheduleTypeCards C={C} ariaLabel="Nouveau statut" minCarte={200} value={statutChoisi} readOnly={saving}
                  onChange={v => { const st = STATUTS.find(x => x.value === v); if (st) setStatutChoisi(st.value); }}
                  options={STATUTS.map(st => ({
                    value: st.value, label: st.label,
                    desc: ({ actif: "Pointage normal", teletravail: "Travaille à distance", mission: "En déplacement professionnel", en_conge: "Absence planifiée", suspendu: "Pointage suspendu", archive: "Ne fait plus partie de l'équipe active", desactive: "Compte désactivé" } as Record<EmployeeStatut, string>)[st.value],
                    badge: st.value === "suspendu" || st.value === "archive" || st.value === "desactive" ? "Restreint" : undefined,
                  }))}/>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
                  <Button tokens={ui} className="tap" variant="primary" size="md" disabled={statutChoisi === employe.statut} loading={saving} onClick={() => changerStatut(statutChoisi)}>Enregistrer le statut</Button>
                </div>
              </ProfileCard>

              <ProfileCard C={C} titre="PIN" sousTitre="Le PIN permet à l'employé de pointer.">
                {showResetPin ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <ModalField C={C} id="fiche-pin" label={`Nouveau PIN à 4 chiffres pour ${employe.prenom}`}>
                      <PinInput C={C} id="fiche-pin" valeur={nouveauPin} onChange={v => setNouveauPin(v.replace(/\D/g, "").slice(0, 4))} readOnly={saving}/>
                    </ModalField>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => { setShowResetPin(false); setNouveauPin(""); }}>Annuler</Button>
                      <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!PIN_REGEX.test(nouveauPin)} loading={saving} onClick={reinitialiserPin}>Valider</Button>
                    </div>
                  </div>
                ) : (
                  <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => setShowResetPin(true)}
                    icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>}>Réinitialiser le PIN</Button>
                )}
              </ProfileCard>
            </>
          )}
        </div>
      )}
    </ClockModal>
  );
}

function InfoLigne({ C, label, valeur }: { C: ThemeTokens; label: string; valeur: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
      <span style={{ color: C.t3 }}>{label}</span>
      <span style={{ color: C.t1, fontWeight: 600 }}>{valeur}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DÉPARTEMENTS
// ═══════════════════════════════════════════════════════════════════════
// Seuils "taille d'équipe" — assumés, pas dictés par le brief (aucune
// définition officielle Petit/Moyen/Très grand n'existe pour ce produit).
function tailleEquipe(n: number): "petit" | "moyen" | "grand" {
  if (n >= 21) return "grand";
  if (n >= 6) return "moyen";
  return "petit";
}

function DepartementsView({ C, departments, employees, assignments, workSchedules, readOnly, onToast, onReload, active = true, liveHost, erreur }: {
  C: ThemeTokens; departments: Department[]; employees: Employee[]; assignments: Assignment[]; workSchedules: WorkSchedule[];
  readOnly: boolean; onToast: (msg: string, color?: string) => void; onReload: (silencieux?: boolean) => void; active?: boolean;
  liveHost: HTMLElement | null; erreur: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Department | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtreRapide, setFiltreRapide] = useState<"tous" | "actifs" | "alertes" | "sans_manager">("tous");
  const [lastSync, setLastSync] = useState(new Date());
  const [maintenant, setMaintenant] = useState(Date.now());
  const [jourDuJour, setJourDuJour] = useState<JourReponse | null>(null);

  useEffect(() => { setLastSync(new Date()); }, [departments]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => onReload(true), 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Présence du jour, nécessaire pour les stats par département (carte,
  // KPI conformité, alerte "présence < 80%") — pas disponible via les
  // props existantes (employees/assignments), fetch dédié à cet écran.
  useEffect(() => {
    let annule = false;
    fetch(`/api/institution/clock-in/attendance?date=${todayStr()}`)
      .then(r => r.json()).catch(() => null)
      .then(j => { if (!annule) setJourDuJour({ records: j?.records ?? [], kpis: j?.kpis ?? { present: 0, retard: 0, absent: 0, conge: 0, incomplet: 0, departsAnticipes: 0 }, conformite: j?.conformite ?? null, heuresTravailleesMoyenne: j?.heuresTravailleesMoyenne ?? 0 }); });
    return () => { annule = true; };
  }, []);

  const horaireParEmploye = new Map(assignments.filter(a => !a.date_fin).map(a => [a.employee_id, a.work_schedule_id]));
  const recordParEmploye = new Map((jourDuJour?.records ?? []).map(r => [r.employee_id, r]));

  function employesDe(deptId: string): Employee[] {
    return employees.filter(e => e.department_id === deptId);
  }
  function statsDept(deptId: string) {
    const emps = employesDe(deptId).filter(e => e.statut === "actif");
    const records = emps.map(e => recordParEmploye.get(e.id)).filter((r): r is PresenceRecord => !!r);
    const presents = records.filter(r => r.statut === "Présent" || r.statut === "Retard").length;
    const retards = records.filter(r => r.statut === "Retard").length;
    const absences = records.filter(r => r.statut === "Absent").length;
    const conges = emps.filter(e => e.statut === "en_conge").length;
    const tauxPresence = emps.length > 0 ? Math.round((presents / emps.length) * 100) : null;
    // Horaire "le plus fréquent" — un département peut avoir des employés
    // sur des horaires différents, ce n'est pas une propriété unique du
    // département en base. Approximation assumée, affichée comme telle.
    const compteHoraires = new Map<string, number>();
    for (const e of emps) {
      const hId = horaireParEmploye.get(e.id);
      if (hId) compteHoraires.set(hId, (compteHoraires.get(hId) ?? 0) + 1);
    }
    let horairePrincipal: WorkSchedule | null = null;
    let max = 0;
    for (const [hId, n] of compteHoraires) { if (n > max) { max = n; horairePrincipal = workSchedules.find(w => w.id === hId) ?? null; } }
    const sansHoraire = emps.some(e => !horaireParEmploye.has(e.id));
    return { emps, presents, retards, absences, conges, tauxPresence, horairePrincipal, sansHoraire };
  }
  function managerDe(deptId: string): Employee | null {
    const dept = departments.find(d => d.id === deptId);
    return dept?.responsable_id ? employees.find(e => e.id === dept.responsable_id) ?? null : null;
  }

  const debutMois = todayStr().slice(0, 7);
  const departementsAvecAlerte = departments.filter(d => {
    const s = statsDept(d.id);
    return !d.responsable_id || s.emps.length === 0 || s.sansHoraire || (s.tauxPresence !== null && s.tauxPresence < 80);
  });

  const employesActifsTotal = employees.filter(e => e.statut === "actif").length;
  const managersUniques = new Set(departments.map(d => d.responsable_id).filter((id): id is string => !!id)).size;
  const departementsComplets = departments.filter(d => d.responsable_id && employesDe(d.id).length > 0).length;
  const conformiteGlobale = jourDuJour?.conformite ?? null;

  const insights: string[] = [];
  if (departments.length > 0 && jourDuJour) {
    const parPonctualite = departments.map(d => { const s = statsDept(d.id); return { nom: d.nom, retards: s.retards, emps: s.emps.length }; }).filter(d => d.emps > 0);
    const meilleure = [...parPonctualite].sort((a, b) => a.retards / a.emps - b.retards / b.emps)[0];
    if (meilleure && meilleure.retards === 0) insights.push(`Le département ${meilleure.nom} affiche zéro retard aujourd'hui.`);
    const recrutements = departments.map(d => ({ nom: d.nom, n: employesDe(d.id).filter(e => e.date_embauche.slice(0, 7) === debutMois).length })).sort((a, b) => b.n - a.n);
    if (recrutements[0]?.n > 0) insights.push(`Le département ${recrutements[0].nom} recrute le plus rapidement ce mois-ci (${recrutements[0].n} nouvel${recrutements[0].n > 1 ? "les" : ""} arrivée${recrutements[0].n > 1 ? "s" : ""}).`);
    const faibleAssiduite = parPonctualite.filter(d => d.emps > 0).map(d => { const s = statsDept(departments.find(x => x.nom === d.nom)!.id); return { nom: d.nom, taux: s.tauxPresence }; }).filter(d => d.taux !== null && d.taux < 80);
    if (faibleAssiduite.length > 0) insights.push(`Suggestion : le département ${faibleAssiduite[0].nom} est sous 80% de présence aujourd'hui — vérifier les horaires ou les affectations.`);
  }

  const departementsFiltres = departments.filter(d => {
    const s = statsDept(d.id);
    if (filtreRapide === "actifs" && d.actif !== true) return false;
    if (filtreRapide === "alertes" && !departementsAvecAlerte.includes(d)) return false;
    if (filtreRapide === "sans_manager" && d.responsable_id) return false;
    if (recherche.trim() && !d.nom.toLowerCase().includes(recherche.trim().toLowerCase())) return false;
    void s;
    return true;
  });

  async function creer() {
    if (!nom.trim()) return;
    setSaving(true);
    setErreurServeur(null);
    const res = await fetch("/api/institution/clock-in/departments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, description: description || undefined, responsableId: responsableId || undefined }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { setErreurServeur(j?.error || "Ce département n'a pas pu être créé."); onToast(j?.error || "Ce département n'a pas pu être créé.", C.red); return; }
    setShowForm(false); setNom(""); setDescription(""); setResponsableId("");
    onToast("Département créé", C.green);
    onReload();
  }

  function exporterCsv() {
    const lignes = [
      ["Département", "Employés", "Manager", "Présence aujourd'hui"],
      ...departementsFiltres.map(d => { const s = statsDept(d.id); const m = managerDe(d.id); return [d.nom, String(s.emps.length), m ? `${m.prenom} ${m.nom}` : "", s.tauxPresence === null ? "" : `${s.tauxPresence}%`]; }),
    ];
    const csv = lignes.map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "departements.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Présentation (aucune logique métier modifiée) ─────────────────────
  const pluriel = (n: number) => (n > 1 ? "s" : "");
  const basculerAlertes = () => setFiltreRapide(filtreRapide === "alertes" ? "tous" : "alertes");
  const kpiItems: AttendanceKpi[] = [
    { key: "depts", label: "Départements", value: String(departments.length) },
    { key: "employes", label: "Employés", value: String(employesActifsTotal) },
    { key: "managers", label: "Managers", value: String(managersUniques) },
    { key: "complets", label: "Départements complets", value: String(departementsComplets) },
    { key: "alertes", label: "Avec alertes", value: String(departementsAvecAlerte.length), ambre: departementsAvecAlerte.length > 0, onClick: basculerAlertes, active: filtreRapide === "alertes" },
    { key: "conformite", label: "Conformité globale", value: conformiteGlobale === null ? "—" : String(conformiteGlobale), unit: conformiteGlobale === null ? undefined : "%" },
  ];
  const raisonsDe = (d: Department) => {
    const s = statsDept(d.id);
    return [
      !d.responsable_id && "sans manager",
      s.emps.length === 0 && "sans employé",
      s.sansHoraire && s.emps.length > 0 && "au moins un employé sans horaire",
      s.tauxPresence !== null && s.tauxPresence < 80 && `présence à ${s.tauxPresence}%`,
    ].filter(Boolean).join(", ");
  };
  // Un résumé unique seulement quand plusieurs départements sont en alerte ;
  // sinon l'alerte reste portée par la carte du département concerné.
  const alertesGroupees: AttendanceAlert[] = departementsAvecAlerte.length > 1
    ? departementsAvecAlerte.slice(0, 6).map(d => ({ key: d.id, texte: `${d.nom} — ${raisonsDe(d)}`, noms: [] as string[], action: { label: "Corriger", onClick: () => setSelected(d) } }))
    : [];

  const FILTRES_DEPT = [
    { key: "tous", label: "Tous", count: departments.length },
    { key: "actifs", label: "Actifs", count: departments.filter(d => d.actif === true).length },
    { key: "alertes", label: "Avec alertes", count: departementsAvecAlerte.length },
    { key: "sans_manager", label: "Sans manager", count: departments.filter(d => !d.responsable_id).length },
  ] as const;
  const aFiltre = filtreRapide !== "tous" || recherche.trim() !== "";
  function reinitialiserFiltres() { setFiltreRapide("tous"); setRecherche(""); }
  const chips = [
    ...(recherche.trim() ? [{ key: "q", label: `Recherche : ${recherche.trim()}`, onRemove: () => setRecherche("") }] : []),
    ...(filtreRapide !== "tous" ? [{ key: "f", label: FILTRES_DEPT.find(f => f.key === filtreRapide)?.label ?? filtreRapide, onRemove: () => setFiltreRapide("tous") }] : []),
  ];

  const cartes: DepartmentCardData[] = departementsFiltres.map(d => {
    const st = statsDept(d.id);
    const m = managerDe(d.id);
    const enAlerte = departementsAvecAlerte.includes(d);
    return {
      id: d.id, nom: d.nom, nbEmployes: st.emps.length, manager: m ? `${m.prenom} ${m.nom}` : null,
      badges: [
        ...(!d.responsable_id ? ["Sans manager"] : []),
        ...(st.emps.length === 0 ? ["Sans employé"] : []),
        ...(st.sansHoraire && st.emps.length > 0 ? ["Employé sans horaire"] : []),
        ...(st.tauxPresence !== null && st.tauxPresence < 80 ? [`Présence à ${st.tauxPresence} %`] : []),
      ],
      retards: st.retards, absences: st.absences, taux: st.tauxPresence, horaire: st.horairePrincipal?.nom ?? null,
      enAlerte, peutAssigner: !readOnly, onOpen: () => setSelected(d), onCorriger: () => setSelected(d),
    };
  });

  const repartitionDepts = departments.map(d => ({ id: d.id, nom: d.nom, n: employesDe(d.id).length }));
  const sansDepartement = employees.filter(e => !e.department_id).length;
  const tailles = ([["grand", "Très grands (21+)", C.purple], ["moyen", "Moyens (6-20)", C.blue], ["petit", "Petits (1-5)", C.teal]] as const)
    .map(([key, label, color]) => ({ key, label, color, n: departments.filter(d => tailleEquipe(employesDe(d.id).length) === key).length }))
    .filter(t => t.n > 0);

  return (
    <div>
      {liveHost && active && createPortal(
        <LiveIndicator C={C} sync={`synchronisé ${ilYA(lastSync, maintenant)}`} calcul={null} calculPerime={false}/>,
        liveHost,
      )}

      {erreur && departments.length === 0 ? (
        <AttendanceError C={C} onRetry={() => onReload()}/>
      ) : (
        <>
          <AttendanceSummary C={C} items={kpiItems} repli={3}/>
          <AttendanceAlerts C={C} lignes={alertesGroupees} titre={alertesGroupees.length > 0 ? `${alertesGroupees.length} point${pluriel(alertesGroupees.length)} d'attention` : undefined} suggestions={insights}/>
          <DepartmentsToolbar C={C} avecDonnees={departments.length > 0} search={recherche} onSearch={setRecherche}
            filtres={FILTRES_DEPT.map(f => ({ key: f.key, label: f.label, count: f.count }))} filtreActif={filtreRapide}
            onFiltre={k => { const f = FILTRES_DEPT.find(x => x.key === k); if (f) setFiltreRapide(f.key); }}
            chips={chips} onReset={reinitialiserFiltres} aFiltre={aFiltre} total={departementsFiltres.length}
            canCreate={!readOnly} onCreate={() => setShowForm(v => !v)} onRefresh={() => onReload()} onExport={exporterCsv}/>
        </>
      )}

      {showForm && (() => {
        const fermer = () => { setShowForm(false); setNom(""); setDescription(""); setResponsableId(""); setErreurServeur(null); };
        const ui = toUiTokens(C);
        const erreurNom = erreurServeur && /nom|exist|utilis|doublon/i.test(erreurServeur) ? erreurServeur : null;
        return (
          <ClockModal C={C} titre="Nouveau département" sousTitre="Regroupez vos employés par équipe." labelId="departement-modal-titre" largeur={500}
            onClose={fermer} modifie={!!(nom.trim() || description.trim() || responsableId)}
            onSubmit={() => { if (nom.trim() && !saving) creer(); }}
            aide={!nom.trim() ? "Renseignez le nom du département." : undefined}
            actions={
              <>
                <Button tokens={ui} className="tap" variant="secondary" size="md" disabled={saving} onClick={fermer}>Annuler</Button>
                <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!nom.trim()} loading={saving} onClick={creer}>
                  {saving ? "Création…" : "Créer"}
                </Button>
              </>
            }>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {erreurServeur && (
                <div role="alert" style={{ padding: "10px 14px", borderRadius: "8px", backgroundColor: `${C.red}14`, border: `1px solid ${C.red}33`, color: C.red, fontSize: "13.5px" }}>{erreurServeur}</div>
              )}
              <ModalField C={C} id="departement-nom" label="Nom" requis erreur={erreurNom}>
                <input id="departement-nom" data-autofocus className="cix-input" readOnly={saving} value={nom} onChange={e => setNom(e.target.value)} placeholder="ex : Comptabilité"
                  aria-invalid={erreurNom ? true : undefined} aria-describedby={erreurNom ? "departement-nom-erreur" : undefined}
                  style={{ ...champStyle(C), borderColor: erreurNom ? C.red : C.border2 }}/>
              </ModalField>
              <ModalField C={C} id="departement-description" label="Description" optionnel>
                <textarea id="departement-description" className="cix-input" rows={3} readOnly={saving} value={description} onChange={e => setDescription(e.target.value)}
                  style={{ ...champStyle(C), height: "auto", minHeight: "88px", padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }}/>
              </ModalField>
              <ModalField C={C} id="departement-manager" label="Manager" optionnel>
                <ComboField C={C} id="departement-manager" valeur={responsableId} onChange={setResponsableId} readOnly={saving}
                  options={employees.map(e => ({ value: e.id, label: `${e.prenom} ${e.nom}`, sub: ROLES.find(r => r.value === e.role)?.label, avatar: `${e.prenom.slice(0, 1)}${e.nom.slice(0, 1)}`.toUpperCase() }))}
                  vide={{ titre: "Aucun employé disponible", aide: "Ajoutez des employés dans l'onglet Employés." }}/>
              </ModalField>
            </div>
          </ClockModal>
        );
      })()}

      {departments.length === 0 && !showForm ? (
        <EmptyState C={C} illustration={<IllustrationDepartements C={C}/>}
          titre="Organisez votre entreprise"
          texte="Créez vos départements pour regrouper vos employés et suivre leur présence équipe par équipe."
          cta={!readOnly ? { label: "+ Créer mon premier département", onClick: () => setShowForm(true) } : undefined}/>
      ) : departments.length > 0 && !(erreur && departments.length === 0) ? (
        <>
          {departementsFiltres.length === 0 ? (
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun résultat</div>
              <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Aucun département ne correspond à ces critères.</div>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={reinitialiserFiltres}>Réinitialiser</Button>
            </div>
          ) : (
            <DepartmentGrid C={C} cartes={cartes}/>
          )}
          <DistributionCard C={C} departements={repartitionDepts} sansDepartement={sansDepartement} statuts={tailles} total={employees.length}
            titreDroite="Taille des équipes" totalDroite={departments.length}/>
        </>
      ) : null}

      {selected && (
        <DepartementDetailDrawer C={C} departement={selected} employees={employees} stats={statsDept(selected.id)} manager={managerDe(selected.id)}
          readOnly={readOnly} onClose={() => setSelected(null)} onToast={onToast} onReload={onReload}/>
      )}
    </div>
  );
}

function DepartementDetailDrawer({ C, departement, employees, stats, manager, readOnly, onClose, onToast, onReload }: {
  C: ThemeTokens; departement: Department; employees: Employee[];
  stats: { emps: Employee[]; presents: number; retards: number; absences: number; conges: number; tauxPresence: number | null; horairePrincipal: WorkSchedule | null; sansHoraire: boolean };
  manager: Employee | null; readOnly: boolean; onClose: () => void; onToast: (msg: string, color?: string) => void; onReload: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [editNom, setEditNom] = useState(departement.nom);
  const [editDescription, setEditDescription] = useState(departement.description ?? "");
  const [editResponsableId, setEditResponsableId] = useState(departement.responsable_id ?? "");

  async function enregistrer() {
    setSaving(true);
    const res = await fetch("/api/institution/clock-in/departments", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: departement.id, nom: editNom, description: editDescription, responsableId: editResponsableId || null }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Ce département n'a pas pu être mis à jour.", C.red); return; }
    setModeEdition(false);
    onToast("Département mis à jour", C.green);
    onReload();
  }

  async function supprimer() {
    const res = await fetch(`/api/institution/clock-in/departments?id=${departement.id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur de suppression", C.red); return; }
    onToast("Département supprimé", C.orange);
    onReload();
    onClose();
  }

  return (
    <div className="cis-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media(min-width:1024px){
          .cis-fiche-overlay{align-items:center!important}
          .cis-fiche-panel{max-width:560px!important;border-radius:20px!important;max-height:86svh!important}
          .cis-fiche-grip{display:none!important}
          .cis-fiche-close-x{display:flex!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="cis-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div className="cis-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
        <button onClick={onClose} className="cis-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

        {modeEdition ? (
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px", marginBottom: "20px" }}>
            <input value={editNom} onChange={e => setEditNom(e.target.value)} placeholder="Nom" style={{ ...inputStyle(C), marginBottom: "8px" }}/>
            <input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description" style={{ ...inputStyle(C), marginBottom: "8px" }}/>
            <select value={editResponsableId} onChange={e => setEditResponsableId(e.target.value)} style={{ ...inputStyle(C), marginBottom: "10px" }}>
              <option value="">Aucun manager</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth onClick={() => setModeEdition(false)}>Annuler</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" fullWidth loading={saving} onClick={enregistrer}>Enregistrer</Button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ color: C.t1, fontSize: "18px", fontWeight: 800, marginBottom: "4px" }}>{departement.nom}</div>
            {departement.description && <div style={{ color: C.t3, fontSize: "12px" }}>{departement.description}</div>}
            {!readOnly && <button onClick={() => setModeEdition(true)} style={{ marginTop: "8px", background: "none", border: "none", color: C.gold, fontWeight: 700, fontSize: "12px", cursor: "pointer", padding: 0 }}>Modifier</button>}
          </div>
        )}

        <DrawerSection C={C} titre="Manager">
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
            {manager ? (
              <>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700 }}>{manager.prenom} {manager.nom}</div>
                <div style={{ color: C.t3, fontSize: "11.5px", marginTop: "2px" }}>{manager.telephone ?? "Téléphone non renseigné"}{manager.email ? ` · ${manager.email}` : ""}</div>
              </>
            ) : (
              <div style={{ color: C.t3, fontSize: "12px" }}>Aucun manager assigné</div>
            )}
          </div>
        </DrawerSection>

        <DrawerSection C={C} titre="Statistiques (aujourd'hui)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ color: C.t1, fontSize: "18px", fontWeight: 800 }}>{stats.emps.length}</div>
              <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700 }}>Employés</div>
            </div>
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ color: C.green, fontSize: "18px", fontWeight: 800 }}>{stats.presents}</div>
              <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700 }}>Présents</div>
            </div>
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ color: C.orange, fontSize: "18px", fontWeight: 800 }}>{stats.retards}</div>
              <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700 }}>Retards</div>
            </div>
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ color: C.blue, fontSize: "18px", fontWeight: 800 }}>{stats.conges}</div>
              <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700 }}>Congés</div>
            </div>
          </div>
        </DrawerSection>

        <DrawerSection C={C} titre="Planning">
          {stats.horairePrincipal ? (
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>{stats.horairePrincipal.nom} <span style={{ color: C.t3, fontWeight: 500, fontSize: "11px" }}>(horaire le plus fréquent du département)</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                {JOURS.map(j => {
                  const jc = stats.horairePrincipal!.pattern.jours[j.key];
                  return (
                    <div key={j.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                      <span style={{ color: C.t2 }}>{j.label}</span>
                      <span style={{ color: jc?.repos ? C.t3 : C.t1, fontWeight: 600 }}>{jc?.repos || !jc?.segments.length ? "Repos" : jc.segments.map(s => `${s.debut}-${s.fin}`).join(", ")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ color: C.t3, fontSize: "12px" }}>Aucun horaire affecté aux employés de ce département.</div>
          )}
        </DrawerSection>

        <DrawerSection C={C} titre="Employés">
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {stats.emps.length === 0 ? <div style={{ color: C.t3, fontSize: "12px" }}>Aucun employé.</div> : stats.emps.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg3, borderRadius: "8px", padding: "8px 10px" }}>
                <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700 }}>{e.prenom} {e.nom}</span>
                <span style={{ color: statutColor(e.statut, C), fontSize: "9.5px", fontWeight: 800 }}>{statutLabelAffiche(e.statut)}</span>
              </div>
            ))}
          </div>
        </DrawerSection>

        {!readOnly && (
          <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" fullWidth onClick={supprimer}>Supprimer le département</Button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HORAIRES
// ═══════════════════════════════════════════════════════════════════════
// "Flexible" = tout ce qui n'est pas un horaire fixe identique chaque jour
// (fractionné/nuit/variable) — regroupement assumé pour ce KPI, le brief ne
// définissait pas cette frontière précisément.
function estFlexible(t: TypeHoraire): boolean {
  return t !== "fixe";
}

function HorairesView({ C, workSchedules, employees, departments, assignments, readOnly, onToast, onReload, active = true, liveHost, erreur }: {
  C: ThemeTokens; workSchedules: WorkSchedule[]; employees: Employee[]; departments: Department[]; assignments: Assignment[];
  readOnly: boolean; onToast: (msg: string, color?: string) => void; onReload: (silencieux?: boolean) => void; active?: boolean;
  liveHost: HTMLElement | null; erreur: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [type, setType] = useState<TypeHoraire>("fixe");
  const [pattern, setPattern] = useState<Pattern>(defaultPattern("fixe"));
  const [toleranceRetard, setToleranceRetard] = useState(10);
  const [toleranceDepart, setToleranceDepart] = useState(0);
  const [pauseObligatoire, setPauseObligatoire] = useState(0);
  const [heuresSupAutorisees, setHeuresSupAutorisees] = useState(false);
  const [heuresSupSeuil, setHeuresSupSeuil] = useState(480);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<WorkSchedule | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtreType, setFiltreType] = useState<"tous" | TypeHoraire>("tous");
  const [lastSync, setLastSync] = useState(new Date());
  const [maintenant, setMaintenant] = useState(Date.now());

  useEffect(() => { setLastSync(new Date()); }, [workSchedules]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => onReload(true), 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const assignationsOuvertes = assignments.filter(a => !a.date_fin);
  function employesDuHoraire(horaireId: string): Employee[] {
    const ids = new Set(assignationsOuvertes.filter(a => a.work_schedule_id === horaireId).map(a => a.employee_id));
    return employees.filter(e => ids.has(e.id));
  }

  const employesPlanifies = new Set(assignationsOuvertes.map(a => a.employee_id)).size;
  const horairesSansEmploye = workSchedules.filter(w => w.actif && employesDuHoraire(w.id).length === 0);
  const insights: string[] = [];
  if (workSchedules.length > 0) {
    const parUsage = workSchedules.map(w => ({ nom: w.nom, n: employesDuHoraire(w.id).length })).sort((a, b) => b.n - a.n);
    if (parUsage[0]?.n > 0) insights.push(`L'horaire le plus utilisé est "${parUsage[0].nom}" (${parUsage[0].n} employé${parUsage[0].n > 1 ? "s" : ""}).`);
    if (horairesSansEmploye.length > 0) insights.push(`Suggestion : ${horairesSansEmploye.length} horaire${horairesSansEmploye.length > 1 ? "s" : ""} actif${horairesSansEmploye.length > 1 ? "s" : ""} sans aucun employé assigné — à affecter ou archiver.`);
  }

  function changerType(t: TypeHoraire) {
    setType(t);
    setPattern(defaultPattern(t));
  }

  function toggleRepos(jourKey: string) {
    setPattern(p => ({ jours: { ...p.jours, [jourKey]: { ...p.jours[jourKey], repos: !p.jours[jourKey].repos, segments: p.jours[jourKey].repos ? [{ debut: "08:00", fin: "17:00" }] : [] } } }));
  }
  function updateSegment(jourKey: string, idx: number, champ: "debut" | "fin", valeur: string) {
    setPattern(p => {
      const segments = [...p.jours[jourKey].segments];
      segments[idx] = { ...segments[idx], [champ]: valeur };
      return { jours: { ...p.jours, [jourKey]: { ...p.jours[jourKey], segments } } };
    });
  }
  function ajouterSegment(jourKey: string) {
    setPattern(p => ({ jours: { ...p.jours, [jourKey]: { ...p.jours[jourKey], segments: [...p.jours[jourKey].segments, { debut: "14:00", fin: "18:00" }] } } }));
  }
  function retirerSegment(jourKey: string, idx: number) {
    setPattern(p => ({ jours: { ...p.jours, [jourKey]: { ...p.jours[jourKey], segments: p.jours[jourKey].segments.filter((_, i) => i !== idx) } } }));
  }
  function appliquerATous(jourSourceKey: string) {
    const source = pattern.jours[jourSourceKey];
    setPattern(p => {
      const jours = { ...p.jours };
      for (const j of JOURS) if (!jours[j.key].repos) jours[j.key] = { repos: false, segments: source.segments.map(s => ({ ...s })) };
      return { jours };
    });
  }

  function resetForm() {
    setNom(""); setType("fixe"); setPattern(defaultPattern("fixe"));
    setToleranceRetard(10); setToleranceDepart(0); setPauseObligatoire(0);
    setHeuresSupAutorisees(false); setHeuresSupSeuil(480);
  }

  async function creer() {
    if (!nom.trim()) return;
    setSaving(true);
    const res = await fetch("/api/institution/clock-in/work-schedules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom, typeHoraire: type, pattern,
        toleranceRetardMinutes: toleranceRetard, toleranceDepartAnticipeMinutes: toleranceDepart,
        pauseObligatoireMinutes: pauseObligatoire, heuresSupAutorisees, heuresSupSeuilMinutes: heuresSupAutorisees ? heuresSupSeuil : undefined,
      }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Cet horaire n'a pas pu être créé.", C.red); return; }
    setShowForm(false); resetForm();
    onToast("Horaire créé", C.green);
    onReload();
  }

  async function supprimer(id: string) {
    const res = await fetch(`/api/institution/clock-in/work-schedules?id=${id}`, { method: "DELETE" });
    const j = await res.json().catch(() => null);
    if (!res.ok) { onToast(j?.error || "Erreur de suppression", C.red); return; }
    onToast("Horaire supprimé", C.orange);
    onReload();
    setSelected(null);
  }

  async function dupliquer(w: WorkSchedule) {
    const res = await fetch("/api/institution/clock-in/work-schedules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom: `${w.nom} (copie)`, typeHoraire: w.type_horaire, pattern: w.pattern,
        toleranceRetardMinutes: w.tolerance_retard_minutes, toleranceDepartAnticipeMinutes: w.tolerance_depart_anticipe_minutes,
        pauseObligatoireMinutes: w.pause_obligatoire_minutes, heuresSupAutorisees: w.heures_sup_autorisees, heuresSupSeuilMinutes: w.heures_sup_seuil_minutes ?? undefined,
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { onToast(j?.error || "Cet horaire n'a pas pu être dupliqué.", C.red); return; }
    onToast("Horaire dupliqué", C.green);
    onReload();
  }

  async function toggleActif(w: WorkSchedule) {
    const res = await fetch("/api/institution/clock-in/work-schedules", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: w.id, actif: !w.actif }),
    });
    if (!res.ok) { onToast("Impossible de changer le statut de cet horaire.", C.red); return; }
    onToast(w.actif ? "Horaire archivé" : "Horaire réactivé", C.orange);
    onReload();
  }

  // ── Présentation (aucune logique métier modifiée) ─────────────────────
  const pluriel = (n: number) => (n > 1 ? "s" : "");
  const DESC_TYPE: Record<TypeHoraire, string> = {
    fixe: "Mêmes horaires chaque jour", fractionne: "Deux plages par jour", nuit: "Travail de nuit", variable: "Horaires différents selon les jours",
  };
  const joursDe = (pat: Pattern): JourPlanning[] => JOURS.map(j => ({
    key: j.key, label: j.label, repos: pat.jours[j.key]?.repos ?? true,
    segments: (pat.jours[j.key]?.segments ?? []).map(g => ({ debut: g.debut, fin: g.fin })),
  }));
  const kpiItems: AttendanceKpi[] = [
    { key: "actifs", label: "Modèles actifs", value: String(workSchedules.filter(w => w.actif).length) },
    { key: "planifies", label: "Employés planifiés", value: String(employesPlanifies) },
    { key: "flexibles", label: "Horaires flexibles", value: String(workSchedules.filter(w => estFlexible(w.type_horaire)).length) },
    { key: "fixes", label: "Horaires fixes", value: String(workSchedules.filter(w => w.type_horaire === "fixe").length) },
  ];
  const terme = recherche.trim().toLowerCase();
  const horairesFiltres = workSchedules.filter(w => (filtreType === "tous" || w.type_horaire === filtreType) && (!terme || w.nom.toLowerCase().includes(terme)));
  const filtresType = [
    { key: "tous", label: "Tous", count: workSchedules.length },
    ...TYPES_HORAIRE.map(t => ({ key: t.value as string, label: t.label, count: workSchedules.filter(w => w.type_horaire === t.value).length })),
  ];
  const aFiltre = filtreType !== "tous" || terme !== "";
  function reinitialiserFiltres() { setFiltreType("tous"); setRecherche(""); }
  const chips = [
    ...(terme ? [{ key: "q", label: `Recherche : ${recherche.trim()}`, onRemove: () => setRecherche("") }] : []),
    ...(filtreType !== "tous" ? [{ key: "t", label: `Type : ${TYPES_HORAIRE.find(t => t.value === filtreType)?.label ?? filtreType}`, onRemove: () => setFiltreType("tous") }] : []),
  ];
  const cartes: ScheduleCardData[] = horairesFiltres.map(w => ({
    id: w.id, nom: w.nom, typeKey: w.type_horaire, typeLabel: TYPES_HORAIRE.find(t => t.value === w.type_horaire)?.label ?? w.type_horaire,
    actif: w.actif, nbEmployes: employesDuHoraire(w.id).length, tolerance: w.tolerance_retard_minutes,
    jours: joursDe(w.pattern), onOpen: () => setSelected(w),
  }));
  const alertes = horairesSansEmploye.length > 0 ? [{
    key: "se", noms: [] as string[],
    texte: `${horairesSansEmploye.length} horaire${pluriel(horairesSansEmploye.length)} actif${pluriel(horairesSansEmploye.length)} sans employé assigné`,
  }] : [];

  const joursForm = joursDe(pattern);
  const modifie = nom.trim() !== "" || type !== "fixe" || JSON.stringify(pattern) !== JSON.stringify(defaultPattern(type))
    || toleranceRetard !== 10 || toleranceDepart !== 0 || pauseObligatoire !== 0 || heuresSupAutorisees || heuresSupSeuil !== 480;
  const fermerForm = () => { setShowForm(false); resetForm(); };
  const avertissements = joursForm.some(j => j.segments.some(g => g.fin <= g.debut) && !j.repos) && type !== "nuit";
  const ui = toUiTokens(C);

  return (
    <div>
      {liveHost && active && createPortal(
        <LiveIndicator C={C} sync={`synchronisé ${ilYA(lastSync, maintenant)}`} calcul={null} calculPerime={false}/>,
        liveHost,
      )}

      {erreur && workSchedules.length === 0 ? (
        <AttendanceError C={C} onRetry={() => onReload()}/>
      ) : (
        <>
          <AttendanceSummary C={C} items={kpiItems} repli={2}/>
          <AttendanceAlerts C={C} lignes={alertes}/>
          <InfoLine C={C} textes={insights}/>
          <DepartmentsToolbar C={C} avecDonnees={workSchedules.length > 0} search={recherche} onSearch={setRecherche}
            filtres={filtresType} filtreActif={filtreType}
            onFiltre={k => { if (k === "tous") setFiltreType("tous"); else { const t = TYPES_HORAIRE.find(x => x.value === k); if (t) setFiltreType(t.value); } }}
            chips={chips} onReset={reinitialiserFiltres} aFiltre={aFiltre} total={horairesFiltres.length}
            canCreate={!readOnly} onCreate={() => setShowForm(v => !v)}
            unite="modèle" placeholder="Rechercher un modèle…" createLabel="Nouveau modèle"/>
        </>
      )}

      {showForm && (
        <ClockModal C={C} titre="Nouveau modèle d'horaire" labelId="horaire-modal-titre" onClose={fermerForm} modifie={modifie}
          aide={!nom.trim() ? "Renseignez le nom du modèle pour pouvoir l'enregistrer." : avertissements ? "Vérifiez les plages horaires signalées avant d'enregistrer." : undefined}
          actions={
            <>
              <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={fermerForm}>Annuler</Button>
              <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!nom.trim()} loading={saving} onClick={creer}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            <ModalField C={C} id="horaire-nom" label="Nom" requis>
              <input id="horaire-nom" data-autofocus className="cix-input" value={nom} onChange={e => setNom(e.target.value)} placeholder="ex : Équipe de jour" style={champStyle(C)}/>
            </ModalField>

            <div>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Type</div>
              <ScheduleTypeCards C={C} value={type} onChange={v => { const t = TYPES_HORAIRE.find(x => x.value === v); if (t) changerType(t.value); }}
                options={TYPES_HORAIRE.map(t => ({ value: t.value, label: t.label, desc: DESC_TYPE[t.value] }))}/>
            </div>

            <WeekPlanEditor C={C} jours={joursForm} nuit={type === "nuit"}
              onToggle={toggleRepos} onUpdate={updateSegment} onAdd={ajouterSegment} onRemove={retirerSegment} onApplyAll={appliquerATous}/>

            <div>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Tolérances (minutes)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
                <ModalField C={C} id="horaire-tol-retard" label="Retard">
                  <input id="horaire-tol-retard" type="number" min={0} className="cix-input" value={toleranceRetard} onChange={e => setToleranceRetard(Number(e.target.value))} style={champStyle(C)}/>
                </ModalField>
                <ModalField C={C} id="horaire-tol-depart" label="Départ anticipé">
                  <input id="horaire-tol-depart" type="number" min={0} className="cix-input" value={toleranceDepart} onChange={e => setToleranceDepart(Number(e.target.value))} style={champStyle(C)}/>
                </ModalField>
                <ModalField C={C} id="horaire-pause" label="Pause obligatoire">
                  <input id="horaire-pause" type="number" min={0} className="cix-input" value={pauseObligatoire} onChange={e => setPauseObligatoire(Number(e.target.value))} style={champStyle(C)}/>
                </ModalField>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: "10px" }}>
                <span id="horaire-hs-label" style={{ color: C.t1, fontSize: "14px" }}>Heures supplémentaires autorisées</span>
                <button type="button" role="switch" aria-checked={heuresSupAutorisees} aria-labelledby="horaire-hs-label" onClick={() => setHeuresSupAutorisees(v => !v)} className="cix-btn tap"
                  style={{ width: "40px", height: "22px", borderRadius: "11px", border: "none", backgroundColor: heuresSupAutorisees ? C.green : C.border2, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: "3px", left: heuresSupAutorisees ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#fff", transition: "left .15s" }}/>
                </button>
              </div>
              {heuresSupAutorisees && (
                <div style={{ marginTop: "12px" }}>
                  <ModalField C={C} id="horaire-hs-seuil" label="Seuil de déclenchement" aide="Minutes travaillées par jour">
                    <input id="horaire-hs-seuil" type="number" min={0} className="cix-input" value={heuresSupSeuil} onChange={e => setHeuresSupSeuil(Number(e.target.value))} style={champStyle(C)}/>
                  </ModalField>
                </div>
              )}
            </div>
          </div>
        </ClockModal>
      )}

      {workSchedules.length === 0 && !showForm ? (
        <EmptyState C={C} illustration={<IllustrationHoraires C={C}/>}
          titre="Définissez vos premiers horaires"
          texte="Un modèle suffit pour commencer — vous pourrez l'affecter à autant d'employés que nécessaire, et le modifier plus tard pour tout le monde en une fois."
          cta={!readOnly ? { label: "+ Créer mon premier horaire", onClick: () => setShowForm(true) } : undefined}/>
      ) : workSchedules.length > 0 ? (
        horairesFiltres.length === 0 ? (
          <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
            <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun résultat</div>
            <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Aucun modèle ne correspond à ces critères.</div>
            <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={reinitialiserFiltres}>Réinitialiser</Button>
          </div>
        ) : (
          <ScheduleGrid C={C} cartes={cartes}/>
        )
      ) : null}

      {selected && (
        <HoraireDetailModal C={C} horaire={selected} employesAffectes={employesDuHoraire(selected.id)} tousLesEmployes={employees} departments={departments}
          readOnly={readOnly} onClose={() => setSelected(null)} onToast={onToast} onReload={onReload}
          onDupliquer={() => { dupliquer(selected); setSelected(null); }}
          onToggleActif={() => { toggleActif(selected); setSelected(null); }}
          onSupprimer={() => supprimer(selected.id)}/>
      )}
    </div>
  );
}

function HoraireDetailModal({ C, horaire, employesAffectes, tousLesEmployes, departments, readOnly, onClose, onToast, onReload, onDupliquer, onToggleActif, onSupprimer }: {
  C: ThemeTokens; horaire: WorkSchedule; employesAffectes: Employee[]; tousLesEmployes: Employee[]; departments: Department[]; readOnly: boolean;
  onClose: () => void; onToast: (msg: string, color?: string) => void; onReload: () => void;
  onDupliquer: () => void; onToggleActif: () => void; onSupprimer: () => void;
}) {
  const [departementCible, setDepartementCible] = useState("");
  const [affectation, setAffectation] = useState(false);

  // Affecte cet horaire à tous les employés actifs d'un département en un
  // geste — un appel POST par employé (même route que l'affectation
  // individuelle depuis la fiche employé, pas de nouvel endpoint dédié).
  // Ceux déjà sur cet horaire sont ignorés (pas de réaffectation inutile,
  // qui clôturerait/rouvrirait une affectation identique sans raison).
  async function affecterAuDepartement() {
    if (!departementCible) return;
    const idsDejaAffectes = new Set(employesAffectes.map(e => e.id));
    const cibles = tousLesEmployes.filter(e => e.department_id === departementCible && e.statut === "actif" && !idsDejaAffectes.has(e.id));
    if (cibles.length === 0) { onToast("Tous les employés actifs de ce département utilisent déjà cet horaire", C.t3); return; }
    setAffectation(true);
    const dateDebut = todayStr();
    const resultats = await Promise.all(cibles.map(e =>
      fetch("/api/institution/clock-in/schedule-assignments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: e.id, workScheduleId: horaire.id, dateDebut }),
      }).then(r => r.ok)
    ));
    setAffectation(false);
    const echecs = resultats.filter(ok => !ok).length;
    if (echecs > 0) onToast(`${cibles.length - echecs} employé(s) affecté(s), ${echecs} échec(s)`, C.orange);
    else onToast(`${cibles.length} employé(s) affecté(s) à cet horaire`, C.green);
    setDepartementCible("");
    onReload();
  }

  return (
    <div className="cis-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media(min-width:1024px){
          .cis-fiche-overlay{align-items:center!important}
          .cis-fiche-panel{max-width:560px!important;border-radius:20px!important;max-height:86svh!important}
          .cis-fiche-grip{display:none!important}
          .cis-fiche-close-x{display:flex!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="cis-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div className="cis-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
        <button onClick={onClose} className="cis-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

        <div style={{ marginBottom: "18px" }}>
          <div style={{ color: C.t1, fontSize: "18px", fontWeight: 800 }}>{horaire.nom}</div>
          <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{TYPES_HORAIRE.find(t => t.value === horaire.type_horaire)?.label} {!horaire.actif && "· Archivé"}</div>
        </div>

        <DrawerSection C={C} titre="Planning hebdomadaire">
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "3px" }}>
            {JOURS.map(j => {
              const jc = horaire.pattern.jours[j.key];
              return (
                <div key={j.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                  <span style={{ color: C.t2 }}>{j.label}</span>
                  <span style={{ color: jc?.repos ? C.t3 : C.t1, fontWeight: 600 }}>{jc?.repos || !jc?.segments.length ? "Repos" : jc.segments.map(s => `${s.debut}-${s.fin}`).join(", ")}</span>
                </div>
              );
            })}
          </div>
        </DrawerSection>

        <DrawerSection C={C} titre="Tolérances">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <InfoLigne C={C} label="Retard" valeur={`${horaire.tolerance_retard_minutes} min`}/>
            <InfoLigne C={C} label="Départ anticipé" valeur={`${horaire.tolerance_depart_anticipe_minutes} min`}/>
            <InfoLigne C={C} label="Pause obligatoire" valeur={`${horaire.pause_obligatoire_minutes} min`}/>
            <InfoLigne C={C} label="Heures sup." valeur={horaire.heures_sup_autorisees ? `Dès ${horaire.heures_sup_seuil_minutes ?? "—"} min` : "Non autorisées"}/>
          </div>
        </DrawerSection>

        <DrawerSection C={C} titre={`Employés affectés (${employesAffectes.length})`}>
          {employesAffectes.length === 0 ? (
            <div style={{ color: C.t3, fontSize: "12px" }}>Aucun employé n&apos;utilise cet horaire.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {employesAffectes.map(e => (
                <div key={e.id} style={{ backgroundColor: C.bg3, borderRadius: "8px", padding: "8px 10px", color: C.t1, fontSize: "12px", fontWeight: 700 }}>{e.prenom} {e.nom}</div>
              ))}
            </div>
          )}
          {!readOnly && (
            <div style={{ marginTop: "10px", display: "flex", gap: "6px" }}>
              <select value={departementCible} onChange={e => setDepartementCible(e.target.value)} style={{ ...inputStyle(C), flex: 1 }}>
                <option value="">Affecter à tout un département...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ color: C.gold, flexShrink: 0 }} disabled={!departementCible} loading={affectation} onClick={affecterAuDepartement}>
                Affecter
              </Button>
            </div>
          )}
        </DrawerSection>

        {!readOnly && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={onDupliquer}>Dupliquer</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={onToggleActif}>{horaire.actif ? "Archiver" : "Réactiver"}</Button>
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" fullWidth onClick={onSupprimer}>Supprimer</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PRÉSENCES — refonte "centre de supervision" (décision CEO 05/08/2026,
// même niveau d'ambition que CentreAnalyseTab.tsx). Lecture de
// daily_attendance (résumé calculé par le job nocturne
// clock-in-daily-attendance) + attendance_logs pour le flux d'activité.
// Écran purement consultatif : les corrections passent par la fiche
// employé (à terme) ou directement via app/api/institution/clock-in/corrections.
//
// Décisions tranchées avec Bryan avant cette refonte (à ne pas rouvrir) :
// - Statuts limités aux 5 de la V1 (Présent/Retard/Absent/Congé/Incomplet)
//   — pas de Mission/Télétravail, ça contredirait la décision CEO
//   originale du schéma.
// - Pas de notion de "site/agence" (le brief en avait une) — le schéma
//   n'a qu'une seule entité par institution, ajouter ça serait un vrai
//   nouveau chantier, pas une refonte visuelle.
// - "Live" = auto-refresh par polling (30s), pas de websocket — aucune
//   infra realtime dans ce projet à ce jour.
// - Pas de "Notes RH" dans la fiche employé (aucune table pour ça).
// ═══════════════════════════════════════════════════════════════════════
type PresenceStatut = "Présent" | "Retard" | "Absent" | "Congé" | "Incomplet";
type PresenceRecord = {
  id: string; employee_id: string; statut: PresenceStatut;
  heures_travaillees_minutes: number; heures_supplementaires_minutes?: number; retard_minutes: number; depart_anticipe_minutes: number;
  premiere_entree: string | null; derniere_sortie: string | null;
  nombre_pointages: number; override_manuel: boolean; horsZone?: boolean | null;
  employees: { nom: string; prenom: string; matricule: string; department_id: string | null; poste: string | null }
    | { nom: string; prenom: string; matricule: string; department_id: string | null; poste: string | null }[] | null;
};
type Kpis = { present: number; retard: number; absent: number; conge: number; incomplet: number; departsAnticipes: number };
type JourReponse = { records: PresenceRecord[]; kpis: Kpis; conformite: number | null; heuresTravailleesMoyenne: number; heuresSupplementairesTotal?: number; zoneConfiguree?: boolean; horsZoneCount?: number; dernierCalculAuto?: string | null };
type PointDeTendance = { date: string; present: number; retard: number; absent: number; incomplet: number; conformite: number | null; heuresTravailleesMoyenne: number };
type AggEmployePeriode = {
  employeeId: string; nom: string; prenom: string; matricule: string;
  present: number; retard: number; absent: number; conge: number; incomplet: number;
  heuresTravailleesMinutes: number; heuresSupplementairesMinutes: number; retardMinutesTotal: number;
};
type RapportPeriode = {
  dateDebut: string; dateFin: string; parEmploye: AggEmployePeriode[];
  totaux: { present: number; retard: number; absent: number; conge: number; incomplet: number; heuresTravailleesMinutes: number; heuresSupplementairesMinutes: number };
};

function presenceStatutColor(s: PresenceStatut, C: ThemeTokens): string {
  if (s === "Présent") return C.green;
  if (s === "Retard") return C.orange;
  if (s === "Absent") return C.red;
  if (s === "Congé") return C.blue;
  return C.t3; // Incomplet
}
function formatHeure(iso: string | null): string {
  if (!iso) return "—";
  return heureDepuisHorodatage(iso);
}
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}
function unEmploye(rel: PresenceRecord["employees"]) {
  return Array.isArray(rel) ? rel[0] : rel;
}
function joursAvant(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function ilYA(depuis: Date, maintenant: number): string {
  const s = Math.max(0, Math.floor((maintenant - depuis.getTime()) / 1000));
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)}h`;
}

// Sparkline/KpiCard : même pattern que CentreAnalyseTab.tsx (polyline SVG
// manuelle, aucune librairie de charts dans le projet) — répliqué ici, pas
// importé (composants non exportés côté source).
function PresencesView({ C, employees, departments, liveHost, onToast, active = true }: {
  C: ThemeTokens; employees: Employee[]; departments: Department[]; liveHost: HTMLElement | null; onToast: (msg: string, color?: string) => void; active?: boolean;
}) {
  const [date, setDate] = useState(todayStr());
  const [jour, setJour] = useState<JourReponse>({ records: [], kpis: { present: 0, retard: 0, absent: 0, conge: 0, incomplet: 0, departsAnticipes: 0 }, conformite: null, heuresTravailleesMoyenne: 0 });
  const [jourPrecedent, setJourPrecedent] = useState<JourReponse | null>(null);
  const [tendance, setTendance] = useState<PointDeTendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [maintenant, setMaintenant] = useState(Date.now());
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState(false);

  const [rapportOuvert, setRapportOuvert] = useState(false);
  const [rapportDebut, setRapportDebut] = useState(joursAvant(todayStr(), 30));
  const [rapportFin, setRapportFin] = useState(todayStr());
  const [rapportData, setRapportData] = useState<RapportPeriode | null>(null);
  const [rapportLoading, setRapportLoading] = useState(false);

  const estAujourdhui = date === todayStr();
  const records = jour.records;
  const kpis = jour.kpis;

  const chargerJour = useCallback(async (d: string): Promise<JourReponse> => {
    const res = await fetch(`/api/institution/clock-in/attendance?date=${d}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error || "Erreur de chargement");
    return {
      records: j?.records ?? [],
      kpis: j?.kpis ?? { present: 0, retard: 0, absent: 0, conge: 0, incomplet: 0, departsAnticipes: 0 },
      conformite: j?.conformite ?? null,
      heuresTravailleesMoyenne: j?.heuresTravailleesMoyenne ?? 0,
      heuresSupplementairesTotal: j?.heuresSupplementairesTotal ?? 0,
      zoneConfiguree: j?.zoneConfiguree ?? false,
      horsZoneCount: j?.horsZoneCount ?? 0,
      dernierCalculAuto: j?.dernierCalculAuto ?? null,
    };
  }, []);

  const chargerTout = useCallback(async (d: string, avecSpinner: boolean) => {
    if (avecSpinner) setLoading(true);
    try {
      // 8 jours (d-7 .. d) pour les sparklines/tendances + le jour précédent
      // en détail (liste, pas juste les compteurs) pour l'alerte "oubli de
      // clock-out hier".
      const dates = Array.from({ length: 8 }, (_, i) => joursAvant(d, 7 - i));
      const reponses = await Promise.all(dates.map(chargerJour));
      const [j0, j1, j2, j3, j4, j5, j6, j7] = reponses;
      void j0; void j1; void j2; void j3; void j4; void j5;
      setJour(j7);
      setJourPrecedent(j6);
      setTendance(dates.map((dd, i) => ({
        date: dd,
        present: reponses[i].kpis.present,
        retard: reponses[i].kpis.retard,
        absent: reponses[i].kpis.absent,
        incomplet: reponses[i].kpis.incomplet,
        conformite: reponses[i].conformite,
        heuresTravailleesMoyenne: reponses[i].heuresTravailleesMoyenne,
      })));
      setLastSync(new Date());
      setErreur(false);
    } catch (e) {
      setErreur(true);
      onToast(e instanceof Error ? e.message : "Erreur de chargement", C.red);
    }
    if (avecSpinner) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargerJour]);

  useEffect(() => { chargerTout(date, true); }, [date, chargerTout]);

  // Polling "Live" (30s) — uniquement sur la date du jour, une date passée
  // n'a aucune raison de changer. Pas de websocket dans ce projet. Ajout
  // Lot 04-B : aussi coupé si le composant est monté mais masqué (workspace
  // persistant, section 3 du brief).
  useEffect(() => {
    if (!estAujourdhui || !active) return;
    const id = setInterval(() => chargerTout(date, false), 30000);
    return () => clearInterval(id);
  }, [estAujourdhui, active, date, chargerTout]);

  // Tick d'affichage "il y a Xs" — séparé du polling réseau.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  function exporterCsv() {
    const lignes = [
      ["Employé", "Statut", "Entrée", "Sortie", "Heures travaillées", "Pointages"],
      ...records.map(r => {
        const emp = unEmploye(r.employees);
        return [emp ? `${emp.prenom} ${emp.nom}` : "", r.statut, formatHeure(r.premiere_entree), formatHeure(r.derniere_sortie), formatMinutes(r.heures_travaillees_minutes), String(r.nombre_pointages)];
      }),
    ];
    const csv = lignes.map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `presences-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function genererRapport() {
    if (rapportDebut > rapportFin) { onToast("La date de début doit précéder la date de fin.", C.red); return; }
    setRapportLoading(true);
    const res = await fetch(`/api/institution/clock-in/attendance?dateDebut=${rapportDebut}&dateFin=${rapportFin}`);
    const j = await res.json().catch(() => null);
    setRapportLoading(false);
    if (!res.ok) { onToast(j?.error || "Erreur de génération du rapport", C.red); return; }
    setRapportData(j);
  }

  function exporterRapportCsv() {
    if (!rapportData) return;
    const lignes = [
      ["Employé", "Matricule", "Présences", "Retards", "Absences", "Congés", "Incomplets", "Heures travaillées", "Heures sup."],
      ...rapportData.parEmploye.map(a => [
        `${a.prenom} ${a.nom}`, a.matricule, String(a.present), String(a.retard), String(a.absent), String(a.conge), String(a.incomplet),
        formatMinutes(a.heuresTravailleesMinutes), formatMinutes(a.heuresSupplementairesMinutes),
      ]),
    ];
    const csv = lignes.map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rapport-presences-${rapportDebut}-au-${rapportFin}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const employesActifs = employees.filter(e => e.statut === "actif");
  const recordParEmploye = new Map(records.map(r => [r.employee_id, r]));
  const pasEncorePointe = employesActifs.filter(e => {
    const r = recordParEmploye.get(e.id);
    return !r || r.statut === "Absent";
  });
  const departsAnticipes = records.filter(r => r.depart_anticipe_minutes > 0);
  const oubliClockOutHier = (jourPrecedent?.records ?? []).filter(r => r.statut === "Incomplet");

  function deltaEntre(actuel: number, precedent: number | undefined): number | null {
    return precedent === undefined ? null : actuel - precedent;
  }
  const avantDernier = tendance.length >= 2 ? tendance[tendance.length - 2] : undefined;
  const dernier = tendance.length >= 1 ? tendance[tendance.length - 1] : undefined;

  const kpiItems: AttendanceKpi[] = [
    { key: "present", label: "Présents", value: String(kpis.present), dot: C.green, delta: deltaEntre(kpis.present, avantDernier?.present), unite: "valeur" },
    { key: "retard", label: "Retards", value: String(kpis.retard), dot: C.orange, delta: deltaEntre(kpis.retard, avantDernier?.retard), unite: "valeur" },
    { key: "absent", label: "Absents", value: String(kpis.absent), dot: C.red, alerte: kpis.absent > 0, delta: deltaEntre(kpis.absent, avantDernier?.absent), unite: "valeur" },
    { key: "incomplet", label: "Incomplets", value: String(kpis.incomplet), dot: C.t3, delta: deltaEntre(kpis.incomplet, avantDernier?.incomplet), unite: "valeur" },
    { key: "temps", label: "Temps moyen", titre: "Temps moyen travaillé", value: dureeAffichee(jour.heuresTravailleesMoyenne), delta: null, unite: "valeur" },
    { key: "conformite", label: "Conformité", value: jour.conformite === null ? "—" : String(jour.conformite), unit: jour.conformite === null ? undefined : "%",
      delta: dernier?.conformite !== null && avantDernier?.conformite != null && dernier ? (dernier.conformite ?? 0) - avantDernier.conformite : null, unite: "pts" },
    { key: "hs", label: "Heures sup.", titre: "Heures supplémentaires du jour", value: dureeAffichee(jour.heuresSupplementairesTotal ?? 0), delta: null, unite: "valeur" },
    // "Hors zone" uniquement si une zone de travail est configurée — sinon la
    // métrique n'a aucun sens (toujours 0), voir CLAUDE.md /pieges-techniques-connus.
    ...(jour.zoneConfiguree ? [{ key: "hz", label: "Hors zone", value: String(jour.horsZoneCount ?? 0), dot: C.red, delta: null, unite: "valeur" as const }] : []),
  ];

  const employesSansCalcul = Math.max(0, employesActifs.length - records.length);
  const nomsDe = (rs: PresenceRecord[]) => rs.slice(0, 5).map(r => { const e = unEmploye(r.employees); return e ? `${e.prenom} ${e.nom}` : "—"; });
  const alertes: AttendanceAlert[] = [
    ...(estAujourdhui && pasEncorePointe.length > 0 ? [{ key: "np", texte: `${pasEncorePointe.length} employé${pasEncorePointe.length > 1 ? "s n'ont" : " n'a"} pas encore pointé aujourd'hui`, noms: pasEncorePointe.slice(0, 5).map(e => `${e.prenom} ${e.nom}`) }] : []),
    ...(estAujourdhui && departsAnticipes.length > 0 ? [{ key: "da", texte: `${departsAnticipes.length} départ${departsAnticipes.length > 1 ? "s anticipés" : " anticipé"} aujourd'hui`, noms: nomsDe(departsAnticipes) }] : []),
    ...(estAujourdhui && oubliClockOutHier.length > 0 ? [{ key: "oh", texte: `${oubliClockOutHier.length} oubli${oubliClockOutHier.length > 1 ? "s" : ""} de sortie hier`, noms: nomsDe(oubliClockOutHier) }] : []),
    ...(employesSansCalcul > 0 ? [{ key: "sc", texte: `${employesSansCalcul} employé${employesSansCalcul > 1 ? "s" : ""} actif${employesSansCalcul > 1 ? "s" : ""} sans donnée pour cette date`, detail: "soit le job de calcul n'est pas encore passé, soit aucun horaire ne leur est affecté.", noms: [] as string[] }] : []),
  ];

  const nomDepartement = new Map(departments.map(d => [d.id, d.nom]));
  const termeRecherche = recherche.trim().toLowerCase();
  const lignes: AttendanceRow[] = records
    .map(r => {
      const e = unEmploye(r.employees);
      const nom = e ? `${e.prenom} ${e.nom}` : "—";
      const dept = e?.department_id ? (nomDepartement.get(e.department_id) ?? null) : null;
      return {
        row: {
          id: r.id, nom, departement: dept, statut: r.statut, statutColor: presenceStatutColor(r.statut, C),
          corrige: r.override_manuel, horsZone: !!r.horsZone, entree: heure12(r.premiere_entree), sortie: heure12(r.derniere_sortie),
          heures: dureeAffichee(r.heures_travaillees_minutes), pointages: r.nombre_pointages,
        } satisfies AttendanceRow,
        recherche: `${nom} ${e?.matricule ?? ""} ${dept ?? ""}`.toLowerCase(),
      };
    })
    .filter(x => !termeRecherche || x.recherche.includes(termeRecherche))
    .map(x => x.row);

  const calculDate = jour.dernierCalculAuto ? new Date(jour.dernierCalculAuto) : null;
  // Seuil de 30 min = 2x la cadence du job (15 min) + marge (Phase 1 roadmap §5.2).
  const calculPerime = !!calculDate && maintenant - calculDate.getTime() > 30 * 60 * 1000;

  return (
    <div>
      {liveHost && active && estAujourdhui && createPortal(
        <LiveIndicator C={C} sync={lastSync ? `synchronisé ${ilYA(lastSync, maintenant)}` : "synchronisation…"}
          calcul={calculDate ? `Dernier calcul automatique : ${ilYA(calculDate, maintenant)}` : null} calculPerime={calculPerime}/>,
        liveHost,
      )}
      <span className="cix-sr" aria-live="polite">{`Présences du ${formatDate(date)}`}</span>

      <AttendanceToolbar C={C} date={date} aujourdhui={todayStr()} hier={joursAvant(todayStr(), 1)} onDate={setDate}
        onPrecedent={() => setDate(joursAvant(date, 1))} onSuivant={() => setDate(joursAvant(date, -1))}
        search={recherche} onSearch={setRecherche} onRefresh={() => chargerTout(date, true)} onExport={exporterCsv}
        onRapport={() => setRapportOuvert(o => !o)} rapportOuvert={rapportOuvert}/>

      {rapportOuvert && (
        <div style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: rapportData ? "14px" : 0 }}>
            <input type="date" value={rapportDebut} onChange={e => setRapportDebut(e.target.value)} style={{ ...inputStyle(C), width: "auto" }}/>
            <span style={{ color: C.t3, fontSize: "12px" }}>au</span>
            <input type="date" value={rapportFin} onChange={e => setRapportFin(e.target.value)} style={{ ...inputStyle(C), width: "auto" }}/>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" loading={rapportLoading} onClick={genererRapport}>Générer</Button>
            {rapportData && <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={exporterRapportCsv}>Exporter</Button>}
          </div>

          {rapportData && (
            rapportData.parEmploye.length === 0 ? (
              <div style={{ color: C.t3, fontSize: "12px" }}>Aucune donnée de présence sur cette période.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={{ textAlign: "left", padding: "6px 8px", color: C.t3, fontWeight: 700 }}>Employé</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: C.t3, fontWeight: 700 }}>Présents</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: C.t3, fontWeight: 700 }}>Retards</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: C.t3, fontWeight: 700 }}>Absents</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: C.t3, fontWeight: 700 }}>Heures travaillées</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: C.t3, fontWeight: 700 }}>Heures sup.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rapportData.parEmploye.map(a => (
                      <tr key={a.employeeId} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "6px 8px", color: C.t1, fontWeight: 700 }}>{a.prenom} {a.nom}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", color: C.green }}>{a.present}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", color: C.orange }}>{a.retard}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", color: C.red }}>{a.absent}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", color: C.t2 }}>{formatMinutes(a.heuresTravailleesMinutes)}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", color: C.blue }}>{formatMinutes(a.heuresSupplementairesMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {loading ? (
        <AttendanceSkeleton/>
      ) : erreur && records.length === 0 ? (
        <AttendanceError C={C} onRetry={() => chargerTout(date, true)}/>
      ) : (
        <>
          <AttendanceSummary C={C} items={kpiItems}/>
          <AttendanceAlerts C={C} lignes={alertes}/>

          {records.length === 0 ? (
            employees.length === 0 ? (
              <EmptyState C={C} illustration={<IllustrationPresences C={C}/>}
                titre="Prêt à démarrer le pointage"
                texte="Dès que vous aurez ajouté des employés et qu'ils commenceront à pointer, vous verrez leur présence apparaître ici en temps réel."/>
            ) : (
              <EmptyState C={C} illustration={<IllustrationPresences C={C}/>}
                titre="Aucune donnée de présence pour cette date"
                texte="Soit personne n'a encore pointé, soit le calcul n'est pas encore passé (toutes les 15 minutes) — revenez dans quelques instants."
                cta={{ label: "Actualiser", onClick: () => chargerTout(date, true) }}/>
            )
          ) : lignes.length === 0 ? (
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun résultat</div>
              <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Aucun employé ne correspond à cette recherche.</div>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setRecherche("")}>Réinitialiser</Button>
            </div>
          ) : (
            <>
              <AttendanceTable C={C} rows={lignes}/>
              <div aria-live="polite" style={{ color: C.t2, fontSize: "13px", marginTop: "10px", fontVariantNumeric: "tabular-nums" }}>1–{lignes.length} sur {records.length}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
