"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ═══════════════════════════════════════════════════════════
// DEV CONFIG — retirer avant mise en prod
// ═══════════════════════════════════════════════════════════
const DEV_MODE = false;        // ← false en production
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

const CATEGORIES = [
  "Santé","Banque / Microfinance","Administration","Éducation",
  "Justice","Transport","Énergie / Eau","Télécommunications","Commerce","Autre",
];

type Step = "phone" | "otp" | "info" | "success";

export default function InstitutionInscription() {
  const router = useRouter();
  const [step, setStep]               = useState<Step>("phone");
  const [phone, setPhone]             = useState("");
  const [otp, setOtp]                 = useState(["","","","","",""]);
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

  // Formulaire institution
  const [form, setForm] = useState({
    name: "", category: "", ville: "",
    email: "", website: "", description: "",
  });

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
    if (blocked) { setError(`Bloqué ${blockTimer}s.`); return; }

    const cleaned = phone.replace(/[\s\-]/g, "");
    if (!cleaned || cleaned.length < 8) { setError("Numéro invalide (min. 8 chiffres)."); return; }

    const n = attempts + 1;
    setAttempts(n);
    if (n > 5) { setBlocked(true); setBlockTimer(300); setError("Trop de tentatives. Bloqué 5 min."); return; }

    setLoading(true);
    const fullPhone = "+224" + cleaned.replace(/^0/, "");

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

    // ─── MODE DEV : pas de vrai SMS ───
    if (DEV_MODE) {
      setStep("otp");
      setResendTimer(60);
      setSuccess(`[DEV] Code fictif : ${DEV_OTP} — SMS désactivé`);
      setLoading(false);
      return;
    }

    // ─── MODE PROD : vraie fonction RPC + SMS ───
    try {
      const { error: fnErr } = await supabase
        .rpc("generate_institution_otp", { p_phone: fullPhone });

      if (fnErr?.message?.includes("RATE_LIMIT")) {
        setError("Trop de demandes. Attendez 1 heure.");
        setLoading(false);
        return;
      }

      setStep("otp");
      setResendTimer(60);
      setSuccess(`Code envoyé au ${fullPhone}`);
    } catch {
      setError("Erreur réseau. Réessayez.");
    }
    setLoading(false);
  }

  // ── ÉTAPE 2 : Vérifier OTP ──
  async function handleVerifyOtp() {
    const code = otp.join("");
    if (code.length < 6) { setError("Entrez les 6 chiffres."); return; }

    setLoading(true);
    setError("");

    // ─── MODE DEV : accepter 123456 directement ───
    if (DEV_MODE && code === DEV_OTP) {
      setStep("info");
      setSuccess("");
      setLoading(false);
      return;
    }

    // ─── Vérification DB (prod ou code réel saisi en dev) ───
    const savedPhone = localStorage.getItem("yelen_reg_phone") || "";

    try {
      const { data: valid, error: fnErr } = await supabase
        .rpc("verify_institution_otp", { p_phone: savedPhone, p_code: code });

      if (fnErr?.message?.includes("MAX_ATTEMPTS")) {
        setBlocked(true); setBlockTimer(300);
        setError("Code invalidé. Demandez un nouveau code.");
        setLoading(false);
        return;
      }

      if (!valid) {
        const n = attempts + 1; setAttempts(n);
        if (n >= 3) { setBlocked(true); setBlockTimer(300); setError("Trop d'erreurs. Bloqué 5 min."); }
        else setError(`Code incorrect. ${3-n} tentative(s) restante(s).`);
        setLoading(false);
        return;
      }

      setStep("info");
      setSuccess("");
    } catch {
      setError("Erreur réseau.");
    }
    setLoading(false);
  }

  // ── ÉTAPE 3 : Créer institution ──
  async function handleCreateInstitution() {
    setError("");
    if (!form.name.trim())  { setError("Le nom de l'institution est requis."); return; }
    if (!form.category)     { setError("Sélectionnez une catégorie."); return; }
    if (!form.ville.trim()) { setError("La ville est requise."); return; }

    setLoading(true);
    const savedPhone = localStorage.getItem("yelen_reg_phone") || "";

    try {
      const { data: newInst, error: insertErr } = await supabase
        .from("institutions")
        .insert({
          name: form.name.trim(),
          category: form.category,
          ville: form.ville.trim(),
          phone: savedPhone,
          email: form.email.trim() || null,
          website: form.website.trim() || null,
          description: form.description.trim() || null,
          badge_verifie: false,
          moyenne_avis: 0,
          nb_avis: 0,
        })
        .select("id")
        .single();

      if (insertErr) throw new Error(insertErr.message);

      localStorage.setItem("yelen224_institution_id", newInst.id);
      localStorage.setItem("yelen224_inst_auth", "true");
      localStorage.setItem("yelen224_inst_auth_ts", String(Date.now()));
      localStorage.removeItem("yelen_reg_phone");

      setStep("success");
      setTimeout(() => router.push(`/institution/${newInst.id}/dashboard`), 2000);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la création.");
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

  const ErrorBanner = ({ msg }: { msg: string }) => (
    <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 16px",backgroundColor:C.redL,border:`1px solid ${C.red}25`,borderLeft:`3px solid ${C.red}`,borderRadius:"12px",marginBottom:"16px"}}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style={{color:C.red,fontSize:"13px",fontWeight:"600"}}>{msg}</span>
    </div>
  );

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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
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
          <div style={{display:"flex",alignItems:"center",gap:"0",marginBottom:"32px"}}>
            {[{n:1,l:"Numéro"},{n:2,l:"Vérification"},{n:3,l:"Informations"}].map((s,i,arr)=>{
              const done = (step==="otp"&&s.n<2)||(step==="info"&&s.n<3)||((step as string)==="success");
              const active = (step==="phone"&&s.n===1)||(step==="otp"&&s.n===2)||(step==="info"&&s.n===3);
              return(
                <div key={s.n} style={{display:"flex",alignItems:"center",flex:i<arr.length-1?1:"auto"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
                    <div style={{width:"28px",height:"28px",borderRadius:"50%",backgroundColor:done?C.gold:active?C.gold:"transparent",border:`2px solid ${done||active?C.gold:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.3s"}}>
                      {done
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <span style={{color:active?C.dark:C.gray2,fontSize:"11px",fontWeight:"800"}}>{s.n}</span>
                      }
                    </div>
                    <span style={{color:active?C.dark:done?C.gold:C.gray2,fontSize:"10px",fontWeight:active||done?"700":"500",whiteSpace:"nowrap"}}>{s.l}</span>
                  </div>
                  {i<arr.length-1&&<div style={{flex:1,height:"2px",backgroundColor:done?C.gold:C.gray3,margin:"0 6px 16px",transition:"background-color 0.3s"}}/>}
                </div>
              );
            })}
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
              <label style={{color:C.dark2,fontSize:"11px",fontWeight:"800",letterSpacing:"0.8px",textTransform:"uppercase",display:"block",marginBottom:"8px"}}>Numéro de téléphone</label>
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
                  onChange={e=>setPhone(e.target.value.replace(/[^\d\s]/g,""))}
                  onKeyDown={e=>e.key==="Enter"&&handlePhoneSubmit()}
                  style={{flex:1,padding:"15px 16px",fontSize:"17px",fontWeight:"700",letterSpacing:"1.5px",border:"none",background:"transparent",color:C.dark}}
                  autoFocus
                />
              </div>
            </div>

            {/* Challenge math */}
            <div style={{marginBottom:"16px"}}>
              <label style={{color:C.dark2,fontSize:"11px",fontWeight:"800",letterSpacing:"0.8px",textTransform:"uppercase",display:"block",marginBottom:"8px"}}>Question de sécurité</label>
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

        {/* ═══ STEP: INFO ═══ */}
        {step==="info" && (
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{textAlign:"center",marginBottom:"24px"}}>
              <h2 style={{color:C.dark,fontSize:"22px",fontWeight:"900",marginBottom:"6px"}}>Informations institution</h2>
              <p style={{color:C.gray,fontSize:"13px"}}>Ces informations seront visibles par les citoyens</p>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:"14px",marginBottom:"20px"}}>

              {/* Nom */}
              <div>
                <label style={{color:C.dark2,fontSize:"11px",fontWeight:"800",letterSpacing:"0.8px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Nom de l'institution *</label>
                <input className="inp" type="text" placeholder="Ex: Clinique Pasteur Conakry"
                  value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  style={{...inputStyle}}
                />
              </div>

              {/* Catégorie */}
              <div>
                <label style={{color:C.dark2,fontSize:"11px",fontWeight:"800",letterSpacing:"0.8px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Catégorie *</label>
                <div style={{position:"relative"}}>
                  <select className="sel inp" value={form.category}
                    onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                    style={{...inputStyle,paddingRight:"40px",cursor:"pointer"}}>
                    <option value="">Sélectionner…</option>
                    {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
              </div>

              {/* Ville */}
              <div>
                <label style={{color:C.dark2,fontSize:"11px",fontWeight:"800",letterSpacing:"0.8px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Ville *</label>
                <input className="inp" type="text" placeholder="Ex: Conakry"
                  value={form.ville} onChange={e=>setForm(f=>({...f,ville:e.target.value}))}
                  style={{...inputStyle}}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{color:C.dark2,fontSize:"11px",fontWeight:"800",letterSpacing:"0.8px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Email (optionnel)</label>
                <input className="inp" type="email" placeholder="contact@institution.gn"
                  value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                  style={{...inputStyle}}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{color:C.dark2,fontSize:"11px",fontWeight:"800",letterSpacing:"0.8px",textTransform:"uppercase",display:"block",marginBottom:"6px"}}>Description (optionnel)</label>
                <textarea className="inp" placeholder="Décrivez votre institution en quelques mots…"
                  value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                  rows={3}
                  style={{...inputStyle,resize:"none",lineHeight:1.6} as React.CSSProperties}
                />
              </div>
            </div>

            {error && <ErrorBanner msg={error}/>}

            <button onClick={handleCreateInstitution} disabled={loading} className="tap"
              style={{width:"100%",padding:"16px",borderRadius:"14px",border:"none",background:loading?C.gray3:`linear-gradient(135deg,${C.gold},${C.goldD})`,color:loading?C.gray:C.dark,fontSize:"16px",fontWeight:"800",cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",boxShadow:!loading?`0 8px 24px ${C.gold}40`:"none"}}>
              {loading ? <><Spinner/> Création en cours…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Créer mon institution
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