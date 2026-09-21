"use client";

// Clock In Shift — module Enterprise de pointage employé (décision CEO
// 26/07/2026). Écrit en respectant /regles-ux-ui de CLAUDE.md : zéro
// emoji, icônes SVG trait (Feather-style), typographie affirmée, fiche
// détail en bottom sheet mobile / dialogue centré ≥1024px (convention
// .client-fiche-overlay/panel/grip/close-x de MesClientsTab.tsx, reprise
// ici sous .cis-fiche-*). API déjà livrée : app/api/institution/clock-in/*.
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "./FormField";
import { APP_URL } from "@/lib/config";
import { generateBrandedQR } from "@/lib/qrBrand";

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

function IconChevron({ C }: { C: ThemeTokens }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
}
function IconClose({ C }: { C: ThemeTokens }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function IconClock() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>;
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

const labelStyle = (C: ThemeTokens): React.CSSProperties => ({ display: "block", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" });
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

  const vues: { key: typeof subView; label: string }[] = [
    { key: "presences", label: "Présences" },
    { key: "employes", label: `Employés · ${employees.length}` },
    { key: "departements", label: `Départements · ${departments.length}` },
    { key: "horaires", label: `Horaires · ${workSchedules.length}` },
  ];

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: "6px" }}>Clock In Shift</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>
        {readOnly ? "Consultation du pointage — la gestion (employés, départements, horaires) est réservée à l'administrateur." : "Gérez vos employés, départements et horaires de pointage."}
      </p>

      {/* Portail employé — QR brandé Yelen (lib/qrBrand.ts, même source que
          Mon code QR) + lien partageable vers /clock/{slug} (retour Bryan
          10/09/2026 : ce lien n'était affiché nulle part dans le dashboard,
          uniquement tapable à la main). */}
      {instSlug && (
        <button onClick={() => setShowPortail(true)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: "14px", border: `1px solid ${C.gold}30`, background: `${C.gold}0d`, cursor: "pointer", marginBottom: "16px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${C.gold}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M17 20v.01M20 20v.01"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800 }}>Portail employé — QR &amp; lien</div>
            <div style={{ color: C.t2, fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{APP_URL.replace(/^https?:\/\//, "")}/clock/{instSlug}</div>
          </div>
          <IconChevron C={C}/>
        </button>
      )}

      <div style={{ display: "flex", gap: "6px", marginBottom: "18px", overflowX: "auto" }}>
        {vues.map(v => (
          <button key={v.key} onClick={() => setSubView(v.key)} className="tap" style={{
            backgroundColor: subView === v.key ? C.gold : C.bg3,
            color: subView === v.key ? "#000" : C.t2,
            border: `1px solid ${subView === v.key ? C.gold : C.border}`,
            fontWeight: 800, fontSize: "12px", padding: "8px 14px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap",
          }}>{v.label}</button>
        ))}
      </div>

      {subView === "presences" && (
        <PresencesView C={C} employees={employees} onToast={onToast} active={active}/>
      )}
      {subView === "employes" && (
        <EmployesView C={C} departments={departments} workSchedules={workSchedules} employees={employees} assignments={assignments}
          readOnly={readOnly} onToast={onToast} onReload={load} active={active}/>
      )}
      {subView === "departements" && (
        <DepartementsView C={C} departments={departments} employees={employees} assignments={assignments} workSchedules={workSchedules} readOnly={readOnly} onToast={onToast} onReload={load} active={active}/>
      )}
      {subView === "horaires" && (
        <HorairesView C={C} workSchedules={workSchedules} employees={employees} departments={departments} assignments={assignments} readOnly={readOnly} onToast={onToast} onReload={load} active={active}/>
      )}

      {showPortail && instSlug && <PortailEmployeModal C={C} instSlug={instSlug} onClose={() => setShowPortail(false)}/>}
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
// EMPLOYÉS
// ═══════════════════════════════════════════════════════════════════════
// Carte KPI sans delta/sparkline — contrairement à Présences (où
// daily_attendance donne un historique jour par jour fiable), on n'a pas
// d'historique de statut employé (pas de table d'audit sur "combien
// d'actifs il y a 7 jours") : afficher un delta inventé serait une donnée
// non vérifiable. Simplification assumée pour cette refonte, pas un oubli.
function SimpleKpiCard({ label, icon, color, value, C }: { label: string; icon: React.ReactNode; color: string; value: string | number; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="18px" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "9px", backgroundColor: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</span>
      </div>
      <div style={{ color: C.t1, fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{value}</div>
    </Card>
  );
}
function IconUsers() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function IconUserPlus() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>;
}
function IconBriefcase() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
}
function IconUserCheck() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>;
}

function AlerteRhLigne({ C, texte, onCorriger }: { C: ThemeTokens; texte: string; onCorriger?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
      <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{texte}</span>
      {onCorriger && (
        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ flexShrink: 0, color: C.gold }} onClick={onCorriger}>Corriger</Button>
      )}
    </div>
  );
}

// Donut SVG manuel (stroke-dasharray par segment sur un cercle) — même
// discipline "aucune librairie de charts" que Sparkline/CisSparkline.
function StatutDonut({ C, employees }: { C: ThemeTokens; employees: Employee[] }) {
  const total = employees.length || 1;
  const segments: { statut: EmployeeStatut; n: number }[] = (["actif", "en_conge", "mission", "teletravail", "suspendu", "archive", "desactive"] as const)
    .map(s => ({ statut: s, n: employees.filter(e => e.statut === s).length }))
    .filter(s => s.n > 0);

  const r = 34, cx = 40, cy = 40, circonf = 2 * Math.PI * r;
  let cumul = 0;

  return (
    <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.bg3} strokeWidth="10"/>
      {segments.map(s => {
        const frac = s.n / total;
        const dash = frac * circonf;
        const offset = -cumul * circonf;
        cumul += frac;
        return (
          <circle key={s.statut} cx={cx} cy={cy} r={r} fill="none" stroke={statutColor(s.statut, C)} strokeWidth="10"
            strokeDasharray={`${dash} ${circonf - dash}`} strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"/>
        );
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="14" fontWeight="900" fill={C.t1}>{employees.length}</text>
    </svg>
  );
}

function EmployesView({ C, employees, departments, workSchedules, assignments, readOnly, onToast, onReload, active = true }: {
  C: ThemeTokens; employees: Employee[]; departments: Department[]; workSchedules: WorkSchedule[]; assignments: Assignment[];
  readOnly: boolean; onToast: (msg: string, color?: string) => void; onReload: (silencieux?: boolean) => void; active?: boolean;
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

  const kpisEmployes: { label: string; value: string | number; color: string; icon: React.ReactNode }[] = [
    { label: "Employés actifs", value: employesActifs.length, color: C.green, icon: <IconUsers/> },
    { label: "Nouveaux ce mois", value: nouveauxCeMois, color: C.blue, icon: <IconUserPlus/> },
    { label: "Départements", value: departments.length, color: C.purple, icon: <IconBriefcase/> },
    { label: "Managers", value: managers, color: C.teal, icon: <IconUserCheck/> },
    { label: "En congé", value: enConge, color: C.orange, icon: <IconAlertTriangle/> },
    { label: "Profils incomplets", value: profilsIncomplets, color: profilsIncomplets > 0 ? C.red : C.t3, icon: <IconXCircle/> },
  ];

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
  }

  const formValide = matricule.trim() && nom.trim() && prenom.trim() && dateEmbauche && PIN_REGEX.test(pin);

  async function creer() {
    if (!formValide) return;
    setSaving(true);
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
    if (!res.ok) { onToast(j?.error || "Erreur de création", C.red); return; }
    setShowForm(false); resetForm();
    onToast(`${prenom} a été ajouté(e) — identifiant : ${matricule}, PIN : ${pin}`, C.green);
    onReload();
  }

  return (
    <div>
      {/* ── Hero header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ color: C.t1, fontSize: "20px", fontWeight: 800, letterSpacing: "-0.4px", marginBottom: "4px" }}>Employés</h2>
          <p style={{ color: C.t2, fontSize: "12.5px", marginBottom: "6px" }}>Administration des collaborateurs, des accès et des informations professionnelles.</p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.green, fontSize: "10.5px", fontWeight: 800 }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green, boxShadow: `0 0 0 3px ${C.green}25` }}/>
              Live
            </span>
            <span style={{ color: C.t3, fontSize: "10.5px" }}>Dernière synchronisation : {ilYA(lastSync, maintenant)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          {!readOnly && (
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setShowForm(v => !v)}>
              + Nouvel employé
            </Button>
          )}
          <Button
            tokens={toUiTokens(C)} className="tap"
            variant="secondary"
            size="sm"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>}
            onClick={() => onReload()}
          >
            Actualiser
          </Button>
        </div>
      </div>

      {/* ── KPI exécutifs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "20px" }}>
        {kpisEmployes.map(k => <SimpleKpiCard key={k.label} {...k} C={C}/>)}
      </div>

      {/* ── Répartition ── */}
      {employees.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px", marginBottom: "20px" }}>
          <Card tokens={toCardTokens(C)} padding="16px">
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "12px" }}>Employés par département</div>
            {departments.length === 0 ? (
              <div style={{ color: C.t3, fontSize: "12px" }}>Aucun département créé.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(() => {
                  const max = Math.max(...departments.map(d => employees.filter(e => e.department_id === d.id).length), 1);
                  return departments.map(d => {
                    const n = employees.filter(e => e.department_id === d.id).length;
                    return (
                      <div key={d.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "3px" }}>
                          <span style={{ color: C.t2, fontWeight: 600 }}>{d.nom}</span>
                          <span style={{ color: C.t1, fontWeight: 800 }}>{n}</span>
                        </div>
                        <div style={{ height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(n / max) * 100}%`, backgroundColor: C.gold, borderRadius: "3px" }}/>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </Card>

          <Card tokens={toCardTokens(C)} padding="16px" style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <StatutDonut C={C} employees={employees}/>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {(["actif", "en_conge", "mission", "teletravail"] as const).map(s => {
                const n = employees.filter(e => e.statut === s).length;
                const pct = employees.length > 0 ? Math.round((n / employees.length) * 100) : 0;
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: statutColor(s, C), flexShrink: 0 }}/>
                    <span style={{ color: C.t2 }}>{STATUTS.find(x => x.value === s)?.label} <strong style={{ color: C.t1 }}>{pct}%</strong></span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Nouveaux employés ── */}
      {(() => {
        const recents = [...employees].filter(e => {
          const jours = Math.floor((Date.now() - new Date(e.date_embauche).getTime()) / 86400000);
          return jours >= 0 && jours <= 14;
        }).sort((a, b) => b.date_embauche.localeCompare(a.date_embauche)).slice(0, 5);
        if (recents.length === 0) return null;
        return (
          <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "20px" }}>
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

      {/* ── Alertes RH ── */}
      {(() => {
        const sansHoraire = employees.filter(e => e.statut === "actif" && !horaireParEmploye.has(e.id));
        const pinNonChanges = employees.filter(e => e.statut === "actif" && e.doit_changer_pin);
        const telephoneManquant = employees.filter(e => e.statut === "actif" && !e.telephone);
        if (sansHoraire.length === 0 && pinNonChanges.length === 0 && telephoneManquant.length === 0 && profilsIncomplets === 0) return null;
        return (
          <div style={{ backgroundColor: `${C.orange}0c`, border: `1px solid ${C.orange}30`, borderRadius: "16px", padding: "16px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ color: C.orange }}><IconAlertTriangle/></span>
              <span style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800 }}>Alertes RH</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {sansHoraire.length > 0 && <AlerteRhLigne C={C} texte={`${sansHoraire.length} employé${sansHoraire.length > 1 ? "s" : ""} sans horaire`} onCorriger={() => setSelected(sansHoraire[0])}/>}
              {pinNonChanges.length > 0 && <AlerteRhLigne C={C} texte={`${pinNonChanges.length} PIN pas encore changé${pinNonChanges.length > 1 ? "s" : ""} depuis la création`} onCorriger={() => setSelected(pinNonChanges[0])}/>}
              {telephoneManquant.length > 0 && <AlerteRhLigne C={C} texte={`${telephoneManquant.length} téléphone${telephoneManquant.length > 1 ? "s" : ""} manquant${telephoneManquant.length > 1 ? "s" : ""}`} onCorriger={() => setSelected(telephoneManquant[0])}/>}
              {profilsIncomplets > 0 && <AlerteRhLigne C={C} texte={`${profilsIncomplets} profil${profilsIncomplets > 1 ? "s" : ""} incomplet${profilsIncomplets > 1 ? "s" : ""}`}/>}
            </div>
          </div>
        );
      })()}

      {/* ── IA Insights (règles déterministes, zéro LLM) ── */}
      {insights.length > 0 && (
        <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${C.gold}20`, marginBottom: "20px" }}>
          <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "10px" }}>Analyse automatique</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {insights.map((texte, i) => (
              <div key={i} style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5 }}>{texte}</div>
            ))}
          </div>
        </Card>
      )}

      {employees.length > 0 && (
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => window.print()}>Imprimer</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => {
            const lignes = [
              ["Prénom", "Nom", "Matricule", "Département", "Poste", "Rôle", "Statut", "Téléphone", "Email"],
              ...employesFiltres.map(e => [e.prenom, e.nom, e.matricule, deptNom(e.department_id), e.poste ?? "", ROLES.find(r => r.value === e.role)?.label ?? "", statutLabelAffiche(e.statut), e.telephone ?? "", e.email ?? ""]),
            ];
            const csv = lignes.map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "employes.csv"; a.click();
            URL.revokeObjectURL(url);
          }}>Exporter</Button>
        </div>
      )}

      {showForm && (
        <div className="cis-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => { setShowForm(false); resetForm(); }}>
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
          <button onClick={() => { setShowForm(false); resetForm(); }} className="cis-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

          <div style={{ color: C.t1, fontSize: "17px", fontWeight: 800, marginBottom: "16px" }}>Nouvel employé</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
            <FormField C={C} label="Matricule" placeholder="ex: ECO-00123" value={matricule} onChange={setMatricule} name="matricule"/>
            <div>
              <label style={labelStyle(C)}>Date d&apos;embauche</label>
              <input type="date" value={dateEmbauche} onChange={e => setDateEmbauche(e.target.value)} style={inputStyle(C)}/>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
            <FormField C={C} label="Prénom" placeholder="Prénom" value={prenom} onChange={setPrenom} name="prenom" autoComplete="given-name"/>
            <FormField C={C} label="Nom" placeholder="Nom" value={nom} onChange={setNom} name="nom" autoComplete="family-name"/>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
            <FormField C={C} label="Téléphone (optionnel)" placeholder="+224..." value={telephone} onChange={setTelephone} name="telephone" autoComplete="tel"/>
            <FormField C={C} label="Email (optionnel)" placeholder="email@..." value={email} onChange={setEmail} name="email" autoComplete="email"/>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
            <div>
              <label style={labelStyle(C)}>Département (optionnel)</label>
              <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} style={inputStyle(C)}>
                <option value="">Aucun</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
            </div>
            <FormField C={C} label="Poste (optionnel)" placeholder="ex: Caissier" value={poste} onChange={setPoste} name="poste"/>
          </div>

          <label style={labelStyle(C)}>Manager (optionnel)</label>
          <select value={managerId} onChange={e => setManagerId(e.target.value)} style={{ ...inputStyle(C), marginBottom: "12px" }}>
            <option value="">Aucun</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>

          <label style={labelStyle(C)}>Rôle Clock In Shift</label>
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
            {ROLES.map(r => (
              <button key={r.value} onClick={() => setRole(r.value)} className="tap" style={{
                flex: 1, backgroundColor: role === r.value ? `${roleColor(r.value, C)}15` : C.bg3,
                border: `1px solid ${role === r.value ? roleColor(r.value, C) + "50" : C.border2}`,
                color: role === r.value ? roleColor(r.value, C) : C.t2, fontWeight: 700, fontSize: "12px",
                padding: "9px", borderRadius: "8px", cursor: "pointer",
              }}>{r.label}</button>
            ))}
          </div>

          <label style={labelStyle(C)}>PIN initial (4 chiffres)</label>
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="4 chiffres" style={{ ...inputStyle(C), textAlign: "center", letterSpacing: "4px", marginBottom: "4px" }}/>
          <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "14px" }}>Communiquez ce code à l&apos;employé — il devra en choisir un nouveau à sa première connexion.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => { setShowForm(false); resetForm(); }}>Annuler</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth disabled={!formValide} loading={saving} onClick={creer}>
              Créer l&apos;employé
            </Button>
          </div>
        </div>
        </div>
      )}

      {employees.length > 0 && (
        <>
          <input
            value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un employé, un matricule, un téléphone, un département, un poste..."
            style={{ ...inputStyle(C), marginBottom: "10px" }}
          />

          <div style={{ display: "flex", gap: "6px", marginBottom: "10px", overflowX: "auto" }}>
            {([
              { key: "tous", label: "Tous" },
              { key: "actif", label: "Actifs" },
              { key: "en_conge", label: "En congé" },
              { key: "teletravail", label: "Télétravail" },
              { key: "mission", label: "Mission" },
              { key: "manager", label: "Managers" },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFiltreRapide(f.key)} className="tap" style={{
                backgroundColor: filtreRapide === f.key ? C.gold : C.bg3, color: filtreRapide === f.key ? "#000" : C.t2,
                border: `1px solid ${filtreRapide === f.key ? C.gold : C.border}`, fontWeight: 700, fontSize: "11.5px",
                padding: "7px 12px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap",
              }}>{f.label}</button>
            ))}
            <button onClick={() => setFiltresAvances(v => !v)} className="tap" style={{
              backgroundColor: filtresAvances ? `${C.gold}15` : C.bg3, color: filtresAvances ? C.gold : C.t2,
              border: `1px solid ${filtresAvances ? C.gold + "50" : C.border}`, fontWeight: 700, fontSize: "11.5px",
              padding: "7px 12px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap",
            }}>Filtres avancés</button>
          </div>

          {filtresAvances && (
            <Card tokens={toCardTokens(C)} padding="12px" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginBottom: "14px" }}>
              <select value={filtreDepartement} onChange={e => setFiltreDepartement(e.target.value)} style={inputStyle(C)}>
                <option value="">Tous les départements</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
              <select value={filtrePoste} onChange={e => setFiltrePoste(e.target.value)} style={inputStyle(C)}>
                <option value="">Tous les postes</option>
                {postesDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filtreManager} onChange={e => setFiltreManager(e.target.value)} style={inputStyle(C)}>
                <option value="">Tous les managers</option>
                {managersDisponibles.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
              </select>
              <select value={filtreHoraire} onChange={e => setFiltreHoraire(e.target.value)} style={inputStyle(C)}>
                <option value="">Tous les horaires</option>
                {workSchedules.map(w => <option key={w.id} value={w.id}>{w.nom}</option>)}
              </select>
            </Card>
          )}
        </>
      )}

      {employees.length === 0 && !showForm ? (
        <EmptyState C={C} illustration={<IllustrationEquipe C={C}/>}
          titre="Votre équipe commence ici"
          texte="Ajoutez votre premier employé pour activer le pointage — il recevra un identifiant et un code PIN pour se connecter au portail."
          cta={!readOnly ? { label: "+ Ajouter mon premier employé", onClick: () => setShowForm(true) } : undefined}/>
      ) : employesFiltres.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <div style={{ color: C.t2, fontSize: "13px" }}>Aucun employé ne correspond à ces critères.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "14px", backgroundColor: C.bgCard }}>
          <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Employé", "Matricule", "Département", "Poste", "Horaire", "Rôle", "Statut", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employesFiltres.map((e, i, arr) => (
                <tr key={e.id} onClick={() => setSelected(e)} className="tap" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", opacity: e.statut === "actif" || e.statut === "teletravail" || e.statut === "mission" ? 1 : 0.5 }}>
                  <td style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: `linear-gradient(135deg, ${roleColor(e.role, C)}30, ${roleColor(e.role, C)}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, color: roleColor(e.role, C), flexShrink: 0 }}>
                      {e.prenom.slice(0, 1).toUpperCase()}{e.nom.slice(0, 1).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 700, color: C.t1 }}>{e.prenom} {e.nom}</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{e.matricule}</td>
                  <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{deptNom(e.department_id)}</td>
                  <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{e.poste ?? "—"}</td>
                  <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{horaireNom(e.id) ?? "—"}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ color: roleColor(e.role, C), fontSize: "9.5px", fontWeight: 800, backgroundColor: `${roleColor(e.role, C)}15`, padding: "2px 8px", borderRadius: "20px", whiteSpace: "nowrap" }}>{ROLES.find(r => r.value === e.role)?.label}</span>
                  </td>
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                    <span style={{ color: statutColor(e.statut, C), fontSize: "11px", fontWeight: 700 }}>{statutLabelAffiche(e.statut)}</span>
                  </td>
                  <td style={{ padding: "12px 14px" }}><IconChevron C={C}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <EmployeDetailModal C={C} employe={selected} departments={departments} employees={employees} workSchedules={workSchedules}
          readOnly={readOnly} onClose={() => setSelected(null)} onToast={onToast} onReload={onReload}/>
      )}
    </div>
  );
}

type HistoriqueJour = { id: string; date_jour: string; statut: PresenceStatut; heures_travaillees_minutes: number; retard_minutes: number; premiere_entree: string | null; derniere_sortie: string | null; nombre_pointages: number };
type EmployeeDocument = { id: string; label: string; type: string; type_mime: string | null; taille: number | null; created_at: string; signedUrl: string | null };

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

  const [modeEdition, setModeEdition] = useState(false);
  const [editNom, setEditNom] = useState(employe.nom);
  const [editPrenom, setEditPrenom] = useState(employe.prenom);
  const [editTelephone, setEditTelephone] = useState(employe.telephone ?? "");
  const [editEmail, setEditEmail] = useState(employe.email ?? "");
  const [editPoste, setEditPoste] = useState(employe.poste ?? "");
  const [editDepartmentId, setEditDepartmentId] = useState(employe.department_id ?? "");
  const [editManagerId, setEditManagerId] = useState(employe.manager_id ?? "");

  const deptNom = departments.find(d => d.id === employe.department_id)?.nom ?? "Aucun";
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
        <button onClick={onClose} className="cis-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <IconClose C={C}/>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `linear-gradient(135deg, ${roleColor(employe.role, C)}30, ${roleColor(employe.role, C)}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "19px", fontWeight: 800, color: roleColor(employe.role, C), flexShrink: 0 }}>
            {employe.prenom.slice(0, 1).toUpperCase()}{employe.nom.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "18px", fontWeight: 800 }}>{employe.prenom} {employe.nom}</div>
            <div style={{ color: C.t3, fontSize: "12px" }}>{employe.poste ?? "Poste non renseigné"} · {deptNom}</div>
            <div style={{ color: C.t3, fontSize: "11.5px", marginTop: "1px" }}>Manager : {managerNom ? `${managerNom.prenom} ${managerNom.nom}` : "Aucun"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
          <span style={{ color: roleColor(employe.role, C), fontSize: "9.5px", fontWeight: 800, backgroundColor: `${roleColor(employe.role, C)}15`, padding: "3px 9px", borderRadius: "20px" }}>{ROLES.find(r => r.value === employe.role)?.label}</span>
          <span style={{ color: statutColor(employe.statut, C), fontSize: "9.5px", fontWeight: 800, backgroundColor: `${statutColor(employe.statut, C)}15`, padding: "3px 9px", borderRadius: "20px" }}>{statutLabelAffiche(employe.statut)}</span>
        </div>

        {/* ── Informations ── */}
        <DrawerSection C={C} titre="Informations">
          {modeEdition ? (
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                <input value={editPrenom} onChange={e => setEditPrenom(e.target.value)} placeholder="Prénom" style={inputStyle(C)}/>
                <input value={editNom} onChange={e => setEditNom(e.target.value)} placeholder="Nom" style={inputStyle(C)}/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                <input value={editTelephone} onChange={e => setEditTelephone(e.target.value)} placeholder="Téléphone" style={inputStyle(C)}/>
                <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email" style={inputStyle(C)}/>
              </div>
              <input value={editPoste} onChange={e => setEditPoste(e.target.value)} placeholder="Poste" style={{ ...inputStyle(C), marginBottom: "8px" }}/>
              <select value={editDepartmentId} onChange={e => setEditDepartmentId(e.target.value)} style={{ ...inputStyle(C), marginBottom: "8px" }}>
                <option value="">Aucun département</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
              <select value={editManagerId} onChange={e => setEditManagerId(e.target.value)} style={{ ...inputStyle(C), marginBottom: "10px" }}>
                <option value="">Aucun manager</option>
                {employees.filter(e => e.id !== employe.id).map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth onClick={() => setModeEdition(false)}>Annuler</Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" fullWidth loading={saving} onClick={enregistrerInformations}>Enregistrer</Button>
              </div>
            </div>
          ) : (
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <InfoLigne C={C} label="Téléphone" valeur={employe.telephone ?? "—"}/>
              <InfoLigne C={C} label="Email" valeur={employe.email ?? "—"}/>
              <InfoLigne C={C} label="Matricule" valeur={employe.matricule}/>
              <InfoLigne C={C} label="Date d'embauche" valeur={formatDate(employe.date_embauche)}/>
              {!readOnly && (
                <button onClick={() => setModeEdition(true)} style={{ marginTop: "2px", background: "none", border: "none", color: C.gold, fontWeight: 700, fontSize: "12px", cursor: "pointer", padding: 0, textAlign: "left" }}>Modifier les informations</button>
              )}
            </div>
          )}
        </DrawerSection>

        {/* ── Planning ── */}
        <DrawerSection C={C} titre="Planning">
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
            {loadingAssignment ? (
              <YelenLoader size={14}/>
            ) : horaireActuel ? (
              <>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>{horaireActuel.nom} <span style={{ color: C.t3, fontWeight: 500, fontSize: "11px" }}>· depuis le {formatDate(assignment!.date_debut)}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {JOURS.map(j => {
                    const jc = horaireActuel.pattern.jours[j.key];
                    return (
                      <div key={j.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                        <span style={{ color: C.t2 }}>{j.label}</span>
                        <span style={{ color: jc?.repos ? C.t3 : C.t1, fontWeight: 600 }}>
                          {jc?.repos || !jc?.segments.length ? "Repos" : jc.segments.map(s => `${s.debut}-${s.fin}`).join(", ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ color: C.t3, fontSize: "12px" }}>Aucun horaire affecté</div>
            )}
            {!readOnly && !showReassign && (
              <button onClick={() => setShowReassign(true)} style={{ marginTop: "10px", background: "none", border: "none", color: C.gold, fontWeight: 700, fontSize: "12px", cursor: "pointer", padding: 0 }}>
                {assignment ? "Changer d'horaire" : "Affecter un horaire"}
              </button>
            )}
            {showReassign && (
              <div style={{ marginTop: "10px" }}>
                <select value={nouvelHoraireId} onChange={e => setNouvelHoraireId(e.target.value)} style={{ ...inputStyle(C), marginBottom: "6px" }}>
                  <option value="">Sélectionner un horaire</option>
                  {workSchedules.filter(w => w.actif).map(w => <option key={w.id} value={w.id}>{w.nom}</option>)}
                </select>
                <input type="date" value={nouvelleDate} onChange={e => setNouvelleDate(e.target.value)} style={{ ...inputStyle(C), marginBottom: "8px" }}/>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth onClick={() => setShowReassign(false)}>Annuler</Button>
                  <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" fullWidth disabled={!nouvelHoraireId} loading={saving} onClick={reassigner}>Confirmer</Button>
                </div>
              </div>
            )}
          </div>
        </DrawerSection>

        {/* ── Présence (30 derniers jours calculés) ── */}
        <DrawerSection C={C} titre="Présence (30 derniers jours)">
          {loadingHistorique ? <YelenLoader size={14}/> : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                <div style={{ color: C.orange, fontSize: "18px", fontWeight: 800 }}>{retards30}</div>
                <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700 }}>Retards</div>
              </div>
              <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                <div style={{ color: C.red, fontSize: "18px", fontWeight: 800 }}>{absences30}</div>
                <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700 }}>Absences</div>
              </div>
              <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                <div style={{ color: C.blue, fontSize: "18px", fontWeight: 800 }}>{formatMinutes(tempsMoyen30)}</div>
                <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700 }}>Temps moyen</div>
              </div>
            </div>
          )}
        </DrawerSection>

        {/* ── Historique (derniers jours) ── */}
        <DrawerSection C={C} titre="Historique — derniers pointages">
          {loadingHistorique ? <YelenLoader size={14}/> : historique.slice(0, 7).length === 0 ? (
            <div style={{ color: C.t3, fontSize: "12px" }}>Aucun historique pour l&apos;instant.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {historique.slice(0, 7).map(h => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg3, borderRadius: "8px", padding: "8px 10px" }}>
                  <span style={{ color: C.t2, fontSize: "11.5px" }}>{formatDate(h.date_jour)}</span>
                  <span style={{ color: C.t3, fontSize: "11px" }}>{formatHeure(h.premiere_entree)} → {formatHeure(h.derniere_sortie)}</span>
                  <span style={{ color: presenceStatutColor(h.statut, C), fontSize: "9.5px", fontWeight: 800, backgroundColor: `${presenceStatutColor(h.statut, C)}15`, padding: "2px 8px", borderRadius: "20px" }}>{h.statut}</span>
                </div>
              ))}
            </div>
          )}
        </DrawerSection>

        {/* ── Documents ── */}
        <DrawerSection C={C} titre="Documents">
          {loadingDocuments ? <YelenLoader size={14}/> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: !readOnly ? "10px" : 0 }}>
              {documents.length === 0 && <div style={{ color: C.t3, fontSize: "12px" }}>Aucun document.</div>}
              {documents.map(doc => (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg3, borderRadius: "8px", padding: "8px 10px" }}>
                  {doc.signedUrl ? (
                    <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.t1, fontSize: "12px", fontWeight: 700, textDecoration: "none" }}>{doc.label}</a>
                  ) : (
                    <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700 }}>{doc.label}</span>
                  )}
                  {!readOnly && (
                    <button onClick={() => supprimerDocument(doc.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "2px" }}><IconClose C={C}/></button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!readOnly && (
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px" }}>
              <input value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} placeholder="Libellé (ex: Contrat de travail)" style={{ ...inputStyle(C), marginBottom: "6px" }}/>
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} style={{ ...inputStyle(C), marginBottom: "6px", padding: "7px" }}/>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" fullWidth disabled={!uploadFile || !uploadLabel.trim()} loading={uploading} onClick={televerserDocument}>
                Ajouter le document
              </Button>
            </div>
          )}
        </DrawerSection>

        {!readOnly && (
          <>
            {showResetPin ? (
              <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
                <div style={{ color: C.t2, fontSize: "11.5px", marginBottom: "8px" }}>Nouveau PIN à 4 chiffres pour {employe.prenom} :</div>
                <input value={nouveauPin} onChange={e => setNouveauPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="4 chiffres" style={{ ...inputStyle(C), textAlign: "center", letterSpacing: "4px", marginBottom: "8px" }}/>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth onClick={() => { setShowResetPin(false); setNouveauPin(""); }}>Annuler</Button>
                  <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" fullWidth disabled={!PIN_REGEX.test(nouveauPin)} loading={saving} onClick={reinitialiserPin}>Valider</Button>
                </div>
              </div>
            ) : (
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth style={{ marginBottom: "10px" }} onClick={() => setShowResetPin(true)}>Réinitialiser le PIN</Button>
            )}

            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", margin: "12px 0 8px" }}>Changer le statut</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
              {STATUTS.map(s => (
                <button key={s.value} onClick={() => changerStatut(s.value)} disabled={s.value === employe.statut || saving} style={{
                  backgroundColor: s.value === employe.statut ? `${statutColor(s.value, C)}15` : C.bg3,
                  border: `1px solid ${s.value === employe.statut ? statutColor(s.value, C) + "40" : C.border}`,
                  color: s.value === employe.statut ? statutColor(s.value, C) : C.t2, fontSize: "11.5px", fontWeight: 700,
                  padding: "8px 12px", borderRadius: "8px", cursor: s.value === employe.statut ? "default" : "pointer",
                }}>{s.label}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
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

function DepartementsView({ C, departments, employees, assignments, workSchedules, readOnly, onToast, onReload, active = true }: {
  C: ThemeTokens; departments: Department[]; employees: Employee[]; assignments: Assignment[]; workSchedules: WorkSchedule[];
  readOnly: boolean; onToast: (msg: string, color?: string) => void; onReload: (silencieux?: boolean) => void; active?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [responsableId, setResponsableId] = useState("");
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

  const kpisDepartements: { label: string; value: string | number; color: string; icon: React.ReactNode }[] = [
    { label: "Départements", value: departments.length, color: C.purple, icon: <IconBriefcase/> },
    { label: "Employés", value: employesActifsTotal, color: C.green, icon: <IconUsers/> },
    { label: "Managers", value: managersUniques, color: C.teal, icon: <IconUserCheck/> },
    { label: "Départements complets", value: departementsComplets, color: C.blue, icon: <IconCheck/> },
    { label: "Avec alertes", value: departementsAvecAlerte.length, color: departementsAvecAlerte.length > 0 ? C.orange : C.t3, icon: <IconAlertTriangle/> },
    { label: "Conformité globale", value: conformiteGlobale === null ? "—" : `${conformiteGlobale}%`, color: C.gold, icon: <IconShield/> },
  ];

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
    const res = await fetch("/api/institution/clock-in/departments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, description: description || undefined, responsableId: responsableId || undefined }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Ce département n'a pas pu être créé.", C.red); return; }
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

  return (
    <div>
      {/* ── Hero header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ color: C.t1, fontSize: "20px", fontWeight: 800, letterSpacing: "-0.4px", marginBottom: "4px" }}>Départements</h2>
          <p style={{ color: C.t2, fontSize: "12.5px", marginBottom: "6px" }}>Structurez votre organisation et suivez la performance de chaque département.</p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.green, fontSize: "10.5px", fontWeight: 800 }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green, boxShadow: `0 0 0 3px ${C.green}25` }}/>
              Live
            </span>
            <span style={{ color: C.t3, fontSize: "10.5px" }}>Dernière synchronisation : {ilYA(lastSync, maintenant)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          {!readOnly && (
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setShowForm(v => !v)}>+ Nouveau département</Button>
          )}
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={exporterCsv}>Exporter</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => onReload()}>Actualiser</Button>
        </div>
      </div>

      {/* ── KPI exécutifs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "20px" }}>
        {kpisDepartements.map(k => <SimpleKpiCard key={k.label} {...k} C={C}/>)}
      </div>

      {showForm && (
        <div className="cis-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => setShowForm(false)}>
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
          <button onClick={() => setShowForm(false)} className="cis-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

          <div style={{ color: C.t1, fontSize: "17px", fontWeight: 800, marginBottom: "16px" }}>Nouveau département</div>
          <div style={{ marginBottom: "12px" }}>
            <FormField C={C} label="Nom" placeholder="ex: Comptabilité" value={nom} onChange={setNom} name="nom"/>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <FormField C={C} label="Description (optionnel)" value={description} onChange={setDescription} name="description"/>
          </div>
          <label style={labelStyle(C)}>Manager (optionnel)</label>
          <select value={responsableId} onChange={e => setResponsableId(e.target.value)} style={{ ...inputStyle(C), marginBottom: "14px" }}>
            <option value="">Aucun</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => setShowForm(false)}>Annuler</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth disabled={!nom.trim()} loading={saving} onClick={creer}>
              Créer
            </Button>
          </div>
        </div>
        </div>
      )}

      {departments.length === 0 && !showForm ? (
        <EmptyState C={C} illustration={<IllustrationDepartements C={C}/>}
          titre="Organisez votre entreprise"
          texte="Créez vos départements pour regrouper vos employés et suivre leur présence équipe par équipe."
          cta={!readOnly ? { label: "+ Créer mon premier département", onClick: () => setShowForm(true) } : undefined}/>
      ) : (
        <>
          {/* ── Répartition ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px", marginBottom: "20px" }}>
            <Card tokens={toCardTokens(C)} padding="16px">
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "12px" }}>Employés par département</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(() => {
                  const max = Math.max(...departments.map(d => employesDe(d.id).length), 1);
                  return departments.map(d => {
                    const n = employesDe(d.id).length;
                    return (
                      <div key={d.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "3px" }}>
                          <span style={{ color: C.t2, fontWeight: 600 }}>{d.nom}</span>
                          <span style={{ color: C.t1, fontWeight: 800 }}>{n}</span>
                        </div>
                        <div style={{ height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(n / max) * 100}%`, backgroundColor: C.gold, borderRadius: "3px" }}/>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </Card>

            <Card tokens={toCardTokens(C)} padding="16px">
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "12px" }}>Taille des équipes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {([["grand", "Très grands (21+)", C.purple], ["moyen", "Moyens (6-20)", C.blue], ["petit", "Petits (1-5)", C.teal]] as const).map(([key, label, color]) => {
                  const n = departments.filter(d => tailleEquipe(employesDe(d.id).length) === key).length;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }}/>
                      <span style={{ color: C.t2, flex: 1 }}>{label}</span>
                      <span style={{ color: C.t1, fontWeight: 800 }}>{n}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* ── Recherche + filtres ── */}
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un département..." style={{ ...inputStyle(C), marginBottom: "10px" }}/>
          <div style={{ display: "flex", gap: "6px", marginBottom: "16px", overflowX: "auto" }}>
            {([
              { key: "tous", label: "Tous" }, { key: "actifs", label: "Actifs" },
              { key: "alertes", label: "Avec alertes" }, { key: "sans_manager", label: "Sans manager" },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFiltreRapide(f.key)} className="tap" style={{
                backgroundColor: filtreRapide === f.key ? C.gold : C.bg3, color: filtreRapide === f.key ? "#000" : C.t2,
                border: `1px solid ${filtreRapide === f.key ? C.gold : C.border}`, fontWeight: 700, fontSize: "11.5px",
                padding: "7px 12px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap",
              }}>{f.label}</button>
            ))}
          </div>

          {/* ── Alertes ── */}
          {departementsAvecAlerte.length > 0 && (
            <div style={{ backgroundColor: `${C.orange}0c`, border: `1px solid ${C.orange}30`, borderRadius: "16px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ color: C.orange }}><IconAlertTriangle/></span>
                <span style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800 }}>Attention</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {departementsAvecAlerte.slice(0, 6).map(d => {
                  const s = statsDept(d.id);
                  const raisons = [
                    !d.responsable_id && "sans manager",
                    s.emps.length === 0 && "sans employé",
                    s.sansHoraire && s.emps.length > 0 && "au moins un employé sans horaire",
                    s.tauxPresence !== null && s.tauxPresence < 80 && `présence à ${s.tauxPresence}%`,
                  ].filter(Boolean).join(", ");
                  return <AlerteRhLigne key={d.id} C={C} texte={`${d.nom} — ${raisons}`} onCorriger={() => setSelected(d)}/>;
                })}
              </div>
            </div>
          )}

          {/* ── IA Insights ── */}
          {insights.length > 0 && (
            <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${C.gold}20`, marginBottom: "20px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "10px" }}>Analyse automatique</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {insights.map((texte, i) => <div key={i} style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5 }}>{texte}</div>)}
              </div>
            </Card>
          )}

          {/* ── Cartes département ── */}
          {departementsFiltres.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px" }}><div style={{ color: C.t2, fontSize: "13px" }}>Aucun département ne correspond à ces critères.</div></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
              {departementsFiltres.map(d => {
                const s = statsDept(d.id);
                const manager = managerDe(d.id);
                return (
                  <Card key={d.id} tokens={toCardTokens(C)} padding="16px" onClick={() => setSelected(d)} className="tap">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <div>
                        <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.3px" }}>{d.nom}</div>
                        <div style={{ color: C.t3, fontSize: "11.5px", marginTop: "2px" }}>{s.emps.length} employé{s.emps.length > 1 ? "s" : ""}</div>
                      </div>
                      <IconChevron C={C}/>
                    </div>
                    <div style={{ color: C.t2, fontSize: "11.5px", marginBottom: "10px" }}>Manager : <strong style={{ color: C.t1 }}>{manager ? `${manager.prenom} ${manager.nom}` : "Aucun"}</strong></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "10px" }}>
                      <div style={{ backgroundColor: C.bg3, borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                        <div style={{ color: C.orange, fontSize: "14px", fontWeight: 800 }}>{s.retards}</div>
                        <div style={{ color: C.t3, fontSize: "9px", fontWeight: 700 }}>Retards</div>
                      </div>
                      <div style={{ backgroundColor: C.bg3, borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                        <div style={{ color: C.red, fontSize: "14px", fontWeight: 800 }}>{s.absences}</div>
                        <div style={{ color: C.t3, fontSize: "9px", fontWeight: 700 }}>Absences</div>
                      </div>
                    </div>
                    {s.horairePrincipal && (
                      <div style={{ color: C.t3, fontSize: "10.5px", marginBottom: "8px" }}>Horaire principal : {s.horairePrincipal.nom}</div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                      <span style={{ color: C.t3 }}>Présence aujourd&apos;hui</span>
                      <span style={{ color: C.t1, fontWeight: 800 }}>{s.tauxPresence === null ? "—" : `${s.tauxPresence}%`}</span>
                    </div>
                    <div style={{ height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.tauxPresence ?? 0}%`, backgroundColor: s.tauxPresence !== null && s.tauxPresence < 80 ? C.red : C.green, borderRadius: "3px" }}/>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

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

function HorairesView({ C, workSchedules, employees, departments, assignments, readOnly, onToast, onReload, active = true }: {
  C: ThemeTokens; workSchedules: WorkSchedule[]; employees: Employee[]; departments: Department[]; assignments: Assignment[];
  readOnly: boolean; onToast: (msg: string, color?: string) => void; onReload: (silencieux?: boolean) => void; active?: boolean;
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
  const kpisHoraires: { label: string; value: string | number; color: string; icon: React.ReactNode }[] = [
    { label: "Modèles actifs", value: workSchedules.filter(w => w.actif).length, color: C.green, icon: <IconClock/> },
    { label: "Employés planifiés", value: employesPlanifies, color: C.blue, icon: <IconUsers/> },
    { label: "Horaires flexibles", value: workSchedules.filter(w => estFlexible(w.type_horaire)).length, color: C.purple, icon: <IconAlertTriangle/> },
    { label: "Horaires fixes", value: workSchedules.filter(w => w.type_horaire === "fixe").length, color: C.teal, icon: <IconCheck/> },
  ];

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

  return (
    <div>
      {/* ── Hero header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ color: C.t1, fontSize: "20px", fontWeight: 800, letterSpacing: "-0.4px", marginBottom: "4px" }}>Horaires</h2>
          <p style={{ color: C.t2, fontSize: "12.5px", marginBottom: "6px" }}>Configurez les modèles d&apos;horaires — un modèle modifié met automatiquement à jour tous les employés qui l&apos;utilisent.</p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.green, fontSize: "10.5px", fontWeight: 800 }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green, boxShadow: `0 0 0 3px ${C.green}25` }}/>
              Live
            </span>
            <span style={{ color: C.t3, fontSize: "10.5px" }}>Dernière synchronisation : {ilYA(lastSync, maintenant)}</span>
          </div>
        </div>
        {!readOnly && (
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setShowForm(v => !v)}>+ Nouveau modèle</Button>
        )}
      </div>

      {/* ── KPI exécutifs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "20px" }}>
        {kpisHoraires.map(k => <SimpleKpiCard key={k.label} {...k} C={C}/>)}
      </div>

      {horairesSansEmploye.length > 0 && (
        <div style={{ backgroundColor: `${C.orange}0c`, border: `1px solid ${C.orange}30`, borderRadius: "16px", padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ color: C.orange }}><IconAlertTriangle/></span>
            <span style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800 }}>Attention</span>
          </div>
          <AlerteRhLigne C={C} texte={`${horairesSansEmploye.length} horaire${horairesSansEmploye.length > 1 ? "s" : ""} actif${horairesSansEmploye.length > 1 ? "s" : ""} sans employé assigné`}/>
        </div>
      )}

      {insights.length > 0 && (
        <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${C.gold}20`, marginBottom: "20px" }}>
          <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "10px" }}>Analyse automatique</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {insights.map((texte, i) => <div key={i} style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5 }}>{texte}</div>)}
          </div>
        </Card>
      )}

      {showForm && (
        <div className="cis-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => { setShowForm(false); resetForm(); }}>
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
          <button onClick={() => { setShowForm(false); resetForm(); }} className="cis-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

          <div style={{ color: C.t1, fontSize: "17px", fontWeight: 800, marginBottom: "16px" }}>Nouveau modèle d&apos;horaire</div>
          <div style={{ marginBottom: "12px" }}>
            <FormField C={C} label="Nom" placeholder="ex: Équipe de jour" value={nom} onChange={setNom} name="nom"/>
          </div>

          <label style={labelStyle(C)}>Type</label>
          <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
            {TYPES_HORAIRE.map(t => (
              <button key={t.value} onClick={() => changerType(t.value)} className="tap" style={{
                backgroundColor: type === t.value ? `${C.gold}15` : C.bg3, border: `1px solid ${type === t.value ? C.gold + "50" : C.border2}`,
                color: type === t.value ? C.gold : C.t2, fontWeight: 700, fontSize: "12px", padding: "8px 12px", borderRadius: "8px", cursor: "pointer",
              }}>{t.label}</button>
            ))}
          </div>

          <label style={labelStyle(C)}>Planning hebdomadaire</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
            {JOURS.map(j => {
              const config = pattern.jours[j.key];
              return (
                <div key={j.key} style={{ backgroundColor: C.bg3, borderRadius: "8px", padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: config.repos ? 0 : "6px" }}>
                    <span style={{ color: C.t1, fontSize: "12px", fontWeight: 700, width: "36px" }}>{j.label}</span>
                    <button onClick={() => toggleRepos(j.key)} style={{
                      backgroundColor: config.repos ? C.bgCard : `${C.green}15`, border: `1px solid ${config.repos ? C.border2 : C.green + "40"}`,
                      color: config.repos ? C.t3 : C.green, fontWeight: 700, fontSize: "10.5px", padding: "4px 10px", borderRadius: "20px", cursor: "pointer",
                    }}>{config.repos ? "Repos" : "Travaillé"}</button>
                  </div>
                  {!config.repos && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {config.segments.map((s, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input type="time" value={s.debut} onChange={e => updateSegment(j.key, idx, "debut", e.target.value)} style={{ ...inputStyle(C), padding: "6px 8px", fontSize: "12px" }}/>
                          <span style={{ color: C.t3, fontSize: "11px" }}>→</span>
                          <input type="time" value={s.fin} onChange={e => updateSegment(j.key, idx, "fin", e.target.value)} style={{ ...inputStyle(C), padding: "6px 8px", fontSize: "12px" }}/>
                          {config.segments.length > 1 && (
                            <button onClick={() => retirerSegment(j.key, idx)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "4px" }}><IconClose C={C}/></button>
                          )}
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button onClick={() => ajouterSegment(j.key)} style={{ background: "none", border: "none", color: C.gold, fontWeight: 700, fontSize: "10.5px", cursor: "pointer", padding: 0 }}>+ Segment</button>
                        <button onClick={() => appliquerATous(j.key)} style={{ background: "none", border: "none", color: C.t3, fontWeight: 700, fontSize: "10.5px", cursor: "pointer", padding: 0 }}>Appliquer à tous les jours travaillés</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <label style={labelStyle(C)}>Tolérances (minutes)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
            <div>
              <div style={{ color: C.t3, fontSize: "10px", marginBottom: "3px" }}>Retard</div>
              <input type="number" min={0} value={toleranceRetard} onChange={e => setToleranceRetard(Number(e.target.value))} style={inputStyle(C)}/>
            </div>
            <div>
              <div style={{ color: C.t3, fontSize: "10px", marginBottom: "3px" }}>Départ anticipé</div>
              <input type="number" min={0} value={toleranceDepart} onChange={e => setToleranceDepart(Number(e.target.value))} style={inputStyle(C)}/>
            </div>
            <div>
              <div style={{ color: C.t3, fontSize: "10px", marginBottom: "3px" }}>Pause obligatoire</div>
              <input type="number" min={0} value={pauseObligatoire} onChange={e => setPauseObligatoire(Number(e.target.value))} style={inputStyle(C)}/>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg3, borderRadius: "8px", padding: "10px 12px", marginBottom: heuresSupAutorisees ? "8px" : "14px" }}>
            <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>Heures supplémentaires autorisées</span>
            <button onClick={() => setHeuresSupAutorisees(v => !v)} style={{ width: "40px", height: "22px", borderRadius: "20px", border: "none", backgroundColor: heuresSupAutorisees ? C.green : C.border2, position: "relative", cursor: "pointer" }}>
              <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#fff", position: "absolute", top: "3px", left: heuresSupAutorisees ? "21px" : "3px", transition: "left 0.15s" }}/>
            </button>
          </div>
          {heuresSupAutorisees && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ color: C.t3, fontSize: "10px", marginBottom: "3px" }}>Seuil de déclenchement (minutes travaillées/jour)</div>
              <input type="number" min={0} value={heuresSupSeuil} onChange={e => setHeuresSupSeuil(Number(e.target.value))} style={inputStyle(C)}/>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => { setShowForm(false); resetForm(); }}>Annuler</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth disabled={!nom.trim()} loading={saving} onClick={creer}>
              Créer l&apos;horaire
            </Button>
          </div>
        </div>
        </div>
      )}

      {workSchedules.length === 0 && !showForm ? (
        <EmptyState C={C} illustration={<IllustrationHoraires C={C}/>}
          titre="Définissez vos premiers horaires"
          texte="Un modèle suffit pour commencer — vous pourrez l'affecter à autant d'employés que nécessaire, et le modifier plus tard pour tout le monde en une fois."
          cta={!readOnly ? { label: "+ Créer mon premier horaire", onClick: () => setShowForm(true) } : undefined}/>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
          {workSchedules.map(w => {
            const n = employesDuHoraire(w.id).length;
            return (
              <Card key={w.id} tokens={toCardTokens(C)} padding="16px" onClick={() => setSelected(w)} className="tap" style={{ opacity: w.actif ? 1 : 0.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{w.nom}</div>
                  <IconChevron C={C}/>
                </div>
                <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                  <span style={{ color: C.gold, fontSize: "9.5px", fontWeight: 800, backgroundColor: `${C.gold}15`, padding: "2px 8px", borderRadius: "20px" }}>{TYPES_HORAIRE.find(t => t.value === w.type_horaire)?.label}</span>
                  {!w.actif && <span style={{ color: C.t3, fontSize: "9.5px", fontWeight: 800, backgroundColor: C.bg3, padding: "2px 8px", borderRadius: "20px" }}>Archivé</span>}
                </div>
                <div style={{ color: C.t2, fontSize: "11.5px" }}>{n} employé{n > 1 ? "s" : ""} · Tolérance {w.tolerance_retard_minutes} min</div>
              </Card>
            );
          })}
        </div>
      )}

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
  heures_travaillees_minutes: number; retard_minutes: number; depart_anticipe_minutes: number;
  premiere_entree: string | null; derniere_sortie: string | null;
  nombre_pointages: number; override_manuel: boolean;
  employees: { nom: string; prenom: string; matricule: string; department_id: string | null; poste: string | null }
    | { nom: string; prenom: string; matricule: string; department_id: string | null; poste: string | null }[] | null;
};
type Kpis = { present: number; retard: number; absent: number; conge: number; incomplet: number; departsAnticipes: number };
type JourReponse = { records: PresenceRecord[]; kpis: Kpis; conformite: number | null; heuresTravailleesMoyenne: number };
type PointDeTendance = { date: string; present: number; retard: number; absent: number; incomplet: number; conformite: number | null; heuresTravailleesMoyenne: number };

function presenceStatutColor(s: PresenceStatut, C: ThemeTokens): string {
  if (s === "Présent") return C.green;
  if (s === "Retard") return C.orange;
  if (s === "Absent") return C.red;
  if (s === "Congé") return C.blue;
  return C.t3; // Incomplet
}
function formatHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
function CisSparkline({ serie, color }: { serie: number[]; color: string }) {
  if (serie.length < 2) return null;
  const max = Math.max(...serie, 1);
  const points = serie.map((v, i) => {
    const x = (i / (serie.length - 1)) * 100;
    const y = 28 - (v / max) * 24 - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width: "100%", height: "28px", display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function CisDelta({ delta, unite, C }: { delta: number | null; unite: "valeur" | "pts"; C: ThemeTokens }) {
  if (delta === null) return <span style={{ color: C.t3, fontSize: "10px" }}>Pas de comparaison</span>;
  if (delta === 0) return <span style={{ color: C.t3, fontSize: "10px", fontWeight: 700 }}>= vs hier</span>;
  const positif = delta > 0;
  return (
    <span style={{ color: positif ? C.green : C.red, fontSize: "10px", fontWeight: 700 }}>
      {positif ? "+" : ""}{delta}{unite === "pts" ? " pts" : ""} vs hier
    </span>
  );
}
function CisKpiCard({ label, icon, color, value, delta, unite, serie, C }: {
  label: string; icon: React.ReactNode; color: string; value: string; delta: number | null;
  unite: "valeur" | "pts"; serie: number[]; C: ThemeTokens;
}) {
  return (
    <Card tokens={toCardTokens(C)} padding="18px" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "9px", backgroundColor: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</span>
      </div>
      <div style={{ color: C.t1, fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <CisDelta delta={delta} unite={unite} C={C}/>
      {serie.some(v => v > 0) && <CisSparkline serie={serie} color={color}/>}
    </Card>
  );
}

function IconCheck() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function IconAlertTriangle() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}
function IconXCircle() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
}
function IconHourglass() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.41L12 12l-4.41 4.42a2 2 0 0 0-.59 1.41V22M7 2v4.17a2 2 0 0 0 .59 1.41L12 12l4.41-4.42A2 2 0 0 0 17 6.17V2"/></svg>;
}
function IconShield() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function AlerteLigne({ C, texte, noms }: { C: ThemeTokens; texte: string; noms: string[] }) {
  return (
    <div>
      <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700, marginBottom: noms.length > 0 ? "4px" : 0 }}>{texte}</div>
      {noms.length > 0 && <div style={{ color: C.t3, fontSize: "11px" }}>{noms.join(", ")}</div>}
    </div>
  );
}

function PresencesView({ C, employees, onToast, active = true }: {
  C: ThemeTokens; employees: Employee[]; onToast: (msg: string, color?: string) => void; active?: boolean;
}) {
  const [date, setDate] = useState(todayStr());
  const [jour, setJour] = useState<JourReponse>({ records: [], kpis: { present: 0, retard: 0, absent: 0, conge: 0, incomplet: 0, departsAnticipes: 0 }, conformite: null, heuresTravailleesMoyenne: 0 });
  const [jourPrecedent, setJourPrecedent] = useState<JourReponse | null>(null);
  const [tendance, setTendance] = useState<PointDeTendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [maintenant, setMaintenant] = useState(Date.now());

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
    } catch (e) {
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

  const tuiles: { label: string; value: string; delta: number | null; unite: "valeur" | "pts"; color: string; icon: React.ReactNode; serie: number[] }[] = [
    { label: "Présents", value: String(kpis.present), delta: deltaEntre(kpis.present, avantDernier?.present), unite: "valeur", color: C.green, icon: <IconCheck/>, serie: tendance.map(t => t.present) },
    { label: "Retards", value: String(kpis.retard), delta: deltaEntre(kpis.retard, avantDernier?.retard), unite: "valeur", color: C.orange, icon: <IconAlertTriangle/>, serie: tendance.map(t => t.retard) },
    { label: "Absents", value: String(kpis.absent), delta: deltaEntre(kpis.absent, avantDernier?.absent), unite: "valeur", color: C.red, icon: <IconXCircle/>, serie: tendance.map(t => t.absent) },
    { label: "Incomplets", value: String(kpis.incomplet), delta: deltaEntre(kpis.incomplet, avantDernier?.incomplet), unite: "valeur", color: C.t3, icon: <IconAlertTriangle/>, serie: tendance.map(t => t.incomplet) },
    { label: "Temps moyen travaillé", value: formatMinutes(jour.heuresTravailleesMoyenne), delta: null, unite: "valeur", color: C.blue, icon: <IconHourglass/>, serie: tendance.map(t => t.heuresTravailleesMoyenne) },
    { label: "Conformité", value: jour.conformite === null ? "—" : `${jour.conformite}%`, delta: dernier?.conformite !== null && avantDernier?.conformite != null && dernier ? (dernier.conformite ?? 0) - avantDernier.conformite : null, unite: "pts", color: C.gold, icon: <IconShield/>, serie: tendance.map(t => t.conformite ?? 0) },
  ];

  const employesSansCalcul = Math.max(0, employesActifs.length - records.length);

  return (
    <div>
      {/* ── Hero header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ color: C.t1, fontSize: "20px", fontWeight: 800, letterSpacing: "-0.4px", marginBottom: "4px" }}>Présences temps réel</h2>
          <p style={{ color: C.t2, fontSize: "12.5px", marginBottom: "6px" }}>Supervision instantanée de tous les employés planifiés.</p>
          {estAujourdhui && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.green, fontSize: "10.5px", fontWeight: 800 }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green, boxShadow: `0 0 0 3px ${C.green}25` }}/>
                Live
              </span>
              {lastSync && <span style={{ color: C.t3, fontSize: "10.5px" }}>Dernière synchronisation : {ilYA(lastSync, maintenant)}</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          <button onClick={() => setDate(todayStr())} className="tap" style={{ backgroundColor: date === todayStr() ? C.gold : C.bg3, color: date === todayStr() ? "#000" : C.t2, border: `1px solid ${date === todayStr() ? C.gold : C.border}`, fontWeight: 700, fontSize: "12px", padding: "8px 12px", borderRadius: "8px", cursor: "pointer" }}>Aujourd&apos;hui</button>
          <button onClick={() => setDate(joursAvant(todayStr(), 1))} className="tap" style={{ backgroundColor: date === joursAvant(todayStr(), 1) ? C.gold : C.bg3, color: date === joursAvant(todayStr(), 1) ? "#000" : C.t2, border: `1px solid ${date === joursAvant(todayStr(), 1) ? C.gold : C.border}`, fontWeight: 700, fontSize: "12px", padding: "8px 12px", borderRadius: "8px", cursor: "pointer" }}>Hier</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle(C), width: "auto" }}/>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={exporterCsv}>Exporter</Button>
          <Button
            tokens={toUiTokens(C)} className="tap"
            variant="secondary"
            size="sm"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>}
            onClick={() => chargerTout(date, true)}
          >
            Actualiser
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "32px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={24}/></div>
      ) : (
        <>
          {/* ── KPI exécutifs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "20px" }}>
            {tuiles.map(t => <CisKpiCard key={t.label} {...t} C={C}/>)}
          </div>

          {/* ── Centre d'alertes ── */}
          {estAujourdhui && (pasEncorePointe.length > 0 || departsAnticipes.length > 0 || oubliClockOutHier.length > 0) && (
            <div style={{ backgroundColor: `${C.orange}0c`, border: `1px solid ${C.orange}30`, borderRadius: "16px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ color: C.orange }}><IconAlertTriangle/></span>
                <span style={{ color: C.t1, fontSize: "13.5px", fontWeight: 800 }}>Attention</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {pasEncorePointe.length > 0 && (
                  <AlerteLigne C={C} texte={`${pasEncorePointe.length} employé${pasEncorePointe.length > 1 ? "s n'ont" : " n'a"} pas encore pointé aujourd'hui`} noms={pasEncorePointe.slice(0, 5).map(e => `${e.prenom} ${e.nom}`)}/>
                )}
                {departsAnticipes.length > 0 && (
                  <AlerteLigne C={C} texte={`${departsAnticipes.length} départ${departsAnticipes.length > 1 ? "s anticipés" : " anticipé"} aujourd'hui`} noms={departsAnticipes.slice(0, 5).map(r => { const e = unEmploye(r.employees); return e ? `${e.prenom} ${e.nom}` : "—"; })}/>
                )}
                {oubliClockOutHier.length > 0 && (
                  <AlerteLigne C={C} texte={`${oubliClockOutHier.length} oubli${oubliClockOutHier.length > 1 ? "s" : ""} de sortie hier`} noms={oubliClockOutHier.slice(0, 5).map(r => { const e = unEmploye(r.employees); return e ? `${e.prenom} ${e.nom}` : "—"; })}/>
                )}
              </div>
            </div>
          )}

          {employesSansCalcul > 0 && (
            <div style={{ backgroundColor: `${C.t3}12`, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px" }}>
              <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5, margin: 0 }}>
                <strong style={{ color: C.t1 }}>{employesSansCalcul} employé{employesSansCalcul > 1 ? "s" : ""} actif{employesSansCalcul > 1 ? "s" : ""}</strong> sans donnée pour cette date — soit le job de calcul n&apos;est pas encore passé, soit aucun horaire ne leur est affecté.
              </p>
            </div>
          )}

          {records.length === 0 ? (
            employees.length === 0 ? (
              <EmptyState C={C} illustration={<IllustrationPresences C={C}/>}
                titre="Prêt à démarrer le pointage"
                texte="Dès que vous aurez ajouté des employés et qu'ils commenceront à pointer, vous verrez leur présence apparaître ici en temps réel."/>
            ) : (
              <EmptyState C={C} illustration={<IllustrationPresences C={C}/>}
                titre="Rien à afficher pour cette date"
                texte="Soit personne n'a encore pointé, soit le calcul n'est pas encore passé (toutes les 15 minutes) — revenez dans quelques instants."/>
            )
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "14px", backgroundColor: C.bgCard }}>
              <table style={{ width: "100%", minWidth: "640px", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Employé", "Statut", "Entrée", "Sortie", "Heures travaillées", "Pointages"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i, arr) => {
                    const rel = r.employees;
                    const emp = Array.isArray(rel) ? rel[0] : rel;
                    return (
                      <tr key={r.id} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 700, color: C.t1, whiteSpace: "nowrap" }}>{emp ? `${emp.prenom} ${emp.nom}` : "—"}</td>
                        <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                          <span style={{ color: presenceStatutColor(r.statut, C), fontSize: "9.5px", fontWeight: 800, backgroundColor: `${presenceStatutColor(r.statut, C)}15`, padding: "2px 8px", borderRadius: "20px" }}>{r.statut}</span>
                          {r.override_manuel && <span style={{ color: C.t3, fontSize: "9.5px", marginLeft: "6px" }}>· corrigé</span>}
                        </td>
                        <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{formatHeure(r.premiere_entree)}</td>
                        <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{formatHeure(r.derniere_sortie)}</td>
                        <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{formatMinutes(r.heures_travaillees_minutes)}</td>
                        <td style={{ padding: "12px 14px", color: C.t3, whiteSpace: "nowrap" }}>{r.nombre_pointages}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
