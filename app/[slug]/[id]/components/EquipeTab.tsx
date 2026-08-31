"use client";

// Équipe & Accès — refonte Enterprise Access Center (mission CEO
// 05/08/2026, Product Hardening). Distinct de Clock In Shift : ici, ce
// sont les personnes AUTORISÉES À ACCÉDER AU DASHBOARD Yelen (RBAC), pas
// les employés suivis pour le pointage — un employé peut ne jamais avoir
// de compte ici, un compte ici peut ne jamais être un employé Clock In
// Shift (ex. dirigeant/consultant externe). Fondation multi-comptes,
// migration 20260714000001_institution_membres.sql.
//
// Décisions tranchées avec Bryan avant cette refonte :
// - "Invitation en attente" = doit_changer_pin=true (proxy réutilisant une
//   donnée existante), pas un vrai système d'invitation par email/lien
//   (token, expiration) — non construit, chantier séparé si besoin réel.
// - Verrouillage et dernière connexion : suivi persisté ajouté
//   (failed_attempts/locked_until/derniere_connexion, migration
//   20260805000016) — remplace l'ancien Map en mémoire dans les routes de
//   login, qui ne survivait pas à un redémarrage et n'était pas une
//   donnée affichable de façon fiable.
// - Fiche détail : bottom-sheet mobile / dialogue centré ≥1024px
//   (`.equipe-fiche-*`, même convention que `.client-fiche-*` de
//   MesClientsTab.tsx) — PAS un drawer latéral (dérogation testée puis
//   explicitement abandonnée par Bryan sur Clock In Shift le 05/08/2026,
//   "on reste authentique et cohérent").
// - Téléphone/email non ajoutés (pas de colonne, hors périmètre — ce
//   n'est pas un annuaire de contact, juste un centre d'accès RBAC).
//   "Fonction" (intitulé de poste libre) ajouté en revanche, migration
//   20260805000017, même distinction que employees.poste sur Clock In
//   Shift : purement informatif, aucun impact sur les permissions.
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { MEMBRE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, TAB_KEYS, canAccessTab, isMembreRole, type MembreRole } from "@/lib/institutionPermissions";
import { YelenLoader } from "@/components/YelenLoader";
import { FormField } from "./FormField";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

type DerniereActivite = { action: string; created_at: string };
type Membre = {
  id: string; identifiant: string | null; prenom: string; nom: string; role: MembreRole;
  actif: boolean; compte_principal: boolean; doit_changer_pin: boolean;
  locked_until: string | null; derniere_connexion: string | null; fonction: string | null;
  derniere_activite: DerniereActivite | null; created_at: string;
};
type StatutMembre = "verrouille" | "suspendu" | "invitation" | "actif";

const ROLES: { value: MembreRole; label: string; description: string }[] =
  MEMBRE_ROLES.map(value => ({ value, label: ROLE_LABELS[value], description: ROLE_DESCRIPTIONS[value] }));

function roleColor(r: MembreRole, C: ThemeTokens): string {
  if (r === "admin") return C.gold;
  if (r === "comptable") return C.purple;
  if (r === "superviseur") return C.orange;
  if (r === "dirigeant") return C.teal;
  return C.blue;
}

function estVerrouille(m: Membre): boolean {
  return !!m.locked_until && new Date(m.locked_until).getTime() > Date.now();
}
function estInvitationEnAttente(m: Membre): boolean {
  return m.doit_changer_pin && !m.derniere_connexion;
}
function statutDe(m: Membre): StatutMembre {
  if (estVerrouille(m)) return "verrouille";
  if (!m.actif) return "suspendu";
  if (estInvitationEnAttente(m)) return "invitation";
  return "actif";
}
const STATUT_LABEL: Record<StatutMembre, string> = { actif: "Actif", invitation: "Invitation en attente", suspendu: "Suspendu", verrouille: "Verrouillé" };
function statutColor(s: StatutMembre, C: ThemeTokens): string {
  if (s === "actif") return C.green;
  if (s === "invitation") return C.orange;
  if (s === "suspendu") return C.red;
  return "#8B0000";
}

function formatDateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function formatRelatif(iso: string | null): string {
  if (!iso) return "Jamais connecté";
  const d = new Date(iso);
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const hier = new Date(aujourdhui); hier.setDate(hier.getDate() - 1);
  const cible = new Date(d); cible.setHours(0, 0, 0, 0);
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (cible.getTime() === aujourdhui.getTime()) return `Aujourd'hui, ${heure}`;
  if (cible.getTime() === hier.getTime()) return `Hier, ${heure}`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function formatAction(action: string): string {
  const s = action.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function labelStyle(C: ThemeTokens): React.CSSProperties {
  return { display: "block", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" };
}
function inputStyle(C: ThemeTokens): React.CSSProperties {
  return { width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 11px", fontSize: "13px", color: C.t1 };
}

function SimpleKpiCard({ label, icon, color, value, sousTexte, C }: { label: string; icon: React.ReactNode; color: string; value: string | number; sousTexte?: string; C: ThemeTokens }) {
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", padding: "18px", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "9px", backgroundColor: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</span>
      </div>
      <div style={{ color: C.t1, fontSize: "22px", fontWeight: 900, lineHeight: 1 }}>{value}</div>
      {sousTexte && <div style={{ color: C.t3, fontSize: "11px" }}>{sousTexte}</div>}
    </div>
  );
}

function IconUsers() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconMailPlus() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8V7l-3 2-8-5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9"/><path d="M22 8l-10 6L2 8"/><line x1="19" y1="16" x2="19" y2="22"/><line x1="16" y1="19" x2="22" y2="19"/></svg>; }
function IconClockHistory() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>; }
function IconShieldCheck() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>; }
function IconChevron({ C }: { C: ThemeTokens }) { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>; }
function IconClose({ C }: { C: ThemeTokens }) { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }

// Illustration sur mesure Yelen — état vide, même langage que Clock In
// Shift/Mes Offres (trait, un seul accent doré, fond doux).
function IllustrationEquipe({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="38" cy="38" r="10" stroke={C.t3} strokeWidth="2"/>
      <path d="M22 66c1.5-11 8-16 16-16s14.5 5 16 16" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="68" cy="56" r="13" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M68 50v6M62 56h4" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export function EquipeTab({ instId, onToast, active = true }: { instId: string; onToast: (msg: string, color?: string) => void; active?: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [viewerRole, setViewerRole] = useState<MembreRole | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [identifiant, setIdentifiant] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [fonction, setFonction] = useState("");
  const [role, setRole] = useState<MembreRole>("agent");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Membre | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtreRapide, setFiltreRapide] = useState<"tous" | MembreRole | "invitations" | "suspendus">("tous");
  const [lastSync, setLastSync] = useState(new Date());
  const [, setMaintenant] = useState(() => Date.now());

  const readOnly = viewerRole === "superviseur" || viewerRole === "dirigeant";

  // silencieux=true pour le rafraîchissement d'arrière-plan (60s, "Live") —
  // sans ça, `setLoading(true)` remplaçait tout l'écran par le spinner
  // plein écran toutes les 60s, un vrai défaut signalé par Bryan (le
  // tableau/la fiche ouverte disparaissaient puis réapparaissaient sans
  // raison). Seul le tout premier chargement doit bloquer l'affichage.
  const load = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    const res = await fetch("/api/institution/membres");
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const j = await res.json().catch(() => null);
    setMembres(res.ok ? (j?.membres ?? []) : []);
    setViewerRole(res.ok && isMembreRole(j?.role) ? j.role : null);
    setLastSync(new Date());
    if (!silencieux) setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => load()); }, [load, instId]);
  // Workspace persistant (Lot 04-B) : ce composant reste monté même quand
  // l'onglet Équipe n'est plus affiché (section 2/3 du brief) — les deux
  // minuteries ci-dessous ne doivent tourner que pendant qu'il est
  // effectivement visible, sinon elles continuent à consommer réseau/CPU en
  // arrière-plan pour rien pendant le reste de la session du dashboard.
  useEffect(() => { if (!active) return; const id = setInterval(() => setMaintenant(Date.now()), 1000); return () => clearInterval(id); }, [active]);
  useEffect(() => { if (!active) return; const id = setInterval(() => load(true), 60000); return () => clearInterval(id); }, [active, load]);

  function resetForm() {
    setIdentifiant(""); setPrenom(""); setNom(""); setFonction(""); setRole("agent"); setPin("");
  }

  async function creerMembre() {
    if (!identifiant.trim() || !prenom.trim() || !nom.trim() || !/^\d{6}$/.test(pin)) return;
    setSaving(true);
    const res = await fetch("/api/institution/membres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiant, prenom, nom, role, pin, fonction: fonction || undefined }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Erreur de création", C.red); return; }
    setShowForm(false); resetForm();
    onToast(`${prenom} a été invité(e) dans l'équipe`, C.green);
    load();
  }

  async function changerRole(id: string, newRole: MembreRole) {
    const res = await fetch("/api/institution/membres", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role: newRole }),
    });
    if (!res.ok) { onToast("Erreur", C.red); return; }
    setMembres(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
    setSelected(prev => prev && prev.id === id ? { ...prev, role: newRole } : prev);
    onToast("Rôle mis à jour", C.green);
  }

  async function toggleActif(m: Membre) {
    const res = await fetch("/api/institution/membres", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, actif: !m.actif }),
    });
    if (!res.ok) { onToast("Erreur", C.red); return; }
    setMembres(prev => prev.map(x => x.id === m.id ? { ...x, actif: !x.actif } : x));
    setSelected(prev => prev && prev.id === m.id ? { ...prev, actif: !prev.actif } : prev);
    onToast(m.actif ? "Membre suspendu — il ne peut plus se connecter" : "Membre réactivé", C.orange);
  }

  async function supprimer(id: string) {
    const res = await fetch(`/api/institution/membres?id=${id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur de suppression", C.red); return; }
    setMembres(prev => prev.filter(m => m.id !== id));
    setSelected(null);
    onToast("Membre supprimé", C.orange);
  }

  if (loading) {
    return <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>;
  }
  if (forbidden) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: C.t2, fontSize: "13px" }}>Cet écran est réservé aux administrateurs de l&apos;institution.</p>
      </div>
    );
  }

  const debutMois = new Date().toISOString().slice(0, 7);
  const membresActifs = membres.filter(m => m.actif);
  const nouveauxCeMois = membres.filter(m => m.created_at.slice(0, 7) === debutMois).length;
  const invitations = membres.filter(estInvitationEnAttente);
  const administrateurs = membres.filter(m => m.role === "admin").length;
  const doitChangerPin = membres.filter(m => m.doit_changer_pin).length;
  const derniereConnexionGlobale = membres.reduce<string | null>((acc, m) => {
    if (!m.derniere_connexion) return acc;
    if (!acc || m.derniere_connexion > acc) return m.derniere_connexion;
    return acc;
  }, null);
  const securitePct = membres.length > 0 ? Math.round(((membres.length - doitChangerPin) / membres.length) * 100) : 100;

  const kpis: { label: string; value: string | number; sousTexte?: string; color: string; icon: React.ReactNode }[] = [
    { label: "Membres actifs", value: membresActifs.length, sousTexte: nouveauxCeMois > 0 ? `+${nouveauxCeMois} ce mois` : undefined, color: C.green, icon: <IconUsers/> },
    { label: "Invitations", value: invitations.length, sousTexte: invitations.length > 0 ? "En attente d'activation" : undefined, color: C.orange, icon: <IconMailPlus/> },
    { label: "Dernière connexion", value: derniereConnexionGlobale ? formatRelatif(derniereConnexionGlobale) : "Jamais", color: C.blue, icon: <IconClockHistory/> },
    { label: "Sécurité", value: `${securitePct}%`, sousTexte: doitChangerPin > 0 ? `${doitChangerPin} membre${doitChangerPin > 1 ? "s" : ""} doit changer son PIN` : "PIN conforme", color: securitePct === 100 ? C.green : C.orange, icon: <IconShieldCheck/> },
  ];

  const membresFiltres = membres.filter(m => {
    if (filtreRapide === "invitations" && !estInvitationEnAttente(m)) return false;
    if (filtreRapide === "suspendus" && m.actif) return false;
    if (filtreRapide !== "tous" && filtreRapide !== "invitations" && filtreRapide !== "suspendus" && m.role !== filtreRapide) return false;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      const hay = [m.prenom, m.nom, m.identifiant ?? "", m.fonction ?? ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const equipeVide = membres.length <= 1;

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      {/* ── Hero header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "10px" }}>
        <div>
          <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: 900, letterSpacing: "-0.5px", marginBottom: "6px" }}>Équipe &amp; Accès</h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "8px", maxWidth: "480px" }}>
            Gérez les personnes autorisées à accéder à votre espace Yelen, leurs rôles, leurs permissions et la sécurité de leurs accès.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.green, fontSize: "10.5px", fontWeight: 800 }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green, boxShadow: `0 0 0 3px ${C.green}25` }}/>
              Live
            </span>
            <span style={{ color: C.t3, fontSize: "10.5px" }}>Synchronisé {formatRelatif(lastSync.toISOString())}</span>
          </div>
        </div>
        {!readOnly && (
          <button onClick={() => setShowForm(v => !v)} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: 800, fontSize: "12px", padding: "8px 14px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Inviter un membre</button>
        )}
      </div>

      {readOnly && (
        <p style={{ color: C.t2, fontSize: "12px", marginBottom: "14px" }}>Consultation de l&apos;équipe — la gestion (invitation, rôle, statut) est réservée à l&apos;administrateur.</p>
      )}

      {/* ── KPI exécutifs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "18px" }}>
        {kpis.map(k => <SimpleKpiCard key={k.label} {...k} C={C}/>)}
      </div>

      <div style={{ color: C.t3, fontSize: "11.5px", marginBottom: "18px" }}>
        {membres.length} membre{membres.length > 1 ? "s" : ""} · {membresActifs.length} actif{membresActifs.length > 1 ? "s" : ""} · {administrateurs} administrateur{administrateurs > 1 ? "s" : ""} · {invitations.length} invitation{invitations.length > 1 ? "s" : ""} en attente
      </div>

      {equipeVide && !showForm && !readOnly && (
        <EmptyState C={C} illustration={<IllustrationEquipe C={C}/>}
          titre="Votre équipe est vide"
          texte="Invitez vos collaborateurs afin de leur attribuer un accès sécurisé à votre espace Yelen — chacun se connecte avec son propre identifiant et PIN, jamais votre compte principal."
          cta={{ label: "Inviter un premier membre", onClick: () => setShowForm(true) }}/>
      )}

      {showForm && (
        <div className="equipe-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => { setShowForm(false); resetForm(); }}>
        <style>{`
          @media(min-width:1024px){
            .equipe-fiche-overlay{align-items:center!important}
            .equipe-fiche-panel{max-width:560px!important;border-radius:20px!important;max-height:86svh!important}
            .equipe-fiche-grip{display:none!important}
            .equipe-fiche-close-x{display:flex!important}
          }
        `}</style>
        <div onClick={e => e.stopPropagation()} className="equipe-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "86svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
          <div className="equipe-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
          <button onClick={() => { setShowForm(false); resetForm(); }} className="equipe-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

          <div style={{ color: C.t1, fontSize: "17px", fontWeight: 900, marginBottom: "16px" }}>Inviter un membre</div>

          <FormField C={C} label="Identifiant de connexion" value={identifiant} onChange={setIdentifiant} placeholder="ex: dr.diallo" name="identifiant"/>
          <p style={{ color: C.t3, fontSize: "10.5px", margin: "4px 0 12px" }}>C&apos;est ce que le membre tapera pour se connecter — pas d&apos;espace, unique dans tout Yelen224.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
            <FormField C={C} label="Prénom" value={prenom} onChange={setPrenom} placeholder="Prénom" name="prenom" autoComplete="given-name"/>
            <FormField C={C} label="Nom" value={nom} onChange={setNom} placeholder="Nom" name="nom" autoComplete="family-name"/>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <FormField C={C} label="Fonction (optionnel)" value={fonction} onChange={setFonction} placeholder="ex: Directeur, Secrétaire médicale..." name="fonction"/>
          </div>

          <label style={labelStyle(C)}>Rôle Dashboard</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
            {ROLES.map(r => (
              <div key={r.value} onClick={() => setRole(r.value)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "8px", backgroundColor: role === r.value ? `${roleColor(r.value, C)}12` : C.bg3, border: `1px solid ${role === r.value ? roleColor(r.value, C) + "40" : C.border2}`, cursor: "pointer" }}>
                <div style={{ width: "14px", height: "14px", borderRadius: "50%", border: `2px solid ${role === r.value ? roleColor(r.value, C) : C.t3}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {role === r.value && <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: roleColor(r.value, C) }}/>}
                </div>
                <div>
                  <div style={{ color: C.t1, fontSize: "12px", fontWeight: 700 }}>{r.label}</div>
                  <div style={{ color: C.t3, fontSize: "10.5px" }}>{r.description}</div>
                </div>
              </div>
            ))}
          </div>

          <label style={labelStyle(C)}>PIN initial</label>
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} placeholder="6 chiffres" style={{ ...inputStyle(C), textAlign: "center", letterSpacing: "3px", marginBottom: "4px" }}/>
          <p style={{ color: C.t3, fontSize: "10.5px", marginBottom: "14px" }}>Communiquez ce code au membre — il devra en choisir un nouveau dès sa première connexion.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: 700, fontSize: "13px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>Annuler</button>
            <button onClick={creerMembre} disabled={saving || !identifiant.trim() || !prenom.trim() || !nom.trim() || !/^\d{6}$/.test(pin)} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: 800, fontSize: "13px", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: saving || !identifiant.trim() || !prenom.trim() || !nom.trim() || !/^\d{6}$/.test(pin) ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {saving ? <YelenLoader size={14} color="#000"/> : "Envoyer l'invitation"}
            </button>
          </div>
        </div>
        </div>
      )}

      {membres.length > 0 && (
        <>
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un membre, un identifiant, une fonction..." style={{ ...inputStyle(C), marginBottom: "10px" }}/>
          <div style={{ display: "flex", gap: "6px", marginBottom: "16px", overflowX: "auto" }}>
            {([
              { key: "tous", label: "Tous" },
              { key: "admin", label: "Administrateurs" },
              { key: "superviseur", label: "Superviseurs" },
              { key: "comptable", label: "Comptables" },
              { key: "agent", label: "Agents" },
              { key: "invitations", label: "Invitations" },
              { key: "suspendus", label: "Suspendus" },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFiltreRapide(f.key)} className="tap" style={{
                backgroundColor: filtreRapide === f.key ? C.gold : C.bg3, color: filtreRapide === f.key ? "#000" : C.t2,
                border: `1px solid ${filtreRapide === f.key ? C.gold : C.border}`, fontWeight: 700, fontSize: "11.5px",
                padding: "7px 12px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap",
              }}>{f.label}</button>
            ))}
          </div>
        </>
      )}

      {membres.length > 0 && membresFiltres.length === 0 ? (
        <EmptyState C={C} illustration={<IllustrationEquipe C={C}/>}
          titre="Aucun membre ne correspond"
          texte="Aucun membre ne correspond à ces critères de recherche ou de filtre — essayez d'élargir votre recherche."
          cta={{ label: "Réinitialiser les filtres", onClick: () => { setRecherche(""); setFiltreRapide("tous"); } }}/>
      ) : membres.length > 0 && (
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "14px", backgroundColor: C.bgCard }}>
          <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Membre", "Rôle", "Dernière activité", "Dernière connexion", "Statut", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {membresFiltres.map((m, i, arr) => {
                const statut = statutDe(m);
                return (
                  <tr key={m.id} onClick={() => setSelected(m)} className="tap" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", opacity: m.actif ? 1 : 0.6 }}>
                    <td style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap" }}>
                      <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: `linear-gradient(135deg, ${roleColor(m.role, C)}30, ${roleColor(m.role, C)}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 900, color: roleColor(m.role, C), flexShrink: 0 }}>
                        {m.prenom.slice(0, 1).toUpperCase()}{m.nom.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: C.t1 }}>{m.prenom} {m.nom}{m.compte_principal && <span style={{ color: C.t3, fontWeight: 500 }}> · Principal</span>}</div>
                        {m.fonction && <div style={{ color: C.t3, fontSize: "11px" }}>{m.fonction}</div>}
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ color: roleColor(m.role, C), fontSize: "9.5px", fontWeight: 800, backgroundColor: `${roleColor(m.role, C)}15`, padding: "2px 8px", borderRadius: "20px" }}>{ROLES.find(r => r.value === m.role)?.label}</span>
                      <div style={{ color: C.t3, fontSize: "10px", marginTop: "3px" }}>{ROLES.find(r => r.value === m.role)?.description}</div>
                    </td>
                    <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>
                      {m.derniere_activite ? (<><div>{formatAction(m.derniere_activite.action)}</div><div style={{ color: C.t3, fontSize: "10.5px" }}>{formatRelatif(m.derniere_activite.created_at)}</div></>) : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{formatRelatif(m.derniere_connexion)}</td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ color: statutColor(statut, C), fontSize: "11px", fontWeight: 700 }}>{STATUT_LABEL[statut]}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}><IconChevron C={C}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <MembreDetailModal
          C={C} membre={selected} readOnly={readOnly}
          onClose={() => setSelected(null)}
          onChangerRole={changerRole}
          onToggleActif={toggleActif}
          onSupprimer={supprimer}
          onToast={onToast}
          onReload={load}
        />
      )}
    </div>
  );
}

function EmptyState({ C, illustration, titre, texte, cta }: { C: ThemeTokens; illustration: React.ReactNode; titre: string; texte: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>{illustration}</div>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>{titre}</div>
      <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "340px", margin: "0 auto" }}>{texte}</div>
      {cta && (
        <button onClick={cta.onClick} className="tap" style={{ marginTop: "18px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: 800, fontSize: "12.5px", padding: "10px 18px", borderRadius: "10px", border: "none", cursor: "pointer" }}>{cta.label}</button>
      )}
    </div>
  );
}

function MembreDetailModal({ C, membre, readOnly, onClose, onChangerRole, onToggleActif, onSupprimer, onToast, onReload }: {
  C: ThemeTokens; membre: Membre; readOnly: boolean; onClose: () => void;
  onChangerRole: (id: string, role: MembreRole) => void;
  onToggleActif: (m: Membre) => void;
  onSupprimer: (id: string) => Promise<void>;
  onToast: (msg: string, color?: string) => void;
  onReload: () => void;
}) {
  const [showResetPin, setShowResetPin] = useState(false);
  const [nouveauPin, setNouveauPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [editFonction, setEditFonction] = useState(membre.fonction ?? "");
  const [historique, setHistorique] = useState<{ id: string; action: string; created_at: string }[]>([]);
  const [loadingHistorique, setLoadingHistorique] = useState(true);
  const [confirmSupprimer, setConfirmSupprimer] = useState(false);

  const statut = statutDe(membre);
  const uiTokens = toUiTokens(C);

  useEffect(() => {
    let annule = false;
    fetch(`/api/institution/journal?membre_id=${membre.id}&limit=5`)
      .then(r => r.json()).catch(() => null)
      .then(j => { if (!annule) { setHistorique(j?.entrees ?? []); setLoadingHistorique(false); } });
    return () => { annule = true; };
  }, [membre.id]);

  async function reinitialiserPin() {
    if (!/^\d{6}$/.test(nouveauPin)) return;
    setSaving(true);
    const res = await fetch("/api/institution/membres", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: membre.id, pin: nouveauPin }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Erreur", C.red); return; }
    setShowResetPin(false); setNouveauPin("");
    onToast("PIN réinitialisé — communiquez-le au membre", C.green);
  }

  async function enregistrerFonction() {
    setSaving(true);
    const res = await fetch("/api/institution/membres", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: membre.id, fonction: editFonction }),
    });
    setSaving(false);
    if (!res.ok) { onToast("Erreur", C.red); return; }
    setModeEdition(false);
    onToast("Fonction mise à jour", C.green);
    onReload();
  }

  const ongletsAutorises = TAB_KEYS.map(tab => [tab, canAccessTab(membre.role, tab)] as const).filter(([, acces]) => acces !== "none");

  return (
    <>
    <div className="equipe-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media(min-width:1024px){
          .equipe-fiche-overlay{align-items:center!important}
          .equipe-fiche-panel{max-width:560px!important;border-radius:20px!important;max-height:86svh!important}
          .equipe-fiche-grip{display:none!important}
          .equipe-fiche-close-x{display:flex!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="equipe-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "86svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div className="equipe-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
        <button onClick={onClose} className="equipe-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose C={C}/></button>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `linear-gradient(135deg, ${roleColor(membre.role, C)}30, ${roleColor(membre.role, C)}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", fontWeight: 900, color: roleColor(membre.role, C), flexShrink: 0 }}>
            {membre.prenom.slice(0, 1).toUpperCase()}{membre.nom.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800 }}>{membre.prenom} {membre.nom}</div>
            <div style={{ color: C.t3, fontSize: "11.5px" }}>{membre.compte_principal ? "Compte administrateur principal" : (membre.identifiant || "Connexion par téléphone")}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
          <span style={{ color: roleColor(membre.role, C), fontSize: "9.5px", fontWeight: 800, backgroundColor: `${roleColor(membre.role, C)}15`, padding: "3px 9px", borderRadius: "20px" }}>{ROLES.find(r => r.value === membre.role)?.label}</span>
          <span style={{ color: statutColor(statut, C), fontSize: "9.5px", fontWeight: 800, backgroundColor: `${statutColor(statut, C)}15`, padding: "3px 9px", borderRadius: "20px" }}>{STATUT_LABEL[statut]}</span>
          {membre.doit_changer_pin && <span style={{ color: C.orange, fontSize: "9.5px", fontWeight: 800, backgroundColor: `${C.orange}15`, padding: "3px 9px", borderRadius: "20px" }}>PIN pas encore changé</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Fonction</div>
            {modeEdition ? (
              <div style={{ display: "flex", gap: "4px" }}>
                <input value={editFonction} onChange={e => setEditFonction(e.target.value)} placeholder="ex: Directeur" style={{ ...inputStyle(C), padding: "5px 8px", fontSize: "12px" }}/>
              </div>
            ) : (
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700 }}>{membre.fonction || "Non renseignée"}</div>
            )}
          </div>
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Membre depuis</div>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700 }}>{formatDateHeure(membre.created_at)}</div>
          </div>
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px", gridColumn: "1 / -1" }}>
            <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Dernière connexion</div>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700 }}>{formatRelatif(membre.derniere_connexion)}</div>
          </div>
        </div>

        {!readOnly && !membre.compte_principal && (
          modeEdition ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
              <button onClick={() => { setModeEdition(false); setEditFonction(membre.fonction ?? ""); }} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: 700, fontSize: "12px", padding: "9px", borderRadius: "8px", cursor: "pointer" }}>Annuler</button>
              <button onClick={enregistrerFonction} disabled={saving} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: 800, fontSize: "12px", padding: "9px", borderRadius: "8px", border: "none", cursor: "pointer", opacity: saving ? 0.5 : 1 }}>Enregistrer</button>
            </div>
          ) : (
            <button onClick={() => setModeEdition(true)} style={{ background: "none", border: "none", color: C.gold, fontWeight: 700, fontSize: "12px", cursor: "pointer", padding: 0, marginBottom: "16px", display: "block" }}>Modifier la fonction</button>
          )
        )}

        <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Permissions ({ongletsAutorises.length} écrans accessibles)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "16px" }}>
          {ongletsAutorises.slice(0, 10).map(([tab, acces]) => (
            <span key={tab} style={{ color: acces === "full" ? C.t2 : C.t3, fontSize: "10px", fontWeight: 700, backgroundColor: C.bg3, padding: "3px 8px", borderRadius: "8px" }}>{tab}{acces === "read" ? " (lecture)" : ""}</span>
          ))}
          {ongletsAutorises.length > 10 && <span style={{ color: C.t3, fontSize: "10px", alignSelf: "center" }}>+{ongletsAutorises.length - 10} autres</span>}
        </div>

        <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Dernières actions</div>
        {loadingHistorique ? <YelenLoader size={14}/> : historique.length === 0 ? (
          <div style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Aucune action enregistrée pour l&apos;instant.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
            {historique.map(h => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", backgroundColor: C.bg3, borderRadius: "8px", padding: "7px 10px" }}>
                <span style={{ color: C.t1, fontSize: "11.5px", fontWeight: 600 }}>{formatAction(h.action)}</span>
                <span style={{ color: C.t3, fontSize: "10.5px" }}>{formatRelatif(h.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {!membre.compte_principal && !readOnly && (
          <>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Changer le rôle</div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
              {ROLES.map(r => (
                <button key={r.value} onClick={() => onChangerRole(membre.id, r.value)} disabled={r.value === membre.role} style={{ backgroundColor: r.value === membre.role ? `${roleColor(r.value, C)}15` : C.bg3, border: `1px solid ${r.value === membre.role ? roleColor(r.value, C) + "40" : C.border}`, color: r.value === membre.role ? roleColor(r.value, C) : C.t2, fontSize: "11.5px", fontWeight: 700, padding: "8px 12px", borderRadius: "8px", cursor: r.value === membre.role ? "default" : "pointer" }}>{r.label}</button>
              ))}
            </div>
          </>
        )}

        {!readOnly && (showResetPin ? (
          <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
            <div style={{ color: C.t2, fontSize: "11.5px", marginBottom: "8px" }}>Nouveau PIN à 6 chiffres pour {membre.prenom} :</div>
            <input value={nouveauPin} onChange={e => setNouveauPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} placeholder="6 chiffres" style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px", fontSize: "14px", color: C.t1, textAlign: "center", letterSpacing: "3px", marginBottom: "8px" }}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button onClick={() => { setShowResetPin(false); setNouveauPin(""); }} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, color: C.t2, fontWeight: 700, fontSize: "12px", padding: "9px", borderRadius: "8px", cursor: "pointer" }}>Annuler</button>
              <button onClick={reinitialiserPin} disabled={saving || !/^\d{6}$/.test(nouveauPin)} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: 800, fontSize: "12px", padding: "9px", borderRadius: "8px", border: "none", cursor: "pointer", opacity: saving || !/^\d{6}$/.test(nouveauPin) ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{saving ? <YelenLoader size={12} color="#000"/> : "Valider"}</button>
            </div>
          </div>
        ) : (
          !membre.compte_principal && (
            <button onClick={() => setShowResetPin(true)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: 700, fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer", marginBottom: "10px" }}>Réinitialiser le PIN</button>
          )
        ))}

        {!membre.compte_principal && !readOnly && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
            <button onClick={() => onToggleActif(membre)} style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, color: C.orange, fontWeight: 700, fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>{membre.actif ? "Suspendre" : "Réactiver"}</button>
            <button onClick={() => setConfirmSupprimer(true)} style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, color: C.red, fontWeight: 700, fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>Supprimer</button>
          </div>
        )}

        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", cursor: "pointer", padding: "8px" }}>Fermer</button>
      </div>
    </div>

    <ConfirmModal
      open={confirmSupprimer}
      onClose={() => setConfirmSupprimer(false)}
      onConfirm={async () => { await onSupprimer(membre.id); setConfirmSupprimer(false); }}
      tokens={uiTokens}
      level={3}
      danger
      title={`Supprimer ${membre.prenom} ${membre.nom} ?`}
      description="Ce compte perd l'accès au dashboard Yelen immédiatement."
      consequences={[
        "Ce n'est pas une suspension : le compte est définitivement supprimé, pas seulement désactivé.",
        `${membre.prenom} ne pourra plus se connecter avec cet identifiant.`,
        "Retrouver l'accès nécessitera de recréer un nouveau compte.",
      ]}
      reversible={false}
      confirmWord={membre.prenom}
      confirmLabel="Supprimer définitivement"
    />
    </>
  );
}
