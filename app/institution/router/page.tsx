"use client";

// ═══════════════════════════════════════════════════════════════════════
// YELEN224 — /app/institution/dashboard/page.tsx
// RÔLE : Point d'entrée unique du dashboard institution.
//        - Si connecté  → lit l'institution_id depuis la session Supabase
//                       → redirige vers /institution/[id]/dashboard
//        - Si non conn. → affiche l'écran de connexion pro
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ─── Design Tokens (identiques au dashboard principal) ────────────────
const T = {
  gold:   "#D4A017",
  goldD:  "#A07810",
  bg:     "#0A0A0F",
  bgCard: "#111118",
  bg3:    "#1C1C28",
  border: "rgba(255,255,255,0.07)",
  brd2:   "rgba(255,255,255,0.12)",
  t1:     "#FFFFFF",
  t2:     "#9999B3",
  t3:     "#55556A",
  green:  "#00C896",
  greenL: "rgba(0,200,150,0.12)",
  red:    "#FF4757",
  redL:   "rgba(255,71,87,0.12)",
  blue:   "#4F8EF7",
};

// ─── SVG Icons ────────────────────────────────────────────────────────
const Ic = {
  Lock: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Building: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 21h18"/>
      <path d="M5 21V7l8-4v18"/>
      <path d="M19 21V11l-6-4"/>
      <path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/>
    </svg>
  ),
  Eye: (show: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2" strokeLinecap="round">
      {show ? (
        <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
      ) : (
        <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
      )}
    </svg>
  ),
  Arrow: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  Warning: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Mail: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  KeyIcon: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
};

// ─── States ───────────────────────────────────────────────────────────
type PageState = "checking" | "not_connected" | "connecting" | "redirecting" | "error_no_institution";

export default function InstitutionDashboardGateway() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("checking");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  // ── Au montage : vérifier la session existante ──
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setPageState("not_connected");
        return;
      }
      await resolveAndRedirect(session.user.id);
    })();
  }, []);

  // ── Résolution institution_id depuis user_id ──
  async function resolveAndRedirect(userId: string) {
    setPageState("redirecting");

    // 1. Chercher dans la table "institutions" si l'utilisateur en est le gestionnaire
    const { data: instByOwner } = await supabase
      .from("institutions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (instByOwner?.id) {
      router.replace(`/institution/${instByOwner.id}/dashboard`);
      return;
    }

    // 2. Chercher dans une table de liaison "institution_members" ou "gestionnaires"
    const { data: memberRow } = await supabase
      .from("institution_members")
      .select("institution_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (memberRow?.institution_id) {
      router.replace(`/institution/${memberRow.institution_id}/dashboard`);
      return;
    }

    // 3. Chercher dans la table "users" le champ institution_id
    const { data: userRow } = await supabase
      .from("users")
      .select("institution_id")
      .eq("id", userId)
      .maybeSingle();

    if (userRow?.institution_id) {
      router.replace(`/institution/${userRow.institution_id}/dashboard`);
      return;
    }

    // Aucune institution trouvée pour cet utilisateur
    setPageState("error_no_institution");
  }

  // ── Connexion ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setLoginError(null);
    setPageState("connecting");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoginError(
        error.message.includes("Invalid") || error.message.includes("credentials")
          ? "Email ou mot de passe incorrect."
          : error.message.includes("confirmed")
          ? "Votre email n'est pas encore confirmé."
          : "Erreur de connexion. Réessayez."
      );
      setPageState("not_connected");
      setLoading(false);
      return;
    }

    if (data.user) {
      await resolveAndRedirect(data.user.id);
    }
    setLoading(false);
  }

  // ── CSS ──
  const css = `
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
    html,body{background:${T.bg};overflow-x:hidden}
    ::-webkit-scrollbar{display:none}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    .tap{transition:opacity .12s,transform .12s;cursor:pointer;user-select:none;touch-action:manipulation}
    .tap:active{opacity:.65;transform:scale(.97)}
    input::placeholder{color:${T.t3}}
    input{color:${T.t1};background:transparent;border:none;outline:none;font-family:inherit;width:100%}
    .field:focus-within{border-color:${T.gold}50 !important}
  `;

  // ─────────── CHECKING ───────────────────────────────────────────────
  if (pageState === "checking" || pageState === "redirecting") {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "20px" }}>
        <style>{css}</style>
        {/* Logo animé */}
        <div style={{ position: "relative", width: "56px", height: "56px" }}>
          <div style={{ position: "absolute", inset: 0, border: `3px solid rgba(212,160,23,0.15)`, borderTopColor: T.gold, borderRadius: "50%", animation: "spin 0.85s linear infinite" }}/>
          <div style={{ position: "absolute", inset: "8px", border: `2px solid rgba(212,160,23,0.08)`, borderTopColor: `${T.gold}50`, borderRadius: "50%", animation: "spin 1.5s linear infinite reverse" }}/>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: T.t2, fontSize: "13px", fontWeight: "700", letterSpacing: "0.3px" }}>
            {pageState === "redirecting" ? "Connexion en cours…" : "Vérification de la session…"}
          </div>
          <div style={{ color: T.t3, fontSize: "11px", marginTop: "4px" }}>YELEN224 Dashboard</div>
        </div>
      </div>
    );
  }

  // ─────────── ERROR: COMPTE SANS INSTITUTION ─────────────────────────
  if (pageState === "error_no_institution") {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <style>{css}</style>
        <div style={{ backgroundColor: T.bgCard, borderRadius: "24px", padding: "32px 24px", border: `1px solid ${T.border}`, textAlign: "center", maxWidth: "360px", width: "100%", animation: "fadeUp 0.3s ease" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", backgroundColor: T.redL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            {Ic.Warning()}
          </div>
          <div style={{ color: T.t1, fontSize: "17px", fontWeight: "900", marginBottom: "8px", letterSpacing: "-0.3px" }}>Aucune institution liée</div>
          <div style={{ color: T.t2, fontSize: "13px", lineHeight: 1.7, marginBottom: "24px" }}>
            Votre compte est connecté mais n'est associé à aucune institution sur YELEN224.<br/>
            Contactez l'administrateur ou créez votre espace institution.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link href="/institution/inscription" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: "#000", fontWeight: "800", fontSize: "14px", padding: "13px", borderRadius: "12px", textDecoration: "none" }} className="tap">
              Créer mon institution
            </Link>
            <button onClick={async () => { await supabase.auth.signOut(); setEmail(""); setPassword(""); setPageState("not_connected"); }} style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "12px", color: T.t2, fontWeight: "700", fontSize: "13px", cursor: "pointer" }} className="tap">
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────── NOT CONNECTED — ÉCRAN DE CONNEXION PRO ─────────────────
  return (
    <div style={{ minHeight: "100svh", backgroundColor: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif" }}>
      <style>{css}</style>

      {/* Fond décoratif */}
      <div style={{ position: "fixed", top: "10%", left: "50%", transform: "translateX(-50%)", width: "300px", height: "300px", borderRadius: "50%", background: `radial-gradient(circle, ${T.gold}08 0%, transparent 70%)`, pointerEvents: "none" }}/>

      <div style={{ width: "100%", maxWidth: "380px", animation: "fadeUp 0.3s ease" }}>

        {/* Logo + Branding */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: `linear-gradient(135deg, ${T.gold}25, ${T.goldD}15)`, border: `1px solid ${T.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            {Ic.Building()}
          </div>
          <div style={{ color: T.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>YELEN224</div>
          <div style={{ color: T.t3, fontSize: "12px", fontWeight: "600", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: "4px" }}>Espace Institution</div>
        </div>

        {/* Card formulaire */}
        <div style={{ backgroundColor: T.bgCard, borderRadius: "24px", padding: "24px", border: `1px solid ${T.border}` }}>
          <div style={{ color: T.t1, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "4px" }}>Connexion</div>
          <div style={{ color: T.t3, fontSize: "12px", marginBottom: "22px" }}>Accédez à votre tableau de bord institution</div>

          {/* Erreur */}
          {loginError && (
            <div style={{ backgroundColor: T.redL, border: `1px solid ${T.red}30`, borderRadius: "12px", padding: "11px 13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              {Ic.Warning()}
              <span style={{ color: T.red, fontSize: "12px", fontWeight: "700" }}>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* Email */}
            <div>
              <label style={{ color: T.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: "6px" }}>Adresse email</label>
              <div className="field" style={{ backgroundColor: T.bg3, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "0 13px", display: "flex", alignItems: "center", gap: "10px", transition: "border-color 0.2s" }}>
                {Ic.Mail()}
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="contact@institution.fr"
                  autoComplete="email"
                  style={{ padding: "12px 0", fontSize: "14px" }}
                  required
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <label style={{ color: T.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: "6px" }}>Mot de passe</label>
              <div className="field" style={{ backgroundColor: T.bg3, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "0 13px", display: "flex", alignItems: "center", gap: "10px", transition: "border-color 0.2s" }}>
                {Ic.KeyIcon()}
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  style={{ padding: "12px 0", fontSize: "14px" }}
                  required
                />
                <button type="button" onClick={() => setShowPwd(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", flexShrink: 0 }}>
                  {Ic.Eye(showPwd)}
                </button>
              </div>
            </div>

            {/* Mot de passe oublié */}
            <div style={{ textAlign: "right", marginTop: "-4px" }}>
              <Link href="/institution/reset-password" style={{ color: T.gold, fontSize: "11px", fontWeight: "700", textDecoration: "none" }}>
                Mot de passe oublié ?
              </Link>
            </div>

            {/* Bouton connexion */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{ background: loading || !email || !password ? T.bg3 : `linear-gradient(135deg, ${T.gold}, ${T.goldD})`, color: loading || !email || !password ? T.t3 : "#000", fontWeight: "800", fontSize: "15px", padding: "14px", borderRadius: "14px", border: "none", cursor: loading || !email || !password ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.2s", marginTop: "4px" }}
              className="tap"
            >
              {loading ? (
                <>
                  <div style={{ width: "16px", height: "16px", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#000", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                  Connexion en cours…
                </>
              ) : (
                <>
                  {Ic.Lock()}
                  Se connecter
                  {Ic.Arrow()}
                </>
              )}
            </button>
          </form>

          {/* Séparateur */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0" }}>
            <div style={{ flex: 1, height: "1px", backgroundColor: T.border }}/>
            <span style={{ color: T.t3, fontSize: "11px" }}>ou</span>
            <div style={{ flex: 1, height: "1px", backgroundColor: T.border }}/>
          </div>

          {/* Lien inscription */}
          <Link href="/institution/inscription" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: T.bg3, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "13px", color: T.t1, fontWeight: "700", fontSize: "13px", textDecoration: "none" }} className="tap">
            Créer un espace institution
          </Link>
        </div>

        {/* Features pro */}
        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            "Tableau de bord analytique temps réel",
            "Gestion des rendez-vous et citoyens",
            "Avis et réputation en ligne",
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "18px", height: "18px", borderRadius: "50%", backgroundColor: T.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {Ic.Check()}
              </div>
              <span style={{ color: T.t2, fontSize: "12px" }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: "24px", color: T.t3, fontSize: "10px" }}>
          YELEN224 · Plateforme de gestion institutionnelle
        </div>
      </div>
    </div>
  );
}