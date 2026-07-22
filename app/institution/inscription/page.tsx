"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { YelenLogo } from "@/components/YelenLogo";
import { VILLES_GUINEE } from "@/lib/villes";

// ═══════════════════════════════════════════════════════════
// DEV CONFIG — retirer avant mise en prod
// ═══════════════════════════════════════════════════════════
const DEV_MODE = true;         // ← false en production
const DEV_OTP  = "123456";     // ← code fictif accepté en dev

// ═══════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════
const C = {
  gold:"#F5A623",goldD:"#C8940A",goldL:"#FDE68A",goldBg:"#FFFBEB",goldBg2:"#FEF3C7",
  white:"#FFFFFF",dark:"#1C1400",dark2:"#3D2E00",gray:"#92836A",gray2:"#C4B896",
  gray3:"#EDE8D8",red:"#DC2626",redL:"#FEF2F2",green:"#16A34A",greenL:"#F0FDF4",
  border:"rgba(245,166,35,0.2)",shadow:"0 4px 24px rgba(245,166,35,0.15)",
};

// ═══════════════════════════════════════════════════════════
// SECURITY: Math Challenge
// ═══════════════════════════════════════════════════════════
function generateChallenge() {
  const ops = [
    () => { const a=Math.floor(Math.random()*20+5),b=Math.floor(Math.random()*15+3); return{q:`${a} + ${b}`,a:String(a+b)}; },
    () => { const a=Math.floor(Math.random()*20+15),b=Math.floor(Math.random()*10+2); return{q:`${a} - ${b}`,a:String(a-b)}; },
    () => { const a=Math.floor(Math.random()*8+2),b=Math.floor(Math.random()*6+2); return{q:`${a} × ${b}`,a:String(a*b)}; },
    () => { const b=[2,3,4,5][Math.floor(Math.random()*4)],a=b*Math.floor(Math.random()*8+2); return{q:`${a} ÷ ${b}`,a:String(a/b)}; },
  ];
  return ops[Math.floor(Math.random()*ops.length)]();
}

// ═══════════════════════════════════════════════════════════
// TAXONOMIE — secteur + statut juridique (remplace l'ancienne
// liste plate CATEGORIES). Valeurs alignées sur les CHECK
// constraints de institutions.secteur / .statut_juridique.
// ═══════════════════════════════════════════════════════════
const SECTEURS = [
  { id: "sante",             label: "Santé" },
  { id: "administratif",     label: "Administratif" },
  { id: "financier",         label: "Financier" },
  { id: "juridique",         label: "Juridique" },
  { id: "beaute_bien_etre",  label: "Beauté / Bien-être" },
  { id: "commerce",          label: "Commerce" },
  { id: "artisanat",         label: "Artisanat" },
  { id: "services_divers",   label: "Services divers" },
];

// SVG dédiés par secteur — pas d'emoji, cohérent avec le reste de l'app
// (icônes stroke, currentColor, même famille visuelle que le header/OTP).
function SecteurIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "sante": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>;
    case "administratif": return <svg {...p}><path d="M4 21V10l8-6 8 6v11M9 21v-6h6v6"/></svg>;
    case "financier": return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>;
    case "juridique": return <svg {...p}><path d="M12 3v18M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0zM5 7h14M8 21h8"/></svg>;
    case "beaute_bien_etre": return <svg {...p}><path d="M12 3l1.8 5.6L19 10l-5.2 1.4L12 17l-1.8-5.6L5 10l5.2-1.4z"/></svg>;
    case "commerce": return <svg {...p}><path d="M6 2l1.5 5M18 2l-1.5 5M3 7h18l-1.4 13a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z"/></svg>;
    case "artisanat": return <svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-8 8l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a6 6 0 0 1 8-8z"/></svg>;
    default: return <svg {...p}><circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/></svg>;
  }
}

const STATUTS_JURIDIQUES = [
  { id: "public",              label: "Public",               description: "Institution publique ou administration d'État" },
  { id: "prive_formel",        label: "Privé formel",         description: "Entreprise ou société enregistrée" },
  { id: "liberal",             label: "Libéral",              description: "Profession libérale réglementée (médecin, avocat, etc.)" },
  { id: "individuel_informel", label: "Individuel / informel", description: "Activité individuelle non enregistrée formellement" },
];

const DOCUMENTS_PAR_STATUT: Record<string, string[]> = {
  public: ["Document officiel de nomination ou d'habilitation"],
  prive_formel: ["RCCM (Registre du Commerce)", "Pièce d'identité du responsable"],
  liberal: ["Diplôme ou inscription à l'ordre professionnel", "Pièce d'identité"],
  individuel_informel: ["Pièce d'identité", "Preuve de domicile"],
};

const SERVICES_PAR_SECTEUR: Record<string, string[]> = {
  sante: ["Consultation générale", "Consultation spécialisée", "Urgences", "Vaccination", "Analyses / Laboratoire"],
  administratif: ["Acte d'état civil", "Carte d'identité / Passeport", "Permis", "Légalisation de documents"],
  financier: ["Ouverture de compte", "Demande de crédit", "Transfert d'argent", "Conseil financier"],
  juridique: ["Consultation juridique", "Dépôt de dossier", "Audience", "Médiation"],
  beaute_bien_etre: ["Coiffure", "Soins esthétiques", "Massage", "Spa"],
  commerce: ["Vente en boutique", "Retrait de commande", "Conseil produit", "Livraison"],
  artisanat: ["Commande sur mesure", "Réparation", "Devis", "Retrait d'ouvrage"],
  services_divers: ["Consultation", "Prestation à domicile", "Rendez-vous conseil", "Autre"],
};

const GESTION_OPTIONS = [
  { id: "papier", label: "Papier / carnet" },
  { id: "excel", label: "Excel / tableur" },
  { id: "whatsapp_appels", label: "WhatsApp / appels" },
  { id: "autre", label: "Autre méthode" },
];

const VOLUME_OPTIONS = [
  { id: "0-10", label: "0 à 10 rendez-vous par jour" },
  { id: "10-50", label: "10 à 50 rendez-vous par jour" },
  { id: "50+", label: "Plus de 50 rendez-vous par jour" },
];

const DISPOSITIF_OPTIONS = [
  { id: "smartphone", label: "Smartphone" },
  { id: "ordinateur", label: "Ordinateur" },
  { id: "les_deux", label: "Les deux" },
];

const STEP_ORDER = ["phone", "otp", "personnel", "entreprise", "sondage", "apercu"] as const;
const STEP_LABELS = ["Numéro", "Vérification", "Responsable", "Établissement", "Personnalisation", "Aperçu"];

type Step = typeof STEP_ORDER[number] | "success";

export default function InstitutionInscription() {
  const router = useRouter();
  const [step, setStep]               = useState<Step>("phone");
  const [phone, setPhone]             = useState("");
  const [otp, setOtp]                 = useState(["","","","","",""]);
  const [verifiedCode, setVerifiedCode] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");
  const [cgu, setCgu]                 = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [attempts, setAttempts]       = useState(0);
  const [blocked, setBlocked]         = useState(false);
  const [blockTimer, setBlockTimer]   = useState(0);
  const [challenge, setChallenge]     = useState(generateChallenge);
  const [chalAns, setChalAns]         = useState("");
  const [chalOk, setChalOk]           = useState(false);
  const [honeypot, setHoneypot]       = useState("");
  const otpRefs = useRef<(HTMLInputElement|null)[]>([]);
  const nameFieldRef = useRef<HTMLInputElement>(null);

  // Écran A — responsable
  const [formPersonnel, setFormPersonnel] = useState({ prenom: "", nom: "", role: "" });

  // Écran B — établissement
  const [formEntreprise, setFormEntreprise] = useState({
    name: "", secteur: "", statutJuridique: "", ville: "", email: "", website: "", description: "",
  });

  // Écran C — sondage de personnalisation
  const [formSondage, setFormSondage] = useState({
    gestionActuelle: "", volumeRdv: "", typeService: "", dispositif: "",
  });
  const [sondageSubStep, setSondageSubStep] = useState(0); // question affichée 1 par 1

  // Écran B — popups secteur / statut juridique (au lieu de listes inline)
  const [secteurModalOpen, setSecteurModalOpen] = useState(false);
  const [statutModalOpen, setStatutModalOpen] = useState(false);

  useEffect(() => { setChalOk(chalAns.trim() === challenge.a); }, [chalAns, challenge]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer(v => Math.max(v-1,0)), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  useEffect(() => {
    if (!blocked || blockTimer <= 0) { if (blocked && blockTimer === 0) setBlocked(false); return; }
    const t = setTimeout(() => setBlockTimer(b => b-1), 1000);
    return () => clearTimeout(t);
  }, [blocked, blockTimer]);

  // ── ÉTAPE 1 : Vérifier numéro + envoyer OTP ──
  async function handlePhoneSubmit() {
    if (honeypot) return;
    setError("");
    if (!chalOk) { setError("Répondez à la question de sécurité."); return; }
    if (!cgu)    { setError("Acceptez les conditions d'utilisation."); return; }
    if (blocked) { setError(`Trop de tentatives. Réessayez dans ${blockTimer} secondes.`); return; }

    // Format guinéen réel : 9 chiffres après +224 (ex: 620 00 00 00). On
    // tolère un "0" initial que les gens tapent par habitude locale
    // (ex: 0620000000) en le retirant avant de compter — mais le résultat
    // doit toujours faire exactement 9 chiffres, ni plus ni moins.
    const digitsOnly = phone.replace(/[\s\-]/g, "");
    const normalized = digitsOnly.replace(/^0/, "");
    if (normalized.length !== 9) {
      setError(`Le numéro doit contenir exactement 9 chiffres après +224 (format : 6XX XX XX XX). Actuellement : ${normalized.length} chiffre${normalized.length > 1 ? "s" : ""}.`);
      return;
    }

    const n = attempts + 1;
    setAttempts(n);
    if (n > 5) { setBlocked(true); setBlockTimer(300); setError("Trop de tentatives. Bloqué 5 minutes."); return; }

    setLoading(true);
    const fullPhone = "+224" + normalized;

    // Vérifier si déjà inscrit
    const { data: existing } = await supabase
      .from("institutions")
      .select("id")
      .eq("phone", fullPhone)
      .maybeSingle();

    if (existing) {
      setError("Ce numéro est déjà enregistré. Connectez-vous à la place.");
      setLoading(false);
      return;
    }

    localStorage.setItem("yelen_reg_phone", fullPhone);

    try {
      const res = await fetch("/api/institution/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur envoi. Réessayez.");
        setLoading(false);
        return;
      }

      setStep("otp");
      setResendTimer(60);
      setSuccess(
        data.devMode
          ? `[DEV] Code fictif : ${data.code} — SMS désactivé`
          : `Code envoyé au ${fullPhone}`
      );
    } catch {
      setError("Erreur réseau. Réessayez.");
    }
    setLoading(false);
  }

  // ── ÉTAPE 2 : Vérifier OTP ──
  async function handleVerifyOtp() {
    const code = otp.join("");
    if (code.length < 6) { setError("Entrez les 6 chiffres."); return; }
    if (blocked) { setError(`Trop de tentatives. Réessayez dans ${blockTimer} secondes.`); return; }

    setLoading(true);
    setError("");

    const savedPhone = localStorage.getItem("yelen_reg_phone") || "";

    try {
      const res = await fetch("/api/institution/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: savedPhone, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "LOCKED") {
          setBlocked(true); setBlockTimer(300);
          setError(data.error || "Trop d'erreurs. Bloqué 5 min.");
        } else {
          const n = attempts + 1; setAttempts(n);
          setError(data.error || "Code incorrect.");
        }
        setLoading(false);
        return;
      }

      setVerifiedCode(code);
      setStep("personnel");
      setSuccess("");
    } catch {
      setError("Erreur réseau.");
    }
    setLoading(false);
  }

  // ── ÉTAPE 3 : Responsable ──
  function handlePersonnelNext() {
    setError("");
    if (!formPersonnel.prenom.trim()) { setError("Le prénom est requis."); return; }
    if (!formPersonnel.nom.trim())    { setError("Le nom est requis."); return; }
    setStep("entreprise");
  }

  // ── ÉTAPE 4 : Établissement ──
  function handleEntrepriseNext() {
    setError("");
    if (!formEntreprise.name.trim())          { setError("Le nom de l'institution est requis."); return; }
    if (!formEntreprise.secteur)              { setError("Sélectionnez un secteur d'activité."); return; }
    if (!formEntreprise.statutJuridique)      { setError("Sélectionnez un statut juridique."); return; }
    if (!formEntreprise.ville.trim())         { setError("La ville est requise."); return; }
    setStep("sondage");
  }

  // ── ÉTAPE 5 : Sondage — une question à la fois, avance automatique dès
  // qu'on répond (même logique que la saisie OTP plus haut). Impossible
  // d'atteindre la question suivante sans répondre à la précédente : les
  // 4 questions sont de fait obligatoires par construction de l'écran.
  function handleSondageAnswer(key: keyof typeof formSondage, value: string, isLast: boolean) {
    setFormSondage(f => ({ ...f, [key]: value }));
    setTimeout(() => {
      if (isLast) setStep("apercu");
      else setSondageSubStep(s => s + 1);
    }, 250);
  }

  // ── ÉTAPE 6 : Création finale ──
  async function handleFinalSubmit() {
    setError("");
    setLoading(true);
    const savedPhone = localStorage.getItem("yelen_reg_phone") || "";

    try {
      const res = await fetch("/api/institution/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: savedPhone,
          code: verifiedCode,
          responsable_prenom: formPersonnel.prenom.trim(),
          responsable_nom: formPersonnel.nom.trim(),
          responsable_role: formPersonnel.role.trim() || undefined,
          name: formEntreprise.name.trim(),
          secteur: formEntreprise.secteur,
          statut_juridique: formEntreprise.statutJuridique,
          ville: formEntreprise.ville.trim(),
          email: formEntreprise.email.trim() || undefined,
          website: formEntreprise.website.trim() || undefined,
          description: formEntreprise.description.trim() || undefined,
          gestion_actuelle: formSondage.gestionActuelle || undefined,
          volume_rdv_estime: formSondage.volumeRdv || undefined,
          type_service_souhaite: formSondage.typeService || undefined,
          dispositif_principal: formSondage.dispositif || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la création.");
        setLoading(false);
        return;
      }

      localStorage.setItem("yelen224_institution_id", data.institution.id);
      localStorage.setItem("yelen224_inst_name", data.institution.name);
      localStorage.setItem("yelen224_inst_auth", "true");
      localStorage.setItem("yelen224_inst_auth_ts", String(Date.now()));
      localStorage.removeItem("yelen_reg_phone");

      setStep("success");
      setTimeout(() => router.push(`/institution/${data.institution.id}/dashboard`), 2000);
    } catch {
      setError("Erreur réseau.");
    }
    setLoading(false);
  }

  // ── OTP input handlers ──
  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n=[...otp]; n[i]=val.slice(-1); setOtp(n);
    if (val && i < 5) otpRefs.current[i+1]?.focus();
    if (n.every(d=>d) && n.join("").length===6) setTimeout(handleVerifyOtp, 200);
  };
  const handleOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key==="Backspace" && !otp[i] && i>0) otpRefs.current[i-1]?.focus();
  };

  // ── CSS ──
  const css = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    html,body{background:${C.goldBg};overflow-x:hidden}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes successPop{0%{transform:scale(0.8)}60%{transform:scale(1.1)}100%{transform:scale(1)}}
    @keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    .tap{transition:opacity .12s,transform .12s;cursor:pointer;touch-action:manipulation;user-select:none}
    .tap:active{opacity:.75;transform:scale(.97)}
    input::placeholder,textarea::placeholder{color:${C.gray2}}
    .inp:focus,.sel:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(245,166,35,0.12)!important;outline:none}
    .otp-inp:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(245,166,35,0.15)!important;outline:none}
    select{appearance:none;-webkit-appearance:none}
  `;

  const Spinner = () => (
    <div style={{width:"18px",height:"18px",border:"2.5px solid rgba(28,20,0,0.2)",borderTopColor:C.dark,borderRadius:"50%",animation:"spin 0.7s linear infinite",flexShrink:0}}/>
  );

  const inputStyle: React.CSSProperties = {
    width:"100%",padding:"13px 16px",borderRadius:"12px",
    border:`1.5px solid ${C.border}`,backgroundColor:C.white,
    color:C.dark,fontSize:"15px",fontWeight:"600",transition:"all 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    color:C.dark2,fontSize:"11px",fontWeight:"800",letterSpacing:"0.8px",
    textTransform:"uppercase",display:"block",marginBottom:"6px",
  };

  const ctaStyle = (disabled: boolean): React.CSSProperties => ({
    width:"100%",padding:"16px",borderRadius:"14px",border:"none",
    background:disabled?C.gray3:`linear-gradient(135deg,${C.gold},${C.goldD})`,
    color:disabled?C.gray:C.dark,fontSize:"16px",fontWeight:"800",
    cursor:disabled?"not-allowed":"pointer",
    display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",
    boxShadow:disabled?"none":`0 8px 24px ${C.gold}40`,transition:"all 0.2s",
  });

  const ErrorBanner = ({ msg }: { msg: string }) => (
    <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 16px",backgroundColor:C.redL,border:`1px solid ${C.red}25`,borderLeft:`3px solid ${C.red}`,borderRadius:"12px",marginBottom:"16px"}}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style={{color:C.red,fontSize:"13px",fontWeight:"600"}}>{msg}</span>
    </div>
  );

  const ChoiceGroup = ({ options, value, onChange }: { options: {id:string;label:string}[]; value:string; onChange:(id:string)=>void }) => (
    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {options.map(o => {
        const selected = value === o.id;
        return (
          <div key={o.id} onClick={()=>onChange(o.id)} className="tap"
            style={{
              padding:"13px 16px",borderRadius:"12px",cursor:"pointer",
              border:`1.5px solid ${selected?C.gold:C.border}`,
              backgroundColor:selected?`${C.gold}12`:C.white,
              display:"flex",alignItems:"center",justifyContent:"space-between",
              transition:"all 0.2s",
            }}>
            <span style={{color:selected?C.dark:C.dark2,fontSize:"13.5px",fontWeight:selected?"800":"600"}}>{o.label}</span>
            {selected && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
        );
      })}
    </div>
  );

  // Popup bottom-sheet réutilisable — secteur et statut juridique s'y
  // sélectionnent au lieu de s'afficher en liste inline dans l'écran
  // principal (évite que l'écran s'allonge verticalement à chaque choix).
  const SelectModal = ({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) => {
    if (!open) return null;
    return (
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(28,20,0,0.55)",zIndex:300,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.white,borderRadius:"24px 24px 0 0",maxHeight:"80vh",overflowY:"auto",animation:"sheetUp 0.3s cubic-bezier(0.34,1.56,0.64,1)"}}>
          <div style={{width:"36px",height:"4px",background:C.gray3,borderRadius:"100px",margin:"14px auto 0"}}/>
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{color:C.dark,fontSize:"16px",fontWeight:"900"}}>{title}</span>
            <button onClick={onClose} className="tap" style={{width:"28px",height:"28px",borderRadius:"50%",background:C.goldBg2,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div style={{padding:"16px 20px 28px"}}>{children}</div>
        </div>
      </div>
    );
  };

  const currentStepIndex = STEP_ORDER.indexOf(step as typeof STEP_ORDER[number]);
  const phoneDigitsNormalized = phone.replace(/[\s\-]/g,"").replace(/^0/,"");

  const SONDAGE_STEPS = [
    { key: "gestionActuelle" as const, label: "Comment gérez-vous vos rendez-vous aujourd'hui ?", options: GESTION_OPTIONS },
    { key: "volumeRdv" as const, label: "Combien de rendez-vous par jour environ ?", options: VOLUME_OPTIONS },
    { key: "typeService" as const, label: "Quel type de service voulez-vous ouvrir ?", options: (SERVICES_PAR_SECTEUR[formEntreprise.secteur] || SERVICES_PAR_SECTEUR.services_divers).map(s => ({ id: s, label: s })) },
    { key: "dispositif" as const, label: "Vous gérerez principalement depuis", options: DISPOSITIF_OPTIONS },
  ];

  return (
    <div style={{minHeight:"100svh",background:`linear-gradient(160deg,${C.goldBg} 0%,${C.goldBg2} 50%,#FFF7E6 100%)`,fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif",color:C.dark}}>
      <style>{css}</style>

      {/* Motif décoratif */}
      <div style={{position:"fixed",inset:0,backgroundImage:`radial-gradient(${C.gold}12 1px,transparent 1px)`,backgroundSize:"28px 28px",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",top:"-80px",right:"-80px",width:"350px",height:"350px",borderRadius:"50%",background:`radial-gradient(circle,${C.gold}15 0%,transparent 65%)`,pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:"-60px",left:"-60px",width:"280px",height:"280px",borderRadius:"50%",background:`radial-gradient(circle,${C.gold}10 0%,transparent 65%)`,pointerEvents:"none",zIndex:0}}/>

      {/* HEADER */}
      <header style={{position:"relative",zIndex:10,padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,backgroundColor:"rgba(255,251,235,0.85)",backdropFilter:"blur(20px)"}}>
        <Link href="/" style={{display:"flex",alignItems:"center",gap:"10px",textDecoration:"none"}}>
          <div style={{width:"36px",height:"36px",background:`linear-gradient(135deg,${C.gold},${C.goldD})`,borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 12px ${C.gold}40`}}>
            <YelenLogo size={18} color={C.dark}/>
          </div>
          <div>
            <div style={{color:C.dark,fontSize:"15px",fontWeight:"900",letterSpacing:"0.5px",lineHeight:1}}>YELEN224</div>
            <div style={{color:C.gold,fontSize:"9px",fontWeight:"700",letterSpacing:"1.5px",textTransform:"uppercase"}}>Espace Institution</div>
          </div>
        </Link>
        <Link href="/institution/connexion" className="tap" style={{color:C.dark,fontSize:"13px",fontWeight:"700",textDecoration:"none",padding:"8px 16px",borderRadius:"20px",border:`1.5px solid ${C.gold}`,backgroundColor:"transparent"}}>
          Se connecter
        </Link>
      </header>

      <main style={{position:"relative",zIndex:1,maxWidth:"480px",margin:"0 auto",padding:"32px 20px 60px"}}>

        {/* ── Stepper ── */}
        {step !== "success" && (
          <div style={{marginBottom:"28px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"0",marginBottom:"10px"}}>
              {STEP_ORDER.map((s, i) => {
                const done = currentStepIndex > i;
                const active = currentStepIndex === i;
                return (
                  <div key={s} style={{display:"flex",alignItems:"center",flex:i<STEP_ORDER.length-1?1:"auto"}}>
                    <div style={{width:"22px",height:"22px",borderRadius:"50%",backgroundColor:done||active?C.gold:"transparent",border:`2px solid ${done||active?C.gold:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.3s"}}>
                      {done
                        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <span style={{color:active?C.dark:C.gray2,fontSize:"10px",fontWeight:"800"}}>{i+1}</span>
                      }
                    </div>
                    {i<STEP_ORDER.length-1 && <div style={{flex:1,height:"2px",backgroundColor:done?C.gold:C.gray3,margin:"0 3px",transition:"background-color 0.3s"}}/>}
                  </div>
                );
              })}
            </div>
            <p style={{color:C.gold,fontSize:"11px",fontWeight:"800",letterSpacing:"1px",textTransform:"uppercase",margin:0}}>
              Étape {currentStepIndex+1} / {STEP_ORDER.length} — {STEP_LABELS[currentStepIndex]}
            </p>
          </div>
        )}

        {/* ═══ STEP: PHONE ═══ */}
        {step==="phone" && (
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{textAlign:"center",marginBottom:"28px"}}>
              <h1 style={{color:C.dark,fontSize:"26px",fontWeight:"900",letterSpacing:"-0.5px",marginBottom:"6px"}}>Créer un compte</h1>
              <p style={{color:C.gray,fontSize:"14px"}}>Inscrivez votre institution sur YELEN224</p>
              {DEV_MODE && (
                <div style={{display:"inline-flex",alignItems:"center",gap:"6px",marginTop:"10px",padding:"5px 12px",backgroundColor:"#FFF3CD",border:"1px solid #FFC107",borderRadius:"20px"}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span style={{color:"#856404",fontSize:"10px",fontWeight:"800"}}>MODE DEV — SMS désactivé</span>
                </div>
              )}
            </div>

            {/* Téléphone */}
            <div style={{marginBottom:"16px"}}>
              <label style={labelStyle}>Numéro de téléphone</label>
              <div style={{display:"flex",borderRadius:"14px",border:`1.5px solid ${C.border}`,overflow:"hidden",backgroundColor:C.white,boxShadow:"0 2px 8px rgba(245,166,35,0.08)"}}>
                <div style={{padding:"0 14px",display:"flex",alignItems:"center",gap:"6px",borderRight:`1.5px solid ${C.border}`,backgroundColor:C.goldBg2,flexShrink:0}}>
                  <div style={{display:"flex",gap:0}}>
                    <div style={{width:"8px",height:"6px",background:"#CE1126",borderRadius:"1px 0 0 1px"}}/>
                    <div style={{width:"8px",height:"6px",background:"#FCD20F"}}/>
                    <div style={{width:"8px",height:"6px",background:"#009A44",borderRadius:"0 1px 1px 0"}}/>
                  </div>
                  <span style={{color:C.gold,fontSize:"15px",fontWeight:"900"}}>+224</span>
                </div>
                <input className="inp" type="tel" placeholder="620 000 000" value={phone}
                  onChange={e=>{
                    const raw = e.target.value.replace(/[^\d\s]/g,"");
                    // Plafond à 10 chiffres : 9 chiffres réels + 1 "0" initial toléré.
                    if (raw.replace(/\s/g,"").length <= 10) setPhone(raw);
                  }}
                  onKeyDown={e=>e.key==="Enter"&&handlePhoneSubmit()}
                  style={{flex:1,padding:"15px 16px",fontSize:"17px",fontWeight:"700",letterSpacing:"1.5px",border:"none",background:"transparent",color:C.dark}}
                  autoFocus
                />
              </div>
              <p style={{color:phoneDigitsNormalized.length===9?C.green:C.gray,fontSize:"11px",marginTop:"6px",textAlign:"right",fontWeight:"600"}}>
                {phoneDigitsNormalized.length} / 9 chiffres
              </p>
            </div>

            {/* Challenge math */}
            <div style={{marginBottom:"16px"}}>
              <label style={labelStyle}>Question de sécurité</label>
              <div style={{backgroundColor:C.goldBg2,border:`1.5px solid ${C.gold}25`,borderRadius:"12px",padding:"11px 16px",marginBottom:"8px",display:"flex",alignItems:"center",gap:"10px"}}>
                <div style={{width:"32px",height:"32px",borderRadius:"8px",backgroundColor:`${C.gold}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <span style={{color:C.dark,fontSize:"14px",fontWeight:"700"}}>Combien font <strong style={{color:C.gold}}>{challenge.q}</strong> ?</span>
              </div>
              <div style={{position:"relative"}}>
                <input className="inp" type="number" placeholder="Votre réponse…" value={chalAns}
                  onChange={e=>setChalAns(e.target.value)}
                  style={{...inputStyle,paddingRight:"46px",borderColor:chalOk?C.gold:C.border,backgroundColor:chalOk?`${C.gold}06`:C.white}}
                />
                <div style={{position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)"}}>
                  {chalOk
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gray2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  }
                </div>
              </div>
            </div>

            {/* CGU */}
            <div onClick={()=>setCgu(v=>!v)} style={{display:"flex",alignItems:"flex-start",gap:"12px",padding:"14px",backgroundColor:cgu?`${C.gold}06`:C.white,border:`1.5px solid ${cgu?C.gold:C.border}`,borderRadius:"14px",marginBottom:"16px",cursor:"pointer",transition:"all 0.2s"}}>
              <div style={{width:"20px",height:"20px",borderRadius:"6px",backgroundColor:cgu?C.gold:"transparent",border:`2px solid ${cgu?C.gold:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:"1px",transition:"all 0.15s"}}>
                {cgu && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <div style={{color:C.gray,fontSize:"12px",lineHeight:1.6}}>
                J'accepte les{" "}
                <Link href="/cgu" onClick={e=>e.stopPropagation()} style={{color:C.gold,fontWeight:"700",textDecoration:"none"}}>Conditions d'utilisation</Link>
                {" "}et la{" "}
                <Link href="/confidentialite" onClick={e=>e.stopPropagation()} style={{color:C.gold,fontWeight:"700",textDecoration:"none"}}>Politique de confidentialité</Link>.
              </div>
            </div>

            {/* Honeypot */}
            <div style={{position:"absolute",left:"-9999px",opacity:0,height:0,overflow:"hidden"}} aria-hidden="true">
              <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e=>setHoneypot(e.target.value)} name="url"/>
            </div>

            {error && <ErrorBanner msg={error}/>}

            <button onClick={handlePhoneSubmit} disabled={loading||blocked||!chalOk||!cgu} className="tap"
              style={{width:"100%",padding:"16px",borderRadius:"14px",border:"none",background:loading||blocked||!chalOk||!cgu?C.gray3:`linear-gradient(135deg,${C.gold},${C.goldD})`,color:loading||blocked||!chalOk||!cgu?C.gray:C.dark,fontSize:"16px",fontWeight:"800",cursor:loading||blocked||!chalOk||!cgu?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",boxShadow:!loading&&!blocked&&chalOk&&cgu?`0 8px 24px ${C.gold}40`:"none",transition:"all 0.2s"}}>
              {loading ? <><Spinner/> Vérification…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                {DEV_MODE ? "Simuler l'envoi du code" : "Recevoir le code SMS"}
              </>}
            </button>

            <div style={{textAlign:"center",marginTop:"16px",color:C.gray,fontSize:"13px"}}>
              Déjà inscrit ?{" "}
              <Link href="/institution/connexion" style={{color:C.gold,fontWeight:"700",textDecoration:"none"}}>Se connecter</Link>
            </div>
          </div>
        )}

        {/* ═══ STEP: OTP ═══ */}
        {step==="otp" && (
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{textAlign:"center",marginBottom:"28px"}}>
              <div style={{width:"68px",height:"68px",borderRadius:"20px",background:`linear-gradient(135deg,${C.gold}20,${C.gold}08)`,border:`2px solid ${C.gold}40`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:C.shadow}}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round">
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              </div>
              <h2 style={{color:C.dark,fontSize:"22px",fontWeight:"900",marginBottom:"6px"}}>Code de vérification</h2>
              <p style={{color:C.gray,fontSize:"13px"}}>
                {DEV_MODE
                  ? <>Entrez le code fictif <strong style={{color:C.gold,fontSize:"16px",letterSpacing:"2px"}}>{DEV_OTP}</strong></>
                  : <>Code envoyé au{" "}<strong style={{color:C.dark}}>{localStorage.getItem("yelen_reg_phone")?.replace(/(\+224)(\d{2})(\d{3})(\d{4})/,"$1 $2•••$4")}</strong></>
                }
              </p>
            </div>

            {/* Bannière DEV */}
            {DEV_MODE && (
              <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 16px",backgroundColor:"#FFF3CD",border:"1px solid #FFC107",borderLeft:"3px solid #FFC107",borderRadius:"12px",marginBottom:"16px"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  <div style={{color:"#856404",fontSize:"12px",fontWeight:"800"}}>Mode développement</div>
                  <div style={{color:"#856404",fontSize:"11px"}}>Code accepté : <strong style={{letterSpacing:"1px"}}>{DEV_OTP}</strong> — Aucun SMS envoyé</div>
                </div>
              </div>
            )}

            {/* Banner succès (prod uniquement) */}
            {success && !DEV_MODE && (
              <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 16px",backgroundColor:C.greenL,border:`1px solid ${C.green}30`,borderRadius:"12px",marginBottom:"16px"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{color:C.green,fontSize:"13px",fontWeight:"600"}}>{success}</span>
              </div>
            )}

            {/* OTP inputs */}
            <div style={{display:"flex",gap:"8px",justifyContent:"center",marginBottom:"24px"}}>
              {otp.map((d,i)=>(
                <input key={i} className="otp-inp" ref={el=>{otpRefs.current[i]=el;}}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e=>handleOtpChange(i,e.target.value)}
                  onKeyDown={e=>handleOtpKey(i,e)}
                  style={{width:"52px",height:"62px",textAlign:"center",fontSize:"24px",fontWeight:"800",backgroundColor:d?`${C.gold}12`:C.white,border:`2px solid ${d?C.gold:C.border}`,borderRadius:"14px",color:C.dark,transition:"all 0.15s"}}
                />
              ))}
            </div>

            {error && <ErrorBanner msg={error}/>}

            <button onClick={handleVerifyOtp} disabled={loading||otp.join("").length<6} className="tap"
              style={{width:"100%",padding:"16px",borderRadius:"14px",border:"none",background:loading||otp.join("").length<6?C.gray3:`linear-gradient(135deg,${C.gold},${C.goldD})`,color:loading||otp.join("").length<6?C.gray:C.dark,fontSize:"16px",fontWeight:"800",cursor:loading||otp.join("").length<6?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",boxShadow:!loading&&otp.join("").length===6?`0 8px 24px ${C.gold}40`:"none",marginBottom:"12px"}}>
              {loading ? <><Spinner/> Vérification…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Confirmer le code
              </>}
            </button>

            <div style={{textAlign:"center"}}>
              {resendTimer > 0
                ? <span style={{color:C.gray,fontSize:"13px"}}>Renvoyer dans {resendTimer}s</span>
                : <button onClick={handlePhoneSubmit} className="tap" style={{background:"none",border:"none",color:C.gold,fontSize:"13px",fontWeight:"700",cursor:"pointer"}}>
                    {DEV_MODE ? "Re-simuler l'envoi" : "Renvoyer le code"}
                  </button>
              }
            </div>
          </div>
        )}

        {/* ═══ ÉCRAN A — RESPONSABLE ═══ */}
        {step==="personnel" && (
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{textAlign:"center",marginBottom:"24px"}}>
              <h2 style={{color:C.dark,fontSize:"22px",fontWeight:"900",marginBottom:"6px"}}>Qui êtes-vous ?</h2>
              <p style={{color:C.gray,fontSize:"13px"}}>Les informations du responsable de l'établissement</p>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:"14px",marginBottom:"20px"}}>
              <div>
                <label style={labelStyle}>Prénom *</label>
                <input className="inp" type="text" placeholder="Ex: Mamadou"
                  value={formPersonnel.prenom} onChange={e=>setFormPersonnel(f=>({...f,prenom:e.target.value}))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Nom *</label>
                <input className="inp" type="text" placeholder="Ex: Diallo"
                  value={formPersonnel.nom} onChange={e=>setFormPersonnel(f=>({...f,nom:e.target.value}))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Votre rôle dans l'institution (optionnel)</label>
                <input className="inp" type="text" placeholder="Ex: Directeur, Gérant, Responsable accueil…"
                  value={formPersonnel.role} onChange={e=>setFormPersonnel(f=>({...f,role:e.target.value}))}
                  style={inputStyle}
                />
              </div>
            </div>

            {error && <ErrorBanner msg={error}/>}

            <button onClick={handlePersonnelNext} className="tap" style={ctaStyle(false)}>
              Continuer
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>

            <p style={{textAlign:"center",color:C.gray,fontSize:"12px",marginTop:"14px"}}>
              Étape suivante : informations sur votre établissement.
            </p>
          </div>
        )}

        {/* ═══ ÉCRAN B — ÉTABLISSEMENT ═══ */}
        {step==="entreprise" && (
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{textAlign:"center",marginBottom:"24px"}}>
              <h2 style={{color:C.dark,fontSize:"22px",fontWeight:"900",marginBottom:"6px"}}>Votre établissement</h2>
              <p style={{color:C.gray,fontSize:"13px"}}>Ces informations seront visibles par les citoyens</p>
            </div>

            {/* Secteur — ouvre une popup au lieu d'afficher la liste inline */}
            <div style={{marginBottom:"16px"}}>
              <label style={labelStyle}>Secteur d'activité *</label>
              <div onClick={()=>setSecteurModalOpen(true)} className="tap"
                style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 16px",borderRadius:"14px",cursor:"pointer",border:`1.5px solid ${formEntreprise.secteur?C.gold:C.border}`,backgroundColor:formEntreprise.secteur?`${C.gold}08`:C.white,transition:"all 0.2s"}}>
                <div style={{width:"36px",height:"36px",borderRadius:"10px",backgroundColor:`${C.gold}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <SecteurIcon id={formEntreprise.secteur || "services_divers"} color={C.gold}/>
                </div>
                <span style={{flex:1,color:formEntreprise.secteur?C.dark:C.gray2,fontSize:"14px",fontWeight:formEntreprise.secteur?"800":"500"}}>
                  {formEntreprise.secteur ? SECTEURS.find(s=>s.id===formEntreprise.secteur)?.label : "Sélectionner un secteur…"}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
              </div>
            </div>

            {/* Statut juridique — idem, popup */}
            {formEntreprise.secteur && (
              <div style={{marginBottom:"20px",animation:"fadeUp 0.25s ease"}}>
                <label style={labelStyle}>Statut juridique *</label>
                <div onClick={()=>setStatutModalOpen(true)} className="tap"
                  style={{padding:"14px 16px",borderRadius:"14px",cursor:"pointer",border:`1.5px solid ${formEntreprise.statutJuridique?C.gold:C.border}`,backgroundColor:formEntreprise.statutJuridique?`${C.gold}08`:C.white,display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.2s"}}>
                  <span style={{color:formEntreprise.statutJuridique?C.dark:C.gray2,fontSize:"14px",fontWeight:formEntreprise.statutJuridique?"800":"500"}}>
                    {formEntreprise.statutJuridique ? STATUTS_JURIDIQUES.find(s=>s.id===formEntreprise.statutJuridique)?.label : "Sélectionner un statut…"}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
                </div>
              </div>
            )}

            <SelectModal open={secteurModalOpen} title="Choisissez votre secteur" onClose={()=>setSecteurModalOpen(false)}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                {SECTEURS.map(s => {
                  const selected = formEntreprise.secteur === s.id;
                  return (
                    <div key={s.id} onClick={()=>{setFormEntreprise(f=>({...f,secteur:s.id,statutJuridique:""}));setSecteurModalOpen(false);}} className="tap"
                      style={{padding:"16px 10px",borderRadius:"14px",cursor:"pointer",border:`1.5px solid ${selected?C.gold:C.border}`,backgroundColor:selected?`${C.gold}12`:C.white,display:"flex",flexDirection:"column",alignItems:"center",gap:"8px",transition:"all 0.2s"}}>
                      <SecteurIcon id={s.id} color={selected?C.gold:C.dark2} size={24}/>
                      <span style={{color:selected?C.dark:C.dark2,fontSize:"12px",fontWeight:selected?"800":"600",textAlign:"center"}}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </SelectModal>

            <SelectModal open={statutModalOpen} title="Choisissez votre statut juridique" onClose={()=>setStatutModalOpen(false)}>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {STATUTS_JURIDIQUES.map(s => {
                  const selected = formEntreprise.statutJuridique === s.id;
                  return (
                    <div key={s.id} onClick={()=>{setFormEntreprise(f=>({...f,statutJuridique:s.id}));setStatutModalOpen(false);}} className="tap"
                      style={{padding:"13px 16px",borderRadius:"14px",cursor:"pointer",border:`1.5px solid ${selected?C.gold:C.border}`,backgroundColor:selected?`${C.gold}12`:C.white,transition:"all 0.2s"}}>
                      <div style={{color:selected?C.dark:C.dark2,fontSize:"14px",fontWeight:"800",marginBottom:"2px"}}>{s.label}</div>
                      <div style={{color:C.gray,fontSize:"12px"}}>{s.description}</div>
                    </div>
                  );
                })}
              </div>
            </SelectModal>

            {/* Documents attendus — informatif uniquement */}
            {formEntreprise.statutJuridique && (
              <div style={{backgroundColor:C.goldBg2,border:`1.5px solid ${C.gold}25`,borderRadius:"14px",padding:"16px",marginBottom:"20px",animation:"fadeUp 0.25s ease"}}>
                <div style={{color:C.dark,fontSize:"13px",fontWeight:"800",marginBottom:"8px"}}>Documents qui vous seront demandés</div>
                <ul style={{margin:0,paddingLeft:"18px",display:"flex",flexDirection:"column",gap:"4px"}}>
                  {DOCUMENTS_PAR_STATUT[formEntreprise.statutJuridique].map(d => (
                    <li key={d} style={{color:C.dark2,fontSize:"12.5px"}}>{d}</li>
                  ))}
                </ul>
                <p style={{color:C.gray,fontSize:"11.5px",lineHeight:1.6,margin:"10px 0 6px"}}>
                  Vous pourrez les ajouter plus tard depuis votre tableau de bord, mais le faire maintenant vous fera gagner du temps.
                </p>
                <button
                  onClick={() => { nameFieldRef.current?.focus(); nameFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                  className="tap"
                  style={{background:"none",border:"none",color:C.gold,fontSize:"12px",fontWeight:"700",cursor:"pointer",textDecoration:"underline",padding:0}}
                >
                  Je le ferai plus tard
                </button>
              </div>
            )}

            {/* Nom + ville */}
            <div style={{display:"flex",flexDirection:"column",gap:"14px",marginBottom:"14px"}}>
              <div>
                <label style={labelStyle}>Nom de l'institution *</label>
                <input ref={nameFieldRef} className="inp" type="text" placeholder="Ex: Clinique Pasteur Conakry"
                  value={formEntreprise.name} onChange={e=>setFormEntreprise(f=>({...f,name:e.target.value}))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Ville *</label>
                <select className="inp" value={formEntreprise.ville} onChange={e=>setFormEntreprise(f=>({...f,ville:e.target.value}))}
                  style={inputStyle}
                >
                  <option value="">Sélectionner une ville</option>
                  {VILLES_GUINEE.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Champs secondaires — optionnels */}
            <div style={{display:"flex",flexDirection:"column",gap:"14px",marginBottom:"20px"}}>
              <div>
                <label style={labelStyle}>Email (optionnel)</label>
                <input className="inp" type="email" placeholder="contact@institution.gn"
                  value={formEntreprise.email} onChange={e=>setFormEntreprise(f=>({...f,email:e.target.value}))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Site web (optionnel)</label>
                <input className="inp" type="text" placeholder="https://…"
                  value={formEntreprise.website} onChange={e=>setFormEntreprise(f=>({...f,website:e.target.value}))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Description (optionnel)</label>
                <textarea className="inp" placeholder="Décrivez votre établissement en quelques mots…"
                  value={formEntreprise.description} onChange={e=>setFormEntreprise(f=>({...f,description:e.target.value}))}
                  rows={3}
                  style={{...inputStyle,resize:"none",lineHeight:1.6} as React.CSSProperties}
                />
              </div>
            </div>

            {error && <ErrorBanner msg={error}/>}

            <button onClick={handleEntrepriseNext} className="tap" style={ctaStyle(false)}>
              Continuer
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {/* ═══ ÉCRAN C — SONDAGE (1 question à la fois, avance auto) ═══ */}
        {step==="sondage" && (
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{display:"flex",justifyContent:"center",gap:"6px",marginBottom:"18px"}}>
              {SONDAGE_STEPS.map((_,i) => (
                <div key={i} style={{width:i===sondageSubStep?"20px":"6px",height:"6px",borderRadius:"3px",backgroundColor:i<=sondageSubStep?C.gold:C.gray3,transition:"all 0.25s"}}/>
              ))}
            </div>

            <div style={{textAlign:"center",marginBottom:"20px"}}>
              <p style={{color:C.gray,fontSize:"11px",fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 8px"}}>
                Question {sondageSubStep+1} sur {SONDAGE_STEPS.length}
              </p>
              <h2 style={{color:C.dark,fontSize:"19px",fontWeight:"900",lineHeight:1.3}}>{SONDAGE_STEPS[sondageSubStep].label}</h2>
            </div>

            <ChoiceGroup
              options={SONDAGE_STEPS[sondageSubStep].options}
              value={formSondage[SONDAGE_STEPS[sondageSubStep].key]}
              onChange={v => handleSondageAnswer(SONDAGE_STEPS[sondageSubStep].key, v, sondageSubStep === SONDAGE_STEPS.length - 1)}
            />

            {error && <ErrorBanner msg={error}/>}

            {sondageSubStep > 0 && (
              <button onClick={()=>setSondageSubStep(s=>s-1)} className="tap" style={{marginTop:"20px",background:"none",border:"none",color:C.gray,fontSize:"12.5px",fontWeight:"700",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px"}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
                Question précédente
              </button>
            )}
          </div>
        )}

        {/* ═══ ÉCRAN D — APERÇU ═══ */}
        {step==="apercu" && (
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{textAlign:"center",marginBottom:"24px"}}>
              <h2 style={{color:C.dark,fontSize:"22px",fontWeight:"900",marginBottom:"6px"}}>Vérifiez et confirmez</h2>
              <p style={{color:C.gray,fontSize:"13px"}}>Dernière étape avant la création de votre compte</p>
            </div>

            <div style={{backgroundColor:C.white,border:`1.5px solid ${C.border}`,borderRadius:"16px",padding:"18px",marginBottom:"14px"}}>
              <div style={{color:C.gold,fontSize:"10px",fontWeight:"800",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"8px"}}>Responsable</div>
              <div style={{color:C.dark,fontSize:"14px",fontWeight:"700"}}>
                {formPersonnel.prenom} {formPersonnel.nom}
                {formPersonnel.role.trim() && <span style={{color:C.gray,fontWeight:"500"}}> — {formPersonnel.role}</span>}
              </div>
            </div>

            <div style={{backgroundColor:C.white,border:`1.5px solid ${C.border}`,borderRadius:"16px",padding:"18px",marginBottom:"14px"}}>
              <div style={{color:C.gold,fontSize:"10px",fontWeight:"800",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"8px"}}>Établissement</div>
              <div style={{color:C.dark,fontSize:"14px",fontWeight:"700",marginBottom:"4px"}}>{formEntreprise.name}</div>
              <div style={{color:C.gray,fontSize:"12.5px"}}>
                {SECTEURS.find(s=>s.id===formEntreprise.secteur)?.label} · {STATUTS_JURIDIQUES.find(s=>s.id===formEntreprise.statutJuridique)?.label} · {formEntreprise.ville}
              </div>
            </div>

            <div style={{backgroundColor:C.goldBg2,border:`1.5px solid ${C.gold}25`,borderRadius:"16px",padding:"18px",marginBottom:"20px"}}>
              <div style={{color:C.dark,fontSize:"13px",fontWeight:"800",marginBottom:"10px"}}>Après la création de votre compte</div>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {["Configurer votre premier créneau de disponibilité","Activer votre QR-code pour les rendez-vous","Ajouter vos documents quand vous le souhaitez"].map(txt => (
                  <div key={txt} style={{display:"flex",alignItems:"flex-start",gap:"8px"}}>
                    <div style={{width:"5px",height:"5px",borderRadius:"50%",backgroundColor:C.gold,marginTop:"7px",flexShrink:0}}/>
                    <span style={{color:C.dark2,fontSize:"12.5px",lineHeight:1.5}}>{txt}</span>
                  </div>
                ))}
              </div>
            </div>

            {error && <ErrorBanner msg={error}/>}

            <button onClick={handleFinalSubmit} disabled={loading} className="tap" style={ctaStyle(loading)}>
              {loading ? <><Spinner/> Création en cours…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Créer mon compte
              </>}
            </button>
          </div>
        )}

        {/* ═══ STEP: SUCCESS ═══ */}
        {step==="success" && (
          <div style={{textAlign:"center",animation:"fadeUp 0.3s ease",padding:"40px 0"}}>
            <div style={{width:"88px",height:"88px",borderRadius:"26px",background:`linear-gradient(135deg,${C.gold},${C.goldD})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",animation:"successPop 0.5s ease",boxShadow:`0 16px 40px ${C.gold}50`}}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{color:C.dark,fontSize:"26px",fontWeight:"900",marginBottom:"8px",letterSpacing:"-0.5px"}}>Institution créée !</h2>
            <p style={{color:C.gray,fontSize:"14px",lineHeight:1.6,marginBottom:"24px"}}>
              Bienvenue sur YELEN224.<br/>Redirection vers votre dashboard…
            </p>
            <div style={{display:"flex",justifyContent:"center"}}>
              <div style={{width:"28px",height:"28px",border:`3px solid ${C.gold}30`,borderTopColor:C.gold,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
