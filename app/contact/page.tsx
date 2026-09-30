"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";
import { Sora } from "next/font/google";
import type { SupportCategoriePublic } from "@/lib/supportTicketsConstants";
import { LegalLanguageSwitcher } from "@/app/(legal)/_components/LegalLanguageSwitcher";

// Auto-hébergée (Lot 1.5, 13/08/2026) — voir app/ambassades/page.tsx pour
// le raisonnement complet.
// Sora ne propose pas de graisse 900 statique (confirmé dans les types
// next/font/google) — l'ancien @import la demandait déjà en vain, le
// navigateur retombait silencieusement sur 800 (algorithme de matching de
// graisse CSS standard). Comportement visuel strictement identique.
const sora = Sora({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sora" });

// ── Icônes (retour Bryan 24/09/2026 : zéro emoji, SVG Yelen partout) ─────────
// Même convention de trait que le logo du header (stroke, fill none, bouts
// arrondis) — un seul point de définition, jamais de <svg> dupliqué inline.
function Icon({ children, size = 20, color = "currentColor", strokeWidth = 2 }: { children: React.ReactNode; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
type IconProps = { size?: number; color?: string; strokeWidth?: number };
const IconMail = (p: IconProps) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icon>;
const IconBuilding = (p: IconProps) => <Icon {...p}><path d="M3 21h18" /><path d="M5 21V10M9 21V10M15 21V10M19 21V10" /><path d="M3 10l9-6 9 6" /></Icon>;
const IconNewspaper = (p: IconProps) => <Icon {...p}><rect x="3" y="5" width="14" height="16" rx="1" /><path d="M17 8h4v11a2 2 0 0 1-2 2H7" /><path d="M7 9h6M7 12h6M7 15h4" /></Icon>;
const IconTool = (p: IconProps) => <Icon {...p}><path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8z" /></Icon>;
const IconCheck = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></Icon>;
const IconLock = (p: IconProps) => <Icon {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>;
const IconError = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></Icon>;
const IconZap = (p: IconProps) => <Icon {...p}><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></Icon>;
const IconGlobe = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></Icon>;
const IconArrowLeft = (p: IconProps) => <Icon {...p}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></Icon>;
const IconArrowRight = (p: IconProps) => <Icon {...p}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></Icon>;
const IconMenu = (p: IconProps) => <Icon {...p}><path d="M3 6h18M3 12h18M3 18h18" /></Icon>;
const IconLifeBuoy = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24" /></Icon>;
const IconScale = (p: IconProps) => <Icon {...p}><path d="M12 3v18M8 21h8M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z" /></Icon>;
const IconHelpCircle = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>;
const IconUserPlus = (p: IconProps) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></Icon>;
const IconLogIn = (p: IconProps) => <Icon {...p}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></Icon>;

// ── Data ─────────────────────────────────────────────────────────────────────
const FORM_TYPES = [
  { id: "general",     label: "Particulier / Citoyen",             IconComp: IconMail,      desc: "Question, suggestion ou information générale" },
  { id: "institution", label: "Institution / Entreprise",          IconComp: IconBuilding,  desc: "Partenariat, adhésion ou intégration à Yelen224" },
  { id: "presse",      label: "Presse & Médias",                   IconComp: IconNewspaper, desc: "Demande d'interview, presse ou communication" },
  { id: "support",     label: "Utilisateur en besoin d'assistance", IconComp: IconTool,     desc: "Signalement de bug ou problème technique" },
];

// ── Shared input style ────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%",
  padding: "13px 16px",
  borderRadius: "14px",
  border: "1.5px solid rgba(0,0,0,0.15)",
  background: "#FFFFFF",
  color: "#1a1200",
  fontSize: "14px",
  fontFamily: "var(--font-sora), sans-serif",
  fontWeight: "500",
  outline: "none",
  boxSizing: "border-box",
  WebkitAppearance: "none",
};

const menuItem: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "10px",
  padding: "11px 12px", borderRadius: "10px",
  color: "#1a1200", fontSize: "13px", fontWeight: 700,
  textDecoration: "none", fontFamily: "var(--font-sora), sans-serif",
};

const MENU_LINKS = [
  { href: "/guide-prestataire", label: "Centre d'aide", IconComp: IconLifeBuoy },
  { href: "/legal", label: "Centre légal", IconComp: IconScale },
  { href: "/faq", label: "FAQ", IconComp: IconHelpCircle },
];

const INITIAL_FORM_DATA = {
  nom: "", prenom: "", email: "", telephone: "",
  organisation: "", sujet: "", message: "",
  nomInstitution: "", typeInstitution: "", ville: "", pays: "",
  media: "", publication: "",
  typeProbleme: "", urlPage: "",
};

// Remplace la bulle de validation native du navigateur ("Fill out this
// field", dans la langue du navigateur — vu en anglais malgré une page en
// français) par un message maison, chaleureux et toujours en français
// (retour Bryan 24/09/2026). Un seul champ requis manquant par type de
// formulaire suffit à bloquer l'envoi ; tous les champs manquants sont
// surlignés en même temps (pas un à la fois comme le ferait le navigateur).
const REQUIRED_FIELDS: Record<string, (keyof typeof INITIAL_FORM_DATA)[]> = {
  general:     ["prenom", "nom", "email", "sujet", "message"],
  institution: ["prenom", "nom", "email", "nomInstitution", "typeInstitution", "ville", "pays", "sujet", "message"],
  presse:      ["prenom", "nom", "email", "media", "sujet", "message"],
  support:     ["prenom", "nom", "email", "typeProbleme", "sujet", "message"],
};

const MESSAGE_CHAMP_MANQUANT = "Merci de compléter ce champ avant l'envoi.";

function emailEstValide(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// Téléphone optionnel partout, mais s'il est renseigné il doit correspondre
// à un mobile guinéen : 9 chiffres après l'indicatif +224 (retour Bryan
// 24/09/2026), que l'indicatif ait été saisi ou non.
function telephoneEstValide(v: string): boolean {
  const chiffres = v.replace(/\D/g, "");
  const local = chiffres.length === 12 && chiffres.startsWith("224") ? chiffres.slice(3) : chiffres;
  return local.length === 9;
}

// Migration vers le moteur support_tickets public (chantier "Yelen Support
// Public Général", 24/09/2026, docs/support-center/public-support-
// technical-design.md §16) — interrupteur de rollback : tant que cette
// variable n'est pas explicitement "true" sur Netlify, /contact retombe
// sur l'ancien comportement FormSubmit direct ci-dessous, inchangé.
const SUPPORT_PUBLIC_ENABLED = process.env.NEXT_PUBLIC_SUPPORT_PUBLIC_ENABLED === "true";

// Mapping vers les catégories publiques du moteur (§10 architecture) —
// 'rejoindre_yelen' est délibérément distinct de 'partenariat' (réservé à
// un établissement déjà client) : le formulaire "Institution / Partenariat"
// de /contact s'adresse à un prospect sans compte Yelen. "Support
// technique" local → 'technique', catégorie déjà partagée avec citoyen/
// institution.
const CATEGORIE_PAR_FORM_TYPE: Record<string, SupportCategoriePublic> = {
  general: "general",
  institution: "rejoindre_yelen",
  presse: "presse",
  support: "technique",
};

// Les champs annexes par type de formulaire (institution, presse, bug)
// n'ont pas de colonne dédiée côté moteur support_tickets public (seuls
// nom/email/telephone/categorie/sujet/message existent, voir
// creerTicketPublic) — jamais perdus pour autant : repris en tête du
// message pour rester visibles par l'agent qui traite la demande.
function construireMessageContexte(activeForm: string, formData: typeof INITIAL_FORM_DATA): string {
  const lignes: string[] = [];
  if (activeForm === "institution") {
    if (formData.nomInstitution) lignes.push(`Institution : ${formData.nomInstitution}`);
    if (formData.typeInstitution) lignes.push(`Type d'institution : ${formData.typeInstitution}`);
    if (formData.ville || formData.pays) lignes.push(`Localisation : ${[formData.ville, formData.pays].filter(Boolean).join(", ")}`);
  }
  if (activeForm === "presse") {
    if (formData.media) lignes.push(`Média / chaîne : ${formData.media}`);
    if (formData.publication) lignes.push(`Publication / émission : ${formData.publication}`);
  }
  if (activeForm === "support") {
    if (formData.typeProbleme) lignes.push(`Type de problème : ${formData.typeProbleme}`);
    if (formData.urlPage) lignes.push(`Page concernée : ${formData.urlPage}`);
  }
  if (formData.organisation) lignes.push(`Organisation : ${formData.organisation}`);
  return lignes.length ? `${lignes.join("\n")}\n\n${formData.message}` : formData.message;
}

// ── Main ──────────────────────────────────────────────────────────────────────
// Écran en progression (retour Bryan 24/09/2026) : accueil → type de
// demande → formulaire. Chaque étape remplace la précédente avec la même
// animation fade-up déjà utilisée pour les états succès/en attente
// ci-dessous — pas de nouvelle couche modale/overlay.
type Step = "welcome" | "type" | "form";

export default function ContactPage() {
  const [step, setStep] = useState<Step>("welcome");
  const [activeForm, setActiveForm] = useState("general");
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [status, setStatus] = useState("idle");
  const [honeypot, setHoneypot] = useState("");
  // Capturé avant la réinitialisation du formulaire — affiché dans l'état
  // "Vérifiez votre boîte mail" (formData.email est vide à ce moment-là).
  const [emailEnvoye, setEmailEnvoye] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [invalidFields, setInvalidFields] = useState<Map<string, string>>(new Map());
  const [accepteConditions, setAccepteConditions] = useState(false);
  const [conditionsErreur, setConditionsErreur] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (invalidFields.has(name) && value.trim()) {
      setInvalidFields(prev => {
        const next = new Map(prev);
        next.delete(name);
        return next;
      });
    }
  };

  const champStyle = (name: keyof typeof INITIAL_FORM_DATA): React.CSSProperties =>
    invalidFields.has(name) ? { ...inp, borderColor: "#F5A623", boxShadow: "0 0 0 3px rgba(245,166,35,0.18)" } : inp;

  const ChampMessage = ({ name }: { name: keyof typeof INITIAL_FORM_DATA }) => {
    const message = invalidFields.get(name);
    return message ? (
      <p style={{ color: "#C97A0E", fontSize: "11px", fontWeight: "700", margin: "6px 0 0" }}>{message}</p>
    ) : null;
  };

  const choisirType = (id: string) => {
    setActiveForm(id);
    setStatus("idle");
    setInvalidFields(new Map());
    setStep("form");
  };

  const recommencer = () => {
    setStatus("idle");
    setStep("welcome");
    setAccepteConditions(false);
    setConditionsErreur(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (honeypot) return;

    const erreurs = new Map<string, string>();
    for (const name of REQUIRED_FIELDS[activeForm] ?? []) {
      if (!formData[name]?.trim()) erreurs.set(name, MESSAGE_CHAMP_MANQUANT);
    }
    if (!erreurs.has("email") && formData.email.trim() && !emailEstValide(formData.email)) {
      erreurs.set("email", "Cette adresse email semble invalide.");
    }
    if (formData.telephone.trim() && !telephoneEstValide(formData.telephone)) {
      erreurs.set("telephone", "Le numéro doit contenir 9 chiffres après +224.");
    }
    if (erreurs.size > 0) {
      setInvalidFields(erreurs);
      const premierChamp = e.currentTarget.elements.namedItem([...erreurs.keys()][0]) as HTMLElement | null;
      premierChamp?.focus();
      return;
    }
    setInvalidFields(new Map());

    if (!accepteConditions) {
      setConditionsErreur(true);
      return;
    }
    setConditionsErreur(false);
    setStatus("sending");

    if (!SUPPORT_PUBLIC_ENABLED) {
      try {
        const res = await fetch("https://formsubmit.co/ajax/yelen224gn@gmail.com", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            ...formData,
            _subject: `[Yelen224] ${FORM_TYPES.find(f => f.id === activeForm)?.label} — ${formData.sujet || formData.nom}`,
            _template: "table",
            _captcha: "false",
            typeFormulaire: FORM_TYPES.find(f => f.id === activeForm)?.label,
          }),
        });
        if (res.ok) {
          setStatus("success");
          setFormData(INITIAL_FORM_DATA);
        } else setStatus("error");
      } catch { setStatus("error"); }
      return;
    }

    try {
      const res = await fetch("/api/support/public/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _hp: honeypot,
          nom: `${formData.prenom} ${formData.nom}`.trim(),
          email: formData.email,
          telephone: formData.telephone,
          categorie: CATEGORIE_PAR_FORM_TYPE[activeForm] ?? "general",
          sujet: formData.sujet,
          message: construireMessageContexte(activeForm, formData),
        }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean } | null;
      if (res.ok && json?.ok) {
        setEmailEnvoye(formData.email);
        setStatus("success_verification_pending");
        setFormData(INITIAL_FORM_DATA);
      } else setStatus("error");
    } catch { setStatus("error"); }
  };

  const currentType = FORM_TYPES.find(f => f.id === activeForm);

  return (
    <div className={sora.variable} style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sora), sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }
        ::-webkit-scrollbar { display: none; }
        input::placeholder, textarea::placeholder { color: rgba(0,0,0,0.35); }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #F5A623 !important; box-shadow: 0 0 0 3px rgba(245,166,35,0.18) !important; }
        select option { background: #ffffff; color: #1a1200; }
        .hp-field { opacity:0; position:absolute; top:0; left:0; height:0; width:0; z-index:-1; pointer-events:none; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        .fade-up { animation: fadeUp 0.32s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>

      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />

      {/* ── Top bar (persiste à chaque étape) ── */}
      <div style={{ padding: "24px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(245,166,35,0.4)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1200" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "900", color: "#1a1200", letterSpacing: "0.5px", lineHeight: 1 }}>YELEN224</div>
            <div style={{ fontSize: "8px", color: "#8a8a8a", letterSpacing: "1.5px", fontWeight: "600" }}>NOUS CONTACTER</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <LegalLanguageSwitcher variant="pill" forceTheme="light"/>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Menu"
              style={{ width: "36px", height: "36px", borderRadius: "12px", border: "1.5px solid rgba(0,0,0,0.08)", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <IconMenu size={17} color="#1a1200"/>
            </button>
            {menuOpen && (
              <div role="menu" className="fade-up" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200, width: "230px", background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: "16px", boxShadow: "0 12px 32px rgba(0,0,0,0.14)", padding: "8px" }}>
                {MENU_LINKS.map(l => (
                  <a key={l.href} href={l.href} role="menuitem" style={menuItem}>
                    <l.IconComp size={16} color="#1a1200"/>
                    {l.label}
                  </a>
                ))}
                <div style={{ height: "1px", background: "rgba(0,0,0,0.08)", margin: "6px 4px" }}/>
                <a href="/inscription" role="menuitem" style={{ ...menuItem, justifyContent: "center", background: "#F5A623", boxShadow: "0 3px 10px rgba(245,166,35,0.3)" }}>
                  <IconUserPlus size={16} color="#1a1200"/>
                  S&apos;inscrire
                </a>
                <a href="/login" role="menuitem" style={{ ...menuItem, justifyContent: "center", border: "1.5px solid rgba(0,0,0,0.12)", marginTop: "6px" }}>
                  <IconLogIn size={16} color="#1a1200"/>
                  Se connecter
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {step === "welcome" && (
        <div className="fade-up">
          {/* ── Hero ── */}
          <div style={{ padding: "24px 20px 20px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: "900", color: "#1a1200", margin: "0 0 6px", letterSpacing: "-0.8px", lineHeight: 1.1 }}>
              Contactez l&apos;équipe Yelen
            </h1>
            <p style={{ color: "#5a5a5a", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
              Nos équipes vous répondent du lundi au vendredi.
            </p>
          </div>

          <div style={{ padding: "0 20px 20px" }}>
            {/* ── Carte d'accueil + Démarrer ── */}
            <div style={{ background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: "24px", padding: "32px 24px", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", marginBottom: "20px" }}>
              <h2 style={{ color: "#1a1200", fontSize: "18px", fontWeight: "900", margin: "0 0 8px" }}>Comment pouvons-nous vous aider ?</h2>
              <p style={{ color: "#5a5a5a", fontSize: "13px", maxWidth: "280px", margin: "0 auto 24px", lineHeight: 1.6 }}>
                Sélectionnez votre profil pour être redirigé vers le bon service.
              </p>
              <button onClick={() => setStep("type")} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "16px", borderRadius: "16px", border: "none", background: "linear-gradient(135deg, #F5A623, #e8950f)", color: "#1a1200", fontWeight: "900", fontSize: "15px", cursor: "pointer", fontFamily: "var(--font-sora), sans-serif", boxShadow: "0 6px 20px rgba(245,166,35,0.4)", letterSpacing: "0.3px" }}>
                Démarrer
                <IconArrowRight size={16} />
              </button>
            </div>

            {/* ── Tuiles info ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
              {[
                { IconComp: IconZap, titre: "Réponse rapide", desc: "24–48h ouvrées" },
                { IconComp: IconGlobe, titre: "Support international", desc: "Guinée & New York" },
              ].map(info => (
                <div key={info.titre} style={{ background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: "16px", padding: "16px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}><info.IconComp size={22} color="#1a1200" /></div>
                  <div style={{ color: "#1a1200", fontSize: "12px", fontWeight: "800", marginBottom: "2px" }}>{info.titre}</div>
                  <div style={{ color: "#8a8a8a", fontSize: "11px" }}>{info.desc}</div>
                </div>
              ))}
            </div>

            {/* ── Email direct ── */}
            <div style={{ background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: "16px", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "2px" }}>EMAIL DIRECT</div>
                <div style={{ color: "#1a1200", fontSize: "13px", fontWeight: "700" }}>yelen224gn@gmail.com</div>
              </div>
              <a href="mailto:yelen224gn@gmail.com" style={{ display: "flex", alignItems: "center", gap: "6px", background: "#F5A623", color: "#1a1200", fontSize: "12px", fontWeight: "800", padding: "9px 16px", borderRadius: "12px", textDecoration: "none", boxShadow: "0 3px 10px rgba(245,166,35,0.3)", fontFamily: "var(--font-sora), sans-serif", flexShrink: 0 }}>
                Écrire
                <IconArrowRight size={13} />
              </a>
            </div>
          </div>

          {/* ── Footer (retour Bryan 24/09/2026 : uniquement sur l'accueil) ── */}
          <footer style={{ marginTop: "8px", padding: "20px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center", marginBottom: "12px" }}>
              <a href="/mentions-legales" style={{ color: "#5a5a5a", fontSize: "12px", fontWeight: "600", textDecoration: "none" }}>Mentions légales</a>
              <a href="/confidentialite" style={{ color: "#5a5a5a", fontSize: "12px", fontWeight: "600", textDecoration: "none" }}>Confidentialité</a>
              <a href="/cgu" style={{ color: "#5a5a5a", fontSize: "12px", fontWeight: "600", textDecoration: "none" }}>CGU</a>
              <a href="/politique-cookies" style={{ color: "#5a5a5a", fontSize: "12px", fontWeight: "600", textDecoration: "none" }}>Cookies</a>
            </div>
            <p style={{ textAlign: "center", color: "#8a8a8a", fontSize: "11px", margin: 0 }}>
              © {new Date().getFullYear()} Yelen224. Tous droits réservés.
            </p>
          </footer>
        </div>
      )}

      {step === "type" && (
        <div className="fade-up" style={{ padding: "24px 20px 20px" }}>
          <button onClick={() => setStep("welcome")} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: "12px", padding: "8px 14px", color: "#1a1200", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "var(--font-sora), sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "16px" }}>
            <IconArrowLeft size={14} />
            Retour
          </button>
          <h2 style={{ color: "#1a1200", fontSize: "20px", fontWeight: "900", margin: "0 0 6px" }}>Qui êtes-vous ?</h2>
          <p style={{ color: "#5a5a5a", fontSize: "13px", margin: "0 0 20px", lineHeight: 1.6 }}>
            Sélectionnez votre profil pour nous aider à diriger votre message vers le bon service.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {FORM_TYPES.map(ft => (
              <button key={ft.id} onClick={() => choisirType(ft.id)} style={{ padding: "14px 12px", borderRadius: "16px", border: "1.5px solid rgba(0,0,0,0.08)", background: "#FFFFFF", cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", transition: "all 0.15s ease" }}>
                <div style={{ marginBottom: "6px" }}><ft.IconComp size={22} color="#1a1200" /></div>
                <div style={{ color: "#1a1200", fontSize: "12px", fontWeight: "800", marginBottom: "3px", lineHeight: 1.2 }}>{ft.label}</div>
                <div style={{ color: "#5a5a5a", fontSize: "10px", lineHeight: 1.4 }}>{ft.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "form" && (
        <div className="fade-up" style={{ padding: "24px 20px 20px" }}>
          {(status === "idle" || status === "sending" || status === "error") && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "16px" }}>
              <button onClick={() => setStep("type")} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: "12px", padding: "8px 14px", color: "#1a1200", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "var(--font-sora), sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <IconArrowLeft size={14} />
                Changer de type
              </button>
              {currentType && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "12px", padding: "8px 14px" }}>
                  <currentType.IconComp size={14} color="#1a1200" />
                  <span style={{ color: "#1a1200", fontSize: "12px", fontWeight: "800" }}>{currentType.label}</span>
                </div>
              )}
            </div>
          )}

          {status === "success" ? (
            <div className="fade-up" style={{ background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: "24px", padding: "40px 24px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><IconCheck size={48} color="#22c55e" strokeWidth={1.6} /></div>
              <h3 style={{ color: "#1a1200", fontSize: "18px", fontWeight: "900", margin: "0 0 8px" }}>Message envoyé !</h3>
              <p style={{ color: "#5a5a5a", fontSize: "13px", maxWidth: "260px", margin: "0 auto 20px", lineHeight: 1.6 }}>Notre équipe vous répond sous 24–48h ouvrées.</p>
              <button onClick={recommencer} style={{ background: "#F5A623", color: "#1a1200", fontWeight: "800", fontSize: "14px", padding: "13px 28px", borderRadius: "14px", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(245,166,35,0.35)", fontFamily: "var(--font-sora), sans-serif" }}>
                Nouveau message
              </button>
            </div>
          ) : status === "success_verification_pending" ? (
            <div className="fade-up" style={{ background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: "24px", padding: "40px 24px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><IconMail size={48} color="#1a1200" strokeWidth={1.6} /></div>
              <h3 style={{ color: "#1a1200", fontSize: "18px", fontWeight: "900", margin: "0 0 8px" }}>Vérifiez votre boîte mail</h3>
              <p style={{ color: "#5a5a5a", fontSize: "13px", maxWidth: "280px", margin: "0 auto 20px", lineHeight: 1.6 }}>
                Un email a été envoyé à <strong>{emailEnvoye}</strong>. Cliquez sur le lien qu&apos;il contient pour activer votre demande — elle ne sera transmise à notre équipe qu&apos;après cette étape.
              </p>
              <button onClick={recommencer} style={{ background: "#F5A623", color: "#1a1200", fontWeight: "800", fontSize: "14px", padding: "13px 28px", borderRadius: "14px", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(245,166,35,0.35)", fontFamily: "var(--font-sora), sans-serif" }}>
                Nouveau message
              </button>
            </div>
          ) : (
            <form id="contact-form" noValidate onSubmit={handleSubmit} className="fade-up" style={{ maxWidth: "860px", margin: "0 auto", background: "#FFFFFF", padding: "4px 0 96px" }}>

              <div className="hp-field" aria-hidden="true">
                <input tabIndex={-1} name="_hp" value={honeypot} onChange={e => setHoneypot(e.target.value)} autoComplete="off" />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ width: "3px", height: "20px", borderRadius: "2px", background: "#1a1200", flexShrink: 0 }} />
                <div>
                  <div style={{ color: "#1a1200", fontSize: "15px", fontWeight: "900", display: "flex", alignItems: "center", gap: "6px" }}>
                    {currentType && <currentType.IconComp size={16} color="#1a1200" />}
                    {currentType?.label}
                  </div>
                  <div style={{ color: "#8a8a8a", fontSize: "11px" }}>{currentType?.desc}</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>PRÉNOM *</label>
                    <input name="prenom" value={formData.prenom} onChange={handleChange} placeholder="Alpha" style={champStyle("prenom")} />
                    <ChampMessage name="prenom"/>
                  </div>
                  <div>
                    <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>NOM *</label>
                    <input name="nom" value={formData.nom} onChange={handleChange} placeholder="Diallo" style={champStyle("nom")} />
                    <ChampMessage name="nom"/>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>EMAIL *</label>
                  <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="alpha@exemple.com" style={champStyle("email")} />
                  <ChampMessage name="email"/>
                </div>

                <div>
                  <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>TÉLÉPHONE</label>
                  <input name="telephone" type="tel" value={formData.telephone} onChange={handleChange} placeholder="+224 6xx xx xx xx" style={champStyle("telephone")} />
                  <ChampMessage name="telephone"/>
                </div>

                {activeForm === "institution" && (
                  <>
                    <div>
                      <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>NOM DE L&apos;INSTITUTION *</label>
                      <input name="nomInstitution" value={formData.nomInstitution} onChange={handleChange} placeholder="Hôpital National Donka" style={champStyle("nomInstitution")} />
                      <ChampMessage name="nomInstitution"/>
                    </div>
                    <div>
                      <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>TYPE D&apos;INSTITUTION *</label>
                      <select name="typeInstitution" value={formData.typeInstitution} onChange={handleChange} style={champStyle("typeInstitution")}>
                        <option value="">Sélectionner...</option>
                        <option>Hôpital / Clinique</option>
                        <option>École / Université</option>
                        <option>Mairie / Administration</option>
                        <option>Banque / Microfinance</option>
                        <option>Ambassade / Consulat</option>
                        <option>ONG / Association</option>
                        <option>Tribunal / Justice</option>
                        <option>Autre</option>
                      </select>
                      <ChampMessage name="typeInstitution"/>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>VILLE *</label>
                        <input name="ville" value={formData.ville} onChange={handleChange} placeholder="Conakry" style={champStyle("ville")} />
                        <ChampMessage name="ville"/>
                      </div>
                      <div>
                        <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>PAYS *</label>
                        <input name="pays" value={formData.pays} onChange={handleChange} placeholder="Guinée" style={champStyle("pays")} />
                        <ChampMessage name="pays"/>
                      </div>
                    </div>
                  </>
                )}

                {activeForm === "presse" && (
                  <>
                    <div>
                      <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>MÉDIA / CHAÎNE *</label>
                      <input name="media" value={formData.media} onChange={handleChange} placeholder="RFI, BBC Afrique..." style={champStyle("media")} />
                      <ChampMessage name="media"/>
                    </div>
                    <div>
                      <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>PUBLICATION / ÉMISSION</label>
                      <input name="publication" value={formData.publication} onChange={handleChange} placeholder="Journal du Jour" style={inp} />
                    </div>
                  </>
                )}

                {activeForm === "support" && (
                  <>
                    <div>
                      <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>TYPE DE PROBLÈME *</label>
                      <select name="typeProbleme" value={formData.typeProbleme} onChange={handleChange} style={champStyle("typeProbleme")}>
                        <option value="">Sélectionner...</option>
                        <option>Connexion / Authentification</option>
                        <option>Prise de rendez-vous</option>
                        <option>Affichage / Interface</option>
                        <option>Notification / Email</option>
                        <option>Données incorrectes</option>
                        <option>Autre bug</option>
                      </select>
                      <ChampMessage name="typeProbleme"/>
                    </div>
                    <div>
                      <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>URL DE LA PAGE</label>
                      <input name="urlPage" value={formData.urlPage} onChange={handleChange} placeholder="https://yelen224.com/..." style={inp} />
                    </div>
                  </>
                )}

                <div>
                  <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>SUJET *</label>
                  <input name="sujet" value={formData.sujet} onChange={handleChange} placeholder="Objet de votre message" style={champStyle("sujet")} />
                  <ChampMessage name="sujet"/>
                </div>

                {activeForm !== "institution" && (
                  <div>
                    <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>ORGANISATION (optionnel)</label>
                    <input name="organisation" value={formData.organisation} onChange={handleChange} placeholder="Ministère, ONG, Entreprise..." style={inp} />
                  </div>
                )}

                <div>
                  <label style={{ display: "block", color: "#8a8a8a", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", marginBottom: "6px" }}>MESSAGE *</label>
                  <textarea name="message" value={formData.message} onChange={handleChange} rows={5} placeholder="Décrivez votre demande en détail..." style={{ ...champStyle("message"), resize: "vertical", minHeight: "120px" }} />
                  <ChampMessage name="message"/>
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "12px", padding: "12px" }}>
                  <span style={{ flexShrink: 0, display: "flex", marginTop: "1px" }}><IconLock size={14} color="#5a5a5a" /></span>
                  <p style={{ color: "#5a5a5a", fontSize: "11px", margin: 0, lineHeight: 1.6 }}>
                    Données protégées · jamais partagées avec des tiers. Réponse sous 24–48h ouvrées.
                  </p>
                </div>

                <div
                  onClick={() => { setAccepteConditions(v => !v); setConditionsErreur(false); }}
                  style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px", background: "rgba(0,0,0,0.03)", border: `1px solid ${conditionsErreur ? "#F5A623" : "rgba(0,0,0,0.08)"}`, borderRadius: "12px", cursor: "pointer" }}
                >
                  <div style={{ width: "20px", height: "20px", borderRadius: "6px", background: accepteConditions ? "#F5A623" : "transparent", border: `2px solid ${accepteConditions ? "#F5A623" : "rgba(0,0,0,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px", transition: "all 0.15s" }}>
                    {accepteConditions && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a1200" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  <p style={{ color: "#5a5a5a", fontSize: "11px", margin: 0, lineHeight: 1.6 }}>
                    J&apos;accepte les{" "}
                    <a href="/cgu" onClick={e => e.stopPropagation()} style={{ color: "#1a1200", fontWeight: "700", textDecoration: "underline" }}>Conditions d&apos;utilisation</a>
                    {" "}et la{" "}
                    <a href="/confidentialite" onClick={e => e.stopPropagation()} style={{ color: "#1a1200", fontWeight: "700", textDecoration: "underline" }}>Politique de confidentialité</a>
                    {" "}de Yelen224.
                  </p>
                </div>
                {conditionsErreur && (
                  <p style={{ color: "#C97A0E", fontSize: "11px", fontWeight: "700", margin: "-8px 0 0" }}>Merci d&apos;accepter les conditions avant l&apos;envoi.</p>
                )}

                {status === "error" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderRadius: "12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626", fontSize: "13px", fontWeight: "600" }}>
                    <IconError size={16} color="#dc2626" />
                    <span>Erreur. Réessayez ou écrivez à yelen224gn@gmail.com</span>
                  </div>
                )}

              </div>
            </form>
          )}
        </div>
      )}

      {/* Bouton d'envoi fixe (retour Bryan 24/09/2026, PC + mobile) — hors
          du <form>, relié via l'attribut form="contact-form" (HTML5
          standard) pour continuer à déclencher handleSubmit au clic. */}
      {step === "form" && status !== "success" && status !== "success_verification_pending" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(0,0,0,0.08)", padding: "12px 20px calc(12px + env(safe-area-inset-bottom, 0px))", zIndex: 20 }}>
          <div style={{ maxWidth: "860px", margin: "0 auto" }}>
            <button type="submit" form="contact-form" disabled={status === "sending"} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "16px", borderRadius: "26px", border: "none", background: status === "sending" ? "rgba(200,140,0,0.3)" : "linear-gradient(135deg, #F5A623, #e8950f)", color: status === "sending" ? "#8B6914" : "#1a1200", fontWeight: "900", fontSize: "15px", cursor: status === "sending" ? "not-allowed" : "pointer", fontFamily: "var(--font-sora), sans-serif", boxShadow: status === "sending" ? "none" : "0 6px 20px rgba(245,166,35,0.4)", letterSpacing: "0.3px", transition: "all 0.15s ease" }}>
              {status === "sending" ? "Envoi en cours..." : (<>Envoyer le message <IconArrowRight size={16} /></>)}
            </button>
          </div>
        </div>
      )}

      <div style={{ height: "env(safe-area-inset-bottom, 40px)" }} />
    </div>
  );
}
